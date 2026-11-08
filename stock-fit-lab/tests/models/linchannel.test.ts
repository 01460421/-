import { describe, it, expect } from 'vitest';
import { LinearChannelModel } from '@/lib/models/linchannel';
import { normalGenerator } from '@/lib/math/random';
import { zForLevel } from '@/lib/math/stats';

describe('LinearChannelModel', () => {
  const z = normalGenerator(8);
  const y = Array.from({ length: 400 }, (_, i) => 100 + 0.1 * i + 2 * z());

  it('通道 = 回歸線 ± kσ，k 可調並寫入 describe', () => {
    const m = new LinearChannelModel().fit(y, { params: { k: 1.5 } });
    const d = m.describe();
    expect(d.params.k).toBe(1.5);
    expect(d.params.sigma as number).toBeCloseTo(2, 0);
    const c = m.channel(5);
    expect(c.upper[0] - c.mean[0]).toBeCloseTo(1.5 * (d.params.sigma as number), 8);
    const cf = m.channelFitted();
    expect(cf.mean.length).toBe(y.length);
    // ±2σ 通道約含 95% 樣本
    const m2 = new LinearChannelModel().fit(y);
    expect(m2.describe().diagnostics.insideChannelShare as number).toBeGreaterThan(0.92);
  });

  it('predict 依 level 給區間（覆蓋率用），與通道寬度無關', () => {
    const m = new LinearChannelModel().fit(y, { params: { k: 3 } });
    const f = m.predict(1, 0.8);
    const s = m.describe().params.sigma as number;
    expect((f.upper[0] - f.lower[0]) / 2).toBeGreaterThan(zForLevel(0.8) * s);
    expect((f.upper[0] - f.lower[0]) / 2).toBeLessThan(zForLevel(0.8) * s * 1.05);
    expect(f.mean[0]).toBeCloseTo(100 + 0.1 * 400, -0.5);
  });

  it('RLS 線上更新', () => {
    const m = new LinearChannelModel().fit(y.slice(0, 300));
    for (let i = 300; i < 310; i++) m.update(y[i]);
    expect(m.getRlsTrace().length).toBe(10);
    expect(m.fitted().length).toBe(310);
  });
});
