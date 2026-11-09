import { describe, it, expect } from 'vitest';
import { EnsembleWeightState, combineForecasts } from '@/lib/engine/ensemble-weights';

describe('EnsembleWeightState', () => {
  it('EWMA 與逆平方權重公式（手算）', () => {
    const s = new EnsembleWeightState(['a', 'b'], { eta: 0.1, k: 20 });
    // 尚無資訊 → 等權
    expect(s.weights()).toEqual({ a: 0.5, b: 0.5 });
    // 第 1 期：|e_a| = 1, |e_b| = 2 → ē = |e|
    let r = s.update(10, 9, { a: 9, b: 8 });
    expect(r.weights.a).toBeCloseTo(1 / (1 + 1 / 4), 12); // 0.8
    expect(r.weights.b).toBeCloseTo(0.25 / 1.25, 12);
    // 第 2 期：|e_a| = 3, |e_b| = 0 → ē_a = 0.1·3 + 0.9·1 = 1.2, ē_b = 0.9·2 = 1.8
    r = s.update(10, 10.5, { a: 13, b: 10 });
    const st = s.status();
    expect(st.a.ebar).toBeCloseTo(1.2, 12);
    expect(st.b.ebar).toBeCloseTo(1.8, 12);
    const ia = 1 / 1.44;
    const ib = 1 / 3.24;
    expect(r.weights.a).toBeCloseTo(ia / (ia + ib), 12);
    expect(r.weights.b).toBeCloseTo(ib / (ia + ib), 12);
    expect(r.shift).toBeCloseTo(Math.abs(r.weights.a - 0.8), 12);
    expect(EnsembleWeightState.ewma(2, 4, 0.25)).toBeCloseTo(2.5, 12);
  });

  it('方向持續錯誤 10 期後歸零並標示原因；恢復到 ≥ 50% 時恢復', () => {
    const s = new EnsembleWeightState(['good', 'bad'], { eta: 0.1, k: 20, rule: { minDirAcc: 0.5, consecutive: 10 } });
    let price = 100;
    // bad：方向永遠相反但誤差不大（若只看誤差，它仍會拿到權重）
    for (let t = 1; t <= 10; t++) {
      const next = price + 1;
      const r = s.update(next, price, { good: next + 0.5, bad: price - 0.2 });
      if (t < 10) {
        expect(s.status().bad.zeroed).toBe(false);
        expect(r.zeroedNow).toEqual([]);
      } else {
        expect(r.zeroedNow).toEqual(['bad']);
      }
      price = next;
    }
    const st = s.status();
    expect(st.bad.zeroed).toBe(true);
    expect(st.bad.reason).toMatch(/方向準確率 0%/);
    expect(st.bad.reason).toMatch(/連續 10 期/);
    expect(s.weights().bad).toBe(0);
    expect(s.weights().good).toBe(1);
    // 之後 bad 開始判對：滾動 20 期準確率在第 10 次判對時回到 50% → 恢復
    for (let t = 1; t <= 10; t++) {
      const next = price + 1;
      const r = s.update(next, price, { good: next + 0.5, bad: next + 0.1 });
      if (t < 10) expect(s.status().bad.zeroed).toBe(true);
      else expect(r.restoredNow).toEqual(['bad']);
      price = next;
    }
    expect(s.weights().bad).toBeGreaterThan(0);
  });

  it('全部被歸零時退回不套用歸零規則並標示', () => {
    const s = new EnsembleWeightState(['x', 'y'], { rule: { consecutive: 2 } });
    for (let t = 0; t < 3; t++) s.update(101 + t, 100 + t, { x: 99 + t, y: 98 + t });
    const w = s.weights();
    expect(w.x + w.y).toBeCloseTo(1, 12);
    expect(s.status().x.zeroed).toBe(true);
    expect(s.status().x.reason).toBeTruthy();
  });

  it('序列化 / 還原後狀態一致', () => {
    const s = new EnsembleWeightState(['a', 'b', 'c'], { eta: 0.2 });
    for (let t = 0; t < 15; t++) s.update(100 + Math.sin(t), 100, { a: 100.5, b: 99, c: 100 + Math.cos(t) });
    const json = JSON.parse(JSON.stringify(s.toJSON()));
    const r = EnsembleWeightState.fromJSON(json);
    expect(r.weights()).toEqual(s.weights());
    expect(r.status()).toEqual(s.status());
    const a = s.update(101, 100, { a: 101, b: 99, c: 100 });
    const b = r.update(101, 100, { a: 101, b: 99, c: 100 });
    expect(b.weights).toEqual(a.weights);
  });

  it('combineForecasts 加權平均', () => {
    const c = combineForecasts({ a: { mean: [1, 2], lower: [0, 1], upper: [2, 3] }, b: { mean: [3, 4], lower: [2, 3], upper: [4, 5] } }, { a: 0.75, b: 0.25 })!;
    expect(c.mean).toEqual([1.5, 2.5]);
    expect(c.lower).toEqual([0.5, 1.5]);
  });
});
