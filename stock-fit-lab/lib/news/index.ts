/**
 * 權威新聞與官方公告的 point-in-time 查詢（規格第七、十、十一節）。
 *
 * searchNews({ symbol, from, to, asOf }) 只回傳 publishedAt ≤ asOf 的項目（未來的資料絕不出現），
 * 每筆只有標題 + 連結 + 來源 + 發布時間 + 權威等級 + 標題情緒（粗略啟發式），不含任何內文。
 *
 * 來源：
 *  台股：公開資訊觀測站重大訊息（t05st01，官方）、TWSE OpenAPI 每日重大訊息（官方，僅最近一日）、
 *        FinMind TaiwanStockNews（逐日查詢）、GDELT（權威網域白名單）
 *  美股：SEC EDGAR submissions（8-K / 10-Q / 10-K…，官方）、EDGAR 全文檢索（有查詢字詞時）、GDELT
 */
import type { Market } from '../types';
import { addDays } from '../calendar';
import { lookupName, normalizeSymbol } from '../data-adapters';
import { tierAtLeast } from './authority';
import { fetchFinMindNews } from './finmind-news';
import { EN_ALIASES, fetchGdelt, GDELT_BASE, GDELT_COVERAGE_START } from './gdelt';
import { fetchMopsAnnouncements, fetchTwseDailyAnnouncements, MOPS_T05ST01_PAGE, TWSE_OPENAPI_AP04 } from './mops';
import { filterAsOf, localDate, MARKET_TZ_OF } from './pit';
import { eftsHitToNews, filingToNews, getSubmissions, NEWSWORTHY_FORMS, searchEfts, SEC_UA_NOTE, secUserAgent, tickerToCik } from './sec';
import { aggregateDaily, scoreHeadline, SENTIMENT_LABEL, tagHeadline, type DailySentiment } from './sentiment';
import type { AuthorityTier, NewsItem, SourceStatus } from './types';

export * from './types';
export { SENTIMENT_LABEL, scoreHeadline, aggregateDaily, tagHeadline } from './sentiment';
export { filterAsOf, asOfCutoffMs } from './pit';

export interface NewsQuery {
  symbol: string;
  from?: string;
  to?: string;
  /** point-in-time 截止（YYYY-MM-DD 或 ISO）；預設現在 */
  asOf?: string;
  query?: string;
  minTier?: AuthorityTier;
  /** 只要官方揭露（重大訊息 / SEC 申報） */
  officialOnly?: boolean;
  limit?: number;
  /** FinMind 逐日查詢的最多天數（免費方案一次一天） */
  maxFinMindDays?: number;
  /** MOPS 最多查詢的月份數 */
  maxMopsMonths?: number;
  includeGdelt?: boolean;
}

export interface NewsSearchResult {
  symbol: string;
  market: Market;
  from: string;
  to: string;
  asOf: string;
  query: string | null;
  minTier: AuthorityTier;
  total: number;
  truncated: boolean;
  items: NewsItem[];
  daily: DailySentiment[];
  sources: SourceStatus[];
  notes: string[];
  sentimentLabel: string;
  generatedAt: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthsBetween(from: string, to: string, max: number): string[] {
  const out: string[] = [];
  let y = Number(to.slice(0, 4));
  let m = Number(to.slice(5, 7));
  const fy = Number(from.slice(0, 4));
  const fm = Number(from.slice(5, 7));
  while ((y > fy || (y === fy && m >= fm)) && out.length < max) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}

export function shortCompanyName(title: string): string {
  return title
    .replace(/[,.]/g, ' ')
    .replace(/\b(Inc|Incorporated|Corp|Corporation|Co|Company|Holdings?|Ltd|Limited|plc|PLC|Group|N\.?V|S\.?A|Class [A-C])\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}

function matchesQuery(title: string, q: string | undefined): boolean {
  if (!q) return true;
  const tokens = q.toLowerCase().split(/[\s,，、]+/).filter(Boolean);
  const t = title.toLowerCase();
  return tokens.some((k) => t.includes(k));
}

export function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const k1 = it.url && !/news\.google\.com/.test(it.url) ? it.url : null;
    // 標題去重（同日同標題，跨來源轉載）；官方申報各有唯一網址，不以標題去重
    const k2 = it.kind === 'filing' && k1 ? null : `${it.title.replace(/\s*-\s*[^-]{1,20}$/, '').replace(/\s+/g, '').toLowerCase()}|${it.publishedAt.slice(0, 10)}`;
    if ((k1 && seen.has(k1)) || (k2 && seen.has(k2))) continue;
    if (k1) seen.add(k1);
    if (k2) seen.add(k2);
    out.push(it);
  }
  return out;
}

/**
 * 最後一道 point-in-time 與區間過濾（純函式，可單元測試）：
 * publishedAt ≤ asOf 截止、市場當地日期在 [from, to]、等級 ≥ minTier、查詢字詞。
 */
export function finalizeItems(items: NewsItem[], p: { from: string; to: string; asOf?: string; tz: string; minTier: AuthorityTier; query?: string; queryFiltered?: Set<string> }): NewsItem[] {
  const pit = filterAsOf(items, p.asOf, p.tz);
  const inRange = pit.filter((it) => {
    const d = localDate(it.publishedAt, p.tz);
    return d >= p.from && d <= p.to;
  });
  const tiered = inRange.filter((it) => tierAtLeast(it.tier, p.minTier));
  const q = tiered.filter((it) => (p.queryFiltered?.has(it.provider) ? true : matchesQuery(it.title, p.query)));
  return dedupe(q)
    .map((it) => ({ ...it, sentiment: it.sentiment ?? scoreHeadline(it.title), tags: [...new Set([...(it.tags ?? []), ...tagHeadline(it.title)])] }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function searchNews(q: NewsQuery): Promise<NewsSearchResult> {
  const info = normalizeSymbol(q.symbol);
  if (!info) throw new Error(`無法辨識代號：${q.symbol}`);
  const tz = MARKET_TZ_OF[info.market];
  const asOf = q.asOf ?? new Date().toISOString();
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : localDate(asOf, tz);
  let to = q.to ?? asOfDate;
  if (to > asOfDate) to = asOfDate; // 不查詢 asOf 之後
  const from = q.from ?? addDays(to, -14);
  const minTier: AuthorityTier = q.officialOnly ? 'official' : q.minTier ?? 'trade';
  const limit = Math.min(100, Math.max(1, q.limit ?? 40));
  const sources: SourceStatus[] = [];
  const notes: string[] = [];
  const all: NewsItem[] = [];
  const queryFiltered = new Set<string>(['gdelt', 'sec-efts']);
  const wantNews = !q.officialOnly && q.includeGdelt !== false;

  const run = async (status: Omit<SourceStatus, 'ok' | 'count'>, fn: () => Promise<NewsItem[]>) => {
    try {
      const items = await fn();
      all.push(...items);
      sources.push({ ...status, ok: true, count: items.length });
    } catch (e) {
      sources.push({ ...status, ok: false, count: 0, error: errText(e) });
    }
  };

  const tasks: Promise<void>[] = [];
  if (info.market === 'TW' || info.market === 'TWO') {
    const code = info.code;
    const months = monthsBetween(from, to, q.maxMopsMonths ?? 3);
    if (monthsBetween(from, to, 999).length > months.length) notes.push(`公開資訊觀測站只查詢最近 ${months.length} 個月（${months[months.length - 1]} 起），更早請縮小區間。`);
    tasks.push(
      run({ name: '公開資訊觀測站 重大訊息（t05st01）', provider: 'mops', url: MOPS_T05ST01_PAGE }, async () => {
        const out: NewsItem[] = [];
        let firstErr: unknown = null;
        for (const ym of months) {
          try {
            out.push(...(await fetchMopsAnnouncements(code, ym)));
          } catch (e) {
            firstErr ??= e;
            if ((e as Error).name === 'MopsBlockedError') break;
          }
        }
        if (!out.length && firstErr) throw firstErr;
        return out;
      }),
    );
    if (to >= addDays(today(), -4) && info.market === 'TW') {
      tasks.push(run({ name: '臺灣證券交易所 OpenAPI 每日重大訊息', provider: 'twse-openapi', url: TWSE_OPENAPI_AP04, note: '只含最近一個交易日' }, () => fetchTwseDailyAnnouncements(code)));
    }
    if (!q.officialOnly) {
      tasks.push(
        run({ name: 'FinMind 個股新聞（TaiwanStockNews）', provider: 'finmind', url: 'https://finmindtrade.com/', note: '免費方案一次只回傳一天，逐日查詢' }, async () => {
          const r = await fetchFinMindNews(code, from, to, q.maxFinMindDays ?? 5);
          if (r.days.length && r.days[r.days.length - 1] > from) notes.push(`FinMind 新聞只查詢 ${r.days[r.days.length - 1]} ~ ${r.days[0]}（免費方案每次一天）。`);
          if (!r.items.length && r.errors.length) throw new Error(r.errors[0]);
          return r.items;
        }),
      );
    }
    if (wantNews) {
      const terms = q.query ? [q.query] : EN_ALIASES[code] ?? [lookupName(info.symbol) ?? code];
      tasks.push(run({ name: 'GDELT DOC 2.0（權威網域白名單）', provider: 'gdelt', url: GDELT_BASE, note: `涵蓋約 ${GDELT_COVERAGE_START} 起` }, () => fetchGdelt({ terms, from, to, symbol: info.symbol })));
    }
  } else {
    const ua = secUserAgent();
    if (!ua.configured) notes.push(SEC_UA_NOTE);
    const cikP = tickerToCik(info.code);
    tasks.push(
      run({ name: 'SEC EDGAR 申報（submissions）', provider: 'sec-edgar', url: 'https://www.sec.gov/edgar/search/' }, async () => {
        const c = await cikP;
        if (!c) throw new Error(`SEC 查無代號 ${info.code} 的 CIK`);
        const sub = await getSubmissions(c.cik, { from });
        return sub.filings.filter((f) => NEWSWORTHY_FORMS.has(f.form) && f.filingDate >= addDays(from, -1) && f.filingDate <= addDays(to, 1)).map((f) => filingToNews(f, info.symbol));
      }),
    );
    if (q.query) {
      tasks.push(
        run({ name: 'SEC EDGAR 全文檢索', provider: 'sec-efts', url: 'https://efts.sec.gov/LATEST/search-index' }, async () => {
          const c = await cikP;
          if (!c) return [];
          const r = await searchEfts({ q: q.query, ciks: [c.cik], startdt: from, enddt: to });
          return r.hits.map((h) => eftsHitToNews(h, info.symbol));
        }),
      );
    }
    if (wantNews) {
      tasks.push(
        run({ name: 'GDELT DOC 2.0（權威網域白名單）', provider: 'gdelt', url: GDELT_BASE, note: `涵蓋約 ${GDELT_COVERAGE_START} 起` }, async () => {
          const c = await cikP.catch(() => null);
          const name = c ? shortCompanyName(c.title) : '';
          const terms = q.query ? [q.query] : [name, info.code.length >= 3 ? info.code : ''].filter(Boolean);
          return fetchGdelt({ terms: terms.length ? terms : [info.code], from, to, symbol: info.symbol });
        }),
      );
    }
  }
  await Promise.all(tasks);
  if (from < GDELT_COVERAGE_START && wantNews) notes.push(`GDELT 新聞索引約自 ${GDELT_COVERAGE_START} 起；更早的期間只有官方公告。`);

  const items = finalizeItems(all, { from, to, asOf, tz, minTier, query: q.query, queryFiltered: q.query ? queryFiltered : undefined });
  const truncated = items.length > limit;
  const shown = items.slice(0, limit);
  return {
    symbol: info.symbol,
    market: info.market,
    from,
    to,
    asOf,
    query: q.query ?? null,
    minTier,
    total: items.length,
    truncated,
    items: shown,
    daily: aggregateDaily(items, (it) => localDate(it.publishedAt, tz)),
    sources,
    notes,
    sentimentLabel: SENTIMENT_LABEL,
    generatedAt: new Date().toISOString(),
  };
}
