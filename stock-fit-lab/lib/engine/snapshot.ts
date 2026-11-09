/**
 * 預測快照（規格第四節）：每一次修正都寫入一筆 / 每模型一筆快照，append-only。
 * 快照建立後即深度凍結；寫入只透過 Store.appendSnapshots（重複 id 會被拒絕）。
 */
import type { ModelId, PredictionSnapshot } from '../types';
import type { Store } from '../storage/types';
import { newId as defaultNewId } from '../storage';
import { marketOf, nextTradingDays } from '../calendar';
import type { AnalysisResult, ModelRunResult } from './types';

export type SnapshotTrigger = PredictionSnapshot['trigger'];

export interface BuildSnapshotOptions {
  /** 強制所有快照使用同一觸發來源（排程 = 'schedule'、手動 = 'manual'）；未給則依各模型 updatedBy */
  trigger?: SnapshotTrigger;
  /** 只建立這些模型的快照（預設：本輪有更新的所有模型 + ensemble） */
  models?: ModelId[];
  /** 包含凍結（本輪未更新）的模型 */
  includeFrozen?: boolean;
  now?: () => Date;
  newId?: () => string;
}

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

function triggerOf(r: ModelRunResult): SnapshotTrigger | null {
  switch (r.updatedBy) {
    case 'refit':
      return 'refit';
    case 'rls':
      return 'rls';
    case 'kalman':
      return 'kalman';
    case 'ensemble':
      return 'ensemble';
    default:
      return null;
  }
}

/** JSON 安全化：移除 NaN / Infinity / 函式 */
function jsonSafe(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : x)));
}

/** 由 AnalysisResult 建立快照（每個模型一筆；基準值記錄在 benchmarks 欄位） */
export function buildSnapshots(result: AnalysisResult, opts: BuildSnapshotOptions = {}): PredictionSnapshot[] {
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const mkId = opts.newId ?? defaultNewId;
  const h = result.horizon;
  const targetDates = result.targetDates.length === h ? result.targetDates : nextTradingDays(marketOf(result.symbol), result.lastDate, h);
  const ids = opts.models ?? result.order;
  const out: PredictionSnapshot[] = [];
  for (const id of ids) {
    const r = result.results[id];
    if (!r || !r.ok || !r.forecast) continue;
    const trig = opts.trigger ?? triggerOf(r);
    if (!trig && !opts.includeFrozen) continue;
    const snap: PredictionSnapshot = {
      id: mkId(),
      createdAt: now,
      symbol: result.symbol,
      modelId: id,
      modelVersion: r.version,
      params: jsonSafe({
        model: r.description?.params ?? {},
        user: result.config.params[id] ?? {},
        engine: {
          window: result.config.window,
          lambda: result.config.lambda,
          priceMode: result.config.priceMode,
          level: result.level,
          layers: result.config.layers,
          updatedBy: r.updatedBy,
          staleBars: r.staleBars,
          priceField: result.priceField,
          source: result.source,
        },
      }) as Record<string, unknown>,
      trainStart: result.trainStart,
      trainEnd: result.lastDate,
      lastPrice: result.lastPrice,
      targetDates: targetDates.slice(),
      mean: r.forecast.mean.slice(0, h),
      lower: r.forecast.lower.slice(0, h),
      upper: r.forecast.upper.slice(0, h),
      level: r.forecast.level,
      pUp: r.pUp.slice(0, h),
      signal: r.pUp.slice(0, h).map((p) => (p > 0.5 ? 'up' : p < 0.5 ? 'down' : 'neutral')),
      benchmarks: Object.fromEntries(Object.entries(result.benchmarks).map(([k, v]) => [k, (v ?? []).slice(0, h)])),
      ensembleWeights: { ...result.ensembleWeights },
      trigger: trig ?? 'manual',
    };
    out.push(deepFreeze(snap));
  }
  return out;
}

/** 寫入快照（append-only；重複 id 由 Store 拒絕） */
export async function writeSnapshots(store: Store, snaps: PredictionSnapshot[]): Promise<number> {
  if (!snaps.length) return 0;
  await store.appendSnapshots(snaps);
  return snaps.length;
}
