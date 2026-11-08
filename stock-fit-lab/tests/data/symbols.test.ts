import { describe, it, expect } from 'vitest';
import { normalizeSymbol, searchSymbols, toYahooSymbol, registerTwSymbols } from '@/lib/data-adapters/symbols';

describe('normalizeSymbol', () => {
  const cases: [string, string | null, string?][] = [
    ['2330', '2330.TW', 'TW'],
    ['2330.tw', '2330.TW', 'TW'],
    [' 2330.TW ', '2330.TW', 'TW'],
    ['２３３０', '2330.TW', 'TW'], // 全形
    ['台積電', '2330.TW', 'TW'],
    ['鴻海', '2317.TW', 'TW'],
    ['6488', '6488.TWO', 'TWO'], // 名稱表知道是上櫃
    ['6488.TWO', '6488.TWO', 'TWO'],
    ['6488.two', '6488.TWO', 'TWO'],
    ['環球晶', '6488.TWO', 'TWO'],
    ['TWSE:2330', '2330.TW', 'TW'],
    ['TPEX:6488', '6488.TWO', 'TWO'],
    ['0050', '0050.TW', 'TW'],
    ['0056', '0056.TW', 'TW'],
    ['00878', '00878.TW', 'TW'],
    ['00631L', '00631L.TW', 'TW'],
    ['00679B', '00679B.TWO', 'TWO'],
    ['元大台灣50', '0050.TW', 'TW'],
    ['aapl', 'AAPL', 'US'],
    ['AAPL', 'AAPL', 'US'],
    ['NASDAQ:AAPL', 'AAPL', 'US'],
    ['NYSE:BRK.B', 'BRK.B', 'US'],
    ['BRK.B', 'BRK.B', 'US'],
    ['brk-b', 'BRK.B', 'US'],
    ['蘋果', 'AAPL', 'US'],
    ['輝達', 'NVDA', 'US'],
    ['Apple', 'AAPL', 'US'],
    ['^VIX', '^VIX', 'US'],
    ['^vix', '^VIX', 'US'],
    ['^TWII', '^TWII', 'TW'],
    ['^GSPC', '^GSPC', 'US'],
    ['TWD=X', 'TWD=X', 'US'],
    ['TVC:VIX', '^VIX', 'US'],
    ['SP:SPX', '^GSPC', 'US'],
    ['TWSE:TAIEX', '^TWII', 'TW'],
    ['9999', '9999.TW', 'TW'], // 未知代號預設上市
    ['', null],
    ['不存在的公司名稱', null],
    ['12', null],
    ['TOOLONGTICKER', null],
    ['javascript:alert(1)', null],
  ];
  for (const [input, symbol, market] of cases) {
    it(`${JSON.stringify(input)} → ${symbol}`, () => {
      const r = normalizeSymbol(input);
      if (symbol === null) expect(r).toBeNull();
      else {
        expect(r?.symbol).toBe(symbol);
        expect(r?.market).toBe(market);
      }
    });
  }

  it('code 不含後綴、名稱可查', () => {
    expect(normalizeSymbol('2330')).toMatchObject({ code: '2330', name: '台積電' });
    expect(normalizeSymbol('AAPL')?.code).toBe('AAPL');
  });

  it('執行期註冊的台股清單決定上市 / 上櫃', () => {
    expect(normalizeSymbol('8358')?.symbol).toBe('8358.TW');
    registerTwSymbols([{ code: '8358', market: 'TWO', name: '金居' }]);
    expect(normalizeSymbol('8358')?.symbol).toBe('8358.TWO');
    expect(normalizeSymbol('金居')?.symbol).toBe('8358.TWO');
  });

  it('Yahoo 代號轉換', () => {
    expect(toYahooSymbol('BRK.B')).toBe('BRK-B');
    expect(toYahooSymbol('2330.TW')).toBe('2330.TW');
    expect(toYahooSymbol('^GSPC')).toBe('^GSPC');
  });
});

describe('searchSymbols', () => {
  it('中文部分名稱', async () => {
    const r = await searchSymbols('台積');
    expect(r[0].symbol).toBe('2330.TW');
  });
  it('代號前綴與英文名', async () => {
    expect((await searchSymbols('233')).map((x) => x.symbol)).toContain('2330.TW');
    expect((await searchSymbols('nvidia'))[0].symbol).toBe('NVDA');
  });
  it('limit 與空字串', async () => {
    expect(await searchSymbols('')).toEqual([]);
    expect((await searchSymbols('金', 3)).length).toBeLessThanOrEqual(3);
  });
});
