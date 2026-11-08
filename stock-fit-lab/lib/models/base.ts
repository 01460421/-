/**
 * 模型共用基底：提供時間軸、價格空間轉換、預設 direction() 與 update() 實作。
 * 具體模型只需實作 fitCore / predictCore / describeCore（可選擇覆寫 update 以提供線上更新）。
 */
import type { DirectionOutput, FitOptions, Forecast, ForecastModel, ModelDescription, ModelId, ParamSpec, PriceMode } from '../types';
import { makeTimeAxis, type TimeAxis } from '../math/timeaxis';
import { normalCdf, zForLevel, clamp } from '../math/stats';

export abstract class BaseModel implements ForecastModel {
  abstract readonly id: ModelId;
  abstract readonly version: string;

  /** 原始價格序列（訓練視窗） */
  protected y: number[] = [];
  protected opts: FitOptions = {};
  protected axis: TimeAxis = makeTimeAxis(1);
  protected fittedValues: number[] = [];
  /** 模型空間（raw 或 log）的殘差標準差，用於預設區間 */
  protected sigma = 0;
  /** 擬合失敗而降級時的說明 */
  protected degraded: string | null = null;

  get priceMode(): PriceMode {
    return this.opts.priceMode ?? 'raw';
  }

  /** 讀取使用者參數或預設值 */
  protected param(key: string, fallback: number): number {
    const v = this.opts.params?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }

  fit(y: number[], opts: FitOptions = {}): this {
    if (y.length < 3) throw new Error(`${this.id}: 至少需要 3 筆資料`);
    if (y.some((v) => !Number.isFinite(v) || v <= 0)) throw new Error(`${this.id}: 價格必須為正有限數`);
    this.y = y.slice();
    this.opts = { ...opts };
    this.axis = makeTimeAxis(y.length);
    this.degraded = null;
    this.fitCore();
    return this;
  }

  /** 子類別實作：使用 this.y / this.axis / this.opts 擬合，並設定 fittedValues 與 sigma */
  protected abstract fitCore(): void;

  /** 子類別實作：回傳 h 期預測（原始價格空間） */
  protected abstract predictCore(h: number, level: number): Forecast;

  protected abstract describeCore(): Omit<ModelDescription, 'id' | 'version' | 'diagnostics'> & {
    diagnostics?: ModelDescription['diagnostics'];
  };

  abstract paramSpecs(): ParamSpec[];

  fitted(): number[] {
    return this.fittedValues.slice();
  }

  residuals(): number[] {
    return this.y.map((v, i) => v - this.fittedValues[i]);
  }

  predict(h: number, level = 0.9): Forecast {
    if (!this.y.length) throw new Error(`${this.id}: 尚未擬合`);
    const f = this.predictCore(Math.max(1, Math.floor(h)), level);
    // 數值防護：區間必須包住平均且為正
    for (let i = 0; i < f.horizon; i++) {
      if (!Number.isFinite(f.mean[i])) f.mean[i] = this.last();
      f.lower[i] = Math.max(Math.min(f.lower[i], f.mean[i]), 1e-9);
      f.upper[i] = Math.max(f.upper[i], f.mean[i]);
    }
    return f;
  }

  /**
   * 預設線上更新：把新點加入尾端並重擬合（保持視窗長度不變則丟掉最舊一筆）。
   * 有遞迴公式的模型（多項式 RLS、卡爾曼）應覆寫此方法。
   */
  update(newPoint: number): this {
    const keep = this.opts.weights ? this.y.length : this.y.length;
    const y = [...this.y, newPoint].slice(-keep);
    const weights = this.opts.weights ? this.opts.weights.slice(-keep) : undefined;
    return this.fit(y, { ...this.opts, weights });
  }

  /**
   * 預設方向機率：假設第 h 期預測分布近似常態，
   *   P(up) = Φ((μ_h − P_T) / σ_h)，σ_h 由 90% 區間寬度反推。
   * 方向分類頭（lib/direction）會在此基礎上以樣本外資料重新校準。
   */
  direction(h: number): DirectionOutput {
    const f = this.predict(h, 0.9);
    const i = f.horizon - 1;
    const z = zForLevel(f.level);
    const sd = Math.max((f.upper[i] - f.lower[i]) / (2 * z), 1e-12);
    const pUp = clamp(normalCdf((f.mean[i] - this.last()) / sd), 0.001, 0.999);
    return { pUp, signal: pUp > 0.5 ? 'up' : pUp < 0.5 ? 'down' : 'neutral' };
  }

  describe(): ModelDescription {
    const d = this.describeCore();
    return {
      id: this.id,
      version: this.version,
      ...d,
      diagnostics: {
        n: this.y.length,
        priceMode: this.priceMode,
        sigma: this.sigma,
        degraded: this.degraded ?? false,
        weighted: !!this.opts.weights,
        ...(d.diagnostics ?? {}),
      },
    };
  }

  protected last(): number {
    return this.y[this.y.length - 1];
  }

  /** 工具：模型空間序列 */
  protected ys(): number[] {
    return this.priceMode === 'log' ? this.y.map(Math.log) : this.y.slice();
  }

  protected back(v: number): number {
    return this.priceMode === 'log' ? Math.exp(v) : v;
  }

  /**
   * 工具：由模型空間的點預測與標準差產生原始價格空間 Forecast。
   * log 模式下區間經 exp 轉換後自然不對稱。
   */
  protected makeForecast(meanModel: number[], sdModel: number[], level: number): Forecast {
    const z = zForLevel(level);
    return {
      horizon: meanModel.length,
      mean: meanModel.map((m) => this.back(m)),
      lower: meanModel.map((m, i) => this.back(m - z * sdModel[i])),
      upper: meanModel.map((m, i) => this.back(m + z * sdModel[i])),
      level,
    };
  }
}

/** AIC / BIC（高斯概似，k = 參數數） */
export function informationCriteria(rss: number, n: number, k: number): { aic: number; bic: number } {
  const s2 = Math.max(rss / n, 1e-300);
  const ll = -0.5 * n * (Math.log(2 * Math.PI * s2) + 1);
  return { aic: 2 * k - 2 * ll, bic: k * Math.log(n) - 2 * ll };
}
