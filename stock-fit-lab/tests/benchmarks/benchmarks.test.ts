import { describe, it, expect } from 'vitest';
import {
  BENCHMARKS,
  benchmarkForecasts,
  buyHoldReturns,
  customForecast,
  customStepsFromDate,
  meanLogReturn,
  strategyReturns,
} from '@/lib/benchmarks';

describe('benchmarks', () => {
  it('naive：明日 = 今日（水平）', () => {
    expect(BENCHMARKS.naive.predict([1, 2, 3], 3)).toEqual([3, 3, 3]);
  });

  it('drift：對數空間平均日報酬外推', () => {
    const y = [100, 110, 121];
    expect(meanLogReturn(y)).toBeCloseTo(Math.log(1.1), 12);
    const f = BENCHMARKS.drift.predict(y, 2);
    expect(f[0]).toBeCloseTo(133.1, 9);
    expect(f[1]).toBeCloseTo(146.41, 9);
  });

  it('SMA20 / SMA60：水平於移動平均；不足 60 筆用全部資料', () => {
    const y = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(BENCHMARKS.sma20.predict(y, 2)).toEqual([20.5, 20.5]);
    expect(BENCHMARKS.sma60.predict(y, 1)).toEqual([15.5]);
  });

  it('buy-and-hold：價格層面同 naive，報酬層面為累積報酬', () => {
    expect(BENCHMARKS.buyhold.predict([5, 6], 2)).toEqual([6, 6]);
    const r = buyHoldReturns([100, 110, 99]);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeCloseTo(0.1, 12);
    expect(r[2]).toBeCloseTo(-0.01, 12);
    const s = strategyReturns([100, 110, 99], [1, -1]);
    expect(s[1]).toBeCloseTo(0.1, 12);
    expect(s[2]).toBeCloseTo(0.21, 12);
  });

  it('custom：線性走到目標價後持平；無步數則水平於目標價', () => {
    expect(customForecast([90, 100], 6, { targetPrice: 110, steps: 5 }).map((v) => +v.toFixed(9))).toEqual([102, 104, 106, 108, 110, 110]);
    expect(customForecast([100], 3, { targetPrice: 120 })).toEqual([120, 120, 120]);
    expect(customForecast([100], 2, { targetPrice: 120, steps: 4, mode: 'flat' })).toEqual([120, 120]);
    // 2025-01-03(五) 之後第 3 個美股交易日 = 2025-01-08
    expect(customStepsFromDate('US', '2025-01-03', '2025-01-08')).toBe(3);
  });

  it('benchmarkForecasts 回傳所有內建基準（+ custom）', () => {
    const y = Array.from({ length: 80 }, (_, i) => 100 + i);
    const b = benchmarkForecasts(y, 4, { targetPrice: 200, steps: 2 });
    expect(Object.keys(b).sort()).toEqual(['buyhold', 'custom', 'drift', 'naive', 'sma20', 'sma60']);
    for (const v of Object.values(b)) expect(v).toHaveLength(4);
    expect(b.custom![1]).toBe(200);
  });
});
