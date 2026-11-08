/**
 * 線性類模型（指數、對數、線性通道）共用工具：
 *
 * 1. 二參數加權最小平方閉式解，模型 y = a + b·g(τ)，g 為已知轉換（τ、ln s(τ) …）：
 *      b̂ = Σw(g−ḡ)(y−ȳ) / Σw(g−ḡ)² ,   â = ȳ − b̂ ḡ
 *      (XᵀWX)⁻¹ = 1/(W·S_gg) · [[Σwg², −Σwg], [−Σwg, W]]
 *    只有兩欄且 τ 已標準化至 [−1, 1]，以中心化公式計算不會有病態問題，
 *    也省去 QR 的 m×m 正交矩陣成本（500 點時快約 100 倍）。
 *
 * 2. 遞迴最小平方（RLS，遺忘因子 λ_f），與 poly.ts 相同公式：
 *      k_t = P_{t−1} x_t / (λ_f + x_tᵀ P_{t−1} x_t)
 *      θ_t = θ_{t−1} + k_t (y_t − x_tᵀ θ_{t−1})
 *      P_t = (P_{t−1} − k_t x_tᵀ P_{t−1}) / λ_f
 */
import { dot, matvec, outer } from '../math/linalg';
import type { RlsTrace } from './poly';

export interface Wls2Result {
  a: number;
  b: number;
  /** (XᵀWX)⁻¹（未乘 σ²），X = [1, g] */
  cov: number[][];
  fitted: number[];
  residuals: number[];
  /** 加權殘差平方和 Σ w e² */
  rss: number;
  /** 權重總和（未加權時 = n） */
  sw: number;
}

/** 檢查權重是否可用：長度一致、非負有限、總和 > 0；否則回傳 undefined（視為未加權）。 */
export function usableWeights(w: number[] | undefined, n: number): number[] | undefined {
  if (!w || w.length !== n) return undefined;
  let s = 0;
  for (const v of w) {
    if (!Number.isFinite(v) || v < 0) return undefined;
    s += v;
  }
  return s > 0 ? w : undefined;
}

export function wls2(g: number[], y: number[], w?: number[]): Wls2Result {
  const n = y.length;
  let W = 0;
  let sg = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1;
    W += wi;
    sg += wi * g[i];
    sy += wi * y[i];
  }
  const gm = sg / W;
  const ym = sy / W;
  let sgg = 0;
  let sgy = 0;
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1;
    const dg = g[i] - gm;
    sgg += wi * dg * dg;
    sgy += wi * dg * (y[i] - ym);
  }
  const b = sgg > 1e-300 ? sgy / sgg : 0;
  const a = ym - b * gm;
  const fitted = g.map((gi) => a + b * gi);
  const residuals = y.map((v, i) => v - fitted[i]);
  let rss = 0;
  for (let i = 0; i < n; i++) rss += (w ? w[i] : 1) * residuals[i] * residuals[i];
  // Σwg² = S_gg + W ḡ²
  const swgg = sgg + W * gm * gm;
  const det = Math.max(W * sgg, 1e-300);
  const cov = [
    [swgg / det, -sg / det],
    [-sg / det, W / det],
  ];
  return { a, b, cov, fitted, residuals, rss, sw: W };
}

/** 殘差標準差 s = √(RSS / (Σw − p))，與 poly.ts 相同的自由度慣例 */
export function residualSigma(rss: number, sw: number, p: number): number {
  return Math.sqrt(rss / Math.max(sw - p, 1));
}

/** 一般 p 維 RLS 狀態 */
export class Rls {
  coef: number[];
  P: number[][];
  sigma: number;
  step: number;
  trace: RlsTrace[] = [];

  constructor(coef: number[], P: number[][], sigma: number, step: number) {
    this.coef = coef.slice();
    this.P = P.map((r) => r.slice());
    this.sigma = sigma;
    this.step = step;
  }

  /** 吸收一筆新觀測，回傳新息 e_t = y_t − x_tᵀθ_{t−1} */
  update(x: number[], y: number, lf: number): number {
    const Px = matvec(this.P, x);
    const denom = lf + dot(x, Px);
    const k = Px.map((v) => v / denom);
    const innovation = y - dot(x, this.coef);
    this.coef = this.coef.map((c, i) => c + k[i] * innovation);
    const kxP = outer(k, Px);
    this.P = this.P.map((row, i) => row.map((v, j) => (v - kxP[i][j]) / lf));
    // 對稱化，避免長期累積的數值不對稱
    for (let i = 0; i < this.P.length; i++)
      for (let j = 0; j < i; j++) {
        const s = 0.5 * (this.P[i][j] + this.P[j][i]);
        this.P[i][j] = s;
        this.P[j][i] = s;
      }
    // σ 以指數平滑更新（λ_f = 1 時維持批次估計值）
    this.sigma = Math.sqrt(lf * this.sigma * this.sigma + (1 - lf) * innovation * innovation);
    this.step++;
    this.trace.push({ step: this.step, gain: k, innovation, forgetting: lf });
    if (this.trace.length > 500) this.trace.shift();
    return innovation;
  }

  /** x₀ᵀ P x₀（參數不確定性對預測變異數的貢獻，未乘 σ²） */
  leverage(x: number[]): number {
    return Math.max(dot(x, matvec(this.P, x)), 0);
  }
}
