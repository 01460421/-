/**
 * 即時修正整合測試（規格第九節）：逐筆餵入合成資料，驗證快照寫入（append-only / 不可變）、
 * 集成權重更新、實際值回填，以及注入水準位移後的卡爾曼結構性變化事件。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MemoryStore, setStore, getStore } from '@/lib/storage';
import { CorrectionSession, analyze } from '@/lib/engine/correction';
import { backfillOutcomes } from '@/lib/engine/backfill';
import { normalGenerator } from '@/lib/math/random';
import type { PredictionSnapshot, SystemEvent } from '@/lib/types';
import { makeBars, makeSeries, barClock } from './helpers';

function synthetic(n: number, shiftAt: number, seed = 21): number[] {
  const z = normalGenerator(seed);
  const out = [100];
  for (let i = 1; i < n; i++) {
    let r = 0.0005 + 0.01 * z();
    if (i >= shiftAt && i < shiftAt + 4) r += 0.06; // 注入連續 4 天的水準位移（約 +26%）
    out.push(out[i - 1] * Math.exp(r));
  }
  return out;
}

describe('CorrectionSession 逐筆整合', () => {
  const INIT = 150;
  const STEPS = 45;
  const SHIFT = INIT + 30;
  const prices = synthetic(INIT + STEPS, SHIFT);
  const bars = makeBars(prices);
  const clock = barClock();
  let store: MemoryStore;

  beforeAll(() => {
    store = new MemoryStore(false);
    setStore(store);
  });
  afterAll(() => setStore(undefined));

  it('全量分析：所有基礎模型 + 集成 + 基準，500 點 < 1 秒', async () => {
    const big = makeSeries(makeBars(synthetic(500, 9999, 3)));
    const t0 = performance.now();
    const r = await analyze(big, {});
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1000);
    expect(r.targetDates).toHaveLength(20);
    expect(r.results.ensemble?.ok).toBe(true);
    for (const id of r.order) {
      expect(r.results[id]!.ok, `${id}: ${r.results[id]!.error}`).toBe(true);
      expect(r.results[id]!.forecast!.mean).toHaveLength(20);
    }
    expect(Object.values(r.ensembleWeights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(Object.keys(r.benchmarks).sort()).toEqual(['buyhold', 'drift', 'naive', 'sma20', 'sma60']);
    expect(r.kalmanTrace.length).toBeGreaterThan(0);
    expect(r.kalmanTrace[0].gain).toHaveLength(2);
  });

  it('逐筆修正：快照 append-only、權重更新、回填、結構性變化事件', async () => {
    const st = await getStore();
    expect(st).toBe(store);
    clock.set(bars[INIT - 1].date);
    const session = new CorrectionSession(makeSeries(bars.slice(0, INIT)), { horizon: 5 }, { now: clock.now });
    const w0 = { ...session.getResult().ensembleWeights };
    const events: SystemEvent[] = [];
    const firstSnaps: PredictionSnapshot[] = [];
    let total = 0;
    const weightHistory: Record<string, number>[] = [];

    for (let i = INIT; i < INIT + STEPS; i++) {
      clock.set(bars[i].date);
      const r = await session.ingestAndPersist(store, bars[i]);
      // 每一步都寫入快照（每個有更新的模型 + 集成），且數量正確累加
      expect(r.snapshots.length).toBeGreaterThanOrEqual(r.result.order.length - 1);
      total += r.snapshots.length;
      expect((await store.listSnapshots({ symbol: 'AAPL' })).length).toBe(total);
      expect(r.result.lastDate).toBe(bars[i].date);
      expect(r.result.layersRun.ensembleReweight).toBe(true);
      expect(r.result.layersRun.kalman).toEqual(['kalman']);
      expect(r.result.layersRun.rls).toEqual(expect.arrayContaining(['poly', 'linchannel']));
      const snap = r.snapshots.find((s) => s.modelId === 'ensemble')!;
      expect(snap.trigger).toBe('ensemble');
      expect(snap.targetDates).toEqual(r.result.targetDates);
      expect(snap.trainEnd).toBe(bars[i].date);
      expect(snap.benchmarks.naive).toEqual(new Array(5).fill(r.result.lastPrice));
      expect(snap.ensembleWeights).toEqual(r.result.ensembleWeights);
      expect(r.snapshots.find((s) => s.modelId === 'kalman')!.trigger).toBe('kalman');
      if (i === INIT) firstSnaps.push(...r.snapshots);
      events.push(...r.events);
      weightHistory.push(r.result.ensembleWeights);
    }

    // 不可變：修改回傳的快照或從儲存讀回的快照都會拋錯；重複 id 被拒絕
    const s0 = firstSnaps[0];
    expect(() => {
      (s0 as { mean: number[] }).mean[0] = 0;
    }).toThrow(TypeError);
    const stored = (await store.getSnapshot(s0.id))!;
    expect(() => {
      (stored as { lastPrice: number }).lastPrice = 1;
    }).toThrow(TypeError);
    await expect(store.appendSnapshots([{ ...s0 }])).rejects.toThrow(/append-only/);

    // 權重確實隨新資料更新
    const last = weightHistory[weightHistory.length - 1];
    const moved = Object.keys(w0).some((k) => Math.abs((last[k] ?? 0) - w0[k]) > 1e-6);
    expect(moved).toBe(true);
    expect(session.getResult().weightStatus.kalman.ebar).not.toBeNull();

    // 回填：第一步的快照（h=5）在 5 個交易日後全部回填，且再次回填不會重複
    const outs = await store.listOutcomes(firstSnaps.map((s) => s.id));
    expect(outs.length).toBe(firstSnaps.length * 5);
    const o = outs.find((x) => x.snapshotId === s0.id && x.horizonIndex === 0)!;
    expect(o.targetDate).toBe(bars[INIT + 1].date);
    expect(o.actual).toBeCloseTo(prices[INIT + 1], 9);
    expect(o.error).toBeCloseTo(prices[INIT + 1] - s0.mean[0], 9);
    expect(o.directionCorrect).toBe(Math.sign(s0.mean[0] - s0.lastPrice) === Math.sign(prices[INIT + 1] - s0.lastPrice));
    expect(await backfillOutcomes(store, 'AAPL', bars)).toBe(0);
    // 快照本身沒有被回填改動
    expect(await store.getSnapshot(s0.id)).toEqual(s0);
    const pending = await store.listSnapshots({ symbol: 'AAPL', pendingOnly: true });
    expect(pending.some((s) => s.id === s0.id)).toBe(false);

    // 注入水準位移後觸發卡爾曼結構性變化事件
    const breaks = events.filter((e) => e.kind === 'structural_break');
    expect(breaks.length).toBeGreaterThan(0);
    const firstBreakDate = String(breaks[0].detail.date);
    expect(firstBreakDate >= bars[SHIFT].date).toBe(true);
    expect(firstBreakDate <= bars[SHIFT + 6].date).toBe(true);
    expect(session.getResult().kalmanAlerts.length).toBeGreaterThan(0);
    // 位移造成權重大幅重分配事件
    expect(events.some((e) => e.kind === 'weight_shift')).toBe(true);
  });

  it('層開關：全部關閉時模型凍結、不寫快照；同日盤中價覆寫最後一根', () => {
    const s = new CorrectionSession(makeSeries(bars.slice(0, INIT)), {
      horizon: 3,
      models: ['poly', 'kalman', 'holtwinters', 'ensemble'],
      layers: { rollingRefit: false, rls: false, kalman: false, ensembleReweight: false },
    });
    const before = s.getResult().results.holtwinters!.forecast!.mean.slice();
    const r = s.ingest(bars[INIT]);
    expect(r.snapshots).toHaveLength(0);
    expect(r.result.results.holtwinters!.updatedBy).toBe('frozen');
    expect(r.result.results.holtwinters!.staleBars).toBe(1);
    // 凍結模型的預測是舊外推向後平移一期
    expect(r.result.results.holtwinters!.forecast!.mean[0]).toBeCloseTo(before[1], 9);

    const s2 = new CorrectionSession(makeSeries(bars.slice(0, INIT)), { horizon: 3, models: ['poly', 'kalman', 'ensemble'] });
    s2.ingest(bars[INIT]);
    const intraday = { ...bars[INIT], close: bars[INIT].close * 1.01 };
    const r2 = s2.ingest(intraday);
    expect(r2.replacedLastBar).toBe(true);
    expect(r2.result.lastPrice).toBeCloseTo(intraday.close, 9);
    expect(r2.result.history.dates.filter((d) => d === bars[INIT].date)).toHaveLength(1);
    expect(r2.snapshots.length).toBeGreaterThan(0);
  });
});
