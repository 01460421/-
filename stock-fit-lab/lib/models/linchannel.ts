/**
 * 線性回歸通道 + RLS 線上更新
 *
 *   ŷ(τ) = a + bτ ,   通道：ŷ(τ) ± k·σ_e ,  σ_e = √(Σw e² / (Σw − 2))
 *
 * 兩種帶狀輸出（用途不同，刻意分開）：
 *  1. channel(h)：技術分析慣用的「回歸線 ± k 倍殘差標準差」，k 由使用者調整（預設 2），僅供顯示；
 *  2. predict(h, level)：統計預測區間 ŷ₀ ± z_{level}·σ_e√(1 + x₀ᵀ(XᵀWX)⁻¹x₀)，
 *     其覆蓋率可與 level 比較（覆蓋率指標使用此區間）。
 * 價格空間：priceMode = 'log' 時在 ln y 上回歸（通道為等比例寬度）。
 */
import type { Forecast, ParamSpec } from '../types';
import { BaseModel } from './base';
import { Rls, residualSigma, usableWeights, wls2 } from './linreg';
import type { RlsTrace } from './poly';

export interface ChannelBand {
  horizon: number;
  /** 回歸線（價格空間） */
  mean: number[];
  /** 回歸線 − kσ */
  lower: number[];
  /** 回歸線 + kσ */
  upper: number[];
  k: number;
}

export class LinearChannelModel extends BaseModel {
  readonly id = 'linchannel' as const;
  readonly version = '1.0.0';

  private a = 0;
  private b = 0;
  private r2 = 0;
  private rls: Rls | null = null;
  private nextIndex = 0;
  private insideShare = 0;

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'k', label: '通道寬度 k（倍殘差標準差）', min: 0.5, max: 4, step: 0.1, default: 2 },
      { key: 'forgetting', label: 'RLS 遺忘因子 λ_f', min: 0.9, max: 1, step: 0.005, default: 0.98 },
    ];
  }

  get k(): number {
    return Math.max(0, this.param('k', 2));
  }

  protected fitCore(): void {
    const n = this.y.length;
    const y = this.ys();
    const w = usableWeights(this.opts.weights, n);
    const r = wls2(this.axis.train, y, w);
    this.a = r.a;
    this.b = r.b;
    this.sigma = residualSigma(r.rss, r.sw, 2);
    this.fittedValues = r.fitted.map((v) => this.back(v));
    const ym = y.reduce((s, v, i) => s + (w ? w[i] : 1) * v, 0) / r.sw;
    let tss = 0;
    for (let i = 0; i < n; i++) tss += (w ? w[i] : 1) * (y[i] - ym) ** 2;
    this.r2 = tss > 0 ? 1 - r.rss / tss : 0;
    const k = this.k;
    this.insideShare = r.residuals.filter((e) => Math.abs(e) <= k * this.sigma).length / n;
    this.rls = new Rls([r.a, r.b], r.cov, this.sigma, n);
    this.nextIndex = n;
  }

  update(newPoint: number): this {
    if (!this.rls) return this.fit([...this.y, newPoint], this.opts);
    if (!(newPoint > 0) || !Number.isFinite(newPoint)) throw new Error('linchannel: 價格必須為正有限數');
    const lf = this.param('forgetting', 0.98);
    const tau = this.axis.tau(this.nextIndex);
    const yv = this.priceMode === 'log' ? Math.log(newPoint) : newPoint;
    this.rls.update([1, tau], yv, lf);
    [this.a, this.b] = this.rls.coef;
    this.sigma = this.rls.sigma;
    this.y.push(newPoint);
    this.fittedValues.push(this.back(this.a + this.b * tau));
    this.nextIndex++;
    return this;
  }

  getRlsTrace(): RlsTrace[] {
    return this.rls ? this.rls.trace.slice() : [];
  }

  protected predictCore(h: number, level: number): Forecast {
    const mean: number[] = [];
    const sd: number[] = [];
    for (let i = 1; i <= h; i++) {
      const tau = this.axis.tau(this.nextIndex - 1 + i);
      mean.push(this.a + this.b * tau);
      sd.push(this.sigma * Math.sqrt(1 + (this.rls ? this.rls.leverage([1, tau]) : 0)));
    }
    return this.makeForecast(mean, sd, level);
  }

  /** 未來 h 期的 ±kσ 通道（顯示用，不含參數不確定性） */
  channel(h: number, k = this.k): ChannelBand {
    const H = Math.max(1, Math.floor(h));
    const mean: number[] = [];
    const lower: number[] = [];
    const upper: number[] = [];
    for (let i = 1; i <= H; i++) {
      const m = this.a + this.b * this.axis.tau(this.nextIndex - 1 + i);
      mean.push(this.back(m));
      lower.push(this.back(m - k * this.sigma));
      upper.push(this.back(m + k * this.sigma));
    }
    return { horizon: H, mean, lower, upper, k };
  }

  /** 樣本內（訓練視窗）的 ±kσ 通道，長度同 y */
  channelFitted(k = this.k): { mean: number[]; lower: number[]; upper: number[]; k: number } {
    const mean: number[] = [];
    const lower: number[] = [];
    const upper: number[] = [];
    for (let i = 0; i < this.y.length; i++) {
      const m = this.a + this.b * this.axis.tau(i);
      mean.push(this.back(m));
      lower.push(this.back(m - k * this.sigma));
      upper.push(this.back(m + k * this.sigma));
    }
    return { mean, lower, upper, k };
  }

  protected describeCore() {
    const k = this.k;
    return {
      name: '線性回歸通道',
      formulaLatex: '\\hat y=a+b\\tau,\\qquad \\text{通道}=\\hat y\\pm k\\,\\sigma_e',
      params: { a: this.a, b: this.b, k, sigma: this.sigma },
      paramSpecs: this.paramSpecs(),
      useCases: '判斷價格在趨勢中的相對位置（靠近上緣／下緣）；趨勢明確的盤整上升或下降段。',
      failureModes:
        '趨勢轉折時通道失效且落後；殘差有自相關時 σ_e 低估真實波動；±kσ 通道不是預測區間，不能直接當作機率。',
      derivation:
        '以加權最小平方求回歸線 $\\hat y=a+b\\tau$，殘差標準差 $\\sigma_e=\\sqrt{\\sum w e^2/(\\sum w-2)}$。' +
        `顯示通道為 $\\hat y\\pm k\\sigma_e$（目前 $k=${k}$）；` +
        '預測區間另以 $\\hat y_0\\pm z_{\\alpha}\\sigma_e\\sqrt{1+x_0^\\top(X^\\top WX)^{-1}x_0}$ 計算，供覆蓋率評估。線上更新採 RLS。',
      diagnostics: {
        k,
        r2: this.r2,
        insideChannelShare: this.insideShare,
        rlsSteps: this.rls ? this.rls.trace.length : 0,
      },
    };
  }
}
