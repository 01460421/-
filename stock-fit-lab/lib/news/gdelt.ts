/**
 * GDELT DOC 2.0 API（免費、公開；涵蓋約 2017 年起的全球新聞索引）。
 *   GET https://api.gdeltproject.org/api/v2/doc/doc?query=...&mode=artlist&format=json&maxrecords=..&startdatetime=YYYYMMDDHHMMSS&enddatetime=..&sort=datedesc
 * 只取標題、網址、網域、首次收錄時間（seendate）；查詢限定權威網域白名單（domain:xxx）。
 * GDELT 要求每 5 秒最多 1 次請求：以每 6 秒 1 次的 token bucket + 429 指數退避 + 長時間快取。
 * 本系統不抓取任何新聞網站本身的 HTML。
 */
import { fetchWithRetry, HttpError } from '../data-adapters/http';
import { getLimiter } from '../data-adapters/ratelimit';
import { cached } from '../history/cache';
import { authorityForDomain, GDELT_DOMAINS } from './authority';
import type { NewsItem } from './types';

export const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
export const GDELT_COVERAGE_START = '2017-01-01';

export interface GdeltArticle {
  url: string;
  url_mobile?: string;
  title: string;
  seendate: string; // 20240118T063000Z
  socialimage?: string;
  domain: string;
  language?: string;
  sourcecountry?: string;
}

/** 可調整（測試會調小）：GDELT 要求每 5 秒最多 1 次 */
export const gdeltConfig = { refillPerSec: 1 / 6, baseDelayMs: 6000, retries: 2 };

function limiter() {
  return getLimiter('gdelt', { capacity: 1, refillPerSec: gdeltConfig.refillPerSec, hourlyQuota: 600 });
}

function dt(date: string, end: boolean): string {
  return date.replace(/-/g, '') + (end ? '235959' : '000000');
}

export function buildGdeltQuery(terms: string[], domains = GDELT_DOMAINS): string {
  const t = terms
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (/\s/.test(x) ? `"${x.replace(/"/g, '')}"` : x));
  const termPart = t.length > 1 ? `(${t.join(' OR ')})` : t[0] ?? '';
  const domPart = domains.length > 1 ? `(${domains.map((d) => `domain:${d}`).join(' OR ')})` : domains.length ? `domain:${domains[0]}` : '';
  return [termPart, domPart].filter(Boolean).join(' ');
}

export function gdeltUrl(p: { terms: string[]; from: string; to: string; max?: number; domains?: string[] }): string {
  const q = new URLSearchParams({
    query: buildGdeltQuery(p.terms, p.domains),
    mode: 'artlist',
    format: 'json',
    maxrecords: String(Math.min(250, Math.max(1, p.max ?? 75))),
    sort: 'datedesc',
    startdatetime: dt(p.from, false),
    enddatetime: dt(p.to, true),
  });
  return `${GDELT_BASE}?${q.toString()}`;
}

/** 20240118T063000Z → ISO */
export function gdeltDate(s: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/.exec(s ?? '');
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
}

export function parseGdelt(body: { articles?: GdeltArticle[] } | null, symbol?: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const a of body?.articles ?? []) {
    const publishedAt = gdeltDate(a.seendate);
    if (!publishedAt || !a.url || !a.title) continue;
    const auth = authorityForDomain(a.domain || a.url);
    if (!auth) continue; // 只保留白名單網域
    out.push({
      id: `gdelt:${a.url}`,
      title: a.title.replace(/\s+/g, ' ').trim().slice(0, 200),
      url: a.url,
      source: auth.name,
      publishedAt,
      tier: auth.tier,
      kind: 'news',
      provider: 'gdelt',
      symbol,
      domain: a.domain,
      language: a.language,
    });
  }
  return out;
}

/** 查詢 GDELT（快取：過去區間 7 天、含今天者 1 小時）；回應非 JSON 時（GDELT 以純文字回報錯誤）拋出說明 */
export async function fetchGdelt(p: { terms: string[]; from: string; to: string; max?: number; symbol?: string }): Promise<NewsItem[]> {
  if (p.to < GDELT_COVERAGE_START) return [];
  const from = p.from < GDELT_COVERAGE_START ? GDELT_COVERAGE_START : p.from;
  const url = gdeltUrl({ ...p, from });
  const today = new Date().toISOString().slice(0, 10);
  return cached(`ctx:gdelt:v1:${url}`, p.to >= today ? 3600 : 7 * 86400, async () => {
    const res = await fetchWithRetry(url, { limiter: limiter(), retries: gdeltConfig.retries, baseDelayMs: gdeltConfig.baseDelayMs, timeoutMs: 20000, headers: { Accept: 'application/json' } });
    const text = await res.text();
    if (!text.trim()) return [];
    let body: { articles?: GdeltArticle[] };
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(`GDELT 回應錯誤：${text.slice(0, 160)}`, 400, url);
    }
    return parseGdelt(body, p.symbol);
  }, 30 * 86400);
}

/** 常見台股的英文名稱（GDELT 以英文媒體為主）；其他代號以中文名稱 + 使用者查詢字詞 */
export const EN_ALIASES: Record<string, string[]> = {
  '2330': ['TSMC', 'Taiwan Semiconductor'],
  '2317': ['Foxconn', 'Hon Hai'],
  '2454': ['MediaTek'],
  '2308': ['Delta Electronics'],
  '2303': ['UMC', 'United Microelectronics'],
  '2412': ['Chunghwa Telecom'],
  '3711': ['ASE Technology'],
  '2382': ['Quanta Computer'],
  '2881': ['Fubon Financial'],
  '2882': ['Cathay Financial'],
  '2891': ['CTBC Financial'],
  '3008': ['Largan'],
  '2357': ['Asustek', 'ASUS'],
  '2603': ['Evergreen Marine'],
  '3034': ['Novatek'],
  '6669': ['Wiwynn'],
  '2379': ['Realtek'],
};
