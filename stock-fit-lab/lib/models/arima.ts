/**
 * ARIMA(p, d, q)，auto-arima 選階
 *
 *   φ(B)(1−B)^d y_t = c + θ(B) ε_t ,
 *   φ(B) = 1 − Σ_{i=1}^{p} φ_i B^i ,  θ(B) = 1 + Σ_{j=1}^{q} θ_j B^j ,  ε_t ~ N(0, σ²)
 *
 * 1. 差分階數 d ∈ {0,1,2}：依序做 KPSS 水準平穩檢定（虛無假設 = 平穩），
 *      η = Σ S_t² / (n² σ̂²_LR) ,  S_t = Σ_{i≤t} (x_i − x̄) ,  σ̂²_LR 為 Newey–West（Bartlett 核，l = ⌊3√n/13⌋）長期變異數；
 *    η > 0.463（5% 臨界值）就再差分一次（與 R forecast::auto.arima 相同的檢定順序）。
 * 2. 階數 p, q ∈ 0..3（p + q ≤ 5）：以 Hyndman–Khandakar 逐步搜尋（stepwise = 1，預設；= 0 時全網格 16 組）——
 *    先比較 (2,2)、(0,0)、(1,0)、(0,1)，再反覆嘗試目前最佳者的鄰居 (p±1, q±1)，直到 AICc 不再下降。
 *    逐步搜尋比全網格少比較許多候選，降低「多重比較下 AIC 過度擬合」的機率。
 *    每組 (p, q) 以條件平方和（CSS）估計，AICc 最小者勝出：
 *      e_t = x_t − Σφ_i x_{t−i} − Σθ_j e_{t−j}  （x = 差分後去均值序列，t < p 的 e_t = 0）
 *      所有候選共用同一起點 t₀ = max p，使概似可比較；
 *      AICc = −2ℓ + 2k + 2k(k+1)/(n−k−1)，ℓ = −n/2 (ln 2πσ̂² + 1)。
 *    參數化：φ、θ 以偏自相關（PACF）r_k = tanh(u_k)（MA 端為 0.97·tanh(u_k)）經 Durbin–Levinson 映射，
 *    保證平穩性與（嚴格）可逆性，Nelder–Mead 可在 u ∈ ℝ^{p+q} 上無約束搜尋。
 *    MA 根限制在單位圓內側 0.97 以外：CSS 在 MA 根逼近單位圓時起始條件的影響不會衰減，目標函數不可靠。
 *    q = 0 時 CSS 解即加權 OLS（無需迭代）；q > 0 時以 Hannan–Rissanen 兩階段回歸作為起點，
 *    Nelder–Mead 迭代上限 60 + 40(p+q) —— 500 點全網格 16 組合在數十毫秒內完成。
 * 3. 預測與區間：把 AR 多項式與差分合併 φ*(B) = φ(B)(1−B)^d，ψ 權重
 *      ψ_0 = 1 ,  ψ_j = θ_j + Σ_{i=1}^{min(j,p+d)} φ*_i ψ_{j−i}
 *      Var(e_{t+h}) = σ² Σ_{j=0}^{h−1} ψ_j²
 * 時間軸：ARIMA 以交易日為步長（差分運算子 B 作用於索引），不使用 τ。
 * 使用者可覆寫 p, d, q（−1 = 自動）。
 */
import type { Forecast, ParamSpec } from '../types';
import { BaseModel } from './base';
import { nelderMead } from '../math/optim';
import { solve } from '../math/linalg';
import { acf, pacf, ljungBox, diff } from '../math/stats';
import { usableWeights } from './linreg';

const MA_BOUND = 0.97;
const KPSS_CRIT = [0.347, 0.463, 0.574, 0.739];
const KPSS_P = [0.1, 0.05, 0.025, 0.01];

/** KPSS 水準平穩檢定 */
export function kpssTest(x: number[]): { stat: number; pValue: number; lags: number } {
  const n = x.length;
  if (n < 8) return { stat: 0, pValue: 0.1, lags: 0 };
  let m = 0;
  for (const v of x) m += v / n;
  const e = x.map((v) => v - m);
  let S = 0;
  let num = 0;
  for (let i = 0; i < n; i++) {
    S += e[i];
    num += S * S;
  }
  num /= n * n;
  const l = Math.floor((3 * Math.sqrt(n)) / 13);
  let s2 = 0;
  for (let i = 0; i < n; i++) s2 += e[i] * e[i];
  for (let k = 1; k <= l; k++) {
    let c = 0;
    for (let i = k; i < n; i++) c += e[i] * e[i - k];
    s2 += 2 * (1 - k / (l + 1)) * c;
  }
  s2 /= n;
  const stat = s2 > 1e-300 ? num / s2 : 0;
  let pValue: number;
  if (stat <= KPSS_CRIT[0]) pValue = 0.1;
  else if (stat >= KPSS_CRIT[3]) pValue = 0.01;
  else {
    let i = 0;
    while (stat > KPSS_CRIT[i + 1]) i++;
    const f = (stat - KPSS_CRIT[i]) / (KPSS_CRIT[i + 1] - KPSS_CRIT[i]);
    pValue = KPSS_P[i] + f * (KPSS_P[i + 1] - KPSS_P[i]);
  }
  return { stat, pValue, lags: l };
}

/** PACF（|r_k| < 1）→ AR 係數（Durbin–Levinson），保證平穩 */
export function pacfToAr(r: number[]): number[] {
  let phi: number[] = [];
  for (let k = 0; k < r.length; k++) {
    const next = new Array<number>(k + 1);
    for (let j = 0; j < k; j++) next[j] = phi[j] - r[k] * phi[k - 1 - j];
    next[k] = r[k];
    phi = next;
  }
  return phi;
}

/** AR 係數 → PACF（反向 Durbin–Levinson）；非平穩時截斷到 ±0.98 */
export function arToPacf(phiIn: number[]): number[] {
  const p = phiIn.length;
  const r = new Array<number>(p).fill(0);
  let phi = phiIn.slice();
  for (let k = p - 1; k >= 0; k--) {
    let rk = phi[k];
    if (!Number.isFinite(rk)) rk = 0;
    rk = Math.max(-0.98, Math.min(0.98, rk));
    r[k] = rk;
    const den = 1 - rk * rk;
    const prev = new Array<number>(k);
    for (let j = 0; j < k; j++) prev[j] = (phi[j] + rk * phi[k - 1 - j]) / den;
    phi = prev;
  }
  return r;
}

/** 加權正規方程式 OLS（小維度，加微小 ridge 防奇異） */
function ols(rows: number[][], target: number[], w?: number[]): number[] | null {
  const k = rows[0]?.length ?? 0;
  if (k === 0) return [];
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const wi = w ? w[i] : 1;
    const r = rows[i];
    for (let a = 0; a < k; a++) {
      b[a] += wi * r[a] * target[i];
      for (let c = a; c < k; c++) A[a][c] += wi * r[a] * r[c];
    }
  }
  let tr = 0;
  for (let a = 0; a < k; a++) {
    for (let c = 0; c < a; c++) A[a][c] = A[c][a];
    tr += A[a][a];
  }
  for (let a = 0; a < k; a++) A[a][a] += 1e-10 * (tr / k + 1e-300);
  const x = solve(A, b);
  return x.every(Number.isFinite) ? x : null;
}

/** CSS 殘差（t < start 的 e = 0，MA 遞迴從 start 開始） */
function cssResiduals(x: number[], phi: number[], theta: number[], start: number): Float64Array {
  const N = x.length;
  const p = phi.length;
  const q = theta.length;
  const e = new Float64Array(N);
  for (let t = start; t < N; t++) {
    let v = x[t];
    for (let i = 0; i < p; i++) v -= phi[i] * x[t - 1 - i];
    for (let j = 0; j < q; j++) if (t - 1 - j >= 0) v -= theta[j] * e[t - 1 - j];
    e[t] = v;
  }
  return e;
}

interface Candidate {
  p: number;
  q: number;
  phi: number[];
  theta: number[];
  sigma2: number;
  aic: number;
  aicc: number;
  bic: number;
  nEff: number;
}

export class ArimaModel extends BaseModel {
  readonly id = 'arima' as const;
  readonly version = '1.0.0';

  private p = 0;
  private d = 1;
  private q = 0;
  private phi: number[] = [];
  private theta: number[] = [];
  private mu = 0;
  private includeMean = true;
  /** 差分後去均值序列 x 與其殘差 e（e 包含 t < p 的截斷估計，用於預測的 MA 項） */
  private x: number[] = [];
  private e: number[] = [];
  private lastLevels: number[] = [];
  private best: Candidate | null = null;
  private search: Candidate[] = [];
  private kpssChain: { d: number; stat: number; pValue: number }[] = [];
  private diagCache: Record<string, number | number[] | string> = {};

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'p', label: 'AR 階數 p（−1 = AICc 自動）', min: -1, max: 3, step: 1, default: -1, auto: true },
      { key: 'd', label: '差分階數 d（−1 = KPSS 自動）', min: -1, max: 2, step: 1, default: -1, auto: true },
      { key: 'q', label: 'MA 階數 q（−1 = AICc 自動）', min: -1, max: 3, step: 1, default: -1, auto: true },
      { key: 'stepwise', label: '逐步搜尋（1 = Hyndman–Khandakar 逐步，0 = 全網格）', min: 0, max: 1, step: 1, default: 1 },
    ];
  }

  private fitPQ(x: number[], p: number, q: number, start: number, w: number[] | undefined, kMean: number): Candidate | null {
    const N = x.length;
    const nEff = N - start;
    if (nEff < p + q + 8) return null;
    const wt = (t: number) => (w ? w[t] : 1);
    const objectiveOf = (phi: number[], theta: number[]) => {
      const e = cssResiduals(x, phi, theta, Math.max(start, p));
      let s = 0;
      for (let t = start; t < N; t++) s += wt(t) * e[t] * e[t];
      return s;
    };

    let phi: number[] = [];
    let theta: number[] = [];
    if (q === 0) {
      if (p > 0) {
        const rows: number[][] = [];
        const tgt: number[] = [];
        const ww: number[] = [];
        for (let t = start; t < N; t++) {
          rows.push(Array.from({ length: p }, (_, i) => x[t - 1 - i]));
          tgt.push(x[t]);
          ww.push(wt(t));
        }
        const sol = ols(rows, tgt, ww);
        phi = sol ? pacfToAr(arToPacf(sol)) : new Array<number>(p).fill(0);
      }
    } else {
      // Hannan–Rissanen：長 AR 取殘差，再回歸 x_t ~ x_{t−i}, ê_{t−j}
      const mLong = Math.max(p + q + 1, Math.min(10, Math.floor(N / 8)));
      const rowsL: number[][] = [];
      const tgtL: number[] = [];
      for (let t = mLong; t < N; t++) {
        rowsL.push(Array.from({ length: mLong }, (_, i) => x[t - 1 - i]));
        tgtL.push(x[t]);
      }
      const arL = rowsL.length > mLong + 2 ? ols(rowsL, tgtL) : null;
      const eh = new Array<number>(N).fill(0);
      if (arL) {
        for (let t = mLong; t < N; t++) {
          let v = x[t];
          for (let i = 0; i < mLong; i++) v -= arL[i] * x[t - 1 - i];
          eh[t] = v;
        }
      }
      const s0 = mLong + q;
      const rows: number[][] = [];
      const tgt: number[] = [];
      for (let t = s0; t < N; t++) {
        const r: number[] = [];
        for (let i = 0; i < p; i++) r.push(x[t - 1 - i]);
        for (let j = 0; j < q; j++) r.push(eh[t - 1 - j]);
        rows.push(r);
        tgt.push(x[t]);
      }
      const hr = arL && rows.length > p + q + 2 ? ols(rows, tgt) : null;
      const phi0 = hr ? hr.slice(0, p) : new Array<number>(p).fill(0);
      const th0 = hr ? hr.slice(p) : new Array<number>(q).fill(0);
      const atanh = (v: number) => 0.5 * Math.log((1 + v) / (1 - v));
      const u0 = [
        ...arToPacf(phi0).map(atanh),
        ...arToPacf(th0.map((v) => -v)).map((r) => atanh(Math.max(-0.96, Math.min(0.96, r)) / MA_BOUND)),
      ];
      const unpack = (u: number[]) => {
        const ph = pacfToAr(u.slice(0, p).map(Math.tanh));
        const th = pacfToAr(u.slice(p).map((v) => MA_BOUND * Math.tanh(v))).map((v) => -v);
        return { ph, th };
      };
      const res = nelderMead(
        (u) => {
          const { ph, th } = unpack(u);
          return objectiveOf(ph, th);
        },
        u0,
        { maxIter: 60 + 40 * (p + q), tol: 1e-7, step: u0.map(() => 0.25) },
      );
      const sol = unpack(res.x);
      phi = sol.ph;
      theta = sol.th;
    }

    const sse = objectiveOf(phi, theta);
    let W = 0;
    for (let t = start; t < N; t++) W += wt(t);
    const sigma2 = Math.max(sse / W, 1e-300);
    const n = nEff;
    const ll = -0.5 * n * (Math.log(2 * Math.PI * sigma2) + 1);
    const k = p + q + kMean + 1;
    const aic = -2 * ll + 2 * k;
    const aicc = n - k - 1 > 0 ? aic + (2 * k * (k + 1)) / (n - k - 1) : Infinity;
    const bic = -2 * ll + k * Math.log(n);
    return { p, q, phi, theta, sigma2, aic, aicc, bic, nEff: n };
  }

  protected fitCore(): void {
    const y = this.ys();
    const n = y.length;
    const wRaw = usableWeights(this.opts.weights, n);

    // 1. 差分階數
    const dUser = Math.round(this.param('d', -1));
    this.kpssChain = [];
    let d: number;
    if (dUser >= 0 && dUser <= 2) {
      d = dUser;
      const k = kpssTest(diff(y, d));
      this.kpssChain.push({ d, stat: k.stat, pValue: k.pValue });
    } else {
      d = 0;
      for (;;) {
        const k = kpssTest(diff(y, d));
        this.kpssChain.push({ d, stat: k.stat, pValue: k.pValue });
        if (k.stat <= KPSS_CRIT[1] || d >= 2 || n - d - 1 < 12) break;
        d++;
      }
    }
    d = Math.min(d, Math.max(0, n - 12));
    this.d = d;

    // 2. 差分、去均值（d ≤ 1 時含常數 / 漂移項）
    const wdiff = diff(y, d);
    const N = wdiff.length;
    // 權重對齊差分後索引並正規化為平均 1，使加權對數概似與未加權可比較
    let w: number[] | undefined;
    if (wRaw) {
      const ws = wRaw.slice(d);
      const avg = ws.reduce((a, b) => a + b, 0) / N;
      w = ws.map((v) => v / avg);
    }
    this.includeMean = d < 2;
    let mu = 0;
    if (this.includeMean) {
      let s = 0;
      let W = 0;
      for (let t = 0; t < N; t++) {
        s += (w ? w[t] : 1) * wdiff[t];
        W += w ? w[t] : 1;
      }
      mu = s / W;
    }
    this.mu = mu;
    const x = wdiff.map((v) => v - mu);
    this.x = x;
    const kMean = this.includeMean ? 1 : 0;

    // 3. 階數搜尋
    const pUser = Math.round(this.param('p', -1));
    const qUser = Math.round(this.param('q', -1));
    const pMin = pUser >= 0 ? Math.min(pUser, 3) : 0;
    const pMax = pUser >= 0 ? Math.min(pUser, 3) : 3;
    const qMin = qUser >= 0 ? Math.min(qUser, 3) : 0;
    const qMax = qUser >= 0 ? Math.min(qUser, 3) : 3;
    const maxOrder = pUser >= 0 || qUser >= 0 ? 6 : 5;
    const start = pMax; // 所有候選共用同一條件起點，概似才可比較
    this.search = [];
    const tried = new Map<string, Candidate | null>();
    const tryFit = (p: number, q: number): Candidate | null => {
      if (p < pMin || p > pMax || q < qMin || q > qMax || p + q > maxOrder) return null;
      const key = `${p},${q}`;
      if (tried.has(key)) return tried.get(key) ?? null;
      const c = this.fitPQ(x, p, q, start, w, kMean);
      tried.set(key, c);
      if (c) this.search.push(c);
      return c;
    };
    let best: Candidate | null = null;
    const better = (c: Candidate | null) => !!c && (!best || c.aicc < best.aicc - 1e-9);
    if (Math.round(this.param('stepwise', 1)) === 0) {
      for (let p = pMin; p <= pMax; p++)
        for (let q = qMin; q <= qMax; q++) {
          const c = tryFit(p, q);
          if (better(c)) best = c;
        }
    } else {
      const clampP = (v: number) => Math.min(pMax, Math.max(pMin, v));
      const clampQ = (v: number) => Math.min(qMax, Math.max(qMin, v));
      for (const [p, q] of [
        [2, 2],
        [0, 0],
        [1, 0],
        [0, 1],
      ]) {
        const c = tryFit(clampP(p), clampQ(q));
        if (better(c)) best = c;
      }
      const moves = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
      ];
      for (let iter = 0; best && iter < 40; iter++) {
        let moved = false;
        const cur: Candidate = best;
        for (const [dp, dq] of moves) {
          const c = tryFit(cur.p + dp, cur.q + dq);
          if (better(c)) {
            best = c;
            moved = true;
            break;
          }
        }
        if (!moved) break;
      }
    }
    if (!best) {
      // 資料太短：退化為隨機漫步 / 白雜訊（p = q = 0）
      best = this.fitPQ(x, 0, 0, 0, w, kMean) ?? {
        p: 0,
        q: 0,
        phi: [],
        theta: [],
        sigma2: x.reduce((s, v) => s + v * v, 0) / Math.max(N, 1),
        aic: NaN,
        aicc: NaN,
        bic: NaN,
        nEff: N,
      };
      this.degraded = '資料不足以估計任何 ARMA 階數，退化為 ARIMA(0,d,0)';
    }
    this.best = best;
    this.p = best.p;
    this.q = best.q;
    this.phi = best.phi;
    this.theta = best.theta;
    this.sigma = Math.sqrt(best.sigma2);

    // 4. 殘差（t < p 以截斷 AR 估計）與擬合值
    const e = Array.from(cssResiduals(x, this.phi, this.theta, this.p));
    for (let t = 0; t < Math.min(this.p, N); t++) {
      let v = x[t];
      for (let i = 0; i < t; i++) v -= this.phi[i] * x[t - 1 - i];
      e[t] = v;
    }
    this.e = e;
    const fitted = new Array<number>(n);
    for (let t = 0; t < n; t++) {
      if (t < d) fitted[t] = t === 0 ? y[0] : y[t - 1];
      else fitted[t] = y[t] - e[t - d];
    }
    this.fittedValues = fitted.map((v) => this.back(v));
    // 各差分層的最後一個值，用於把預測積分回原序列
    this.lastLevels = [];
    for (let j = 0; j < d; j++) {
      const dj = diff(y, j);
      this.lastLevels.push(dj[dj.length - 1]);
    }

    // 5. 診斷
    const resid = e.slice(this.p);
    const maxLag = Math.max(1, Math.min(20, Math.floor(N / 4)));
    const lb = ljungBox(resid, Math.min(10, Math.max(1, Math.floor(resid.length / 5))), this.p + this.q);
    this.diagCache = {
      order: `ARIMA(${this.p},${this.d},${this.q})`,
      p: this.p,
      d: this.d,
      q: this.q,
      aic: best.aic,
      aicc: best.aicc,
      bic: best.bic,
      kpssStat: this.kpssChain.map((k) => k.stat),
      kpssPValue: this.kpssChain.map((k) => k.pValue),
      ljungBoxQ: lb.q,
      ljungBoxPValue: lb.pValue,
      ljungBoxLags: lb.lags,
      acf: acf(resid, maxLag),
      pacf: pacf(resid, maxLag),
      acfDiff: acf(wdiff, maxLag),
      pacfDiff: pacf(wdiff, maxLag),
      orderSearch: this.search.map((c) => `(${c.p},${this.d},${c.q}) AICc=${c.aicc.toFixed(2)}`).join('; '),
      candidates: this.search.length,
    };
  }

  /** ψ 權重：φ*(B) = φ(B)(1−B)^d 的 MA(∞) 表示 */
  psiWeights(h: number): number[] {
    // c(B) = (1 − Σφ_i B^i)(1 − B)^d，φ*_i = −c_i
    let c = [1, ...this.phi.map((v) => -v)];
    for (let k = 0; k < this.d; k++) {
      const next = new Array<number>(c.length + 1).fill(0);
      for (let i = 0; i < c.length; i++) {
        next[i] += c[i];
        next[i + 1] -= c[i];
      }
      c = next;
    }
    const phiStar = c.slice(1).map((v) => -v);
    const psi = [1];
    for (let j = 1; j < h; j++) {
      let v = j <= this.theta.length ? this.theta[j - 1] : 0;
      for (let i = 1; i <= Math.min(j, phiStar.length); i++) v += phiStar[i - 1] * psi[j - i];
      psi.push(v);
    }
    return psi;
  }

  protected predictCore(h: number, level: number): Forecast {
    const xs = this.x.slice();
    const es = this.e.slice();
    const N = xs.length;
    const wf: number[] = [];
    for (let k = 0; k < h; k++) {
      const t = N + k;
      let v = 0;
      for (let i = 0; i < this.phi.length; i++) {
        const idx = t - 1 - i;
        if (idx >= 0) v += this.phi[i] * xs[idx];
      }
      for (let j = 0; j < this.theta.length; j++) {
        const idx = t - 1 - j;
        if (idx >= 0) v += this.theta[j] * es[idx];
      }
      xs.push(v);
      es.push(0);
      wf.push(v + this.mu);
    }
    // 積分 d 次回到原序列
    const levels = this.lastLevels.slice();
    const mean: number[] = [];
    for (let k = 0; k < h; k++) {
      let v = wf[k];
      for (let j = this.d - 1; j >= 0; j--) {
        levels[j] += v;
        v = levels[j];
      }
      mean.push(v);
    }
    const psi = this.psiWeights(h);
    const sd: number[] = [];
    let acc = 0;
    for (let k = 0; k < h; k++) {
      acc += psi[k] * psi[k];
      sd.push(this.sigma * Math.sqrt(acc));
    }
    return this.makeForecast(mean, sd, level);
  }

  /** 選定的階數 */
  getOrder(): { p: number; d: number; q: number } {
    return { p: this.p, d: this.d, q: this.q };
  }

  protected describeCore() {
    return {
      name: 'ARIMA 自迴歸整合移動平均',
      formulaLatex:
        '\\Big(1-\\sum_{i=1}^{p}\\phi_iB^i\\Big)(1-B)^d y_t=c+\\Big(1+\\sum_{j=1}^{q}\\theta_jB^j\\Big)\\varepsilon_t',
      params: {
        p: this.p,
        d: this.d,
        q: this.q,
        phi: this.phi,
        theta: this.theta,
        mean: this.mu,
        sigma2: this.sigma * this.sigma,
      },
      paramSpecs: this.paramSpecs(),
      useCases: '短期（1–5 日）預測、殘差有自相關結構的序列；作為隨機漫步（ARIMA(0,1,0)）以外的統計基準。',
      failureModes:
        '股價通常接近 ARIMA(0,1,0)，預測幾乎等於最後價格加漂移；長期預測收斂到趨勢線且區間快速變寬；' +
        '波動叢聚（異質變異）時區間失準；結構性改變後選階不穩。',
      derivation:
        '先以 KPSS 檢定 $\\eta=\\frac{\\sum S_t^2}{n^2\\hat\\sigma^2_{LR}}$ 決定差分次數 $d$（$\\eta>0.463$ 則再差分），' +
        '再對 $p,q\\in\\{0..3\\}$ 以條件平方和 $\\sum_t w_t e_t^2$ 估計並以 $\\mathrm{AICc}$ 選階；' +
        '係數經偏自相關 $r_k=\\tanh u_k$ 參數化以保證平穩、可逆。' +
        '預測變異數由 $\\psi$ 權重給出：$\\mathrm{Var}(e_{t+h})=\\sigma^2\\sum_{j=0}^{h-1}\\psi_j^2$，' +
        '$\\psi_j=\\theta_j+\\sum_i\\phi^*_i\\psi_{j-i}$，$\\phi^*(B)=\\phi(B)(1-B)^d$。' +
        '殘差以 Ljung–Box $Q=n(n+2)\\sum_{k=1}^{L}\\frac{\\hat\\rho_k^2}{n-k}$ 檢定是否仍有自相關。',
      diagnostics: { ...this.diagCache },
    };
  }
}
