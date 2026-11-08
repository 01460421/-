/**
 * 全專案共用的核心型別。所有模組（模型、基準、指標、偵測器、資料源、儲存、前端）
 * 都只依賴這裡的型別互相溝通。修改這個檔案等同修改跨模組合約。
 */

// ───────────────────────────── 市場與行情 ─────────────────────────────

/** TW = 上市（.TW），TWO = 上櫃（.TWO），US = 美股 */
export type Market = 'TW' | 'TWO' | 'US';

/** 單根 K 棒。t 為 epoch 毫秒（UTC），date 為交易所當地日期 YYYY-MM-DD。 */
export interface Bar {
  t: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** 還原價（除權息 / 分割調整後收盤價）。模型預設使用 adjClose ?? close。 */
  adjClose?: number;
  /** 此筆是否為缺值以前值填補（介面需標記）。 */
  filled?: boolean;
}

export type Interval = '1m' | '5m' | '15m' | '60m' | '1d' | '1wk' | '1mo';

/** 所有 Adapter 回傳的統一 OHLCV 結構。 */
export interface PriceSeries {
  symbol: string; // 正規化代號，例如 2330.TW / 6488.TWO / AAPL
  market: Market;
  currency: string;
  interval: Interval;
  /** 資料來源名稱（介面必須顯示），例如 "FinMind"、"Yahoo Finance" */
  source: string;
  /** 抓取時間 ISO 字串 */
  fetchedAt: string;
  /** 最後一根 K 棒的資料時間 ISO 字串 */
  asOf: string;
  /** 資料延遲分鐘數（例如 15；日線收盤資料為 0） */
  delayMinutes: number;
  /** 是否為資料源失敗後的快取降級資料 */
  stale?: boolean;
  /** 價格是否已還原（除權息 / 分割） */
  adjusted: boolean;
  bars: Bar[];
}

// ───────────────────────────── 模型 ─────────────────────────────

export type BasicModelId =
  | 'poly'
  | 'exp'
  | 'log'
  | 'logistic'
  | 'fourier'
  | 'linchannel'
  | 'holtwinters'
  | 'arima'
  | 'gbm'
  | 'kalman'
  | 'ensemble';

export type AdvancedModelId =
  | 'garch'
  | 'egarch'
  | 'msar'
  | 'gp'
  | 'wavelet'
  | 'emd'
  | 'bsts'
  | 'stacking';

export type ModelId = BasicModelId | AdvancedModelId;

/** 可調參數規格：前端以滑桿 + 數值輸入呈現。 */
export interface ParamSpec {
  key: string;
  label: string; // 繁中標籤
  min: number;
  max: number;
  step: number;
  default: number;
  /** 'auto' 代表此參數預設由模型自動選擇（例如 ARIMA 階數、多項式次數 AIC） */
  auto?: boolean;
  help?: string;
}

export type PriceMode = 'raw' | 'log';

export interface FitOptions {
  /** 價格空間：原始價或對數價（模型內部轉換，輸出一律回到原始價格空間） */
  priceMode?: PriceMode;
  /**
   * 觀測權重（長度同 y）。滾動視窗重擬合時由引擎傳入 w_i = λ^(T−i)。
   * 未支援加權的模型可忽略，但須在 describe().diagnostics.weighted = false 標示。
   */
  weights?: number[];
  /** 使用者調整的參數；未提供的鍵使用預設或自動選擇 */
  params?: Record<string, number>;
  /** 外生變數矩陣（列 = 時間，欄 = 變數），僅部分進階模型使用 */
  exog?: number[][];
  /** 隨機種子（蒙地卡羅類模型必須可重現） */
  seed?: number;
}

/** h 期預測。所有陣列長度 = horizon，第 i 個元素為 t+i+1 期。價格空間。 */
export interface Forecast {
  horizon: number;
  mean: number[];
  lower: number[];
  upper: number[];
  /** 信賴水準，例如 0.9 */
  level: number;
}

export interface DirectionOutput {
  /** P(第 h 期價格 > 最後觀測價) */
  pUp: number;
  /** 依信心門檻判斷的訊號；門檻由呼叫端決定，模型預設 0.5 二分 */
  signal: 'up' | 'down' | 'neutral';
}

export interface ModelDescription {
  id: ModelId;
  name: string; // 繁中名稱
  version: string;
  /** KaTeX 可渲染的公式 */
  formulaLatex: string;
  /** 已擬合的參數（可序列化進快照） */
  params: Record<string, number | number[] | string>;
  paramSpecs: ParamSpec[];
  /** 適用情境 */
  useCases: string;
  /** 常見失效情境 */
  failureModes: string;
  /** 推導 / 說明（Markdown + $LaTeX$） */
  derivation: string;
  /** 診斷值：AIC、BIC、Ljung–Box、條件數、是否降級等 */
  diagnostics: Record<string, number | string | boolean | number[]>;
}

/**
 * 每個模型檔都必須實作此介面（規格第九節）。
 * 約定：
 *  - fit(y) 的 y 為「訓練視窗內」的價格序列（原始價格空間，時間由舊到新）。
 *  - 模型內部自行把時間軸標準化到 [-1, 1]，外推時沿用同一個線性映射。
 *  - fitted() 回傳與 y 同長度的樣本內擬合值（原始價格空間）。
 *  - update(newPoint) 把一個新觀測加到序列尾端並以「線上」方式修正參數；
 *    沒有線上公式的模型可以內部 refit，但結果必須等價於 fit(y.concat(newPoint))。
 *  - 不得讀取 y 以外的任何未來資訊。
 */
export interface ForecastModel {
  readonly id: ModelId;
  readonly version: string;
  fit(y: number[], opts?: FitOptions): this;
  fitted(): number[];
  residuals(): number[];
  predict(h: number, level?: number): Forecast;
  update(newPoint: number): this;
  direction(h: number): DirectionOutput;
  describe(): ModelDescription;
}

export type ModelFactory = () => ForecastModel;

// ───────────────────────────── 基準 ─────────────────────────────

export type BenchmarkId = 'naive' | 'drift' | 'sma20' | 'sma60' | 'buyhold' | 'custom';

export interface Benchmark {
  id: BenchmarkId;
  name: string;
  /** 只使用 y（過去資料）產生 h 期預測 */
  predict(y: number[], h: number): number[];
}

// ───────────────────────────── 指標 ─────────────────────────────

export interface MetricSet {
  n: number;
  mae: number;
  rmse: number;
  mape: number; // 百分比，例如 1.23 代表 1.23%
  directionAccuracy: number; // 0–1
  theilU: number;
  coverage: number; // 0–1，實際值落在區間內比例
  brier?: number;
}

// ───────────────────────────── 快照（append-only） ─────────────────────────────

export interface PredictionSnapshot {
  id: string; // uuid
  createdAt: string; // 快照時間戳 ISO
  symbol: string;
  modelId: ModelId | BenchmarkId | 'ai';
  modelVersion: string;
  params: Record<string, unknown>;
  trainStart: string; // 訓練視窗起 YYYY-MM-DD
  trainEnd: string; // 訓練視窗迄（= 發出預測時最後已知日期）
  lastPrice: number;
  /** 目標日期（交易日）與對應預測值 */
  targetDates: string[];
  mean: number[];
  lower: number[];
  upper: number[];
  level: number;
  pUp?: number[];
  signal?: ('up' | 'down' | 'neutral')[];
  /** 當時使用的基準值（與 targetDates 對齊） */
  benchmarks: Partial<Record<BenchmarkId, number[]>>;
  /** 當時集成權重 */
  ensembleWeights?: Record<string, number>;
  /** 修正層紀錄：哪一層觸發這次快照 */
  trigger: 'refit' | 'rls' | 'kalman' | 'ensemble' | 'schedule' | 'manual';
  /** AI 建議快照（modelId = 'ai'）時存放結構化建議 */
  aiPayload?: unknown;
}

/** 回填結果：與快照分表存放，快照本身永不修改。 */
export interface SnapshotOutcome {
  snapshotId: string;
  targetDate: string;
  horizonIndex: number; // 0-based，對應 targetDates[i]
  actual: number;
  error: number; // actual - mean
  absPctError: number; // |error| / actual * 100
  inInterval: boolean;
  directionCorrect: boolean | null; // 相對 lastPrice
  filledAt: string;
}

// ───────────────────────────── 事件與偵測 ─────────────────────────────

export type EventKind =
  | 'job_run'
  | 'job_error'
  | 'detector'
  | 'ai_advice'
  | 'notification'
  | 'structural_break'
  | 'weight_shift'
  | 'leak_suspect'
  | 'data_source_error';

export interface SystemEvent {
  id: string;
  at: string;
  kind: EventKind;
  symbol?: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail: Record<string, unknown>;
}

export interface DetectorHit {
  detector: string; // 例如 'residual_z'、'cusum'、'pelt'、'volume_spike'、'page_hinkley'
  index: number; // 在序列中的位置
  date: string;
  severity: 'info' | 'warn' | 'critical';
  message: string;
  value: number;
  threshold: number;
  /** 是否與事件日（財報、除權息、法說會）重疊 */
  overlapsEvent?: string;
}

// ───────────────────────────── 自選股、對話 ─────────────────────────────

export interface WatchlistItem {
  userId: string;
  symbol: string;
  market: Market;
  name?: string;
  addedAt: string;
  source: 'manual' | 'yahoo_csv' | 'tradingview_csv';
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolCallId?: string;
  at: string;
}

export interface Conversation {
  id: string;
  userId: string;
  symbol: string;
  createdAt: string;
  messages: ChatMessage[];
  /** 對話當下引用的資料快照摘要（情境 JSON） */
  contextSnapshot: unknown;
}
