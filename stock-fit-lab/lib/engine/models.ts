/**
 * 引擎取得模型實例的唯一入口。預設使用 lib/models/registry 的基礎模型；
 * 進階模型或測試替身可透過 EngineDeps.createModel 注入。
 */
import type { ForecastModel, ModelId } from '../types';
import { BASIC_FACTORIES } from '../models/registry';
import { normalCdf, zForLevel } from '../math/stats';

export type CreateModel = (id: ModelId) => ForecastModel;

export interface EngineDeps {
  /** 自訂模型工廠（回傳 undefined 時退回預設 registry） */
  createModel?: (id: ModelId) => ForecastModel | undefined;
  /** 時鐘（測試可注入固定時間） */
  now?: () => Date;
  /** 快照 id 產生器 */
  newId?: () => string;
}

export function makeCreateModel(deps: EngineDeps = {}): CreateModel {
  return (id: ModelId) => {
    const custom = deps.createModel?.(id);
    if (custom) return custom;
    const f = (BASIC_FACTORIES as Record<string, (() => ForecastModel) | undefined>)[id];
    if (!f) throw new Error(`模型 ${id} 不在基礎模型註冊表中（進階模型請改走背景任務或注入 createModel）`);
    return f();
  };
}

/** 是否為 RLS 線上更新的多項式 / 線性類模型 */
export function isRlsModel(id: ModelId, model: ForecastModel): boolean {
  return typeof (model as unknown as { getRlsTrace?: unknown }).getRlsTrace === 'function' || id === 'poly' || id === 'linchannel';
}

export function isKalmanModel(id: ModelId, model: ForecastModel): boolean {
  return id === 'kalman' || typeof (model as unknown as { getAlerts?: unknown }).getAlerts === 'function';
}

export function getKalmanTrace(model: ForecastModel) {
  const m = model as unknown as { getTrace?: () => unknown[]; getAlerts?: () => unknown[] };
  return {
    trace: (typeof m.getTrace === 'function' ? m.getTrace() : []) as import('./types').KalmanTracePoint[],
    alerts: (typeof m.getAlerts === 'function' ? m.getAlerts() : []) as import('./types').KalmanAlert[],
  };
}

export function getRlsTrace(model: ForecastModel) {
  const m = model as unknown as { getRlsTrace?: () => unknown[] };
  return (typeof m.getRlsTrace === 'function' ? m.getRlsTrace() : []) as import('./types').RlsTracePoint[];
}

/** 由 Forecast 區間反推常態近似的 P(價格 > last)：P = Φ((μ_i − last)/σ_i)，σ_i = (U_i − L_i)/(2z) */
export function pUpFromForecast(f: { mean: number[]; lower: number[]; upper: number[]; level: number }, last: number): number[] {
  const z = zForLevel(f.level);
  return f.mean.map((m, i) => {
    const sd = Math.max((f.upper[i] - f.lower[i]) / (2 * z), 1e-12);
    return Math.min(0.999, Math.max(0.001, normalCdf((m - last) / sd)));
  });
}
