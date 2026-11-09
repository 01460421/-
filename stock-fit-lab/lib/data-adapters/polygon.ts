/**
 * Polygon.io（需 POLYGON_API_KEY）：/v2/aggs（adjusted=true，日線與盤中）、/v2/aggs/ticker/{T}/prev。
 * adjusted=true 時 OHLC 皆為還原價；此時 close 與 adjClose 相同（Polygon 不同時回傳原始價）。
 */
import type { Interval, PriceSeries } from '../types';
import type { DataAdapter, HistoryRequest, Quote } from './types';
import { HttpError, UnsupportedError, ValidationError, fetchJson } from './http';
import { getLimiter } from './ratelimit';
import { normalizeSymbol } from './symbols';
import { buildSeries, cleanBars, defaultStart, isIntraday, localDateOf, todayIn, type RawBar } from './util';

export const POLYGON_SOURCE = 'Polygon.io';
const BASE = 'https://api.polygon.io';

function key(): string | undefined {
  return process.env.POLYGON_API_KEY || undefined;
}

export interface PolygonAggs {
  status?: string;
  resultsCount?: number;
  results?: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  error?: string;
  message?: string;
}

const SPAN: Record<Interval, [number, string]> = {
  '1m': [1, 'minute'],
  '5m': [5, 'minute'],
  '15m': [15, 'minute'],
  '60m': [1, 'hour'],
  '1d': [1, 'day'],
  '1wk': [1, 'week'],
  '1mo': [1, 'month'],
};

/** Polygon 指數代號 I:SPX；本系統只對應少數 */
const INDEX_MAP: Record<string, string> = { '^GSPC': 'I:SPX', '^IXIC': 'I:COMP', '^DJI': 'I:DJI', '^VIX': 'I:VIX', '^SOX': 'I:SOX' };

export function polygonTicker(symbol: string): string | null {
  if (INDEX_MAP[symbol]) return INDEX_MAP[symbol];
  if (symbol.startsWith('^') || symbol.includes('=')) return null;
  return symbol; // Polygon 使用 BRK.B
}

export function parsePolygonAggs(body: PolygonAggs, interval: Interval): RawBar[] {
  if (body.status === 'ERROR' || body.error) throw new HttpError(`Polygon: ${body.error ?? body.message}`, 400, '');
  if (!Array.isArray(body.results)) {
    if (body.resultsCount === 0) return [];
    throw new ValidationError('Polygon: missing results');
  }
  return body.results.map((r) => ({
    t: isIntraday(interval) ? r.t : undefined,
    date: localDateOf(r.t, 'America/New_York'),
    open: r.o,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v,
    adjClose: r.c,
  }));
}

export class PolygonAdapter implements DataAdapter {
  readonly id = 'polygon';
  readonly name = 'Polygon.io';
  readonly markets = ['US'] as 'US'[];
  readonly requiresKey = true;

  isConfigured(): boolean {
    return !!key();
  }

  supportsInterval(): boolean {
    return true;
  }

  async getHistory(symbol: string, req: HistoryRequest): Promise<PriceSeries> {
    const k = key();
    if (!k) throw new UnsupportedError('未設定 POLYGON_API_KEY');
    const info = normalizeSymbol(symbol);
    const ticker = info && info.market === 'US' ? polygonTicker(info.symbol) : null;
    if (!info || !ticker) throw new UnsupportedError(`Polygon 不支援 ${symbol}`);
    const end = req.end ?? todayIn('US');
    const start = req.start ?? defaultStart(req.interval, end);
    const [mult, span] = SPAN[req.interval];
    const url = `${BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${mult}/${span}/${start}/${end}?adjusted=true&sort=asc&limit=50000&apiKey=${k}`;
    const body = await fetchJson<PolygonAggs>(url, { limiter: getLimiter('polygon'), redact: [k] });
    const raw = parsePolygonAggs(body, req.interval);
    const { bars } = cleanBars(raw, 'US', req.interval);
    return buildSeries({
      symbol: info.symbol,
      market: 'US',
      currency: 'USD',
      interval: req.interval,
      source: POLYGON_SOURCE,
      delayMinutes: isIntraday(req.interval) ? 15 : 0,
      adjusted: true,
      bars,
    });
  }

  async getQuote(symbol: string): Promise<Quote> {
    const k = key();
    if (!k) throw new UnsupportedError('未設定 POLYGON_API_KEY');
    const info = normalizeSymbol(symbol);
    const ticker = info && polygonTicker(info.symbol);
    if (!info || !ticker) throw new UnsupportedError(symbol);
    const body = await fetchJson<PolygonAggs>(`${BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true&apiKey=${k}`, { limiter: getLimiter('polygon'), redact: [k] });
    const r = body.results?.[0];
    if (!r) throw new ValidationError('Polygon: no prev close');
    return { symbol: info.symbol, price: r.c, change: r.c - r.o, changePct: ((r.c - r.o) / r.o) * 100, at: new Date(r.t).toISOString(), delayMinutes: 0, source: `${POLYGON_SOURCE}（前一交易日收盤）` };
  }
}
