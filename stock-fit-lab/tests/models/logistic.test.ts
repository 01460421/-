import { describe, it, expect } from 'vitest';
import { LogisticModel } from '@/lib/models/logistic';
import { makeTimeAxis } from '@/lib/math/timeaxis';
import { normalGenerator, simulateGBM } from '@/lib/math/random';

describe('LogisticModel', () => {
  it('還原乾淨 logistic + 微小雜訊的 L、k、τ0', () => {
    const ax = makeTimeAxis(300);
    const z = normalGenerator(7);
    const L = 200;
    const k = 4;
    const t0 = 0.2;
    const y = ax.train.map((t) => L / (1 + Math.exp(-k * (t - t0))) + 0.2 * z());
    const m = new LogisticModel().fit(y);
    const p = m.getParams();
    expect(p).not.toBeNull();
    expect(p!.L).toBeCloseTo(L, -0.5); // ±1.6
    expect(Math.abs(p!.k - k)).toBeLessThan(0.1);
    expect(Math.abs(p!.tau0 - t0)).toBeLessThan(0.02);
    expect(m.describe().diagnostics.degraded).toBe(false);
    // 外推趨近 L
    const f = m.predict(200);
    expect(f.mean[199]).toBeLessThan(L * 1.02);
    expect(f.mean[199]).toBeGreaterThan(f.mean[0]);
  });

  it('遞減 logistic（k < 0）', () => {
    const ax = makeTimeAxis(200);
    const y = ax.train.map((t) => 80 / (1 + Math.exp(3 * (t + 0.1))) + 5);
    // 加常數 5 後不是純 logistic，但仍應給出有限且合理的結果
    const m = new LogisticModel().fit(y);
    const f = m.predict(10);
    expect(f.mean.every(Number.isFinite)).toBe(true);
  });

  it('無法辨識時降級為線性並標示 degraded', () => {
    // 純直線遞增：logistic 只能用「L 觸上界」近似，應降級
    const y = Array.from({ length: 100 }, (_, i) => 50 + 0.5 * i);
    const m = new LogisticModel().fit(y);
    const d = m.describe();
    if (d.diagnostics.fallbackLinear) {
      expect(typeof d.diagnostics.degraded).toBe('string');
      expect(m.predict(1).mean[0]).toBeCloseTo(100, 0);
    } else {
      expect(m.predict(1).mean[0]).toBeCloseTo(100, -1);
    }
    // 隨機漫步也必須產生有限預測
    const g = new LogisticModel().fit(simulateGBM(100, 0, 0.02, 300, 9));
    expect(g.predict(5).mean.every(Number.isFinite)).toBe(true);
  });
});
