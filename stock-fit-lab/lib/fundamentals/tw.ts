/**
 * 台股財報（FinMind via getMarketData().getDataset）→ point-in-time 季資料。
 * 列格式（lib/data-adapters/finmind.ts）：
 *   financials：{ date: 季底, statement: 綜合損益表|資產負債表|現金流量表, item, type, value }
 *   monthly_revenue：{ month: 'YYYY-MM', revenue: 千元, mom, yoy, published }
 *   dividends：{ year, cash, stock, cashExDate, stockExDate, paymentDate, announced }
 *   valuation：{ date, PER, PBR, dividend_yield }
 * FinMind 不提供實際申報日 → 以法定期限判斷「已知」（見 deadlines.ts）。
 * 損益表為單季值；現金流量表為年初至今累計，轉為單季時以同年度前一季相減（標記 derived）。
 */
import type { DataTable } from '../data-adapters/types';
import { twQuarterDeadline, twRevenueKnownDate } from './deadlines';
import type { QuarterRecord } from './types';

type Row = DataTable['rows'][number];

const IS_TYPES = {
  revenue: ['Revenue', 'OperatingRevenue', 'TotalRevenue'],
  grossProfit: ['GrossProfit'],
  operatingIncome: ['OperatingIncome'],
  netIncome: ['EquityAttributableToOwnersOfParent', 'IncomeAfterTaxes', 'TotalConsolidatedProfitForThePeriod', 'NetIncome'],
  eps: ['EPS'],
};
const BS_TYPES = { equity: ['EquityAttributableToOwnersOfParent', 'Equity', 'TotalEquity'], capital: ['OrdinaryShare', 'CapitalStock', 'CommonStock'] };
const CF_TYPES = { operatingCashFlow: ['CashFlowsFromOperatingActivities', 'NetCashInflowFromOperatingActivities', 'CashProvidedByOperatingActivities'] };

function pick(map: Map<string, number>, names: string[]): number | null {
  for (const n of names) {
    const v = map.get(n);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function label(end: string): string {
  return `${end.slice(0, 4)}Q${Math.floor((Number(end.slice(5, 7)) - 1) / 3) + 1}`;
}

/** FinMind 季報三大表 → 季資料（含尚未公開者；呼叫端以 knownAt 過濾） */
export function parseTwFinancials(rows: Row[]): QuarterRecord[] {
  const byDate = new Map<string, { is: Map<string, number>; bs: Map<string, number>; cf: Map<string, number> }>();
  for (const r of rows) {
    const d = String(r.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const v = typeof r.value === 'number' ? r.value : Number(r.value);
    if (!Number.isFinite(v)) continue;
    const e = byDate.get(d) ?? { is: new Map(), bs: new Map(), cf: new Map() };
    const st = String(r.statement ?? '');
    const target = /資產負債/.test(st) ? e.bs : /現金流量/.test(st) ? e.cf : e.is;
    target.set(String(r.type ?? r.item ?? ''), v);
    byDate.set(d, e);
  }
  const dates = [...byDate.keys()].sort();
  const cfYtd = new Map<string, number | null>();
  for (const d of dates) cfYtd.set(d, pick(byDate.get(d)!.cf, CF_TYPES.operatingCashFlow));
  return dates.map((d) => {
    const e = byDate.get(d)!;
    const capital = pick(e.bs, BS_TYPES.capital);
    // 現金流量：年初至今 → 單季
    let ocf = cfYtd.get(d) ?? null;
    let ocfDerived = false;
    const month = Number(d.slice(5, 7));
    if (ocf !== null && month > 3) {
      const prevEnd = dates.filter((x) => x < d && x.slice(0, 4) === d.slice(0, 4)).pop();
      const prev = prevEnd ? cfYtd.get(prevEnd) : null;
      if (prev !== null && prev !== undefined) {
        ocf = ocf - prev;
        ocfDerived = true;
      } else ocf = null;
    }
    const deadline = twQuarterDeadline(d);
    return {
      periodEnd: d,
      label: label(d),
      knownAt: deadline,
      basis: 'statutory-deadline' as const,
      revenue: pick(e.is, IS_TYPES.revenue),
      grossProfit: pick(e.is, IS_TYPES.grossProfit),
      operatingIncome: pick(e.is, IS_TYPES.operatingIncome),
      netIncome: pick(e.is, IS_TYPES.netIncome),
      eps: pick(e.is, IS_TYPES.eps),
      operatingCashFlow: ocf,
      equity: pick(e.bs, BS_TYPES.equity),
      // 普通股股本 / 面額 10 元 ≈ 流通股數（近似，未扣庫藏股）
      shares: capital !== null ? capital / 10 : null,
      derivedFields: [...(ocfDerived ? ['operatingCashFlow'] : []), ...(capital !== null ? ['shares'] : [])],
    };
  });
}

export interface MonthlyRevenue {
  month: string;
  revenueThousand: number | null;
  momPct: number | null;
  yoyPct: number | null;
  knownAt: string;
  basis: 'published' | 'statutory-deadline';
}

export function parseTwMonthlyRevenue(rows: Row[]): MonthlyRevenue[] {
  return rows
    .filter((r) => typeof r.month === 'string' && /^\d{4}-\d{2}$/.test(r.month as string))
    .map((r) => {
      const k = twRevenueKnownDate(r.month as string, (r.published as string | null) ?? null);
      return {
        month: r.month as string,
        revenueThousand: typeof r.revenue === 'number' ? r.revenue : null,
        momPct: typeof r.mom === 'number' ? r.mom : null,
        yoyPct: typeof r.yoy === 'number' ? r.yoy : null,
        knownAt: k.date,
        basis: k.basis,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface DividendRecord {
  period: string | null;
  cash: number | null;
  stock: number | null;
  cashExDate: string | null;
  announced: string | null;
}

export function parseTwDividends(rows: Row[]): DividendRecord[] {
  return rows
    .map((r) => ({
      period: (r.year as string | null) ?? null,
      cash: typeof r.cash === 'number' ? r.cash : null,
      stock: typeof r.stock === 'number' ? r.stock : null,
      cashExDate: (r.cashExDate as string | null) ?? null,
      announced: typeof r.announced === 'string' ? (r.announced as string).slice(0, 10) : null,
    }))
    .sort((a, b) => String(a.announced ?? a.cashExDate ?? '').localeCompare(String(b.announced ?? b.cashExDate ?? '')));
}
