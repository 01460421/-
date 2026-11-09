/**
 * 加權集成模型
 *
 *   \hat y = \sum_m w_m \hat y_m ,   w_m = \frac{\bar e_m^{-2}}{\sum_j \bar e_j^{-2}} ,
 *   \bar e_m^{(t)} = η|y_t − \hat y_{m,t}| + (1−η)\bar e_m^{(t−1)} ,  η = 0.1
 *
 * 權重「估計」（誤差 EMA、方向準確率連續低於 50% 歸零）由 lib/engine 負責，本模型只負責：
 *  - fit()：逐一擬合所有成分模型（單一成分失敗時排除並記錄於 diagnostics）；
 *  - setWeights(w)：接收外部權重，正規化到總和 1；權重為 0（或未列出）的成分排除；未設定時等權；
 *  - predict()：混合分布近似。成分 m 的 σ_m 由其區間寬度反推 σ_m = (U_m − L_m)/(2z)，
 *      μ = Σ w_m μ_m ,  σ² = Σ w_m σ_m² + Σ w_m (μ_m − μ)²
 *    （第一項 = 成分內不確定性的加權平均，第二項 = 成分之間的意見分歧），區間 μ ± zσ；
 *  - direction()：P(up) = Σ w_m P_m(up)（保留各成分自己的方向機率，例如 GBM 的模擬比例）；
 *  - update()：逐一呼叫成分的 update()（卡爾曼、RLS 類為真正線上更新，其餘內部重擬合）。
 * 成分模型的 fitted 長度可能因 update 策略不同而不一致（滾動視窗 vs 累加），一律以「序列尾端」對齊。
 */
import type { DirectionOutput, FitOptions, Forecast, ForecastModel, ParamSpec } from '../types';
import { BaseModel } from './base';
import { zForLevel, clamp } from '../math/stats';

export interface EnsembleComponent {
  id: string;
  factory: () => ForecastModel;
}

export class EnsembleModel extends BaseModel {
  readonly id = 'ensemble' as const;
  readonly version = '1.0.0';

  private readonly components: EnsembleComponent[];
  private models = new Map<string, ForecastModel>();
  private failures: Record<string, string> = {};
  private rawWeights: Record<string, number> | null = null;
  private weightFallback = false;

  constructor(components: EnsembleComponent[]) {
    super();
    const seen = new Set<string>();
    this.components = components.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }

  paramSpecs(): ParamSpec[] {
    return [];
  }

  /** 設定外部權重（可在 fit 前或後呼叫）；會正規化，權重 ≤ 0 或未列出的成分排除 */
  setWeights(w: Record<string, number>): this {
    this.rawWeights = { ...w };
    if (this.models.size) this.recomputeFitted();
    return this;
  }

  /** 正規化後的實際權重（僅含成功擬合的成分；尚未 fit 時以全部成分計算） */
  getWeights(): Record<string, number> {
    const ids = this.models.size ? [...this.models.keys()] : this.components.map((c) => c.id);
    const out: Record<string, number> = {};
    this.weightFallback = false;
    if (!ids.length) return out;
    if (!this.rawWeights) {
      for (const id of ids) out[id] = 1 / ids.length;
      return out;
    }
    let s = 0;
    for (const id of ids) {
      const v = this.rawWeights[id];
      const wv = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
      out[id] = wv;
      s += wv;
    }
    if (s <= 0) {
      // 全部為 0：退回等權並標示
      this.weightFallback = true;
      for (const id of ids) out[id] = 1 / ids.length;
      return out;
    }
    for (const id of ids) out[id] /= s;
    return out;
  }

  getComponent(id: string): ForecastModel | undefined {
    return this.models.get(id);
  }

  getComponentIds(): string[] {
    return [...this.models.keys()];
  }

  getFailures(): Record<string, string> {
    return { ...this.failures };
  }

  private active(): { id: string; model: ForecastModel; w: number }[] {
    const w = this.getWeights();
    return [...this.models.entries()].filter(([id]) => (w[id] ?? 0) > 0).map(([id, model]) => ({ id, model, w: w[id] }));
  }

  protected fitCore(): void {
    this.models = new Map();
    this.failures = {};
    // 集成自己的 params 不傳給成分；價格空間、權重、種子、外生變數共用
    const sub: FitOptions = {
      priceMode: this.opts.priceMode,
      weights: this.opts.weights,
      seed: this.opts.seed,
      exog: this.opts.exog,
    };
    for (const c of this.components) {
      try {
        const m = c.factory().fit(this.y, sub);
        const f = m.fitted();
        if (f.length !== this.y.length || f.some((v) => !Number.isFinite(v))) throw new Error('擬合值非有限');
        this.models.set(c.id, m);
      } catch (err) {
        this.failures[c.id] = err instanceof Error ? err.message : String(err);
      }
    }
    if (!this.models.size) throw new Error('ensemble: 所有成分模型擬合失敗');
    if (Object.keys(this.failures).length) this.degraded = `排除擬合失敗的成分：${Object.keys(this.failures).join(', ')}`;
    this.recomputeFitted();
  }

  private recomputeFitted(): void {
    const n = this.y.length;
    const act = this.active();
    const fitted = new Array<number>(n).fill(0);
    const wsum = new Array<number>(n).fill(0);
    const fits = act.map((a) => ({ f: a.model.fitted(), w: a.w }));
    for (let i = 0; i < n; i++) {
      for (const { f, w } of fits) {
        const j = f.length - (n - i);
        if (j < 0) continue;
        const v = f[j];
        if (!Number.isFinite(v)) continue;
        fitted[i] += w * v;
        wsum[i] += w;
      }
    }
    this.fittedValues = fitted.map((v, i) => (wsum[i] > 0 ? v / wsum[i] : this.y[i]));
    const res = this.y.map((v, i) => v - this.fittedValues[i]);
    const m = res.reduce((a, b) => a + b, 0) / Math.max(n, 1);
    this.sigma = Math.sqrt(res.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(n - 1, 1));
  }

  /** 各成分的預測（價格空間），失敗的成分略過 */
  componentForecasts(h: number, level = 0.9): Record<string, Forecast> {
    const out: Record<string, Forecast> = {};
    for (const [id, m] of this.models) {
      try {
        out[id] = m.predict(h, level);
      } catch {
        // 預測失敗的成分不納入
      }
    }
    return out;
  }

  protected predictCore(h: number, level: number): Forecast {
    const z = zForLevel(level);
    const parts: { w: number; f: Forecast }[] = [];
    for (const a of this.active()) {
      try {
        const f = a.model.predict(h, level);
        if (f.mean.every(Number.isFinite)) parts.push({ w: a.w, f });
      } catch {
        // 單一成分預測失敗時排除並重新正規化
      }
    }
    if (!parts.length) throw new Error('ensemble: 沒有可用的成分預測');
    const W = parts.reduce((s, p) => s + p.w, 0);
    const mean: number[] = [];
    const lower: number[] = [];
    const upper: number[] = [];
    for (let i = 0; i < h; i++) {
      let mu = 0;
      for (const p of parts) mu += (p.w / W) * p.f.mean[i];
      let v = 0;
      for (const p of parts) {
        const sm = Math.max((p.f.upper[i] - p.f.lower[i]) / (2 * z), 0);
        v += (p.w / W) * (sm * sm + (p.f.mean[i] - mu) ** 2);
      }
      const sd = Math.sqrt(v);
      mean.push(mu);
      lower.push(mu - z * sd);
      upper.push(mu + z * sd);
    }
    return { horizon: h, mean, lower, upper, level };
  }

  direction(h: number): DirectionOutput {
    const act = this.active();
    let p = 0;
    let W = 0;
    for (const a of act) {
      try {
        const d = a.model.direction(h);
        if (Number.isFinite(d.pUp)) {
          p += a.w * d.pUp;
          W += a.w;
        }
      } catch {
        // 略過
      }
    }
    if (W <= 0) return super.direction(h);
    const pUp = clamp(p / W, 0.001, 0.999);
    return { pUp, signal: pUp > 0.5 ? 'up' : pUp < 0.5 ? 'down' : 'neutral' };
  }

  update(newPoint: number): this {
    if (!this.models.size) throw new Error('ensemble: 尚未擬合');
    if (!(newPoint > 0) || !Number.isFinite(newPoint)) throw new Error('ensemble: 價格必須為正有限數');
    for (const [id, m] of [...this.models.entries()]) {
      try {
        m.update(newPoint);
      } catch (err) {
        this.models.delete(id);
        this.failures[id] = `update 失敗：${err instanceof Error ? err.message : String(err)}`;
      }
    }
    if (!this.models.size) throw new Error('ensemble: 所有成分模型更新失敗');
    this.y.push(newPoint);
    this.recomputeFitted();
    return this;
  }

  protected describeCore() {
    const w = this.getWeights();
    const ids = Object.keys(w);
    const params: Record<string, number | number[] | string> = {
      components: ids.join(','),
      weights: ids.map((id) => w[id]),
    };
    for (const id of ids) params[`w_${id}`] = w[id];
    return {
      name: '加權集成模型',
      formulaLatex:
        '\\hat y=\\sum_m w_m \\hat y_m,\\qquad w_m=\\frac{\\bar e_m^{-2}}{\\sum_j \\bar e_j^{-2}},\\qquad ' +
        '\\bar e_m^{(t)}=\\eta\\,|y_t-\\hat y_{m,t}|+(1-\\eta)\\,\\bar e_m^{(t-1)}',
      params,
      paramSpecs: this.paramSpecs(),
      useCases: '不確定哪個模型最好時的穩健選擇；依近期表現自動把權重移向誤差小的模型。',
      failureModes:
        '成分模型高度相關時分散效果有限；市場狀態切換時權重調整有延遲（EMA η=0.1 約 10 期記憶）；' +
        '所有成分同時失效時集成也無法倖免。',
      derivation:
        '點預測為加權平均 $\\hat y=\\sum_m w_m\\hat y_m$。權重由誤差 EMA 的負二次方正規化：' +
        '$w_m=\\frac{\\bar e_m^{-2}}{\\sum_j\\bar e_j^{-2}}$，誤差大者權重衰減快；方向準確率連續 10 期低於 50% 的模型權重暫時歸零。' +
        '區間以混合分布近似：$\\sigma^2=\\sum_m w_m\\sigma_m^2+\\sum_m w_m(\\hat y_m-\\hat y)^2$。',
      diagnostics: {
        activeComponents: this.active().length,
        fittedComponents: this.models.size,
        failed: Object.entries(this.failures)
          .map(([id, msg]) => `${id}: ${msg}`)
          .join('; '),
        weightFallbackEqual: this.weightFallback,
        weights: ids.map((id) => w[id]),
      },
    };
  }
}
