import { describe, it, expect } from 'vitest';
import { FourierModel } from '@/lib/models/fourier';
import { normalGenerator } from '@/lib/math/random';

describe('FourierModel', () => {
  it('還原已知正弦（週期 20 日、振幅 3）', () => {
    const n = 200;
    const z = normalGenerator(3);
    const y = Array.from({ length: n }, (_, i) => 100 + 0.05 * i + 3 * Math.sin((2 * Math.PI * i) / 20 + 0.4) + 0.1 * z());
    const m = new FourierModel().fit(y, { params: { harmonics: 1 } });
    const [h] = m.harmonics();
    expect(h.periodDays).toBeCloseTo(20, 0);
    expect(h.amplitude).toBeCloseTo(3, 1);
    // 預測延續波形
    const f = m.predict(20);
    for (let k = 1; k <= 20; k++) {
      const i = n - 1 + k;
      const truth = 100 + 0.05 * i + 3 * Math.sin((2 * Math.PI * i) / 20 + 0.4);
      expect(Math.abs(f.mean[k - 1] - truth)).toBeLessThan(0.3);
    }
  });

  it('非整數週期（23.7 日）經黃金分割精修後振幅不被低估', () => {
    const n = 300;
    const y = Array.from({ length: n }, (_, i) => 50 + 2 * Math.cos((2 * Math.PI * i) / 23.7));
    const [h] = new FourierModel().fit(y, { params: { harmonics: 1 } }).harmonics();
    expect(h.periodDays).toBeCloseTo(23.7, 0);
    expect(h.amplitude).toBeGreaterThan(1.9);
  });

  it('兩個週期：m = 2 找到兩者；基頻諧波模式可運作；m 上限 8', () => {
    const n = 240;
    const y = Array.from({ length: n }, (_, i) => 80 + 2 * Math.sin((2 * Math.PI * i) / 10) + 1 * Math.sin((2 * Math.PI * i) / 40));
    const m = new FourierModel().fit(y, { params: { harmonics: 2 } });
    const periods = m.harmonics().map((h) => h.periodDays).sort((a, b) => a - b);
    expect(Math.abs(periods[0] - 10)).toBeLessThan(0.2);
    expect(Math.abs(periods[1] - 40)).toBeLessThan(1);
    const amps = m.harmonics().map((h) => h.amplitude).sort((a, b) => a - b);
    expect(Math.abs(amps[1] - 2)).toBeLessThan(0.1);
    expect(Math.abs(amps[0] - 1)).toBeLessThan(0.15);
    const fm = new FourierModel().fit(y, { params: { harmonics: 3, freqMode: 1 } });
    expect(fm.harmonics()[0].periodDays).toBeCloseTo(n, -1);
    const big = new FourierModel().fit(y, { params: { harmonics: 20 } });
    expect(big.harmonics().length).toBe(8);
  });
});
