/**
 * AI 情境 JSON（規格第七、十節「情境感知」）。
 * 把分析頁目前的 AnalyzePayload 與介面狀態壓縮成小型結構化 JSON（目標 < 15KB），
 * 隨每次對話 / 建議請求傳入。這裡的欄位路徑（例如 "models.kalman.forecastEnd.mean"）
 * 就是 AI 回答中 cited_fields 的引用來源，verifyCitations 會逐一檢查其存在。
 *
 * 純函式、只依賴型別：前端與伺服器端都可呼叫。
 */
import type { AnalyzePayload, UiState } from '@/components/stock/types';
import type { ModelId } from '@/lib/types';

export interface ContextUi {
  range: string;
  enabledModels: ModelId[];
  selection?: { from: string; to: string } | null;
  thresholds?: { upper: number; lower: number };
  advanced?: boolean;
}

/** 走動式驗證摘要（前端執行過才有） */
export interface WalkForwardSummaryRow {
  model: string;
  horizon: number;
  hidden: boolean;
  theilU?: number | null;
  rmse?: number | null;
  directionAccuracy?: number | null;
  coverage?: number | null;
  rmseImprovementPct?: number | null;
}

/** 4 位有效數字 */
export function r4(x: unknown): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  if (x === 0) return 0;
  const d = Math.max(0, 4 - Math.ceil(Math.log10(Math.abs(x))));
  return Number(x.toFixed(Math.min(d, 8)));
}

function compactParams(p: Record<string, unknown> | undefined, maxKeys = 10): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!p) return out;
  for (const [k, v] of Object.entries(p).slice(0, maxKeys)) {
    if (typeof v === 'number') out[k] = r4(v);
    else if (typeof v === 'string') out[k] = v.length > 60 ? v.slice(0, 60) + '…' : v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 8).map((x) => (typeof x === 'number' ? r4(x) : x));
  }
  return out;
}

const DIAG_KEYS = ['aic', 'bic', 'AIC', 'BIC', 'r2', 'R2', 'ljungBoxP', 'condition', 'degraded', 'weighted', 'sigma', 'order', 'mu', 'qScale'];

function compactDiagnostics(d: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!d) return out;
  for (const [k, v] of Object.entries(d)) {
    if (!DIAG_KEYS.some((x) => k.toLowerCase().includes(x.toLowerCase()))) continue;
    if (typeof v === 'number') out[k] = r4(v);
    else if (typeof v === 'boolean' || typeof v === 'string') out[k] = v;
    if (Object.keys(out).length >= 6) break;
  }
  return out;
}

function inSampleMetrics(fitted: number[], residuals: number[]): { rmse: number | null; mape: number | null; n: number } {
  const n = Math.min(fitted.length, residuals.length);
  if (!n) return { rmse: null, mape: null, n: 0 };
  let se = 0;
  let ape = 0;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const e = residuals[i];
    const y = fitted[i] + e;
    if (!Number.isFinite(e) || !Number.isFinite(y) || y === 0) continue;
    se += e * e;
    ape += Math.abs(e / y);
    k++;
  }
  return { rmse: k ? r4(Math.sqrt(se / k)) : null, mape: k ? r4((ape / k) * 100) : null, n: k };
}

function selectionSummary(p: AnalyzePayload, sel: { from: string; to: string }) {
  const { dates, close, high, low, volume } = p.ohlc;
  const idx = dates.map((d, i) => (d >= sel.from && d <= sel.to ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return { from: sel.from, to: sel.to, bars: 0 };
  const a = idx[0];
  const b = idx[idx.length - 1];
  let peak = close[a];
  let mdd = 0;
  for (const i of idx) {
    peak = Math.max(peak, close[i]);
    mdd = Math.min(mdd, close[i] / peak - 1);
  }
  const avgVol = idx.reduce((s, i) => s + volume[i], 0) / idx.length;
  return {
    from: dates[a],
    to: dates[b],
    bars: idx.length,
    startClose: r4(close[a]),
    endClose: r4(close[b]),
    returnPct: r4((close[b] / close[a] - 1) * 100),
    high: r4(Math.max(...idx.map((i) => high[i]))),
    low: r4(Math.min(...idx.map((i) => low[i]))),
    maxDrawdownPct: r4(mdd * 100),
    avgVolume: r4(avgVol),
    detectorHits: p.detectorHits.filter((h) => h.date >= sel.from && h.date <= sel.to).slice(-10).map((h) => ({ date: h.date, detector: h.detector, severity: h.severity, message: h.message.slice(0, 100) })),
    events: p.events.filter((e) => e.date >= sel.from && e.date <= sel.to).slice(-8).map((e) => ({ date: e.date, type: e.type, title: e.title.slice(0, 60) })),
  };
}

export function buildContext(p: AnalyzePayload, ui: ContextUi | UiState, extra: { walkforward?: WalkForwardSummaryRow[] } = {}) {
  const res = p.result;
  const enabled = new Set<string>(ui.enabledModels);
  const models: Record<string, unknown> = {};
  for (const id of res.order) {
    const r = res.results[id];
    if (!r || (!enabled.has(id) && enabled.size)) continue;
    const f = r.forecast;
    const last = f ? f.mean.length - 1 : -1;
    models[id] = {
      name: r.name,
      ok: r.ok,
      ...(r.error ? { error: r.error.slice(0, 120) } : {}),
      updatedBy: r.updatedBy,
      params: compactParams(r.description?.params as Record<string, unknown> | undefined),
      diagnostics: compactDiagnostics(r.description?.diagnostics as Record<string, unknown> | undefined),
      inSample: inSampleMetrics(r.fitted, r.residuals),
      forecastEnd: f && last >= 0 ? { date: res.targetDates[last], mean: r4(f.mean[last]), lower: r4(f.lower[last]), upper: r4(f.upper[last]), level: f.level } : null,
      forecastFirst: f ? { date: res.targetDates[0], mean: r4(f.mean[0]) } : null,
      pUp: r4(r.direction?.pUp),
      weight: id === 'ensemble' ? null : r4(res.ensembleWeights[id] ?? null),
    };
  }
  const zeroed = Object.entries(res.weightStatus)
    .filter(([, s]) => s.zeroed)
    .map(([m, s]) => ({ model: m, reason: s.reason ?? '' }));
  const benchEnd: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(res.benchmarks)) if (v?.length) benchEnd[k] = r4(v[v.length - 1]);
  const kt = res.kalmanTrace[res.kalmanTrace.length - 1];
  const hitCounts: Record<string, number> = {};
  for (const h of p.detectorHits) hitCounts[h.detector] = (hitCounts[h.detector] ?? 0) + 1;
  const d = p.direction;

  const ctx = {
    symbol: p.symbol,
    name: p.name ?? null,
    market: res.market,
    currency: res.currency,
    data: {
      source: p.meta.source,
      asOf: p.meta.asOf,
      delayMinutes: p.meta.delayMinutes,
      stale: p.meta.stale,
      adjusted: p.meta.adjusted,
      filledBars: p.meta.filled,
      lastDate: res.lastDate,
      lastPrice: r4(res.lastPrice),
      marketStatus: p.marketStatus.label,
    },
    ui: {
      range: ui.range,
      horizon: res.horizon,
      window: res.config.window,
      lambda: res.config.lambda,
      priceMode: res.config.priceMode,
      layers: res.config.layers,
      enabledModels: [...enabled],
      selection: ui.selection ?? null,
    },
    train: { start: res.trainStart, end: res.trainEnd, size: res.trainSize },
    forecast: { horizon: res.horizon, level: res.level, firstTarget: res.targetDates[0], lastTarget: res.targetDates[res.targetDates.length - 1] },
    models,
    ensemble: { weights: Object.fromEntries(Object.entries(res.ensembleWeights).map(([k, v]) => [k, r4(v)])), zeroed },
    benchmarks: { end: benchEnd },
    direction: {
      pUp: r4(d.pUp),
      thresholds: ui.thresholds ?? d.thresholds,
      rawSignal: d.rawSignal,
      signal: d.signal,
      consensus: d.consensus ? { agree: d.consensus.agree, direction: d.consensus.direction, reason: d.consensus.reason, scales: d.consensus.scales.map((s) => ({ scale: s.scale, pUp: r4(s.pUp), direction: s.direction })) } : null,
      filters: { adx: r4(d.filters.adx), hurst: r4(d.filters.hurst), regime: d.filters.regime ? Object.fromEntries(d.filters.regime.labels.map((l, i) => [l, r4(d.filters.regime!.probs[i])])) : null, blockedBy: d.filters.blockedBy },
    },
    detectors: {
      counts: hitCounts,
      recent: p.detectorHits.slice(-12).map((h) => ({ date: h.date, detector: h.detector, severity: h.severity, message: h.message.slice(0, 110), overlapsEvent: h.overlapsEvent ?? null })),
    },
    events: p.events.slice(-8).map((e) => ({ date: e.date, type: e.type, title: e.title.slice(0, 60), source: e.source })),
    kalman: {
      lastGain: kt ? kt.gain.map((g) => r4(g)) : null,
      lastInnovation: kt ? r4(kt.innovation) : null,
      qScale: kt ? r4(kt.qScale) : null,
      alerts: res.kalmanAlerts.slice(-5).map((a) => ({ step: a.step, message: a.message.slice(0, 100), qScale: r4(a.qScale) })),
    },
    ...(extra.walkforward?.length ? { walkforward: extra.walkforward.slice(0, 60) } : {}),
    ...(ui.selection ? { selection: selectionSummary(p, ui.selection) } : {}),
    warnings: p.warnings.slice(0, 5),
    generatedAt: res.generatedAt,
  };
  return ctx;
}

export type AiContext = ReturnType<typeof buildContext>;
