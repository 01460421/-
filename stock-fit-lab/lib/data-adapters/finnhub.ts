/**
 * Finnhub（需 FINNHUB_API_KEY）：/quote、/stock/candle（歷史，部分方案付費）、/calendar/earnings、
 * /stock/insider-transactions、/company-news（只取標題與連結）。
 */
import type { Interval, PriceSeries } from '../types';
import type { CorporateEvent, DataAdapter, DataTable, DatasetId, HistoryRequest, Quote } from './types';
import { UnsupportedError, ValidationError, fetchJson } from './http';
import { getLimiter } from './ratelimit';
import { normalizeSymbol } from './symbols';
import { buildSeries, cleanBars, defaultStart, isIntraday, localDateOf, todayIn, type RawBar } from './util';
import { addDays } from '../calendar';

export const FINNHUB_SOURCE = 'Finnhub';
const BASE = 'https://finnhub.io/api/v1';

function key(): string | undefined {
  return process.env.FINNHUB_API_KEY || undefined;
}

export interface FinnhubQuote {
  c: number;
  d: number | null;
  dp: number | null;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

export interface FinnhubCandles {
  s: 'ok' | 'no_data';
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
}

const RES: Record<Interval, string> = { '1m': '1', '5m': '5', '15m': '15', '60m': '60', '1d': 'D', '1wk': 'W', '1mo': 'M' };

export function parseFinnhubQuote(q: FinnhubQuote, symbol: string): Quote {
  if (!q || typeof q.c !== 'number' || q.c <= 0) throw new ValidationError('Finnhub: invalid quote');
  return { symbol, price: q.c, change: q.d ?? undefined, changePct: q.dp ?? undefined, at: new Date((q.t || Date.now() / 1000) * 1000).toISOString(), delayMinutes: 0, source: FINNHUB_SOURCE };
}

export function parseFinnhubCandles(body: FinnhubCandles, interval: Interval): RawBar[] {
  if (body.s === 'no_data') return [];
  if (body.s !== 'ok' || !body.t) throw new ValidationError('Finnhub: invalid candles');
  return body.t.map((t, i) => ({
    t: isIntraday(interval) ? t * 1000 : undefined,
    date: localDateOf(t * 1000, 'America/New_York'),
    open: body.o?.[i] ?? null,
    high: body.h?.[i] ?? null,
    low: body.l?.[i] ?? null,
    close: body.c?.[i] ?? null,
    volume: body.v?.[i] ?? null,
  }));
}

export class FinnhubAdapter implements DataAdapter {
  readonly id = 'finnhub';
  readonly name = 'Finnhub';
  readonly markets = ['US'] as 'US'[];
  readonly requiresKey = true;

  isConfigured(): boolean {
    return !!key();
  }

  supportsInterval(): boolean {
    return true;
  }

  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    const k = key();
    if (!k) throw new UnsupportedError('未設定 FINNHUB_API_KEY');
    const qs = new URLSearchParams({ ...params, token: k }).toString();
    return fetchJson<T>(`${BASE}${path}?${qs}`, { limiter: getLimiter('finnhub'), redact: [k] });
  }

  private info(symbol: string) {
    const info = normalizeSymbol(symbol);
    if (!info || info.market !== 'US' || info.symbol.startsWith('^') || info.symbol.includes('=')) throw new UnsupportedError(`Finnhub 不支援 ${symbol}`);
    return info;
  }

  async getHistory(symbol: string, req: HistoryRequest): Promise<PriceSeries> {
    const info = this.info(symbol);
    const end = req.end ?? todayIn('US');
    const start = req.start ?? defaultStart(req.interval, end);
    const body = await this.get<FinnhubCandles>('/stock/candle', {
      symbol: info.symbol,
      resolution: RES[req.interval],
      from: String(Math.floor(Date.parse(start + 'T00:00:00Z') / 1000)),
      to: String(Math.floor(Date.parse(end + 'T23:59:59Z') / 1000)),
    });
    const { bars } = cleanBars(parseFinnhubCandles(body, req.interval), 'US', req.interval);
    return buildSeries({ symbol: info.symbol, market: 'US', currency: 'USD', interval: req.interval, source: FINNHUB_SOURCE, delayMinutes: 0, adjusted: false, bars });
  }

  async getQuote(symbol: string): Promise<Quote> {
    const info = this.info(symbol);
    return parseFinnhubQuote(await this.get<FinnhubQuote>('/quote', { symbol: info.symbol }), info.symbol);
  }

  async getEvents(symbol: string, opts: { start?: string; end?: string } = {}): Promise<CorporateEvent[]> {
    const info = this.info(symbol);
    const end = opts.end ?? addDays(todayIn('US'), 120);
    const start = opts.start ?? addDays(end, -365 * 2);
    const body = await this.get<{ earningsCalendar?: { date: string; hour?: string; quarter?: number; year?: number; epsEstimate?: number | null; epsActual?: number | null }[] }>(
      '/calendar/earnings',
      { symbol: info.symbol, from: start, to: end },
    );
    return (body.earningsCalendar ?? []).map((e) => ({
      date: e.date,
      type: 'earnings' as const,
      title: `財報 ${e.year ?? ''}Q${e.quarter ?? ''}${e.hour === 'bmo' ? '（盤前）' : e.hour === 'amc' ? '（盤後）' : ''}`,
      source: FINNHUB_SOURCE,
    }));
  }

  async getDataset(symbol: string, dataset: DatasetId, opts: { start?: string; end?: string } = {}): Promise<DataTable> {
    const info = this.info(symbol);
    const end = opts.end ?? todayIn('US');
    const start = opts.start ?? addDays(end, dataset === 'news' ? -7 : -365);
    const mk = (title: string, columns: DataTable['columns'], rows: DataTable['rows']): DataTable => ({
      dataset,
      title,
      symbol: info.symbol,
      source: FINNHUB_SOURCE,
      fetchedAt: new Date().toISOString(),
      asOf: (rows[0]?.date as string) ?? end,
      delayMinutes: 0,
      columns,
      rows,
    });
    if (dataset === 'insider') {
      const body = await this.get<{ data?: { name: string; share: number; change: number; filingDate: string; transactionDate: string; transactionCode: string; transactionPrice: number }[] }>(
        '/stock/insider-transactions',
        { symbol: info.symbol, from: start, to: end },
      );
      const rows = (body.data ?? []).map((d) => ({ date: d.transactionDate, filingDate: d.filingDate, name: d.name, code: d.transactionCode, change: d.change, shares: d.share, price: d.transactionPrice }));
      rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return mk('內部人交易', [
        { key: 'date', label: '交易日' },
        { key: 'filingDate', label: '申報日' },
        { key: 'name', label: '內部人' },
        { key: 'code', label: '交易代碼' },
        { key: 'change', label: '持股變動', unit: '股' },
        { key: 'shares', label: '交易後持股', unit: '股' },
        { key: 'price', label: '成交價', unit: 'USD' },
      ], rows);
    }
    if (dataset === 'news') {
      const body = await this.get<{ datetime: number; headline: string; source: string; url: string }[]>('/company-news', { symbol: info.symbol, from: start, to: end });
      const rows = (Array.isArray(body) ? body : []).slice(0, 50).map((n) => ({ date: new Date(n.datetime * 1000).toISOString(), title: n.headline, source: n.source, link: n.url }));
      return mk('新聞標題', [
        { key: 'date', label: '時間' },
        { key: 'title', label: '標題' },
        { key: 'source', label: '來源' },
        { key: 'link', label: '連結' },
      ], rows);
    }
    throw new UnsupportedError(`Finnhub 不提供 ${dataset}`);
  }
}
