import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryLRU } from '@/lib/data-adapters/cache';
import { httpConfig } from '@/lib/data-adapters/http';
import { resetLimiters } from '@/lib/data-adapters/ratelimit';
import { resetMarketData } from '@/lib/data-adapters';
import { setContextCache } from '@/lib/history/cache';
import { setHistoryFetcher } from '@/lib/history';
import {
  getFundamentals,
  knownAsOf,
  parseCompanyFacts,
  parseTwFinancials,
  parseTwMonthlyRevenue,
  quarterViews,
  ttm,
  twQuarterDeadline,
  twRevenueKnownDate,
  twStatementKnownDate,
  valuation,
  type CompanyFacts,
  type QuarterRecord,
} from '@/lib/fundamentals';
import { mopsConfig } from '@/lib/news/mops';
import { barsFrom, seriesOf } from '../history/helpers';
import * as nfx from '../news/fixtures';

const fetchMock = vi.fn();
beforeEach(() => {
  resetLimiters();
  resetMarketData();
  setContextCache(new MemoryLRU(300));
  httpConfig.baseDelayMs = 1;
  mopsConfig.refillPerSec = 1000;
  mopsConfig.baseDelayMs = 1;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.FINMIND_TOKEN;
  delete process.env.SEC_USER_AGENT;
});
afterEach(() => {
  vi.unstubAllGlobals();
  setHistoryFetcher(null);
});

describe('台股法定公告期限', () => {
  it('Q1→5/15、Q2→8/14、Q3→11/14、年報→次年 3/31', () => {
    expect(twQuarterDeadline('2024-03-31')).toBe('2024-05-15');
    expect(twQuarterDeadline('2024-06-30')).toBe('2024-08-14');
    expect(twQuarterDeadline('2024-09-30')).toBe('2024-11-14');
    expect(twQuarterDeadline('2023-12-31')).toBe('2024-03-31');
  });

  it('月營收：次月 10 日；有公布日用公布日', () => {
    expect(twRevenueKnownDate('2024-12')).toEqual({ date: '2025-01-10', basis: 'statutory-deadline' });
    expect(twRevenueKnownDate('2024-05', '2024-06-07 18:00:00')).toEqual({ date: '2024-06-07', basis: 'published' });
    // 公布日早於該月（資料錯誤）→ 改用期限
    expect(twRevenueKnownDate('2024-05', '2024-04-01')).toEqual({ date: '2024-06-10', basis: 'statutory-deadline' });
  });

  it('季報有申報日用申報日，否則法定期限', () => {
    expect(twStatementKnownDate('2024-03-31', '2024-05-09')).toEqual({ date: '2024-05-09', basis: 'filed' });
    expect(twStatementKnownDate('2024-03-31')).toEqual({ date: '2024-05-15', basis: 'statutory-deadline' });
  });
});

const finRows = (date: string, rev: number, eps: number, ocfYtd: number) => [
  { date, statement: '綜合損益表', item: '營業收入', type: 'Revenue', value: rev },
  { date, statement: '綜合損益表', item: '營業毛利', type: 'GrossProfit', value: rev * 0.5 },
  { date, statement: '綜合損益表', item: '營業利益', type: 'OperatingIncome', value: rev * 0.4 },
  { date, statement: '綜合損益表', item: '歸屬母公司淨利', type: 'EquityAttributableToOwnersOfParent', value: rev * 0.35 },
  { date, statement: '綜合損益表', item: 'EPS', type: 'EPS', value: eps },
  { date, statement: '資產負債表', item: '歸屬母公司權益', type: 'EquityAttributableToOwnersOfParent', value: 4000 },
  { date, statement: '資產負債表', item: '普通股股本', type: 'OrdinaryShare', value: 2600 },
  { date, statement: '現金流量表', item: '營業活動現金流', type: 'CashFlowsFromOperatingActivities', value: ocfYtd },
];

describe('台股季報 point-in-time', () => {
  const rows = [...finRows('2023-12-31', 600, 9, 1200), ...finRows('2024-03-31', 590, 8.7, 400), ...finRows('2024-06-30', 670, 9.56, 750), ...finRows('2024-09-30', 760, 12.54, 1200)];
  const q = parseTwFinancials(rows);

  it('Q3 季報在 11/14 前不可見；11/14 當天才可見', () => {
    expect(knownAsOf(q, '2024-11-13').map((x) => x.label)).toEqual(['2023Q4', '2024Q1', '2024Q2']);
    expect(knownAsOf(q, '2024-11-14').map((x) => x.label)).toEqual(['2023Q4', '2024Q1', '2024Q2', '2024Q3']);
    // 2023 年報到 2024-03-31 才算公開
    expect(knownAsOf(q, '2024-03-30')).toHaveLength(0);
    expect(knownAsOf(q, '2024-03-31')).toHaveLength(1);
    expect(q.every((x) => x.basis === 'statutory-deadline')).toBe(true);
  });

  it('現金流量表年初至今累計 → 單季（標記 derived）', () => {
    const byLabel = Object.fromEntries(q.map((x) => [x.label, x]));
    expect(byLabel['2024Q1'].operatingCashFlow).toBe(400);
    expect(byLabel['2024Q2'].operatingCashFlow).toBe(350);
    expect(byLabel['2024Q3'].operatingCashFlow).toBe(450);
    expect(byLabel['2024Q2'].derivedFields).toContain('operatingCashFlow');
    expect(byLabel['2024Q1'].shares).toBe(260); // 股本 / 10
  });

  it('YoY / QoQ / 三率 / TTM', () => {
    const v = quarterViews(q);
    const q3 = v.find((x) => x.label === '2024Q3')!;
    expect(q3.revenueQoQPct).toBe(13.43); // 760/670 − 1
    expect(q3.grossMarginPct).toBe(50);
    expect(q3.operatingMarginPct).toBe(40);
    expect(q3.netMarginPct).toBe(35);
    const t = ttm(q)!;
    expect(t.eps).toBeCloseTo(9 + 8.7 + 9.56 + 12.54, 6);
    expect(t.quarters).toEqual(['2023Q4', '2024Q1', '2024Q2', '2024Q3']);
    // 只有 3 季已知時 TTM 不存在
    expect(ttm(knownAsOf(q, '2024-11-13'))).toBeNull();
  });

  it('月營收已知日', () => {
    const m = parseTwMonthlyRevenue([
      { month: '2024-09', revenue: 251873, mom: 0.4, yoy: 39.6, published: null },
      { month: '2024-10', revenue: 314240, mom: 24.8, yoy: 29.2, published: '2024-11-08' },
    ]);
    expect(knownAsOf(m, '2024-11-07').map((x) => x.month)).toEqual(['2024-09']);
    expect(knownAsOf(m, '2024-11-08').map((x) => x.month)).toEqual(['2024-09', '2024-10']);
  });
});

describe('估值', () => {
  const base: QuarterRecord = { periodEnd: '2024-06-30', label: '2024Q2', knownAt: '2024-08-14', basis: 'filed', revenue: 1, grossProfit: null, operatingIncome: null, netIncome: null, eps: null, operatingCashFlow: null, equity: 1000, shares: 100, derivedFields: [] };
  it('P/E = 價 / EPS TTM；P/B = 價 / 每股淨值；殖利率', () => {
    const v = valuation({ price: 200, priceDate: '2024-09-01', ttm: { quarters: [], revenue: null, netIncome: null, eps: 10, operatingCashFlow: null }, latest: base, dpsTtm: 5 });
    expect(v.peTtm).toBe(20);
    expect(v.bookValuePerShare).toBe(10);
    expect(v.pb).toBe(20);
    expect(v.dividendYieldPct).toBe(2.5);
  });
  it('EPS TTM ≤ 0：本益比不適用（不捏造）', () => {
    const v = valuation({ price: 50, priceDate: '2024-09-01', ttm: { quarters: [], revenue: null, netIncome: null, eps: -1, operatingCashFlow: null }, latest: base });
    expect(v.peTtm).toBeNull();
    expect(v.peNote).toContain('不適用');
  });
});

/** SEC companyfacts 擬真片段：含原始申報、後續重編、10-K 只有全年值（Q4 需推導） */
const facts: CompanyFacts = {
  cik: 320193,
  entityName: 'Apple Inc.',
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            { start: '2022-09-25', end: '2022-12-31', val: 117154, filed: '2023-02-03', form: '10-Q', accn: 'a1' },
            { start: '2023-01-01', end: '2023-04-01', val: 94836, filed: '2023-05-05', form: '10-Q', accn: 'a2' },
            { start: '2022-09-25', end: '2023-04-01', val: 211990, filed: '2023-05-05', form: '10-Q', accn: 'a2' },
            { start: '2023-04-02', end: '2023-07-01', val: 81797, filed: '2023-08-04', form: '10-Q', accn: 'a3' },
            { start: '2022-09-25', end: '2023-07-01', val: 293787, filed: '2023-08-04', form: '10-Q', accn: 'a3' },
            { start: '2022-09-25', end: '2023-09-30', val: 383285, filed: '2023-11-03', form: '10-K', accn: 'a4' },
            // 2024 年的 10-Q 重編了 2023Q1 的比較期數值
            { start: '2023-01-01', end: '2023-04-01', val: 95000, filed: '2024-05-03', form: '10-Q', accn: 'a9' },
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            { start: '2023-04-02', end: '2023-07-01', val: 19881, filed: '2023-08-04', form: '10-Q' },
            { start: '2022-09-25', end: '2023-07-01', val: 74039, filed: '2023-08-04', form: '10-Q' },
            { start: '2022-09-25', end: '2023-09-30', val: 96995, filed: '2023-11-03', form: '10-K' },
          ],
        },
      },
      EarningsPerShareDiluted: {
        units: {
          'USD/shares': [
            { start: '2022-09-25', end: '2022-12-31', val: 1.88, filed: '2023-02-03', form: '10-Q' },
            { start: '2023-01-01', end: '2023-04-01', val: 1.52, filed: '2023-05-05', form: '10-Q' },
            { start: '2023-04-02', end: '2023-07-01', val: 1.26, filed: '2023-08-04', form: '10-Q' },
            { start: '2022-09-25', end: '2023-07-01', val: 4.67, filed: '2023-08-04', form: '10-Q' },
            { start: '2022-09-25', end: '2023-09-30', val: 6.13, filed: '2023-11-03', form: '10-K' },
          ],
        },
      },
      StockholdersEquity: { units: { USD: [{ end: '2023-07-01', val: 60274, filed: '2023-08-04', form: '10-Q' }, { end: '2023-09-30', val: 62146, filed: '2023-11-03', form: '10-K' }] } },
    },
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2023-07-21', val: 15634, filed: '2023-08-04', form: '10-Q' }, { end: '2023-10-20', val: 15550, filed: '2023-11-03', form: '10-K' }] } } },
  },
};

describe('SEC XBRL point-in-time', () => {
  it('filed > asOf 的 fact 一律忽略', () => {
    const p = parseCompanyFacts(facts, '2023-08-03');
    expect(p.quarters.map((q) => q.periodEnd)).toEqual(['2022-12-31', '2023-04-01']);
    expect(p.quarters.every((q) => q.knownAt <= '2023-08-03')).toBe(true);
  });

  it('Q4 = 全年 − 前三季累計，只在 10-K 申報後可見', () => {
    expect(parseCompanyFacts(facts, '2023-11-02').quarters.some((q) => q.periodEnd === '2023-09-30')).toBe(false);
    const p = parseCompanyFacts(facts, '2023-11-03');
    const q4 = p.quarters.find((q) => q.periodEnd === '2023-09-30')!;
    expect(q4.revenue).toBe(383285 - 293787);
    expect(q4.netIncome).toBe(96995 - 74039);
    expect(q4.eps).toBeCloseTo(6.13 - 4.67, 6);
    expect(q4.knownAt).toBe('2023-11-03');
    expect(q4.derivedFields).toEqual(expect.arrayContaining(['revenue', 'netIncome', 'eps']));
    expect(q4.label).toBe('2023Q3');
  });

  it('重編：asOf 在重編前用原始值、之後用重編值', () => {
    const before = parseCompanyFacts(facts, '2024-01-01').quarters.find((q) => q.periodEnd === '2023-04-01')!;
    const after = parseCompanyFacts(facts, '2024-06-01').quarters.find((q) => q.periodEnd === '2023-04-01')!;
    expect(before.revenue).toBe(94836);
    expect(after.revenue).toBe(95000);
  });

  it('時點型（權益 / 股數）與 P/B', () => {
    const p = parseCompanyFacts(facts, '2023-11-03');
    const q4 = p.quarters.find((q) => q.periodEnd === '2023-09-30')!;
    expect(q4.equity).toBe(62146);
    expect(p.latestShares!.value).toBe(15550);
  });
});

describe('getFundamentals 整合', () => {
  it('美股：只用 asOf 前申報的資料，並標示下一期何時公開', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('company_tickers')) return nfx.jsonResponse(nfx.secTickers);
      if (url.includes('companyfacts/CIK0000320193')) return nfx.jsonResponse(facts);
      return nfx.textResponse('nf', 404);
    });
    setHistoryFetcher(async (s) => seriesOf(s, barsFrom(Array.from({ length: 400 }, (_, i) => 150 + i * 0.1), '2022-06-01')));
    const f = await getFundamentals('AAPL', { asOf: '2023-08-10' });
    expect(f.quarters.map((q) => q.periodEnd)).toEqual(['2022-12-31', '2023-04-01', '2023-07-01']);
    expect(f.pendingNext).toEqual({ period: '2023Q3', knownAt: '2023-11-03' });
    expect(f.ttm).toBeNull(); // 只有 3 季
    expect(f.valuation.priceDate! <= '2023-08-10').toBe(true);
    expect(f.sources.some((s) => s.name.includes('SEC XBRL'))).toBe(true);
    expect(f.notes.join()).toContain('SEC_USER_AGENT');
  });

  it('台股：FinMind 資料集 + 法定期限；asOf 前未到期的季報被排除', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const ok = (data: unknown[]) => nfx.jsonResponse({ msg: 'success', status: 200, data });
      if (url.includes('TaiwanStockFinancialStatements'))
        return ok([
          ...['2023-12-31', '2024-03-31', '2024-06-30', '2024-09-30'].flatMap((d, i) => [
            { date: d, stock_id: '2330', type: 'Revenue', value: 600 + i * 50, origin_name: '營業收入' },
            { date: d, stock_id: '2330', type: 'EPS', value: 9 + i, origin_name: 'EPS' },
          ]),
        ]);
      if (url.includes('TaiwanStockBalanceSheet') || url.includes('TaiwanStockCashFlowsStatement')) return ok([]);
      if (url.includes('TaiwanStockMonthRevenue')) return ok([{ date: '2024-11-01', stock_id: '2330', revenue: 314240000, revenue_month: 10, revenue_year: 2024, create_time: '2024-11-08' }]);
      if (url.includes('TaiwanStockDividend')) return ok([]);
      if (url.includes('TaiwanStockPER')) return ok([{ date: '2024-11-12', stock_id: '2330', PER: 25.1, PBR: 7.2, dividend_yield: 1.4 }]);
      return nfx.textResponse('nf', 404);
    });
    setHistoryFetcher(async (s) => seriesOf(s.endsWith('.TW') ? s : `${s}`, barsFrom(Array.from({ length: 300 }, () => 1000), '2024-01-02')));
    const f = await getFundamentals('2330', { asOf: '2024-11-13' });
    expect(f.quarters.map((q) => q.label)).toEqual(['2023Q4', '2024Q1', '2024Q2']);
    expect(f.pendingNext).toEqual({ period: '2024Q3', knownAt: '2024-11-14' });
    expect(f.officialValuation).toMatchObject({ date: '2024-11-12', per: 25.1 });
    expect(f.monthlyRevenue.map((m) => m.month)).toEqual(['2024-10']);
    expect(f.lagRule).toContain('5/15');
  });
});

describe('SEC 公開日 = 第一次申報日', () => {
  it('重編後 knownAt 仍為原始申報日，數值改用重編值', () => {
    const p = parseCompanyFacts(facts, '2024-06-01');
    const q = p.quarters.find((x) => x.periodEnd === '2023-04-01')!;
    expect(q.revenue).toBe(95000);
    expect(q.knownAt).toBe('2023-05-05');
  });
});
