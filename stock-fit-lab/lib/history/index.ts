/**
 * 上市以來完整日線（point-in-time）與 AI 用精簡摘要。
 *
 * 資料來源：getMarketData().getHistory(symbol, { interval: '1d', start: '1990-01-01' })
 *  - 台股：FinMind TaiwanStockPrice（約 1994 起；免費方案一次請求即可回傳整段區間，但會受每小時配額限制）
 *          → TWSE / TPEx → Yahoo（台股約 2000 起）
 *  - 美股：Yahoo chart（period1/period2 一次回傳整段日線，1990 起；更早的資料不在本系統範圍）
 * 一次請求失敗時（逾時 / 配額 / 回應過大），改以 8 年為一段分段抓取並把各段的還原因子接合，
 * 讓 adjClose 在段與段之間連續（各段的向後還原以該段最後一日為基準，必須重新縮放）。
 * 此包裝只呼叫 data-adapters 的公開 API，不修改其程式碼。
 */
import type { Bar, PriceSeries } from '../types';
import { getMarketData, normalizeSymbol } from '../data-adapters';
import { addDays } from '../calendar';
import { cached, cachedWithMeta } from './cache';
import { clipBars, downsample, summarizeHistory, round, px, type HistorySummary, type OhlcBar } from './summary';

export * from './summary';

export const LONG_HISTORY_START = '1990-01-01';
const CHUNK_YEARS = 8;

export interface LongHistory {
  symbol: string;
  source: string;
  adjusted: boolean;
  fetchedAt: string;
  asOf: string;
  stale: boolean;
  chunked: boolean;
  bars: Bar[];
}

type HistoryFetcher = (symbol: string, req: { interval: '1d'; start?: string; end?: string }) => Promise<PriceSeries>;

let fetcher: HistoryFetcher = (symbol, req) => getMarketData().getHistory(symbol, req);

/** 測試用：替換底層 getHistory */
export function setHistoryFetcher(f: HistoryFetcher | null): void {
  fetcher = f ?? ((symbol, req) => getMarketData().getHistory(symbol, req));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 把分段抓回的序列接合：以重疊日的 adjClose/close 比例重新縮放較舊段的還原價 */
export function stitchChunks(chunks: Bar[][]): Bar[] {
  const sorted = chunks.filter((c) => c.length).sort((a, b) => a[0].date.localeCompare(b[0].date));
  if (!sorted.length) return [];
  let merged: Bar[] = sorted[sorted.length - 1].map((b) => ({ ...b }));
  for (let k = sorted.length - 2; k >= 0; k--) {
    const older = sorted[k].map((b) => ({ ...b }));
    const newerFirst = merged[0].date;
    const byDate = new Map(merged.map((b) => [b.date, b]));
    // 找最晚的重疊日
    let factor = 1;
    for (let i = older.length - 1; i >= 0; i--) {
      const n = byDate.get(older[i].date);
      if (n && older[i].adjClose && n.adjClose && older[i].close > 0 && n.close > 0) {
        factor = n.adjClose / n.close / (older[i].adjClose! / older[i].close);
        break;
      }
    }
    const keep = older.filter((b) => b.date < newerFirst).map((b) => (b.adjClose != null ? { ...b, adjClose: b.adjClose * factor } : b));
    merged = [...keep, ...merged];
  }
  return merged;
}

async function fetchChunked(symbol: string, start: string, end: string): Promise<PriceSeries | null> {
  const chunks: Bar[][] = [];
  let meta: PriceSeries | null = null;
  let s = start;
  while (s <= end) {
    const e0 = `${Number(s.slice(0, 4)) + CHUNK_YEARS - 1}-12-31`;
    const e = e0 > end ? end : e0;
    try {
      // 每段往後多抓 10 天作為接合的重疊區
      const ser = await fetcher(symbol, { interval: '1d', start: s, end: addDays(e, 10) > end ? end : addDays(e, 10) });
      if (ser.bars.length) {
        chunks.push(ser.bars);
        meta = ser;
      }
    } catch {
      /* 上市前或該段暫時失敗：略過 */
    }
    s = addDays(e, 1);
  }
  if (!meta || !chunks.length) return null;
  return { ...meta, bars: stitchChunks(chunks) };
}

/** 取得上市以來（1990 起）完整日線；快取 6 小時。to 之後的資料一律不回傳（point-in-time）。 */
export async function getLongHistory(symbol: string, opts: { to?: string } = {}): Promise<LongHistory> {
  const info = normalizeSymbol(symbol);
  if (!info) throw new Error(`無法辨識代號：${symbol}`);
  const sym = info.symbol;
  const { value, stale } = await cachedWithMeta<LongHistory>(`ctx:hist:v1:${sym}`, 6 * 3600, async () => {
    const end = todayIso();
    let series: PriceSeries | null = null;
    let chunked = false;
    try {
      series = await fetcher(sym, { interval: '1d', start: LONG_HISTORY_START });
      if (!series.bars.length) series = null;
    } catch {
      series = null;
    }
    if (!series) {
      series = await fetchChunked(sym, LONG_HISTORY_START, end);
      chunked = true;
    }
    if (!series) throw new Error(`無法取得 ${sym} 的長期日線`);
    return {
      symbol: sym,
      source: series.source + (series.stale ? '（快取）' : ''),
      adjusted: series.adjusted,
      fetchedAt: series.fetchedAt,
      asOf: series.asOf,
      stale: !!series.stale,
      chunked,
      bars: series.bars,
    };
  });
  const bars = opts.to ? value.bars.filter((b) => b.date <= opts.to!) : value.bars;
  return { ...value, stale: value.stale || stale, bars, asOf: opts.to && bars.length ? bars[bars.length - 1].date : value.asOf };
}

/** 長期摘要（快取 6 小時；以 to 為 point-in-time 截止日） */
export async function getHistorySummary(symbol: string, opts: { from?: string; to?: string; topN?: number } = {}): Promise<HistorySummary & { stale: boolean; chunked: boolean }> {
  const info = normalizeSymbol(symbol);
  if (!info) throw new Error(`無法辨識代號：${symbol}`);
  return cached(`ctx:histsum:v1:${info.symbol}:${opts.from ?? '-'}:${opts.to ?? '-'}:${opts.topN ?? 10}`, 6 * 3600, async () => {
    const h = await getLongHistory(info.symbol, { to: opts.to });
    const s = summarizeHistory(h.bars, { symbol: h.symbol, source: h.source, adjusted: h.adjusted, asOf: h.asOf }, { from: opts.from, to: opts.to, topN: opts.topN });
    return { ...s, stale: h.stale, chunked: h.chunked };
  });
}

export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** 依區間長度自動選擇顆粒度，讓輸出不超過 maxPoints 筆 */
export function autoGranularity(from: string, to: string, maxPoints = 120): Granularity {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  const tradingDays = days * (252 / 365);
  if (tradingDays <= maxPoints) return 'day';
  if (tradingDays / 5 <= maxPoints) return 'week';
  if (tradingDays / 21 <= maxPoints) return 'month';
  if (tradingDays / 63 <= maxPoints) return 'quarter';
  return 'year';
}

export interface RangeSeries {
  symbol: string;
  from: string;
  to: string;
  granularity: Granularity;
  points: OhlcBar[];
  truncated: boolean;
  source: string;
  asOf: string;
  stats: { returnPct: number | null; high: number | null; low: number | null; bars: number };
}

/** 指定區間的降採樣 OHLC（AI 工具與 API 使用；最多 maxPoints 筆，超過時保留最新的） */
export async function getRangeSeries(symbol: string, opts: { from?: string; to?: string; granularity?: Granularity; maxPoints?: number } = {}): Promise<RangeSeries> {
  const h = await getLongHistory(symbol, { to: opts.to });
  const maxPoints = Math.min(400, Math.max(10, opts.maxPoints ?? 120));
  const from = opts.from ?? h.bars[0]?.date ?? LONG_HISTORY_START;
  const to = opts.to ?? h.bars[h.bars.length - 1]?.date ?? todayIso();
  const bars = clipBars(h.bars, from, to);
  const g = opts.granularity ?? autoGranularity(from, to, maxPoints);
  const pts: OhlcBar[] =
    g === 'day'
      ? bars.map((b, i) => ({
          date: b.date,
          periodStart: b.date,
          open: round(b.open)!,
          high: round(b.high)!,
          low: round(b.low)!,
          close: round(b.close)!,
          adjClose: round(px(b))!,
          volume: b.volume,
          changePct: i > 0 ? round((px(b) / px(bars[i - 1]) - 1) * 100, 2) : null,
        }))
      : downsample(bars, g);
  const truncated = pts.length > maxPoints;
  const first = bars[0];
  const last = bars[bars.length - 1];
  return {
    symbol: h.symbol,
    from: first?.date ?? from,
    to: last?.date ?? to,
    granularity: g,
    points: truncated ? pts.slice(-maxPoints) : pts,
    truncated,
    source: h.source,
    asOf: h.asOf,
    stats: {
      returnPct: first && last ? round((px(last) / px(first) - 1) * 100, 2) : null,
      high: bars.length ? round(Math.max(...bars.map((b) => b.high || b.close))) : null,
      low: bars.length ? round(Math.min(...bars.map((b) => b.low || b.close))) : null,
      bars: bars.length,
    },
  };
}
