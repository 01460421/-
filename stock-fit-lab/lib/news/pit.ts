/**
 * Point-in-time（時點正確）工具：任何查詢都帶 asOf，只回傳「當時已公開」的資料。
 *
 * asOf 可為：
 *  - 'YYYY-MM-DD'：視為該市場當地時間當日 23:59:59.999（當天任何時刻發布者都算已知）
 *  - 完整 ISO 時間：精確截止
 * 只有日期、沒有時間的項目，以當地 23:59:59 視為發布時間（保守：當天收盤後才算已知）。
 */
import type { Market } from '../types';

export const MARKET_TZ_OF: Record<Market, string> = { TW: 'Asia/Taipei', TWO: 'Asia/Taipei', US: 'America/New_York' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 某時區的 UTC 偏移（分鐘），以 Intl 取得（含夏令時間） */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** 當地日期 + 時間（HH:MM[:SS]）→ UTC 毫秒 */
export function localToUtcMs(date: string, time: string, tz: string): number {
  const [h = '0', m = '0', s = '0'] = time.split(':');
  const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), Number(h), Number(m), Number(s));
  const off1 = tzOffsetMinutes(tz, new Date(guess));
  const t = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(tz, new Date(t));
  return off2 === off1 ? t : guess - off2 * 60000;
}

export function localToIso(date: string, time: string, tz: string): string {
  return new Date(localToUtcMs(date, time, tz)).toISOString();
}

/** asOf → 截止時間（UTC 毫秒） */
export function asOfCutoffMs(asOf: string | undefined, tz = 'Asia/Taipei', now = Date.now()): number {
  if (!asOf) return now;
  if (DATE_RE.test(asOf)) return localToUtcMs(asOf, '23:59:59', tz) + 999;
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) throw new Error(`asOf 格式錯誤：${asOf}`);
  return t;
}

/** 只保留 publishedAt ≤ asOf 的項目（未來的項目絕不回傳；無法解析時間者一律排除） */
export function filterAsOf<T extends { publishedAt: string }>(items: T[], asOf: string | undefined, tz = 'Asia/Taipei'): T[] {
  const cutoff = asOfCutoffMs(asOf, tz);
  return items.filter((it) => {
    const t = Date.parse(it.publishedAt);
    return Number.isFinite(t) && t <= cutoff;
  });
}

/** 當地日期（YYYY-MM-DD） */
export function localDate(iso: string, tz: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(d);
}

/** 民國日期 113/01/18 或 1130118 → 2024-01-18 */
export function rocDateToIso(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{2,3})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (!m) m = t.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]) + 1911;
  return `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** 70003 / 163634 / 16:36:34 → 16:36:34 */
export function normalizeTime(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return t.length <= 5 ? `${t}:00` : t;
  if (/^\d{5,6}$/.test(t)) {
    const p = t.padStart(6, '0');
    return `${p.slice(0, 2)}:${p.slice(2, 4)}:${p.slice(4, 6)}`;
  }
  return null;
}

export function isIsoDate(s: string | undefined): s is string {
  return !!s && DATE_RE.test(s);
}
