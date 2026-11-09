/**
 * POST /api/ai/advice { symbol, context }
 * AI 結構化建議（規格第七節，固定 schema）。每則建議都寫入快照（modelId = 'ai'，append-only）
 * 與事件日誌（ai_advice），事後可回顧「AI 當時說了什麼、後來對不對」。
 */
import { z } from 'zod';
import type { PredictionSnapshot } from '@/lib/types';
import { generateAdvice } from '@/lib/ai/advisor';
import { llmConfig } from '@/lib/ai/provider';
import { getStore, newId } from '@/lib/storage';
import { normalizeSymbol } from '@/lib/data-adapters';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Hobby 方案上限；Pro 或啟用 Fluid compute 可調高到 300

const Body = z.object({ symbol: z.string().min(1).max(40), context: z.record(z.unknown()) });

type Ctx = {
  data?: { lastDate?: string; lastPrice?: number };
  train?: { start?: string; end?: string };
  forecast?: { level?: number };
  models?: Record<string, { forecastEnd?: { date?: string; mean?: number; lower?: number; upper?: number } | null; pUp?: number | null }>;
  ensemble?: { weights?: Record<string, number> };
  benchmarks?: { end?: Record<string, number | null> };
};

export async function POST(req: Request) {
  if (!llmConfig().configured) return Response.json({ error: '伺服器未設定 ANTHROPIC_API_KEY，AI 結構化建議功能停用。' }, { status: 503 });
  let body: z.infer<typeof Body>;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: '輸入格式錯誤：需要 symbol 與 context' }, { status: 400 });
    body = parsed.data;
  } catch {
    return Response.json({ error: '請求內容必須為 JSON' }, { status: 400 });
  }
  const info = normalizeSymbol(body.symbol);
  if (!info) return Response.json({ error: `無法辨識代號：${body.symbol}` }, { status: 400 });
  if (JSON.stringify(body.context).length > 60_000) return Response.json({ error: '情境 JSON 過大（上限 60KB）' }, { status: 413 });

  try {
    const advice = await generateAdvice(body.context);
    const ctx = body.context as Ctx;
    const ens = ctx.models?.ensemble?.forecastEnd;
    const now = new Date().toISOString();
    const snap: PredictionSnapshot = {
      id: newId(),
      createdAt: now,
      symbol: info.symbol,
      modelId: 'ai',
      modelVersion: advice.model,
      params: { mostCredibleModel: advice.most_credible_model.model_id },
      trainStart: ctx.train?.start ?? ctx.data?.lastDate ?? now.slice(0, 10),
      trainEnd: ctx.train?.end ?? ctx.data?.lastDate ?? now.slice(0, 10),
      lastPrice: typeof ctx.data?.lastPrice === 'number' ? ctx.data.lastPrice : NaN,
      // AI 本身不產生價格預測：沿用當時集成模型的最後一期預測作為對照（可為空）
      targetDates: ens?.date && typeof ens.mean === 'number' ? [ens.date] : [],
      mean: ens?.date && typeof ens.mean === 'number' ? [ens.mean] : [],
      lower: ens?.date && typeof ens.lower === 'number' ? [ens.lower] : [],
      upper: ens?.date && typeof ens.upper === 'number' ? [ens.upper] : [],
      level: ctx.forecast?.level ?? 0.9,
      pUp: typeof ctx.models?.ensemble?.pUp === 'number' ? [ctx.models.ensemble.pUp] : undefined,
      benchmarks: {},
      ensembleWeights: ctx.ensemble?.weights,
      trigger: 'manual',
      aiPayload: advice,
    };
    let snapshotId: string | null = null;
    try {
      const store = await getStore();
      await store.appendSnapshot(snap);
      snapshotId = snap.id;
      await store.appendEvent({
        id: newId(),
        at: now,
        kind: 'ai_advice',
        symbol: info.symbol,
        severity: 'info',
        title: `${info.symbol} AI 結構化建議：最可信模型 ${advice.most_credible_model.model_id}`,
        detail: { snapshotId: snap.id, model: advice.model, summary: advice.plain_summary.slice(0, 300), citedFields: advice.cited_fields },
      });
    } catch {
      /* 寫入失敗仍回傳建議 */
    }
    return Response.json({ advice, snapshotId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /上限/.test(msg) ? 429 : 502;
    return Response.json({ error: `AI 建議產生失敗：${msg}` }, { status });
  }
}
