/** API 回應型別（JSON 化後 NaN → null） */
import type { ConfusionMatrix, MonthlyReport, ScorecardRow, TrendPoint } from '@/lib/engine/accuracy';
import type { ReliabilityBin } from '@/lib/direction/calibration';
import type { SnapshotOutcome } from '@/lib/types';

/** 把 number 欄位改成 number | null（遞迴） */
export type J<T> = T extends number
  ? number | null
  : T extends (infer U)[]
    ? J<U>[]
    : T extends object
      ? { [K in keyof T]: J<T[K]> }
      : T;

export type ScoreRowJ = J<ScorecardRow>;

export interface AccuracyResponse {
  generatedAt: string;
  storeKind: 'postgres' | 'memory';
  query: { symbol: string | null; model: string | null; horizon: number | null; period: string; thresholds: { up: number; down: number } };
  range: { from: string; to: string };
  counts: { snapshots: number; withOutcomes: number; symbols: string[]; models: string[]; firstIssued: string | null; lastIssued: string | null };
  scorecard: ScoreRowJ[];
  trend: Record<string, J<TrendPoint>[]>;
  direction: {
    model: string | null;
    horizon: number;
    confusion: J<ConfusionMatrix>;
    calibration: { horizon: number; n: number; brier: number | null; brierSkill: number | null; ece: number | null; baseRate: number | null; bins: J<ReliabilityBin>[] };
  };
  modelNames: Record<string, string>;
  note: string;
}

export interface ReplaySnap {
  id: string;
  modelId: string;
  modelVersion: string;
  createdAt: string;
  trainEnd: string;
  lastPrice: number;
  targetDates: string[];
  mean: (number | null)[];
  lower: (number | null)[];
  upper: (number | null)[];
  level: number;
  pUp: (number | null)[] | null;
  naive: (number | null)[] | null;
}

export interface ReplayResponse {
  symbol: string;
  date?: string;
  generatedAt: string;
  source?: string | null;
  barsError?: string | null;
  availableDates: string[];
  known?: { date: string; price: number }[];
  after?: { date: string; price: number }[];
  snapshots?: ReplaySnap[];
  outcomes?: Record<string, J<SnapshotOutcome>[]>;
  modelNames?: Record<string, string>;
  note?: string;
}

export interface SnapshotListItem {
  id: string;
  createdAt: string;
  symbol: string;
  modelId: string;
  modelVersion: string;
  trigger: string;
  trainStart: string;
  trainEnd: string;
  lastPrice: number;
  horizon: number;
  lastTarget: string | null;
  meanLast: number | null;
  lowerLast: number | null;
  upperLast: number | null;
  pUpLast: number | null;
  level: number;
  filled: number;
  mape: number | null;
  dirHits: number;
  dirN: number;
  coverage: number | null;
  hasAi: boolean;
}

export interface SnapshotListResponse {
  generatedAt: string;
  total: number;
  truncated: boolean;
  offset: number;
  limit: number;
  items: SnapshotListItem[];
}

export type ReportJ = J<MonthlyReport> & { symbol: string | null; storeKind: string; modelNames: Record<string, string> };

export interface AiHistoryItem {
  id: string;
  symbol: string;
  createdAt: string;
  trainEnd: string;
  lastPrice: number;
  llmModel: string;
  label: string;
  credibleModel: string | null;
  credibleReason: string | null;
  summary: string | null;
  warnings: string[];
  suggestions: { model_id: string; parameter: string; suggestion: string; reason: string }[];
  citedFields: string[];
  realized: { horizon: number; targetDate: string; actual: number; changePct: number | null }[];
  credible: { snapshotId: string; mape: number | null; naiveMape: number | null; n: number; rank: number | null; of: number } | null;
  bestModel: { modelId: string; mape: number | null; n: number } | null;
  ensemble: { snapshotId: string; pUpLast: number | null; dirHits: number; dirN: number } | null;
  pending: boolean;
}
