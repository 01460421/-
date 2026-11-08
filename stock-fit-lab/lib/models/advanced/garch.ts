/**
 * GARCH(1,1)：波動率聚集模型，條件變異數預測直接決定信賴區間寬度（取代固定 σ）。
 *
 *   r_t = 100\ln(P_t/P_{t-1}) = \mu + \varepsilon_t,\quad \varepsilon_t = \sigma_t z_t,\ z_t\sim N(0,1)
 *   \sigma_t^2 = \omega + \alpha\,\varepsilon_{t-1}^2 + \beta\,\sigma_{t-1}^2
 *   限制：ω > 0，α, β ≥ 0，α + β < 1（共變異數平穩）
 *
 * 估計：高斯對數概似最大化
 *   \ell(\theta) = -\tfrac12\sum_t\big[\ln 2\pi + \ln\sigma_t^2 + \varepsilon_t^2/\sigma_t^2\big]
 * 以 Nelder–Mead 在無約束空間求解，參數化保證限制成立：
 *   ω = e^{θ_0}，持續性 p = 0.9999·logistic(θ_1)，α = p·logistic(θ_2)，β = p − α，μ = θ_3。
 *
 * 多步變異數預測（\bar\sigma^2 = ω/(1−α−β) 為長期變異數）：
 *   E[\sigma^2_{T+k}] = \bar\sigma^2 + (\alpha+\beta)^{k-1}(\sigma^2_{T+1} - \bar\sigma^2)
 * 累積 k 期對數報酬變異數 = Σ_{j≤k} E[σ²_{T+j}] → 價格區間 P_T·exp(kμ ± z√Σσ²)。
 *
 * 不使用 priceMode（報酬模型本身即在對數空間）；不支援觀測權重（diagnostics.weighted = false）。
 */
import type { DirectionOutput, Forecast, ParamSpec } from '../../types';
import { BaseModel } from '../base';
import { nelderMead, toUnit, fromUnit } from '../../math/optim';
import { mean, variance, ljungBox } from '../../math/stats';
import { pctLogReturns, cumulativeReturnForecast, cumulativePUp, signalOf } from './common';

export interface GarchParams {
  mu: number;
  omega: number;
  alpha: number;
  beta: number;
}

/** 給定參數，計算條件變異數序列與負對數概似 */
export function garchFilter(r: number[], p: GarchParams): { sigma2: number[]; nll: number } {
  const n = r.length;
  const s2 = new Array<number>(n);
  const v0 = variance(r, 0) || 1e-4;
  s2[0] = v0;
  let nll = 0;
  for (let t = 0; t < n; t++) {
    if (t > 0) {
      const e = r[t - 1] - p.mu;
      s2[t] = p.omega + p.alpha * e * e + p.beta * s2[t - 1];
    }
    const st = Math.max(s2[t], 1e-12);
    const e = r[t] - p.mu;
    nll += 0.5 * (Math.log(2 * Math.PI) + Math.log(st) + (e * e) / st);
  }
  return { sigma2: s2, nll };
}

function unpack(x: number[]): GarchParams {
  const omega = Math.exp(x[0]);
  const pers = 0.9999 * toUnit(x[1]);
  const alpha = pers * toUnit(x[2]);
  return { omega, alpha, beta: pers - alpha, mu: x[3] };
}

/** 以 MLE 估計 GARCH(1,1)。多起點避免局部極小。 */
export function fitGarch(r: number[]): { params: GarchParams; nll: number; converged: boolean } {
  const v = variance(r, 0) || 1e-4;
  const mu0 = mean(r);
  let best: { x: number[]; fx: number } | null = null;
  const starts: [number, number][] = [
    [0.9, 0.1],
    [0.97, 0.06],
    [0.5, 0.3],
  ];
  for (const [pers, share] of starts) {
    const omega0 = Math.max(v * (1 - pers), 1e-8);
    const x0 = [Math.log(omega0), fromUnit(pers / 0.9999), fromUnit(share), mu0];
    const res = nelderMead((x) => garchFilter(r, unpack(x)).nll, x0, { maxIter: 1500, tol: 1e-10, step: [0.5, 0.5, 0.5, 0.05 * Math.sqrt(v)] });
    // 以最佳點再重啟一次（Nelder–Mead 常見的提早收縮）
    const res2 = nelderMead((x) => garchFilter(r, unpack(x)).nll, res.x, { maxIter: 1500, tol: 1e-12, step: [0.2, 0.2, 0.2, 0.02 * Math.sqrt(v)] });
    const cand = res2.fx <= res.fx ? res2 : res;
    if (!best || cand.fx < best.fx) best = { x: cand.x, fx: cand.fx };
  }
  const params = unpack(best!.x);
  return { params, nll: best!.fx, converged: Number.isFinite(best!.fx) && best!.fx < 1e299 };
}

/** k = 1..h 的條件變異數預測路徑 */
export function garchVariancePath(p: GarchParams, sigma2Next: number, h: number): number[] {
  const pers = p.alpha + p.beta;
  const lr = pers < 1 ? p.omega / (1 - pers) : sigma2Next;
  return Array.from({ length: h }, (_, k) => lr + Math.pow(pers, k) * (sigma2Next - lr));
}

export class GarchModel extends BaseModel {
  readonly id = 'garch' as const;
  readonly version = '1.0.0';

  private r: number[] = [];
  private p: GarchParams = { mu: 0, omega: 1, alpha: 0.05, beta: 0.9 };
  private sigma2: number[] = [];
  private sigma2Next = 1;
  private nll = 0;
  private updatesSinceFit = 0;

  paramSpecs(): ParamSpec[] {
    return [
      {
        key: 'refitEvery',
        label: '線上更新幾筆後重新估計參數',
        min: 1,
        max: 250,
        step: 1,
        default: 20,
        help: '兩次重估之間，update() 只以固定參數推進條件變異數遞迴（σ²_t 即時修正）。',
      },
      { key: 'zeroMean', label: '強制 μ = 0（1 = 是）', min: 0, max: 1, step: 1, default: 0 },
    ];
  }

  protected fitCore(): void {
    this.r = pctLogReturns(this.y);
    this.updatesSinceFit = 0;
    if (this.r.length < 30) {
      // 資料不足：降級為常數變異數
      const v = this.r.length > 1 ? variance(this.r, 1) : 1;
      this.p = { mu: this.r.length ? mean(this.r) : 0, omega: v, alpha: 0, beta: 0 };
      this.degraded = '報酬樣本 < 30，GARCH 無法可靠估計，降級為常數變異數';
    } else {
      const res = fitGarch(this.r);
      this.p = res.params;
      if (this.param('zeroMean', 0) === 1) this.p.mu = 0;
      if (!res.converged) this.degraded = 'GARCH 概似最佳化未收斂，結果僅供參考';
      if (this.p.alpha + this.p.beta > 0.995) this.degraded = `持續性 α+β = ${(this.p.alpha + this.p.beta).toFixed(4)} 接近 1（IGARCH 邊界），長期變異數不穩定`;
    }
    this.refilter();
  }

  private refilter(): void {
    const f = garchFilter(this.r, this.p);
    this.sigma2 = f.sigma2;
    this.nll = f.nll;
    const n = this.r.length;
    if (n > 0) {
      const e = this.r[n - 1] - this.p.mu;
      this.sigma2Next = this.p.omega + this.p.alpha * e * e + this.p.beta * this.sigma2[n - 1];
    } else this.sigma2Next = this.p.omega;
    // 一步預測擬合值：\hat P_t = P_{t−1}·e^{μ/100}
    this.fittedValues = this.y.map((v, i) => (i === 0 ? v : this.y[i - 1] * Math.exp(this.p.mu / 100)));
    this.sigma = Math.sqrt(variance(this.r, 1) || 0) / 100;
  }

  /** 線上更新：固定參數推進 σ² 遞迴；每 refitEvery 筆重新估計。 */
  update(newPoint: number): this {
    const every = Math.max(1, Math.round(this.param('refitEvery', 20)));
    if (!(newPoint > 0) || !Number.isFinite(newPoint)) throw new Error('garch: 價格必須為正有限數');
    this.updatesSinceFit++;
    if (this.updatesSinceFit >= every) {
      return this.fit([...this.y, newPoint].slice(-this.y.length), this.opts);
    }
    const prev = this.last();
    this.y.push(newPoint);
    const rt = 100 * Math.log(newPoint / prev);
    this.sigma2.push(this.sigma2Next);
    this.r.push(rt);
    const e = rt - this.p.mu;
    const st = Math.max(this.sigma2Next, 1e-12);
    this.nll += 0.5 * (Math.log(2 * Math.PI) + Math.log(st) + (e * e) / st);
    this.sigma2Next = this.p.omega + this.p.alpha * e * e + this.p.beta * this.sigma2Next;
    this.fittedValues.push(prev * Math.exp(this.p.mu / 100));
    return this;
  }

  private paths(h: number): { mu: number[]; v: number[] } {
    return { mu: new Array<number>(h).fill(this.p.mu), v: garchVariancePath(this.p, this.sigma2Next, h) };
  }

  protected predictCore(h: number, level: number): Forecast {
    const { mu, v } = this.paths(h);
    return cumulativeReturnForecast(this.last(), mu, v, level);
  }

  direction(h: number): DirectionOutput {
    const { mu, v } = this.paths(Math.max(1, Math.floor(h)));
    const pUp = cumulativePUp(mu, v);
    return { pUp, signal: signalOf(pUp) };
  }

  /** 條件標準差序列（百分比報酬單位） */
  conditionalSigma(): number[] {
    return this.sigma2.map(Math.sqrt);
  }

  getParams(): GarchParams {
    return { ...this.p };
  }

  protected describeCore() {
    const pers = this.p.alpha + this.p.beta;
    const n = this.r.length;
    const z = this.r.map((v, i) => (v - this.p.mu) / Math.sqrt(Math.max(this.sigma2[i], 1e-12)));
    const lbSq = n > 20 ? ljungBox(z.map((v) => v * v), 10, 2) : { q: NaN, pValue: NaN, lags: 10 };
    const k = 4;
    return {
      name: 'GARCH(1,1) 條件異質變異數模型',
      formulaLatex: '\\sigma_t^2=\\omega+\\alpha\\,\\varepsilon_{t-1}^2+\\beta\\,\\sigma_{t-1}^2,\\quad r_t=\\mu+\\sigma_t z_t',
      params: { mu: this.p.mu, omega: this.p.omega, alpha: this.p.alpha, beta: this.p.beta },
      paramSpecs: this.paramSpecs(),
      useCases: '波動率聚集明顯（大波動後接大波動）的股票；需要「隨市況變寬變窄」的信賴區間；風險控管與部位調整。',
      failureModes:
        '只建模波動，不預測方向（μ 幾乎為 0，方向機率接近 0.5）；對跳空、財報等結構性事件反應落後；α+β → 1 時長期變異數發散；厚尾分布下常態概似會低估極端值。',
      derivation:
        '令 $r_t=100\\ln(P_t/P_{t-1})$、$\\varepsilon_t=r_t-\\mu$。最大化高斯對數概似 $\\ell=-\\tfrac12\\sum_t[\\ln2\\pi+\\ln\\sigma_t^2+\\varepsilon_t^2/\\sigma_t^2]$，' +
        '以 $\\omega=e^{\\theta_0}$、$\\alpha+\\beta=0.9999\\,\\mathrm{logit}^{-1}(\\theta_1)$ 參數化確保 $\\omega>0,\\ \\alpha,\\beta\\ge0,\\ \\alpha+\\beta<1$，再以 Nelder–Mead 求解（多起點）。' +
        '多步預測 $E[\\sigma^2_{T+k}]=\\bar\\sigma^2+(\\alpha+\\beta)^{k-1}(\\sigma^2_{T+1}-\\bar\\sigma^2)$，$\\bar\\sigma^2=\\omega/(1-\\alpha-\\beta)$；' +
        '價格區間 $P_T\\exp(k\\mu\\pm z\\sqrt{\\sum_{j\\le k}\\sigma^2_{T+j}})$，因此區間寬度由條件變異數路徑決定，而非固定 σ。' +
        '線上更新時參數固定、只推進 $\\sigma_t^2$ 遞迴，每 refitEvery 筆重估一次。',
      diagnostics: {
        omega: this.p.omega,
        alpha: this.p.alpha,
        beta: this.p.beta,
        mu: this.p.mu,
        persistence: pers,
        halfLife: pers > 0 && pers < 1 ? Math.log(0.5) / Math.log(pers) : Infinity,
        longRunVolPct: pers < 1 ? Math.sqrt(this.p.omega / (1 - pers)) : NaN,
        nextSigmaPct: Math.sqrt(this.sigma2Next),
        conditionalSigmaTail: this.sigma2.slice(-30).map(Math.sqrt),
        logLik: -this.nll,
        aic: 2 * k + 2 * this.nll,
        bic: k * Math.log(Math.max(n, 1)) + 2 * this.nll,
        ljungBoxSqStdResidP: lbSq.pValue,
        updatesSinceFit: this.updatesSinceFit,
        weighted: false,
      },
    };
  }
}
