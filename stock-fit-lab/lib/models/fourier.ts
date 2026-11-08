/**
 * 傅立葉級數擬合（線性去趨勢 + 前 m 階諧波）
 *
 *   y(τ) = a + bτ + r(τ) ,   r(τ) = \sum_{j=1}^{m}\left(b_j\cos\omega_j τ + c_j\sin\omega_j τ\right)
 *
 * 步驟：
 *  1. 加權線性回歸去趨勢，得殘差 r_i；
 *  2. 選頻（參數 freqMode）：
 *     - 0（預設）週期圖峰值：在 Fourier 頻率 ω_k = πk(n−1)/n（視窗內恰好 k 個週期，k = 1..⌊(n−1)/2⌋）
 *       計算 I(ω) = |Σ r_i e^{−iωτ_i}|²，取前 m 個局部極大，再以黃金分割在 (ω_{k−½}, ω_{k+½}) 內
 *       精修 ω 以處理非整數週期（避免頻譜洩漏造成振幅低估）；
 *     - 1 基頻諧波：ω_j = j·ω₁，ω₁ = π(n−1)/n（基本週期 = 整個視窗），即經典傅立葉級數。
 *  3. 固定 ω_j 後，以 [1, τ, cos ω_jτ, sin ω_jτ] 聯合加權最小平方求 (a, b, b_j, c_j)。
 *     由於去趨勢後的殘差與諧波近似正交，聯合解與「先去趨勢再擬合殘差」幾乎相同，
 *     但能一次得到完整的 (XᵀWX)⁻¹，預測區間 ŷ₀ ± z·s√(1 + x₀ᵀ(XᵀWX)⁻¹x₀) 才正確。
 * 週期換算：τ 間距 Δ = 2/(n−1)，週期（交易日）= 2π/(ωΔ) = π(n−1)/ω。
 * m 預設 3，上限 8（且受 2m + 2 < n − 2 限制）。
 */
import type { Forecast, ParamSpec } from '../types';
import { BaseModel } from './base';
import { lstsq, dot, matvec } from '../math/linalg';
import { usableWeights, wls2 } from './linreg';

function periodogram(r: number[], taus: number[], omega: number): number {
  let c = 0;
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    c += r[i] * Math.cos(omega * taus[i]);
    s += r[i] * Math.sin(omega * taus[i]);
  }
  return c * c + s * s;
}

/** 黃金分割求 [lo, hi] 上 f 的最大值 */
function goldenMax(f: (x: number) => number, lo: number, hi: number, iters = 30): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let x1 = b - g * (b - a);
  let x2 = a + g * (b - a);
  let f1 = f(x1);
  let f2 = f(x2);
  for (let i = 0; i < iters; i++) {
    if (f1 > f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = b - g * (b - a);
      f1 = f(x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + g * (b - a);
      f2 = f(x2);
    }
  }
  return f1 > f2 ? x1 : x2;
}

export class FourierModel extends BaseModel {
  readonly id = 'fourier' as const;
  readonly version = '1.0.0';

  private omegas: number[] = [];
  /** [a, b, b_1, c_1, …, b_m, c_m] */
  private coef: number[] = [];
  private cov: number[][] = [];
  private m = 3;
  private mode: 0 | 1 = 0;
  private trendOnlySigma = 0;

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'harmonics', label: '諧波階數 m', min: 1, max: 8, step: 1, default: 3 },
      {
        key: 'freqMode',
        label: '選頻方式（0 = 週期圖峰值，1 = 基頻諧波）',
        min: 0,
        max: 1,
        step: 1,
        default: 0,
        help: '週期圖峰值會挑選殘差中能量最大的週期；基頻諧波則固定以整個視窗為基本週期。',
      },
    ];
  }

  private row(tau: number): number[] {
    const x = [1, tau];
    for (const w of this.omegas) x.push(Math.cos(w * tau), Math.sin(w * tau));
    return x;
  }

  protected fitCore(): void {
    const y = this.ys();
    const n = y.length;
    const taus = this.axis.train;
    const w = usableWeights(this.opts.weights, n);
    const maxM = Math.max(0, Math.floor((n - 5) / 2));
    this.m = Math.max(0, Math.min(8, Math.round(this.param('harmonics', 3)), maxM));
    this.mode = Math.round(this.param('freqMode', 0)) === 1 ? 1 : 0;

    // 1. 去趨勢
    const trend = wls2(taus, y, w);
    const r = trend.residuals;
    this.trendOnlySigma = Math.sqrt(trend.rss / Math.max(trend.sw - 2, 1));

    // 2. 選頻
    const omegaK = (k: number) => (Math.PI * k * (n - 1)) / n;
    const omegas: number[] = [];
    if (this.m > 0) {
      if (this.mode === 1) {
        for (let j = 1; j <= this.m; j++) omegas.push(omegaK(j));
      } else {
        const K = Math.floor((n - 1) / 2);
        const power = new Array<number>(K + 2).fill(0);
        for (let k = 1; k <= K; k++) power[k] = periodogram(r, taus, omegaK(k));
        const ks = Array.from({ length: K }, (_, i) => i + 1);
        const isPeak = (k: number) => power[k] >= power[k - 1] && power[k] >= (k + 1 <= K ? power[k + 1] : 0);
        const peaks = ks.filter(isPeak).sort((a, b) => power[b] - power[a]);
        const rest = ks.filter((k) => !isPeak(k)).sort((a, b) => power[b] - power[a]);
        const chosen = [...peaks, ...rest].slice(0, this.m);
        for (const k of chosen) {
          const lo = omegaK(Math.max(k - 0.5, 0.5));
          const hi = omegaK(k + 0.5);
          omegas.push(goldenMax((om) => periodogram(r, taus, om), lo, hi, 24));
        }
        omegas.sort((a, b) => a - b);
      }
    }
    this.omegas = omegas;

    // 3. 聯合加權最小平方
    const X = taus.map((t) => this.row(t));
    const res = lstsq(X, y, w);
    this.coef = res.coef;
    this.cov = res.covUnscaled;
    if (res.method === 'svd') this.degraded = `諧波設計矩陣條件數 ${res.cond.toExponential(2)} 過大（頻率過於接近），改用 SVD 截斷偽逆`;
    const sw = w ? w.reduce((a, b) => a + b, 0) : n;
    this.sigma = Math.sqrt(res.rss / Math.max(sw - X[0].length, 1));
    this.fittedValues = res.fitted.map((v) => this.back(v));
  }

  protected predictCore(h: number, level: number): Forecast {
    const mean: number[] = [];
    const sd: number[] = [];
    const last = this.y.length - 1;
    for (let i = 1; i <= h; i++) {
      const x = this.row(this.axis.tau(last + i));
      mean.push(dot(x, this.coef));
      sd.push(this.sigma * Math.sqrt(1 + Math.max(dot(x, matvec(this.cov, x)), 0)));
    }
    return this.makeForecast(mean, sd, level);
  }

  /** 各諧波的角頻率（τ 單位）、週期（交易日）與振幅 √(b_j² + c_j²) */
  harmonics(): { omega: number; periodDays: number; amplitude: number; phase: number }[] {
    const n = this.axis.n;
    return this.omegas.map((om, j) => {
      const bj = this.coef[2 + 2 * j];
      const cj = this.coef[3 + 2 * j];
      return { omega: om, periodDays: (Math.PI * (n - 1)) / om, amplitude: Math.hypot(bj, cj), phase: Math.atan2(cj, bj) };
    });
  }

  protected describeCore() {
    const hs = this.harmonics();
    return {
      name: '傅立葉級數擬合',
      formulaLatex: 'y=a+b\\tau+\\sum_{j=1}^{m}\\left(b_j\\cos\\omega_j\\tau+c_j\\sin\\omega_j\\tau\\right)',
      params: {
        m: this.m,
        freqMode: this.mode === 0 ? 'periodogram' : 'fundamental',
        a: this.coef[0] ?? 0,
        b: this.coef[1] ?? 0,
        omega: this.omegas,
        periodDays: hs.map((h) => h.periodDays),
        amplitude: hs.map((h) => h.amplitude),
        cosCoef: hs.map((_, j) => this.coef[2 + 2 * j]),
        sinCoef: hs.map((_, j) => this.coef[3 + 2 * j]),
      },
      paramSpecs: this.paramSpecs(),
      useCases: '捕捉去趨勢後殘差的週期性（例如月營收公布、季節性、類週期擺盪）；判斷目前處於週期哪個相位。',
      failureModes:
        '股價週期通常不穩定，樣本內找到的週期外推時常失效；m 太大會把雜訊當週期（過度擬合）；' +
        '視窗長度改變時週期圖峰值會跳動；外推只會無限重複同一波形。',
      derivation:
        '先以加權線性回歸去趨勢得殘差 $r_i$，以週期圖 $I(\\omega)=\\left|\\sum_i r_ie^{-i\\omega\\tau_i}\\right|^2$ 於 Fourier 頻率 ' +
        '$\\omega_k=\\pi k(n-1)/n$ 找前 $m$ 個峰值並以黃金分割精修（或固定 $\\omega_j=j\\omega_1$），' +
        '再以 $[1,\\tau,\\cos\\omega_j\\tau,\\sin\\omega_j\\tau]$ 聯合最小平方求係數，' +
        '振幅 $A_j=\\sqrt{b_j^2+c_j^2}$，週期（交易日）$=\\pi(n-1)/\\omega_j$。預測區間 $\\hat y_0\\pm z\\,s\\sqrt{1+x_0^\\top(X^\\top WX)^{-1}x_0}$。',
      diagnostics: {
        harmonics: this.m,
        periodDays: hs.map((h) => h.periodDays),
        amplitude: hs.map((h) => h.amplitude),
        sigmaTrendOnly: this.trendOnlySigma,
        varianceExplainedByHarmonics:
          this.trendOnlySigma > 0 ? Math.max(0, 1 - (this.sigma * this.sigma) / (this.trendOnlySigma * this.trendOnlySigma)) : 0,
      },
    };
  }
}
