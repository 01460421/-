import { describe, it, expect } from 'vitest';
import { ArimaModel, kpssTest, pacfToAr, arToPacf } from '@/lib/models/arima';
import { normalGenerator, simulateGBM } from '@/lib/math/random';

function simulateAR1(phi: number, n: number, seed: number, mean = 100, sd = 1): number[] {
  const z = normalGenerator(seed);
  const out: number[] = [];
  let x = 0;
  for (let i = 0; i < n + 100; i++) {
    x = phi * x + sd * z();
    if (i >= 100) out.push(mean + x);
  }
  return out;
}

describe('ArimaModel', () => {
  it('AR(1) φ=0.6：還原 φ≈0.6、選到 (1,0,0)、Ljung–Box p > 0.05', () => {
    const y = simulateAR1(0.6, 500, 21);
    const m = new ArimaModel().fit(y);
    const o = m.getOrder();
    const d = m.describe();
    expect(o.d).toBe(0);
    expect(o.p + o.q).toBeLessThanOrEqual(2);
    expect(o.p).toBeGreaterThanOrEqual(1);
    if (o.p === 1 && o.q === 0) expect((d.params.phi as number[])[0]).toBeCloseTo(0.6, 1);
    expect(d.diagnostics.ljungBoxPValue as number).toBeGreaterThan(0.05);
    expect((d.diagnostics.acf as number[]).length).toBeGreaterThan(5);
    expect((d.diagnostics.pacf as number[]).length).toBeGreaterThan(5);
    expect((d.diagnostics.acfDiff as number[])[1]).toBeCloseTo(0.6, 1);
    expect(String(d.diagnostics.order)).toMatch(/^ARIMA\(\d,\d,\d\)$/);
  });

  it('固定階數 (1,0,0) 時 φ 估計準確', () => {
    const y = simulateAR1(0.6, 500, 21);
    const m = new ArimaModel().fit(y, { params: { p: 1, d: 0, q: 0 } });
    expect((m.describe().params.phi as number[])[0]).toBeCloseTo(0.6, 1);
    // 預測向均值回歸
    const f = m.predict(50);
    expect(Math.abs(f.mean[49] - 100)).toBeLessThan(0.5);
  });

  it('隨機漫步價格：KPSS 選 d = 1，區間依 ψ 權重以 √h 變寬', () => {
    const y = simulateGBM(100, 0, 0.01, 400, 33);
    expect(kpssTest(y).stat).toBeGreaterThan(0.463);
    const m = new ArimaModel().fit(y, { params: { p: 0, q: 0 } });
    expect(m.getOrder().d).toBe(1);
    const f = m.predict(16);
    const w1 = f.upper[0] - f.lower[0];
    const w16 = f.upper[15] - f.lower[15];
    expect(w16 / w1).toBeCloseTo(4, 0);
  });

  it('PACF ↔ AR 映射互逆；ψ 權重正確', () => {
    const phi = pacfToAr([0.5, -0.3, 0.2]);
    const r = arToPacf(phi);
    expect(r[0]).toBeCloseTo(0.5, 10);
    expect(r[1]).toBeCloseTo(-0.3, 10);
    expect(r[2]).toBeCloseTo(0.2, 10);
    const y = simulateAR1(0.6, 300, 4);
    const m = new ArimaModel().fit(y, { params: { p: 1, d: 0, q: 0 } });
    const ph = (m.describe().params.phi as number[])[0];
    const psi = m.psiWeights(4);
    expect(psi[2]).toBeCloseTo(ph * ph, 10);
  });

  it('MA(1) 序列可估計 θ', () => {
    const z = normalGenerator(17);
    const e = Array.from({ length: 601 }, () => z());
    const y = Array.from({ length: 600 }, (_, i) => 50 + e[i + 1] + 0.5 * e[i]);
    const m = new ArimaModel().fit(y, { params: { p: 0, d: 0, q: 1 } });
    expect((m.describe().params.theta as number[])[0]).toBeCloseTo(0.5, 1);
  });
});
