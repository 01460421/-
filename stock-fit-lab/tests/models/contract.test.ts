import { describe, it, expect } from 'vitest';
import { BASIC_FACTORIES, BASIC_MODEL_META, createBasicModel, createEnsemble } from '@/lib/models/registry';
import { simulateGBM } from '@/lib/math/random';
import { decayWeights } from '@/lib/math/timeaxis';
import type { BasicModelId, ForecastModel } from '@/lib/types';

const ids = [...Object.keys(BASIC_FACTORIES), 'ensemble'] as BasicModelId[];

function checkForecast(m: ForecastModel, h: number, level = 0.9) {
  const f = m.predict(h, level);
  expect(f.horizon).toBe(h);
  expect(f.level).toBe(level);
  for (const arr of [f.mean, f.lower, f.upper]) {
    expect(arr.length).toBe(h);
    for (const v of arr) expect(Number.isFinite(v)).toBe(true);
  }
  for (let i = 0; i < h; i++) {
    expect(f.lower[i]).toBeLessThanOrEqual(f.mean[i] + 1e-9);
    expect(f.mean[i]).toBeLessThanOrEqual(f.upper[i] + 1e-9);
    expect(f.lower[i]).toBeGreaterThan(0);
  }
  return f;
}

describe.each(ids)('模型合約：%s', (id) => {
  const y = simulateGBM(100, 0.0005, 0.015, 160, 5);

  it.each(['raw', 'log'] as const)('fit / fitted / residuals / predict / direction / describe（%s）', (priceMode) => {
    const m = createBasicModel(id).fit(y, { priceMode, seed: 1 });
    expect(m.id).toBe(id);
    expect(m.fitted().length).toBe(y.length);
    expect(m.residuals().length).toBe(y.length);
    m.fitted().forEach((v) => expect(Number.isFinite(v)).toBe(true));
    checkForecast(m, 1);
    checkForecast(m, 10);
    checkForecast(m, 10, 0.5);
    const d = m.direction(5);
    expect(d.pUp).toBeGreaterThan(0);
    expect(d.pUp).toBeLessThan(1);
    expect(['up', 'down', 'neutral']).toContain(d.signal);
    const desc = m.describe();
    expect(desc.id).toBe(id);
    expect(desc.name.length).toBeGreaterThan(0);
    expect(desc.formulaLatex.length).toBeGreaterThan(0);
    expect(desc.derivation.length).toBeGreaterThan(0);
    expect(desc.diagnostics.priceMode).toBe(priceMode);
    expect(JSON.parse(JSON.stringify(desc)).id).toBe(id);
    expect(BASIC_MODEL_META[id].name.length).toBeGreaterThan(0);
  });

  it('區間隨信賴水準變寬', () => {
    const m = createBasicModel(id).fit(y, { seed: 1 });
    const a = m.predict(5, 0.5);
    const b = m.predict(5, 0.95);
    expect(b.upper[4] - b.lower[4]).toBeGreaterThan(a.upper[4] - a.lower[4]);
  });

  it('update() 逐筆餵入後仍可預測', () => {
    const m = createBasicModel(id).fit(y.slice(0, 140), { seed: 1 });
    for (let i = 140; i < 145; i++) m.update(y[i]);
    expect(m.fitted().length).toBeGreaterThanOrEqual(140);
    checkForecast(m, 5);
  });

  it('接受指數衰減權重（w_i = λ^(T−i)）', () => {
    const m = createBasicModel(id).fit(y, { weights: decayWeights(y.length, 0.97), seed: 1 });
    expect(m.describe().diagnostics.weighted).toBe(true);
    checkForecast(m, 5);
  });

  it('不讀取 y 以外資料：對前綴擬合的預測不受後續資料影響', () => {
    const a = createBasicModel(id).fit(y.slice(0, 120), { seed: 3 }).predict(3);
    const b = createBasicModel(id).fit(y.slice(0, 120), { seed: 3 }).predict(3);
    expect(a.mean).toEqual(b.mean);
  });
});

describe('registry', () => {
  it('createEnsemble 預設包含全部基礎模型', () => {
    const e = createEnsemble();
    expect(Object.keys(e.getWeights()).sort()).toEqual(Object.keys(BASIC_FACTORIES).sort());
  });
});
