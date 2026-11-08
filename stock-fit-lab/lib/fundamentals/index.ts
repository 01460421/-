/**
 * 實際財報（point-in-time）：getFundamentals(symbol, asOf) 只使用 asOf 當時已公開的資料。
 *  台股：FinMind（getDataset financials / monthly_revenue / dividends / valuation），已知日 = 法定期限（無申報日時）
 *  美股：SEC XBRL companyfacts，已知日 = 各 fact 的 filed 日
 * 推導：營收 YoY / QoQ、三率、EPS TTM、以 asOf 收盤計算的 P/E、P/B、殖利率。無官方免費來源的「財報驚喜」不提供。
 */
import type { Market } from '../types';
import { addDays } from '../calendar';
import { getMarketData, normalizeSymbol } from '../data-adapters';
import { cached } from '../history/cache';
import { getLongHistory } from '../history';
import { padCik, secFetchJson, SEC_UA_NOTE, secUserAgent, tickerToCik } from '../news/sec';
import { TW_LAG_RULE } from './deadlines';
import { knownAsOf, marginTrend, quarterViews, ttm, valuation, type Ttm, type Valuation } from './derive';
import { CONCEPTS, parseCompanyFacts, type CompanyFacts, type XbrlFact } from './sec-facts';
import { parseTwDividends, parseTwFinancials, parseTwMonthlyRevenue, type DividendRecord, type MonthlyRevenue } from './tw';
import type { FundSource, QuarterView } from './types';

export * from './types';
export { twQuarterDeadline, twRevenueKnownDate, twStatementKnownDate, TW_LAG_RULE } from './deadlines';
export { knownAsOf, quarterViews, ttm, valuation, marginTrend } from './derive';
export { parseCompanyFacts, quarterlyDurations, instants, knownFacts } from './sec-facts';
export { parseTwFinancials, parseTwMonthlyRevenue, parseTwDividends } from './tw';
export { getGuidance } from './guidance';

export interface FundamentalsResult {
  symbol: string;
  market: Market;
  asOf: string;
  currency: string;
  entityName: string | null;
  quarters: QuarterView[];
  ttm: Ttm | null;
  valuation: Valuation;
  /** 官方估值（台股：TWSE 公布之本益比 / 股價淨值比 / 殖利率，經 FinMind） */
  officialValuation: { date: string; per: number | null; pbr: number | null; dividendYieldPct: number | null; source: string } | null;
  marginTrends: Record<'grossMarginPct' | 'operatingMarginPct' | 'netMarginPct', { recentAvg: number | null; priorAvg: number | null; changePp: number | null }>;
  monthlyRevenue: MonthlyRevenue[];
  dividends: DividendRecord[];
  /** asOf 之後才公開、因此被排除的最近一期（讓使用者知道「當時還看不到」） */
  pendingNext: { period: string; knownAt: string } | null;
  lagRule: string;
  sources: FundSource[];
  notes: string[];
  unavailableReason?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 只保留需要的概念，縮小快取體積（companyfacts 原檔可達數 MB） */
export function reduceCompanyFacts(cf: CompanyFacts): CompanyFacts {
  const keep = new Set<string>(Object.values(CONCEPTS).flat());
  const gaap: NonNullable<CompanyFacts['facts']>[string] = {};
  for (const [k, v] of Object.entries(cf.facts?.['us-gaap'] ?? {})) if (keep.has(k)) gaap[k] = v;
  const dei: NonNullable<CompanyFacts['facts']>[string] = {};
  const sh = cf.facts?.dei?.EntityCommonStockSharesOutstanding;
  if (sh) dei.EntityCommonStockSharesOutstanding = sh;
  return { cik: cf.cik, entityName: cf.entityName, facts: { 'us-gaap': gaap, dei } };
}

export async function getCompanyFacts(cik: string): Promise<CompanyFacts> {
  const c = padCik(cik);
  return cached(`ctx:sec:facts:v1:${c}`, 12 * 3600, async () => reduceCompanyFacts(await secFetchJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${c}.json`, { timeoutMs: 45000 })), 30 * 86400);
}

/** asOf 收盤價；美股（Yahoo 收盤為「分割調整後」）再乘回 asOf 之後發生的分割比例，使其與當時申報的 EPS 同一股數基礎 */
async function priceAt(symbol: string, market: Market, asOf: string): Promise<{ price: number | null; date: string | null; source: string | null; note: string | null }> {
  try {
    const h = await getLongHistory(symbol, { to: asOf });
    const last = h.bars[h.bars.length - 1];
    if (!last) return { price: null, date: null, source: null, note: 'asOf 之前無行情' };
    let price = last.close;
    let note: string | null = null;
    if (market === 'US' && asOf < todayIso()) {
      try {
        const ev = await getMarketData().getEvents(symbol, { start: addDays(asOf, 1), end: todayIso() });
        let factor = 1;
        for (const e of ev.filter((x) => x.type === 'split')) {
          const m = /(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)/.exec(e.title);
          if (m && Number(m[2]) > 0) factor *= Number(m[1]) / Number(m[2]);
        }
        if (factor !== 1) {
          price *= factor;
          note = `已乘回 asOf 之後的股票分割比例 ×${Math.round(factor * 1000) / 1000}（與當時 EPS 同一股數基礎）`;
        }
      } catch {
        note = '無法取得分割事件：歷史本益比可能受股票分割影響';
      }
    }
    return { price: Math.round(price * 10000) / 10000, date: last.date, source: h.source, note };
  } catch (e) {
    return { price: null, date: null, source: null, note: `無法取得股價：${(e as Error).message.slice(0, 80)}` };
  }
}

export async function getFundamentals(symbol: string, opts: { asOf?: string } = {}): Promise<FundamentalsResult> {
  const info = normalizeSymbol(symbol);
  if (!info) throw new Error(`無法辨識代號：${symbol}`);
  const asOf = (opts.asOf ?? todayIso()).slice(0, 10);
  const sources: FundSource[] = [];
  const notes: string[] = ['財報驚喜（相對分析師預期）沒有官方免費來源，不提供也不推測。'];
  const price = await priceAt(info.symbol, info.market, asOf);
  if (price.source) sources.push({ name: `股價（${price.source}）`, asOf: price.date ?? undefined });
  if (price.note) notes.push(price.note);

  if (info.market === 'US') {
    if (!secUserAgent().configured) notes.push(SEC_UA_NOTE);
    const c = await tickerToCik(info.code).catch(() => null);
    if (!c) return emptyResult(info.symbol, info.market, asOf, 'USD', price, sources, notes, `SEC 查無 ${info.code} 的 CIK（ETF / 指數 / 外國公司可能沒有 XBRL 財報）`);
    const cf = await getCompanyFacts(c.cik);
    const parsed = parseCompanyFacts(cf, asOf);
    const views = quarterViews(parsed.quarters).slice(-8);
    const t = ttm(parsed.quarters);
    const dpsVals = [...parsed.dps.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-4);
    const lastEnd = dpsVals.length ? dpsVals[dpsVals.length - 1][0] : null;
    const dpsTtm = dpsVals.length && lastEnd && Date.parse(asOf) - Date.parse(lastEnd) < 200 * 86400000 ? dpsVals.reduce((s, [, v]) => s + v.value, 0) : null;
    const latest = parsed.quarters[parsed.quarters.length - 1] ?? null;
    // 下一期（asOf 之後才申報）
    const future = parseCompanyFacts(cf, '9999-12-31').quarters.filter((q) => q.periodEnd > (latest?.periodEnd ?? '') && q.knownAt > asOf);
    sources.push({ name: 'SEC XBRL companyfacts', url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${c.cik}.json`, asOf: latest?.knownAt });
    notes.push('美股季值：期間 80–100 天的申報值直接採用；Q4 等由累計值相減者標記 derivedFields。同一期間取 asOf 前最後一次申報的數值（含重編）。');
    return {
      symbol: info.symbol,
      market: info.market,
      asOf,
      currency: 'USD',
      entityName: parsed.entityName || c.title,
      quarters: views,
      ttm: t,
      valuation: valuation({ price: price.price, priceDate: price.date, ttm: t, latest, dpsTtm }),
      officialValuation: null,
      marginTrends: { grossMarginPct: marginTrend(views, 'grossMarginPct'), operatingMarginPct: marginTrend(views, 'operatingMarginPct'), netMarginPct: marginTrend(views, 'netMarginPct') },
      monthlyRevenue: [],
      dividends: [],
      pendingNext: future.length ? { period: future[0].label, knownAt: future[0].knownAt } : null,
      lagRule: '以每筆 XBRL fact 的 filed（申報日）判斷是否已公開。',
      sources,
      notes,
    };
  }

  // ───── 台股 ─────
  const md = getMarketData();
  const start = addDays(asOf, -Math.round(365 * 3.5));
  const [fin, rev, div, val] = await Promise.allSettled([
    md.getDataset(info.symbol, 'financials', { start, end: asOf }),
    md.getDataset(info.symbol, 'monthly_revenue', { start: addDays(asOf, -800), end: asOf }),
    md.getDataset(info.symbol, 'dividends', { start: addDays(asOf, -365 * 3), end: addDays(asOf, 200) }),
    md.getDataset(info.symbol, 'valuation', { start: addDays(asOf, -20), end: asOf }),
  ]);
  const allQ = fin.status === 'fulfilled' ? parseTwFinancials(fin.value.rows) : [];
  if (fin.status === 'fulfilled') {
    sources.push({ name: `季報三大表（${fin.value.source}）`, url: 'https://mops.twse.com.tw/', asOf: fin.value.asOf });
    if (fin.value.unavailableReason) notes.push(`季報：${fin.value.unavailableReason}`);
  } else notes.push(`季報取得失敗：${String(fin.reason).slice(0, 120)}`);
  const known = knownAsOf(allQ, asOf);
  const pending = allQ.filter((q) => q.knownAt > asOf).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))[0];
  const views = quarterViews(known).slice(-8);
  const t = ttm(known);
  const latest = known[known.length - 1] ?? null;
  const monthly = rev.status === 'fulfilled' ? knownAsOf(parseTwMonthlyRevenue(rev.value.rows), asOf).slice(-13) : [];
  if (rev.status === 'fulfilled') sources.push({ name: `月營收（${rev.value.source}）`, asOf: monthly[monthly.length - 1]?.knownAt });
  const divs = div.status === 'fulfilled' ? parseTwDividends(div.value.rows).filter((d) => (d.announced ?? d.cashExDate ?? '9999') <= asOf) : [];
  if (div.status === 'fulfilled') sources.push({ name: `股利（${div.value.source}）`, asOf: divs[divs.length - 1]?.announced ?? undefined });
  const yearAgo = addDays(asOf, -365);
  const dpsTtm = divs.filter((d) => d.cashExDate && d.cashExDate > yearAgo && d.cashExDate <= asOf).reduce((s, d) => s + (d.cash ?? 0), 0) || null;
  let official: FundamentalsResult['officialValuation'] = null;
  if (val.status === 'fulfilled') {
    const rows = val.value.rows.filter((r) => typeof r.date === 'string' && (r.date as string) <= asOf).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const r = rows[rows.length - 1];
    if (r) {
      official = { date: String(r.date), per: typeof r.PER === 'number' ? r.PER : null, pbr: typeof r.PBR === 'number' ? r.PBR : null, dividendYieldPct: typeof r.dividend_yield === 'number' ? r.dividend_yield : null, source: `${val.value.source}（TWSE 公布值）` };
      sources.push({ name: `本益比 / 股價淨值比 / 殖利率（${val.value.source}）`, asOf: official.date });
    }
  }
  notes.push('台股損益表為單季值（FinMind）；股數以普通股股本 ÷ 面額 10 元近似（未扣庫藏股），每股淨值與 P/B 為近似值。');
  return {
    symbol: info.symbol,
    market: info.market,
    asOf,
    currency: 'TWD',
    entityName: null,
    quarters: views,
    ttm: t,
    valuation: valuation({ price: price.price, priceDate: price.date, ttm: t, latest, dpsTtm }),
    officialValuation: official,
    marginTrends: { grossMarginPct: marginTrend(views, 'grossMarginPct'), operatingMarginPct: marginTrend(views, 'operatingMarginPct'), netMarginPct: marginTrend(views, 'netMarginPct') },
    monthlyRevenue: monthly,
    dividends: divs.slice(-6),
    pendingNext: pending ? { period: pending.label, knownAt: pending.knownAt } : null,
    lagRule: TW_LAG_RULE,
    sources,
    notes,
    unavailableReason: !known.length && !monthly.length ? '查無 asOf 當時已公開的財報資料' : undefined,
  };
}

function emptyResult(symbol: string, market: Market, asOf: string, currency: string, price: { price: number | null; date: string | null }, sources: FundSource[], notes: string[], reason: string): FundamentalsResult {
  const t = null;
  return {
    symbol,
    market,
    asOf,
    currency,
    entityName: null,
    quarters: [],
    ttm: t,
    valuation: valuation({ price: price.price, priceDate: price.date, ttm: t, latest: null }),
    officialValuation: null,
    marginTrends: { grossMarginPct: { recentAvg: null, priorAvg: null, changePp: null }, operatingMarginPct: { recentAvg: null, priorAvg: null, changePp: null }, netMarginPct: { recentAvg: null, priorAvg: null, changePp: null } },
    monthlyRevenue: [],
    dividends: [],
    pendingNext: null,
    lagRule: '',
    sources,
    notes,
    unavailableReason: reason,
  };
}

export type { XbrlFact, CompanyFacts };
