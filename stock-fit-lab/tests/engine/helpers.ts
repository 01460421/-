import type { Bar, PriceSeries } from '@/lib/types';
import { nextTradingDays } from '@/lib/calendar';

/** 由價格陣列建立美股交易日 K 棒（日期為真實 NYSE 交易日，快照目標日可對上） */
export function makeBars(prices: number[], start = '2024-12-31', market: 'US' | 'TW' = 'US'): Bar[] {
  const dates = nextTradingDays(market, start, prices.length);
  return prices.map((c, i) => ({ t: Date.parse(dates[i] + 'T21:00:00Z'), date: dates[i], open: c, high: c * 1.005, low: c * 0.995, close: c, volume: 1000 + i }));
}

export function makeSeries(bars: Bar[], symbol = 'AAPL'): PriceSeries {
  return {
    symbol,
    market: symbol.endsWith('.TW') ? 'TW' : 'US',
    currency: 'USD',
    interval: '1d',
    source: 'synthetic',
    fetchedAt: new Date().toISOString(),
    asOf: new Date(bars[bars.length - 1].t).toISOString(),
    delayMinutes: 0,
    adjusted: false,
    bars,
  };
}

/** 依 K 棒日期推進的假時鐘（快照 createdAt = 該 K 棒收盤後） */
export function barClock() {
  let current = new Date('2025-01-01T21:30:00Z');
  return {
    now: () => current,
    set: (date: string) => {
      current = new Date(date + 'T21:30:00Z');
    },
  };
}
