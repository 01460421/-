/**
 * FinMind v4 API（https://api.finmindtrade.com/api/v4/data）。
 * 免費方案不需 token（約每小時 300 次）；設定 FINMIND_TOKEN 可提高配額並使用 TaiwanStockPriceAdj（還原股價，付費等級）。
 * 未取得還原股價權限時，以 TaiwanStockPrice（原始價）+ TaiwanStockDividend（除權息）自行計算向後還原收盤價。
 */
import type { Bar, Interval, PriceSeries } from '../types';
import type { CorporateEvent, DataAdapter, DataTable, DatasetId, HistoryRequest, Quote } from './types';
import { HttpError, UnsupportedError, ValidationError, fetchJson } from './http';
import { getLimiter } from './ratelimit';
import { normalizeSymbol, registerTwSymbols } from './symbols';
import { buildSeries, cleanBars, closeTimeIso, defaultStart, filterRange, isIntraday, resample, todayIn, toNum, type RawBar } from './util';
import { addDays } from '../calendar';

const BASE = 'https://api.finmindtrade.com/api/v4/data';
export const FINMIND_SOURCE = 'FinMind';

interface FinMindResponse<T> {
  msg: string;
  status: number;
  data?: T[];
}

export interface FinMindPriceRow {
  date: string;
  stock_id: string;
  Trading_Volume: number;
  Trading_money?: number;
  open: number;
  max: number;
  min: number;
  close: number;
  spread?: number;
  Trading_turnover?: number;
}

export interface FinMindDividendRow {
  date: string;
  stock_id: string;
  year?: string;
  StockEarningsDistribution?: number;
  StockStatutorySurplus?: number;
  StockExDividendTradingDate?: string;
  CashEarningsDistribution?: number;
  CashStatutorySurplus?: number;
  CashExDividendTradingDate?: string;
  CashDividendPaymentDate?: string;
  AnnouncementDate?: string;
  [k: string]: unknown;
}

function token(): string | undefined {
  return process.env.FINMIND_TOKEN || undefined;
}

/** 代號 → FinMind data_id */
export function finmindDataId(symbol: string): string | null {
  const info = normalizeSymbol(symbol);
  if (info?.symbol === '^TWII') return 'TAIEX';
  if (info?.symbol === '^TWOII') return 'TPEx';
  if (!info || (info.market !== 'TW' && info.market !== 'TWO') || info.symbol.startsWith('^')) return null;
  return info.code;
}

/** 呼叫 FinMind；回傳 data 陣列。body.status 非 200 轉成 HttpError（402 → 配額用盡）。 */
export async function finmindRequest<T>(dataset: string, params: Record<string, string | undefined>): Promise<T[]> {
  const q = new URLSearchParams({ dataset });
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const t = token();
  const url = `${BASE}?${q.toString()}`;
  let body: FinMindResponse<T>;
  try {
    body = await fetchJson<FinMindResponse<T>>(url, {
      limiter: getLimiter('finmind'),
      headers: t ? { Authorization: `Bearer ${t}` } : undefined,
    });
  } catch (e) {
    if (e instanceof HttpError && e.body) {
      const msg = safeMsg(e.body);
      throw new HttpError(`FinMind ${dataset}: ${msg ?? e.message}`, e.status === 402 ? 429 : e.status, e.url, e.body);
    }
    throw e;
  }
  if (!body || typeof body !== 'object') throw new ValidationError(`FinMind ${dataset}: empty response`);
  if (body.status !== 200) throw new HttpError(`FinMind ${dataset}: ${body.msg}`, body.status === 402 ? 429 : body.status, url.replace(/token=[^&]+/, 'token=***'), JSON.stringify(body).slice(0, 300));
  if (!Array.isArray(body.data)) throw new ValidationError(`FinMind ${dataset}: data is not an array`);
  return body.data;
}

function safeMsg(text: string): string | undefined {
  try {
    return (JSON.parse(text) as { msg?: string }).msg;
  } catch {
    return undefined;
  }
}

function isLevelError(e: unknown): boolean {
  return e instanceof HttpError && (e.status === 400 || e.status === 403) && /level|sponsor|register/i.test(e.message + (e.body ?? ''));
}

export function parseFinMindPrices(rows: FinMindPriceRow[]): RawBar[] {
  return rows
    .filter((r) => r && typeof r.date === 'string')
    .map((r) => ({
      date: r.date.slice(0, 10),
      open: toNum(r.open),
      high: toNum(r.max),
      low: toNum(r.min),
      close: toNum(r.close),
      volume: toNum(r.Trading_Volume),
    }));
}

interface ExEvent {
  date: string;
  cash: number;
  stockRatio: number;
}

export function dividendExEvents(rows: FinMindDividendRow[]): ExEvent[] {
  const map = new Map<string, ExEvent>();
  for (const r of rows) {
    const cash = (toNum(r.CashEarningsDistribution) ?? 0) + (toNum(r.CashStatutorySurplus) ?? 0);
    const stock = (toNum(r.StockEarningsDistribution) ?? 0) + (toNum(r.StockStatutorySurplus) ?? 0);
    const cd = isoDate(r.CashExDividendTradingDate);
    const sd = isoDate(r.StockExDividendTradingDate);
    if (cash > 0 && cd) {
      const e = map.get(cd) ?? { date: cd, cash: 0, stockRatio: 0 };
      e.cash += cash;
      map.set(cd, e);
    }
    if (stock > 0 && sd) {
      const e = map.get(sd) ?? { date: sd, cash: 0, stockRatio: 0 };
      // 股票股利以面額 10 元計：每股配 X 元 → 配股率 X / 10
      e.stockRatio += stock / 10;
      map.set(sd, e);
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function isoDate(s: unknown): string | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return s.slice(0, 10);
}

/**
 * 向後還原：每個除權息日 e，之前所有 K 棒乘上 factor = (P_{e-1} − 現金股利) / (1 + 配股率) / P_{e-1}。
 * 回傳與 bars 等長的 adjClose。最新一段（最後一次除權息之後）adjClose = close。
 */
export function computeAdjClose(bars: { date: string; close: number }[], events: ExEvent[]): number[] {
  const factorAt = new Array<number>(bars.length).fill(1);
  for (const ev of events) {
    const k = bars.findIndex((b) => b.date >= ev.date);
    if (k <= 0) continue;
    const prev = bars[k - 1].close;
    if (!(prev > 0)) continue;
    const f = (prev - ev.cash) / (1 + ev.stockRatio) / prev;
    if (!(f > 0 && f < 1.0000001)) continue;
    factorAt[k - 1] *= f;
  }
  const adj = new Array<number>(bars.length);
  let cum = 1;
  for (let i = bars.length - 1; i >= 0; i--) {
    cum *= factorAt[i];
    adj[i] = round6(bars[i].close * cum);
  }
  return adj;
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

export class FinMindAdapter implements DataAdapter {
  readonly id = 'finmind';
  readonly name = 'FinMind';
  readonly markets = ['TW', 'TWO'] as ('TW' | 'TWO')[];
  readonly requiresKey = false;
  /** 已確認目前等級無 TaiwanStockPriceAdj 權限 */
  private adjDenied = false;

  isConfigured(): boolean {
    return true;
  }

  supportsInterval(i: Interval): boolean {
    return !isIntraday(i);
  }

  async getHistory(symbol: string, req: HistoryRequest): Promise<PriceSeries> {
    const info = normalizeSymbol(symbol);
    const dataId = finmindDataId(symbol);
    if (!info || !dataId) throw new UnsupportedError(`FinMind 不支援 ${symbol}`);
    if (isIntraday(req.interval)) throw new UnsupportedError('FinMind 免費方案不提供盤中 K 線');
    const end = req.end ?? todayIn(info.market);
    const start = req.start ?? defaultStart(req.interval, end);
    const rawRows = await finmindRequest<FinMindPriceRow>('TaiwanStockPrice', { data_id: dataId, start_date: start, end_date: end });
    const raw = parseFinMindPrices(rawRows);
    if (!raw.length) throw new ValidationError(`FinMind: ${symbol} 無資料（${start}~${end}）`);

    let adjusted = false;
    const isIndex = info.symbol.startsWith('^');
    if (!isIndex) {
      let adjMap: Map<string, number> | null = null;
      if (token() && !this.adjDenied) {
        try {
          const adjRows = await finmindRequest<FinMindPriceRow>('TaiwanStockPriceAdj', { data_id: dataId, start_date: start, end_date: end });
          adjMap = new Map(adjRows.map((r) => [r.date.slice(0, 10), Number(r.close)]));
        } catch (e) {
          if (isLevelError(e)) this.adjDenied = true;
        }
      }
      if (adjMap && adjMap.size) {
        for (const b of raw) b.adjClose = adjMap.get(b.date) ?? null;
        adjusted = true;
      } else {
        try {
          const divRows = await finmindRequest<FinMindDividendRow>('TaiwanStockDividend', { data_id: dataId, start_date: addDays(start, -400), end_date: end });
          const valid = raw.filter((b) => (b.close ?? 0) > 0) as { date: string; close: number }[];
          const adj = computeAdjClose(valid, dividendExEvents(divRows));
          const m = new Map(valid.map((b, i) => [b.date, adj[i]]));
          for (const b of raw) b.adjClose = m.get(b.date) ?? null;
          adjusted = true;
        } catch {
          adjusted = false;
        }
      }
    }
    const { bars } = cleanBars(raw, info.market, '1d');
    let out: Bar[] = filterRange(bars, start, end);
    if (req.interval === '1wk' || req.interval === '1mo') out = resample(out, req.interval);
    return buildSeries({
      symbol: info.symbol,
      market: info.market,
      currency: 'TWD',
      interval: req.interval,
      source: FINMIND_SOURCE,
      delayMinutes: 0,
      adjusted: adjusted || isIndex,
      bars: out,
    });
  }

  async getQuote(symbol: string): Promise<Quote> {
    const info = normalizeSymbol(symbol);
    if (!info) throw new UnsupportedError(symbol);
    const end = todayIn(info.market);
    const s = await this.getHistory(symbol, { interval: '1d', start: addDays(end, -14), end });
    const last = s.bars[s.bars.length - 1];
    const prev = s.bars[s.bars.length - 2];
    return {
      symbol: info.symbol,
      price: last.close,
      change: prev ? last.close - prev.close : undefined,
      changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : undefined,
      at: closeTimeIso(info.market, last.date),
      delayMinutes: 0,
      source: `${FINMIND_SOURCE}（收盤價）`,
    };
  }

  async getDataset(symbol: string, dataset: DatasetId, opts: { start?: string; end?: string } = {}): Promise<DataTable> {
    const info = normalizeSymbol(symbol);
    const dataId = finmindDataId(symbol);
    if (!info || !dataId) throw new UnsupportedError(`FinMind 不支援 ${symbol}`);
    const end = opts.end ?? todayIn(info.market);
    const start = opts.start ?? addDays(end, dataset === 'financials' || dataset === 'dividends' ? -365 * 5 : dataset === 'monthly_revenue' ? -365 * 3 : -120);
    const p = { data_id: dataId, start_date: start, end_date: end };
    const base = (title: string, columns: DataTable['columns'], rows: DataTable['rows']): DataTable => ({
      dataset,
      title,
      symbol: info.symbol,
      source: FINMIND_SOURCE,
      fetchedAt: new Date().toISOString(),
      asOf: lastDate(rows) ?? end,
      delayMinutes: 0,
      columns,
      rows,
    });
    switch (dataset) {
      case 'institutional': {
        const rows = await finmindRequest<{ date: string; name: string; buy: number; sell: number }>('TaiwanStockInstitutionalInvestorsBuySell', p);
        return base('三大法人買賣超', INSTITUTIONAL_COLUMNS, pivotInstitutional(rows));
      }
      case 'margin': {
        const rows = await finmindRequest<Record<string, unknown>>('TaiwanStockMarginPurchaseShortSale', p);
        return base('融資融券', MARGIN_COLUMNS, rows.map((r) => pick(r, MARGIN_COLUMNS)));
      }
      case 'securities_lending': {
        const rows = await finmindRequest<Record<string, unknown>>('TaiwanDailyShortSaleBalances', p);
        return genericTable(base, '借券賣出餘額', rows);
      }
      case 'shareholding': {
        const rows = await finmindRequest<Record<string, unknown>>('TaiwanStockHoldingSharesPer', p);
        return base('集保股權分散表', SHAREHOLDING_COLUMNS, rows.map((r) => pick(r, SHAREHOLDING_COLUMNS)));
      }
      case 'monthly_revenue': {
        const rows = await finmindRequest<{ date: string; revenue: number; revenue_year: number; revenue_month: number; create_time?: string }>('TaiwanStockMonthRevenue', {
          ...p,
          start_date: addDays(start, -400),
        });
        return base('月營收', REVENUE_COLUMNS, revenueTable(rows).filter((r) => String(r.month) >= start.slice(0, 7)));
      }
      case 'financials': {
        const all: DataTable['rows'] = [];
        const sets: [string, string][] = [
          ['TaiwanStockFinancialStatements', '綜合損益表'],
          ['TaiwanStockBalanceSheet', '資產負債表'],
          ['TaiwanStockCashFlowsStatement', '現金流量表'],
        ];
        let firstErr: unknown = null;
        for (const [ds, label] of sets) {
          try {
            const rows = await finmindRequest<{ date: string; type: string; value: number; origin_name?: string }>(ds, p);
            for (const r of rows) all.push({ date: r.date, statement: label, item: r.origin_name ?? r.type, type: r.type, value: toNum(r.value) });
          } catch (e) {
            firstErr ??= e;
          }
        }
        if (!all.length && firstErr) throw firstErr;
        return base('季報三大表', FIN_COLUMNS, all);
      }
      case 'dividends': {
        const rows = await finmindRequest<FinMindDividendRow>('TaiwanStockDividend', p);
        return base('股利發放紀錄', DIVIDEND_COLUMNS, rows.map(dividendRow));
      }
      case 'valuation': {
        const rows = await finmindRequest<{ date: string; PER: number; PBR: number; dividend_yield: number }>('TaiwanStockPER', p);
        return base('本益比 / 股價淨值比 / 殖利率', VALUATION_COLUMNS, rows.map((r) => ({ date: r.date, PER: toNum(r.PER), PBR: toNum(r.PBR), dividend_yield: toNum(r.dividend_yield) })));
      }
      case 'news': {
        // FinMind 新聞每次只回一天；往回最多取 4 個日曆日。只保留標題與連結（不複製全文）。
        const rows: DataTable['rows'] = [];
        let d = opts.end ?? end;
        for (let i = 0; i < 4 && rows.length < 30; i++) {
          try {
            const r = await finmindRequest<{ date: string; title: string; link: string; source: string }>('TaiwanStockNews', { data_id: dataId, start_date: d });
            for (const n of r) rows.push({ date: n.date, title: n.title, source: n.source, link: n.link });
          } catch (e) {
            if (i === 0) throw e;
          }
          d = addDays(d, -1);
        }
        rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
        return { ...base('新聞標題', NEWS_COLUMNS, rows), asOf: rows.length ? String(rows[0].date) : end };
      }
      default:
        throw new UnsupportedError(`FinMind 不提供 ${dataset}`);
    }
  }

  async getEvents(symbol: string, opts: { start?: string; end?: string } = {}): Promise<CorporateEvent[]> {
    const dataId = finmindDataId(symbol);
    if (!dataId || normalizeSymbol(symbol)?.symbol.startsWith('^')) return [];
    const end = opts.end ?? addDays(new Date().toISOString().slice(0, 10), 120);
    const start = opts.start ?? addDays(end, -365 * 3);
    const rows = await finmindRequest<FinMindDividendRow>('TaiwanStockDividend', { data_id: dataId, start_date: addDays(start, -200), end_date: end });
    return dividendEvents(rows).filter((e) => e.date >= start && e.date <= end);
  }
}

export function dividendEvents(rows: FinMindDividendRow[]): CorporateEvent[] {
  const out: CorporateEvent[] = [];
  for (const r of rows) {
    const cash = (toNum(r.CashEarningsDistribution) ?? 0) + (toNum(r.CashStatutorySurplus) ?? 0);
    const stock = (toNum(r.StockEarningsDistribution) ?? 0) + (toNum(r.StockStatutorySurplus) ?? 0);
    const cd = isoDate(r.CashExDividendTradingDate);
    const sd = isoDate(r.StockExDividendTradingDate);
    if (cash > 0 && cd) out.push({ date: cd, type: 'dividend', title: `除息：現金股利 ${round4(cash)} 元`, source: FINMIND_SOURCE });
    if (stock > 0 && sd) out.push({ date: sd, type: 'dividend', title: `除權：股票股利 ${round4(stock)} 元`, source: FINMIND_SOURCE });
  }
  return out;
}

/** 載入完整台股清單（上市 / 上櫃），供 normalizeSymbol 與 searchSymbols 使用 */
export async function loadTaiwanStockInfo(): Promise<number> {
  const rows = await finmindRequest<{ stock_id: string; stock_name: string; type: string; industry_category?: string }>('TaiwanStockInfo', {});
  const seen = new Map<string, { code: string; market: 'TW' | 'TWO'; name: string }>();
  for (const r of rows) {
    if (r.type !== 'twse' && r.type !== 'tpex') continue;
    // 只保留普通股、特別股與 ETF（排除權證等 6 位數衍生商品）
    if (!/^(\d{4}|\d{4}[A-Z]|00\d{2,4}[A-Z]?)$/.test(r.stock_id)) continue;
    seen.set(r.stock_id, { code: r.stock_id, market: r.type === 'tpex' ? 'TWO' : 'TW', name: r.stock_name });
  }
  registerTwSymbols([...seen.values()]);
  return seen.size;
}

// ───────── 表格欄位 ─────────

const INSTITUTIONAL_COLUMNS: DataTable['columns'] = [
  { key: 'date', label: '日期' },
  { key: 'foreign', label: '外資買賣超', unit: '張' },
  { key: 'trust', label: '投信買賣超', unit: '張' },
  { key: 'dealer', label: '自營商買賣超', unit: '張' },
  { key: 'total', label: '三大法人合計', unit: '張' },
];

export function pivotInstitutional(rows: { date: string; name: string; buy: number; sell: number }[]): DataTable['rows'] {
  const m = new Map<string, { date: string; foreign: number; trust: number; dealer: number; total: number }>();
  for (const r of rows) {
    const e = m.get(r.date) ?? { date: r.date, foreign: 0, trust: 0, dealer: 0, total: 0 };
    const net = ((toNum(r.buy) ?? 0) - (toNum(r.sell) ?? 0)) / 1000;
    if (/^Foreign/i.test(r.name)) e.foreign += net;
    else if (/Investment_Trust/i.test(r.name)) e.trust += net;
    else if (/^Dealer/i.test(r.name)) e.dealer += net;
    else continue;
    e.total += net;
    m.set(r.date, e);
  }
  return [...m.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ date: e.date, foreign: Math.round(e.foreign), trust: Math.round(e.trust), dealer: Math.round(e.dealer), total: Math.round(e.total) }));
}

const MARGIN_COLUMNS: DataTable['columns'] = [
  { key: 'date', label: '日期' },
  { key: 'MarginPurchaseBuy', label: '融資買進', unit: '張' },
  { key: 'MarginPurchaseSell', label: '融資賣出', unit: '張' },
  { key: 'MarginPurchaseTodayBalance', label: '融資餘額', unit: '張' },
  { key: 'ShortSaleSell', label: '融券賣出', unit: '張' },
  { key: 'ShortSaleBuy', label: '融券買進', unit: '張' },
  { key: 'ShortSaleTodayBalance', label: '融券餘額', unit: '張' },
  { key: 'OffsetLoanAndShort', label: '資券互抵', unit: '張' },
];

const SHAREHOLDING_COLUMNS: DataTable['columns'] = [
  { key: 'date', label: '日期' },
  { key: 'HoldingSharesLevel', label: '持股分級' },
  { key: 'people', label: '人數', unit: '人' },
  { key: 'unit', label: '股數', unit: '股' },
  { key: 'percent', label: '占集保庫存比例', unit: '%' },
];

const REVENUE_COLUMNS: DataTable['columns'] = [
  { key: 'month', label: '月份' },
  { key: 'revenue', label: '營收', unit: '千元' },
  { key: 'mom', label: '月增率', unit: '%' },
  { key: 'yoy', label: '年增率', unit: '%' },
  { key: 'published', label: '公布日' },
];

export function revenueTable(rows: { revenue: number; revenue_year: number; revenue_month: number; create_time?: string }[]): DataTable['rows'] {
  const byMonth = new Map<string, { revenue: number; published?: string }>();
  for (const r of rows) {
    const key = `${r.revenue_year}-${String(r.revenue_month).padStart(2, '0')}`;
    byMonth.set(key, { revenue: toNum(r.revenue) ?? 0, published: r.create_time });
  }
  const keys = [...byMonth.keys()].sort();
  return keys.map((k) => {
    const cur = byMonth.get(k)!;
    const [y, mo] = k.split('-').map(Number);
    const prevKey = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
    const yoyKey = `${y - 1}-${String(mo).padStart(2, '0')}`;
    const prev = byMonth.get(prevKey)?.revenue;
    const ly = byMonth.get(yoyKey)?.revenue;
    return {
      month: k,
      revenue: Math.round(cur.revenue / 1000),
      mom: prev ? round2(((cur.revenue - prev) / prev) * 100) : null,
      yoy: ly ? round2(((cur.revenue - ly) / ly) * 100) : null,
      published: cur.published ?? null,
    };
  });
}

const FIN_COLUMNS: DataTable['columns'] = [
  { key: 'date', label: '季底日期' },
  { key: 'statement', label: '報表' },
  { key: 'item', label: '項目' },
  { key: 'type', label: '代碼' },
  { key: 'value', label: '數值', unit: '元' },
];

const DIVIDEND_COLUMNS: DataTable['columns'] = [
  { key: 'year', label: '股利所屬期間' },
  { key: 'cash', label: '現金股利', unit: '元' },
  { key: 'stock', label: '股票股利', unit: '元' },
  { key: 'cashExDate', label: '除息交易日' },
  { key: 'stockExDate', label: '除權交易日' },
  { key: 'paymentDate', label: '現金股利發放日' },
  { key: 'announced', label: '公告日' },
];

function dividendRow(r: FinMindDividendRow): DataTable['rows'][number] {
  return {
    year: (r.year as string) ?? null,
    cash: round6((toNum(r.CashEarningsDistribution) ?? 0) + (toNum(r.CashStatutorySurplus) ?? 0)),
    stock: round6((toNum(r.StockEarningsDistribution) ?? 0) + (toNum(r.StockStatutorySurplus) ?? 0)),
    cashExDate: isoDate(r.CashExDividendTradingDate),
    stockExDate: isoDate(r.StockExDividendTradingDate),
    paymentDate: isoDate(r.CashDividendPaymentDate),
    announced: isoDate(r.AnnouncementDate) ?? r.date ?? null,
  };
}

const VALUATION_COLUMNS: DataTable['columns'] = [
  { key: 'date', label: '日期' },
  { key: 'PER', label: '本益比', unit: '倍' },
  { key: 'PBR', label: '股價淨值比', unit: '倍' },
  { key: 'dividend_yield', label: '殖利率', unit: '%' },
];

const NEWS_COLUMNS: DataTable['columns'] = [
  { key: 'date', label: '時間' },
  { key: 'title', label: '標題' },
  { key: 'source', label: '來源' },
  { key: 'link', label: '連結' },
];

function pick(r: Record<string, unknown>, cols: DataTable['columns']): DataTable['rows'][number] {
  const o: DataTable['rows'][number] = {};
  for (const c of cols) {
    const v = r[c.key];
    o[c.key] = typeof v === 'number' || typeof v === 'string' ? v : v == null ? null : String(v);
  }
  return o;
}

function genericTable(
  base: (title: string, columns: DataTable['columns'], rows: DataTable['rows']) => DataTable,
  title: string,
  rows: Record<string, unknown>[],
): DataTable {
  const keys = rows.length ? Object.keys(rows[0]).filter((k) => k !== 'stock_id') : ['date'];
  const columns = keys.map((k) => ({ key: k, label: k === 'date' ? '日期' : k }));
  return base(title, columns, rows.map((r) => pick(r, columns)));
}

function lastDate(rows: DataTable['rows']): string | undefined {
  let best: string | undefined;
  for (const r of rows) {
    const d = (r.date ?? r.month) as string | undefined;
    if (typeof d === 'string' && (!best || d > best)) best = d;
  }
  return best;
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
