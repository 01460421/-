/**
 * Bayesian Online Change-Point Detection（Adams & MacKay, 2007）。
 *  - 常數 hazard H = 1/λ
 *  - 觀測模型：常態分布、未知平均與變異數，Normal-Gamma 共軛先驗 → Student-t 預測分布
 *  - 執行長度後驗截斷於 maxRunLength（尾端機率併入最後一格）
 * 變點判定：MAP 執行長度由 ≥ minRunBefore 驟降時，變點位置 = t − r*_t。
 */
import { logGamma, median } from '../math/stats';

export interface BocpdOptions {
  /** 平均區段長度 λ（hazard = 1/λ） */
  hazardLambda?: number;
  mu0?: number;
  kappa0?: number;
  alpha0?: number;
  beta0?: number;
  maxRunLength?: number;
  /** MAP 執行長度至少多長才算「驟降」 */
  minRunBefore?: number;
  /** 變點機率計算時視為「剛發生變化」的執行長度上限 */
  shortRun?: number;
  /** 是否先以中位數 / MAD 標準化輸入（預設 true） */
  standardize?: boolean;
}

export interface BocpdResult {
  /** 每個時間點的 MAP 執行長度 */
  mapRunLength: number[];
  /** P(r_t ≤ shortRun | x_1..t)：近期發生變化的後驗機率 */
  cpProb: number[];
  changePoints: number[];
}

function studentTLogPdf(x: number, mu: number, scale2: number, nu: number): number {
  const z = ((x - mu) * (x - mu)) / (nu * scale2);
  return logGamma((nu + 1) / 2) - logGamma(nu / 2) - 0.5 * Math.log(nu * Math.PI * scale2) - ((nu + 1) / 2) * Math.log1p(z);
}

export function bocpd(input: number[], opts: BocpdOptions = {}): BocpdResult {
  const n = input.length;
  const H = 1 / Math.max(2, opts.hazardLambda ?? 100);
  const maxR = Math.max(10, opts.maxRunLength ?? 500);
  const minRunBefore = opts.minRunBefore ?? 10;
  const shortRun = opts.shortRun ?? 5;
  let x = input;
  if (opts.standardize !== false && n > 2) {
    const med = median(input);
    const mad = median(input.map((v) => Math.abs(v - med))) * 1.4826 || 1;
    x = input.map((v) => (v - med) / mad);
  }
  const mu0 = opts.mu0 ?? 0;
  const kappa0 = opts.kappa0 ?? 1;
  const alpha0 = opts.alpha0 ?? 1;
  const beta0 = opts.beta0 ?? 1;

  let R = [1];
  let mu = [mu0];
  let kappa = [kappa0];
  let alpha = [alpha0];
  let beta = [beta0];
  const mapRunLength: number[] = [];
  const cpProb: number[] = [];
  const changePoints: number[] = [];
  let prevMap = 0;
  for (let t = 0; t < n; t++) {
    const xt = x[t];
    const len = R.length;
    const logPred = new Array<number>(len);
    for (let r = 0; r < len; r++) {
      const scale2 = (beta[r] * (kappa[r] + 1)) / (alpha[r] * kappa[r]);
      logPred[r] = Number.isFinite(xt) ? studentTLogPdf(xt, mu[r], scale2, 2 * alpha[r]) : 0;
    }
    const maxLp = Math.max(...logPred);
    const newR = new Array<number>(Math.min(len + 1, maxR + 1)).fill(0);
    let cp = 0;
    for (let r = 0; r < len; r++) {
      const p = R[r] * Math.exp(logPred[r] - maxLp);
      cp += p * H;
      const idx = Math.min(r + 1, maxR);
      newR[idx] += p * (1 - H);
    }
    newR[0] = cp;
    const z = newR.reduce((a, b) => a + b, 0) || 1;
    for (let r = 0; r < newR.length; r++) newR[r] /= z;
    // 更新充分統計量
    const nMu = [mu0];
    const nKappa = [kappa0];
    const nAlpha = [alpha0];
    const nBeta = [beta0];
    for (let r = 0; r < len; r++) {
      const idx = Math.min(r + 1, maxR);
      if (idx < r + 1) continue; // 截斷：最長的一格保留原統計量（近似）
      if (Number.isFinite(xt)) {
        nMu[idx] = (kappa[r] * mu[r] + xt) / (kappa[r] + 1);
        nKappa[idx] = kappa[r] + 1;
        nAlpha[idx] = alpha[r] + 0.5;
        nBeta[idx] = beta[r] + (kappa[r] * (xt - mu[r]) ** 2) / (2 * (kappa[r] + 1));
      } else {
        nMu[idx] = mu[r];
        nKappa[idx] = kappa[r];
        nAlpha[idx] = alpha[r];
        nBeta[idx] = beta[r];
      }
    }
    for (let r = 0; r < newR.length; r++) {
      if (nMu[r] === undefined) {
        nMu[r] = mu[Math.min(r, mu.length - 1)];
        nKappa[r] = kappa[Math.min(r, kappa.length - 1)];
        nAlpha[r] = alpha[Math.min(r, alpha.length - 1)];
        nBeta[r] = beta[Math.min(r, beta.length - 1)];
      }
    }
    R = newR;
    mu = nMu;
    kappa = nKappa;
    alpha = nAlpha;
    beta = nBeta;

    let map = 0;
    for (let r = 1; r < R.length; r++) if (R[r] > R[map]) map = r;
    mapRunLength.push(map);
    let short = 0;
    for (let r = 0; r <= Math.min(shortRun, R.length - 1); r++) short += R[r];
    cpProb.push(short);
    if (t > 0 && prevMap >= minRunBefore && map < prevMap / 2) {
      // 執行長度 r 代表最近 r 筆屬於目前區段 → 新區段起點 = t − r + 1
      const cpAt = Math.max(0, t - map + 1);
      const lastCp = changePoints[changePoints.length - 1];
      if (lastCp === undefined || cpAt - lastCp >= minRunBefore) changePoints.push(cpAt);
    }
    prevMap = map;
  }
  return { mapRunLength, cpProb, changePoints };
}
