import { describe, it, expect } from 'vitest';
import { getExternalLinks, fillTemplate } from '@/lib/integrations/links';
import { toTradingViewSymbol, fromTradingViewSymbol, tradingViewWidgetConfig } from '@/lib/integrations/tradingview';
import { parseWatchlist, detectFormat, parseCsv, toWatchlistItems } from '@/lib/integrations/watchlist-import';
import { parseDeepLink, buildDeepLink, parseModelToken } from '@/lib/integrations/deeplink';

describe('外部連結', () => {
  it('台股五個預設連結', () => {
    const links = getExternalLinks('2330');
    expect(links.map((l) => l.label)).toEqual(['Yahoo 奇摩股市', 'Goodinfo 台灣股市資訊網', '鉅亨網', '公開資訊觀測站', 'TradingView']);
    expect(links[0].url).toBe('https://tw.stock.yahoo.com/quote/2330.TW');
    expect(links[1].url).toBe('https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID=2330');
    expect(links[4].url).toBe('https://www.tradingview.com/symbols/TWSE-2330/');
  });

  it('上櫃使用 TPEX', () => {
    const tv = getExternalLinks('6488.TWO').find((l) => l.label === 'TradingView')!;
    expect(tv.url).toBe('https://www.tradingview.com/symbols/TPEX-6488/');
    expect(getExternalLinks('6488.TWO')[0].url).toContain('6488.TWO');
  });

  it('美股四個預設連結，BRK.B 在 Yahoo 用 BRK-B', () => {
    const links = getExternalLinks('brk.b');
    expect(links.map((l) => l.label)).toEqual(['Yahoo Finance', 'TradingView', 'Finviz', 'SEC EDGAR']);
    expect(links[0].url).toBe('https://finance.yahoo.com/quote/BRK-B');
    expect(links[1].url).toBe('https://www.tradingview.com/symbols/NYSE-BRK.B/');
    expect(getExternalLinks('AAPL')[1].url).toBe('https://www.tradingview.com/symbols/NASDAQ-AAPL/');
  });

  it('使用者自訂模板（依市場篩選、拒絕非 http 協定）', () => {
    const links = getExternalLinks('2330', [
      { label: '我的筆記', url: 'https://notes.example/{code}?s={symbol}&ex={exchange}', market: 'TW' },
      { label: '美股專用', url: 'https://us.example/{code}', market: 'US' },
      { label: '惡意', url: 'javascript:alert({code})' },
    ]);
    const custom = links.filter((l) => l.custom);
    expect(custom).toHaveLength(1);
    expect(custom[0].url).toBe('https://notes.example/2330?s=2330.TW&ex=TWSE');
  });

  it('未知交易所的美股與指數', () => {
    const tv = getExternalLinks('ZZZZ').find((l) => l.label === 'TradingView')!;
    expect(tv.url).toBe('https://www.tradingview.com/chart/?symbol=ZZZZ');
    const idx = getExternalLinks('^VIX');
    expect(idx[0].url).toBe('https://finance.yahoo.com/quote/%5EVIX');
    expect(idx[1].url).toContain('TVC%3AVIX');
    expect(getExternalLinks('???')).toEqual([]);
  });

  it('fillTemplate 保留未知佔位符', () => {
    expect(fillTemplate('https://x/{code}/{unknown}', { code: 'A B' })).toBe('https://x/A%20B/{unknown}');
  });
});

describe('TradingView 代號', () => {
  it.each([
    ['2330.TW', 'TWSE:2330'],
    ['6488.TWO', 'TPEX:6488'],
    ['AAPL', 'NASDAQ:AAPL'],
    ['BRK.B', 'NYSE:BRK.B'],
    ['SPY', 'AMEX:SPY'],
    ['^GSPC', 'SP:SPX'],
    ['^TWII', 'TWSE:TAIEX'],
    ['TWD=X', 'FX_IDC:USDTWD'],
    ['PANW', 'NASDAQ:PANW'],
    ['ZZZZ', 'ZZZZ'],
  ])('%s → %s', (a, b) => {
    expect(toTradingViewSymbol(a)).toBe(b);
  });
  it('反向與 widget 設定', () => {
    expect(fromTradingViewSymbol('TPEX:6488')).toBe('6488.TWO');
    expect(fromTradingViewSymbol('NASDAQ:AAPL')).toBe('AAPL');
    const cfg = tradingViewWidgetConfig('2330', { theme: 'dark' })!;
    expect(cfg).toMatchObject({ symbol: 'TWSE:2330', theme: 'dark', timezone: 'Asia/Taipei', locale: 'zh_TW' });
  });
});

describe('自選股匯入', () => {
  const yahooCsv = [
    'Symbol,Current Price,Date,Time,Change,Open,High,Low,Volume,Trade Date,Purchase Price,Quantity,Commission,High Limit,Low Limit,Comment',
    'AAPL,228.5,2025/11/06,16:00 EST,2.5,227.5,229.1,226.8,39500000,,,,,,,',
    '2330.TW,2135,2026/11/06,13:30 CST,-195,2020,2195,2020,110714587,20261001,1000,1000,,,,"long term, core"',
    '6488.TWO,512,2026/11/06,13:30 CST,-38,508,529,508,14376531,,,,,,,',
    'AAPL,228.5,2025/11/06,16:00 EST,2.5,227.5,229.1,226.8,39500000,20240101,150,10,,,,second lot',
    'BRK-B,480,2025/11/06,16:00 EST,1,479,481,478,3000000,,,,,,,',
    '$$CASH,1,,,,,,,,,,,,,,',
    '^GSPC,6700,,,,,,,,,,,,,,',
  ].join('\r\n');

  it('Yahoo CSV：辨識格式、去重、分台美、回報無法辨識', () => {
    expect(detectFormat(yahooCsv)).toBe('yahoo_csv');
    const r = parseWatchlist(yahooCsv);
    expect(r.format).toBe('yahoo_csv');
    expect(r.items.map((x) => x.symbol)).toEqual(['AAPL', '2330.TW', '6488.TWO', 'BRK.B', '^GSPC']);
    expect(r.tw.map((x) => x.symbol)).toEqual(['2330.TW', '6488.TWO']);
    expect(r.us.map((x) => x.symbol)).toEqual(['AAPL', 'BRK.B', '^GSPC']);
    expect(r.duplicates).toBe(1);
    expect(r.unrecognized).toEqual(['$$CASH']);
    const items = toWatchlistItems(r, 'u1', new Date('2026-11-08T00:00:00Z'));
    expect(items[0]).toMatchObject({ userId: 'u1', symbol: 'AAPL', market: 'US', source: 'yahoo_csv' });
  });

  it('TradingView 匯出：分組標題、逗號與換行混用', () => {
    const tv = '###台股,TWSE:2330,TPEX:6488,TWSE:0050\n###美股,NASDAQ:AAPL,NYSE:BRK.B,AMEX:SPY,TVC:VIX,FOO:???,NASDAQ:AAPL';
    expect(detectFormat(tv)).toBe('tradingview');
    const r = parseWatchlist(tv);
    expect(r.sections).toEqual(['台股', '美股']);
    expect(r.tw.map((x) => x.symbol)).toEqual(['2330.TW', '6488.TWO', '0050.TW']);
    expect(r.us.map((x) => x.symbol)).toEqual(['AAPL', 'BRK.B', 'SPY', '^VIX']);
    expect(r.tw[0].section).toBe('台股');
    expect(r.unrecognized).toEqual(['FOO:???']);
    expect(r.duplicates).toBe(1);
    expect(toWatchlistItems(r, 'u')[0].source).toBe('tradingview_csv');
  });

  it('純清單（中文名稱、空白分隔）', () => {
    const r = parseWatchlist('台積電 鴻海\naapl, 0056');
    expect(r.format).toBe('plain');
    expect(r.items.map((x) => x.symbol)).toEqual(['2330.TW', '2317.TW', 'AAPL', '0056.TW']);
  });

  it('CSV 解析：引號、跳脫雙引號、BOM', () => {
    expect(parseCsv('﻿a,"b,c","d""e"\n1,2,3')).toEqual([
      ['a', 'b,c', 'd"e'],
      ['1', '2', '3'],
    ]);
  });
});

describe('深連結', () => {
  it('解析 /stock/2330.TW?models=poly3,kalman&h=20', () => {
    const { state, warnings } = parseDeepLink('/stock/2330.TW?models=poly3,kalman&h=20');
    expect(warnings).toEqual([]);
    expect(state).toEqual({ symbol: '2330.TW', models: [{ id: 'poly', param: 3, paramKey: 'degree' }, { id: 'kalman' }], h: 20 });
  });

  it('完整參數 round-trip', () => {
    const url = '/stock/6488.TWO?models=poly4,fourier3,egarch,holtwinters&h=60&window=250&lambda=0.97&range=2025-01-01~2026-06-30&priceMode=log';
    const { state } = parseDeepLink(url);
    expect(state!.models.map((m) => m.id)).toEqual(['poly', 'fourier', 'egarch', 'holtwinters']);
    expect(buildDeepLink(state!)).toBe(url);
    expect(parseDeepLink(buildDeepLink(state!)).state).toEqual(state);
  });

  it('symbol + searchParams 物件形式（Next.js）與代號正規化', () => {
    const { state } = parseDeepLink('2330', { models: 'arima', h: '5', range: '1Y' });
    expect(state).toEqual({ symbol: '2330.TW', models: [{ id: 'arima' }], h: 5, range: '1y' });
    expect(buildDeepLink(state!, { base: 'https://lab.example/' })).toBe('https://lab.example/stock/2330.TW?models=arima&h=5&range=1y');
  });

  it('不合法值被忽略或夾限並產生警告', () => {
    const { state, warnings } = parseDeepLink('https://x.example/stock/AAPL?models=poly3,unknown9,kalman,kalman&h=999&window=3&lambda=1.5&range=bad&priceMode=sqrt');
    expect(state!.models.map((m) => m.id)).toEqual(['poly', 'kalman']);
    expect(state!.h).toBe(60);
    expect(state!.window).toBeUndefined();
    expect(state!.lambda).toBeUndefined();
    expect(state!.range).toBeUndefined();
    expect(state!.priceMode).toBeUndefined();
    expect(warnings.length).toBe(6);
    expect(parseDeepLink('/stock/???').state).toBeNull();
  });

  it('指數代號編碼', () => {
    const link = buildDeepLink({ symbol: '^TWII', models: [{ id: 'gbm' }] });
    expect(link).toBe('/stock/%5ETWII?models=gbm');
    expect(parseDeepLink(link).state!.symbol).toBe('^TWII');
  });

  it('parseModelToken', () => {
    expect(parseModelToken('POLY3')).toEqual({ id: 'poly', param: 3, paramKey: 'degree' });
    expect(parseModelToken('garch')).toEqual({ id: 'garch' });
    expect(parseModelToken('gp2')).toEqual({ id: 'gp', param: 2, paramKey: 'main' });
    expect(parseModelToken('nope')).toBeNull();
  });
});
