import { describe, it, expect } from 'vitest';
import {
  brierScore,
  compareForecasts,
  compareToBenchmark,
  computeMetrics,
  coverage,
  dieboldMariano,
  directionAccuracy,
  mae,
  mape,
  rmse,
  theilU,
} from '@/lib/metrics';
import { normalGenerator } from '@/lib/math/random';
import { studentTCdf } from '@/lib/math/stats';

describe('point metrics', () => {
  const a = [10, 12, 9];
  const f = [11, 11, 9];
  it('MAE / RMSE / MAPE', () => {
    expect(mae(a, f)).toBeCloseTo(2 / 3, 12);
    expect(rmse(a, f)).toBeCloseTo(Math.sqrt(2 / 3), 12);
    expect(mape(a, f)).toBeCloseTo(((1 / 10 + 1 / 12 + 0) / 3) * 100, 10);
  });

  it("Theil's U2：誤差恰為 naive 一半 → U = 0.5；naive 本身 → U = 1", () => {
    const actual = [11, 12];
    const origin = [10, 11];
    expect(theilU(actual, [10.5, 12.5], origin)).toBeCloseTo(0.5, 12);
    expect(theilU(actual, origin, origin)).toBeCloseTo(1, 12);
    // 手算：num = (0.2/10)² + (0.3/11)²，den = (1/10)² + (1/11)²
    const u = theilU(actual, [11.2, 11.7], origin);
    expect(u).toBeCloseTo(Math.sqrt((0.02 ** 2 + (0.3 / 11) ** 2) / (0.01 + 1 / 121)), 12);
  });

  it('方向準確率排除持平並給出二項檢定 p 值', () => {
    const d = directionAccuracy([11, 9, 10, 12], [10.5, 9.5, 11, 10], [10, 10, 10, 11]);
    // 第 3 筆實際持平排除；第 1、2 筆正確、第 4 筆錯誤
    expect(d.n).toBe(3);
    expect(d.hits).toBe(2);
    expect(d.accuracy).toBeCloseTo(2 / 3, 12);
    expect(d.pValue).toBeCloseTo(0.5, 12); // P(X ≥ 2 | n=3) = 4/8
  });

  it('區間覆蓋率', () => {
    expect(coverage([1, 2, 3, 4], [0, 2.5, 2, 5], [2, 3, 4, 6])).toBe(0.5);
  });

  it('Brier score', () => {
    expect(brierScore([0.8, 0.3], [1, 0])).toBeCloseTo((0.04 + 0.09) / 2, 12);
  });

  it('computeMetrics 匯總', () => {
    const m = computeMetrics({ actual: [11, 12], forecast: [10.5, 12.5], origin: [10, 11], lower: [10, 12.6], upper: [12, 13], pUp: [0.9, 0.9] });
    expect(m.n).toBe(2);
    expect(m.theilU).toBeCloseTo(0.5, 12);
    expect(m.coverage).toBe(0.5);
    expect(m.directionAccuracy).toBe(1);
    expect(m.brier).toBeCloseTo(0.01, 12);
    expect(m.bias).toBeCloseTo(0, 12);
  });
});

describe('Diebold–Mariano', () => {
  it('手算例：e1=[1,2,3,4] vs e2=[2,2,2,2]（平方損失，h=1，HLN 修正）', () => {
    const r = dieboldMariano([1, 2, 3, 4], [2, 2, 2, 2]);
    // d = [-3, 0, 5, 12], d̄ = 3.5, γ0 = 32.25, DM = 3.5 / sqrt(32.25/4), HLN = sqrt(3/4)
    const dm = 3.5 / Math.sqrt(32.25 / 4);
    expect(r.meanDiff).toBeCloseTo(3.5, 12);
    expect(r.stat).toBeCloseTo(dm * Math.sqrt(0.75), 10);
    expect(r.pValue).toBeCloseTo(2 * (1 - studentTCdf(dm * Math.sqrt(0.75), 3)), 10);
  });

  it('相同誤差 → 不顯著；明顯較小的誤差 → 顯著為負；對調 → 對稱', () => {
    const z = normalGenerator(5);
    const e1 = Array.from({ length: 400 }, () => z());
    const e2 = Array.from({ length: 400 }, () => 2 * z());
    expect(dieboldMariano(e1, e1).pValue).toBe(1);
    const r = dieboldMariano(e1, e2);
    expect(r.stat).toBeLessThan(-5);
    expect(r.pValue).toBeLessThan(1e-6);
    const s = dieboldMariano(e2, e1);
    expect(s.stat).toBeCloseTo(-r.stat, 10);
  });

  it('同分布誤差 → 通常不顯著', () => {
    const z = normalGenerator(9);
    const e1 = Array.from({ length: 300 }, () => z());
    const e2 = Array.from({ length: 300 }, () => z());
    expect(dieboldMariano(e1, e2, { h: 5 }).pValue).toBeGreaterThan(0.05);
  });
});

describe('compareToBenchmark', () => {
  it('差值、相對改善百分比與顯著性旗標', () => {
    const model = { n: 100, mae: 0.9, rmse: 1.0, mape: 1.0, directionAccuracy: 0.6, theilU: 0.9, coverage: 0.9, dirN: 100 };
    const bench = { n: 100, mae: 1.0, rmse: 1.2, mape: 1.01, directionAccuracy: 0.5, theilU: 1, coverage: NaN, dirN: 100 };
    const c = compareToBenchmark(model, bench);
    expect(c.metrics.rmse!.diff).toBeCloseTo(-0.2, 12);
    expect(c.metrics.rmse!.relImprovementPct).toBeCloseTo(16.6667, 3);
    expect(c.metrics.rmse!.verdict).toBe('better');
    expect(c.metrics.mape!.verdict).toBe('insignificant'); // 1% < 5% 門檻
    expect(c.metrics.directionAccuracy!.relImprovementPct).toBeCloseTo(20, 9);
    expect(c.metrics.coverage!.verdict).toBe('insignificant'); // 0.9 = 名目水準
    expect(c.overall).toBe('better');
  });

  it('DM 結果優先：小樣本不顯著時標為 insignificant', () => {
    const r = compareForecasts({ actual: [11, 12, 13], forecast: [11.1, 11.9, 13.2], origin: [10, 11, 12] }, [10, 11, 12]);
    expect(r.comparison.metrics.rmse!.method).toBe('dm');
    expect(r.model.theilU).toBeLessThan(1);
  });

  it('模型顯著較差 → worse', () => {
    const z = normalGenerator(3);
    const actual = Array.from({ length: 300 }, () => 100 + z());
    const origin = actual.map(() => 100);
    const r = compareForecasts({ actual, forecast: actual.map((a) => a + 3 * z()), origin }, actual.map((a) => a + 0.5 * z()));
    expect(r.comparison.metrics.rmse!.verdict).toBe('worse');
    expect(r.comparison.metrics.rmse!.relImprovementPct).toBeLessThan(0);
  });
});
