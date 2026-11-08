/**
 * SEC EDGAR（美國證管會官方資料，規格第十一節：官方公開 API）。
 *  - 代號 → CIK：https://www.sec.gov/files/company_tickers.json（快取 7 天）
 *  - 公司申報清單：https://data.sec.gov/submissions/CIK##########.json（recent + 較舊的分頁檔案）
 *  - 全文檢索：https://efts.sec.gov/LATEST/search-index?q=...&dateRange=custom&startdt=&enddt=
 *  - XBRL 財報事實：https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json（見 lib/fundamentals）
 *
 * SEC 規定自動化存取需帶有聯絡資訊的 User-Agent：讀取環境變數 SEC_USER_AGENT
 * （例如 "StockFitLab admin@example.com"）；未設定時使用通用 UA，SEC 可能會限流。
 * 速率：SEC 上限每秒 10 次，本模組以每秒 8 次的 token bucket 保守限制。
 */
import { fetchJson } from '../data-adapters/http';
import { getLimiter } from '../data-adapters/ratelimit';
import { cached } from '../history/cache';
import type { NewsItem } from './types';

export const SEC_DEFAULT_UA = 'stock-fit-lab research';

export function secUserAgent(): { ua: string; configured: boolean } {
  const v = process.env.SEC_USER_AGENT?.trim();
  return v ? { ua: v, configured: true } : { ua: SEC_DEFAULT_UA, configured: false };
}

export const SEC_UA_NOTE = '未設定 SEC_USER_AGENT（含聯絡 email 的 User-Agent），SEC 可能限流或拒絕請求。';

function secLimiter() {
  return getLimiter('sec', { capacity: 4, refillPerSec: 8 });
}

export async function secFetchJson<T>(url: string, opts: { timeoutMs?: number } = {}): Promise<T> {
  return fetchJson<T>(url, {
    limiter: secLimiter(),
    retries: 2,
    timeoutMs: opts.timeoutMs ?? 20000,
    headers: { 'User-Agent': secUserAgent().ua, Accept: 'application/json' },
  });
}

export function padCik(cik: number | string): string {
  return String(cik).replace(/\D/g, '').padStart(10, '0');
}

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

/** 代號 → { cik, title }；查無則 null */
export async function tickerToCik(ticker: string): Promise<{ cik: string; title: string } | null> {
  const map = await cached('ctx:sec:tickers:v1', 7 * 86400, async () => {
    const body = await secFetchJson<Record<string, TickerEntry>>('https://www.sec.gov/files/company_tickers.json', { timeoutMs: 30000 });
    const m: Record<string, { cik: string; title: string }> = {};
    for (const e of Object.values(body)) if (e?.ticker) m[e.ticker.toUpperCase()] = { cik: padCik(e.cik_str), title: e.title };
    return m;
  }, 30 * 86400);
  const t = ticker.toUpperCase().replace(/\./g, '-');
  return map[t] ?? map[ticker.toUpperCase()] ?? null;
}

export interface SecFiling {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate: string | null;
  /** acceptanceDateTime（UTC ISO）——作為 point-in-time 的發布時間 */
  acceptedAt: string;
  items: string[];
  primaryDocument: string;
  primaryDocDescription: string;
  url: string;
  indexUrl: string;
}

interface RecentBlock {
  accessionNumber: string[];
  filingDate: string[];
  reportDate?: string[];
  acceptanceDateTime?: string[];
  form: string[];
  items?: string[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
}

export interface SecSubmissions {
  cik: string;
  name: string;
  tickers: string[];
  filings: SecFiling[];
  /** 較舊的分頁檔（recent 只含最近約 1000 筆） */
  olderFiles: { name: string; filingFrom: string; filingTo: string }[];
}

export function filingUrls(cik: string, accession: string, primaryDocument: string): { url: string; indexUrl: string } {
  const c = String(Number(cik));
  const acc = accession.replace(/-/g, '');
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${c}/${acc}/`;
  return { url: primaryDocument ? `${indexUrl}${primaryDocument}` : indexUrl, indexUrl };
}

export function parseRecentBlock(cik: string, r: RecentBlock): SecFiling[] {
  const out: SecFiling[] = [];
  const n = r?.accessionNumber?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const acc = r.accessionNumber[i];
    const filingDate = r.filingDate[i];
    if (!acc || !filingDate) continue;
    const accepted = r.acceptanceDateTime?.[i];
    const acceptedAt = accepted && Number.isFinite(Date.parse(accepted)) ? new Date(accepted).toISOString() : `${filingDate}T23:59:59.000Z`;
    const doc = r.primaryDocument?.[i] ?? '';
    out.push({
      accessionNumber: acc,
      form: r.form[i],
      filingDate,
      reportDate: r.reportDate?.[i] || null,
      acceptedAt,
      items: (r.items?.[i] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      primaryDocument: doc,
      primaryDocDescription: r.primaryDocDescription?.[i] ?? '',
      ...filingUrls(cik, acc, doc),
    });
  }
  return out;
}

export function parseSubmissions(body: {
  cik?: string | number;
  name?: string;
  tickers?: string[];
  filings?: { recent?: RecentBlock; files?: { name: string; filingFrom: string; filingTo: string }[] };
}): SecSubmissions {
  const cik = padCik(body.cik ?? 0);
  return {
    cik,
    name: body.name ?? '',
    tickers: body.tickers ?? [],
    filings: body.filings?.recent ? parseRecentBlock(cik, body.filings.recent) : [],
    olderFiles: body.filings?.files ?? [],
  };
}

/** 公司申報清單；from 早於 recent 範圍時才載入較舊的分頁檔 */
export async function getSubmissions(cik: string, opts: { from?: string } = {}): Promise<SecSubmissions> {
  const c = padCik(cik);
  const sub = await cached(`ctx:sec:sub:v1:${c}`, 3600, async () => parseSubmissions(await secFetchJson(`https://data.sec.gov/submissions/CIK${c}.json`)), 30 * 86400);
  if (!opts.from) return sub;
  const earliest = sub.filings.reduce((m, f) => (f.filingDate < m ? f.filingDate : m), '9999-12-31');
  if (opts.from >= earliest) return sub;
  const extra: SecFiling[] = [];
  for (const f of sub.olderFiles) {
    if (f.filingTo < opts.from) continue;
    try {
      const block = await cached(`ctx:sec:subfile:v1:${f.name}`, 30 * 86400, () => secFetchJson<RecentBlock>(`https://data.sec.gov/submissions/${f.name}`), 90 * 86400);
      extra.push(...parseRecentBlock(c, block));
    } catch {
      /* 較舊分頁失敗：只用 recent */
    }
  }
  return { ...sub, filings: [...sub.filings, ...extra] };
}

/** 8-K item 中文說明 */
export const EIGHT_K_ITEMS: Record<string, string> = {
  '1.01': '重大協議簽訂',
  '1.02': '重大協議終止',
  '1.03': '破產或接管',
  '2.01': '資產收購或處分完成',
  '2.02': '營運成果與財務狀況（財報新聞稿）',
  '2.03': '直接財務義務',
  '2.05': '退出或處分相關成本',
  '2.06': '重大減損',
  '3.01': '下市或不符上市標準通知',
  '3.02': '未註冊股權出售',
  '4.01': '會計師變更',
  '4.02': '不可依賴先前財報',
  '5.01': '控制權變更',
  '5.02': '董事 / 高階主管異動',
  '5.03': '章程或會計年度變更',
  '5.07': '股東會表決結果',
  '7.01': 'Regulation FD 揭露',
  '8.01': '其他事件',
  '9.01': '財務報表與附件',
};

export const FORM_LABEL: Record<string, string> = {
  '8-K': '重大事件報告',
  '10-Q': '季報',
  '10-K': '年報',
  '6-K': '外國發行人報告',
  '20-F': '外國發行人年報',
  'DEF 14A': '股東會委託書',
  'S-1': '公開發行註冊',
  '4': '內部人持股變動',
  'SC 13D': '大股東持股（主動）',
  'SC 13G': '大股東持股（被動）',
};

/** 適合當作「新聞 / 公告」顯示的表單（排除 Form 4 等大量內部人申報） */
export const NEWSWORTHY_FORMS = new Set(['8-K', '8-K/A', '10-Q', '10-K', '10-K/A', '6-K', '20-F', 'DEF 14A', 'S-1', 'SC 13D', 'SC 13D/A']);

export function filingTitle(f: SecFiling): string {
  const label = FORM_LABEL[f.form.replace(/\/A$/, '')] ?? '';
  const items = f.items.length ? '：' + f.items.map((i) => `${i} ${EIGHT_K_ITEMS[i] ?? ''}`.trim()).join('；') : '';
  const period = f.reportDate && f.form !== '8-K' ? `（期間 ${f.reportDate}）` : '';
  return `${f.form}${label ? ` ${label}` : ''}${items}${period}`;
}

export function filingToNews(f: SecFiling, symbol: string): NewsItem {
  return {
    id: `sec:${f.accessionNumber}`,
    title: filingTitle(f),
    url: f.url,
    source: 'SEC EDGAR',
    publishedAt: f.acceptedAt,
    tier: 'official',
    kind: 'filing',
    provider: 'sec-edgar',
    symbol,
    form: f.form,
    items: f.items,
  };
}

export interface EftsHit {
  adsh: string;
  form: string;
  fileType: string;
  fileDescription: string;
  fileDate: string;
  periodEnding: string | null;
  items: string[];
  displayNames: string[];
  url: string;
}

interface EftsResponse {
  hits?: {
    total?: { value: number };
    hits?: {
      _id: string;
      _source: {
        ciks?: string[];
        form?: string;
        root_forms?: string[];
        file_type?: string;
        file_description?: string;
        file_date?: string;
        period_ending?: string | null;
        items?: string[];
        display_names?: string[];
        adsh?: string;
      };
    }[];
  };
}

export function parseEfts(body: EftsResponse): { total: number; hits: EftsHit[] } {
  const hits: EftsHit[] = [];
  for (const h of body?.hits?.hits ?? []) {
    const s = h._source ?? {};
    const [adsh0, file] = String(h._id ?? '').split(':');
    const adsh = s.adsh ?? adsh0;
    const cik = s.ciks?.[0];
    if (!adsh || !cik || !s.file_date) continue;
    const { indexUrl } = filingUrls(cik, adsh, '');
    hits.push({
      adsh,
      form: s.form ?? s.root_forms?.[0] ?? '',
      fileType: s.file_type ?? '',
      fileDescription: s.file_description ?? '',
      fileDate: s.file_date,
      periodEnding: s.period_ending ?? null,
      items: s.items ?? [],
      displayNames: s.display_names ?? [],
      url: file ? `${indexUrl}${file}` : indexUrl,
    });
  }
  return { total: body?.hits?.total?.value ?? hits.length, hits };
}

export function eftsUrl(p: { q?: string; ciks?: string[]; forms?: string[]; startdt: string; enddt: string }): string {
  const q = new URLSearchParams();
  if (p.q) q.set('q', p.q);
  q.set('dateRange', 'custom');
  q.set('startdt', p.startdt);
  q.set('enddt', p.enddt);
  if (p.ciks?.length) q.set('ciks', p.ciks.map(padCik).join(','));
  if (p.forms?.length) q.set('forms', p.forms.join(','));
  return `https://efts.sec.gov/LATEST/search-index?${q.toString()}`;
}

/** EDGAR 全文檢索（依 file_date 篩選）；結果快取 1 天 */
export async function searchEfts(p: { q?: string; ciks?: string[]; forms?: string[]; startdt: string; enddt: string }): Promise<{ total: number; hits: EftsHit[] }> {
  const url = eftsUrl(p);
  return cached(`ctx:sec:efts:v1:${url}`, 86400, async () => parseEfts(await secFetchJson<EftsResponse>(url)), 30 * 86400);
}

export function eftsHitToNews(h: EftsHit, symbol: string): NewsItem {
  const items = h.items.length ? '：' + h.items.map((i) => `${i} ${EIGHT_K_ITEMS[i] ?? ''}`.trim()).join('；') : '';
  return {
    id: `efts:${h.adsh}:${h.url.split('/').pop()}`,
    title: `${h.form} ${h.fileType && h.fileType !== h.form ? `${h.fileType} ` : ''}${h.fileDescription && h.fileDescription !== h.fileType ? h.fileDescription : ''}${items}`.replace(/\s+/g, ' ').trim(),
    url: h.url,
    source: 'SEC EDGAR 全文檢索',
    // 全文檢索只有申報日期：以美東當日 23:59:59 保守視為公開時間
    publishedAt: new Date(Date.parse(`${h.fileDate}T23:59:59-05:00`)).toISOString(),
    dateOnly: true,
    tier: 'official',
    kind: 'filing',
    provider: 'sec-efts',
    symbol,
    form: h.form,
    items: h.items,
  };
}
