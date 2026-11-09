/**
 * 多項式最小平方擬合 + 遞迴最小平方（RLS）線上更新
 *
 *   P_n(τ) = Σ_{k=0}^{n} a_k τ^k ,   τ ∈ [−1, 1]
 *
 * 求解：加權 Householder QR（條件數 > 1e12 時降級為 SVD 截斷偽逆）。
 * 次數選擇：degree = 0 代表自動，以 BIC 在 1–6 中選最小者（同時回報 AIC）。
 * 預測區間：Var(ŷ₀) = s²(1 + x₀ᵀ(XᵀWX)⁻¹x₀)，外推越遠 x₀ 越大 → 區間自然變寬。
 *
 * RLS（遺忘因子 λ_f）：
 *   k_t = P_{t−1} x_t / (λ_f + x_tᵀ P_{t−1} x_t)
 *   θ_t = θ_{t−1} + k_t (y_t − x_tᵀ θ_{t−1})
 *   P_t = (P_{t−1} − k_t x_tᵀ P_{t−1}) / λ_f
 */
import type { Forecast, ParamSpec } from '../types';
import { BaseModel, informationCriteria } from './base';
import { lstsq, matvec, dot, outer } from '../math/linalg';

export interface RlsTrace {
  step: number;
  gain: number[];
  innovation: number;
  forgetting: number;
}

export class PolynomialModel extends BaseModel {
  readonly id = 'poly' as const;
  readonly version = '1.1.0';

  private coef: number[] = [];
  private degree = 3;
  private cov: number[][] = [];
  private cond = 1;
  private method: 'qr' | 'svd' = 'qr';
  private ic: { degree: number; aic: number; bic: number }[] = [];
  /** RLS 狀態 */
  private P: number[][] = [];
  private nextIndex = 0;
  private rlsTrace: RlsTrace[] = [];

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'degree', label: '多項式次數 n（0 = BIC 自動）', min: 0, max: 6, step: 1, default: 0, auto: true },
      { key: 'forgetting', label: 'RLS 遺忘因子 λ_f', min: 0.9, max: 1, step: 0.005, default: 0.98 },
    ];
  }

  private design(taus: number[], deg: number): number[][] {
    return taus.map((t) => Array.from({ length: deg + 1 }, (_, k) => Math.pow(t, k)));
  }

  protected fitCore(): void {
    const y = this.ys();
    const n = y.length;
    const w = this.opts.weights;
    const requested = Math.round(this.param('degree', 0));
    const maxDeg = Math.min(6, n - 2);
    this.ic = [];
    let best: { deg: number; res: ReturnType<typeof lstsq> } | null = null;
    let bestBic = Infinity;
    for (let d = 1; d <= maxDeg; d++) {
      const res = lstsq(this.design(this.axis.train, d), y, w);
      const { aic, bic } = informationCriteria(res.rss, n, d + 2);
      this.ic.push({ degree: d, aic, bic });
      if (requested === 0 && bic < bestBic) {
        bestBic = bic;
        best = { deg: d, res };
      }
      if (requested === d) best = { deg: d, res };
    }
    if (!best) best = { deg: maxDeg, res: lstsq(this.design(this.axis.train, maxDeg), y, w) };
    this.degree = best.deg;
    this.coef = best.res.coef;
    this.cov = best.res.covUnscaled;
    this.cond = best.res.cond;
    this.method = best.res.method;
    if (best.res.method === 'svd') this.degraded = `條件數 ${best.res.cond.toExponential(2)} 過大，改用 SVD 截斷偽逆`;
    const sw = w ? w.reduce((a, b) => a + b, 0) : n;
    this.sigma = Math.sqrt(best.res.rss / Math.max(sw - (this.degree + 1), 1));
    this.fittedValues = best.res.fitted.map((v) => this.back(v));
    // RLS 初始化：P = σ²-free (XᵀWX)⁻¹
    this.P = this.cov.map((r) => r.slice());
    this.nextIndex = n;
    this.rlsTrace = [];
  }

  /** RLS 線上更新：不重算整個矩陣 */
  update(newPoint: number): this {
    const lf = this.param('forgetting', 0.98);
    const yv = this.priceMode === 'log' ? Math.log(newPoint) : newPoint;
    const tau = this.axis.tau(this.nextIndex);
    const x = Array.from({ length: this.degree + 1 }, (_, k) => Math.pow(tau, k));
    const Px = matvec(this.P, x);
    const denom = lf + dot(x, Px);
    const k = Px.map((v) => v / denom);
    const innovation = yv - dot(x, this.coef);
    this.coef = this.coef.map((c, i) => c + k[i] * innovation);
    const kxP = outer(k, Px);
    this.P = this.P.map((row, i) => row.map((v, j) => (v - kxP[i][j]) / lf));
    // σ 以指數平滑更新
    this.sigma = Math.sqrt(lf * this.sigma * this.sigma + (1 - lf) * innovation * innovation);
    this.y.push(newPoint);
    this.fittedValues.push(this.back(dot(x, this.coef)));
    this.nextIndex++;
    this.rlsTrace.push({ step: this.nextIndex, gain: k, innovation, forgetting: lf });
    if (this.rlsTrace.length > 500) this.rlsTrace.shift();
    return this;
  }

  getRlsTrace(): RlsTrace[] {
    return this.rlsTrace.slice();
  }

  protected predictCore(h: number, level: number): Forecast {
    const taus = Array.from({ length: h }, (_, i) => this.axis.tau(this.nextIndex - 1 + i + 1));
    const X = this.design(taus, this.degree);
    const mean = X.map((x) => dot(x, this.coef));
    const sd = X.map((x) => this.sigma * Math.sqrt(1 + Math.max(dot(x, matvec(this.P, x)), 0)));
    return this.makeForecast(mean, sd, level);
  }

  protected describeCore() {
    return {
      name: '多項式最小平方擬合',
      formulaLatex: 'P_n(t)=\\sum_{k=0}^{n} a_k t^k',
      params: { degree: this.degree, coef: this.coef },
      paramSpecs: this.paramSpecs(),
      useCases: '描述一段期間內平滑的趨勢彎曲（加速、減速、反轉）；短期外推。',
      failureModes: '高次多項式外推時會劇烈發散（Runge 現象）；趨勢突然反轉時落後；不具任何經濟意義。',
      derivation:
        '令設計矩陣 $X_{ik}=\\tau_i^k$，求 $\\min_a \\|W^{1/2}(y-Xa)\\|^2$。以 Householder QR 分解 $W^{1/2}X=QR$，解 $Ra=Q^\\top W^{1/2}y$，' +
        '避免正規方程式 $X^\\top X$ 使條件數平方化。次數以 $\\mathrm{BIC}=k\\ln n-2\\ln\\hat L$ 選擇。' +
        '線上更新採 RLS：$k_t=\\frac{P_{t-1}x_t}{\\lambda+x_t^\\top P_{t-1}x_t}$，$\\theta_t=\\theta_{t-1}+k_t e_t$。',
      diagnostics: {
        degree: this.degree,
        conditionNumber: this.cond,
        solver: this.method,
        aic: this.ic.map((r) => r.aic),
        bic: this.ic.map((r) => r.bic),
        rlsSteps: this.rlsTrace.length,
        lastGainNorm: this.rlsTrace.length ? Math.hypot(...this.rlsTrace[this.rlsTrace.length - 1].gain) : 0,
      },
    };
  }
}
