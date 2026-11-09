/**
 * 機率校準工具（規格八：「以校準過的機率輸出 P(上漲) 取代單一方向判斷，回報 Brier score 與可靠度圖」）。
 *
 *   Brier = \frac1n\sum_i (p_i - o_i)^2,\quad o_i\in\{0,1\}
 *   可靠度圖：把 p 分成 10 個等寬區間，比較每區平均預測機率 \bar p_b 與實際上漲頻率 \bar o_b
 *   ECE = \sum_b \frac{n_b}{n}|\bar p_b - \bar o_b|
 *
 * 校準器（必須以「樣本外」的 (p, o) 配對訓練，再套用到之後的預測）：
 *   Platt scaling：  \tilde p = \sigma(a\cdot\mathrm{logit}(p) + b)，以牛頓法最大化對數概似
 *   等滲迴歸（PAV）：在 p 排序後求單調非遞減的 \tilde p 使 \sum (o_i - \tilde p_i)^2 最小
 */
import { sigmoid } from '../math/stats';

const toNum = (o: boolean | number) => (typeof o === 'boolean' ? (o ? 1 : 0) : o);

export function brierScore(p: number[], outcomes: (boolean | number)[]): number {
  if (!p.length) return NaN;
  let s = 0;
  for (let i = 0; i < p.length; i++) s += (p[i] - toNum(outcomes[i])) ** 2;
  return s / p.length;
}

/** Brier skill score 相對於「永遠預測基礎率」的氣候值基準 */
export function brierSkillScore(p: number[], outcomes: (boolean | number)[]): number {
  const o = outcomes.map(toNum);
  const base = o.reduce((a, b) => a + b, 0) / o.length;
  const ref = brierScore(o.map(() => base), o);
  return ref > 0 ? 1 - brierScore(p, o) / ref : NaN;
}

export function logLoss(p: number[], outcomes: (boolean | number)[], eps = 1e-12): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = Math.min(Math.max(p[i], eps), 1 - eps);
    const o = toNum(outcomes[i]);
    s -= o * Math.log(q) + (1 - o) * Math.log(1 - q);
  }
  return s / Math.max(p.length, 1);
}

export interface ReliabilityBin {
  lo: number;
  hi: number;
  /** 區間內平均預測機率（空區間為 NaN） */
  meanPredicted: number;
  /** 區間內實際上漲比例（空區間為 NaN） */
  observedFrequency: number;
  count: number;
}

/** 可靠度圖分箱：[0,0.1), [0.1,0.2), …, [0.9,1.0]（最後一箱含 1） */
export function reliabilityDiagram(p: number[], outcomes: (boolean | number)[], bins = 10): ReliabilityBin[] {
  const sumP = new Array<number>(bins).fill(0);
  const sumO = new Array<number>(bins).fill(0);
  const cnt = new Array<number>(bins).fill(0);
  for (let i = 0; i < p.length; i++) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor(p[i] * bins)));
    sumP[b] += p[i];
    sumO[b] += toNum(outcomes[i]);
    cnt[b]++;
  }
  return Array.from({ length: bins }, (_, b) => ({
    lo: b / bins,
    hi: (b + 1) / bins,
    meanPredicted: cnt[b] ? sumP[b] / cnt[b] : NaN,
    observedFrequency: cnt[b] ? sumO[b] / cnt[b] : NaN,
    count: cnt[b],
  }));
}

export function expectedCalibrationError(p: number[], outcomes: (boolean | number)[], bins = 10): number {
  const n = p.length;
  return reliabilityDiagram(p, outcomes, bins).reduce((s, b) => (b.count ? s + (b.count / n) * Math.abs(b.meanPredicted - b.observedFrequency) : s), 0);
}

/** ROC AUC（Mann–Whitney U，同分取平均秩） */
export function auc(scores: number[], outcomes: (boolean | number)[]): number {
  const idx = scores.map((s, i) => ({ s, o: toNum(outcomes[i]) })).sort((a, b) => a.s - b.s);
  let nPos = 0;
  let nNeg = 0;
  let rankSumPos = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].s === idx[i].s) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      if (idx[k].o === 1) {
        nPos++;
        rankSumPos += avgRank;
      } else nNeg++;
    }
    i = j + 1;
  }
  if (!nPos || !nNeg) return NaN;
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export interface Calibrator {
  kind: 'platt' | 'isotonic' | 'identity';
  apply: (p: number) => number;
}

const logit = (p: number) => {
  const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  return Math.log(q / (1 - q));
};

/**
 * Platt scaling：\tilde p = σ(a·logit(p) + b)。
 * 以牛頓法最大化對數概似（使用 Platt 的目標平滑：正例目標 (N₊+1)/(N₊+2)、負例 1/(N₋+2)，避免過度自信）。
 */
export function plattScaling(p: number[], outcomes: (boolean | number)[], maxIter = 100): Calibrator & { a: number; b: number } {
  const o = outcomes.map(toNum);
  const nPos = o.filter((v) => v === 1).length;
  const nNeg = o.length - nPos;
  const tPos = (nPos + 1) / (nPos + 2);
  const tNeg = 1 / (nNeg + 2);
  const t = o.map((v) => (v === 1 ? tPos : tNeg));
  const x = p.map(logit);
  const nll = (a: number, b: number) => {
    let L = 0;
    for (let i = 0; i < x.length; i++) {
      const z = a * x[i] + b;
      const sp = z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z));
      L += sp - t[i] * z;
    }
    return L;
  };
  let a = 1;
  let b = 0;
  let cur = nll(a, b);
  for (let it = 0; it < maxIter; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < x.length; i++) {
      const q = sigmoid(a * x[i] + b);
      const d = q - t[i];
      const w = Math.max(q * (1 - q), 1e-12);
      g0 += d * x[i];
      g1 += d;
      h00 += w * x[i] * x[i];
      h01 += w * x[i];
      h11 += w;
    }
    h00 += 1e-9;
    h11 += 1e-9;
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-18) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (-h01 * g0 + h00 * g1) / det;
    // 回溯線搜尋（極端 logit 時純牛頓步會發散）
    let step = 1;
    let accepted = false;
    for (let k = 0; k < 30; k++) {
      const na = a - step * da;
      const nb = b - step * db;
      const v = nll(na, nb);
      if (v <= cur) {
        a = na;
        b = nb;
        accepted = cur - v > 1e-12;
        cur = v;
        break;
      }
      step /= 2;
    }
    if (!accepted || step * (Math.abs(da) + Math.abs(db)) < 1e-10) break;
  }
  return { kind: 'platt', a, b, apply: (q: number) => sigmoid(a * logit(q) + b) };
}

/**
 * 等滲迴歸（Pool-Adjacent-Violators）。回傳單調非遞減的校準函數，
 * 區塊之間以線性內插，超出訓練範圍時取端點值。
 */
export function isotonicCalibration(p: number[], outcomes: (boolean | number)[]): Calibrator & { x: number[]; y: number[] } {
  const pts = p.map((v, i) => ({ x: v, y: toNum(outcomes[i]) })).sort((a, b) => a.x - b.x);
  // 先合併相同 x
  const blocks: { xSum: number; ySum: number; w: number }[] = [];
  for (const q of pts) {
    const last = blocks[blocks.length - 1];
    if (last && last.xSum / last.w === q.x) {
      last.xSum += q.x;
      last.ySum += q.y;
      last.w += 1;
    } else blocks.push({ xSum: q.x, ySum: q.y, w: 1 });
  }
  // PAV：違反單調就與前一區塊合併
  const st: { xSum: number; ySum: number; w: number }[] = [];
  for (const b of blocks) {
    st.push({ ...b });
    while (st.length >= 2 && st[st.length - 2].ySum / st[st.length - 2].w > st[st.length - 1].ySum / st[st.length - 1].w) {
      const top = st.pop()!;
      const prev = st[st.length - 1];
      prev.xSum += top.xSum;
      prev.ySum += top.ySum;
      prev.w += top.w;
    }
  }
  const xs = st.map((b) => b.xSum / b.w);
  const ys = st.map((b) => b.ySum / b.w);
  const apply = (q: number) => {
    if (!xs.length) return q;
    if (q <= xs[0]) return ys[0];
    if (q >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= q) lo = mid;
      else hi = mid;
    }
    const t = (q - xs[lo]) / (xs[hi] - xs[lo] || 1);
    return ys[lo] + t * (ys[hi] - ys[lo]);
  };
  return { kind: 'isotonic', x: xs, y: ys, apply };
}

export const identityCalibrator: Calibrator = { kind: 'identity', apply: (p) => p };
