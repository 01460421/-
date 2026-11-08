/**
 * 櫃買中心（TPEx）：
 *  - 歷史：www.tpex.org.tw 個股日成交資訊（逐月 JSON，官方公開）
 *  - OpenAPI（www.tpex.org.tw/openapi/v1）：當日收盤行情、三大法人、融資融券、本益比、櫃買指數
 */
import type { Bar, Interval, PriceSeries } from '../types';
import type { DataAdapter, DataTable, DatasetId, HistoryRequest, Quote } from './types';
import { UnsupportedError, ValidationError, fetchJson } from './http';
import { getLimiter } from './ratelimit';
import { normalizeSymbol } from './symbols';
import { monthStarts, parseDailyTable } from './twcommon';
import { buildSeries, cleanBars, closeTimeIso, defaultStart, filterRange, isIntraday, resample, rocToIso, todayIn, toNum, type RawBar } from './util';

export const TPEX_SOURCE = '櫃買中心 TPEx';
const OPENAPI = 'https://www.tpex.org.tw/openapi/v1';
const HIST = 'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock';

export interface TpexDailyQuote {
  Date: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  Close: string;
  Change?: string;
  Open: string;
  High: string;
  Low: string;
  TradingShares: string;
  [k: string]: unknown;
}

export interface TpexHistResponse {
  stat?: string;
  code?: string;
  tables?: { fields?: string[]; data?: unknown[][] }[];
}

export function parseTpexHistory(body: TpexHistResponse): RawBar[] {
  if (!body || !Array.isArray(body.tables)) throw new ValidationError('TPEx: tables 缺失');
  const out: RawBar[] = [];
  for (const t of body.tables) {
    if (!t?.fields || !Array.isArray(t.data)) continue;
    // 「成交張數」→ 股
    const isLots = t.fields.some((f) => f.includes('張'));
    out.push(...parseDailyTable(t.fields, t.data, { volumeMultiplier: isLots ? 1000 : 1 }));
  }
  return out;
}

export function parseTpexQuote(rows: TpexDailyQuote[], code: string): RawBar | null {
  const r = rows.find((x) => x.SecuritiesCompanyCode?.trim() === code);
  if (!r) return null;
  const date = rocToIso(r.Date);
  if (!date) return null;
  return { date, open: toNum(r.Open), high: toNum(r.High), low: toNum(r.Low), close: toNum(r.Close), volume: toNum(r.TradingShares) };
}

export class TpexAdapter implements DataAdapter {
  readonly id = 'tpex';
  readonly name = '櫃買中心 TPEx';
  readonly markets = ['TWO'] as 'TWO'[];
  readonly requiresKey = false;

  isConfigured(): boolean {
    return true;
  }

  supportsInterval(i: Interval): boolean {
    return !isIntraday(i);
  }

  private async getJson<T>(url: string): Promise<T> {
    return fetchJson<T>(url, { limiter: getLimiter('tpex') });
  }

  async getHistory(symbol: string, req: HistoryRequest): Promise<PriceSeries> {
    const info = normalizeSymbol(symbol);
    if (!info || info.market !== 'TWO') throw new UnsupportedError(`TPEx 只提供上櫃代號：${symbol}`);
    if (isIntraday(req.interval)) throw new UnsupportedError('TPEx 不提供盤中 K 線');
    const end = req.end ?? todayIn('TWO');
    const start = req.start ?? defaultStart(req.interval, end);
    let raw: RawBar[] = [];
    if (info.symbol === '^TWOII') {
      const rows = await this.getJson<{ Date: string; Open: string; High: string; Low: string; Close: string }[]>(`${OPENAPI}/tpex_index`);
      raw = rows.map((r) => ({ date: rocToIso(r.Date) ?? '', open: toNum(r.Open), high: toNum(r.High), low: toNum(r.Low), close: toNum(r.Close), volume: 0 }));
    } else {
      for (const m of monthStarts(start, end, 36)) {
        const body = await this.getJson<TpexHistResponse>(`${HIST}?code=${encodeURIComponent(info.code)}&date=${m.slice(0, 4)}%2F${m.slice(5, 7)}%2F01&response=json`);
        raw.push(...parseTpexHistory(body));
      }
    }
    const { bars } = cleanBars(raw, 'TWO', '1d');
    let out: Bar[] = filterRange(bars, start, end);
    if (req.interval === '1wk' || req.interval === '1mo') out = resample(out, req.interval);
    return buildSeries({ symbol: info.symbol, market: 'TWO', currency: 'TWD', interval: req.interval, source: TPEX_SOURCE, delayMinutes: 0, adjusted: false, bars: out });
  }

  async getQuote(symbol: string): Promise<Quote> {
    const info = normalizeSymbol(symbol);
    if (!info || info.market !== 'TWO') throw new UnsupportedError(symbol);
    const rows = await this.getJson<TpexDailyQuote[]>(`${OPENAPI}/tpex_mainboard_daily_close_quotes`);
    const bar = parseTpexQuote(rows, info.code);
    if (!bar || !bar.close) throw new ValidationError(`TPEx: 找不到 ${info.code}`);
    const r = rows.find((x) => x.SecuritiesCompanyCode?.trim() === info.code)!;
    const change = toNum(r.Change);
    return {
      symbol: info.symbol,
      price: bar.close,
      change: change ?? undefined,
      changePct: change !== null ? (change / (bar.close - change)) * 100 : undefined,
      at: closeTimeIso('TWO', bar.date),
      delayMinutes: 0,
      source: `${TPEX_SOURCE}（收盤價）`,
    };
  }

  async getDataset(symbol: string, dataset: DatasetId): Promise<DataTable> {
    const info = normalizeSymbol(symbol);
    if (!info || info.market !== 'TWO') throw new UnsupportedError(symbol);
    const spec = TPEX_DATASETS[dataset];
    if (!spec) throw new UnsupportedError(`TPEx 不提供 ${dataset}`);
    const rows = await this.getJson<Record<string, string>[]>(`${OPENAPI}/${spec.path}`);
    const mine = rows.filter((r) => String(r.SecuritiesCompanyCode ?? '').trim() === info.code);
    const outRows = mine.map((r) => {
      const o: DataTable['rows'][number] = { date: rocToIso(r.Date) };
      for (const c of spec.columns) if (c.key !== 'date') o[c.key] = c.compute ? c.compute(r) : toNum(r[c.src ?? c.key]);
      return o;
    });
    return {
      dataset,
      title: `${spec.title}（當日）`,
      symbol: info.symbol,
      source: TPEX_SOURCE,
      fetchedAt: new Date().toISOString(),
      asOf: (outRows[0]?.date as string) ?? todayIn('TWO'),
      delayMinutes: 0,
      columns: spec.columns.map(({ key, label, unit }) => ({ key, label, unit })),
      rows: outRows,
    };
  }
}

interface Col {
  key: string;
  label: string;
  unit?: string;
  src?: string;
  compute?: (r: Record<string, string>) => number | null;
}

/** TPEx 三大法人欄位名稱不一致（含空白），以關鍵字搜尋 */
function fieldBy(r: Record<string, string>, ...needles: string[]): number | null {
  const norm = (k: string) => k.replace(/\s+/g, '').toLowerCase();
  if (needles.length === 1) {
    const exact = Object.keys(r).find((k) => norm(k) === norm(needles[0]));
    if (exact) return toNum(r[exact]);
  }
  for (const k of Object.keys(r)) {
    const nk = k.replace(/\s+/g, '').toLowerCase();
    if (needles.every((n) => nk.includes(n.toLowerCase()))) return toNum(r[k]);
  }
  return null;
}

const lots = (v: number | null) => (v === null ? null : Math.round(v / 1000));

const TPEX_DATASETS: Partial<Record<DatasetId, { path: string; title: string; columns: Col[] }>> = {
  institutional: {
    path: 'tpex_3insti_daily_trading',
    title: '三大法人買賣超',
    columns: [
      { key: 'date', label: '日期' },
      { key: 'foreign', label: '外資買賣超', unit: '張', compute: (r) => lots(fieldBy(r, 'ForeignInvestorsIncludeMainlandAreaInvestors-Difference')) },
      { key: 'trust', label: '投信買賣超', unit: '張', compute: (r) => lots(fieldBy(r, 'SecuritiesInvestmentTrustCompanies-Difference')) },
      { key: 'dealer', label: '自營商買賣超', unit: '張', compute: (r) => lots(fieldBy(r, 'Dealers-Difference')) },
      { key: 'total', label: '三大法人合計', unit: '張', compute: (r) => lots(fieldBy(r, 'TotalDifference')) },
    ],
  },
  margin: {
    path: 'tpex_mainboard_margin_balance',
    title: '融資融券',
    columns: [
      { key: 'date', label: '日期' },
      { key: 'MarginPurchase', label: '融資買進', unit: '張' },
      { key: 'MarginSales', label: '融資賣出', unit: '張' },
      { key: 'MarginPurchaseBalance', label: '融資餘額', unit: '張' },
      { key: 'ShortSale', label: '融券賣出', unit: '張' },
      { key: 'ShortConvering', label: '融券買進', unit: '張' },
      { key: 'ShortSaleBalance', label: '融券餘額', unit: '張' },
      { key: 'Offsetting', label: '資券互抵', unit: '張' },
    ],
  },
  valuation: {
    path: 'tpex_mainboard_peratio_analysis',
    title: '本益比 / 股價淨值比 / 殖利率',
    columns: [
      { key: 'date', label: '日期' },
      { key: 'PER', label: '本益比', unit: '倍', src: 'PriceEarningRatio' },
      { key: 'PBR', label: '股價淨值比', unit: '倍', src: 'PriceBookRatio' },
      { key: 'dividend_yield', label: '殖利率', unit: '%', src: 'YieldRatio' },
    ],
  },
};
