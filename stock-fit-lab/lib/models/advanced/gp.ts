/**
 * 高斯過程回歸（GP），複合核 = RBF + 週期核 + 線性核 + 觀測雜訊。
 *
 *   k(\tau,\tau') = s_r^2\exp\!\Big(-\frac{(\tau-\tau')^2}{2\ell_r^2}\Big)
 *                 + s_p^2\exp\!\Big(-\frac{2\sin^2(\pi|\tau-\tau'|/p)}{\ell_p^2}\Big)
 *                 + s_l^2\,\tau\tau' + \sigma_n^2\,\delta_{\tau\tau'}
 *
 * τ 為標準化到 [−1, 1] 的時間；目標 y 在模型空間（raw / log）中先以視窗內平均與標準差標準化
 * （只用訓練視窗，不含未來）。
 *
 * 超參數 θ = ln(s_r, ℓ_r, s_p, ℓ_p, p, s_l, σ_n) 以最大化對數邊際概似求得：
 *   \ln p(y\mid\theta) = -\tfrac12 y^\top K^{-1}y - \sum_i \ln L_{ii} - \tfrac n2\ln 2\pi,\quad K = LL^\top
 * 在對數空間以 Nelder–Mead 搜尋（含溫和的範圍懲罰），Cholesky 來自 lib/math/linalg。
 *
 * 計算量 O(n³)：後驗只使用最近 ≤ maxPoints（預設 250）筆；超參數搜尋再均勻抽樣至 ≤ 120 筆以維持速度。
 * 後驗：
 *   \mu_* = k_*^\top K^{-1} y,\quad \sigma_*^2 = k_{**} - k_*^\top K^{-1} k_* (+\sigma_n^2 作為預測區間)
 */
import type { Forecast, ParamSpec } from '../../types';
import { BaseModel } from '../base';
import { cholesky, choleskySolve } from '../../math/linalg';
import { nelderMead } from '../../math/optim';
import { mean, std } from '../../math/stats';

export interface GpHyper {
  sr: number;
  lr: number;
  sp: number;
  lp: number;
  period: number;
  sl: number;
  sn: number;
}

export function compositeKernel(a: number, b: number, h: GpHyper): number {
  const d = a - b;
  const rbf = h.sr * h.sr * Math.exp((-d * d) / (2 * h.lr * h.lr));
  const s = Math.sin((Math.PI * Math.abs(d)) / h.period);
  const per = h.sp * h.sp * Math.exp((-2 * s * s) / (h.lp * h.lp));
  const lin = h.sl * h.sl * a * b;
  return rbf + per + lin;
}

function gram(x: number[], h: GpHyper): number[][] {
  const n = x.length;
  const K = Array.from({ length: n }, () => new Array<number>(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      const v = compositeKernel(x[i], x[j], h);
      K[i][j] = v;
      K[j][i] = v;
    }
    K[i][i] += h.sn * h.sn;
  }
  return K;
}

/** 負對數邊際概似（Cholesky 失敗回傳 +∞） */
export function negLogMarginal(x: number[], y: number[], h: GpHyper): number {
  const n = x.length;
  let L: number[][];
  try {
    L = cholesky(gram(x, h), 1e-8);
  } catch {
    return Infinity;
  }
  const alpha = choleskySolve(L, y);
  let quad = 0;
  for (let i = 0; i < n; i++) quad += y[i] * alpha[i];
  let logdet = 0;
  for (let i = 0; i < n; i++) logdet += Math.log(L[i][i]);
  return 0.5 * quad + logdet + 0.5 * n * Math.log(2 * Math.PI);
}

const KEYS: (keyof GpHyper)[] = ['sr', 'lr', 'sp', 'lp', 'period', 'sl', 'sn'];
/** 對數空間的合理範圍（超出時加二次懲罰，避免退化解） */
const BOUNDS: Record<keyof GpHyper, [number, number]> = {
  sr: [1e-3, 10],
  lr: [0.01, 5],
  sp: [1e-4, 5],
  lp: [0.1, 10],
  period: [0.04, 2],
  sl: [1e-4, 10],
  sn: [1e-3, 2],
};

const toHyper = (z: number[]): GpHyper => Object.fromEntries(KEYS.map((k, i) => [k, Math.exp(z[i])])) as unknown as GpHyper;

export function optimizeHyper(x: number[], y: number[], init: GpHyper, maxIter = 600): { hyper: GpHyper; nlml: number } {
  const penalty = (z: number[]) =>
    KEYS.reduce((s, k, i) => {
      const lo = Math.log(BOUNDS[k][0]);
      const hi = Math.log(BOUNDS[k][1]);
      const v = z[i] < lo ? lo - z[i] : z[i] > hi ? z[i] - hi : 0;
      return s + 100 * v * v;
    }, 0);
  const obj = (z: number[]) => negLogMarginal(x, y, toHyper(z)) + penalty(z);
  let best: { x: number[]; fx: number } | null = null;
  // 多個週期起點（週期核的概似面多峰）
  for (const per of [init.period, 0.25, 1.0]) {
    const z0 = KEYS.map((k) => Math.log(k === 'period' ? per : init[k]));
    const r = nelderMead(obj, z0, { maxIter, tol: 1e-8, step: new Array(7).fill(0.7) });
    if (!best || r.fx < best.fx) best = { x: r.x, fx: r.fx };
  }
  return { hyper: toHyper(best!.x), nlml: best!.fx };
}

export class GaussianProcessModel extends BaseModel {
  readonly id = 'gp' as const;
  readonly version = '1.0.0';

  private hyper: GpHyper = { sr: 1, lr: 0.3, sp: 0.3, lp: 1, period: 0.5, sl: 0.5, sn: 0.1 };
  private xs: number[] = [];
  private L: number[][] = [];
  private alpha: number[] = [];
  private yMean = 0;
  private yStd = 1;
  private nlml = 0;
  private usedPoints = 0;
  private optPoints = 0;
  private offset = 0;

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'maxPoints', label: '後驗使用的最近資料點上限', min: 50, max: 400, step: 10, default: 250, help: 'GP 為 O(n³)，超過上限時只取最近的點。' },
      { key: 'optPoints', label: '超參數搜尋的抽樣點數上限', min: 40, max: 250, step: 10, default: 120 },
      { key: 'optimize', label: '最大化邊際概似（1）/ 使用預設超參數（0）', min: 0, max: 1, step: 1, default: 1 },
    ];
  }

  protected fitCore(): void {
    const yAll = this.ys();
    const n = yAll.length;
    const maxPts = Math.max(20, Math.round(this.param('maxPoints', 250)));
    this.offset = Math.max(0, n - maxPts);
    const idx = Array.from({ length: n - this.offset }, (_, i) => this.offset + i);
    const x = idx.map((i) => this.axis.tau(i));
    const ySub = idx.map((i) => yAll[i]);
    this.yMean = mean(ySub);
    this.yStd = std(ySub) || 1;
    const yz = ySub.map((v) => (v - this.yMean) / this.yStd);

    if (this.param('optimize', 1) === 1) {
      const maxOpt = Math.max(20, Math.round(this.param('optPoints', 120)));
      const step = Math.max(1, Math.ceil(x.length / maxOpt));
      const oi: number[] = [];
      for (let i = x.length - 1; i >= 0; i -= step) oi.unshift(i);
      this.optPoints = oi.length;
      const res = optimizeHyper(oi.map((i) => x[i]), oi.map((i) => yz[i]), this.hyper);
      if (Number.isFinite(res.nlml)) this.hyper = res.hyper;
      else this.degraded = '邊際概似最佳化失敗，使用預設超參數';
    }
    this.xs = x;
    this.usedPoints = x.length;
    try {
      this.L = cholesky(gram(x, this.hyper), 1e-8);
    } catch {
      this.hyper = { ...this.hyper, sn: Math.max(this.hyper.sn, 0.3) };
      this.L = cholesky(gram(x, this.hyper), 1e-6);
      this.degraded = '核矩陣病態，已提高雜訊項 σ_n 後重算';
    }
    this.alpha = choleskySolve(this.L, yz);
    this.nlml = negLogMarginal(x, yz, this.hyper);

    // 擬合值：在全部訓練點計算後驗平均
    const postMean = Array.from({ length: n }, (_, i) => this.posteriorMean(this.axis.tau(i)));
    this.fittedValues = postMean.map((m) => this.back(m));
    const resid = yAll.map((v, i) => v - postMean[i]);
    this.sigma = std(resid.slice(this.offset)) || 0;
  }

  /** 只算後驗平均（O(m)，擬合值用） */
  posteriorMean(t: number): number {
    let mu = 0;
    for (let i = 0; i < this.xs.length; i++) mu += compositeKernel(t, this.xs[i], this.hyper) * this.alpha[i];
    return this.yMean + this.yStd * mu;
  }

  /** 後驗平均與（含雜訊的）預測變異數，回到模型空間尺度 */
  posterior(t: number): { mean: number; variance: number } {
    const m = this.xs.length;
    const ks = new Array<number>(m);
    for (let i = 0; i < m; i++) ks[i] = compositeKernel(t, this.xs[i], this.hyper);
    let mu = 0;
    for (let i = 0; i < m; i++) mu += ks[i] * this.alpha[i];
    // v = L⁻¹ k*
    const v = new Array<number>(m);
    for (let i = 0; i < m; i++) {
      let s = ks[i];
      for (let k = 0; k < i; k++) s -= this.L[i][k] * v[k];
      v[i] = s / this.L[i][i];
    }
    let vv = 0;
    for (let i = 0; i < m; i++) vv += v[i] * v[i];
    const kss = compositeKernel(t, t, this.hyper);
    const varLatent = Math.max(kss - vv, 0);
    const varPred = varLatent + this.hyper.sn * this.hyper.sn;
    return { mean: this.yMean + this.yStd * mu, variance: this.yStd * this.yStd * varPred };
  }

  protected predictCore(h: number, level: number): Forecast {
    const taus = this.axis.future(h);
    const post = taus.map((t) => this.posterior(t));
    return this.makeForecast(post.map((p) => p.mean), post.map((p) => Math.sqrt(p.variance)), level);
  }

  getHyper(): GpHyper {
    return { ...this.hyper };
  }

  protected describeCore() {
    const h = this.hyper;
    return {
      name: '高斯過程回歸（RBF + 週期 + 線性核）',
      formulaLatex:
        'k(\\tau,\\tau\')=s_r^2e^{-\\frac{(\\tau-\\tau\')^2}{2\\ell_r^2}}+s_p^2e^{-\\frac{2\\sin^2(\\pi|\\tau-\\tau\'|/p)}{\\ell_p^2}}+s_l^2\\tau\\tau\'+\\sigma_n^2\\delta',
      params: { ...h, periodBars: (h.period * (this.y.length - 1)) / 2 },
      paramSpecs: this.paramSpecs(),
      useCases: '平滑趨勢疊加近似週期的波動；需要「離資料越遠越不確定」的後驗區間；樣本不大（≤ 數百點）。',
      failureModes:
        '外推超過 RBF 長度尺度 ℓ_r 後，後驗平均回歸到線性核與週期核的部分，區間快速變寬；週期核可能擬合到偶然的週期（過擬合）；O(n³) 計算量需截斷資料。',
      derivation:
        '假設 $f\\sim\\mathcal{GP}(0,k)$、$y=f+\\varepsilon$。對數邊際概似 $\\ln p(y|\\theta)=-\\tfrac12y^\\top K^{-1}y-\\tfrac12\\ln|K|-\\tfrac n2\\ln2\\pi$，以 Cholesky $K=LL^\\top$ 計算 $\\ln|K|=2\\sum\\ln L_{ii}$。' +
        '超參數在對數空間以 Nelder–Mead 最大化（多個週期起點）。後驗 $\\mu_*=k_*^\\top K^{-1}y$、$\\sigma_*^2=k_{**}-k_*^\\top K^{-1}k_*+\\sigma_n^2$，區間 $\\mu_*\\pm z\\sigma_*$ 即後驗不確定性。' +
        '週期 $p$ 以標準化時間為單位，換算交易日 = $p(n-1)/2$。',
      diagnostics: {
        logMarginalLikelihood: -this.nlml,
        usedPoints: this.usedPoints,
        optimizationPoints: this.optPoints,
        truncatedOffset: this.offset,
        lengthScaleRbf: h.lr,
        periodBars: (h.period * (this.y.length - 1)) / 2,
        noiseStd: h.sn * this.yStd,
        weighted: false,
      },
    };
  }
}
