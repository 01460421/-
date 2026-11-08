/**
 * 臺灣證券交易所（TWSE）：
 *  - 歷史：www.twse.com.tw/rwd 個股日成交資訊 STOCK_DAY（逐月）、加權指數 MI_5MINS_HIST
 *  - OpenAPI（openapi.twse.com.tw/v1）：STOCK_DAY_ALL 當日收盤、MI_MARGN 融資融券、BWIBBU_ALL 本益比
 *  - 三大法人：rwd fund/T86（逐日）
 * 官方建議 5 秒內不超過 3 次請求，速率限制器已依此設定。
 */
import type { Bar, Interval, PriceSeries } from '../types';
import type { DataAdapter, DataTable, DatasetId, HistoryRequest, Quote } from './types';
import { UnsupportedError, ValidationError, fetchJson } from './http';
import { getLimiter } from './ratelimit';
import { normalizeSymbol } from './symbols';
import { findCol, monthStarts, parseDailyTable } from './twcommon';
import { buildSeries, cleanBars, closeTimeIso, defaultStart, filterRange, isIntraday, resample, rocToIso, todayIn, toNum, type RawBar } from './util';
import { addDays, isTradingDay } from '../calendar';

export const TWSE_SOURCE = '臺灣證券交易所 TWSE';
const OPENAPI = 'https://openapi.twse.com.tw/v1';
const RWD = 'https://www.twse.com.tw/rwd/zh';

export interface TwseTableResponse {
  stat?: string;
  date?: string;
  title?: string;
  fields?: string[];
  data?: unknown[][];
  tables?: { fields?: string[]; data?: unknown[][] }[];
}

export function parseTwseHistory(body: TwseTableResponse): RawBar[] {
  if (!body || typeof body !== 'object') throw new ValidationError('TWSE: empty');
  if (body.stat && !/^ok$/i.test(body.stat)) {
    // 「很抱歉，沒有符合條件的資料!」等：當月無資料
    return [];
  }
  if (body.fields && body.data) return parseDailyTable(body.fields, body.data);
  const out: RawBar[] = [];
  for (const t of body.tables ?? []) if (t.fields && t.data) out.push(...parseDailyTable(t.fields, t.data));
  return out;
}

const ymd = (d: string) => d.replace(/-/g, '');

export class TwseAdapter implements DataAdapter {
  readonly id = 'twse';
  readonly name = '臺灣證券交易所 TWSE';
  readonly markets = ['TW'] as 'TW'[];
  readonly requiresKey = false;

  isConfigured(): boolean {
    return true;
  }

  supportsInterval(i: Interval): boolean {
    return !isIntraday(i);
  }

  private getJson<T>(url: string): Promise<T> {
    return fetchJson<T>(url, { limiter: getLimiter('twse'), timeoutMs: 10_000, retries: 2 });
  }

  async getHistory(symbol: string, req: HistoryRequest): Promise<PriceSeries> {
    const info = normalizeSymbol(symbol);
    if (!info || info.market !== 'TW') throw new UnsupportedError(`TWSE 只提供上市代號：${symbol}`);
    if (isIntraday(req.interval)) throw new UnsupportedError('TWSE 不提供盤中 K 線');
    const end = req.end ?? todayIn('TW');
    const start = req.start ?? defaultStart(req.interval, end);
    const raw: RawBar[] = [];
    const months = monthStarts(start, end, 36);
    for (const m of months) {
      const url =
        info.symbol === '^TWII'
          ? `${RWD}/indicesReport/MI_5MINS_HIST?date=${ymd(m)}&response=json`
          : `${RWD}/afterTrading/STOCK_DAY?date=${ymd(m)}&stockNo=${encodeURIComponent(info.code)}&response=json`;
      raw.push(...parseTwseHistory(await this.getJson<TwseTableResponse>(url)));
    }
    const { bars } = cleanBars(raw, 'TW', '1d');
    let out: Bar[] = filterRange(bars, start, end);
    if (req.interval === '1wk' || req.interval === '1mo') out = resample(out, req.interval);
    return buildSeries({ symbol: info.symbol, market: 'TW', currency: 'TWD', interval: req.interval, source: TWSE_SOURCE, delayMinutes: 0, adjusted: info.symbol === '^TWII', bars: out });
  }

  async getQuote(symbol: string): Promise<Quote> {
    const info = normalizeSymbol(symbol);
    if (!info || info.market !== 'TW' || info.symbol.startsWith('^')) throw new UnsupportedError(symbol);
    const rows = await this.getJson<Record<string, string>[]>(`${OPENAPI}/exchangeReport/STOCK_DAY_ALL`);
    const r = rows.find((x) => String(x.Code ?? '').trim() === info.code);
    const price = r ? toNum(r.ClosingPrice) : null;
    if (!r || !price) throw new ValidationError(`TWSE: 找不到 ${info.code}`);
    const change = toNum(r.Change);
    const date = (r.Date && rocToIso(r.Date)) || lastTradingDay();
    return {
      symbol: info.symbol,
      price,
      change: change ?? undefined,
      changePct: change !== null ? (change / (price - change)) * 100 : undefined,
      at: closeTimeIso('TW', date),
      delayMinutes: 0,
      source: `${TWSE_SOURCE}（收盤價）`,
    };
  }

  async getDataset(symbol: string, dataset: DatasetId, opts: { start?: string; end?: string } = {}): Promise<DataTable> {
    const info = normalizeSymbol(symbol);
    if (!info || info.market !== 'TW') throw new UnsupportedError(symbol);
    const mk = (title: string, columns: DataTable['columns'], rows: DataTable['rows'], asOf: string): DataTable => ({
      dataset,
      title,
      symbol: info.symbol,
      source: TWSE_SOURCE,
      fetchedAt: new Date().toISOString(),
      asOf,
      delayMinutes: 0,
      columns,
      rows,
    });
    if (dataset === 'institutional') {
      // 逐日查詢 T86；最多回溯 10 個交易日
      const end = opts.end ?? todayIn('TW');
      const days: string[] = [];
      let d = end;
      for (let i = 0; i < 20 && days.length < 10; i++) {
        if (isTradingDay('TW', d) && (!opts.start || d >= opts.start)) days.push(d);
        d = addDays(d, -1);
      }
      const rows: DataTable['rows'] = [];
      for (const day of days.reverse()) {
        const body = await this.getJson<TwseTableResponse>(`${RWD}/fund/T86?date=${ymd(day)}&selectType=ALLBUT0999&response=json`);
        const row = parseT86(body, info.code);
        if (row) rows.push({ date: day, ...row });
      }
      return mk('三大法人買賣超', INST_COLUMNS, rows, (rows[rows.length - 1]?.date as string) ?? end);
    }
    if (dataset === 'margin') {
      const rows = await this.getJson<Record<string, string>[]>(`${OPENAPI}/exchangeReport/MI_MARGN`);
      const r = rows.find((x) => String(x['股票代號'] ?? x.Code ?? '').trim() === info.code);
      const asOf = lastTradingDay();
      const out = r
        ? [
            {
              date: asOf,
              MarginPurchaseBuy: toNum(r['融資買進']),
              MarginPurchaseSell: toNum(r['融資賣出']),
              MarginPurchaseTodayBalance: toNum(r['融資今日餘額']),
              ShortSaleSell: toNum(r['融券賣出']),
              ShortSaleBuy: toNum(r['融券買進']),
              ShortSaleTodayBalance: toNum(r['融券今日餘額']),
              OffsetLoanAndShort: toNum(r['資券互抵']),
            },
          ]
        : [];
      return mk('融資融券（當日）', MARGIN_COLUMNS, out, asOf);
    }
    if (dataset === 'valuation') {
      const rows = await this.getJson<Record<string, string>[]>(`${OPENAPI}/exchangeReport/BWIBBU_ALL`);
      const r = rows.find((x) => String(x.Code ?? '').trim() === info.code);
      const asOf = (r?.Date && rocToIso(r.Date)) || lastTradingDay();
      const out = r ? [{ date: asOf, PER: toNum(r.PEratio), PBR: toNum(r.PBratio), dividend_yield: toNum(r.DividendYield) }] : [];
      return mk('本益比 / 股價淨值比 / 殖利率（當日）', VAL_COLUMNS, out, asOf);
    }
    throw new UnsupportedError(`TWSE 不提供 ${dataset}`);
  }
}

function lastTradingDay(): string {
  let d = todayIn('TW');
  for (let i = 0; i < 15 && !isTradingDay('TW', d); i++) d = addDays(d, -1);
  return d;
}

/** 解析 T86 三大法人表格中某檔的買賣超（股 → 張） */
export function parseT86(body: TwseTableResponse, code: string): { foreign: number | null; trust: number | null; dealer: number | null; total: number | null } | null {
  const fields = body.fields ?? body.tables?.[0]?.fields;
  const data = body.data ?? body.tables?.[0]?.data;
  if (!fields || !data) return null;
  const iCode = findCol(fields, '證券代號');
  const row = data.find((r) => String(r[iCode]).trim() === code);
  if (!row) return null;
  const get = (...n: string[]) => {
    const i = findCol(fields, ...n);
    const v = i >= 0 ? toNum(row[i]) : null;
    return v === null ? null : Math.round(v / 1000);
  };
  const f1 = get('外陸資買賣超股數(不含外資自營商)', '外資買賣超股數');
  const f2 = get('外資自營商買賣超股數');
  return {
    foreign: f1 === null ? null : f1 + (f2 ?? 0),
    trust: get('投信買賣超股數'),
    dealer: get('自營商買賣超股數'),
    total: get('三大法人買賣超股數'),
  };
}

const INST_COLUMNS: DataTable['columns'] = [
  { key: 'date', label: '日期' },
  { key: 'foreign', label: '外資買賣超', unit: '張' },
  { key: 'trust', label: '投信買賣超', unit: '張' },
  { key: 'dealer', label: '自營商買賣超', unit: '張' },
  { key: 'total', label: '三大法人合計', unit: '張' },
];
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
const VAL_COLUMNS: DataTable['columns'] = [
  { key: 'date', label: '日期' },
  { key: 'PER', label: '本益比', unit: '倍' },
  { key: 'PBR', label: '股價淨值比', unit: '倍' },
  { key: 'dividend_yield', label: '殖利率', unit: '%' },
];
