/**
 * 指數擬合（對數轉換後線性回歸）+ RLS 線上更新
 *
 *   y = a·e^{bτ} ,   τ ∈ [−1, 1]
 *   ⇔  ln y = ln a + b τ
 *
 * 求解：對 ln y 做加權最小平方（權重 w_i = λ^{T−i} 由引擎傳入），
 *   b̂ = Σw(τ−τ̄)(ln y − \overline{ln y}) / Σw(τ−τ̄)² ,  ln â = \overline{ln y} − b̂ τ̄
 * 預測區間在對數空間計算再取指數（因此區間不對稱、下界恆正）：
 *   Var(ln ŷ₀) = s²(1 + x₀ᵀ(XᵀWX)⁻¹x₀),  x₀ = [1, τ₀]
 * 點預測取 e^{\widehat{\ln y}}（對數常態的中位數，與 priceMode = 'log' 的其他模型一致）。
 *
 * 本模型「本質上即為對數空間模型」：priceMode 設定不影響結果（raw / log 結果相同）。
 * b 的經濟意義：每單位 τ 的連續成長率；換算為每日成長率 = b·2/(n−1)。
 */
import type { Forecast, ParamSpec } from '../types';
import { BaseModel } from './base';
import { zForLevel } from '../math/stats';
import { Rls, residualSigma, usableWeights, wls2 } from './linreg';
import type { RlsTrace } from './poly';

export class ExponentialModel extends BaseModel {
  readonly id = 'exp' as const;
  readonly version = '1.0.0';

  private lnA = 0;
  private b = 0;
  private r2 = 0;
  private rls: Rls | null = null;
  private nextIndex = 0;

  paramSpecs(): ParamSpec[] {
    return [{ key: 'forgetting', label: 'RLS 遺忘因子 λ_f', min: 0.9, max: 1, step: 0.005, default: 0.98 }];
  }

  protected fitCore(): void {
    const n = this.y.length;
    const ly = this.y.map(Math.log);
    const w = usableWeights(this.opts.weights, n);
    const r = wls2(this.axis.train, ly, w);
    this.lnA = r.a;
    this.b = r.b;
    this.sigma = residualSigma(r.rss, r.sw, 2);
    this.fittedValues = r.fitted.map(Math.exp);
    let tss = 0;
    const W = r.sw;
    const m = ly.reduce((s, v, i) => s + (w ? w[i] : 1) * v, 0) / W;
    for (let i = 0; i < n; i++) tss += (w ? w[i] : 1) * (ly[i] - m) ** 2;
    this.r2 = tss > 0 ? 1 - r.rss / tss : 0;
    this.rls = new Rls([r.a, r.b], r.cov, this.sigma, n);
    this.nextIndex = n;
  }

  /** RLS 線上更新（對數空間），不重算整個回歸 */
  update(newPoint: number): this {
    if (!this.rls) return this.fit([...this.y, newPoint], this.opts);
    if (!(newPoint > 0) || !Number.isFinite(newPoint)) throw new Error('exp: 價格必須為正有限數');
    const lf = this.param('forgetting', 0.98);
    const tau = this.axis.tau(this.nextIndex);
    const x = [1, tau];
    this.rls.update(x, Math.log(newPoint), lf);
    [this.lnA, this.b] = this.rls.coef;
    this.sigma = this.rls.sigma;
    this.y.push(newPoint);
    this.fittedValues.push(Math.exp(this.lnA + this.b * tau));
    this.nextIndex++;
    return this;
  }

  getRlsTrace(): RlsTrace[] {
    return this.rls ? this.rls.trace.slice() : [];
  }

  protected predictCore(h: number, level: number): Forecast {
    const z = zForLevel(level);
    const mean: number[] = [];
    const lower: number[] = [];
    const upper: number[] = [];
    for (let k = 1; k <= h; k++) {
      const tau = this.axis.tau(this.nextIndex - 1 + k);
      const x = [1, tau];
      const m = this.lnA + this.b * tau;
      const lev = this.rls ? this.rls.leverage(x) : 0;
      const sd = this.sigma * Math.sqrt(1 + lev);
      mean.push(Math.exp(m));
      lower.push(Math.exp(m - z * sd));
      upper.push(Math.exp(m + z * sd));
    }
    return { horizon: h, mean, lower, upper, level };
  }

  protected describeCore() {
    const n = this.axis.n;
    const dailyRate = (this.b * 2) / Math.max(n - 1, 1);
    return {
      name: '指數擬合',
      formulaLatex: 'y=a\\,e^{b\\tau}\\;\\Longleftrightarrow\\;\\ln y=\\ln a+b\\tau',
      params: { a: Math.exp(this.lnA), b: this.b, dailyGrowth: dailyRate },
      paramSpecs: this.paramSpecs(),
      useCases: '長期複利型趨勢（成長股、指數長線）；對數價格近似直線時最適用。',
      failureModes:
        '趨勢反轉或盤整時會持續外推指數成長／衰退；高檔泡沫段擬合後外推會嚴重高估；對短期波動沒有解釋力。',
      derivation:
        '取對數得 $\\ln y=\\ln a+b\\tau$，對 $\\ln y$ 做加權最小平方：' +
        '$\\hat b=\\frac{\\sum w(\\tau-\\bar\\tau)(\\ln y-\\overline{\\ln y})}{\\sum w(\\tau-\\bar\\tau)^2}$。' +
        '預測區間於對數空間 $\\ln\\hat y_0\\pm z\\,s\\sqrt{1+x_0^\\top(X^\\top WX)^{-1}x_0}$ 計算再取指數，故下界恆為正且區間不對稱。' +
        '本模型本質上就是對數價格的線性模型，priceMode 不影響結果。' +
        '線上更新採 RLS：$k_t=\\frac{P_{t-1}x_t}{\\lambda+x_t^\\top P_{t-1}x_t}$，$\\theta_t=\\theta_{t-1}+k_t e_t$。',
      diagnostics: {
        r2Log: this.r2,
        dailyGrowth: dailyRate,
        logSpaceModel: true,
        rlsSteps: this.rls ? this.rls.trace.length : 0,
      },
    };
  }
}
