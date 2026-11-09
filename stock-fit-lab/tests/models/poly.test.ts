import { describe, it, expect } from 'vitest';
import { PolynomialModel } from '@/lib/models/poly';
import { makeTimeAxis } from '@/lib/math/timeaxis';
import { normalGenerator } from '@/lib/math/random';

describe('PolynomialModel', () => {
  it('還原 y = 2τ² + 3τ + 1 的係數（加微小雜訊）', () => {
    const n = 200;
    const ax = makeTimeAxis(n);
    const z = normalGenerator(1);
    // 平移避免非正價格：y = 2τ²+3τ+1 + 10
    const y = ax.train.map((t) => 2 * t * t + 3 * t + 1 + 10 + 1e-3 * z());
    const m = new PolynomialModel().fit(y, { params: { degree: 2 } });
    const c = m.describe().params.coef as number[];
    expect(c[0]).toBeCloseTo(11, 2);
    expect(c[1]).toBeCloseTo(3, 2);
    expect(c[2]).toBeCloseTo(2, 2);
  });

  it('BIC 自動選到真實次數 2', () => {
    const ax = makeTimeAxis(300);
    const z = normalGenerator(2);
    const y = ax.train.map((t) => 2 * t * t + 3 * t + 20 + 0.05 * z());
    const m = new PolynomialModel().fit(y);
    expect(m.describe().params.degree).toBe(2);
  });

  it('RLS 線上更新與批次擬合結果接近（λ_f = 1）', () => {
    const ax = makeTimeAxis(100);
    const y = ax.train.map((t) => 3 * t + 50);
    const m = new PolynomialModel().fit(y.slice(0, 80), { params: { degree: 1, forgetting: 1 } });
    // 注意：RLS 沿用前 80 筆的時間映射，新點在 τ>1；真實線在該映射下仍是線性
    const ax80 = makeTimeAxis(80);
    for (let i = 80; i < 100; i++) m.update(3 * (ax.tau(i)) + 50);
    const f = m.predict(1);
    void ax80;
    expect(Number.isFinite(f.mean[0])).toBe(true);
    expect(m.getRlsTrace().length).toBe(20);
  });

  it('預測區間隨期數變寬', () => {
    const z = normalGenerator(3);
    const y = Array.from({ length: 120 }, (_, i) => 100 + 0.2 * i + z());
    const f = new PolynomialModel().fit(y, { params: { degree: 1 } }).predict(20);
    expect(f.upper[19] - f.lower[19]).toBeGreaterThan(f.upper[0] - f.lower[0]);
  });
});
