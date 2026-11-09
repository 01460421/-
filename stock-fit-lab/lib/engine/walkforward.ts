/**
 * 走動式前向驗證（walk-forward validation，規格第五節）。
 *
 * 在每個預測起點 t：
 *   1. 只取 prices[0..t]（若有前處理，前處理作用於傳入序列；稽核會檢查前處理是否偷看未來）
 *   2. 取最近 window 筆（含衰減權重）擬合模型，預測 max(horizons) 期
 *   3. 對每個 h，若 t+h 存在則與真值 prices[t+h] 比對
 * 方向與 Theil U 一律相對「真實」起點價格 prices[t]。
 *
 * 輸出：每模型 × 每期數的樣本外誤差序列、MetricSet、相對 naive 的比較（含 DM 檢定），
 * 以及樣本外預測矩陣（stacking meta-learner 只能用這份資料訓練）。基準以相同起點計算。
 */
import type { ForecastModel, ModelId, PriceMode } from '../types';
import { BENCHMARK_IDS, BENCHMARKS } from '../benchmarks';
import { compareForecasts, type BenchmarkComparison, type DMResult, type MetricDetail } from '../metrics';
import { decayWeights } from '../math/timeaxis';
import { EnsembleWeightState, combineForecasts } from './ensemble-weights';
import { makeCreateModel, pUpFromForecast, type EngineDeps } from './models';

export interface WalkForwardOptions {
  models: ModelId[];
  horizons?: number[];
  /** 訓練視窗長度（預設 120） */
  window?: number;
  /** 起點間隔；預設自動，使起點數約 ≤ maxOrigins */
  step?: number;
  /** 第一個起點至少需要的資料筆數（預設 min(window, 60)） */
  minTrain?: number;
  /** 自動 step 時的目標起點數（預設 120） */
  maxOrigins?: number;
  level?: number;
  /** 衰減權重 λ（預設 0.97；1 = 等權） */
  lambda?: number;
  priceMode?: PriceMode;
  params?: Partial<Record<ModelId, Record<string, number>>>;
  /** 與 prices 對齊的日期（時間對齊稽核用） */
  dates?: string[];
  /** 是否包含基準（預設 true） */
  benchmarks?: boolean;
  /**
   * 全序列前處理（特徵工程管線）。這是最常見的洩漏來源：若它使用了 t 之後的資料，
   * 洩漏稽核的檢查 (a)(c) 會偵測到。必須回傳與輸入同長度的價格序列。
   */
  preprocess?: (prices: number[]) => number[];
  deps?: EngineDeps;
  seed?: number;
}

export interface WalkForwardHorizonResult {
  horizon: number;
  n: number;
  originIdx: number[];
  targetIdx: number[];
  originPrice: number[];
  actual: number[];
  pred: number[];
  lower: number[];
  upper: number[];
  pUp: number[];
  /** 樣本外誤差 actual − pred（誤差曲線） */
  errors: number[];
  metrics: MetricDetail;
  /** 相對 naive 的比較（差值、相對改善 %、顯著性） */
  vsNaive: BenchmarkComparison | null;
  dmVsNaive: DMResult | null;
}

export interface OosMatrix {
  horizon: number;
  originIdx: number[];
  targetIdx: number[];
  originDates?: string[];
  targetDates?: string[];
  actual: number[];
  originPrice: number[];
  /** 模型 / 基準 id → 樣本外預測（失敗為 NaN），與 originIdx 對齊 */
  preds: Record<string, number[]>;
}

export interface WalkForwardResult {
  n: number;
  window: number;
  step: number;
  minTrain: number;
  horizons: number[];
  origins: number[];
  /** 每個起點送進模型的最後一個輸入值（時間對齊稽核：必須等於 prices[t]） */
  lastInputs: number[];
  models: Record<string, Record<number, WalkForwardHorizonResult>>;
  benchmarks: Record<string, Record<number, WalkForwardHorizonResult>>;
  oos: OosMatrix[];
  failures: Record<string, { count: number; first?: string }>;
  timings: { totalMs: number; perModelMs: Record<string, number> };
  /** 重現設定（稽核重算用） */
  settings: Required<Pick<WalkForwardOptions, 'window' | 'level' | 'lambda' | 'priceMode'>> & { params: WalkForwardOptions['params']; seed?: number };
}

interface Rec {
  originIdx: number[];
  targetIdx: number[];
  originPrice: number[];
  actual: number[];
  pred: number[];
  lower: number[];
  upper: number[];
  pUp: number[];
}

const emptyRec = (): Rec => ({ originIdx: [], targetIdx: [], originPrice: [], actual: [], pred: [], lower: [], upper: [], pUp: [] });

/** 在單一起點以「截至 t 的序列」擬合並預測（walk-forward 與洩漏稽核共用） */
export function forecastAtOrigin(
  model: ForecastModel,
  input: number[],
  t: number,
  maxH: number,
  s: WalkForwardResult['settings'],
  id: ModelId,
): { mean: number[]; lower: number[]; upper: number[]; level: number; lastInput: number } {
  const start = Math.max(0, t - s.window + 1);
  const y = input.slice(start, t + 1);
  model.fit(y, {
    priceMode: s.priceMode,
    weights: s.lambda < 1 ? decayWeights(y.length, s.lambda) : undefined,
    params: s.params?.[id],
    seed: s.seed,
  });
  const f = model.predict(maxH, s.level);
  return { mean: f.mean, lower: f.lower, upper: f.upper, level: f.level, lastInput: y[y.length - 1] };
}

function finalize(rec: Rec, h: number, level: number, withNaive: boolean): WalkForwardHorizonResult {
  const errors = rec.actual.map((a, i) => a - rec.pred[i]);
  const cmp = compareForecasts(
    { actual: rec.actual, forecast: rec.pred, origin: rec.originPrice, lower: rec.lower, upper: rec.upper, pUp: rec.pUp },
    rec.originPrice,
    { h, level },
  );
  return {
    horizon: h,
    n: rec.actual.length,
    ...rec,
    errors,
    metrics: cmp.model,
    vsNaive: withNaive ? cmp.comparison : null,
    dmVsNaive: withNaive ? cmp.dm.se : null,
  };
}

export function walkForward(prices: number[], opts: WalkForwardOptions): WalkForwardResult {
  const t0 = performance.now();
  const n = prices.length;
  const horizons = [...new Set((opts.horizons ?? [1, 5, 10, 20]).map((h) => Math.max(1, Math.floor(h))))].sort((a, b) => a - b);
  const maxH = horizons[horizons.length - 1];
  const minH = horizons[0];
  const window = Math.max(10, opts.window ?? 120);
  const minTrain = Math.max(10, opts.minTrain ?? Math.min(window, 60));
  const firstOrigin = minTrain - 1;
  const lastOrigin = n - 1 - minH;
  if (lastOrigin < firstOrigin) throw new Error(`walk-forward：資料不足（n=${n}，minTrain=${minTrain}，h=${minH}）`);
  const span = lastOrigin - firstOrigin + 1;
  const step = Math.max(1, Math.floor(opts.step ?? Math.ceil(span / (opts.maxOrigins ?? 120))));
  const settings: WalkForwardResult['settings'] = {
    window,
    level: opts.level ?? 0.9,
    lambda: opts.lambda ?? 0.97,
    priceMode: opts.priceMode ?? 'raw',
    params: opts.params ?? {},
    seed: opts.seed ?? 42,
  };
  const create = makeCreateModel(opts.deps);
  const input = opts.preprocess ? opts.preprocess(prices.slice()) : prices;
  if (input.length !== n) throw new Error('walk-forward：preprocess 必須回傳同長度序列');

  const memberIds = opts.models.filter((m) => m !== 'ensemble');
  const wantEnsemble = opts.models.includes('ensemble');
  const wantBench = opts.benchmarks !== false;
  const recs: Record<string, Record<number, Rec>> = {};
  const brecs: Record<string, Record<number, Rec>> = {};
  const failures: Record<string, { count: number; first?: string }> = {};
  const perModelMs: Record<string, number> = {};
  const origins: number[] = [];
  const lastInputs: number[] = [];
  const allIds = wantEnsemble ? [...memberIds, 'ensemble'] : memberIds;
  for (const id of allIds) recs[id] = Object.fromEntries(horizons.map((h) => [h, emptyRec()]));
  if (wantBench) for (const id of BENCHMARK_IDS) brecs[id] = Object.fromEntries(horizons.map((h) => [h, emptyRec()]));

  const ew = new EnsembleWeightState(memberIds, { eta: 0.1, k: 20 });
  const pendingOneStep: { target: number; prev: number; preds: Record<string, number> }[] = [];

  const push = (rec: Rec, t: number, h: number, f: { mean: number[]; lower: number[]; upper: number[] }, pUp: number[]) => {
    rec.originIdx.push(t);
    rec.targetIdx.push(t + h);
    rec.originPrice.push(prices[t]);
    rec.actual.push(prices[t + h]);
    rec.pred.push(f.mean[h - 1]);
    rec.lower.push(f.lower[h - 1]);
    rec.upper.push(f.upper[h - 1]);
    rec.pUp.push(pUp[h - 1]);
  };

  for (let t = firstOrigin; t <= lastOrigin; t += step) {
    origins.push(t);
    lastInputs.push(input[t]);
    // 集成：套用目標已實現（≤ t）的一步預測誤差
    while (pendingOneStep.length && pendingOneStep[0].target <= t) {
      const p = pendingOneStep.shift()!;
      ew.update(prices[p.target], p.prev, p.preds, memberIds);
    }
    const fcs: Record<string, { mean: number[]; lower: number[]; upper: number[]; level: number }> = {};
    for (const id of memberIds) {
      const tm = performance.now();
      try {
        const f = forecastAtOrigin(create(id), input, t, maxH, settings, id);
        if (f.mean.some((v) => !Number.isFinite(v))) throw new Error('預測含非有限值');
        fcs[id] = f;
        const pUp = pUpFromForecast(f, prices[t]);
        for (const h of horizons) if (t + h < n) push(recs[id][h], t, h, f, pUp);
      } catch (e) {
        const fl = (failures[id] = failures[id] ?? { count: 0 });
        fl.count++;
        fl.first = fl.first ?? (e instanceof Error ? e.message : String(e));
        for (const h of horizons) if (t + h < n) push(recs[id][h], t, h, { mean: new Array(maxH).fill(NaN), lower: new Array(maxH).fill(NaN), upper: new Array(maxH).fill(NaN) }, new Array(maxH).fill(NaN));
      }
      perModelMs[id] = (perModelMs[id] ?? 0) + performance.now() - tm;
    }
    if (wantEnsemble) {
      const w = ew.weights(Object.keys(fcs));
      const comb = combineForecasts(fcs, w);
      if (comb) {
        const f = { ...comb, level: settings.level };
        const pUp = pUpFromForecast(f, prices[t]);
        for (const h of horizons) if (t + h < n) push(recs.ensemble[h], t, h, f, pUp);
      } else {
        const nan = new Array<number>(maxH).fill(NaN);
        for (const h of horizons) if (t + h < n) push(recs.ensemble[h], t, h, { mean: nan, lower: nan, upper: nan }, nan);
      }
      if (t + 1 < n) pendingOneStep.push({ target: t + 1, prev: prices[t], preds: Object.fromEntries(Object.entries(fcs).map(([id, f]) => [id, f.mean[0]])) });
    }
    if (wantBench) {
      const y = input.slice(Math.max(0, t - Math.max(window, 60) + 1), t + 1);
      for (const id of BENCHMARK_IDS) {
        const mean = BENCHMARKS[id].predict(y, maxH);
        const f = { mean, lower: mean.map(() => NaN), upper: mean.map(() => NaN) };
        const pUp = mean.map((m) => (m > prices[t] ? 1 : m < prices[t] ? 0 : 0.5));
        for (const h of horizons) if (t + h < n) push(brecs[id][h], t, h, f, pUp);
      }
    }
  }

  const models: WalkForwardResult['models'] = {};
  for (const id of Object.keys(recs)) {
    models[id] = {};
    for (const h of horizons) models[id][h] = finalize(recs[id][h], h, settings.level, true);
  }
  const benchmarks: WalkForwardResult['benchmarks'] = {};
  for (const id of Object.keys(brecs)) {
    benchmarks[id] = {};
    for (const h of horizons) benchmarks[id][h] = finalize(brecs[id][h], h, settings.level, id !== 'naive' && id !== 'buyhold');
  }

  const oos: OosMatrix[] = horizons.map((h) => {
    const base = Object.values(recs)[0]?.[h] ?? Object.values(brecs)[0]?.[h] ?? emptyRec();
    const preds: Record<string, number[]> = {};
    for (const id of Object.keys(recs)) preds[id] = recs[id][h].pred.slice();
    for (const id of Object.keys(brecs)) preds[id] = brecs[id][h].pred.slice();
    return {
      horizon: h,
      originIdx: base.originIdx.slice(),
      targetIdx: base.targetIdx.slice(),
      originDates: opts.dates ? base.originIdx.map((i) => opts.dates![i]) : undefined,
      targetDates: opts.dates ? base.targetIdx.map((i) => opts.dates![i]) : undefined,
      actual: base.actual.slice(),
      originPrice: base.originPrice.slice(),
      preds,
    };
  });

  return {
    n,
    window,
    step,
    minTrain,
    horizons,
    origins,
    lastInputs,
    models,
    benchmarks,
    oos,
    failures,
    timings: { totalMs: performance.now() - t0, perModelMs },
    settings,
  };
}
