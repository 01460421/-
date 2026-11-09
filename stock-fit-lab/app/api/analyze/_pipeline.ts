/**
 * 分析頁的伺服器端管線（/api/analyze 與 /api/walkforward 共用）。只能在伺服器端引用。
 *   抓行情（資料源失敗 → 快取降級 stale）→ 引擎全量分析（可寫快照）→ 偵測器 → 方向閘門 / 共識 / 濾網
 */
import type { Bar, ForecastModel, ModelId, PriceSeries } from '@/lib/types';
import type { CorporateEvent } from '@/lib/data-adapters/types';
import { getMarketData, normalizeSymbol, lookupName } from '@/lib/data-adapters';
import { addDays, getMarketStatus } from '@/lib/calendar';
import { analyze, barPrice, buildSnapshots, writeSnapshots, backfillOutcomes, type EngineConfig, type EngineDeps, type AnalysisResult } from '@/lib/engine';
import { runDetectors } from '@/lib/detectors';
import { gate, DEFAULT_GATE, multiTimescaleConsensus, computeFilterInputs, applyTrendFilters } from '@/lib/direction';
import { createModel, isAdvanced, BASIC_FACTORIES } from '@/lib/models';
import { getStore } from '@/lib/storage';
import type { AnalyzePayload, DirectionInfo, OhlcData, RangeKey } from '@/components/stock/types';

export const RANGE_YEARS: Record<RangeKey, number> = { '3m': 0.25, '6m': 0.5, '1y': 1, '2y': 2, '5y': 5 };

/** 進階模型透過 createModel 注入引擎（基礎模型走預設註冊表） */
export const ENGINE_DEPS: EngineDeps = {
  createModel: (id: ModelId): ForecastModel | undefined => (isAdvanced(id) ? createModel(id) : undefined),
};

export class UserInputError extends Error {}

export function resolveSymbol(input: string): { symbol: string; name?: string } {
  const info = normalizeSymbol(input);
  if (!info) throw new UserInputError(`無法辨識代號：${input}`);
  return { symbol: info.symbol, name: info.name ?? lookupName(info.symbol) };
}

function isoDaysAgo(days: number): string {
  return addDays(new Date().toISOString().slice(0, 10), -Math.round(days));
}

/** 抓取日線：至少 3 年（多時間尺度共識的月線需要足夠點數），區間更長則依區間 */
export async function fetchSeries(symbol: string, range: RangeKey = '1y'): Promise<PriceSeries> {
  const years = Math.max(3, RANGE_YEARS[range] ?? 1);
  const series = await getMarketData().getHistory(symbol, { interval: '1d', start: isoDaysAgo(years * 365.25 + 5) });
  if (!series.bars.length) throw new Error('資料源回傳空序列');
  return series;
}

export function sliceOhlc(bars: Bar[], range: RangeKey): OhlcData {
  const from = isoDaysAgo((RANGE_YEARS[range] ?? 1) * 365.25);
  const sel = bars.filter((b) => b.date >= from);
  const use = sel.length >= 20 ? sel : bars.slice(-Math.min(bars.length, 60));
  return {
    dates: use.map((b) => b.date),
    open: use.map((b) => b.open),
    high: use.map((b) => b.high),
    low: use.map((b) => b.low),
    close: use.map((b) => barPrice(b)),
    volume: use.map((b) => b.volume),
    filled: use.map((b) => !!b.filled),
  };
}

/** 尾端對齊最新 K 棒的模型殘差（偵測器用） */
export function alignedResiduals(result: AnalysisResult): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const id of result.order) {
    const r = result.results[id];
    if (r?.ok && r.fittedTo === result.lastDate && r.residuals.length) out[id] = r.residuals;
  }
  return out;
}

export function ensemblePUp(result: AnalysisResult): number | null {
  const ens = result.results.ensemble;
  if (ens?.ok && ens.direction && Number.isFinite(ens.direction.pUp)) return ens.direction.pUp;
  const ps = result.order.map((id) => result.results[id]?.direction?.pUp).filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
  return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
}

export function computeDirection(series: PriceSeries, result: AnalysisResult, thresholds = DEFAULT_GATE): DirectionInfo {
  const prices = series.bars.map(barPrice);
  const dates = series.bars.map((b) => b.date);
  const pUp = ensemblePUp(result);
  const notes: string[] = [];
  if (!result.results.ensemble?.ok) notes.push('未啟用集成模型：P(上漲) 以各已啟用模型的平均代替');
  const rawSignal = pUp === null ? 'neutral' : gate(pUp, thresholds);

  let consensus: DirectionInfo['consensus'] = null;
  try {
    // 每個尺度以卡爾曼局部線性趨勢估計 P(上漲)（快速、只用過去資料）
    const c = multiTimescaleConsensus(
      prices,
      (y, h) => BASIC_FACTORIES.kalman().fit(y.slice(-250)).direction(h).pUp,
      { dates, thresholds, minPoints: 20, hDaily: Math.min(result.horizon, 20) },
    );
    consensus = { ...c, scales: c.scales.map((s) => ({ ...s, pUp: Number.isFinite(s.pUp) ? s.pUp : null })) };
  } catch (e) {
    notes.push(`多時間尺度共識計算失敗：${e instanceof Error ? e.message : String(e)}`);
  }

  let filters: DirectionInfo['filters'] = { blockedBy: [], reasons: [] };
  try {
    const inputs = computeFilterInputs(prices, series.bars);
    // 以「假設已出手」評估濾網，讓前端調門檻時不必重算
    const f = applyTrendFilters({ pUp: pUp ?? 0.5, signal: 'up', ...inputs });
    filters = { ...inputs, blockedBy: f.blockedBy, reasons: f.reasons };
  } catch (e) {
    notes.push(`趨勢濾網計算失敗：${e instanceof Error ? e.message : String(e)}`);
  }

  let signal = rawSignal;
  if (signal !== 'neutral' && filters.blockedBy.length) signal = 'neutral';
  if (signal !== 'neutral' && consensus && (!consensus.agree || consensus.direction !== signal)) signal = 'neutral';
  return { horizon: result.horizon, pUp, thresholds, rawSignal, signal, consensus, filters, notes };
}

export interface RunOptions {
  symbol: string;
  config?: Partial<EngineConfig>;
  range?: RangeKey;
  snapshot?: boolean;
  thresholds?: { upper: number; lower: number };
}

export async function runAnalysis(opts: RunOptions): Promise<AnalyzePayload> {
  const t0 = Date.now();
  const { symbol, name } = resolveSymbol(opts.symbol);
  const range = opts.range ?? '1y';
  const warnings: string[] = [];
  const md = getMarketData();
  const [series, events] = await Promise.all([
    fetchSeries(symbol, range),
    md.getEvents(symbol).catch((e: unknown): CorporateEvent[] => {
      warnings.push(`事件資料取得失敗：${e instanceof Error ? e.message : String(e)}`);
      return [];
    }),
  ]);
  if (series.stale) warnings.push('資料源暫時無法連線，以下為快取資料，請留意資料時間。');

  const result = await analyze(series, opts.config ?? {}, ENGINE_DEPS);

  // 快照（append-only）。資料未更新（同一訓練迄日與價格）時不重複寫入。
  const snapshot: AnalyzePayload['snapshot'] = { written: 0 };
  if (opts.snapshot !== false) {
    try {
      const store = await getStore();
      const [prev] = await store.listSnapshots({ symbol, modelId: 'ensemble', limit: 1 });
      if (prev && prev.trainEnd === result.trainEnd && prev.lastPrice === result.lastPrice && prev.targetDates.length === result.targetDates.length) {
        snapshot.skippedReason = '資料未更新（同一訓練迄日與價格），不重複寫入快照';
      } else {
        const snaps = buildSnapshots(result, { trigger: 'manual' });
        snapshot.written = await writeSnapshots(store, snaps);
      }
      snapshot.outcomesFilled = await backfillOutcomes(store, symbol, series.bars);
    } catch (e) {
      warnings.push(`快照寫入失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const ohlc = sliceOhlc(series.bars, range);
  let detectorHits: AnalyzePayload['detectorHits'] = [];
  try {
    detectorHits = runDetectors({ series, residuals: alignedResiduals(result), events })
      .filter((h) => h.date >= ohlc.dates[0])
      .slice(-300);
  } catch (e) {
    warnings.push(`偵測器執行失敗：${e instanceof Error ? e.message : String(e)}`);
  }

  const direction = computeDirection(series, result, opts.thresholds ?? DEFAULT_GATE);
  const { bars, ...rest } = series;
  return {
    symbol,
    name,
    result,
    meta: {
      source: rest.source,
      asOf: rest.asOf,
      fetchedAt: rest.fetchedAt,
      delayMinutes: rest.delayMinutes,
      stale: !!rest.stale,
      adjusted: rest.adjusted,
      filled: bars.filter((b) => b.filled).length,
      bars: bars.length,
      currency: rest.currency,
      market: rest.market,
      interval: rest.interval,
    },
    ohlc,
    detectorHits,
    events: events.filter((e) => e.date >= ohlc.dates[0]),
    marketStatus: getMarketStatus(series.market),
    direction,
    snapshot,
    range,
    warnings: [...warnings, ...result.warnings],
    elapsedMs: Date.now() - t0,
  };
}

/** 統一的錯誤回應（繁中訊息） */
export function errorResponse(e: unknown, fallback = '伺服器發生錯誤'): Response {
  const msg = e instanceof Error ? e.message : String(e ?? fallback);
  const status = e instanceof UserInputError ? 400 : /所有資料源皆無法取得|無法取得|資料源/.test(msg) ? 502 : 500;
  return Response.json({ error: status === 502 ? `資料源暫時無法取得，且沒有可用的快取資料：${msg}` : msg || fallback }, { status });
}
