import type { Bar, PriceSeries } from '@/lib/types';

/** 由收盤價序列建立日線（日期為連續平日） */
export function barsFrom(closes: number[], start = '2020-01-01', opts: { volume?: number[]; adj?: number[] } = {}): Bar[] {
  const out: Bar[] = [];
  const d = new Date(start + 'T00:00:00Z');
  for (let i = 0; i < closes.length; i++) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    const date = d.toISOString().slice(0, 10);
    const c = closes[i];
    out.push({ t: d.getTime(), date, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: opts.volume?.[i] ?? 1000, adjClose: opts.adj?.[i] ?? c });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** 指定日期的日線 */
export function barsAt(rows: [string, number][]): Bar[] {
  return rows.map(([date, c]) => ({ t: Date.parse(date), date, open: c, high: c, low: c, close: c, volume: 1000, adjClose: c }));
}

export function seriesOf(symbol: string, bars: Bar[], source = 'TestSource'): PriceSeries {
  return { symbol, market: symbol.endsWith('.TW') ? 'TW' : 'US', currency: 'USD', interval: '1d', source, fetchedAt: new Date().toISOString(), asOf: bars[bars.length - 1]?.date ?? '', delayMinutes: 0, adjusted: true, bars };
}

/** 確定性亂數（LCG） */
export function rng(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function gaussian(r: () => number): number {
  const u = Math.max(1e-12, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
