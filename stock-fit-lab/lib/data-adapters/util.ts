/**
 * Adapter 共用工具：日期轉換、OHLCV 驗證、缺值前值填補、重採樣、收盤時間。
 */
import type { Bar, Interval, Market, PriceSeries } from '../types';
import { addDays, describeCalendarCoverage, isTradingDay, localParts } from '../calendar';
import { ValidationError } from './http';

export const MARKET_TZ: Record<Market, string> = { TW: 'Asia/Taipei', TWO: 'Asia/Taipei', US: 'America/New_York' };
export const MARKET_CURRENCY: Record<Market, string> = { TW: 'TWD', TWO: 'TWD', US: 'USD' };

export function isIntraday(i: Interval): boolean {
  return i === '1m' || i === '5m' || i === '15m' || i === '60m';
}

export function todayIn(market: Market, now = new Date()): string {
  return localParts(now, MARKET_TZ[market]).date;
}

/** 日線 K 棒的 t：當地日期 00:00 UTC（與 date 一一對應，跨時區穩定） */
export function dateToT(date: string): number {
  return Date.parse(date + 'T00:00:00Z');
}

/** 某時區某當地時刻對應的 UTC epoch ms（以 Intl 求偏移，自動處理夏令時間） */
export function zonedTimeToUtc(date: string, hhmm: string, tz: string): number {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const p = localParts(new Date(guess), tz);
  const localAsUtc = Date.parse(`${p.date}T${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}:00Z`);
  const offset = localAsUtc - guess;
  return guess - offset;
}

const CLOSE_HHMM: Record<Market, string> = { TW: '13:30', TWO: '13:30', US: '16:00' };

/** 某交易日收盤時刻（ISO） */
export function closeTimeIso(market: Market, date: string): string {
  return new Date(zonedTimeToUtc(date, CLOSE_HHMM[market], MARKET_TZ[market])).toISOString();
}

/** 民國日期 1151106 / 115/11/06 → 2026-11-06 */
export function rocToIso(roc: string): string | null {
  const s = String(roc).trim();
  let m = s.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${Number(m[1]) + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{2,3})(\d{2})(\d{2})$/);
  if (m) return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** 字串數字（含千分位、空白、'--'）→ number | null */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, '').replace(/\s+/g, '').replace(/^\+/, '');
  if (!s || s === '--' || s === '---' || s === '-' || s === 'X' || s.toLowerCase() === 'nan') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function yearsAgo(date: string, years: number): string {
  return `${Number(date.slice(0, 4)) - years}${date.slice(4)}`;
}

/** 預設起始日：日線 2 年；60 分 2 個月；15/5 分 1 個月；1 分 5 天 */
export function defaultStart(interval: Interval, end: string): string {
  switch (interval) {
    case '1m':
      return addDays(end, -6);
    case '5m':
    case '15m':
      return addDays(end, -30);
    case '60m':
      return addDays(end, -60);
    case '1wk':
      return yearsAgo(end, 5);
    case '1mo':
      return yearsAgo(end, 10);
    default:
      return yearsAgo(end, 2);
  }
}

export interface RawBar {
  t?: number;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  adjClose?: number | null;
}

export interface CleanReport {
  filled: number;
  dropped: number;
  gapFilled: number;
}

/**
 * 驗證並清理 K 棒：
 *  - 依時間排序、去除重複日期（保留最後一筆）
 *  - close 缺值 / 非正值 → 以前一根收盤前值填補（filled: true，volume = 0）
 *  - OHLC 部分缺值以 close 補齊；high/low 修正包住 open/close
 *  - 日線：日曆已涵蓋的年份中，缺少的交易日（連續 ≤ maxGap 天）以前值補一根 filled K 棒
 */
export function cleanBars(raw: RawBar[], market: Market, interval: Interval, opts: { maxGap?: number } = {}): { bars: Bar[]; report: CleanReport } {
  const report: CleanReport = { filled: 0, dropped: 0, gapFilled: 0 };
  const sorted = [...raw].filter((b) => b && typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b.date));
  report.dropped += raw.length - sorted.length;
  sorted.sort((a, b) => (a.t ?? dateToT(a.date)) - (b.t ?? dateToT(b.date)));
  const dedup: RawBar[] = [];
  for (const b of sorted) {
    const key = isIntraday(interval) ? b.t : b.date;
    const prev = dedup[dedup.length - 1];
    if (prev && (isIntraday(interval) ? prev.t : prev.date) === key) dedup[dedup.length - 1] = b;
    else dedup.push(b);
  }
  const out: Bar[] = [];
  // 開頭的缺值無前值可填，直接捨棄
  let i = 0;
  while (i < dedup.length && !(isPos(dedup[i].close))) {
    i++;
    report.dropped++;
  }
  const coveredTw = new Set(describeCalendarCoverage().twYears);
  const maxGap = opts.maxGap ?? 3;
  for (; i < dedup.length; i++) {
    const r = dedup[i];
    const prev = out[out.length - 1];
    if (prev && !isIntraday(interval) && interval === '1d') {
      const gaps = missingTradingDays(market, prev.date, r.date, coveredTw);
      if (gaps.length > 0 && gaps.length <= maxGap) {
        for (const d of gaps) {
          out.push({ t: dateToT(d), date: d, open: prev.close, high: prev.close, low: prev.close, close: prev.close, volume: 0, adjClose: prev.adjClose, filled: true });
          report.gapFilled++;
        }
      }
    }
    const last = out[out.length - 1];
    const t = r.t ?? dateToT(r.date);
    if (!isPos(r.close)) {
      if (!last) continue;
      out.push({ t, date: r.date, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0, adjClose: last.adjClose, filled: true });
      report.filled++;
      continue;
    }
    const close = r.close as number;
    const open = isPos(r.open) ? (r.open as number) : close;
    let high = isPos(r.high) ? (r.high as number) : Math.max(open, close);
    let low = isPos(r.low) ? (r.low as number) : Math.min(open, close);
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    const bar: Bar = { t, date: r.date, open, high, low, close, volume: Math.max(0, r.volume ?? 0) };
    if (r.adjClose !== undefined) {
      if (isPos(r.adjClose)) bar.adjClose = r.adjClose as number;
      else if (last?.adjClose !== undefined && last.close > 0) bar.adjClose = (last.adjClose / last.close) * close;
    }
    out.push(bar);
  }
  return { bars: out, report };
}

function isPos(v: number | null | undefined): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** prev 與 next（皆不含）之間缺少的交易日；台股僅在日曆已維護的年份檢查，避免未維護年份誤補 */
function missingTradingDays(market: Market, prev: string, next: string, coveredTw: Set<number>): string[] {
  const out: string[] = [];
  let d = addDays(prev, 1);
  let guard = 0;
  while (d < next && guard++ < 40) {
    const y = Number(d.slice(0, 4));
    if (market !== 'US' && !coveredTw.has(y)) return [];
    if (isTradingDay(market, d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** 日線 → 週線 / 月線 */
export function resample(bars: Bar[], interval: '1wk' | '1mo'): Bar[] {
  const groups = new Map<string, Bar[]>();
  for (const b of bars) {
    let key: string;
    if (interval === '1mo') key = b.date.slice(0, 7);
    else {
      const d = new Date(b.date + 'T00:00:00Z');
      const wd = (d.getUTCDay() + 6) % 7; // 週一 = 0
      key = addDays(b.date, -wd);
    }
    const g = groups.get(key);
    if (g) g.push(b);
    else groups.set(key, [b]);
  }
  const out: Bar[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const last = g[g.length - 1];
    out.push({
      t: last.t,
      date: last.date,
      open: first.open,
      high: Math.max(...g.map((b) => b.high)),
      low: Math.min(...g.map((b) => b.low)),
      close: last.close,
      volume: g.reduce((s, b) => s + b.volume, 0),
      adjClose: last.adjClose,
      filled: g.every((b) => b.filled) || undefined,
    });
  }
  return out;
}

export function filterRange(bars: Bar[], start?: string, end?: string): Bar[] {
  return bars.filter((b) => (!start || b.date >= start) && (!end || b.date <= end));
}

export function buildSeries(p: Omit<PriceSeries, 'fetchedAt' | 'asOf'> & { asOf?: string }): PriceSeries {
  if (!p.bars.length) throw new ValidationError(`${p.source}: no bars for ${p.symbol}`);
  const last = p.bars[p.bars.length - 1];
  const asOf = p.asOf ?? (isIntraday(p.interval) ? new Date(last.t).toISOString() : closeTimeIso(p.market, last.date));
  return { ...p, fetchedAt: new Date().toISOString(), asOf };
}

/** 計算 filled K 棒數量（介面顯示「N 筆缺值已前值填補」用） */
export function countFilled(series: PriceSeries): number {
  return series.bars.reduce((s, b) => s + (b.filled ? 1 : 0), 0);
}

export function isoNow(): string {
  return new Date().toISOString();
}

/** epoch ms → 某時區的當地日期 */
export function localDateOf(tMs: number, tz: string): string {
  return localParts(new Date(tMs), tz).date;
}
