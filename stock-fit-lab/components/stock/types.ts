/**
 * 分析頁（/stock/[symbol]）前後端共用的型別。只含 type，前端可安全引用。
 */
import type { AnalysisResult, EngineConfig, LayerToggles } from '@/lib/engine/types';
import type { DetectorHit, Market, ModelId, PriceMode } from '@/lib/types';
import type { CorporateEvent } from '@/lib/data-adapters/types';
import type { MarketStatus } from '@/lib/calendar';

export type RangeKey = '3m' | '6m' | '1y' | '2y' | '5y';
export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '3m', label: '3 個月' },
  { key: '6m', label: '6 個月' },
  { key: '1y', label: '1 年' },
  { key: '2y', label: '2 年' },
  { key: '5y', label: '5 年' },
];

export interface SeriesMeta {
  source: string;
  asOf: string;
  fetchedAt: string;
  delayMinutes: number;
  stale: boolean;
  adjusted: boolean;
  filled: number;
  bars: number;
  currency: string;
  market: Market;
  interval: string;
}

export interface OhlcData {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  /** 該日是否為缺值填補 */
  filled: boolean[];
}

export interface DirectionFilterInfo {
  adx?: number;
  hurst?: number;
  regime?: { labels: string[]; probs: number[] };
  /** 與門檻無關的濾網判定（假設已出手時是否會被擋下） */
  blockedBy: ('adx' | 'hurst' | 'regime')[];
  reasons: string[];
}

export interface DirectionInfo {
  horizon: number;
  /** 集成 P(上漲)（第 h 期） */
  pUp: number | null;
  thresholds: { upper: number; lower: number };
  /** 只依門檻的訊號 */
  rawSignal: 'up' | 'down' | 'neutral';
  /** 套用濾網與多尺度共識後的訊號 */
  signal: 'up' | 'down' | 'neutral';
  consensus: {
    agree: boolean;
    direction: 'up' | 'down' | 'mixed';
    pUp: number;
    signal: 'up' | 'down' | 'neutral';
    reason: string;
    scales: { scale: 'daily' | 'weekly' | 'monthly'; n: number; h: number; pUp: number | null; direction: string }[];
  } | null;
  filters: DirectionFilterInfo;
  notes: string[];
}

export interface AnalyzePayload {
  symbol: string;
  name?: string;
  result: AnalysisResult;
  meta: SeriesMeta;
  ohlc: OhlcData;
  detectorHits: DetectorHit[];
  events: CorporateEvent[];
  marketStatus: MarketStatus;
  direction: DirectionInfo;
  snapshot: { written: number; skippedReason?: string; outcomesFilled?: number };
  range: RangeKey;
  warnings: string[];
  elapsedMs: number;
}

export interface AnalyzeRequestBody {
  symbol: string;
  config?: Partial<EngineConfig>;
  range?: RangeKey;
  snapshot?: boolean;
  thresholds?: { upper: number; lower: number };
}

/** 頁面互動狀態（AI 情境、深連結都由此產生） */
export interface UiState {
  range: RangeKey;
  horizon: number;
  window: number;
  lambda: number;
  priceMode: PriceMode;
  advanced: boolean;
  enabledModels: ModelId[];
  /** 圖上顯示的模型（可只關閉顯示而不重算） */
  visibleModels: ModelId[];
  layers: LayerToggles;
  params: Partial<Record<ModelId, Record<string, number>>>;
  thresholds: { upper: number; lower: number };
  selection?: { from: string; to: string } | null;
}

/** AI 助理的圖表聯動指令（chart_command 工具輸入） */
export interface ChartCommand {
  action: 'mark_range' | 'highlight_model' | 'set_timescale' | 'add_subplot';
  from?: string;
  to?: string;
  model?: string;
  timescale?: 'day' | 'week' | 'month';
  series?: string;
  label?: string;
}

export interface Subplot {
  id: string;
  label: string;
  source: string;
  dates: string[];
  values: (number | null)[];
}

export interface MarkRange {
  from: string;
  to: string;
  label: string;
}

export interface ModelMetaLite {
  id: ModelId;
  name: string;
  short: string;
  advanced: boolean;
  formulaLatex: string;
}

export interface WfMetrics {
  n: number;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  directionAccuracy: number | null;
  dirN: number;
  dirPValue: number | null;
  theilU: number | null;
  coverage: number | null;
  coverageN: number;
  brier: number | null;
  bias: number | null;
}

export type Verdict = 'better' | 'worse' | 'insignificant' | 'na';

export interface WfRow {
  model: string;
  name: string;
  advanced: boolean;
  horizon: number;
  hidden: boolean;
  hiddenReason?: string;
  metrics: WfMetrics | null;
  vsNaive: {
    overall: Verdict;
    metrics: Record<string, { diff: number | null; relImprovementPct: number | null; verdict: Verdict; pValue: number | null; benchmark: number | null } | null>;
  } | null;
}

export interface WalkForwardResponse {
  symbol: string;
  source: string;
  asOf: string;
  stale: boolean;
  n: number;
  window: number;
  step: number;
  horizons: number[];
  origins: number;
  firstOrigin: string | null;
  lastOrigin: string | null;
  rows: WfRow[];
  benchmarks: { id: string; name: string; horizon: number; metrics: WfMetrics }[];
  curves: Record<string, Record<string, { dates: string[]; errors: (number | null)[]; absPctError: (number | null)[] }>>;
  suspects: { model: string; horizon: number; reasons: string[] }[];
  leakLabel: string;
  failures: Record<string, { count: number; first?: string }>;
  timings: { totalMs: number };
  generatedAt: string;
}
