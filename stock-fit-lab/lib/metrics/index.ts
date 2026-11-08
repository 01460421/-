/**
 * 評估指標（規格第五、八節）。
 *
 * 全部以「預測—實現配對」計算：
 *   actual[i]   實際值 y_{t+h}
 *   forecast[i] 預測值 ŷ_{t+h|t}
 *   origin[i]   預測發出時最後已知價格 y_t（方向判斷與 Theil U 的 naive 基準）
 *
 * Theil's U（U2 定義，相對 naive）：
 *   U = sqrt( Σ((ŷ_i − y_i)/o_i)² ) / sqrt( Σ((y_i − o_i)/o_i)² )
 *   U < 1 ⇔ 優於 naive（明日 = 今日）。
 * 方向準確率：sign(ŷ − o) = sign(y − o) 的比例；ŷ = o（無方向）或 y = o（實際持平）的配對不計入分母。
 * Diebold–Mariano：損失差 d_t = L(e¹_t) − L(e²_t)，HAC 變異數（lag h−1）+ Harvey–Leybourne–Newbold 小樣本修正，
 *   以 t(n−1) 雙尾檢定。
 */
import type { MetricSet } from '../types';
import { binomialTestGreater, normalCdf, studentTCdf } from '../math/stats';

export interface ForecastPairs {
  actual: number[];
  forecast: number[];
  origin: number[];
  lower?: number[];
  upper?: number[];
  /** P(y > origin) 機率預測（Brier score 用） */
  pUp?: number[];
}

/** MetricSet + 檢定與樣本數細節（UI 需要顯示 n 與 p 值） */
export interface MetricDetail extends MetricSet {
  /** 方向判斷有效樣本數（排除持平） */
  dirN: number;
  dirHits: number;
  /** 方向準確率 > 50% 的單尾二項檢定 p 值 */
  dirPValue: number;
  /** 平均誤差（actual − forecast），> 0 代表系統性低估 */
  bias: number;
  /** 有區間的樣本數 */
  coverageN: number;
}

function finitePairs(a: number[], f: number[]): number[] {
  const idx: number[] = [];
  const n = Math.min(a.length, f.length);
  for (let i = 0; i < n; i++) if (Number.isFinite(a[i]) && Number.isFinite(f[i])) idx.push(i);
  return idx;
}

export function mae(actual: number[], forecast: number[]): number {
  const idx = finitePairs(actual, forecast);
  if (!idx.length) return NaN;
  let s = 0;
  for (const i of idx) s += Math.abs(actual[i] - forecast[i]);
  return s / idx.length;
}

export function rmse(actual: number[], forecast: number[]): number {
  const idx = finitePairs(actual, forecast);
  if (!idx.length) return NaN;
  let s = 0;
  for (const i of idx) s += (actual[i] - forecast[i]) ** 2;
  return Math.sqrt(s / idx.length);
}

/** MAPE（百分比，1.23 = 1.23%）；actual = 0 的配對略過 */
export function mape(actual: number[], forecast: number[]): number {
  const idx = finitePairs(actual, forecast).filter((i) => actual[i] !== 0);
  if (!idx.length) return NaN;
  let s = 0;
  for (const i of idx) s += Math.abs((actual[i] - forecast[i]) / actual[i]);
  return (s / idx.length) * 100;
}

export function sign0(x: number): -1 | 0 | 1 {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/** 方向準確率（相對 origin）。回傳 accuracy、有效樣本數 n、命中數 hits、二項檢定 p 值。 */
export function directionAccuracy(actual: number[], forecast: number[], origin: number[]): { accuracy: number; n: number; hits: number; pValue: number } {
  let n = 0;
  let hits = 0;
  const m = Math.min(actual.length, forecast.length, origin.length);
  for (let i = 0; i < m; i++) {
    const sf = sign0(forecast[i] - origin[i]);
    const sa = sign0(actual[i] - origin[i]);
    if (!Number.isFinite(forecast[i]) || !Number.isFinite(actual[i]) || sf === 0 || sa === 0) continue;
    n++;
    if (sf === sa) hits++;
  }
  return { accuracy: n ? hits / n : NaN, n, hits, pValue: binomialTestGreater(hits, n, 0.5) };
}

/** Theil's U2（相對 naive = origin）。分母為 0（實際值都等於 origin）時回傳 NaN。 */
export function theilU(actual: number[], forecast: number[], origin: number[]): number {
  let num = 0;
  let den = 0;
  const m = Math.min(actual.length, forecast.length, origin.length);
  for (let i = 0; i < m; i++) {
    if (!Number.isFinite(actual[i]) || !Number.isFinite(forecast[i]) || !origin[i]) continue;
    num += ((forecast[i] - actual[i]) / origin[i]) ** 2;
    den += ((actual[i] - origin[i]) / origin[i]) ** 2;
  }
  return den > 0 ? Math.sqrt(num) / Math.sqrt(den) : NaN;
}

/** 區間覆蓋率：lower ≤ actual ≤ upper 的比例 */
export function coverage(actual: number[], lower: number[], upper: number[]): number {
  let n = 0;
  let hit = 0;
  const m = Math.min(actual.length, lower.length, upper.length);
  for (let i = 0; i < m; i++) {
    if (!Number.isFinite(actual[i]) || !Number.isFinite(lower[i]) || !Number.isFinite(upper[i])) continue;
    n++;
    if (actual[i] >= lower[i] && actual[i] <= upper[i]) hit++;
  }
  return n ? hit / n : NaN;
}

/** Brier score = mean (p_i − o_i)²，o_i ∈ {0,1} */
export function brierScore(p: number[], outcomes: (0 | 1 | boolean)[]): number {
  const m = Math.min(p.length, outcomes.length);
  let s = 0;
  let n = 0;
  for (let i = 0; i < m; i++) {
    if (!Number.isFinite(p[i])) continue;
    const o = outcomes[i] ? 1 : 0;
    s += (p[i] - o) ** 2;
    n++;
  }
  return n ? s / n : NaN;
}

/** 由配對計算完整指標 */
export function computeMetrics(p: ForecastPairs): MetricDetail {
  const { actual, forecast, origin } = p;
  const idx = finitePairs(actual, forecast);
  const dir = directionAccuracy(actual, forecast, origin);
  let bias = 0;
  for (const i of idx) bias += actual[i] - forecast[i];
  bias = idx.length ? bias / idx.length : NaN;
  const cov = p.lower && p.upper ? coverage(actual, p.lower, p.upper) : NaN;
  const coverageN = p.lower && p.upper ? finitePairs(p.lower, p.upper).length : 0;
  let brier: number | undefined;
  if (p.pUp) {
    const ps: number[] = [];
    const os: (0 | 1)[] = [];
    for (let i = 0; i < Math.min(p.pUp.length, actual.length); i++) {
      if (actual[i] === origin[i] || !Number.isFinite(p.pUp[i])) continue;
      ps.push(p.pUp[i]);
      os.push(actual[i] > origin[i] ? 1 : 0);
    }
    brier = brierScore(ps, os);
  }
  return {
    n: idx.length,
    mae: mae(actual, forecast),
    rmse: rmse(actual, forecast),
    mape: mape(actual, forecast),
    directionAccuracy: dir.accuracy,
    theilU: theilU(actual, forecast, origin),
    coverage: cov,
    brier,
    dirN: dir.n,
    dirHits: dir.hits,
    dirPValue: dir.pValue,
    bias,
    coverageN,
  };
}

// ───────── Diebold–Mariano ─────────

export interface DMResult {
  stat: number;
  pValue: number;
  n: number;
  /** 平均損失差 d̄ = mean(L(e¹) − L(e²))；< 0 代表第一組（模型）損失較小 */
  meanDiff: number;
  loss: 'se' | 'ae';
  h: number;
}

/**
 * Diebold–Mariano 檢定（含 HLN 修正）。e1 = 模型誤差，e2 = 基準誤差（同一組目標）。
 * stat < 0 且 p < α ⇒ 模型顯著優於基準。
 */
export function dieboldMariano(e1: number[], e2: number[], opts: { h?: number; loss?: 'se' | 'ae' } = {}): DMResult {
  const h = Math.max(1, Math.floor(opts.h ?? 1));
  const loss = opts.loss ?? 'se';
  const L = loss === 'se' ? (e: number) => e * e : (e: number) => Math.abs(e);
  const d: number[] = [];
  for (let i = 0; i < Math.min(e1.length, e2.length); i++) {
    if (Number.isFinite(e1[i]) && Number.isFinite(e2[i])) d.push(L(e1[i]) - L(e2[i]));
  }
  const n = d.length;
  if (n < 3) return { stat: NaN, pValue: NaN, n, meanDiff: NaN, loss, h };
  const dbar = d.reduce((a, b) => a + b, 0) / n;
  const gamma = (k: number) => {
    let s = 0;
    for (let t = k; t < n; t++) s += (d[t] - dbar) * (d[t - k] - dbar);
    return s / n;
  };
  let v = gamma(0);
  for (let k = 1; k < h && k < n; k++) v += 2 * gamma(k);
  if (!(v > 0)) v = gamma(0);
  if (!(v > 0)) {
    // 損失差為常數：完全相同 → 不顯著；否則方向確定
    if (dbar === 0) return { stat: 0, pValue: 1, n, meanDiff: 0, loss, h };
    return { stat: dbar < 0 ? -Infinity : Infinity, pValue: 0, n, meanDiff: dbar, loss, h };
  }
  const dm = dbar / Math.sqrt(v / n);
  const hln = Math.sqrt(Math.max((n + 1 - 2 * h + (h * (h - 1)) / n) / n, 1e-12));
  const stat = dm * hln;
  const pValue = 2 * (1 - studentTCdf(Math.abs(stat), n - 1));
  return { stat, pValue: Math.min(1, Math.max(0, pValue)), n, meanDiff: dbar, loss, h };
}

// ───────── 模型 vs 基準 ─────────

export type Verdict = 'better' | 'worse' | 'insignificant' | 'na';

export interface MetricComparison {
  metric: keyof MetricSet;
  model: number;
  benchmark: number;
  /** model − benchmark */
  diff: number;
  /** 相對改善百分比（正值 = 模型較好）。誤差類：(B−M)/B×100；準確率類：(M−B)/B×100；覆蓋率：以 |cov−level| 比較 */
  relImprovementPct: number;
  verdict: Verdict;
  /** 判斷依據：'dm' Diebold–Mariano、'ztest' 比例檢定、'threshold' 相對改善門檻 */
  method: 'dm' | 'ztest' | 'threshold' | 'none';
  pValue?: number;
}

export interface BenchmarkComparison {
  metrics: Partial<Record<keyof MetricSet, MetricComparison>>;
  /** 整體判斷：以 RMSE（DM 平方損失）為主 */
  overall: Verdict;
  alpha: number;
}

export interface CompareOptions {
  alpha?: number;
  /** 名目信賴水準（覆蓋率比較用），預設 0.9 */
  level?: number;
  /** 未提供 DM 結果時，相對改善 ≥ 此百分比才算顯著（預設 5%） */
  minRelImprovementPct?: number;
  dm?: { se?: DMResult; ae?: DMResult; ape?: DMResult };
}

function verdictFromDm(dm: DMResult | undefined, alpha: number): { verdict: Verdict; p?: number } | null {
  if (!dm || !Number.isFinite(dm.pValue)) return null;
  if (dm.pValue >= alpha) return { verdict: 'insignificant', p: dm.pValue };
  return { verdict: dm.stat < 0 ? 'better' : 'worse', p: dm.pValue };
}

/** 兩比例 z 檢定（雙尾） */
export function twoProportionZ(p1: number, n1: number, p2: number, n2: number): number {
  if (!(n1 > 0 && n2 > 0)) return NaN;
  const p = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!(se > 0)) return p1 === p2 ? 1 : 0;
  const z = (p1 - p2) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/**
 * 模型 vs 基準：每個指標的差值、相對改善百分比與顯著性判斷（UI 以顏色標示）。
 * 錯誤類指標（MAE/RMSE/MAPE）有 DM 結果時以 DM 判斷，否則以相對改善門檻；
 * 方向準確率以兩比例 z 檢定；覆蓋率比較 |cov − level|；Theil U / Brier 以門檻。
 */
export function compareToBenchmark(model: MetricSet & Partial<MetricDetail>, bench: MetricSet & Partial<MetricDetail>, opts: CompareOptions = {}): BenchmarkComparison {
  const alpha = opts.alpha ?? 0.05;
  const level = opts.level ?? 0.9;
  const thr = opts.minRelImprovementPct ?? 5;
  const out: BenchmarkComparison['metrics'] = {};

  const lowerBetter = (metric: 'mae' | 'rmse' | 'mape' | 'theilU' | 'brier', dm?: DMResult) => {
    const m = model[metric] as number | undefined;
    const b = bench[metric] as number | undefined;
    if (m === undefined || b === undefined || !Number.isFinite(m) || !Number.isFinite(b)) {
      out[metric] = { metric, model: m ?? NaN, benchmark: b ?? NaN, diff: NaN, relImprovementPct: NaN, verdict: 'na', method: 'none' };
      return;
    }
    const rel = b !== 0 ? ((b - m) / Math.abs(b)) * 100 : m === 0 ? 0 : -Infinity;
    const v = verdictFromDm(dm, alpha);
    if (v) {
      out[metric] = { metric, model: m, benchmark: b, diff: m - b, relImprovementPct: rel, verdict: v.verdict, method: 'dm', pValue: v.p };
    } else {
      out[metric] = { metric, model: m, benchmark: b, diff: m - b, relImprovementPct: rel, verdict: rel >= thr ? 'better' : rel <= -thr ? 'worse' : 'insignificant', method: 'threshold' };
    }
  };
  lowerBetter('mae', opts.dm?.ae);
  lowerBetter('rmse', opts.dm?.se);
  lowerBetter('mape', opts.dm?.ape);
  lowerBetter('theilU');
  lowerBetter('brier');

  // 方向準確率
  {
    const m = model.directionAccuracy;
    const b = bench.directionAccuracy;
    const nm = model.dirN ?? model.n;
    const nb = bench.dirN ?? bench.n;
    if (Number.isFinite(m) && Number.isFinite(b)) {
      const p = twoProportionZ(m, nm, b, nb);
      out.directionAccuracy = {
        metric: 'directionAccuracy',
        model: m,
        benchmark: b,
        diff: m - b,
        relImprovementPct: b ? ((m - b) / b) * 100 : NaN,
        verdict: !(p < alpha) ? 'insignificant' : m > b ? 'better' : 'worse',
        method: 'ztest',
        pValue: p,
      };
    } else if (Number.isFinite(m)) {
      // 基準無方向（例如 naive 為水平線）：與 50% 比較（二項檢定）
      const p = model.dirPValue ?? binomialTestGreater(Math.round(m * nm), nm);
      const pLow = binomialTestGreater(Math.round((1 - m) * nm), nm);
      out.directionAccuracy = {
        metric: 'directionAccuracy',
        model: m,
        benchmark: 0.5,
        diff: m - 0.5,
        relImprovementPct: ((m - 0.5) / 0.5) * 100,
        verdict: p < alpha ? 'better' : pLow < alpha ? 'worse' : 'insignificant',
        method: 'ztest',
        pValue: p,
      };
    } else {
      out.directionAccuracy = { metric: 'directionAccuracy', model: m, benchmark: b, diff: NaN, relImprovementPct: NaN, verdict: 'na', method: 'none' };
    }
  }

  // 覆蓋率：越接近名目水準越好
  {
    const m = model.coverage;
    const b = bench.coverage;
    if (Number.isFinite(m)) {
      const dm = Math.abs(m - level);
      const db = Number.isFinite(b) ? Math.abs(b - level) : NaN;
      // 模型覆蓋率是否顯著偏離名目水準（常態近似）
      const n = model.coverageN ?? model.n;
      const se = Math.sqrt((level * (1 - level)) / Math.max(n, 1));
      const z = (m - level) / se;
      const pCal = 2 * (1 - normalCdf(Math.abs(z)));
      out.coverage = {
        metric: 'coverage',
        model: m,
        benchmark: b,
        diff: Number.isFinite(b) ? m - b : NaN,
        relImprovementPct: Number.isFinite(db) && db > 0 ? ((db - dm) / db) * 100 : NaN,
        verdict: pCal < alpha ? 'worse' : Number.isFinite(db) && db - dm > 0.02 ? 'better' : 'insignificant',
        method: 'ztest',
        pValue: pCal,
      };
    } else {
      out.coverage = { metric: 'coverage', model: m, benchmark: b, diff: NaN, relImprovementPct: NaN, verdict: 'na', method: 'none' };
    }
  }

  const overall = out.rmse?.verdict ?? 'na';
  return { metrics: out, overall, alpha };
}

/**
 * 便利函式：同一組目標下，模型預測 vs 基準預測（同為點預測）。計算兩組指標、DM 檢定與比較結果。
 */
export function compareForecasts(
  model: ForecastPairs,
  benchForecast: number[],
  opts: { h?: number; alpha?: number; level?: number } = {},
): { model: MetricDetail; benchmark: MetricDetail; dm: { se: DMResult; ae: DMResult; ape: DMResult }; comparison: BenchmarkComparison } {
  const mm = computeMetrics(model);
  const bm = computeMetrics({ actual: model.actual, forecast: benchForecast, origin: model.origin });
  const e1 = model.actual.map((a, i) => a - model.forecast[i]);
  const e2 = model.actual.map((a, i) => a - benchForecast[i]);
  const p1 = e1.map((e, i) => (model.actual[i] ? e / model.actual[i] : NaN));
  const p2 = e2.map((e, i) => (model.actual[i] ? e / model.actual[i] : NaN));
  const dm = {
    se: dieboldMariano(e1, e2, { h: opts.h, loss: 'se' }),
    ae: dieboldMariano(e1, e2, { h: opts.h, loss: 'ae' }),
    ape: dieboldMariano(p1, p2, { h: opts.h, loss: 'ae' }),
  };
  return { model: mm, benchmark: bm, dm, comparison: compareToBenchmark(mm, bm, { alpha: opts.alpha, level: opts.level, dm }) };
}
