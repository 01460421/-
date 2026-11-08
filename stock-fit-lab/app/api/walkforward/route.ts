/**
 * POST /api/walkforward
 * body: { symbol, models?, horizons?, window?, step?, lambda?, priceMode?, maxOrigins? }
 * 走動式前向驗證（只用過去資料逐點預測）+ 相對 naive 基準比較 + 洩漏稽核（疑似者隱藏）。
 */
import { z } from 'zod';
import type { ModelId } from '@/lib/types';
import { barPrice, walkForward, LEAK_LABEL, type WalkForwardHorizonResult } from '@/lib/engine';
import { auditForLeakage, findSuspects } from '@/lib/engine/leak-audit';
import { getMarketData } from '@/lib/data-adapters';
import { BENCHMARK_META } from '@/lib/benchmarks';
import { MODEL_META, BASIC_IDS, isAdvanced } from '@/lib/models';
import { getStore, newId } from '@/lib/storage';
import { ENGINE_DEPS, errorResponse, fetchSeries, resolveSymbol } from '../analyze/_pipeline';
import { modelId } from '../analyze/_schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const Body = z.object({
  symbol: z.string().min(1).max(40),
  models: z.array(modelId).min(1).max(20).optional(),
  horizons: z.array(z.number().int().min(1).max(60)).min(1).max(6).optional(),
  window: z.number().int().min(20).max(1000).optional(),
  step: z.number().int().min(1).max(60).optional(),
  lambda: z.number().min(0.5).max(1).optional(),
  priceMode: z.enum(['raw', 'log']).optional(),
  maxOrigins: z.number().int().min(20).max(300).optional(),
  params: z.record(modelId, z.record(z.string(), z.number().finite())).optional(),
});

const MAX_CURVE = 400;

function metricOut(r: WalkForwardHorizonResult) {
  const m = r.metrics;
  return {
    n: m.n,
    mae: m.mae,
    rmse: m.rmse,
    mape: m.mape,
    directionAccuracy: m.directionAccuracy,
    dirN: m.dirN,
    dirPValue: m.dirPValue,
    theilU: m.theilU,
    coverage: m.coverage,
    coverageN: m.coverageN,
    brier: m.brier ?? null,
    bias: m.bias,
  };
}

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
    const { symbol } = resolveSymbol(body.symbol);
    const series = await fetchSeries(symbol, '2y');
    const bars = series.bars.slice(-750);
    const prices = bars.map(barPrice);
    const dates = bars.map((b) => b.date);
    const models = (body.models ?? BASIC_IDS) as ModelId[];
    const hasSlow = models.some((m) => m === 'gp' || m === 'stacking');
    const horizons = body.horizons ?? [1, 5, 10, 20];
    const wf = walkForward(prices, {
      models,
      horizons,
      window: body.window ?? 120,
      step: body.step,
      lambda: body.lambda ?? 0.97,
      priceMode: body.priceMode ?? 'raw',
      params: body.params as Partial<Record<ModelId, Record<string, number>>> | undefined,
      maxOrigins: body.maxOrigins ?? (hasSlow ? 40 : 250),
      dates,
      deps: ENGINE_DEPS,
    });
    const suspects = findSuspects(wf);
    // 疑似洩漏 → 執行完整稽核：(a) 時間對齊 (b) 還原價 (c) 截斷不變性 (d) 快照未被改寫。
    // 稽核未通過前結果一律隱藏；通過則寫入 auditPassed 事件，計分卡據此解除隱藏。
    let audit: Awaited<ReturnType<typeof auditForLeakage>> | null = null;
    if (suspects.length) {
      try {
        const store = await getStore();
        const events = await getMarketData()
          .getEvents(symbol)
          .catch(() => []);
        audit = await auditForLeakage({ wf, prices, dates, deps: ENGINE_DEPS, bars, events, store, symbol, checkAllModels: false });
        await store.appendEvent({
          id: newId(),
          at: new Date().toISOString(),
          kind: 'leak_suspect',
          symbol,
          severity: audit.passed ? 'info' : 'warn',
          title: audit.passed
            ? `${symbol} 走動式驗證疑似洩漏 ${suspects.length} 項，稽核通過（結果可顯示，但請謹慎解讀）`
            : `${symbol} 走動式驗證${LEAK_LABEL}（${suspects.length} 項，稽核未通過）`,
          detail: { suspects, auditPassed: audit.passed, models: [...new Set(suspects.map((x) => x.model))], checks: audit.checks },
        });
      } catch {
        /* 稽核或事件寫入失敗 → 維持隱藏 */
      }
    }
    const suspectKey = new Set(audit?.passed ? [] : suspects.map((s) => `${s.model}|${s.horizon}`));

    const rows = Object.entries(wf.models).flatMap(([model, byH]) =>
      Object.values(byH).map((r) => {
        const hidden = suspectKey.has(`${model}|${r.horizon}`);
        const cmp = r.vsNaive;
        return {
          model,
          name: MODEL_META[model as ModelId]?.short ?? model,
          advanced: isAdvanced(model),
          horizon: r.horizon,
          hidden,
          hiddenReason: hidden ? `${LEAK_LABEL}，稽核中` : undefined,
          metrics: hidden ? null : metricOut(r),
          vsNaive: hidden || !cmp
            ? null
            : {
                overall: cmp.overall,
                metrics: Object.fromEntries(
                  Object.entries(cmp.metrics).map(([k, v]) => [k, v ? { diff: v.diff, relImprovementPct: v.relImprovementPct, verdict: v.verdict, pValue: v.pValue ?? null, benchmark: v.benchmark } : null]),
                ),
              },
        };
      }),
    );
    const benchmarks = Object.entries(wf.benchmarks).flatMap(([id, byH]) =>
      Object.values(byH).map((r) => ({ id, name: BENCHMARK_META[id as keyof typeof BENCHMARK_META]?.name ?? id, horizon: r.horizon, metrics: metricOut(r) })),
    );
    // 樣本外誤差曲線（隱藏疑似洩漏者）
    const curves: Record<string, Record<number, { dates: string[]; errors: number[]; absPctError: number[] }>> = {};
    for (const [model, byH] of [...Object.entries(wf.models), ['naive', wf.benchmarks.naive ?? {}] as const]) {
      for (const r of Object.values(byH)) {
        if (suspectKey.has(`${model}|${r.horizon}`)) continue;
        const k = Math.max(0, r.errors.length - MAX_CURVE);
        (curves[model] ??= {})[r.horizon] = {
          dates: r.targetIdx.slice(k).map((i) => dates[i]),
          errors: r.errors.slice(k).map((e) => (Number.isFinite(e) ? +e.toFixed(4) : NaN)),
          absPctError: r.errors.slice(k).map((e, i) => (Number.isFinite(e) ? +((Math.abs(e) / r.actual[k + i]) * 100).toFixed(4) : NaN)),
        };
      }
    }
    return Response.json(
      {
        symbol,
        source: series.source,
        asOf: series.asOf,
        stale: !!series.stale,
        n: wf.n,
        window: wf.window,
        step: wf.step,
        horizons: wf.horizons,
        origins: wf.origins.length,
        firstOrigin: dates[wf.origins[0]] ?? null,
        lastOrigin: dates[wf.origins[wf.origins.length - 1]] ?? null,
        rows,
        benchmarks,
        curves,
        suspects,
        audit: audit ? { passed: audit.passed, checks: audit.checks, auditedAt: audit.auditedAt } : null,
        leakLabel: LEAK_LABEL,
        failures: wf.failures,
        timings: wf.timings,
        generatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return errorResponse(e, '走動式驗證失敗');
  }
}
