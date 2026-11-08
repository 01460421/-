import { describe, it, expect } from 'vitest';
import { LogarithmicModel } from '@/lib/models/log';
import { normalGenerator } from '@/lib/math/random';

describe('LogarithmicModel', () => {
  it('還原 y = 100 + 8·ln(s)，s = (i+1)/n', () => {
    const n = 250;
    const z = normalGenerator(2);
    const y = Array.from({ length: n }, (_, i) => 100 + 8 * Math.log((i + 1) / n) + 0.01 * z());
    const m = new LogarithmicModel().fit(y);
    const p = m.describe().params;
    expect(p.a as number).toBeCloseTo(100, 1);
    expect(p.b as number).toBeCloseTo(8, 1);
  });

  it('外推越來越平緩（凹性）', () => {
    const n = 100;
    const y = Array.from({ length: n }, (_, i) => 50 + 5 * Math.log(i + 1));
    const f = new LogarithmicModel().fit(y).predict(40);
    const d1 = f.mean[1] - f.mean[0];
    const d2 = f.mean[39] - f.mean[38];
    expect(d1).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(0);
  });

  it('log 模式（冪律）與 RLS 更新', () => {
    const y = Array.from({ length: 90 }, (_, i) => 10 * Math.pow((i + 1) / 90, 0.3));
    const m = new LogarithmicModel().fit(y, { priceMode: 'log' });
    expect(m.describe().params.b as number).toBeCloseTo(0.3, 6);
    m.update(10 * Math.pow(91 / 90, 0.3));
    expect(m.predict(1).mean[0]).toBeCloseTo(10 * Math.pow(92 / 90, 0.3), 3);
    expect(m.getRlsTrace().length).toBe(1);
  });
});
