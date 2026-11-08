/**
 * 歷史準度回顧：所有數據只來自快照 + 回填結果（手算驗證）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { MemoryStore } from '@/lib/storage';
import { nextTradingDays } from '@/lib/calendar';
import { backfillOutcomes } from '@/lib/engine/backfill';
import { confusionMatrix, mapeTrend, monthlyReport, replayAt, scorecard, scorecardCsv, snapshotDetail, toCsv } from '@/lib/engine/accuracy';
import { convergenceForTarget } from '@/lib/engine/convergence';
import type { Bar, PredictionSnapshot } from '@/lib/types';

const dates = nextTradingDays('US', '2025-02-28', 31);
const actualAt = (i: number) => (i % 3 === 0 ? 98 : 101.5); // 第 i 筆快照的目標日實際值
const now = new Date('2025-04-20T00:00:00Z');
/** 測試用假模型 id（只驗證彙總邏輯） */
const M = (s: string) => s as PredictionSnapshot['modelId'];

function snap(p: Partial<PredictionSnapshot> & { id: string; i: number }): PredictionSnapshot {
  const { i, ...rest } = p;
  return {
    createdAt: `${dates[i]}T21:30:00.000Z`,
    symbol: 'TEST',
    modelId: M('m1'),
    modelVersion: '1',
    params: {},
    trainStart: '2024-09-01',
    trainEnd: dates[i],
    lastPrice: 100,
    targetDates: [dates[i + 1]],
    mean: [101],
    lower: [99],
    upper: [102],
    level: 0.9,
    benchmarks: { naive: [100] },
    trigger: 'schedule',
    ...rest,
  };
}

describe('accuracy（快照驅動）', () => {
  const store = new MemoryStore(false);
  beforeAll(async () => {
    const snaps: PredictionSnapshot[] = [];
    for (let i = 0; i < 30; i++) {
      snaps.push(snap({ id: `m1-${i}`, i, pUp: [i < 20 ? 0.7 : 0.55] }));
      // m2：永遠命中（方向 100% → 疑似洩漏）
      snaps.push(snap({ id: `m2-${i}`, i, modelId: M('m2'), mean: [actualAt(i)], pUp: [actualAt(i) > 100 ? 0.9 : 0.1] }));
    }
    // 同一天較早的盤中快照（dedupe 後應被較晚者取代）
    snaps.push(snap({ id: 'm1-early', i: 0, createdAt: `${dates[0]}T15:00:00.000Z`, mean: [90] }));
    // 多期快照（誤差分解）
    snaps.push(snap({ id: 'm3', i: 0, modelId: M('m3'), targetDates: [dates[1], dates[2], dates[3]], mean: [101, 102, 103], lower: [99, 99, 99], upper: [104, 104, 104], benchmarks: { naive: [100, 100, 100] } }));
    // 收斂：三次預測都涵蓋 dates[5]
    for (let k = 0; k < 3; k++) {
      snaps.push(snap({ id: `cv-${k}`, i: 2 + k, modelId: M('cv'), targetDates: nextTradingDays('US', dates[2 + k], 3), mean: [100 + k, 100 + k, 100 + k], lower: [90, 90, 90], upper: [110, 110, 110], benchmarks: {} }));
    }
    await store.appendSnapshots(snaps);
    const bars: Bar[] = dates.slice(1).map((d, j) => ({ t: 0, date: d, open: 0, high: 0, low: 0, close: actualAt(j), volume: 0 }));
    const added = await backfillOutcomes(store, 'TEST', bars);
    expect(added).toBeGreaterThan(60);
  });

  it('計分卡：MAE / 方向 / 出手 / 覆蓋 / 連續 / Theil U / vs naive（手算）', async () => {
    const rows = await scorecard(store, { symbol: 'TEST', period: '3m', horizons: [1], now });
    const r = rows.find((x) => x.modelId === 'm1')!;
    expect(r.n).toBe(30); // 同日早盤快照被去重
    expect(r.mae).toBeCloseTo(4 / 3, 12);
    expect(r.directionAccuracy).toBeCloseTo(2 / 3, 12);
    expect(r.dirN).toBe(30);
    expect(r.coverage).toBeCloseTo(2 / 3, 12);
    expect(r.actN).toBe(20);
    expect(r.actHitRate).toBeCloseTo(13 / 20, 12);
    expect(r.actRatio).toBeCloseTo(20 / 30, 12);
    expect(r.longestCorrectStreak).toBe(2);
    expect(r.longestWrongStreak).toBe(1);
    expect(r.naive.mae).toBeCloseTo(5 / 3, 12);
    expect(r.theilU).toBeCloseTo(Math.sqrt(0.0095 / 0.0085), 10);
    expect(r.vsNaive!.metrics.mae!.relImprovementPct).toBeCloseTo(20, 9);
    expect(r.leakSuspect).toBe(false);
    // 不去重 → 31 筆
    const raw = await scorecard(store, { symbol: 'TEST', period: '3m', horizons: [1], now, dedupe: 'none', models: ['m1'] });
    expect(raw[0].n).toBe(31);
  });

  it('疑似洩漏（方向 > 70%）在稽核通過前隱藏；預設以方向準確率排序', async () => {
    const rows = await scorecard(store, { symbol: 'TEST', period: '3m', horizons: [1], now, models: ['m1', 'm2'] });
    const m2 = rows.find((x) => x.modelId === 'm2')!;
    expect(m2.leakSuspect).toBe(true);
    expect(m2.hidden).toBe(true);
    expect(Number.isNaN(m2.directionAccuracy)).toBe(true);
    expect(m2.hiddenReason).toMatch(/疑似資料洩漏/);
    expect(rows[0].modelId).toBe('m1'); // 隱藏列置後
    const passed = await scorecard(store, { symbol: 'TEST', period: '3m', horizons: [1], now, models: ['m1', 'm2'], auditPassed: ['TEST|m2'] });
    expect(passed[0].modelId).toBe('m2');
    expect(passed[0].directionAccuracy).toBe(1);
    expect(passed[0].hidden).toBe(false);
  });

  it('混淆矩陣（看漲 / 看跌 / 觀望 × 實際）', async () => {
    const cm = await confusionMatrix(store, { symbol: 'TEST', models: ['m1'], horizon: 1, period: '3m', now });
    expect(cm.matrix).toEqual([
      [13, 7],
      [0, 0],
      [7, 3],
    ]);
    expect(cm.actAccuracy).toBeCloseTo(13 / 20, 12);
  });

  it('單次預測詳情：誤差分解 MSE = 偏差² + 變異', async () => {
    const d = (await snapshotDetail(store, 'm3'))!;
    expect(d.outcomes.map((o) => o.error)).toEqual([-3, -0.5, -1.5]);
    expect(d.decomposition.bias).toBeCloseTo(-5 / 3, 12);
    expect(d.decomposition.mse).toBeCloseTo(11.5 / 3, 12);
    expect(d.decomposition.biasSq + d.decomposition.variance).toBeCloseTo(d.decomposition.mse, 12);
    expect(d.benchmarkErrors.naive!.mae).toBeCloseTo((2 + 1.5 + 1.5) / 3, 12);
  });

  it('準度趨勢、回放、收斂時間軸、月報與 CSV', async () => {
    const trend = await mapeTrend(store, { symbol: 'TEST', period: '3m', now, models: ['m1'] });
    expect(trend.m1).toHaveLength(30);
    expect(trend.m1[0].mape).toBeCloseTo((3 / 98) * 100, 10);

    const rp = await replayAt(store, 'TEST', dates[10], { models: ['m1'] });
    expect(rp.snapshots).toHaveLength(1);
    expect(rp.snapshots[0].id).toBe('m1-10');
    expect(rp.outcomes['m1-10'][0].actual).toBe(actualAt(10));

    const cv = await convergenceForTarget(store, 'TEST', dates[5]);
    expect(cv.byModel.cv.map((p) => p.stepsAhead)).toEqual([3, 2, 1]);
    expect(cv.byModel.cv.map((p) => p.mean)).toEqual([100, 101, 102]);
    expect(cv.actual).toBe(actualAt(4));

    const rep = await monthlyReport(store, { symbol: 'TEST', month: '2025-03', horizons: [1] });
    expect(rep.rows.length).toBeGreaterThan(0);
    expect(rep.coverage.m1.nominal).toBe(0.9);
    expect(rep.hiddenCount).toBe(1);
    const csv = scorecardCsv(rep.rows);
    expect(csv.startsWith('﻿代號,模型,期數(日)')).toBe(true);
    expect(csv.split('\n').length).toBe(rep.rows.length + 1);
    expect(toCsv([{ a: 'x,y', b: 'q"z' }])).toBe('a,b\n"x,y","q""z"');
  });
});
