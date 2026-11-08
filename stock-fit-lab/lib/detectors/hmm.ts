/**
 * 二狀態高斯隱藏馬可夫模型（報酬率的高 / 低波動 regime）。
 *  - Baum–Welch（縮放 forward–backward）估計 π、A、μ_k、σ_k
 *  - Viterbi 求最可能狀態路徑
 * 估計後依 σ 由小到大排序：狀態 0 = 低波動、狀態 1 = 高波動。
 */

export interface HmmOptions {
  maxIter?: number;
  tol?: number;
  /** 初始自我轉移機率 */
  stay?: number;
}

export interface HmmResult {
  pi: number[];
  A: number[][];
  mu: number[];
  sigma: number[];
  /** 每期各狀態的後驗機率 γ_t(k) */
  gamma: number[][];
  /** P(高波動 | 全部資料) */
  pHigh: number[];
  viterbi: number[];
  logLik: number;
  iterations: number;
  converged: boolean;
}

const LOG2PI = Math.log(2 * Math.PI);

function logNorm(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return -0.5 * (LOG2PI + z * z) - Math.log(sigma);
}

export function fitHmm(x: number[], opts: HmmOptions = {}): HmmResult {
  const T = x.length;
  const K = 2;
  const maxIter = opts.maxIter ?? 200;
  const tol = opts.tol ?? 1e-6;
  if (T < 4) throw new Error('fitHmm: 資料太短');
  const overallSd = Math.sqrt(x.reduce((a, b) => a + b * b, 0) / T - (x.reduce((a, b) => a + b, 0) / T) ** 2) || 1;
  const floor = overallSd * 1e-3;
  // 初始化：|x| 中位數以下為低波動
  const absSorted = x.map(Math.abs).sort((a, b) => a - b);
  const cut = absSorted[Math.floor(T / 2)];
  const lo = x.filter((v) => Math.abs(v) <= cut);
  const hi = x.filter((v) => Math.abs(v) > cut);
  const m = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const sd = (a: number[], mm: number) => Math.max(floor, Math.sqrt(a.length ? a.reduce((s, v) => s + (v - mm) ** 2, 0) / a.length : overallSd ** 2));
  let mu = [m(lo), m(hi.length ? hi : x)];
  let sigma = [sd(lo, mu[0]), Math.max(sd(hi.length ? hi : x, mu[1]), sd(lo, mu[0]) * 1.5)];
  const stay = opts.stay ?? 0.95;
  let A = [
    [stay, 1 - stay],
    [1 - stay, stay],
  ];
  let pi = [0.5, 0.5];

  let gamma: number[][] = [];
  let logLik = -Infinity;
  let iterations = 0;
  let converged = false;
  const B = Array.from({ length: T }, () => new Array<number>(K).fill(0));
  for (let it = 0; it < maxIter; it++) {
    iterations = it + 1;
    // emission（以每期最大值縮放避免下溢）
    const emitScale = new Array<number>(T);
    for (let t = 0; t < T; t++) {
      const l0 = logNorm(x[t], mu[0], sigma[0]);
      const l1 = logNorm(x[t], mu[1], sigma[1]);
      const mx = Math.max(l0, l1);
      emitScale[t] = mx;
      B[t][0] = Math.exp(l0 - mx);
      B[t][1] = Math.exp(l1 - mx);
    }
    // forward
    const alpha = Array.from({ length: T }, () => new Array<number>(K).fill(0));
    const c = new Array<number>(T).fill(0);
    for (let k = 0; k < K; k++) alpha[0][k] = pi[k] * B[0][k];
    c[0] = alpha[0][0] + alpha[0][1] || 1e-300;
    alpha[0][0] /= c[0];
    alpha[0][1] /= c[0];
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < K; j++) alpha[t][j] = (alpha[t - 1][0] * A[0][j] + alpha[t - 1][1] * A[1][j]) * B[t][j];
      c[t] = alpha[t][0] + alpha[t][1] || 1e-300;
      alpha[t][0] /= c[t];
      alpha[t][1] /= c[t];
    }
    // backward
    const beta = Array.from({ length: T }, () => new Array<number>(K).fill(1));
    for (let t = T - 2; t >= 0; t--) {
      for (let i = 0; i < K; i++) beta[t][i] = (A[i][0] * B[t + 1][0] * beta[t + 1][0] + A[i][1] * B[t + 1][1] * beta[t + 1][1]) / c[t + 1];
    }
    let ll = 0;
    for (let t = 0; t < T; t++) ll += Math.log(c[t]) + emitScale[t];
    gamma = alpha.map((a, t) => {
      const g0 = a[0] * beta[t][0];
      const g1 = a[1] * beta[t][1];
      const s = g0 + g1 || 1e-300;
      return [g0 / s, g1 / s];
    });
    // M-step
    const xiSum = [
      [0, 0],
      [0, 0],
    ];
    for (let t = 0; t < T - 1; t++) {
      let s = 0;
      const xi = [
        [0, 0],
        [0, 0],
      ];
      for (let i = 0; i < K; i++)
        for (let j = 0; j < K; j++) {
          xi[i][j] = alpha[t][i] * A[i][j] * B[t + 1][j] * beta[t + 1][j];
          s += xi[i][j];
        }
      s = s || 1e-300;
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) xiSum[i][j] += xi[i][j] / s;
    }
    const newA = [0, 1].map((i) => {
      const row = xiSum[i][0] + xiSum[i][1] || 1e-300;
      return [xiSum[i][0] / row, xiSum[i][1] / row].map((v) => Math.min(1 - 1e-6, Math.max(1e-6, v)));
    });
    for (const row of newA) {
      const s = row[0] + row[1];
      row[0] /= s;
      row[1] /= s;
    }
    const newMu = [0, 0];
    const newSigma = [0, 0];
    for (let k = 0; k < K; k++) {
      let w = 0;
      let sx = 0;
      for (let t = 0; t < T; t++) {
        w += gamma[t][k];
        sx += gamma[t][k] * x[t];
      }
      newMu[k] = w > 1e-12 ? sx / w : mu[k];
      let sv = 0;
      for (let t = 0; t < T; t++) sv += gamma[t][k] * (x[t] - newMu[k]) ** 2;
      newSigma[k] = Math.max(floor, w > 1e-12 ? Math.sqrt(sv / w) : sigma[k]);
    }
    A = newA;
    mu = newMu;
    sigma = newSigma;
    pi = [Math.max(1e-6, gamma[0][0]), Math.max(1e-6, gamma[0][1])];
    const ps = pi[0] + pi[1];
    pi = [pi[0] / ps, pi[1] / ps];
    if (Math.abs(ll - logLik) < tol * Math.max(1, Math.abs(ll))) {
      logLik = ll;
      converged = true;
      break;
    }
    logLik = ll;
  }
  // 狀態排序：0 = 低波動
  if (sigma[0] > sigma[1]) {
    mu = [mu[1], mu[0]];
    sigma = [sigma[1], sigma[0]];
    pi = [pi[1], pi[0]];
    A = [
      [A[1][1], A[1][0]],
      [A[0][1], A[0][0]],
    ];
    gamma = gamma.map((g) => [g[1], g[0]]);
  }
  const viterbi = viterbiPath(x, pi, A, mu, sigma);
  return { pi, A, mu, sigma, gamma, pHigh: gamma.map((g) => g[1]), viterbi, logLik, iterations, converged };
}

export function viterbiPath(x: number[], pi: number[], A: number[][], mu: number[], sigma: number[]): number[] {
  const T = x.length;
  const K = pi.length;
  const logA = A.map((r) => r.map((v) => Math.log(Math.max(v, 1e-300))));
  let delta = pi.map((p, k) => Math.log(Math.max(p, 1e-300)) + logNorm(x[0], mu[k], sigma[k]));
  const psi: number[][] = [new Array(K).fill(0)];
  for (let t = 1; t < T; t++) {
    const nd = new Array<number>(K);
    const ps = new Array<number>(K);
    for (let j = 0; j < K; j++) {
      let best = -Infinity;
      let arg = 0;
      for (let i = 0; i < K; i++) {
        const v = delta[i] + logA[i][j];
        if (v > best) {
          best = v;
          arg = i;
        }
      }
      nd[j] = best + logNorm(x[t], mu[j], sigma[j]);
      ps[j] = arg;
    }
    delta = nd;
    psi.push(ps);
  }
  const path = new Array<number>(T);
  path[T - 1] = delta.indexOf(Math.max(...delta));
  for (let t = T - 1; t > 0; t--) path[t - 1] = psi[t][path[t]];
  return path;
}
