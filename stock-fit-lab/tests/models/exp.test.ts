import { describe, it, expect } from 'vitest';
import { ExponentialModel } from '@/lib/models/exp';
import { makeTimeAxis } from '@/lib/math/timeaxis';
import { normalGenerator } from '@/lib/math/random';

describe('ExponentialModel', () => {
  it('還原 y = 50·e^{0.8τ} 的 a、b（乘法微小雜訊）', () => {
    const ax = makeTimeAxis(300);
    const z = normalGenerator(1);
    const y = ax.train.map((t) => 50 * Math.exp(0.8 * t) * Math.exp(0.001 * z()));
    const m = new ExponentialModel().fit(y);
    const p = m.describe().params;
    expect(p.a as number).toBeCloseTo(50, 0);
    expect(p.b as number).toBeCloseTo(0.8, 2);
  });

  it('priceMode 不影響結果（本質為對數空間模型）', () => {
    const y = Array.from({ length: 80 }, (_, i) => 20 * Math.exp(0.01 * i) * (1 + 0.01 * Math.sin(i)));
    const a = new ExponentialModel().fit(y, { priceMode: 'raw' }).predict(5);
    const b = new ExponentialModel().fit(y, { priceMode: 'log' }).predict(5);
    expect(a.mean).toEqual(b.mean);
  });

  it('預測區間不對稱且隨期數變寬；RLS 更新紀錄增益', () => {
    const z = normalGenerator(4);
    const y = Array.from({ length: 120 }, (_, i) => 30 * Math.exp(0.004 * i + 0.02 * z()));
    const m = new ExponentialModel().fit(y);
    const f = m.predict(30);
    expect(f.upper[29] - f.mean[29]).toBeGreaterThan(f.mean[29] - f.lower[29]);
    expect(f.upper[29] - f.lower[29]).toBeGreaterThan(f.upper[0] - f.lower[0]);
    m.update(y[119] * 1.01);
    expect(m.getRlsTrace().length).toBe(1);
  });

  it('RLS（λ_f = 1）與批次擬合同一條線', () => {
    const z = normalGenerator(5);
    const y = Array.from({ length: 100 }, (_, i) => 40 * Math.exp(0.003 * i + 0.01 * z()));
    const online = new ExponentialModel().fit(y.slice(0, 80), { params: { forgetting: 1 } });
    for (let i = 80; i < 100; i++) online.update(y[i]);
    const batch = new ExponentialModel().fit(y);
    expect(online.predict(1).mean[0]).toBeCloseTo(batch.predict(1).mean[0], 6);
  });
});
