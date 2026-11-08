/**
 * 「即時修正時間軸」：固定一個目標日期，列出隨時間陸續發出、涵蓋該目標日的預測序列，
 * 讓使用者看見預測如何隨新資料收斂（或發散）。資料只來自已寫入的快照與回填結果。
 */
import type { PredictionSnapshot } from '../types';
import type { Store } from '../storage/types';

export interface ConvergencePoint {
  snapshotId: string;
  createdAt: string;
  /** 發出預測時最後已知日期 */
  issuedAsOf: string;
  /** 距目標日的期數（1 = 前一交易日發出） */
  stepsAhead: number;
  mean: number;
  lower: number;
  upper: number;
  lastPrice: number;
  trigger: PredictionSnapshot['trigger'];
  ensembleWeight?: number;
}

export interface ConvergenceSeries {
  symbol: string;
  targetDate: string;
  /** 模型 id → 依發出時間排序的預測 */
  byModel: Record<string, ConvergencePoint[]>;
  /** 目標日實際值（若已回填） */
  actual: number | null;
}

export function convergenceFromSnapshots(snaps: PredictionSnapshot[], targetDate: string, models?: string[]): Record<string, ConvergencePoint[]> {
  const byModel: Record<string, ConvergencePoint[]> = {};
  for (const s of snaps) {
    if (models && !models.includes(s.modelId)) continue;
    const i = s.targetDates.indexOf(targetDate);
    if (i < 0) continue;
    (byModel[s.modelId] = byModel[s.modelId] ?? []).push({
      snapshotId: s.id,
      createdAt: s.createdAt,
      issuedAsOf: s.trainEnd,
      stepsAhead: i + 1,
      mean: s.mean[i],
      lower: s.lower[i],
      upper: s.upper[i],
      lastPrice: s.lastPrice,
      trigger: s.trigger,
      ensembleWeight: s.ensembleWeights?.[s.modelId],
    });
  }
  for (const k of Object.keys(byModel)) byModel[k].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return byModel;
}

/** 讀取涵蓋 targetDate 的所有快照（發出時間必早於目標日） */
export async function convergenceForTarget(store: Store, symbol: string, targetDate: string, opts: { models?: string[]; lookbackDays?: number } = {}): Promise<ConvergenceSeries> {
  const d = new Date(targetDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (opts.lookbackDays ?? 120));
  const snaps = (await store.listSnapshots({ symbol, from: d.toISOString().slice(0, 10), to: targetDate })).filter((s) => s.trainEnd < targetDate);
  const byModel = convergenceFromSnapshots(snaps, targetDate, opts.models);
  let actual: number | null = null;
  const ids = Object.values(byModel)
    .flat()
    .map((p) => p.snapshotId);
  if (ids.length) {
    const outs = await store.listOutcomes(ids.slice(0, 500));
    const o = outs.find((x) => x.targetDate === targetDate);
    if (o) actual = o.actual;
  }
  return { symbol, targetDate, byModel, actual };
}
