/** TWSE / TPEx 共用：逐月歷史表格解析（官方網站 JSON，民國日期、千分位字串） */
import type { RawBar } from './util';
import { rocToIso, toNum } from './util';

/** start~end 之間每個月的第一天（YYYY-MM-01），由舊到新 */
export function monthStarts(start: string, end: string, maxMonths = 36): string[] {
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.slice(-maxMonths);
}

function findCol(fields: string[], ...needles: string[]): number {
  const norm = fields.map((f) => f.replace(/\s+/g, ''));
  for (const n of needles) {
    const i = norm.indexOf(n);
    if (i >= 0) return i;
  }
  for (const n of needles) {
    const i = norm.findIndex((f) => f.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * 解析逐日表格：fields 標題 + data 列。volumeMultiplier：TPEx「成交張數」需 ×1000 換成股。
 */
export function parseDailyTable(fields: string[], data: unknown[][], opts: { volumeMultiplier?: number } = {}): RawBar[] {
  const iDate = findCol(fields, '日期');
  const iOpen = findCol(fields, '開盤');
  const iHigh = findCol(fields, '最高');
  const iLow = findCol(fields, '最低');
  const iClose = findCol(fields, '收盤');
  const iVol = findCol(fields, '成交股數', '成交張數', '成交量');
  if (iDate < 0 || iClose < 0) return [];
  const mult = opts.volumeMultiplier ?? 1;
  const out: RawBar[] = [];
  for (const row of data) {
    if (!Array.isArray(row)) continue;
    const date = rocToIso(String(row[iDate]));
    if (!date) continue;
    const vol = iVol >= 0 ? toNum(row[iVol]) : null;
    out.push({
      date,
      open: iOpen >= 0 ? toNum(row[iOpen]) : null,
      high: iHigh >= 0 ? toNum(row[iHigh]) : null,
      low: iLow >= 0 ? toNum(row[iLow]) : null,
      close: toNum(row[iClose]),
      volume: vol === null ? 0 : vol * mult,
    });
  }
  return out;
}

export { findCol };
