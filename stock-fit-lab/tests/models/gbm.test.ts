import { describe, it, expect } from 'vitest';
import { GBMModel } from '@/lib/models/gbm';
import { simulateGBM } from '@/lib/math/random';

describe('GBMModel', () => {
  it('由模擬 GBM 估計 μ、σ（已知 μ=0.001、σ=0.02）', () => {
    const y = simulateGBM(100, 0.001, 0.02, 2001, 123);
    const m = new GBMModel().fit(y, { params: { lookback: 2000 } });
    const { mu, sigma } = m.getEstimates();
    expect(Math.abs(sigma - 0.02)).toBeLessThan(0.001);
    expect(Math.abs(mu - 0.001)).toBeLessThan(0.0015);
  });

  it('5%–95% 分位帶的實際覆蓋率合理（滾動檢驗）', () => {
    const y = simulateGBM(100, 0.0003, 0.015, 900, 77);
    let inside = 0;
    let total = 0;
    for (let t = 200; t + 5 < y.length; t += 10) {
      const f = new GBMModel().fit(y.slice(0, t + 1), { params: { lookback: 120 }, seed: t }).predict(5, 0.9);
      if (y[t + 5] >= f.lower[4] && y[t + 5] <= f.upper[4]) inside++;
      total++;
    }
    const cov = inside / total;
    expect(cov).toBeGreaterThan(0.75);
    expect(cov).toBeLessThan(0.99);
  });

  it('固定種子可重現；pUp = 模擬路徑高於現價比例；paths() 取樣', () => {
    const y = simulateGBM(50, 0.002, 0.01, 200, 5);
    const a = new GBMModel().fit(y, { seed: 9 });
    const b = new GBMModel().fit(y, { seed: 9 });
    expect(a.predict(10).mean).toEqual(b.predict(10).mean);
    const ps = a.paths(10, 30);
    expect(ps.length).toBe(30);
    expect(ps[0].length).toBe(10);
    const all = a.paths(10, 1000);
    const last = y[y.length - 1];
    const frac = all.filter((p) => p[9] > last).length / all.length;
    expect(a.direction(10).pUp).toBeCloseTo(frac, 10);
    // 50% 區間較窄
    const f50 = a.predict(10, 0.5);
    const f90 = a.predict(10, 0.9);
    expect(f50.upper[9] - f50.lower[9]).toBeLessThan(f90.upper[9] - f90.lower[9]);
  });
});
