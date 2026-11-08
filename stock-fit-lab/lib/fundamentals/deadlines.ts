/**
 * 台股財報「何時才算公開」的法定期限（證券交易法第 36 條，一般上市櫃公司）：
 *   Q1（03-31）→ 05-15、Q2（06-30）→ 08-14、Q3（09-30）→ 11-14、年報（12-31）→ 次年 03-31
 *   月營收：次月 10 日前
 * 資料中若沒有實際申報日，就以法定期限作為「已知日」：asOf 早於期限者視為尚未公開（保守，不會用到未來資訊）。
 * 註：金融控股 / 銀行業等部分產業期限不同（例如 Q2 為 08-31）；以一般期限計可能略早，介面會註明。
 */

export function twQuarterDeadline(periodEnd: string): string {
  const y = Number(periodEnd.slice(0, 4));
  const md = periodEnd.slice(5, 10);
  if (md === '03-31') return `${y}-05-15`;
  if (md === '06-30') return `${y}-08-14`;
  if (md === '09-30') return `${y}-11-14`;
  if (md === '12-31') return `${y + 1}-03-31`;
  // 非標準季底：保守以期末 + 90 天
  const t = new Date(periodEnd + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + 90);
  return t.toISOString().slice(0, 10);
}

/** 月營收已知日：有公布日用公布日，否則次月 10 日 */
export function twRevenueKnownDate(yearMonth: string, published?: string | null): { date: string; basis: 'published' | 'statutory-deadline' } {
  const pub = typeof published === 'string' ? published.slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(pub) && pub > `${yearMonth}-01`) return { date: pub, basis: 'published' };
  const y = Number(yearMonth.slice(0, 4));
  const m = Number(yearMonth.slice(5, 7));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { date: `${ny}-${String(nm).padStart(2, '0')}-10`, basis: 'statutory-deadline' };
}

/** 季報已知日：有申報日（且不早於期末）用申報日，否則法定期限 */
export function twStatementKnownDate(periodEnd: string, filed?: string | null): { date: string; basis: 'filed' | 'statutory-deadline' } {
  if (filed && /^\d{4}-\d{2}-\d{2}/.test(filed) && filed.slice(0, 10) > periodEnd) return { date: filed.slice(0, 10), basis: 'filed' };
  return { date: twQuarterDeadline(periodEnd), basis: 'statutory-deadline' };
}

export const TW_LAG_RULE = '台股季報以法定公告期限視為公開日（Q1→5/15、Q2→8/14、Q3→11/14、年報→次年 3/31；金融業部分期限較晚），月營收以公布日或次月 10 日。';
