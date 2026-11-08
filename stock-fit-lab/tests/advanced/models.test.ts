import { describe, it, expect } from 'vitest';
import { GaussianProcessModel } from '@/lib/models/advanced/gp';
import { MsarModel, fitMsar, regimeProbabilities } from '@/lib/models/advanced/msar';
import { BstsModel } from '@/lib/models/advanced/bsts';
import { hurstExponent, hasLongMemory, fracDiff, fracDiffWeights } from '@/lib/models/advanced/hurst';
import { StackingMeta, StackingModel } from '@/lib/models/advanced/stacking';
import { ADVANCED_FACTORIES, ADVANCED_MODEL_META, defaultStackingComponents } from '@/lib/models/advanced';
import { lstsq } from '@/lib/math/linalg';
import { makeTimeAxis } from '@/lib/math/timeaxis';
import { normalGenerator, simulateRandomWalk } from '@/lib/math/random';
import { pricesFromPctReturns } from './helpers';

const rmse = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);

describe('Gaussian process', () => {
  it('擬合正弦優於線性回歸（樣本內與外推）', () => {
    const n = 200;
    const z = normalGenerator(4);
    const full = Array.from({ length: n + 20 }, (_, i) => 100 + 5 * Math.sin((2 * Math.PI * i) / 50) + 0.2 * z());
    const y = full.slice(0, n);
    const gp = new GaussianProcessModel().fit(y);
    const ax = makeTimeAxis(n);
    const lin = lstsq(ax.train.map((t) => [1, t]), y);
    expect(rmse(gp.fitted(), y)).toBeLessThan(0.5 * rmse(lin.fitted, y));
    const f = gp.predict(20);
    const linF = ax.future(20).map((t) => lin.coef[0] + lin.coef[1] * t);
    expect(rmse(f.mean, full.slice(n))).toBeLessThan(rmse(linF, full.slice(n)));
    expect(f.upper[19] - f.lower[19]).toBeGreaterThan(0);
  });

  it('資料點上限：500 點仍只用 ≤ 250 點且快速完成', () => {
    const y = simulateRandomWalk(100, 0.01, 500, 3);
    const t0 = Date.now();
    const m = new GaussianProcessModel().fit(y);
    expect(Date.now() - t0).toBeLessThan(8000);
    expect(m.describe().diagnostics.usedPoints).toBeLessThanOrEqual(250);
  });
});

describe('MS-AR', () => {
  // 兩個明顯不同的 regime：平穩上漲（低波動）與下跌（高波動），區塊交替
  const z = normalGenerator(8);
  const r: number[] = [];
  const truth: number[] = [];
  for (let b = 0; b < 6; b++) {
    for (let i = 0; i < 120; i++) {
      const bull = b % 2 === 0;
      r.push(bull ? 0.4 + 0.5 * z() : -0.4 + 2.5 * z());
      truth.push(bull ? 1 : 0);
    }
  }

  it('區分兩個 regime 並給出正確的當前 regime', () => {
    const fit = fitMsar(r, 2);
    // 排序後 regime 0 = 空頭（平均低），regime 1 = 多頭
    expect(fit.labels).toEqual(['空頭', '多頭']);
    expect(fit.sigma[0]).toBeGreaterThan(1.8);
    expect(fit.sigma[1]).toBeLessThan(0.8);
    // 平滑機率的分類正確率
    const acc = fit.smoothed.filter((p, t) => (p[1] > 0.5 ? 1 : 0) === truth[t + 1]).length / fit.smoothed.length;
    expect(acc).toBeGreaterThan(0.9);
    // 最後一個區塊是空頭
    const cur = regimeProbabilities(pricesFromPctReturns(r), 2);
    expect(cur.probs[0]).toBeGreaterThan(0.8);
  });

  it('MsarModel 合約與 regimeProbs 診斷值', () => {
    const y = pricesFromPctReturns(r);
    const m = new MsarModel().fit(y, { seed: 3 });
    const d = m.describe();
    const probs = d.diagnostics.regimeProbs as number[];
    expect(probs).toHaveLength(3);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    const f = m.predict(10);
    expect(f.lower[9]).toBeLessThan(f.mean[9]);
    expect(f.upper[9]).toBeGreaterThan(f.mean[9]);
  });
});

describe('BSTS', () => {
  it('還原外生變數迴歸係數', () => {
    const n = 300;
    const z = normalGenerator(17);
    const x = Array.from({ length: n }, () => 3 * z());
    let level = 100;
    const y: number[] = [];
    for (let t = 0; t < n; t++) {
      level += 0.05 + 0.2 * z();
      y.push(level + 2 * x[t] + 0.5 * z());
    }
    const m = new BstsModel().fit(y, { exog: x.map((v) => [v]), params: { season: 0 } });
    const { beta, se } = m.regressionCoefficients();
    expect(beta[0]).toBeGreaterThan(1.85);
    expect(beta[0]).toBeLessThan(2.15);
    expect(se[0]).toBeGreaterThan(0);
    const f = m.predict(10);
    expect(f.upper[9] - f.lower[9]).toBeGreaterThan(f.upper[0] - f.lower[0]);
    m.update(y[n - 1] + 1);
    expect(m.fitted()).toHaveLength(n + 1);
    expect(String(m.describe().params.estimation)).toContain('非 MCMC');
  });

  it('含季節分量時可擬合', () => {
    const y = Array.from({ length: 200 }, (_, i) => 50 + 0.1 * i + [1, -1, 0.5, -0.5, 0][i % 5]);
    const m = new BstsModel().fit(y, { params: { season: 5 } });
    expect(Number.isFinite(m.predict(5).mean[4])).toBe(true);
  });
});

describe('Hurst / fracDiff', () => {
  it('隨機漫步報酬的 H ≈ 0.5', () => {
    const p = simulateRandomWalk(100, 0.01, 3000, 99);
    const h = hasLongMemory(p);
    expect(Math.abs(h.dfa - 0.5)).toBeLessThan(0.1);
    expect(Math.abs(h.rsCorrected - 0.5)).toBeLessThan(0.1);
    expect(h.longMemory).toBe(false);
  });

  it('持續性（長記憶）序列的 H 明顯較高', () => {
    const z = normalGenerator(5);
    const e = Array.from({ length: 3000 }, () => z());
    const persistent = fracDiff(e, -0.3, 0); // ARFIMA(0, 0.3, 0)：H ≈ 0.8
    const h = hurstExponent(persistent.slice(200));
    expect(h.H).toBeGreaterThan(0.65);
    const white = hurstExponent(e);
    expect(h.H).toBeGreaterThan(white.H + 0.15);
  });

  it('分數差分：d = 1 等於一階差分，權重遞迴正確', () => {
    const x = [1, 3, 6, 10, 15];
    expect(fracDiff(x, 1, 1e-8)).toEqual([2, 3, 4, 5]);
    const w = fracDiffWeights(0.5, 0, 4);
    expect(w[1]).toBeCloseTo(-0.5, 12);
    expect(w[2]).toBeCloseTo(-0.125, 12);
  });
});

describe('Stacking', () => {
  it('ridge meta-learner 由合成樣本外預測還原已知權重', () => {
    const z = normalGenerator(31);
    const rows: number[][] = [];
    const actual: number[] = [];
    for (let t = 0; t < 500; t++) {
      const row = [z(), z(), z()];
      rows.push(row);
      actual.push(0.1 + 0.6 * row[0] + 0.3 * row[1] + 0.1 * row[2] + 0.01 * z());
    }
    const meta = new StackingMeta().fit(rows, actual, 1e-6);
    expect(meta.weights[0]).toBeCloseTo(0.6, 2);
    expect(meta.weights[1]).toBeCloseTo(0.3, 2);
    expect(meta.weights[2]).toBeCloseTo(0.1, 2);
    expect(meta.intercept).toBeCloseTo(0.1, 2);
    expect(meta.predict([1, 1, 1])).toBeCloseTo(1.1, 2);
  });

  it('StackingModel 以內部走動式樣本外預測訓練', () => {
    const y = simulateRandomWalk(100, 0.01, 200, 12);
    const m = new StackingModel(defaultStackingComponents()).fit(y, { params: { horizon: 5, folds: 20 } });
    const d = m.describe();
    expect(d.diagnostics.oosRows).toBe(20);
    expect(d.diagnostics.trainingData).toBe('walk-forward out-of-sample only');
    const f = m.predict(5);
    expect(f.mean.every(Number.isFinite)).toBe(true);
    expect(m.getMeta().weights).toHaveLength(3);
  });

  it('外部提供 meta 時直接使用', () => {
    const y = simulateRandomWalk(100, 0.01, 120, 2);
    const meta = new StackingMeta();
    meta.weights = [1, 0, 0];
    meta.horizon = 5;
    meta.residualStd = 0.02;
    const m = new StackingModel(defaultStackingComponents(), meta).fit(y);
    expect(m.describe().diagnostics.externalMeta).toBe(true);
  });
});

describe('ADVANCED_FACTORIES', () => {
  it('每個進階模型都完整實作合約，500 點在數秒內完成', () => {
    const y = simulateRandomWalk(100, 0.015, 500, 77);
    for (const [id, factory] of Object.entries(ADVANCED_FACTORIES)) {
      const t0 = Date.now();
      const m = factory().fit(y, { seed: 1 });
      const f = m.predict(10, 0.9);
      const dir = m.direction(10);
      const d = m.describe();
      const ms = Date.now() - t0;
      expect(m.id).toBe(id);
      expect(f.horizon).toBe(10);
      expect(f.mean.every((v, i) => Number.isFinite(v) && f.lower[i] <= v && v <= f.upper[i])).toBe(true);
      expect(dir.pUp).toBeGreaterThan(0);
      expect(dir.pUp).toBeLessThan(1);
      expect(d.formulaLatex.length).toBeGreaterThan(10);
      expect(d.derivation.length).toBeGreaterThan(10);
      expect(ADVANCED_MODEL_META[id as keyof typeof ADVANCED_MODEL_META].name.length).toBeGreaterThan(0);
      expect(ms, `${id} 耗時 ${ms}ms`).toBeLessThan(8000);
    }
  });
});
