/**
 * Markov 轉換自迴歸模型 MS-AR(1)（Hamilton 1989），2 或 3 個 regime（多頭 / 盤整 / 空頭）。
 *
 *   r_t = c_{s_t} + \phi_{s_t} r_{t-1} + \sigma_{s_t}\varepsilon_t,\quad \varepsilon_t\sim N(0,1)
 *   P(s_t = j \mid s_{t-1} = i) = p_{ij}
 *
 * r_t = 100·ln(P_t/P_{t−1})。每個 regime 各有一組 (c, φ, σ)。
 *
 * 估計：EM（Baum–Welch 型）
 *   E 步：Hamilton 濾波
 *     \xi_{t|t-1} = P^\top \xi_{t-1|t-1},\quad \xi_{t|t} \propto \xi_{t|t-1}\odot\eta_t,\quad
 *     \eta_t(j) = \phi\big((r_t - c_j - \phi_j r_{t-1})/\sigma_j\big)/\sigma_j
 *   Kim 平滑：
 *     \xi_{t|T}(i) = \xi_{t|t}(i)\sum_j p_{ij}\,\xi_{t+1|T}(j)/\xi_{t+1|t}(j)
 *   M 步：p_{ij} = Σ_t ξ_{t,t+1|T}(i,j) / Σ_t ξ_{t|T}(i)；各 regime 以 ξ_{t|T}(k) 為權重做 WLS 求 (c_k, φ_k, σ_k)。
 *
 * regime 依無條件平均 μ_k = c_k / (1 − φ_k) 由小到大排序並命名：
 *   K = 3 → 空頭 / 盤整 / 多頭；K = 2 → 空頭 / 多頭。
 * 預測：以固定種子蒙地卡羅模擬未來 regime 路徑（起點分布 = 當前濾波機率 ξ_{T|T}）與報酬，
 * 取累積報酬樣本的平均與分位數作為價格預測與區間（混合分布不對稱，故不用常態近似）。
 */
import type { DirectionOutput, Forecast, ParamSpec } from '../../types';
import { BaseModel } from '../base';
import { mean, variance, quantile, clamp } from '../../math/stats';
import { mulberry32, normalGenerator } from '../../math/random';
import { pctLogReturns, signalOf } from './common';

export interface MsarFit {
  K: number;
  c: number[];
  phi: number[];
  sigma: number[];
  /** 轉移矩陣 P[i][j] = P(s_t = j | s_{t−1} = i) */
  P: number[][];
  /** 濾波機率 ξ_{t|t}（對應 r_1..r_{n−1}） */
  filtered: number[][];
  smoothed: number[][];
  /** 一步預測機率 ξ_{t|t−1} */
  predicted: number[][];
  loglik: number;
  iterations: number;
  labels: string[];
  converged: boolean;
}

const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

export function regimeLabels(K: number): string[] {
  return K === 3 ? ['空頭', '盤整', '多頭'] : K === 2 ? ['空頭', '多頭'] : Array.from({ length: K }, (_, i) => `regime ${i + 1}`);
}

/**
 * 以 EM 估計 MS-AR(1)。r 為百分比對數報酬。
 */
export function fitMsar(r: number[], K = 3, maxIter = 300, tol = 1e-7): MsarFit {
  const T = r.length - 1; // 觀測 r_1..r_{n−1}，迴歸元 r_0..r_{n−2}
  if (T < 10 * K) throw new Error(`msar: 至少需要 ${10 * K + 1} 筆報酬`);
  const yv = r.slice(1);
  const xv = r.slice(0, -1);
  const vAll = Math.max(variance(r, 0), 1e-8);
  const sFloor = 1e-3 * vAll;

  // 初始化：以分位數鋪開平均、變異數相同、φ = 0
  let c = Array.from({ length: K }, (_, k) => quantile(r, (k + 0.5) / K));
  let phi = new Array<number>(K).fill(0);
  let s2 = new Array<number>(K).fill(vAll);
  let P = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => (i === j ? 0.9 : 0.1 / (K - 1))));
  let pi0 = new Array<number>(K).fill(1 / K);

  let filt: number[][] = [];
  let pred: number[][] = [];
  let sm: number[][] = [];
  let ll = -Infinity;
  let it = 0;
  let converged = false;

  const eStep = () => {
    filt = new Array(T);
    pred = new Array(T);
    let loglik = 0;
    let prev = pi0;
    for (let t = 0; t < T; t++) {
      const pr = new Array<number>(K).fill(0);
      if (t === 0) for (let j = 0; j < K; j++) pr[j] = pi0[j];
      else for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) pr[j] += P[i][j] * prev[i];
      const logEta = new Array<number>(K);
      let mx = -Infinity;
      for (let j = 0; j < K; j++) {
        const e = yv[t] - c[j] - phi[j] * xv[t];
        logEta[j] = -LOG_SQRT_2PI - 0.5 * Math.log(s2[j]) - (0.5 * e * e) / s2[j];
        if (logEta[j] > mx) mx = logEta[j];
      }
      let tot = 0;
      const f = new Array<number>(K);
      for (let j = 0; j < K; j++) {
        f[j] = pr[j] * Math.exp(logEta[j] - mx);
        tot += f[j];
      }
      if (!(tot > 0)) {
        for (let j = 0; j < K; j++) f[j] = 1 / K;
        tot = 1;
        loglik += mx - 50;
      } else loglik += mx + Math.log(tot);
      for (let j = 0; j < K; j++) f[j] /= tot;
      pred[t] = pr;
      filt[t] = f;
      prev = f;
    }
    // Kim 平滑 + 聯合機率累積
    sm = new Array(T);
    sm[T - 1] = filt[T - 1].slice();
    const J = Array.from({ length: K }, () => new Array<number>(K).fill(0));
    for (let t = T - 2; t >= 0; t--) {
      const ratio = sm[t + 1].map((v, j) => v / Math.max(pred[t + 1][j], 1e-300));
      const s = new Array<number>(K).fill(0);
      for (let i = 0; i < K; i++) {
        for (let j = 0; j < K; j++) {
          const q = filt[t][i] * P[i][j] * ratio[j];
          s[i] += q;
          J[i][j] += q;
        }
      }
      const tot = s.reduce((a, b) => a + b, 0) || 1;
      sm[t] = s.map((v) => v / tot);
    }
    return { loglik, J };
  };

  for (it = 0; it < maxIter; it++) {
    const { loglik, J } = eStep();
    if (Math.abs(loglik - ll) < tol * (Math.abs(loglik) + 1)) {
      ll = loglik;
      converged = true;
      break;
    }
    ll = loglik;
    // M 步：轉移矩陣
    P = J.map((row) => {
      const fl = row.map((v) => Math.max(v, 1e-8));
      const s = fl.reduce((a, b) => a + b, 0);
      return fl.map((v) => v / s);
    });
    pi0 = sm[0].slice();
    // M 步：各 regime WLS（2×2 封閉解）
    const cN: number[] = [];
    const pN: number[] = [];
    const sN: number[] = [];
    for (let k = 0; k < K; k++) {
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let t = 0; t < T; t++) {
        const w = sm[t][k];
        sw += w;
        sx += w * xv[t];
        sy += w * yv[t];
        sxx += w * xv[t] * xv[t];
        sxy += w * xv[t] * yv[t];
      }
      if (sw < 1e-6) {
        cN.push(c[k]);
        pN.push(phi[k]);
        sN.push(s2[k]);
        continue;
      }
      const det = sw * sxx - sx * sx;
      let ph = Math.abs(det) > 1e-12 ? (sw * sxy - sx * sy) / det : 0;
      ph = clamp(ph, -0.95, 0.95);
      const cc = (sy - ph * sx) / sw;
      let rss = 0;
      for (let t = 0; t < T; t++) {
        const e = yv[t] - cc - ph * xv[t];
        rss += sm[t][k] * e * e;
      }
      cN.push(cc);
      pN.push(ph);
      sN.push(Math.max(rss / sw, sFloor));
    }
    c = cN;
    phi = pN;
    s2 = sN;
  }
  eStep();

  // 依無條件平均排序
  const mu = c.map((v, k) => v / (1 - phi[k]));
  const order = mu.map((m, k) => ({ m, k })).sort((a, b) => a.m - b.m).map((o) => o.k);
  const re = <T>(arr: T[]) => order.map((k) => arr[k]);
  return {
    K,
    c: re(c),
    phi: re(phi),
    sigma: re(s2).map(Math.sqrt),
    P: order.map((i) => order.map((j) => P[i][j])),
    filtered: filt.map(re),
    smoothed: sm.map(re),
    predicted: pred.map(re),
    loglik: ll,
    iterations: it,
    labels: regimeLabels(K),
    converged,
  };
}

/**
 * 給方向濾網使用：回傳當前（最後一期）各 regime 的濾波機率。
 * 只使用 prices 本身（過去資料），不含任何未來資訊。
 */
export function regimeProbabilities(prices: number[], K = 3): { labels: string[]; probs: number[] } {
  const r = pctLogReturns(prices);
  const fit = fitMsar(r, K);
  return { labels: fit.labels, probs: fit.filtered[fit.filtered.length - 1].slice() };
}

export class MsarModel extends BaseModel {
  readonly id = 'msar' as const;
  readonly version = '1.0.0';

  private r: number[] = [];
  private fitRes: MsarFit | null = null;
  private simCache: { h: number; cum: number[][] } | null = null;

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'regimes', label: 'regime 數（2 或 3）', min: 2, max: 3, step: 1, default: 3 },
      { key: 'paths', label: '蒙地卡羅路徑數', min: 500, max: 20000, step: 500, default: 4000 },
    ];
  }

  protected fitCore(): void {
    this.r = pctLogReturns(this.y);
    this.simCache = null;
    let K = Math.round(this.param('regimes', 3)) === 2 ? 2 : 3;
    if (this.r.length < 10 * K + 1 && K === 3) K = 2;
    try {
      this.fitRes = fitMsar(this.r, K);
      if (!this.fitRes.converged) this.degraded = `EM 在 ${this.fitRes.iterations} 次迭代內未完全收斂`;
    } catch (e) {
      this.fitRes = null;
      this.degraded = `MS-AR 無法估計（${(e as Error).message}），降級為單一 regime 隨機漫步`;
    }
    const f = this.fitRes;
    this.fittedValues = this.y.map((v, i) => {
      if (i < 2 || !f) return i === 0 ? v : this.y[i - 1];
      const t = i - 2; // r 索引 i−1 對應觀測 t = i−2
      const pr = f.predicted[t];
      let er = 0;
      for (let j = 0; j < f.K; j++) er += pr[j] * (f.c[j] + f.phi[j] * this.r[i - 2]);
      return this.y[i - 1] * Math.exp(er / 100);
    });
    this.sigma = Math.sqrt(variance(this.r, 1) || 0) / 100;
  }

  /** 模擬累積報酬（百分比）：cum[k][path] */
  private simulate(h: number): number[][] {
    if (this.simCache && this.simCache.h >= h) return this.simCache.cum;
    const N = Math.max(500, Math.round(this.param('paths', 4000)));
    const seed = this.opts.seed ?? 42;
    const u = mulberry32(seed + 1);
    const z = normalGenerator(seed);
    const cum = Array.from({ length: h }, () => new Array<number>(N));
    const f = this.fitRes;
    const rLast = this.r[this.r.length - 1] ?? 0;
    const sdAll = Math.sqrt(variance(this.r, 1) || 1);
    const muAll = this.r.length ? mean(this.r) : 0;
    const pick = (probs: number[]) => {
      const x = u();
      let acc = 0;
      for (let j = 0; j < probs.length; j++) {
        acc += probs[j];
        if (x < acc) return j;
      }
      return probs.length - 1;
    };
    for (let p = 0; p < N; p++) {
      let s = f ? pick(f.filtered[f.filtered.length - 1]) : 0;
      let rp = rLast;
      let c = 0;
      for (let k = 0; k < h; k++) {
        let rv: number;
        if (f) {
          s = pick(f.P[s]);
          rv = f.c[s] + f.phi[s] * rp + f.sigma[s] * z();
        } else rv = muAll + sdAll * z();
        c += rv;
        rp = rv;
        cum[k][p] = c;
      }
    }
    this.simCache = { h, cum };
    return cum;
  }

  protected predictCore(h: number, level: number): Forecast {
    const cum = this.simulate(h);
    const last = this.last();
    const a = (1 - level) / 2;
    const mean_: number[] = [];
    const lower: number[] = [];
    const upper: number[] = [];
    for (let k = 0; k < h; k++) {
      const v = cum[k];
      mean_.push(last * Math.exp(mean(v) / 100));
      lower.push(last * Math.exp(quantile(v, a) / 100));
      upper.push(last * Math.exp(quantile(v, 1 - a) / 100));
    }
    return { horizon: h, mean: mean_, lower, upper, level };
  }

  direction(h: number): DirectionOutput {
    const hh = Math.max(1, Math.floor(h));
    const v = this.simulate(hh)[hh - 1];
    const pUp = clamp(v.filter((x) => x > 0).length / v.length, 0.001, 0.999);
    return { pUp, signal: signalOf(pUp) };
  }

  /** 當前 regime 機率（濾波） */
  currentRegime(): { labels: string[]; probs: number[] } {
    const f = this.fitRes;
    if (!f) return { labels: ['單一'], probs: [1] };
    return { labels: f.labels, probs: f.filtered[f.filtered.length - 1].slice() };
  }

  /** 平滑後的 regime 機率序列（供圖表著色，含事後資訊，不可作為即時訊號） */
  smoothedProbabilities(): number[][] {
    return this.fitRes ? this.fitRes.smoothed.map((r) => r.slice()) : [];
  }

  protected describeCore() {
    const f = this.fitRes;
    const cur = this.currentRegime();
    const K = f?.K ?? 1;
    const nParams = K * 3 + K * (K - 1);
    const nObs = Math.max(this.r.length - 1, 1);
    const params: Record<string, number | number[] | string> = f
      ? {
          regimes: K,
          labels: f.labels.join(','),
          c: f.c,
          phi: f.phi,
          sigma: f.sigma,
          transition: f.P.flat(),
          unconditionalMean: f.c.map((v, k) => v / (1 - f.phi[k])),
        }
      : { regimes: 1 };
    const curIdx = cur.probs.indexOf(Math.max(...cur.probs));
    return {
      name: 'Markov 轉換自迴歸模型（MS-AR）',
      formulaLatex: 'r_t=c_{s_t}+\\phi_{s_t}r_{t-1}+\\sigma_{s_t}\\varepsilon_t,\\quad P(s_t=j\\mid s_{t-1}=i)=p_{ij}',
      params,
      paramSpecs: this.paramSpecs(),
      useCases: '市場在多頭、盤整、空頭等狀態間切換，各狀態報酬平均與波動明顯不同；作為趨勢濾網（盤整 regime 不發方向訊號）。',
      failureModes:
        'regime 數量固定且需事先指定；樣本短時 EM 易陷入局部極大或某 regime 退化；regime 切換只有在事後才會被確認（濾波機率落後）；排序依平均報酬，若兩 regime 平均接近則標籤可能互換。',
      derivation:
        'Hamilton 濾波 $\\xi_{t|t}\\propto(P^\\top\\xi_{t-1|t-1})\\odot\\eta_t$ 給出即時 regime 機率；Kim 平滑 $\\xi_{t|T}$ 與聯合機率 $\\xi_{t,t+1|T}$ 用於 EM 的 M 步：' +
        '$p_{ij}=\\sum_t\\xi_{t,t+1|T}(i,j)/\\sum_t\\xi_{t|T}(i)$，各 regime 以 $\\xi_{t|T}(k)$ 加權最小平方得 $(c_k,\\phi_k,\\sigma_k^2)$。' +
        '預測以當前 $\\xi_{T|T}$ 為起點模擬 regime 與報酬路徑，價格 $P_T\\exp(\\sum r)$ 的樣本平均與分位數即為預測與區間。' +
        '期望持續期 $E[D_k]=1/(1-p_{kk})$。',
      diagnostics: {
        regimes: K,
        regimeLabels: cur.labels.join(','),
        regimeProbs: cur.probs,
        currentRegime: cur.labels[curIdx] ?? '',
        expectedDuration: f ? f.P.map((row, k) => 1 / Math.max(1 - row[k], 1e-9)) : [],
        logLik: f?.loglik ?? NaN,
        aic: f ? 2 * nParams - 2 * f.loglik : NaN,
        bic: f ? nParams * Math.log(nObs) - 2 * f.loglik : NaN,
        emIterations: f?.iterations ?? 0,
        weighted: false,
      },
    };
  }
}
