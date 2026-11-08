/**
 * 實際值回填：對尚有目標日未回填的快照，當目標日的實際收盤價出現後，寫入 SnapshotOutcome。
 * 快照本身永不修改；outcomes 表以 (snapshotId, horizonIndex) 唯一，重複回填由 Store 忽略。
 *
 * 實際價使用與引擎相同的欄位（adjClose ?? close）；以前值填補（filled）的 K 棒不視為實際值。
 */
import type { Bar, PredictionSnapshot, SnapshotOutcome } from '../types';
import type { Store } from '../storage/types';

function priceOf(b: Bar): number {
  return b.adjClose ?? b.close;
}

/** 由單一快照與實際價格表計算可回填的 outcomes（純函式，便於測試） */
export function outcomesFor(s: PredictionSnapshot, actualByDate: Map<string, number>, filledAt: string, already?: Set<number>): SnapshotOutcome[] {
  const out: SnapshotOutcome[] = [];
  s.targetDates.forEach((d, i) => {
    if (already?.has(i)) return;
    const actual = actualByDate.get(d);
    if (actual === undefined || !Number.isFinite(actual)) return;
    const mean = s.mean[i];
    const error = actual - mean;
    const sf = Math.sign(mean - s.lastPrice);
    const sa = Math.sign(actual - s.lastPrice);
    out.push({
      snapshotId: s.id,
      targetDate: d,
      horizonIndex: i,
      actual,
      error,
      absPctError: actual !== 0 ? (Math.abs(error) / Math.abs(actual)) * 100 : NaN,
      inInterval: actual >= s.lower[i] && actual <= s.upper[i],
      directionCorrect: sf === 0 || sa === 0 ? null : sf === sa,
      filledAt,
    });
  });
  return out;
}

/**
 * 回填某代號所有待回填快照。回傳實際新增的 outcome 筆數。
 * @param bars 該代號的日 K（含最新收盤）
 */
export async function backfillOutcomes(store: Store, symbol: string, bars: Bar[], opts: { now?: () => Date } = {}): Promise<number> {
  const actualByDate = new Map<string, number>();
  for (const b of bars) if (!b.filled && Number.isFinite(priceOf(b))) actualByDate.set(b.date, priceOf(b));
  if (!actualByDate.size) return 0;
  const lastDate = [...actualByDate.keys()].sort().pop()!;
  const pending = await store.listSnapshots({ symbol, pendingOnly: true });
  // 只處理第一個目標日已出現的快照
  const due = pending.filter((s) => s.targetDates.length && s.targetDates[0] <= lastDate);
  if (!due.length) return 0;
  const existing = await store.listOutcomes(due.map((s) => s.id));
  const done = new Map<string, Set<number>>();
  for (const o of existing) {
    if (!done.has(o.snapshotId)) done.set(o.snapshotId, new Set());
    done.get(o.snapshotId)!.add(o.horizonIndex);
  }
  const filledAt = (opts.now ?? (() => new Date()))().toISOString();
  const all: SnapshotOutcome[] = [];
  for (const s of due) all.push(...outcomesFor(s, actualByDate, filledAt, done.get(s.id)));
  if (!all.length) return 0;
  return store.appendOutcomes(all);
}
