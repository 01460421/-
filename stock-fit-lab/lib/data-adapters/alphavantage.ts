/**
 * Alpha Vantage（需 ALPHAVANTAGE_API_KEY）：TIME_SERIES_DAILY_ADJUSTED / TIME_SERIES_INTRADAY / GLOBAL_QUOTE。
 * 回應中的 "Note" / "Information" 代表超出配額，轉為 HTTP 429 語意。
 */
import type { Interval, PriceSeries } from '../types';
import type { DataAdapter, HistoryRequest, Quote } from './types';
import { HttpError, UnsupportedError, ValidationError, fetchJson } from './http';
import { getLimiter } from './ratelimit';
import { normalizeSymbol } from './symbols';
import { buildSeries, cleanBars, defaultStart, filterRange, isIntraday, resample, todayIn, toNum, zonedTimeToUtc, type RawBar } from './util';

export const ALPHAVANTAGE_SOURCE = 'Alpha Vantage';
const BASE = 'https://www.alphavantage.co/query';

function key(): string | undefined {
  return process.env.ALPHAVANTAGE_API_KEY || undefined;
}

type AvBody = Record<string, unknown> & { Note?: string; Information?: string; 'Error Message'?: string };

function check(body: AvBody, url: string): void {
  if (body['Error Message']) throw new HttpError(`Alpha Vantage: ${body['Error Message']}`, 400, url);
  const note = body.Note ?? body.Information;
  if (note && Object.keys(body).length <= 2) throw new HttpError(`Alpha Vantage quota: ${note}`, 429, url);
}

export function parseAlphaDaily(body: AvBody): RawBar[] {
  const ts = body['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined;
  if (!ts || typeof ts !== 'object') throw new ValidationError('Alpha Vantage: missing Time Series (Daily)');
  return Object.entries(ts).map(([date, v]) => ({
    date,
    open: toNum(v['1. open']),
    high: toNum(v['2. high']),
    low: toNum(v['3. low']),
    close: toNum(v['4. close']),
    adjClose: toNum(v['5. adjusted close']),
    volume: toNum(v['6. volume'] ?? v['5. volume']),
  }));
}

export function parseAlphaIntraday(body: AvBody): RawBar[] {
  const k = Object.keys(body).find((x) => x.startsWith('Time Series ('));
  const ts = k ? (body[k] as Record<string, Record<string, string>>) : undefined;
  if (!ts) throw new ValidationError('Alpha Vantage: missing intraday series');
  return Object.entries(ts).map(([dt, v]) => {
    const [date, time] = dt.split(' ');
    return {
      t: zonedTimeToUtc(date, (time ?? '00:00').slice(0, 5), 'America/New_York'),
      date,
      open: toNum(v['1. open']),
      high: toNum(v['2. high']),
      low: toNum(v['3. low']),
      close: toNum(v['4. close']),
      volume: toNum(v['5. volume']),
    };
  });
}

export class AlphaVantageAdapter implements DataAdapter {
  readonly id = 'alphavantage';
  readonly name = 'Alpha Vantage';
  readonly markets = ['US'] as 'US'[];
  readonly requiresKey = true;

  isConfigured(): boolean {
    return !!key();
  }

  supportsInterval(_i: Interval): boolean {
    return true;
  }

  async getHistory(symbol: string, req: HistoryRequest): Promise<PriceSeries> {
    const k = key();
    if (!k) throw new UnsupportedError('未設定 ALPHAVANTAGE_API_KEY');
    const info = normalizeSymbol(symbol);
    if (!info || info.market !== 'US' || info.symbol.startsWith('^') || info.symbol.includes('=')) throw new UnsupportedError(`Alpha Vantage 不支援 ${symbol}`);
    const end = req.end ?? todayIn('US');
    const start = req.start ?? defaultStart(req.interval, end);
    const intraday = isIntraday(req.interval);
    const params: Record<string, string> = intraday
      ? { function: 'TIME_SERIES_INTRADAY', symbol: info.symbol, interval: req.interval.replace('m', 'min'), outputsize: 'full', adjusted: 'true' }
      : { function: 'TIME_SERIES_DAILY_ADJUSTED', symbol: info.symbol, outputsize: 'full' };
    const url = `${BASE}?${new URLSearchParams({ ...params, apikey: k }).toString()}`;
    const body = await fetchJson<AvBody>(url, { limiter: getLimiter('alphavantage'), redact: [k] });
    check(body, url.replace(k, '***'));
    const raw = intraday ? parseAlphaIntraday(body) : parseAlphaDaily(body);
    const { bars } = cleanBars(raw, 'US', intraday ? req.interval : '1d');
    let out = intraday ? bars : filterRange(bars, start, end);
    if (req.interval === '1wk' || req.interval === '1mo') out = resample(out, req.interval);
    return buildSeries({ symbol: info.symbol, market: 'US', currency: 'USD', interval: req.interval, source: ALPHAVANTAGE_SOURCE, delayMinutes: intraday ? 15 : 0, adjusted: !intraday, bars: out });
  }

  async getQuote(symbol: string): Promise<Quote> {
    const k = key();
    if (!k) throw new UnsupportedError('未設定 ALPHAVANTAGE_API_KEY');
    const info = normalizeSymbol(symbol);
    if (!info || info.market !== 'US') throw new UnsupportedError(symbol);
    const url = `${BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(info.symbol)}&apikey=${k}`;
    const body = await fetchJson<AvBody>(url, { limiter: getLimiter('alphavantage'), redact: [k] });
    check(body, url.replace(k, '***'));
    const q = body['Global Quote'] as Record<string, string> | undefined;
    const price = q ? toNum(q['05. price']) : null;
    if (!q || !price) throw new ValidationError('Alpha Vantage: missing Global Quote');
    return {
      symbol: info.symbol,
      price,
      change: toNum(q['09. change']) ?? undefined,
      changePct: toNum(String(q['10. change percent'] ?? '').replace('%', '')) ?? undefined,
      at: new Date().toISOString(),
      delayMinutes: 15,
      source: ALPHAVANTAGE_SOURCE,
    };
  }
}
