/**
 * 社會 / 行事曆情境（純函式）：休市日遠近、財報季 / 法定公告期限、季底作帳窗口、公司財報事件。
 * 只描述 asOf 當下的情境；未來的公司事件只有在 asOf 為「今天」時才列出（當時已排定的公開行事曆）。
 */
import type { Market } from '../types';
import { addDays, isTradingDay, isWeekend } from '../calendar';
import { META, type IndicatorReading, CAVEAT } from './indicators';

export interface CalendarEvent {
  date: string;
  type: string;
  title: string;
  source: string;
}

function tradingDaysBetween(market: Market, a: string, b: string): number {
  let n = 0;
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (isTradingDay(market, d)) n++;
  return n;
}

/** 下一個（或上一個）平日休市日 */
export function nearestHoliday(market: Market, asOf: string, dir: 1 | -1, maxDays = 30): string | null {
  for (let i = 1; i <= maxDays; i++) {
    const d = addDays(asOf, i * dir);
    if (!isWeekend(d) && !isTradingDay(market, d)) return d;
  }
  return null;
}

const TW_DEADLINES = ['03-31', '05-15', '08-14', '11-14'];

export function nextTwDeadline(asOf: string): { date: string; label: string } {
  const y = Number(asOf.slice(0, 4));
  const labels: Record<string, string> = { '03-31': '年報', '05-15': 'Q1 季報', '08-14': 'Q2 半年報', '11-14': 'Q3 季報' };
  for (const yy of [y, y + 1]) for (const md of TW_DEADLINES) if (`${yy}-${md}` >= asOf) return { date: `${yy}-${md}`, label: labels[md] };
  return { date: `${y + 1}-03-31`, label: '年報' };
}

/** 美股財報季：每季結束後約第 10 天到第 45 天（1/10–2/15、4/10–5/15、7/10–8/15、10/10–11/15） */
export function inUsEarningsSeason(asOf: string): boolean {
  const m = Number(asOf.slice(5, 7));
  const d = Number(asOf.slice(8, 10));
  const qMonth = (m - 1) % 3; // 0 = 季後第一個月
  if (qMonth === 0) return d >= 10;
  if (qMonth === 1) return d <= 15;
  return false;
}

export function isQuarterEndWindow(market: Market, asOf: string, n = 5): boolean {
  const m = Number(asOf.slice(5, 7));
  if (m % 3 !== 0) return false;
  const end = `${asOf.slice(0, 7)}-${String(new Date(Date.UTC(Number(asOf.slice(0, 4)), m, 0)).getUTCDate()).padStart(2, '0')}`;
  return tradingDaysBetween(market, asOf, end) < n;
}

export function calendarContext(p: { market: Market; asOf: string; today: string; events: CalendarEvent[]; macroHeadlines: { title: string; url: string | null; publishedAt: string; source: string }[] }): IndicatorReading {
  const { market, asOf } = p;
  const nextH = nearestHoliday(market, asOf, 1);
  const prevH = nearestHoliday(market, asOf, -1);
  const details: Record<string, string | number | null> = {
    nextHoliday: nextH,
    tradingDaysToNextHoliday: nextH ? tradingDaysBetween(market, asOf, nextH) : null,
    prevHoliday: prevH,
    quarterEndWindow: isQuarterEndWindow(market, asOf) ? 1 : 0,
  };
  const notes: string[] = [];
  if (nextH && (details.tradingDaysToNextHoliday as number) <= 2) notes.push(`即將休市（${nextH}）：假期前後成交與波動常有變化`);
  if (details.quarterEndWindow) notes.push('季底最後幾個交易日（法人作帳窗口）');
  if (market === 'US') {
    const season = inUsEarningsSeason(asOf);
    details.earningsSeason = season ? 1 : 0;
    if (season) notes.push('美股財報季期間');
  } else {
    const dl = nextTwDeadline(asOf);
    const daysTo = Math.round((Date.parse(dl.date) - Date.parse(asOf)) / 86400000);
    details.nextStatutoryDeadline = `${dl.date}（${dl.label}）`;
    details.daysToStatutoryDeadline = daysTo;
    if (daysTo <= 30) notes.push(`距 ${dl.label}法定公告期限 ${daysTo} 天（財報季）`);
    const day = Number(asOf.slice(8, 10));
    if (day <= 10) notes.push('每月 10 日前為上月營收公布期');
  }
  // 公司事件：過去 30 日內已發生；未來事件只在 asOf ≈ 今天時列出
  const allowFuture = asOf >= addDays(p.today, -1);
  const evs = p.events.filter((e) => e.date <= asOf ? e.date >= addDays(asOf, -30) : allowFuture && e.date <= addDays(asOf, 30)).sort((a, b) => a.date.localeCompare(b.date));
  const earnings = evs.filter((e) => e.type === 'earnings' || e.type === 'conference');
  if (earnings.length) {
    details.companyEvents = earnings.map((e) => `${e.date} ${e.title}`).slice(0, 4).join('；');
    notes.push(`公司事件：${earnings.map((e) => `${e.date} ${e.title}`).slice(0, 2).join('、')}`);
  }
  if (p.macroHeadlines.length) notes.push(`近 7 日總經 / 地緣標題 ${p.macroHeadlines.length} 則`);
  return {
    ...META.calendar,
    available: true,
    value: notes.length,
    unit: '項情境',
    reading: notes.length ? notes.join('；') : '無特殊行事曆情境',
    details,
    asOf,
    sources: [{ name: market === 'US' ? '美股休市日（lib/calendar）' : '台股休市日（lib/calendar，依證交所公告）' }, ...(evs.length ? [{ name: '公司事件（getEvents）', asOf }] : [])],
    caveat: CAVEAT,
  };
}
