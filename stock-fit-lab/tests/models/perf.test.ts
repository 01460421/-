import { describe, it, expect } from 'vitest';
import { BASIC_FACTORIES, createEnsemble } from '@/lib/models/registry';
import { simulateGBM } from '@/lib/math/random';

describe('效能：500 點全量重算基礎模型 < 1 秒', () => {
  it('所有基礎模型（含集成）擬合 + 預測', () => {
    const y = simulateGBM(100, 0.0004, 0.018, 500, 11);
    // 暖機（JIT），不計時
    for (const f of Object.values(BASIC_FACTORIES)) f().fit(y.slice(0, 120)).predict(5);
    const timings: Record<string, number> = {};
    const t0 = performance.now();
    for (const [id, f] of Object.entries(BASIC_FACTORIES)) {
      const s = performance.now();
      const m = f().fit(y);
      m.predict(20);
      m.direction(5);
      timings[id] = performance.now() - s;
    }
    const sEns = performance.now();
    createEnsemble().fit(y).predict(20);
    timings.ensemble = performance.now() - sEns;
    const total = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log('fit timings (ms):', Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, +v.toFixed(1)])), 'total', total.toFixed(1));
    expect(total).toBeLessThan(1000);
  });
});
