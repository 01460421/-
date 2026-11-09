import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FinMindAdapter, computeAdjClose, dividendExEvents, pivotInstitutional, revenueTable } from '@/lib/data-adapters/finmind';
import { YahooAdapter, parseYahooChart } from '@/lib/data-adapters/yahoo';
import { TpexAdapter, parseTpexHistory } from '@/lib/data-adapters/tpex';
import { parseTwseHistory, parseT86 } from '@/lib/data-adapters/twse';
import { parseAlphaDaily, AlphaVantageAdapter } from '@/lib/data-adapters/alphavantage';
import { parsePolygonAggs, PolygonAdapter } from '@/lib/data-adapters/polygon';
import { FinnhubAdapter, parseFinnhubQuote } from '@/lib/data-adapters/finnhub';
import { httpConfig } from '@/lib/data-adapters/http';
import { resetLimiters } from '@/lib/data-adapters/ratelimit';
import { cleanBars, rocToIso, resample } from '@/lib/data-adapters/util';
import * as fx from './fixtures';

const fetchMock = vi.fn();

beforeEach(() => {
  resetLimiters();
  httpConfig.baseDelayMs = 1;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.FINMIND_TOKEN;
  delete process.env.ALPHAVANTAGE_API_KEY;
  delete process.env.POLYGON_API_KEY;
  delete process.env.FINNHUB_API_KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function urlOf(call: unknown[]): string {
  return String(call[0]);
}

describe('FinMind', () => {
  it('解析日線、以股利自算還原價、缺值前值填補', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('dataset=TaiwanStockPrice&')) return fx.jsonResponse(fx.finmindPrice);
      if (url.includes('dataset=TaiwanStockDividend')) return fx.jsonResponse(fx.finmindDividend);
      return fx.jsonResponse({ msg: 'unexpected', status: 404 }, 404);
    });
    const s = await new FinMindAdapter().getHistory('2330', { interval: '1d', start: '2026-06-01', end: '2026-06-20' });
    expect(s.symbol).toBe('2330.TW');
    expect(s.source).toBe('FinMind');
    expect(s.market).toBe('TW');
    expect(s.currency).toBe('TWD');
    expect(s.delayMinutes).toBe(0);
    expect(s.adjusted).toBe(true);
    // 無 token 時不呼叫付費的 TaiwanStockPriceAdj
    expect(fetchMock.mock.calls.some((c) => urlOf(c).includes('TaiwanStockPriceAdj'))).toBe(false);
    const dates = s.bars.map((b) => b.date);
    expect(dates).toEqual(['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-15', '2026-06-16']);
    const b12 = s.bars[4];
    expect(b12.filled).toBe(true); // 交易日缺漏
    expect(b12.close).toBe(2250);
    const b15 = s.bars[5];
    expect(b15.filled).toBe(true); // 收盤 0（停牌 / 缺值）
    expect(b15.volume).toBe(0);
    const b10 = s.bars[2];
    expect(b10.high).toBe(2295);
    expect(b10.low).toBe(2250);
    // 除息前一日：factor = (2255 − 6) / 2255
    expect(b10.adjClose).toBeCloseTo(2255 * ((2255 - 6) / 2255), 6);
    expect(s.bars[0].adjClose).toBeCloseTo(2300 * ((2255 - 6) / 2255), 6);
    expect(s.bars[3].adjClose).toBe(2250);
    expect(s.asOf).toBe('2026-06-16T05:30:00.000Z');
  });

  it('有 token 時使用 TaiwanStockPriceAdj；等級不足時退回自算還原', async () => {
    process.env.FINMIND_TOKEN = 'tok';
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      if (url.includes('TaiwanStockPriceAdj')) return fx.jsonResponse(fx.finmindLevelError, 400);
      if (url.includes('dataset=TaiwanStockPrice&')) return fx.jsonResponse(fx.finmindPrice);
      if (url.includes('TaiwanStockDividend')) return fx.jsonResponse(fx.finmindDividend);
      return fx.jsonResponse({}, 404);
    });
    const a = new FinMindAdapter();
    const s = await a.getHistory('2330.TW', { interval: '1d', start: '2026-06-01', end: '2026-06-20' });
    expect(s.adjusted).toBe(true);
    expect(s.bars[0].adjClose).toBeLessThan(s.bars[0].close);
    fetchMock.mockClear();
    await a.getHistory('2330.TW', { interval: '1d', start: '2026-06-01', end: '2026-06-20' });
    // 已記住等級不足，不再重試
    expect(fetchMock.mock.calls.some((c) => urlOf(c).includes('TaiwanStockPriceAdj'))).toBe(false);
  });

  it('配額用盡（402）回報為 429 類錯誤', async () => {
    fetchMock.mockImplementation(async () => fx.jsonResponse({ msg: 'Requests reach the upper limit.', status: 402 }, 402));
    await expect(new FinMindAdapter().getHistory('2330', { interval: '1d', start: '2026-06-01', end: '2026-06-20' })).rejects.toMatchObject({ status: 429 });
  });

  it('不支援盤中與美股', async () => {
    await expect(new FinMindAdapter().getHistory('2330', { interval: '5m' })).rejects.toThrow(/盤中/);
    await expect(new FinMindAdapter().getHistory('AAPL', { interval: '1d' })).rejects.toThrow(/不支援/);
  });

  it('三大法人 pivot（股 → 張）', () => {
    const rows = pivotInstitutional(fx.finmindInstitutional.data);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-11-05', foreign: -3312, trust: 458, dealer: 922 });
    expect(rows[0].total).toBe(Math.round((41380366 - 44692029 + 722215 - 264000 + 530000 - 354600 + 1010926 - 264326) / 1000));
  });

  it('getDataset institutional 回傳表格', async () => {
    fetchMock.mockImplementation(async () => fx.jsonResponse(fx.finmindInstitutional));
    const t = await new FinMindAdapter().getDataset('2330', 'institutional', { start: '2026-11-01', end: '2026-11-06' });
    expect(t.source).toBe('FinMind');
    expect(t.columns.map((c) => c.key)).toEqual(['date', 'foreign', 'trust', 'dealer', 'total']);
    expect(t.asOf).toBe('2026-11-05');
  });

  it('月營收 YoY / MoM', () => {
    const rows = revenueTable([
      { revenue: 100_000_000, revenue_year: 2025, revenue_month: 6 },
      { revenue: 110_000_000, revenue_year: 2026, revenue_month: 5 },
      { revenue: 121_000_000, revenue_year: 2026, revenue_month: 6 },
    ]);
    const jun = rows.find((r) => r.month === '2026-06')!;
    expect(jun.mom).toBeCloseTo(10, 6);
    expect(jun.yoy).toBeCloseTo(21, 6);
    expect(jun.revenue).toBe(121_000);
  });

  it('還原價：現金 + 股票股利', () => {
    const bars = [
      { date: '2026-01-02', close: 100 },
      { date: '2026-01-05', close: 100 },
      { date: '2026-01-06', close: 90 },
    ];
    const ev = dividendExEvents([{ date: '2025-12-01', stock_id: 'x', CashEarningsDistribution: 2, CashExDividendTradingDate: '2026-01-06', StockEarningsDistribution: 1, StockExDividendTradingDate: '2026-01-06' }]);
    expect(ev).toEqual([{ date: '2026-01-06', cash: 2, stockRatio: 0.1 }]);
    const adj = computeAdjClose(bars, ev);
    const f = (100 - 2) / 1.1 / 100;
    expect(adj[0]).toBeCloseTo(100 * f, 6);
    expect(adj[1]).toBeCloseTo(100 * f, 6);
    expect(adj[2]).toBe(90);
  });
});

describe('Yahoo', () => {
  it('解析 chart：OHLCV、adjclose、null 前值填補、事件', () => {
    const { raw, meta } = parseYahooChart(fx.yahooChart as never, '1d');
    expect(meta.currency).toBe('USD');
    expect(raw.map((r) => r.date)).toEqual(['2025-11-03', '2025-11-04', '2025-11-05', '2025-11-06']);
    const { bars, report } = cleanBars(raw, 'US', '1d');
    expect(report.filled).toBe(1);
    expect(bars[2]).toMatchObject({ filled: true, close: 227.9, volume: 0 });
    expect(bars[0].adjClose).toBe(226.14);
    expect(bars[0].close).toBe(226.4);
  });

  it('getHistory：query1 429 → 改用 query2', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://query1')) return fx.jsonResponse({ error: 'Too Many Requests' }, 429);
      return fx.jsonResponse(fx.yahooChart);
    });
    const s = await new YahooAdapter().getHistory('aapl', { interval: '1d', start: '2025-11-01', end: '2025-11-07' });
    expect(s.source).toBe('Yahoo Finance');
    expect(s.symbol).toBe('AAPL');
    expect(s.adjusted).toBe(true);
    expect(s.bars).toHaveLength(4);
    expect(fetchMock.mock.calls.some((c) => urlOf(c).startsWith('https://query2'))).toBe(true);
    // query1 依 retries=1 重試一次後換主機
    expect(fetchMock.mock.calls.filter((c) => urlOf(c).startsWith('https://query1')).length).toBe(2);
  });

  it('台股代號沿用 .TW / .TWO，BRK.B → BRK-B', async () => {
    fetchMock.mockImplementation(async () => fx.jsonResponse(fx.yahooChart));
    await new YahooAdapter().getHistory('6488.TWO', { interval: '1d', start: '2025-11-01', end: '2025-11-07' }).catch(() => undefined);
    await new YahooAdapter().getHistory('BRK.B', { interval: '1d', start: '2025-11-01', end: '2025-11-07' });
    const urls = fetchMock.mock.calls.map(urlOf);
    expect(urls.some((u) => u.includes('/chart/6488.TWO?'))).toBe(true);
    expect(urls.some((u) => u.includes('/chart/BRK-B?'))).toBe(true);
  });

  it('Not Found 不換主機直接失敗', async () => {
    fetchMock.mockImplementation(async () => fx.jsonResponse(fx.yahooNotFound, 404));
    await expect(new YahooAdapter().getHistory('ZZZZ', { interval: '1d' })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getQuote / getEvents', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes('quoteSummary') ? fx.jsonResponse({ error: 'Invalid Crumb' }, 401) : fx.jsonResponse(fx.yahooChart)));
    const q = await new YahooAdapter().getQuote('AAPL');
    expect(q).toMatchObject({ symbol: 'AAPL', price: 228.5, source: 'Yahoo Finance' });
    expect(q.change).toBeCloseTo(2.5, 6);
    const ev = await new YahooAdapter().getEvents('AAPL', { start: '2020-01-01', end: '2025-12-31' });
    expect(ev.find((e) => e.type === 'dividend')?.date).toBe('2025-11-04');
    expect(ev.find((e) => e.type === 'split')?.title).toContain('4:1');
  });

  it('盤中：保留 epoch 時間並標示延遲', async () => {
    const intraday = structuredClone(fx.yahooChart);
    intraday.chart.result[0].timestamp = [1762439400, 1762439700, 1762440000, 1762440300];
    fetchMock.mockImplementation(async () => fx.jsonResponse(intraday));
    const s = await new YahooAdapter().getHistory('AAPL', { interval: '5m', start: '2025-11-06', end: '2025-11-06' });
    expect(s.bars[0].t).toBe(1762439400 * 1000);
    expect(s.delayMinutes).toBe(15);
    expect(s.adjusted).toBe(false);
  });
});

describe('TPEx / TWSE', () => {
  it('TPEx 逐月歷史：民國日期、千分位、張 → 股', () => {
    const raw = parseTpexHistory(fx.tpexHistory);
    expect(raw).toHaveLength(3);
    expect(raw[0]).toMatchObject({ date: '2026-10-01', open: 1055, high: 1135, low: 1045, close: 1085, volume: 24_330_000 });
  });

  it('TPEx getHistory / getQuote / institutional', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('tradingStock')) return fx.jsonResponse(url.includes('2026%2F10') ? fx.tpexHistory : { ...fx.tpexHistory, tables: [{ ...fx.tpexHistory.tables[0], data: [] }] });
      if (url.includes('tpex_mainboard_daily_close_quotes')) return fx.jsonResponse(fx.tpexDailyQuotes);
      if (url.includes('tpex_3insti_daily_trading')) return fx.jsonResponse(fx.tpexInstitutional);
      return fx.jsonResponse([], 404);
    });
    const a = new TpexAdapter();
    const s = await a.getHistory('6488', { interval: '1d', start: '2026-10-01', end: '2026-11-06' });
    expect(s.source).toBe('櫃買中心 TPEx');
    expect(s.symbol).toBe('6488.TWO');
    expect(s.bars.map((b) => b.close)).toEqual([1085, 1190, 1180]);
    const q = await a.getQuote('6488.TWO');
    expect(q.price).toBe(512);
    expect(q.at).toBe('2026-11-06T05:30:00.000Z');
    const t = await a.getDataset('6488', 'institutional');
    expect(t.rows[0]).toMatchObject({ date: '2026-11-06', foreign: -499, trust: 20, dealer: -3, total: -482 });
    await expect(a.getHistory('2330', { interval: '1d' })).rejects.toThrow(/上櫃/);
  });

  it('TWSE STOCK_DAY / T86 解析', () => {
    const raw = parseTwseHistory({
      stat: 'OK',
      fields: ['日期', '成交股數', '成交金額', '開盤價', '最高價', '最低價', '收盤價', '漲跌價差', '成交筆數'],
      data: [['115/11/02', '41,165,068', '95,950,896,264', '2,310.00', '2,345.00', '2,310.00', '2,330.00', '-40.00', '298,087']],
    });
    expect(raw[0]).toMatchObject({ date: '2026-11-02', close: 2330, volume: 41165068 });
    expect(parseTwseHistory({ stat: '很抱歉，沒有符合條件的資料!' })).toEqual([]);
    const t86 = parseT86(
      {
        stat: 'OK',
        fields: ['證券代號', '證券名稱', '外陸資買賣超股數(不含外資自營商)', '外資自營商買賣超股數', '投信買賣超股數', '自營商買賣超股數', '三大法人買賣超股數'],
        data: [['2330  ', '台積電', '-3,311,663', '0', '458,215', '922,000', '-1,931,448']],
      },
      '2330',
    );
    expect(t86).toEqual({ foreign: -3312, trust: 458, dealer: 922, total: -1931 });
  });

  it('民國日期轉換', () => {
    expect(rocToIso('1151106')).toBe('2026-11-06');
    expect(rocToIso('115/1/6')).toBe('2026-01-06');
    expect(rocToIso('20261106')).toBe('2026-11-06');
    expect(rocToIso('abc')).toBeNull();
  });
});

describe('付費金鑰 Adapter', () => {
  it('未設定金鑰時 isConfigured() = false', () => {
    expect(new AlphaVantageAdapter().isConfigured()).toBe(false);
    expect(new PolygonAdapter().isConfigured()).toBe(false);
    expect(new FinnhubAdapter().isConfigured()).toBe(false);
  });

  it('Alpha Vantage 解析與配額訊息', async () => {
    const raw = parseAlphaDaily({
      'Time Series (Daily)': {
        '2025-11-06': { '1. open': '227.5', '2. high': '229.1', '3. low': '226.8', '4. close': '228.5', '5. adjusted close': '228.5', '6. volume': '39500000', '7. dividend amount': '0', '8. split coefficient': '1.0' },
      },
    });
    expect(raw[0]).toMatchObject({ date: '2025-11-06', close: 228.5, adjClose: 228.5, volume: 39500000 });
    process.env.ALPHAVANTAGE_API_KEY = 'secretkey';
    fetchMock.mockImplementation(async () => fx.jsonResponse({ Information: 'API rate limit reached' }));
    const err = await new AlphaVantageAdapter().getHistory('AAPL', { interval: '1d' }).catch((e) => e);
    expect(err.status).toBe(429);
    expect(String(err.message)).not.toContain('secretkey');
  });

  it('Polygon 解析（adjusted）', async () => {
    const raw = parsePolygonAggs({ status: 'OK', resultsCount: 1, results: [{ t: 1762405200000, o: 227.5, h: 229.1, l: 226.8, c: 228.5, v: 39500000 }] }, '1d');
    expect(raw[0]).toMatchObject({ date: '2025-11-06', close: 228.5, adjClose: 228.5 });
    process.env.POLYGON_API_KEY = 'pk';
    fetchMock.mockImplementation(async () => fx.jsonResponse({ status: 'OK', resultsCount: 1, results: [{ t: 1762405200000, o: 227.5, h: 229.1, l: 226.8, c: 228.5, v: 39500000 }] }));
    const s = await new PolygonAdapter().getHistory('AAPL', { interval: '1d', start: '2025-11-01', end: '2025-11-07' });
    expect(s).toMatchObject({ source: 'Polygon.io', adjusted: true });
    expect(urlOf(fetchMock.mock.calls[0])).toContain('adjusted=true');
  });

  it('Finnhub quote / earnings / insider', async () => {
    expect(parseFinnhubQuote({ c: 228.5, d: 2.5, dp: 1.1, h: 229, l: 226, o: 227, pc: 226, t: 1762549200 }, 'AAPL').price).toBe(228.5);
    process.env.FINNHUB_API_KEY = 'fk';
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/calendar/earnings')) return fx.jsonResponse({ earningsCalendar: [{ date: '2026-01-29', hour: 'amc', quarter: 1, year: 2026, symbol: 'AAPL' }] });
      if (url.includes('/stock/insider-transactions'))
        return fx.jsonResponse({ data: [{ name: 'COOK TIMOTHY D', share: 3000000, change: -50000, filingDate: '2025-10-03', transactionDate: '2025-10-01', transactionCode: 'S', transactionPrice: 255.1 }] });
      return fx.jsonResponse({}, 404);
    });
    const a = new FinnhubAdapter();
    const ev = await a.getEvents('AAPL', { start: '2025-01-01', end: '2026-03-01' });
    expect(ev[0]).toMatchObject({ date: '2026-01-29', type: 'earnings', source: 'Finnhub' });
    expect(ev[0].title).toContain('盤後');
    const t = await a.getDataset('AAPL', 'insider');
    expect(t.rows[0]).toMatchObject({ name: 'COOK TIMOTHY D', change: -50000 });
  });
});

describe('util', () => {
  it('週線重採樣', () => {
    const { bars } = cleanBars(
      [
        { date: '2026-11-02', open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
        { date: '2026-11-03', open: 10.5, high: 12, low: 10, close: 11, volume: 200 },
        { date: '2026-11-09', open: 11, high: 11.5, low: 10.8, close: 11.2, volume: 50 },
      ],
      'US',
      '1wk',
    );
    const w = resample(bars, '1wk');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ open: 10, high: 12, low: 9, close: 11, volume: 300, date: '2026-11-03' });
  });
});
