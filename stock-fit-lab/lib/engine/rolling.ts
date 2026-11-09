/**
 * 第 1 層：滾動視窗重擬合。
 * 以最近 N 筆資料重新擬合所有選定模型，觀測權重 w_i = λ^(T−i)（最新一筆 = 1）。
 * 每個模型獨立 try/catch：單一模型失敗不影響其他模型。
 */
import type { ForecastModel, ModelId } from '../types';
import { decayWeights } from '../math/timeaxis';
import type { EngineConfig } from './types';
import type { CreateModel } from './models';

export interface FitOutcome {
  id: ModelId;
  model: ForecastModel | null;
  ok: boolean;
  error?: string;
  ms: number;
}

/** 取最近 N 筆：回傳視窗與其在原序列的起始索引 */
export function trailingWindow<T>(arr: T[], n: number): { slice: T[]; start: number } {
  const start = Math.max(0, arr.length - n);
  return { slice: arr.slice(start), start };
}

export function fitOptionsFor(id: ModelId, n: number, config: EngineConfig) {
  return {
    priceMode: config.priceMode,
    weights: config.lambda < 1 ? decayWeights(n, config.lambda) : undefined,
    params: config.params[id],
    seed: config.seed,
  };
}

/** 擬合單一模型（新實例），失敗時回傳錯誤訊息 */
export function fitModel(create: CreateModel, id: ModelId, y: number[], config: EngineConfig): FitOutcome {
  const t0 = performance.now();
  try {
    const model = create(id).fit(y, fitOptionsFor(id, y.length, config));
    return { id, model, ok: true, ms: performance.now() - t0 };
  } catch (e) {
    return { id, model: null, ok: false, error: e instanceof Error ? e.message : String(e), ms: performance.now() - t0 };
  }
}

/** 對所有選定模型（不含 ensemble）以最近 N 筆重擬合 */
export function rollingRefit(create: CreateModel, ids: ModelId[], prices: number[], config: EngineConfig): Record<string, FitOutcome> {
  const { slice } = trailingWindow(prices, config.window);
  const out: Record<string, FitOutcome> = {};
  for (const id of ids) {
    if (id === 'ensemble') continue;
    out[id] = fitModel(create, id, slice, config);
  }
  return out;
}
