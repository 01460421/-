import { describe, it, expect } from 'vitest';
import { KalmanModel } from '@/lib/models/kalman';
import { normalGenerator } from '@/lib/math/random';

describe('KalmanModel', () => {
  const z = normalGenerator(31);
  const y = Array.from({ length: 300 }, (_, i) => 100 + 0.2 * i + 1 * z());

  it('追蹤線性趨勢：斜率 ≈ 0.2/日、水準 ≈ 真值', () => {
    const m = new KalmanModel().fit(y);
    const s = m.getState();
    expect(s.slope).toBeCloseTo(0.2, 1);
    expect(Math.abs(s.level - (100 + 0.2 * 299))).toBeLessThan(1);
    const f = m.predict(10);
    expect(Math.abs(f.mean[9] - (100 + 0.2 * 309))).toBeLessThan(2);
  });

  it('增益收斂到穩態', () => {
    const m = new KalmanModel().fit(y);
    const tr = m.getTrace();
    expect(tr.length).toBe(300);
    const a = tr[tr.length - 1].gain;
    const b = tr[tr.length - 2].gain;
    expect(Math.abs(a[0] - b[0])).toBeLessThan(1e-3);
    expect(Math.abs(a[1] - b[1])).toBeLessThan(1e-4);
    expect(a[0]).toBeGreaterThan(0);
    expect(a[0]).toBeLessThan(1);
  });

  it('注入水準跳升後 3 期內觸發結構性變化警示並放大 Q；update 不重擬合', () => {
    const m = new KalmanModel().fit(y);
    const varsBefore = m.getVariances();
    const alertsBefore = m.getAlerts().length;
    const zz = normalGenerator(99);
    for (let k = 1; k <= 8; k++) m.update(100 + 0.2 * (299 + k) + 15 + zz());
    const alerts = m.getAlerts().slice(alertsBefore);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].step).toBeLessThanOrEqual(302);
    expect(alerts[0].qScale).toBe(10);
    const tr = m.getTrace();
    const after = tr.find((t) => t.step === alerts[0].step + 1)!;
    expect(after.qScale).toBe(10);
    // 放大 Q 後增益變大（更相信新資料）
    const steady = tr.find((t) => t.step === 299)!;
    expect(after.gain[0]).toBeGreaterThan(steady.gain[0]);
    expect(m.getVariances()).toEqual(varsBefore);
    expect(m.fitted().length).toBe(308);
    // 之後 q_scale 衰減回 1
    for (let k = 9; k <= 40; k++) m.update(100 + 0.2 * (299 + k) + 15 + zz());
    expect(m.getState().qScale).toBeLessThan(1.1);
  });

  it('log 模式與使用者指定變異數', () => {
    const p = y.map((v) => v);
    const m = new KalmanModel().fit(p, { priceMode: 'log', params: { q_level: 0.01, q_slope: 0.0001, r: 0.5 } });
    const d = m.describe();
    expect(d.diagnostics.qLevelEstimated).toBe(false);
    expect(d.diagnostics.rEstimated).toBe(false);
    const f = m.predict(5);
    expect(f.mean[0]).toBeGreaterThan(150);
  });
});
