/** AI 建議快照 → 「AI 當時說了什麼 vs 之後實際」的對照項目（route 與快照詳情頁共用） */
import type { PredictionSnapshot, SnapshotOutcome } from '@/lib/types';
import type { Store } from '@/lib/storage/types';
import { addDays } from '@/lib/calendar';

export interface Advice {
  most_credible_model?: { model_id?: string; reason?: string };
  plain_summary?: string;
  reliability_warnings?: string[];
  parameter_suggestions?: { model_id: string; parameter: string; suggestion: string; reason: string }[];
  cited_fields?: string[];
  label?: string;
  model?: string;
}

const avg = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);

function mapeOf(outs: SnapshotOutcome[]) {
  return avg(outs.filter((o) => Number.isFinite(o.absPctError)).map((o) => o.absPctError));
}

function naiveMape(s: PredictionSnapshot, outs: SnapshotOutcome[]) {
  return avg(
    outs
      .filter((o) => o.actual)
      .map((o) => {
        const nb = s.benchmarks.naive?.[o.horizonIndex] ?? s.lastPrice;
        return (Math.abs(o.actual - nb) / Math.abs(o.actual)) * 100;
      }),
  );
}

export async function aiHistoryItem(store: Store, ai: PredictionSnapshot) {
  const advice = (ai.aiPayload ?? {}) as Advice;
  const own = (await store.listOutcomes([ai.id])).sort((a, b) => a.horizonIndex - b.horizonIndex);
  // 同一訓練迄日的模型快照（AI 當時看到的同一批數據）
  const sibs = (await store.listSnapshots({ symbol: ai.symbol, from: ai.trainEnd, to: addDays(ai.trainEnd, 7) })).filter((s) => s.trainEnd === ai.trainEnd && s.modelId !== 'ai' && s.mean?.length);
  const latest = new Map<string, PredictionSnapshot>();
  for (const s of sibs) {
    const cur = latest.get(s.modelId);
    if (!cur || s.createdAt > cur.createdAt) latest.set(s.modelId, s);
  }
  const sibOuts = await store.listOutcomes([...latest.values()].map((s) => s.id));
  const outsBy = new Map<string, SnapshotOutcome[]>();
  for (const o of sibOuts) (outsBy.get(o.snapshotId) ?? outsBy.set(o.snapshotId, []).get(o.snapshotId)!).push(o);

  const ranking = [...latest.values()]
    .map((s) => ({ modelId: s.modelId, mape: mapeOf(outsBy.get(s.id) ?? []), n: (outsBy.get(s.id) ?? []).length }))
    .filter((r) => r.n > 0 && Number.isFinite(r.mape))
    .sort((a, b) => a.mape - b.mape);

  const credibleId = advice.most_credible_model?.model_id;
  const credSnap = credibleId ? latest.get(credibleId) : undefined;
  const credOuts = credSnap ? (outsBy.get(credSnap.id) ?? []) : [];
  const ref = credSnap ?? latest.get('ensemble') ?? [...latest.values()][0];
  const refOuts = (ref ? (outsBy.get(ref.id) ?? []) : own).slice().sort((a, b) => a.horizonIndex - b.horizonIndex);
  const realized = [1, 5, 10, 20]
    .map((h) => refOuts.find((o) => o.horizonIndex === h - 1))
    .filter((o): o is SnapshotOutcome => !!o)
    .map((o) => ({ horizon: o.horizonIndex + 1, targetDate: o.targetDate, actual: o.actual, changePct: ((o.actual - ai.lastPrice) / ai.lastPrice) * 100 }));
  const ens = latest.get('ensemble');
  const ensOuts = ens ? (outsBy.get(ens.id) ?? []) : [];
  return {
    id: ai.id,
    symbol: ai.symbol,
    createdAt: ai.createdAt,
    trainEnd: ai.trainEnd,
    lastPrice: ai.lastPrice,
    llmModel: advice.model ?? ai.modelVersion,
    label: advice.label ?? 'AI 分析，非投資建議',
    credibleModel: credibleId ?? null,
    credibleReason: advice.most_credible_model?.reason ?? null,
    summary: advice.plain_summary ?? null,
    warnings: advice.reliability_warnings ?? [],
    suggestions: advice.parameter_suggestions ?? [],
    citedFields: advice.cited_fields ?? [],
    ownOutcomes: own,
    realized,
    credible: credSnap
      ? {
          snapshotId: credSnap.id,
          mape: mapeOf(credOuts),
          naiveMape: naiveMape(credSnap, credOuts),
          n: credOuts.length,
          rank: ranking.findIndex((r) => r.modelId === credibleId) + 1 || null,
          of: ranking.length,
        }
      : null,
    bestModel: ranking[0] ?? null,
    ensemble: ens
      ? {
          snapshotId: ens.id,
          pUpLast: ens.pUp?.[ens.pUp.length - 1] ?? null,
          dirHits: ensOuts.filter((o) => o.directionCorrect).length,
          dirN: ensOuts.filter((o) => o.directionCorrect !== null).length,
        }
      : null,
    pending: refOuts.length === 0,
  };
}

export type AiHistoryItemData = Awaited<ReturnType<typeof aiHistoryItem>>;
