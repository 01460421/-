import { describe, it, expect } from 'vitest';
import { EnsembleModel } from '@/lib/models/ensemble';
import { createEnsemble } from '@/lib/models/registry';
import { PolynomialModel } from '@/lib/models/poly';
import { LinearChannelModel } from '@/lib/models/linchannel';
import { KalmanModel } from '@/lib/models/kalman';
import { simulateGBM } from '@/lib/math/random';
import type { ForecastModel } from '@/lib/types';

const y = simulateGBM(100, 0.0005, 0.015, 200, 3);

class Broken extends LinearChannelModel {
  protected fitCore(): void {
    throw new Error('boom');
  }
}

describe('EnsembleModel', () => {
  it('權重 1 給單一成分 = 該成分預測', () => {
    const e = createEnsemble(['poly', 'linchannel', 'kalman'], { poly: 0, linchannel: 1, kalman: 0 }).fit(y);
    const single = new LinearChannelModel().fit(y).predict(5);
    const f = e.predict(5);
    for (let i = 0; i < 5; i++) {
      expect(f.mean[i]).toBeCloseTo(single.mean[i], 8);
      expect(f.lower[i]).toBeCloseTo(single.lower[i], 6);
      expect(f.upper[i]).toBeCloseTo(single.upper[i], 6);
    }
    expect(e.fitted()).toEqual(new LinearChannelModel().fit(y).fitted().map((v) => v));
  });

  it('權重正規化、等權預設、0 權重排除', () => {
    const e = createEnsemble(['poly', 'linchannel', 'kalman']).fit(y);
    expect(e.getWeights()).toEqual({ poly: 1 / 3, linchannel: 1 / 3, kalman: 1 / 3 });
    e.setWeights({ poly: 2, linchannel: 2, kalman: 0 });
    expect(e.getWeights()).toEqual({ poly: 0.5, linchannel: 0.5, kalman: 0 });
    const fp = new PolynomialModel().fit(y).predict(3).mean;
    const fl = new LinearChannelModel().fit(y).predict(3).mean;
    const f = e.predict(3).mean;
    for (let i = 0; i < 3; i++) expect(f[i]).toBeCloseTo(0.5 * fp[i] + 0.5 * fl[i], 8);
    // 混合區間至少涵蓋成分意見分歧
    const fi = e.predict(3);
    expect(fi.upper[2] - fi.lower[2]).toBeGreaterThan(0);
    const d = e.describe();
    expect(d.formulaLatex).toContain('w_m=\\frac{\\bar e_m^{-2}}{\\sum_j \\bar e_j^{-2}}');
    expect(d.params.w_poly).toBe(0.5);
  });

  it('單一成分失敗時排除並記錄；update 更新每個成分', () => {
    const comps: { id: string; factory: () => ForecastModel }[] = [
      { id: 'broken', factory: () => new Broken() },
      { id: 'kalman', factory: () => new KalmanModel() },
      { id: 'linchannel', factory: () => new LinearChannelModel() },
    ];
    const e = new EnsembleModel(comps).fit(y.slice(0, 190));
    expect(e.getFailures().broken).toContain('boom');
    expect(String(e.describe().diagnostics.failed)).toContain('broken');
    expect(e.getComponentIds()).toEqual(['kalman', 'linchannel']);
    for (let i = 190; i < 200; i++) e.update(y[i]);
    expect((e.getComponent('kalman') as KalmanModel).getTrace().length).toBe(200);
    expect(e.fitted().length).toBe(200);
    const d = e.direction(5);
    expect(d.pUp).toBeGreaterThan(0);
  });
});
