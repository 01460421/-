/** 財報（point-in-time）共用型別 */

export interface FactValue {
  value: number;
  /** 何時公開（YYYY-MM-DD）：SEC 用 filed、台股用申報日或法定期限 */
  knownAt: string;
  basis: 'filed' | 'statutory-deadline' | 'published';
  /** 數值所採用的申報日（可能是後來的重編 / 比較期，仍 ≤ asOf） */
  lastFiled?: string;
  /** 是否由累計值相減推得（例如 Q4 = 全年 − 前三季） */
  derived?: boolean;
  form?: string;
  accn?: string;
}

export interface QuarterRecord {
  periodEnd: string;
  label: string; // 例如 2024Q1（日曆季）
  knownAt: string;
  basis: FactValue['basis'];
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  eps: number | null;
  operatingCashFlow: number | null;
  equity: number | null;
  shares: number | null;
  derivedFields: string[];
}

export interface QuarterView extends QuarterRecord {
  revenueYoYPct: number | null;
  revenueQoQPct: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  netMarginPct: number | null;
}

export interface FundSource {
  name: string;
  url?: string;
  asOf?: string;
  publishedAt?: string;
}
