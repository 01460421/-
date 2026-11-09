/**
 * FinMind TaiwanStockNews（公開 API；免費方案每次請求只回傳「一天」：start_date=YYYY-MM-DD 且不帶 end_date）。
 * 因此只對「需要的日期」逐日查詢（預設最多 5 天），共用 FinMind 速率限制器（finmindRequest 內建），
 * 過去日期快取 30 天、當日 15 分鐘。只保留標題、來源、時間與連結（不取全文）。
 */
import { finmindRequest } from '../data-adapters/finmind';
import { addDays } from '../calendar';
import { cached, isPastDate } from '../history/cache';
import { tierForSourceName } from './authority';
import { localToIso } from './pit';
import type { NewsItem } from './types';

export interface FinMindNewsRow {
  date: string; // 'YYYY-MM-DD HH:MM:SS'（台北時間）
  stock_id: string;
  link: string;
  source: string;
  title: string;
  description?: string;
}

export function parseFinMindNews(rows: FinMindNewsRow[], code: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const r of rows ?? []) {
    if (!r?.title || typeof r.date !== 'string') continue;
    const d = r.date.slice(0, 10);
    const t = /\d{2}:\d{2}:\d{2}/.exec(r.date)?.[0];
    // 標題常帶「 - 媒體名」尾綴：保留原始標題（不改寫），來源另列
    const title = r.title.replace(/\s+/g, ' ').trim().slice(0, 200);
    const sourceName = (r.source || title.split(' - ').pop() || 'FinMind').trim();
    out.push({
      id: `finmind:${code}:${r.date}:${title.slice(0, 24)}`,
      title,
      url: r.link || null,
      source: sourceName,
      publishedAt: localToIso(d, t ?? '23:59:59', 'Asia/Taipei'),
      dateOnly: !t,
      tier: tierForSourceName(sourceName),
      kind: 'news',
      provider: 'finmind',
      symbol: code,
    });
  }
  return out;
}

export async function fetchFinMindNewsDay(code: string, date: string): Promise<NewsItem[]> {
  return cached(`ctx:finmind:news:v1:${code}:${date}`, isPastDate(date) ? 30 * 86400 : 900, async () => {
    const rows = await finmindRequest<FinMindNewsRow>('TaiwanStockNews', { data_id: code, start_date: date });
    // FinMind 偶爾回傳鄰近日期的資料：只保留該日
    return parseFinMindNews(
      rows.filter((r) => typeof r?.date === 'string' && r.date.slice(0, 10) === date),
      code,
    );
  }, 90 * 86400);
}

/** 由 to 往回逐日查詢（最多 maxDays 天、不早於 from）；單日失敗不影響其他日 */
export async function fetchFinMindNews(code: string, from: string, to: string, maxDays = 5): Promise<{ items: NewsItem[]; days: string[]; errors: string[] }> {
  const days: string[] = [];
  for (let d = to; d >= from && days.length < maxDays; d = addDays(d, -1)) days.push(d);
  const items: NewsItem[] = [];
  const errors: string[] = [];
  for (const d of days) {
    try {
      items.push(...(await fetchFinMindNewsDay(code, d)));
    } catch (e) {
      errors.push(`${d}: ${e instanceof Error ? e.message : String(e)}`);
      if (/upper limit|429|402/i.test(String(e))) break; // 配額用盡：不再繼續
    }
  }
  return { items, days, errors };
}
