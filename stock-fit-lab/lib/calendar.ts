/**
 * 交易日曆與交易時段（台股、美股分開維護）。
 *
 * 台股：09:00–13:30（Asia/Taipei，無夏令時間）。
 * 美股：09:30–16:00（America/New_York）。台北時間夏令 21:30–04:00、冬令 22:30–05:00，
 *       以 Intl 時區轉換自動處理夏令時間，不寫死偏移。
 *
 * 休市日：
 *  - 美股依 NYSE 規則演算法計算（含 observed 規則），任何年份皆可。
 *  - 台股依證交所公告「手動維護」於 TW_HOLIDAYS；每年 12 月證交所公告隔年行事曆後需更新。
 *    未列入的年份只排除週末，並在 describeCalendarCoverage() 回報缺口。
 */
import type { Market } from './types';

// ───────── 台股休市日（證交所公告；含農曆春節前無交易日）─────────
const TW_HOLIDAYS: Record<number, string[]> = {
  2025: [
    '2025-01-01', '2025-01-23', '2025-01-24', '2025-01-27', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
    '2025-02-28', '2025-04-03', '2025-04-04', '2025-05-01', '2025-05-30', '2025-09-29', '2025-10-06', '2025-10-10',
    '2025-10-24', '2025-12-25',
  ],
  2026: [
    '2026-01-01', '2026-02-12', '2026-02-13', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
    '2026-02-27', '2026-04-03', '2026-04-06', '2026-05-01', '2026-06-19', '2026-09-25', '2026-09-28', '2026-10-09',
    '2026-10-26', '2026-12-25',
  ],
};

const twHolidaySet = new Set(Object.values(TW_HOLIDAYS).flat());

// ───────── 美股（NYSE）休市日演算法 ─────────
function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return ymd(y, m, day);
}

function lastWeekday(y: number, m: number, weekday: number): string {
  const last = new Date(Date.UTC(y, m, 0));
  const diff = (last.getUTCDay() - weekday + 7) % 7;
  return ymd(y, m, last.getUTCDate() - diff);
}

/** 復活節（Anonymous Gregorian algorithm） */
function easter(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

/** 固定日期遇週末的 observed 規則：週六 → 週五，週日 → 週一 */
function observed(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay();
  if (wd === 6) {
    // NYSE：元旦落在週六不補假（避免跨年度）
    if (m === 1 && d === 1) return null;
    dt.setUTCDate(d - 1);
  } else if (wd === 0) dt.setUTCDate(d + 1);
  return dt.toISOString().slice(0, 10);
}

const usCache = new Map<number, Set<string>>();
export function usHolidays(y: number): Set<string> {
  const hit = usCache.get(y);
  if (hit) return hit;
  const gf = easter(y);
  gf.setUTCDate(gf.getUTCDate() - 2);
  const list = [
    observed(y, 1, 1),
    nthWeekday(y, 1, 1, 3), // MLK
    nthWeekday(y, 2, 1, 3), // Presidents
    gf.toISOString().slice(0, 10), // Good Friday
    lastWeekday(y, 5, 1), // Memorial
    y >= 2022 ? observed(y, 6, 19) : null, // Juneteenth
    observed(y, 7, 4),
    nthWeekday(y, 9, 1, 1), // Labor
    nthWeekday(y, 11, 4, 4), // Thanksgiving
    observed(y, 12, 25),
  ].filter((s): s is string => !!s);
  const set = new Set(list);
  usCache.set(y, set);
  return set;
}

export function isWeekend(date: string): boolean {
  const wd = new Date(date + 'T00:00:00Z').getUTCDay();
  return wd === 0 || wd === 6;
}

export function isTradingDay(market: Market, date: string): boolean {
  if (isWeekend(date)) return false;
  if (market === 'US') return !usHolidays(Number(date.slice(0, 4))).has(date);
  return !twHolidaySet.has(date);
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 從 fromDate（不含）起往後 h 個交易日 —— 用於快照的目標日期 */
export function nextTradingDays(market: Market, fromDate: string, h: number): string[] {
  const out: string[] = [];
  let d = fromDate;
  let guard = 0;
  while (out.length < h && guard++ < h * 4 + 30) {
    d = addDays(d, 1);
    if (isTradingDay(market, d)) out.push(d);
  }
  return out;
}

export function describeCalendarCoverage(): { twYears: number[]; note: string } {
  return { twYears: Object.keys(TW_HOLIDAYS).map(Number), note: '台股休市日需每年依證交所公告更新 lib/calendar.ts' };
}

// ───────── 交易時段 ─────────

const TZ: Record<Market, string> = { TW: 'Asia/Taipei', TWO: 'Asia/Taipei', US: 'America/New_York' };
const SESSION: Record<Market, { open: number; close: number }> = {
  TW: { open: 9 * 60, close: 13 * 60 + 30 },
  TWO: { open: 9 * 60, close: 13 * 60 + 30 },
  US: { open: 9 * 60 + 30, close: 16 * 60 },
};

/** 取得某時區的當地日期與分鐘數 */
export function localParts(now: Date, tz: string): { date: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: hour * 60 + Number(parts.minute) };
}

export interface MarketStatus {
  market: Market;
  state: 'pre' | 'open' | 'closed';
  label: '盤前' | '盤中' | '收盤' | '休市';
  localDate: string;
  /** 台北時間的開收盤時刻（字串，自動反映美股夏令） */
  taipeiSession: string;
}

export function getMarketStatus(market: Market, now = new Date()): MarketStatus {
  const { date, minutes } = localParts(now, TZ[market]);
  const s = SESSION[market];
  const taipeiSession = market === 'US' ? usSessionInTaipei(now) : '09:00–13:30';
  if (!isTradingDay(market, date)) return { market, state: 'closed', label: '休市', localDate: date, taipeiSession };
  if (minutes < s.open) return { market, state: 'pre', label: '盤前', localDate: date, taipeiSession };
  if (minutes < s.close) return { market, state: 'open', label: '盤中', localDate: date, taipeiSession };
  return { market, state: 'closed', label: '收盤', localDate: date, taipeiSession };
}

/** 美股開收盤換算成台北時間（夏令 21:30–04:00；冬令 22:30–05:00） */
export function usSessionInTaipei(now = new Date()): string {
  const ny = localParts(now, 'America/New_York');
  const tp = localParts(now, 'Asia/Taipei');
  let offsetMin = tp.minutes - ny.minutes;
  if (tp.date > ny.date) offsetMin += 1440;
  if (tp.date < ny.date) offsetMin -= 1440;
  const fmt = (m: number) => {
    const x = ((m % 1440) + 1440) % 1440;
    return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  };
  return `${fmt(SESSION.US.open + offsetMin)}–${fmt(SESSION.US.close + offsetMin)}`;
}

/** 是否應該啟動盤中輪詢 */
export function shouldPoll(market: Market, now = new Date()): boolean {
  return getMarketStatus(market, now).state === 'open';
}

export function marketOf(symbol: string): Market {
  if (/\.TWO$/i.test(symbol)) return 'TWO';
  if (/\.TW$/i.test(symbol)) return 'TW';
  return 'US';
}
