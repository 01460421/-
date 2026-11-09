import { describe, it, expect } from 'vitest';
import { GarchModel, fitGarch } from '@/lib/models/advanced/garch';
import { EgarchModel } from '@/lib/models/advanced/egarch';
import { pricesFromPctReturns, simulateGarch } from './helpers';

describe('GARCH(1,1)', () => {
  const r = simulateGarch(2000, 0.05, 0.1, 0.85, 0.02, 11);

  it('由模擬資料大致還原 α、β（n = 2000）', () => {
    const { params } = fitGarch(r);
    expect(params.alpha).toBeGreaterThan(0.05);
    expect(params.alpha).toBeLessThan(0.16);
    expect(params.beta).toBeGreaterThan(0.77);
    expect(params.beta).toBeLessThan(0.92);
    expect(params.alpha + params.beta).toBeLessThan(1);
    expect(params.omega).toBeGreaterThan(0);
  });

  it('ForecastModel 合約：區間寬度由條件變異數決定並隨期數擴張', () => {
    const y = pricesFromPctReturns(r.slice(0, 600));
    const m = new GarchModel().fit(y);
    const f = m.predict(20, 0.9);
    expect(f.mean).toHaveLength(20);
    expect(f.upper[19] - f.lower[19]).toBeGreaterThan(f.upper[0] - f.lower[0]);
    const d = m.describe();
    expect(d.diagnostics.persistence).toBeLessThan(1);
    expect((d.diagnostics.conditionalSigmaTail as number[]).length).toBe(30);
    expect(m.fitted()).toHaveLength(y.length);
    const dir = m.direction(5);
    expect(dir.pUp).toBeGreaterThan(0);
    expect(dir.pUp).toBeLessThan(1);
  });

  it('高波動期後的一步區間比低波動期寬（非固定 σ）', () => {
    const calm = new Array(300).fill(0).map((_, i) => 0.3 * Math.sin(i * 1.7));
    const storm = new Array(30).fill(0).map((_, i) => (i % 2 ? 4 : -4));
    const base = simulateGarch(400, 0.05, 0.1, 0.85, 0, 5);
    const yCalm = pricesFromPctReturns([...base, ...calm]);
    const yStorm = pricesFromPctReturns([...base, ...calm.slice(0, 270), ...storm]);
    const wCalm = (() => {
      const f = new GarchModel().fit(yCalm).predict(1);
      return (f.upper[0] - f.lower[0]) / yCalm[yCalm.length - 1];
    })();
    const wStorm = (() => {
      const f = new GarchModel().fit(yStorm).predict(1);
      return (f.upper[0] - f.lower[0]) / yStorm[yStorm.length - 1];
    })();
    expect(wStorm).toBeGreaterThan(wCalm * 1.5);
  });

  it('線上更新只推進 σ² 遞迴', () => {
    const y = pricesFromPctReturns(r.slice(0, 400));
    const m = new GarchModel().fit(y, { params: { refitEvery: 50 } });
    const a = m.getParams();
    m.update(y[y.length - 1] * 1.03);
    expect(m.getParams()).toEqual(a);
    expect(m.fitted()).toHaveLength(y.length + 1);
  });
});

describe('EGARCH(1,1)', () => {
  it('估計結果平穩且可預測', () => {
    const r = simulateGarch(1000, 0.05, 0.1, 0.85, 0, 3);
    const y = pricesFromPctReturns(r);
    const m = new EgarchModel().fit(y, { seed: 1 });
    const p = m.getParams();
    expect(Math.abs(p.beta)).toBeLessThan(1);
    expect(p.beta).toBeGreaterThan(0.7);
    const f = m.predict(10);
    expect(f.upper[9]).toBeGreaterThan(f.mean[9]);
    expect(f.lower[9]).toBeLessThan(f.mean[9]);
    expect(m.describe().diagnostics.beta).toBe(p.beta);
  });
});
