/**
 * 第 4 層：集成權重再分配（規格第四節）
 *
 *   ē_m(t) = η·|y_t − ŷ_{m,t}| + (1 − η)·ē_m(t−1)      （η 預設 0.1；首筆 ē = |e|）
 *   w_m    = ē_m^{-2} / Σ_j ē_j^{-2}
 *
 * ŷ_{m,t} 是模型 m 在 t−1 收盤時對 t 的一步預測（引擎保存上一輪預測再與新實際值比對）。
 *
 * 方向規則：每個模型維護最近 k 期（errorWindow）的方向命中紀錄，
 *   命中 ⇔ sign(ŷ_{m,t} − y_{t−1}) = sign(y_t − y_{t−1})。
 * 若滾動方向準確率 < minDirAcc（50%）連續 consecutive（10）期 → 權重暫時歸零並標示原因；
 * 滾動準確率回到 ≥ minDirAcc 時恢復。
 *
 * 狀態可序列化（toJSON / fromJSON），以便每檔代號跨請求 / 排程延續。
 */
import type { ZeroWeightRule } from './types';

export interface ModelWeightState {
  /** 誤差 EWMA ē；尚無觀測時為 null */
  ebar: number | null;
  /** 最近 k 期方向命中（1 / 0），持平期不記錄 */
  hits: number[];
  /** 連續失準期數 */
  belowCount: number;
  zeroed: boolean;
  reason?: string;
  /** 歸零起始步數 */
  zeroedSince?: number;
  /** 已觀測期數 */
  n: number;
}

export interface WeightStatus {
  weight: number;
  ebar: number | null;
  /** 近 k 期方向準確率（無樣本時 null） */
  rollingDirAcc: number | null;
  dirSamples: number;
  belowCount: number;
  zeroed: boolean;
  /** 歸零原因（繁中，介面直接顯示） */
  reason?: string;
  zeroedSince?: number;
}

export interface EnsembleWeightStateData {
  version: 1;
  eta: number;
  k: number;
  rule: ZeroWeightRule;
  step: number;
  models: Record<string, ModelWeightState>;
}

export interface WeightUpdateReport {
  weights: Record<string, number>;
  previous: Record<string, number>;
  /** ½·Σ|w_new − w_old| ∈ [0, 1] */
  shift: number;
  zeroedNow: string[];
  restoredNow: string[];
  /** 所有模型都被歸零時退回不套用歸零規則 */
  allZeroedFallback: boolean;
}

const EPS = 1e-12;

export class EnsembleWeightState {
  private eta: number;
  private k: number;
  private rule: ZeroWeightRule;
  private step = 0;
  private models: Record<string, ModelWeightState> = {};
  private lastFallback = false;

  constructor(modelIds: string[], opts: { eta?: number; k?: number; rule?: Partial<ZeroWeightRule> } = {}) {
    this.eta = opts.eta ?? 0.1;
    this.k = opts.k ?? 20;
    this.rule = { minDirAcc: 0.5, consecutive: 10, ...(opts.rule ?? {}) };
    for (const id of modelIds) this.ensure(id);
  }

  private ensure(id: string): ModelWeightState {
    if (!this.models[id]) this.models[id] = { ebar: null, hits: [], belowCount: 0, zeroed: false, n: 0 };
    return this.models[id];
  }

  ids(): string[] {
    return Object.keys(this.models);
  }

  /** 加入新成員（例如使用者新開啟模型） */
  addModel(id: string) {
    this.ensure(id);
  }

  removeModel(id: string) {
    delete this.models[id];
  }

  /** 單一成員的 EWMA 更新（公開以便單元測試） */
  static ewma(prev: number | null, absErr: number, eta: number): number {
    return prev === null ? absErr : eta * absErr + (1 - eta) * prev;
  }

  /**
   * 以新實際值更新所有成員。
   * @param actual   y_t
   * @param prevPrice y_{t−1}（方向判斷基準）
   * @param preds    各模型上一輪對 t 的一步預測 ŷ_{m,t}；缺少或非有限值的模型本輪不更新
   * @param active   參與權重計算的成員（預設全部）
   */
  update(actual: number, prevPrice: number, preds: Record<string, number>, active?: string[]): WeightUpdateReport {
    const previous = this.weights(active);
    const zeroedNow: string[] = [];
    const restoredNow: string[] = [];
    this.step++;
    for (const [id, pred] of Object.entries(preds)) {
      if (!Number.isFinite(pred) || !Number.isFinite(actual)) continue;
      const s = this.ensure(id);
      s.ebar = EnsembleWeightState.ewma(s.ebar, Math.abs(actual - pred), this.eta);
      s.n++;
      const sf = Math.sign(pred - prevPrice);
      const sa = Math.sign(actual - prevPrice);
      if (sf !== 0 && sa !== 0) {
        s.hits.push(sf === sa ? 1 : 0);
        if (s.hits.length > this.k) s.hits.shift();
      }
      const acc = s.hits.length ? s.hits.reduce((a, b) => a + b, 0) / s.hits.length : null;
      if (acc !== null && acc < this.rule.minDirAcc) s.belowCount++;
      else if (acc !== null) s.belowCount = 0;
      if (!s.zeroed && s.belowCount >= this.rule.consecutive) {
        s.zeroed = true;
        s.zeroedSince = this.step;
        s.reason = `方向準確率 ${(acc! * 100).toFixed(0)}%（近 ${s.hits.length} 期）低於 ${(this.rule.minDirAcc * 100).toFixed(0)}% 已連續 ${s.belowCount} 期，權重暫時歸零`;
        zeroedNow.push(id);
      } else if (s.zeroed && acc !== null && acc >= this.rule.minDirAcc) {
        s.zeroed = false;
        s.reason = undefined;
        s.zeroedSince = undefined;
        restoredNow.push(id);
      }
    }
    const weights = this.weights(active);
    const keys = new Set([...Object.keys(previous), ...Object.keys(weights)]);
    let shift = 0;
    for (const key of keys) shift += Math.abs((weights[key] ?? 0) - (previous[key] ?? 0));
    return { weights, previous, shift: shift / 2, zeroedNow, restoredNow, allZeroedFallback: this.lastFallback };
  }

  /** 目前權重 w_m = ē_m^{-2} / Σ ē_j^{-2}（歸零者 0）；無誤差資訊時等權 */
  weights(active?: string[]): Record<string, number> {
    const ids = (active ?? this.ids()).filter((id) => this.models[id] || active);
    for (const id of ids) this.ensure(id);
    const compute = (useZero: boolean) => {
      const raw: Record<string, number> = {};
      const known = ids.filter((id) => this.models[id].ebar !== null && (!useZero || !this.models[id].zeroed));
      const unknown = ids.filter((id) => this.models[id].ebar === null && (!useZero || !this.models[id].zeroed));
      for (const id of known) raw[id] = 1 / Math.max(this.models[id].ebar!, EPS) ** 2;
      // 尚無誤差資訊的成員給予已知成員的中位數權重（全部未知 → 等權）
      const vals = Object.values(raw).sort((a, b) => a - b);
      const med = vals.length ? vals[Math.floor(vals.length / 2)] : 1;
      for (const id of unknown) raw[id] = med;
      return raw;
    };
    let raw = compute(true);
    this.lastFallback = false;
    if (!Object.keys(raw).length && ids.length) {
      raw = compute(false);
      this.lastFallback = true;
    }
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    const out: Record<string, number> = {};
    for (const id of ids) out[id] = total > 0 && raw[id] !== undefined ? raw[id] / total : 0;
    return out;
  }

  status(active?: string[]): Record<string, WeightStatus> {
    const w = this.weights(active);
    const out: Record<string, WeightStatus> = {};
    for (const id of Object.keys(w)) {
      const s = this.models[id];
      const acc = s.hits.length ? s.hits.reduce((a, b) => a + b, 0) / s.hits.length : null;
      out[id] = {
        weight: w[id],
        ebar: s.ebar,
        rollingDirAcc: acc,
        dirSamples: s.hits.length,
        belowCount: s.belowCount,
        zeroed: s.zeroed,
        reason: s.zeroed ? s.reason : this.lastFallback ? '所有模型皆觸發歸零規則，暫不套用歸零' : undefined,
        zeroedSince: s.zeroedSince,
      };
    }
    return out;
  }

  get currentStep() {
    return this.step;
  }

  toJSON(): EnsembleWeightStateData {
    return { version: 1, eta: this.eta, k: this.k, rule: { ...this.rule }, step: this.step, models: structuredClone(this.models) };
  }

  static fromJSON(d: EnsembleWeightStateData): EnsembleWeightState {
    const s = new EnsembleWeightState([], { eta: d.eta, k: d.k, rule: d.rule });
    s.step = d.step;
    s.models = structuredClone(d.models);
    return s;
  }
}

/** 依權重組合多個 Forecast（點預測與區間上下界皆為加權平均） */
export function combineForecasts(
  forecasts: Record<string, { mean: number[]; lower: number[]; upper: number[] }>,
  weights: Record<string, number>,
): { mean: number[]; lower: number[]; upper: number[] } | null {
  const ids = Object.keys(forecasts).filter((id) => (weights[id] ?? 0) > 0);
  if (!ids.length) return null;
  const h = Math.min(...ids.map((id) => forecasts[id].mean.length));
  const tw = ids.reduce((a, id) => a + weights[id], 0);
  const mean = new Array<number>(h).fill(0);
  const lower = new Array<number>(h).fill(0);
  const upper = new Array<number>(h).fill(0);
  for (const id of ids) {
    const w = weights[id] / tw;
    const f = forecasts[id];
    for (let i = 0; i < h; i++) {
      mean[i] += w * f.mean[i];
      lower[i] += w * f.lower[i];
      upper[i] += w * f.upper[i];
    }
  }
  return { mean, lower, upper };
}
