/**
 * 長記憶檢測：Hurst 指數（R/S 與 DFA）與分數差分。不是 ForecastModel，而是工具模組：
 * 規格八-6 要求「先檢測序列是否具長記憶（H > 0.55），只在有記憶時才啟用趨勢外推類模型」。
 *
 * 1) 重標極差 R/S（對報酬序列 x，切成長度 n 的區塊）：
 *      Y_k = \sum_{i\le k}(x_i-\bar x),\quad R_n = \max_k Y_k - \min_k Y_k,\quad S_n = \mathrm{sd}(x)
 *      E[R/S]_n \propto n^{H}
 *    小樣本偏誤以 Anis–Lloyd–Peters 期望值修正：
 *      E[R/S]_n = \frac{n-\frac12}{n}\,\frac{\Gamma(\frac{n-1}{2})}{\sqrt\pi\,\Gamma(\frac n2)}\sum_{i=1}^{n-1}\sqrt{\frac{n-i}{i}}
 *      H_{AL} = 0.5 + \text{slope}\big(\ln(R/S)_n - \ln E[R/S]_n \ \text{vs}\ \ln n\big)
 *
 * 2) 去趨勢波動分析 DFA-1：剖面 Y 切成長度 s 的區塊，每塊扣除線性趨勢，
 *      F(s) = \sqrt{\tfrac1N\sum (Y - \hat Y)^2} \propto s^{\alpha}，對增量序列 α ≈ H。
 *
 * 3) 分數差分（López de Prado 固定寬度視窗）：
 *      (1-B)^d x_t = \sum_{k=0}^{\infty} w_k x_{t-k},\quad w_0 = 1,\ w_k = -w_{k-1}\frac{d-k+1}{k}
 *    |w_k| < threshold 後截斷；threshold ≤ 0 時使用擴展視窗（每點用到所有過去值，輸出與輸入等長）。
 *    d < 0 時為分數積分：ARFIMA(0, d', 0) 雜訊 (1 − B)^{−d'} ε 的 Hurst 指數 H = d' + 0.5，可用來合成長記憶序列。
 */
import { logGamma, logReturns, mean } from '../../math/stats';

function slope(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den > 0 ? num / den : NaN;
}

function logSpacedSizes(minS: number, maxS: number, count: number): number[] {
  if (maxS < minS) return [];
  const out = new Set<number>();
  for (let i = 0; i < count; i++) {
    const v = Math.round(Math.exp(Math.log(minS) + ((Math.log(maxS) - Math.log(minS)) * i) / Math.max(count - 1, 1)));
    out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

/** Anis–Lloyd–Peters 期望 R/S */
export function expectedRS(n: number): number {
  let s = 0;
  for (let i = 1; i < n; i++) s += Math.sqrt((n - i) / i);
  const k = n <= 340 ? Math.exp(logGamma((n - 1) / 2) - logGamma(n / 2)) / Math.sqrt(Math.PI) : 1 / Math.sqrt((n * Math.PI) / 2);
  return ((n - 0.5) / n) * k * s;
}

function rsOfBlock(x: number[]): number {
  const n = x.length;
  const m = mean(x);
  let cum = 0;
  let mx = -Infinity;
  let mn = Infinity;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - m;
    cum += d;
    if (cum > mx) mx = cum;
    if (cum < mn) mn = cum;
    ss += d * d;
  }
  const sd = Math.sqrt(ss / n);
  return sd > 0 ? (mx - mn) / sd : NaN;
}

export interface HurstEstimate {
  H: number;
  /** log(尺度), log(統計量) 散點，供介面畫 log-log 圖 */
  points: { logN: number; logStat: number }[];
}

/** R/S 估計（raw = 未修正斜率；corrected = Anis–Lloyd–Peters 修正） */
export function hurstRS(x: number[], minN = 10): { raw: HurstEstimate; corrected: HurstEstimate } {
  const N = x.length;
  const sizes = logSpacedSizes(minN, Math.floor(N / 2), 12);
  const ln: number[] = [];
  const lrs: number[] = [];
  const ladj: number[] = [];
  for (const n of sizes) {
    const blocks = Math.floor(N / n);
    let acc = 0;
    let cnt = 0;
    for (let b = 0; b < blocks; b++) {
      // 由最新端往回切，確保最新資料被使用
      const end = N - b * n;
      const v = rsOfBlock(x.slice(end - n, end));
      if (Number.isFinite(v)) {
        acc += v;
        cnt++;
      }
    }
    if (!cnt) continue;
    const rs = acc / cnt;
    ln.push(Math.log(n));
    lrs.push(Math.log(rs));
    ladj.push(Math.log(rs) - Math.log(expectedRS(n)));
  }
  const raw = { H: ln.length >= 2 ? slope(ln, lrs) : NaN, points: ln.map((v, i) => ({ logN: v, logStat: lrs[i] })) };
  const corrected = { H: ln.length >= 2 ? 0.5 + slope(ln, ladj) : NaN, points: ln.map((v, i) => ({ logN: v, logStat: ladj[i] })) };
  return { raw, corrected };
}

/** DFA-1（線性去趨勢） */
export function hurstDFA(x: number[], minS = 10): HurstEstimate {
  const N = x.length;
  const m = mean(x);
  const Y = new Array<number>(N);
  let c = 0;
  for (let i = 0; i < N; i++) {
    c += x[i] - m;
    Y[i] = c;
  }
  const sizes = logSpacedSizes(minS, Math.floor(N / 4), 12);
  const ls: number[] = [];
  const lf: number[] = [];
  for (const s of sizes) {
    const blocks = Math.floor(N / s);
    if (blocks < 2) continue;
    // 區塊內 t = 0..s−1 的線性迴歸封閉解
    const tm = (s - 1) / 2;
    let stt = 0;
    for (let t = 0; t < s; t++) stt += (t - tm) ** 2;
    let f2 = 0;
    let cnt = 0;
    for (let b = 0; b < blocks; b++) {
      const start = N - (b + 1) * s;
      let ym = 0;
      for (let t = 0; t < s; t++) ym += Y[start + t];
      ym /= s;
      let sty = 0;
      for (let t = 0; t < s; t++) sty += (t - tm) * (Y[start + t] - ym);
      const beta = sty / stt;
      for (let t = 0; t < s; t++) {
        const e = Y[start + t] - (ym + beta * (t - tm));
        f2 += e * e;
        cnt++;
      }
    }
    const F = Math.sqrt(f2 / cnt);
    if (F > 0) {
      ls.push(Math.log(s));
      lf.push(Math.log(F));
    }
  }
  return { H: ls.length >= 2 ? slope(ls, lf) : NaN, points: ls.map((v, i) => ({ logN: v, logStat: lf[i] })) };
}

export interface HurstSummary {
  /** 綜合值：DFA（較穩健），樣本不足時用修正 R/S */
  H: number;
  dfa: number;
  rs: number;
  rsCorrected: number;
  n: number;
}

/** 對「增量 / 報酬」序列估計 Hurst 指數 */
export function hurstExponent(increments: number[]): HurstSummary {
  const n = increments.length;
  if (n < 40) return { H: NaN, dfa: NaN, rs: NaN, rsCorrected: NaN, n };
  const rs = hurstRS(increments);
  const dfa = hurstDFA(increments);
  const H = Number.isFinite(dfa.H) ? dfa.H : rs.corrected.H;
  return { H, dfa: dfa.H, rs: rs.raw.H, rsCorrected: rs.corrected.H, n };
}

/**
 * 價格序列是否具長記憶：以對數報酬估 H，H > threshold（預設 0.55）視為具持續性，
 * 才適合啟用趨勢外推類模型。資料 < 41 筆時回傳 longMemory = false。
 */
export function hasLongMemory(prices: number[], threshold = 0.55): HurstSummary & { longMemory: boolean; threshold: number } {
  const s = hurstExponent(logReturns(prices));
  return { ...s, longMemory: Number.isFinite(s.H) && s.H > threshold, threshold };
}

/** 分數差分權重 w_k（直到 |w_k| < threshold 或達 maxLen） */
export function fracDiffWeights(d: number, threshold: number, maxLen: number): number[] {
  const w = [1];
  for (let k = 1; k < maxLen; k++) {
    const next = (-w[k - 1] * (d - k + 1)) / k;
    if (threshold > 0 && Math.abs(next) < threshold) break;
    w.push(next);
  }
  return w;
}

/**
 * 分數差分 (1 − B)^d x。
 *  - threshold > 0：固定寬度視窗，輸出長度 n − L + 1（前 L − 1 點因權重不完整而捨去，對齊 x 的尾端）。
 *  - threshold ≤ 0：擴展視窗，輸出長度 n（第 t 點使用 x_0..x_t）。
 * 只用過去值，無前視偏誤。
 */
export function fracDiff(x: number[], d: number, threshold = 1e-4): number[] {
  const n = x.length;
  const w = fracDiffWeights(d, threshold, n);
  const out: number[] = [];
  if (threshold > 0) {
    const L = w.length;
    for (let t = L - 1; t < n; t++) {
      let s = 0;
      for (let k = 0; k < L; k++) s += w[k] * x[t - k];
      out.push(s);
    }
  } else {
    for (let t = 0; t < n; t++) {
      let s = 0;
      for (let k = 0; k <= t; k++) s += w[k] * x[t - k];
      out.push(s);
    }
  }
  return out;
}
