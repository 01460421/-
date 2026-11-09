/**
 * 由已公開的季資料推導：營收 YoY / QoQ、三率、TTM（近四季合計）、以 asOf 股價計算的 P/E、P/B、殖利率。
 * 純函式；輸入必須已經是 asOf 當時已知的資料。分析師預期 / 財報驚喜（surprise）沒有官方免費來源 → 不提供、不推測。
 */
import type { QuarterRecord, QuarterView } from './types';

const r2 = (x: number | null): number | null => (x === null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const pct = (a: number | null, b: number | null): number | null => (a === null || b === null || b === 0 ? null : r2(((a - b) / Math.abs(b)) * 100));
const ratio = (a: number | null, b: number | null): number | null => (a === null || b === null || b === 0 ? null : r2((a / b) * 100));
const DAY = 86400000;

/** 只保留 knownAt ≤ asOf 的季資料（point-in-time 核心規則） */
export function knownAsOf<T extends { knownAt: string }>(rows: T[], asOf: string): T[] {
  return rows.filter((r) => r.knownAt && r.knownAt <= asOf);
}

function findNear(qs: QuarterRecord[], end: string, offsetDays: number): QuarterRecord | undefined {
  const target = Date.parse(end) - offsetDays * DAY;
  return qs.find((q) => Math.abs(Date.parse(q.periodEnd) - target) <= 12 * DAY);
}

export function quarterViews(qs: QuarterRecord[]): QuarterView[] {
  const sorted = [...qs].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  return sorted.map((q) => {
    const ly = findNear(sorted, q.periodEnd, 365);
    const lq = findNear(sorted, q.periodEnd, 91);
    return {
      ...q,
      revenueYoYPct: pct(q.revenue, ly?.revenue ?? null),
      revenueQoQPct: pct(q.revenue, lq?.revenue ?? null),
      grossMarginPct: ratio(q.grossProfit, q.revenue),
      operatingMarginPct: ratio(q.operatingIncome, q.revenue),
      netMarginPct: ratio(q.netIncome, q.revenue),
    };
  });
}

export interface Ttm {
  quarters: string[];
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  operatingCashFlow: number | null;
}

/** 近四季合計：必須是連續四季（期末相距 ≤ 380 天），否則回傳 null 欄位 */
export function ttm(qs: QuarterRecord[]): Ttm | null {
  const sorted = [...qs].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const last4 = sorted.slice(-4);
  if (last4.length < 4) return null;
  const span = (Date.parse(last4[3].periodEnd) - Date.parse(last4[0].periodEnd)) / DAY;
  if (span > 300) return null; // 四季期末相距約 273 天
  const sum = (k: 'revenue' | 'netIncome' | 'eps' | 'operatingCashFlow') => (last4.every((q) => q[k] !== null) ? last4.reduce((s, q) => s + (q[k] as number), 0) : null);
  return { quarters: last4.map((q) => q.label), revenue: sum('revenue'), netIncome: sum('netIncome'), eps: sum('eps') === null ? null : Math.round(sum('eps')! * 1000) / 1000, operatingCashFlow: sum('operatingCashFlow') };
}

export interface Valuation {
  price: number | null;
  priceDate: string | null;
  peTtm: number | null;
  peNote: string | null;
  pb: number | null;
  bookValuePerShare: number | null;
  dividendYieldPct: number | null;
  dividendNote: string | null;
}

export function valuation(p: { price: number | null; priceDate: string | null; ttm: Ttm | null; latest: QuarterRecord | null; dpsTtm?: number | null }): Valuation {
  const { price } = p;
  const eps = p.ttm?.eps ?? null;
  let peTtm: number | null = null;
  let peNote: string | null = null;
  if (price !== null && eps !== null) {
    if (eps > 0) peTtm = r2(price / eps);
    else peNote = '近四季 EPS ≤ 0，本益比不適用';
  } else peNote = '缺少連續四季 EPS 或股價';
  const bvps = p.latest && p.latest.equity !== null && p.latest.shares ? p.latest.equity / p.latest.shares : null;
  return {
    price,
    priceDate: p.priceDate,
    peTtm,
    peNote,
    pb: price !== null && bvps && bvps > 0 ? r2(price / bvps) : null,
    bookValuePerShare: bvps !== null ? r2(bvps) : null,
    dividendYieldPct: price && p.dpsTtm ? r2((p.dpsTtm / price) * 100) : null,
    dividendNote: p.dpsTtm ? null : '近 12 個月無已公告的每股股利資料',
  };
}

/** 毛利率等趨勢：最近 n 季與前 n 季平均的差（百分點） */
export function marginTrend(views: QuarterView[], key: 'grossMarginPct' | 'operatingMarginPct' | 'netMarginPct', n = 4): { recentAvg: number | null; priorAvg: number | null; changePp: number | null } {
  const v = views.map((x) => x[key]).filter((x): x is number => x !== null);
  if (v.length < 2) return { recentAvg: null, priorAvg: null, changePp: null };
  const recent = v.slice(-n);
  const prior = v.slice(-2 * n, -n);
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const ra = avg(recent);
  const pa = avg(prior);
  return { recentAvg: r2(ra), priorAvg: r2(pa), changePp: ra !== null && pa !== null ? r2(ra - pa) : null };
}
