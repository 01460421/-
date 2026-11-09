/**
 * POST /api/analyze
 * body: { symbol, config?: Partial<EngineConfig>, range?: '3m'|'6m'|'1y'|'2y'|'5y', snapshot?: boolean (預設 true), thresholds? }
 * 回傳 AnalyzePayload：引擎結果 + 資料來源中繼資料 + K 線 + 偵測器 + 事件 + 市場狀態 + 方向閘門。
 */
import { z } from 'zod';
import type { EngineConfig } from '@/lib/engine';
import { errorResponse, runAnalysis } from './_pipeline';
import { ConfigSchema } from './_schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  symbol: z.string().min(1).max(40),
  config: ConfigSchema.optional(),
  range: z.enum(['3m', '6m', '1y', '2y', '5y']).optional(),
  snapshot: z.boolean().optional(),
  thresholds: z.object({ upper: z.number().min(0.5).max(1), lower: z.number().min(0).max(0.5) }).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: `輸入格式錯誤：${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('；')}` }, { status: 400 });
    body = parsed.data;
  } catch {
    return Response.json({ error: '請求內容必須為 JSON' }, { status: 400 });
  }
  try {
    const payload = await runAnalysis({
      symbol: body.symbol,
      config: body.config as Partial<EngineConfig> | undefined,
      range: body.range,
      snapshot: body.snapshot ?? true,
      thresholds: body.thresholds,
    });
    return Response.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e, '分析失敗');
  }
}
