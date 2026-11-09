/**
 * PELT（Pruned Exact Linear Time, Killick et al. 2012）變點偵測，常態分布平均 + 變異數成本：
 *   C(y_{s+1..t}) = n · ln(σ̂²)，σ̂² 為區段 ML 變異數（加下限避免 ln 0）
 *   F(t) = min_s [ F(s) + C(s, t) + β ]，剪枝條件 F(s) + C(s, t) > F(t) 的 s 永久移除
 */

export interface PeltOptions {
  /** 懲罰 β；未給則為 penaltyFactor · ln(n) */
  penalty?: number;
  penaltyFactor?: number;
  /** 最短區段長度 */
  minSegment?: number;
}

export interface PeltResult {
  /** 每個新區段第一個元素的索引（不含 0） */
  changePoints: number[];
  /** 各區段 [start, end)、平均與標準差 */
  segments: { start: number; end: number; mean: number; std: number }[];
  penalty: number;
  cost: number;
}

export function pelt(x: number[], opts: PeltOptions = {}): PeltResult {
  const n = x.length;
  const minSeg = Math.max(2, Math.floor(opts.minSegment ?? 10));
  const penalty = opts.penalty ?? (opts.penaltyFactor ?? 4) * Math.log(Math.max(n, 2));
  if (n < 2 * minSeg) return { changePoints: [], segments: n ? [segStats(x, 0, n)] : [], penalty, cost: 0 };
  const S1 = new Float64Array(n + 1);
  const S2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    S1[i + 1] = S1[i] + x[i];
    S2[i + 1] = S2[i] + x[i] * x[i];
  }
  const totalVar = Math.max(1e-300, S2[n] / n - (S1[n] / n) ** 2);
  const floor = totalVar * 1e-6 + 1e-300;
  const cost = (s: number, t: number) => {
    const m = t - s;
    const a = S1[t] - S1[s];
    const v = (S2[t] - S2[s]) / m - (a / m) ** 2;
    return m * Math.log(Math.max(v, floor));
  };
  const F = new Float64Array(n + 1).fill(Infinity);
  const last = new Int32Array(n + 1).fill(-1);
  F[0] = -penalty;
  let R: number[] = [];
  for (let t = minSeg; t <= n; t++) {
    const cand = t - minSeg;
    if (cand === 0 || (cand >= minSeg && Number.isFinite(F[cand]))) R.push(cand);
    let best = Infinity;
    let arg = -1;
    const costs = new Float64Array(R.length);
    for (let j = 0; j < R.length; j++) {
      const s = R[j];
      const c = F[s] + cost(s, t);
      costs[j] = c;
      if (c + penalty < best) {
        best = c + penalty;
        arg = s;
      }
    }
    F[t] = best;
    last[t] = arg;
    const nextR: number[] = [];
    for (let j = 0; j < R.length; j++) if (costs[j] <= best) nextR.push(R[j]);
    R = nextR;
  }
  const cps: number[] = [];
  let t = n;
  while (t > 0) {
    const s = last[t];
    if (s <= 0) break;
    cps.push(s);
    t = s;
  }
  cps.reverse();
  const bounds = [0, ...cps, n];
  const segments = [];
  for (let i = 0; i < bounds.length - 1; i++) segments.push(segStats(x, bounds[i], bounds[i + 1]));
  return { changePoints: cps, segments, penalty, cost: F[n] };
}

function segStats(x: number[], start: number, end: number) {
  const seg = x.slice(start, end);
  const m = seg.reduce((a, b) => a + b, 0) / Math.max(1, seg.length);
  const v = seg.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, seg.length);
  return { start, end, mean: m, std: Math.sqrt(v) };
}
