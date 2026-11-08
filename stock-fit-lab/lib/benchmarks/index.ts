/**
 * 預測基準（規格第五節）。所有模型都必須與這些基準並排比較。
 *
 * 每個基準只使用傳入的 y（過去資料，時間由舊到新）產生 h 期「價格空間」預測：
 *  - naive   ：ŷ_{T+i} = y_T（明日 = 今日）
 *  - drift   ：對數空間漂移隨機漫步 ŷ_{T+i} = y_T · exp(i·μ̄)，μ̄ = 歷史平均日對數報酬
 *  - sma20   ：ŷ = 最近 20 筆平均（水平延伸）
 *  - sma60   ：ŷ = 最近 60 筆平均（水平延伸）
 *  - buyhold ：價格層面與 naive 相同（持有不動），主要用於報酬率層面的對照，
 *              見 buyHoldReturns() / strategyReturns()
 *  - custom  ：使用者目標價或券商預估。給定達成步數時由最後價線性走到目標價，否則水平於目標價。
 */
import type { Benchmark, BenchmarkId, Market } from '../types';
import { nextTradingDays } from '../calendar';

function lastOf(y: number[]): number {
  if (!y.length) throw new Error('benchmark: 需要至少 1 筆資料');
  return y[y.length - 1];
}

function flat(v: number, h: number): number[] {
  return new Array<number>(Math.max(0, h)).fill(v);
}

/** 最近 k 筆的簡單平均；資料不足 k 筆時使用全部可用資料 */
export function sma(y: number[], k: number): number {
  const s = y.slice(-k);
  let t = 0;
  for (const v of s) t += v;
  return t / s.length;
}

/** 歷史平均日對數報酬 μ̄ = (ln y_T − ln y_0) / T */
export function meanLogReturn(y: number[]): number {
  if (y.length < 2) return 0;
  return (Math.log(y[y.length - 1]) - Math.log(y[0])) / (y.length - 1);
}

export const naiveBenchmark: Benchmark = {
  id: 'naive',
  name: 'Naive（明日 = 今日）',
  predict: (y, h) => flat(lastOf(y), h),
};

export const driftBenchmark: Benchmark = {
  id: 'drift',
  name: '漂移隨機漫步',
  predict: (y, h) => {
    const last = lastOf(y);
    const mu = meanLogReturn(y);
    return Array.from({ length: h }, (_, i) => last * Math.exp(mu * (i + 1)));
  },
};

export const sma20Benchmark: Benchmark = {
  id: 'sma20',
  name: 'SMA 20',
  predict: (y, h) => flat(sma(y, 20), h),
};

export const sma60Benchmark: Benchmark = {
  id: 'sma60',
  name: 'SMA 60',
  predict: (y, h) => flat(sma(y, 60), h),
};

export const buyHoldBenchmark: Benchmark = {
  id: 'buyhold',
  name: '買進持有',
  predict: (y, h) => flat(lastOf(y), h),
};

/** 使用者自訂基準（目標價 / 券商預估） */
export interface CustomBenchmarkInput {
  targetPrice: number;
  /** 由最後一筆起算幾個交易日達到目標價；未給 → 水平於目標價 */
  steps?: number;
  /** 'linear'（預設，有 steps 時）或 'flat' */
  mode?: 'linear' | 'flat';
  /** 顯示名稱，例如「某券商目標價」 */
  label?: string;
  /** 目標日期（YYYY-MM-DD），僅供顯示與換算 steps */
  targetDate?: string;
}

/** 由目標日期換算達成步數（交易日數），目標日早於或等於 lastDate 時回傳 1 */
export function customStepsFromDate(market: Market, lastDate: string, targetDate: string): number {
  if (targetDate <= lastDate) return 1;
  // 最多查 3 年交易日
  const days = nextTradingDays(market, lastDate, 800);
  const i = days.findIndex((d) => d >= targetDate);
  return i >= 0 ? i + 1 : days.length;
}

export function customForecast(y: number[], h: number, c: CustomBenchmarkInput): number[] {
  const last = lastOf(y);
  if (!Number.isFinite(c.targetPrice) || c.targetPrice <= 0) throw new Error('custom benchmark: 目標價必須為正數');
  const mode = c.mode ?? (c.steps ? 'linear' : 'flat');
  if (mode === 'flat' || !c.steps || c.steps <= 0) return flat(c.targetPrice, h);
  const steps = c.steps;
  return Array.from({ length: h }, (_, i) => last + (c.targetPrice - last) * Math.min((i + 1) / steps, 1));
}

export function makeCustomBenchmark(c: CustomBenchmarkInput): Benchmark {
  return { id: 'custom', name: c.label ?? '自訂基準', predict: (y, h) => customForecast(y, h, c) };
}

/** 內建基準（不含 custom，custom 需使用者輸入） */
export const BENCHMARKS: Record<Exclude<BenchmarkId, 'custom'>, Benchmark> = {
  naive: naiveBenchmark,
  drift: driftBenchmark,
  sma20: sma20Benchmark,
  sma60: sma60Benchmark,
  buyhold: buyHoldBenchmark,
};

export const BENCHMARK_IDS = Object.keys(BENCHMARKS) as Exclude<BenchmarkId, 'custom'>[];

export const BENCHMARK_META: Record<BenchmarkId, { name: string; formula: string; note: string }> = {
  naive: { name: naiveBenchmark.name, formula: '\\hat y_{T+i}=y_T', note: 'Theil U 的比較對象；隨機漫步下的最佳點預測。' },
  drift: { name: driftBenchmark.name, formula: '\\hat y_{T+i}=y_T e^{i\\bar\\mu},\\ \\bar\\mu=\\tfrac{\\ln y_T-\\ln y_0}{T}', note: '加上視窗內平均日對數報酬。' },
  sma20: { name: 'SMA 20', formula: '\\hat y=\\tfrac1{20}\\sum_{k=0}^{19}y_{T-k}', note: '水平延伸。' },
  sma60: { name: 'SMA 60', formula: '\\hat y=\\tfrac1{60}\\sum_{k=0}^{59}y_{T-k}', note: '水平延伸；資料不足 60 筆時使用全部資料。' },
  buyhold: { name: '買進持有', formula: 'R_t=P_t/P_0-1', note: '報酬率層面的對照；價格預測等同 naive。' },
  custom: { name: '自訂基準', formula: '\\hat y_{T+i}=y_T+(G-y_T)\\min(i/s,1)', note: '使用者目標價 G、達成步數 s。' },
};

/**
 * 所有基準的 h 期預測（與目標日期對齊）。
 * @param y 過去價格（通常為訓練視窗或全部歷史；SMA60 需要至少 60 筆才是嚴格定義）
 */
export function benchmarkForecasts(y: number[], h: number, custom?: CustomBenchmarkInput | null): Partial<Record<BenchmarkId, number[]>> {
  const out: Partial<Record<BenchmarkId, number[]>> = {};
  for (const id of BENCHMARK_IDS) out[id] = BENCHMARKS[id].predict(y, h);
  if (custom) out.custom = customForecast(y, h, custom);
  return out;
}

// ───────── 報酬率層面（買進持有對照） ─────────

/** 買進持有累積報酬序列 R_t = P_t / P_0 − 1 */
export function buyHoldReturns(prices: number[]): number[] {
  if (!prices.length) return [];
  const p0 = prices[0];
  return prices.map((p) => p / p0 - 1);
}

/**
 * 依方向訊號操作的累積報酬：第 t 天持有部位 s_t ∈ {+1, 0, −1}（由第 t 天收盤時已知資訊決定），
 * 賺取 t → t+1 的報酬。回傳長度 = prices.length（第 0 筆為 0）。
 */
export function strategyReturns(prices: number[], positions: number[]): number[] {
  const out = [0];
  let eq = 1;
  for (let t = 0; t < prices.length - 1; t++) {
    const pos = positions[t] ?? 0;
    eq *= 1 + pos * (prices[t + 1] / prices[t] - 1);
    out.push(eq - 1);
  }
  return out;
}
