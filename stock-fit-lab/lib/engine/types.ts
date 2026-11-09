/**
 * 即時修正引擎的公開型別（前端與 AI 助理直接消費 AnalysisResult）。
 *
 * 四層修正（規格第四節，使用者可逐層開關）：
 *   1 rollingRefit     滾動視窗重擬合：最近 N 筆 + 指數衰減權重 w_i = λ^(T−i)
 *   2 rls              遞迴最小平方：多項式 / 線性類模型以 model.update() 線上更新
 *   3 kalman           卡爾曼「預測—更新」：kalman 模型以 model.update() 執行，記錄增益 K_t
 *   4 ensembleReweight 集成權重再分配：ē_m 指數移動平均 → w_m ∝ ē_m^{-2}，方向準確率規則歸零
 */
import type { BenchmarkId, DirectionOutput, Forecast, ModelDescription, ModelId, PriceMode, PredictionSnapshot, SystemEvent, Market } from '../types';
import type { CustomBenchmarkInput } from '../benchmarks';
import type { WeightStatus } from './ensemble-weights';

export interface LayerToggles {
  /** 第 1 層：滾動視窗重擬合 */
  rollingRefit: boolean;
  /** 第 2 層：RLS 線上更新（多項式 / 線性類） */
  rls: boolean;
  /** 第 3 層：卡爾曼預測—更新 */
  kalman: boolean;
  /** 第 4 層：集成權重再分配 */
  ensembleReweight: boolean;
}

export interface ZeroWeightRule {
  /** 滾動方向準確率低於此值視為「失準」（預設 0.5） */
  minDirAcc: number;
  /** 連續失準期數達此值時權重暫時歸零（預設 10） */
  consecutive: number;
}

export interface EngineConfig {
  /** 滾動視窗長度 N（預設 120） */
  window: number;
  /** 衰減係數 λ（預設 0.97）；1 = 等權 */
  lambda: number;
  /** 預測期數 h（1–60，預設 20） */
  horizon: number;
  /** 信賴水準（預設 0.9） */
  level: number;
  /** 啟用的模型；含 'ensemble' 時輸出集成結果 */
  models: ModelId[];
  /** 每個模型的使用者參數 */
  params: Partial<Record<ModelId, Record<string, number>>>;
  priceMode: PriceMode;
  layers: LayerToggles;
  /** 誤差 EWMA 平滑係數 η（預設 0.1） */
  eta: number;
  /** 滾動方向準確率視窗 k（預設 20） */
  errorWindow: number;
  zeroWeightRule: ZeroWeightRule;
  /**
   * 線上更新（RLS / 卡爾曼）的模型在第 1 層開啟時，每隔多少根 K 棒以滾動視窗重新錨定一次
   * （避免 RLS 視窗無限增長）。0 = 不重新錨定。預設 20。
   */
  reanchorEvery: number;
  /** 權重重分配幅度（½·Σ|Δw|）超過此值時發出 weight_shift 事件（預設 0.2） */
  weightShiftThreshold: number;
  /**
   * 集成權重初始化：'insample' 以訓練視窗最後 k 筆的樣本內殘差初始化（快）；
   * 'oos' 以最後 k 個起點做一步樣本外預測初始化（較慢、較嚴謹）。
   */
  weightInit: 'insample' | 'oos';
  /** 使用者自訂基準 */
  customBenchmark?: CustomBenchmarkInput | null;
  /** 蒙地卡羅模型種子 */
  seed: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  window: 120,
  lambda: 0.97,
  horizon: 20,
  level: 0.9,
  models: ['poly', 'exp', 'log', 'logistic', 'fourier', 'linchannel', 'holtwinters', 'arima', 'gbm', 'kalman', 'ensemble'],
  params: {},
  priceMode: 'raw',
  layers: { rollingRefit: true, rls: true, kalman: true, ensembleReweight: true },
  eta: 0.1,
  errorWindow: 20,
  zeroWeightRule: { minDirAcc: 0.5, consecutive: 10 },
  reanchorEvery: 20,
  weightShiftThreshold: 0.2,
  weightInit: 'insample',
  customBenchmark: null,
  seed: 42,
};

/** 合併部分設定並夾限範圍 */
export function resolveConfig(partial: Partial<EngineConfig> = {}): EngineConfig {
  const c: EngineConfig = {
    ...DEFAULT_ENGINE_CONFIG,
    ...partial,
    layers: { ...DEFAULT_ENGINE_CONFIG.layers, ...(partial.layers ?? {}) },
    zeroWeightRule: { ...DEFAULT_ENGINE_CONFIG.zeroWeightRule, ...(partial.zeroWeightRule ?? {}) },
    params: { ...(partial.params ?? {}) },
    models: partial.models?.length ? [...new Set(partial.models)] : [...DEFAULT_ENGINE_CONFIG.models],
  };
  c.window = Math.max(10, Math.floor(c.window));
  c.horizon = Math.min(60, Math.max(1, Math.floor(c.horizon)));
  c.lambda = Math.min(1, Math.max(0.5, c.lambda));
  c.level = Math.min(0.999, Math.max(0.5, c.level));
  c.eta = Math.min(1, Math.max(1e-4, c.eta));
  c.errorWindow = Math.max(2, Math.floor(c.errorWindow));
  return c;
}

/** 每個模型這一輪是被哪一層更新的 */
export type UpdatedBy = 'refit' | 'rls' | 'kalman' | 'frozen' | 'ensemble';

/** 單一模型的執行結果（價格空間） */
export interface ModelRunResult {
  id: ModelId;
  /** 繁中名稱（describe().name） */
  name: string;
  version: string;
  ok: boolean;
  /** 擬合 / 更新失敗訊息（ok = false 時） */
  error?: string;
  /** 樣本內擬合值；第 0 筆對應日期 fittedFrom，最後一筆對應 fittedTo（以日期對齊主圖） */
  fitted: number[];
  /** 殘差 y − ŷ，與 fitted 對齊 */
  residuals: number[];
  fittedFrom: string | null;
  fittedTo: string | null;
  /** 從 lastDate 起 h 期預測（與 AnalysisResult.targetDates 對齊）；失敗時 null */
  forecast: Forecast | null;
  /** 第 h 期方向（model.direction(h)） */
  direction: DirectionOutput | null;
  /** 每個目標日的 P(價格 > lastPrice)（由區間寬度反推的常態近似，最後一期以 model.direction 取代） */
  pUp: number[];
  /** describe()：公式、參數、診斷值（ensemble 為引擎組合描述） */
  description: ModelDescription | null;
  /** 本輪由哪一層更新 */
  updatedBy: UpdatedBy;
  /** 模型凍結（所有可用層都關閉）時落後的 K 棒數 */
  staleBars: number;
  /** 本輪擬合 / 更新耗時（毫秒） */
  fitMs: number;
}

export interface KalmanTracePoint {
  step: number;
  gain: [number, number];
  innovation: number;
  innovationSd: number;
  level: number;
  slope: number;
  qScale: number;
}

export interface KalmanAlert {
  step: number;
  message: string;
  qScale: number;
}

export interface RlsTracePoint {
  step: number;
  gain: number[];
  innovation: number;
  forgetting: number;
}

export interface AnalysisResult {
  symbol: string;
  market: Market;
  currency: string;
  /** 資料來源（介面必須顯示） */
  source: string;
  /** 資料時間（PriceSeries.asOf） */
  asOf: string;
  /** 本結果產生時間 ISO */
  generatedAt: string;
  /** 最後一根 K 棒日期（= 預測起點） */
  lastDate: string;
  /** 預測起點價格（adjClose ?? close） */
  lastPrice: number;
  /** 模型使用的價格欄位 */
  priceField: 'adjClose' | 'close';
  /** 滾動視窗起訖日（最近一次全量重擬合的視窗；線上更新後 trainEnd = lastDate） */
  trainStart: string;
  trainEnd: string;
  trainSize: number;
  horizon: number;
  level: number;
  /** 預測目標交易日（nextTradingDays(market, lastDate, h)） */
  targetDates: string[];
  /** 價格歷史（視窗 + 線上更新區段），fitted 以日期對齊這裡 */
  history: { dates: string[]; prices: number[] };
  /** 各模型結果（含 'ensemble'），鍵 = ModelId */
  results: Partial<Record<ModelId, ModelRunResult>>;
  /** 顯示順序 */
  order: ModelId[];
  /** 基準 h 期預測，與 targetDates 對齊 */
  benchmarks: Partial<Record<BenchmarkId, number[]>>;
  /** 集成權重（成員模型 id → 權重，總和 1；被歸零者為 0） */
  ensembleWeights: Record<string, number>;
  /** 每個成員的權重狀態：ē、滾動方向準確率、是否歸零與原因 */
  weightStatus: Record<string, WeightStatus>;
  /** 卡爾曼增益軌跡（kalman 模型有啟用時） */
  kalmanTrace: KalmanTracePoint[];
  /** 結構性變化警示（殘差連續三期 > 2σ，Q 自動放大） */
  kalmanAlerts: KalmanAlert[];
  /** RLS 增益 / 遺忘因子軌跡（鍵 = 模型 id） */
  rlsTrace: Record<string, RlsTracePoint[]>;
  /** 最近一次修正各層是否執行與影響的模型 */
  layersRun: { rollingRefit: ModelId[]; rls: ModelId[]; kalman: ModelId[]; ensembleReweight: boolean };
  config: EngineConfig;
  timings: { totalMs: number; perModelMs: Record<string, number>; benchmarksMs: number; ensembleMs: number };
  warnings: string[];
}

/** CorrectionSession.ingest 的輸出 */
export interface IngestResult {
  result: AnalysisResult;
  /** 本次修正需寫入的快照（已凍結，append-only） */
  snapshots: PredictionSnapshot[];
  /** 本次修正產生的事件（structural_break / weight_shift） */
  events: SystemEvent[];
  /** 同日盤中價覆寫上一根 K 棒時為 true */
  replacedLastBar: boolean;
}
