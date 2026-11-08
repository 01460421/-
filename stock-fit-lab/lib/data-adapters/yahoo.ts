/**
 * Yahoo Finance chart endpoint（非官方）：query1 / query2 `/v8/finance/chart/{symbol}`。
 *  - 支援日線 / 週線 / 月線與盤中 1m（7 天內）、5m / 15m（60 天內）、60m（730 天內）
 *  - indicators.adjclose 為除權息 + 分割還原價；close 為僅分割調整的價格（保留為原始收盤）
 *  - 429 時自動換主機重試；quoteSummary calendarEvents（財報日）可用時一併取得
 * 台股代號沿用 2330.TW / 6488.TWO。
 */
import type { Interval, Market, PriceSeries } from '../types';
import type { CorporateEvent, DataAdapter, HistoryRequest, Quote } from './types';
import { HttpError, UnsupportedError, ValidationError, fetchJson } from './http';
import { getLimiter } from './ratelimit';
import { normalizeSymbol, toYahooSymbol } from './symbols';
import { MARKET_CURRENCY, buildSeries, cleanBars, defaultStart, filterRange, isIntraday, todayIn, type RawBar } from './util';
import { addDays } from '../calendar';

export const YAHOO_SOURCE = 'Yahoo Finance';
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; stock-fit-lab/0.1)', Accept: 'application/json' };

export interface YahooChartResult {
  meta: {
    currency?: string;
    symbol: string;
    exchangeName?: string;
    instrumentType?: string;
    gmtoffset?: number;
    exchangeTimezoneName?: string;
    regularMarketPrice?: number;
    regularMarketTime?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    exchangeDataDelayedBy?: number;
  };
  timestamp?: number[];
  events?: {
    dividends?: Record<string, { amount: number; date: number }>;
    splits?: Record<string, { date: number; numerator: number; denominator: number; splitRatio?: string }>;
    earnings?: Record<string, { date: number }>;
  };
  indicators: {
    quote: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[];
    adjclose?: { adjclose?: (number | null)[] }[];
  };
}

export interface YahooChartResponse {
  chart: { result: YahooChartResult[] | null; error: { code: string; description: string } | null };
}

const INTERVAL_MAP: Record<Interval, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '60m': '60m', '1d': '1d', '1wk': '1wk', '1mo': '1mo' };

function localDate(tsSec: number, gmtoffset: number): string {
  return new Date((tsSec + gmtoffset) * 1000).toISOString().slice(0, 10);
}

export function defaultDelay(market: Market): number {
  return market === 'US' ? 15 : 20;
}

/** 解析 chart 回應為 RawBar（含 adjClose） */
export function parseYahooChart(body: YahooChartResponse, interval: Interval): { raw: RawBar[]; meta: YahooChartResult['meta']; result: YahooChartResult } {
  if (!body?.chart) throw new ValidationError('Yahoo: missing chart');
  if (body.chart.error) throw new HttpError(`Yahoo: ${body.chart.error.code} ${body.chart.error.description}`, body.chart.error.code === 'Not Found' ? 404 : 400, '');
  const result = body.chart.result?.[0];
  if (!result?.meta || !result.indicators?.quote?.[0]) throw new ValidationError('Yahoo: missing result');
  const ts = result.timestamp ?? [];
  const q = result.indicators.quote[0];
  const adj = result.indicators.adjclose?.[0]?.adjclose;
  const off = result.meta.gmtoffset ?? 0;
  const raw: RawBar[] = ts.map((t, i) => ({
    t: isIntraday(interval) ? t * 1000 : undefined,
    date: localDate(t, off),
    open: q.open?.[i] ?? null,
    high: q.high?.[i] ?? null,
    low: q.low?.[i] ?? null,
    close: q.close?.[i] ?? null,
    volume: q.volume?.[i] ?? null,
    adjClose: adj ? (adj[i] ?? null) : undefined,
  }));
  return { raw, meta: result.meta, result };
}

export function yahooEvents(result: YahooChartResult): CorporateEvent[] {
  const off = result.meta.gmtoffset ?? 0;
  const out: CorporateEvent[] = [];
  for (const d of Object.values(result.events?.dividends ?? {})) out.push({ date: localDate(d.date, off), type: 'dividend', title: `除息：每股 ${d.amount}`, source: YAHOO_SOURCE });
  for (const s of Object.values(result.events?.splits ?? {}))
    out.push({ date: localDate(s.date, off), type: 'split', title: `股票分割 ${s.splitRatio ?? `${s.numerator}:${s.denominator}`}`, source: YAHOO_SOURCE });
  for (const e of Object.values(result.events?.earnings ?? {})) out.push({ date: localDate(e.date, off), type: 'earnings', title: '財報發布', source: YAHOO_SOURCE });
  return out;
}

export class YahooAdapter implements DataAdapter {
  readonly id = 'yahoo';
  readonly name = 'Yahoo Finance';
  readonly markets = ['TW', 'TWO', 'US'] as Market[];
  readonly requiresKey = false;

  isConfigured(): boolean {
    return process.env.YAHOO_DISABLED !== '1';
  }

  supportsInterval(): boolean {
    return true;
  }

  /** 依序嘗試 query1 / query2；429 換主機 */
  private async chart(ysym: string, params: Record<string, string>): Promise<YahooChartResponse> {
    const qs = new URLSearchParams(params).toString();
    let lastErr: unknown;
    for (const host of HOSTS) {
      try {
        return await fetchJson<YahooChartResponse>(`${host}/v8/finance/chart/${encodeURIComponent(ysym)}?${qs}`, {
          limiter: getLimiter('yahoo'),
          headers: HEADERS,
          retries: 1,
        });
      } catch (e) {
        lastErr = e;
        if (e instanceof HttpError && e.status === 404) throw e;
      }
    }
    throw lastErr;
  }

  async getHistory(symbol: string, req: HistoryRequest): Promise<PriceSeries> {
    const info = normalizeSymbol(symbol);
    if (!info) throw new UnsupportedError(`Yahoo: 無法辨識 ${symbol}`);
    const end = req.end ?? todayIn(info.market);
    let start = req.start ?? defaultStart(req.interval, end);
    if (req.interval === '1m' && start < addDays(end, -7)) start = addDays(end, -7);
    if ((req.interval === '5m' || req.interval === '15m') && start < addDays(end, -59)) start = addDays(end, -59);
    const period1 = Math.floor(Date.parse(start + 'T00:00:00Z') / 1000) - 86400;
    const period2 = Math.floor(Date.parse(end + 'T23:59:59Z') / 1000) + 86400;
    const body = await this.chart(toYahooSymbol(info.symbol), {
      period1: String(period1),
      period2: String(period2),
      interval: INTERVAL_MAP[req.interval],
      includeAdjustedClose: 'true',
      events: 'div,splits',
    });
    const { raw, meta } = parseYahooChart(body, req.interval);
    const hasAdj = raw.some((b) => b.adjClose != null);
    const { bars } = cleanBars(raw, info.market, req.interval);
    const out = isIntraday(req.interval) ? bars : filterRange(bars, start, end);
    const intraday = isIntraday(req.interval);
    return buildSeries({
      symbol: info.symbol,
      market: info.market,
      currency: meta.currency ?? MARKET_CURRENCY[info.market],
      interval: req.interval,
      source: YAHOO_SOURCE,
      delayMinutes: intraday ? (meta.exchangeDataDelayedBy ?? defaultDelay(info.market)) : 0,
      adjusted: hasAdj && !intraday,
      bars: out,
    });
  }

  async getQuote(symbol: string): Promise<Quote> {
    const info = normalizeSymbol(symbol);
    if (!info) throw new UnsupportedError(symbol);
    const body = await this.chart(toYahooSymbol(info.symbol), { range: '5d', interval: '1d' });
    const { meta } = parseYahooChart(body, '1d');
    const price = meta.regularMarketPrice;
    if (typeof price !== 'number') throw new ValidationError('Yahoo: missing regularMarketPrice');
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    return {
      symbol: info.symbol,
      price,
      change: prev ? price - prev : undefined,
      changePct: prev ? ((price - prev) / prev) * 100 : undefined,
      at: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
      delayMinutes: meta.exchangeDataDelayedBy ?? defaultDelay(info.market),
      source: YAHOO_SOURCE,
    };
  }

  async getEvents(symbol: string, opts: { start?: string; end?: string } = {}): Promise<CorporateEvent[]> {
    const info = normalizeSymbol(symbol);
    if (!info || info.symbol.startsWith('^') || info.symbol.includes('=')) return [];
    const end = opts.end ?? todayIn(info.market);
    const start = opts.start ?? addDays(end, -365 * 3);
    const ysym = toYahooSymbol(info.symbol);
    const body = await this.chart(ysym, {
      period1: String(Math.floor(Date.parse(start + 'T00:00:00Z') / 1000)),
      period2: String(Math.floor(Date.parse(end + 'T23:59:59Z') / 1000)),
      interval: '1d',
      events: 'div,splits,earn',
    });
    const { result } = parseYahooChart(body, '1d');
    const events = yahooEvents(result);
    // 財報日（quoteSummary 可能需要 crumb；失敗就略過）
    try {
      const qs = await fetchJson<{ quoteSummary?: { result?: { calendarEvents?: { earnings?: { earningsDate?: { raw: number }[] } } }[] } }>(
        `${HOSTS[1]}/v10/finance/quoteSummary/${encodeURIComponent(ysym)}?modules=calendarEvents`,
        { limiter: getLimiter('yahoo'), headers: HEADERS, retries: 0, timeoutMs: 6000 },
      );
      const dates = qs.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate ?? [];
      for (const d of dates) {
        if (typeof d?.raw === 'number') events.push({ date: new Date(d.raw * 1000).toISOString().slice(0, 10), type: 'earnings', title: '預定財報日', source: YAHOO_SOURCE });
      }
    } catch {
      /* calendarEvents 不可用 */
    }
    return events;
  }
}
