/**
 * 台股官方公告（規格第十、十一節：只用官方公開管道、只取標題 / 日期 / 連結）。
 *
 * 1) 公開資訊觀測站（MOPS）歷史重大訊息 t05st01：
 *    POST https://mopsov.twse.com.tw/mops/web/ajax_t05st01
 *    form：encodeURIComponent=1&step=1&firstin=1&off=1&queryName=co_id&inpuType=co_id&TYPEK=all&co_id=2330&year=113&month=01
 *    回應為 HTML 表格（公司代號 / 公司名稱 / 發言日期 / 發言時間 / 主旨 / 詳細資料）。只取主旨（標題）與時間，不取「說明」全文。
 * 2) MOPS 法人說明會 t100sb02_1：POST .../ajax_t100sb02_1（co_id、year），取召開日期、擇要訊息標題與簡報檔連結。
 * 3) 臺灣證券交易所 OpenAPI（官方開放資料）t187ap04_L「上市公司每日重大訊息」：
 *    GET https://openapi.twse.com.tw/v1/opendata/t187ap04_L（只含最近一個交易日；取「主旨」欄，捨棄「說明」全文）。
 *
 * MOPS 有網站防護（WAF），短時間大量請求會被回應「因為安全性考量，您所執行的頁面無法呈現」。
 * 本模組以誠實的 User-Agent、每 4 秒最多 1 次的速率、長時間快取來使用，被阻擋時直接回報（不嘗試繞過）。
 */
import { fetchWithRetry, HttpError } from '../data-adapters/http';
import { getLimiter } from '../data-adapters/ratelimit';
import { cached, isPastDate } from '../history/cache';
import { extractRows } from './html';
import { localToIso, normalizeTime, rocDateToIso } from './pit';
import type { NewsItem } from './types';

export const MOPS_BASE = 'https://mopsov.twse.com.tw/mops/web';
export const MOPS_T05ST01_PAGE = `${MOPS_BASE}/t05st01`;
export const MOPS_T100SB02_PAGE = `${MOPS_BASE}/t100sb02_1`;
export const TWSE_OPENAPI_AP04 = 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L';
const TZ = 'Asia/Taipei';

export class MopsBlockedError extends Error {
  constructor(message = '公開資訊觀測站以安全性考量拒絕此請求（網站防護），請稍後再試或直接至 MOPS 查詢') {
    super(message);
    this.name = 'MopsBlockedError';
  }
}

/** 可調整（測試會調小）：每 4 秒最多 1 次 */
export const mopsConfig = { refillPerSec: 0.25, baseDelayMs: 4000 };

function limiter() {
  return getLimiter('mops', { capacity: 1, refillPerSec: mopsConfig.refillPerSec, hourlyQuota: 300 });
}

export function isMopsBlocked(html: string): boolean {
  return /FOR SECURITY REASONS|因為安全性考量|頁面無法呈現/i.test(html);
}

export function isMopsEmpty(html: string): boolean {
  return /查無(所需)?資料|查無資訊|無符合條件/.test(html);
}

async function postForm(path: string, form: Record<string, string>): Promise<string> {
  const body = new URLSearchParams(form).toString();
  const res = await fetchWithRetry(`${MOPS_BASE}/${path}`, {
    method: 'POST',
    body,
    limiter: limiter(),
    retries: 1,
    baseDelayMs: mopsConfig.baseDelayMs,
    timeoutMs: 15000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Accept: 'text/html, */*' },
  });
  const html = await res.text();
  if (isMopsBlocked(html)) throw new MopsBlockedError();
  return html;
}

/** 解析 t05st01 回應（歷史重大訊息）→ 只含標題 / 時間 / 連結的 NewsItem */
export function parseMopsAnnouncements(html: string, code: string): NewsItem[] {
  if (isMopsBlocked(html)) throw new MopsBlockedError();
  if (isMopsEmpty(html)) return [];
  const rows = extractRows(
    html,
    { code: /公司代號/, name: /公司名稱/, date: /發言日期/, time: /發言時間/, subject: /主旨/ },
    ['date', 'subject'],
  );
  const out: NewsItem[] = [];
  rows.forEach(({ values, cells }, i) => {
    const date = rocDateToIso(values.date);
    if (!date) return;
    if (values.code && values.code.trim() !== code) return;
    const time = normalizeTime(values.time) ?? '23:59:59';
    const onclick = cells.map((c) => c.html).join(' ');
    const seq = onclick.match(/seq_no\.value\s*=\s*['"]?(\d+)/)?.[1];
    const title = values.subject.replace(/\s+/g, ' ').trim().slice(0, 200);
    out.push({
      id: `mops:${code}:${date}:${time}:${seq ?? i}`,
      title,
      url: `${MOPS_T05ST01_PAGE}?co_id=${encodeURIComponent(code)}`,
      source: '公開資訊觀測站 重大訊息',
      publishedAt: localToIso(date, time, TZ),
      dateOnly: !normalizeTime(values.time),
      tier: 'official',
      kind: 'disclosure',
      provider: 'mops',
      symbol: code,
    });
  });
  return out;
}

/** 取得某公司某月份的歷史重大訊息（過去月份快取 30 天，當月 1 小時） */
export async function fetchMopsAnnouncements(code: string, yearMonth: string): Promise<NewsItem[]> {
  const [y, m] = yearMonth.split('-');
  const roc = String(Number(y) - 1911);
  const past = isPastDate(`${yearMonth}-31`);
  return cached(`ctx:mops:t05st01:v1:${code}:${yearMonth}`, past ? 30 * 86400 : 3600, async () => {
    const html = await postForm('ajax_t05st01', {
      encodeURIComponent: '1',
      step: '1',
      firstin: '1',
      off: '1',
      queryName: 'co_id',
      inpuType: 'co_id',
      TYPEK: 'all',
      co_id: code,
      year: roc,
      month: m,
    });
    return parseMopsAnnouncements(html, code);
  }, 90 * 86400);
}

/** 解析法人說明會（t100sb02_1）：召開日期、標題（擇要訊息前 120 字，屬 MOPS 官方摘要欄位）、簡報 / 影音連結 */
export function parseMopsConferences(html: string, code: string): NewsItem[] {
  if (isMopsBlocked(html)) throw new MopsBlockedError();
  if (isMopsEmpty(html)) return [];
  const rows = extractRows(
    html,
    { date: /召開法人說明會日期|說明會日期|召開日期/, time: /時間/, place: /地點/, summary: /擇要訊息|說明會擇要|摘要/ },
    ['date'],
  );
  const out: NewsItem[] = [];
  rows.forEach(({ values, cells }, i) => {
    const date = rocDateToIso(values.date.split(/\s|至|~/)[0] ?? '');
    if (!date) return;
    const links = cells.flatMap((c) => c.links).filter((l) => /\.pdf|\.ppt|nas\/|video|webcast/i.test(l));
    const abs = links.map((l) => (l.startsWith('http') ? l : `https://mopsov.twse.com.tw${l.startsWith('/') ? '' : '/'}${l}`));
    const summary = (values.summary || '').replace(/\s+/g, ' ').trim();
    out.push({
      id: `mops:conf:${code}:${date}:${i}`,
      title: `法人說明會${values.place ? `（${values.place.slice(0, 30)}）` : ''}${summary ? `：${summary.slice(0, 120)}` : ''}`,
      url: abs[0] ?? `${MOPS_T100SB02_PAGE}?co_id=${encodeURIComponent(code)}`,
      source: '公開資訊觀測站 法人說明會',
      publishedAt: localToIso(date, '23:59:59', TZ),
      dateOnly: true,
      tier: 'official',
      kind: 'conference',
      provider: 'mops',
      symbol: code,
      tags: ['conference'],
    });
  });
  return out;
}

export async function fetchMopsConferences(code: string, year: number): Promise<NewsItem[]> {
  const past = year < new Date().getUTCFullYear();
  return cached(`ctx:mops:t100sb02:v1:${code}:${year}`, past ? 30 * 86400 : 6 * 3600, async () => {
    const html = await postForm('ajax_t100sb02_1', {
      encodeURIComponent: '1',
      step: '1',
      firstin: '1',
      off: '1',
      TYPEK: 'all',
      co_id: code,
      year: String(year - 1911),
      month: 'all',
    });
    return parseMopsConferences(html, code);
  }, 90 * 86400);
}

export interface TwseAp04Row {
  出表日期?: string;
  發言日期?: string;
  發言時間?: string;
  公司代號?: string;
  公司名稱?: string;
  主旨?: string;
  '主旨 '?: string;
  符合條款?: string;
  事實發生日?: string;
  說明?: string;
}

/** 解析 TWSE OpenAPI t187ap04_L（捨棄「說明」全文，只取主旨） */
export function parseTwseAp04(rows: TwseAp04Row[], code?: string): NewsItem[] {
  if (!Array.isArray(rows)) return [];
  const out: NewsItem[] = [];
  for (const r of rows) {
    const c = String(r.公司代號 ?? '').trim();
    if (code && c !== code) continue;
    const date = rocDateToIso(String(r.發言日期 ?? ''));
    if (!date) continue;
    const time = normalizeTime(String(r.發言時間 ?? '')) ?? '23:59:59';
    const subject = String(r['主旨 '] ?? r.主旨 ?? '').replace(/\s+/g, ' ').trim();
    if (!subject) continue;
    out.push({
      id: `twse-ap04:${c}:${date}:${time}:${subject.slice(0, 20)}`,
      title: subject.slice(0, 200),
      url: `${MOPS_T05ST01_PAGE}?co_id=${encodeURIComponent(c)}`,
      source: '臺灣證券交易所 OpenAPI（上市公司每日重大訊息）',
      publishedAt: localToIso(date, time, TZ),
      tier: 'official',
      kind: 'disclosure',
      provider: 'twse-openapi',
      symbol: c,
      form: r.符合條款 ? String(r.符合條款) : undefined,
    });
  }
  return out;
}

export async function fetchTwseDailyAnnouncements(code?: string): Promise<NewsItem[]> {
  const all = await cached('ctx:twse:ap04:v1', 900, async () => {
    const res = await fetchWithRetry(TWSE_OPENAPI_AP04, { limiter: getLimiter('twse'), retries: 2, headers: { Accept: 'application/json' } });
    const text = await res.text();
    let rows: TwseAp04Row[];
    try {
      rows = JSON.parse(text) as TwseAp04Row[];
    } catch {
      throw new HttpError('TWSE OpenAPI 回應不是 JSON', 502, TWSE_OPENAPI_AP04);
    }
    return parseTwseAp04(rows);
  });
  return code ? all.filter((n) => n.symbol === code) : all;
}

/** 方針相關關鍵字（展望 / 資本支出 / 股利政策 / 財測 / 法說） */
export const GUIDANCE_KEYWORDS_ZH = /展望|資本支出|股利政策|財測|財務預測|營運計畫|營運展望|法人說明會|法說會|資本預算|擴產|投資計畫|盈餘分配|股利分派|董事會決議.*股利/;
