import { describe, it, expect } from 'vitest';
import { dwtForward, dwtInverse, waveletLayers, WaveletModel, DB4_H, DB4_G } from '@/lib/models/advanced/wavelet';
import { emd, EmdModel } from '@/lib/models/advanced/emd';
import { naturalCubicSpline } from '@/lib/models/advanced/spline';
import { normalGenerator } from '@/lib/math/random';

const z = normalGenerator(21);
const signal = Array.from({ length: 333 }, (_, i) => 100 + 0.05 * i + 3 * Math.sin((2 * Math.PI * i) / 40) + 0.5 * z());

describe('db4 DWT', () => {
  it('濾波器正交：Σh² = 1、Σh = √2、Σg = 0', () => {
    expect(DB4_H.reduce((s, v) => s + v * v, 0)).toBeCloseTo(1, 10);
    expect(DB4_H.reduce((s, v) => s + v, 0)).toBeCloseTo(Math.SQRT2, 10);
    expect(DB4_G.reduce((s, v) => s + v, 0)).toBeCloseTo(0, 10);
  });

  it('完美重建 inverse(forward(x)) ≈ x（含奇數長度）', () => {
    for (const n of [64, 100, 333]) {
      const x = signal.slice(0, n);
      const rec = dwtInverse(dwtForward(x, 5));
      expect(rec).toHaveLength(n);
      const err = Math.max(...x.map((v, i) => Math.abs(v - rec[i])));
      expect(err).toBeLessThan(1e-9);
    }
  });

  it('能量守恆（偶數長度、正交轉換）', () => {
    const x = signal.slice(0, 256);
    const d = dwtForward(x, 4);
    const e0 = x.reduce((s, v) => s + v * v, 0);
    const e1 = d.approx.reduce((s, v) => s + v * v, 0) + d.details.flat().reduce((s, v) => s + v * v, 0);
    expect(e1 / e0).toBeCloseTo(1, 9);
  });

  it('三層相加等於原序列，模型可預測', () => {
    const L = waveletLayers(signal);
    const err = Math.max(...signal.map((v, i) => Math.abs(v - (L.trend[i] + L.mid[i] + L.noise[i]))));
    expect(err).toBeLessThan(1e-8);
    const m = new WaveletModel().fit(signal);
    const f = m.predict(10);
    expect(f.mean.every(Number.isFinite)).toBe(true);
    expect(f.upper[9] - f.lower[9]).toBeGreaterThan(f.upper[0] - f.lower[0]);
    expect(m.describe().diagnostics.energyTrend).toBeGreaterThan(0.5);
  });
});

describe('EMD', () => {
  it('自然三次樣條通過節點且端點二階導數為 0', () => {
    const s = naturalCubicSpline([0, 1, 3, 4], [1, 2, 0, 5]);
    expect(s.evaluate(3)).toBeCloseTo(0, 12);
    expect(s.evaluate(1)).toBeCloseTo(2, 12);
    expect(s.M[0]).toBe(0);
    expect(s.M[3]).toBe(0);
  });

  it('IMF 與殘差相加回原訊號', () => {
    const r = emd(signal);
    expect(r.imfs.length).toBeGreaterThan(1);
    const err = Math.max(...signal.map((v, i) => Math.abs(v - r.imfs.reduce((s, imf) => s + imf[i], 0) - r.residue[i])));
    expect(err).toBeLessThan(1e-9);
  });

  it('EmdModel 合約', () => {
    const m = new EmdModel().fit(signal);
    expect(m.fitted()).toHaveLength(signal.length);
    const f = m.predict(5);
    expect(f.mean.every(Number.isFinite)).toBe(true);
    const L = m.getLayers();
    const err = Math.max(...signal.map((v, i) => Math.abs(v - (L.trend[i] + L.mid[i] + L.noise[i]))));
    expect(err).toBeLessThan(1e-9);
  });
});
