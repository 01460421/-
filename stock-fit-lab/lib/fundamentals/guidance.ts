/**
 * 公司「方針」（展望 / 資本支出 / 股利政策 / 財報新聞稿）的官方出處清單——只回傳連結 + 標題 + 日期 + 章節，
 * 絕不轉述或摘要其中的財測數字（非結構化文字不得被 AI 轉成數字）。
 *  台股：公開資訊觀測站 重大訊息（主旨含 展望 / 資本支出 / 股利政策 / 財測…）、法人說明會（t100sb02_1）
 *  美股：SEC 8-K Item 2.02（財報新聞稿）、7.01（Reg FD 揭露）、8.01（其他事件），附 Exhibit 99 連結（EDGAR 全文檢索可得時）
 */
import { addDays } from '../calendar';
import { normalizeSymbol } from '../data-adapters';
import { fetchMopsAnnouncements, fetchMopsConferences, GUIDANCE_KEYWORDS_ZH, MOPS_T05ST01_PAGE, MOPS_T100SB02_PAGE } from '../news/mops';
import { filterAsOf, localDate, MARKET_TZ_OF } from '../news/pit';
import { EIGHT_K_ITEMS, getSubmissions, searchEfts, SEC_UA_NOTE, secUserAgent, tickerToCik } from '../news/sec';
import type { SourceStatus } from '../news/types';

export interface GuidanceItem {
  date: string;
  publishedAt: string;
  title: string;
  section: string;
  url: string | null;
  exhibits: { label: string; url: string }[];
  source: string;
  form?: string;
  items?: string[];
}

export interface GuidanceResult {
  symbol: string;
  from: string;
  to: string;
  asOf: string;
  items: GuidanceItem[];
  sources: SourceStatus[];
  notes: string[];
}

const SECTION_BY_ITEM: Record<string, string> = { '2.02': '財報新聞稿（8-K Item 2.02）', '7.01': 'Reg FD 揭露（8-K Item 7.01）', '8.01': '其他事件（8-K Item 8.01）' };

function months(from: string, to: string, max: number): string[] {
  const out: string[] = [];
  let y = Number(to.slice(0, 4));
  let m = Number(to.slice(5, 7));
  while (out.length < max) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    if (ym < from.slice(0, 7)) break;
    out.push(ym);
    m--;
    if (!m) {
      m = 12;
      y--;
    }
  }
  return out;
}

export function guidanceSectionZh(title: string): string {
  if (/法人說明會|法說/.test(title)) return '法人說明會相關公告';
  if (/資本支出|資本預算|擴產|投資計畫/.test(title)) return '資本支出 / 投資計畫';
  if (/股利|盈餘分配|配息/.test(title)) return '股利政策';
  if (/展望|財測|財務預測|營運計畫/.test(title)) return '營運展望 / 財測';
  return '其他方針相關公告';
}

export async function getGuidance(symbol: string, opts: { from?: string; to?: string; asOf?: string } = {}): Promise<GuidanceResult> {
  const info = normalizeSymbol(symbol);
  if (!info) throw new Error(`無法辨識代號：${symbol}`);
  const tz = MARKET_TZ_OF[info.market];
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const asOfDate = asOf.slice(0, 10);
  const to = opts.to && opts.to < asOfDate ? opts.to : asOfDate;
  const from = opts.from ?? addDays(to, -365);
  const sources: SourceStatus[] = [];
  const notes: string[] = ['方針內容請點連結閱讀原文；系統只列出處，不轉述其中的數字。'];
  let items: GuidanceItem[] = [];

  if (info.market === 'US') {
    if (!secUserAgent().configured) notes.push(SEC_UA_NOTE);
    try {
      const c = await tickerToCik(info.code);
      if (!c) throw new Error(`SEC 查無 ${info.code} 的 CIK`);
      const sub = await getSubmissions(c.cik, { from });
      const eight = sub.filings.filter((f) => f.form.startsWith('8-K') && f.filingDate >= from && f.filingDate <= to && f.items.some((i) => SECTION_BY_ITEM[i]));
      // Exhibit 99 連結（EDGAR 全文檢索；失敗時只給申報索引頁，索引頁內列有所有附件）
      const exhibits = new Map<string, { label: string; url: string }[]>();
      if (eight.length) {
        try {
          const r = await searchEfts({ ciks: [c.cik], forms: ['8-K'], startdt: from, enddt: to });
          for (const h of r.hits) {
            if (!/^EX-99/i.test(h.fileType)) continue;
            exhibits.set(h.adsh, [...(exhibits.get(h.adsh) ?? []), { label: h.fileType, url: h.url }]);
          }
          sources.push({ name: 'SEC EDGAR 全文檢索（Exhibit 99）', provider: 'sec-efts', ok: true, count: r.hits.length, url: 'https://efts.sec.gov/LATEST/search-index' });
        } catch (e) {
          sources.push({ name: 'SEC EDGAR 全文檢索（Exhibit 99）', provider: 'sec-efts', ok: false, count: 0, error: (e as Error).message.slice(0, 160) });
        }
      }
      items = eight.map((f) => {
        const main = f.items.find((i) => SECTION_BY_ITEM[i])!;
        return {
          date: f.filingDate,
          publishedAt: f.acceptedAt,
          title: `${f.form}：${f.items.map((i) => `${i} ${EIGHT_K_ITEMS[i] ?? ''}`.trim()).join('；')}`,
          section: SECTION_BY_ITEM[main],
          url: f.url,
          exhibits: [...(exhibits.get(f.accessionNumber) ?? []), { label: '申報索引（含所有附件）', url: f.indexUrl }],
          source: 'SEC EDGAR',
          form: f.form,
          items: f.items,
        };
      });
      sources.push({ name: 'SEC EDGAR 8-K（2.02 / 7.01 / 8.01）', provider: 'sec-edgar', ok: true, count: items.length, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.cik}&type=8-K` });
    } catch (e) {
      sources.push({ name: 'SEC EDGAR 8-K', provider: 'sec-edgar', ok: false, count: 0, error: (e as Error).message.slice(0, 160) });
    }
  } else {
    const code = info.code;
    try {
      const ms = months(from, to, 6);
      const all = [];
      let firstErr: unknown = null;
      for (const ym of ms) {
        try {
          all.push(...(await fetchMopsAnnouncements(code, ym)));
        } catch (e) {
          firstErr ??= e;
          if ((e as Error).name === 'MopsBlockedError') break;
        }
      }
      if (!all.length && firstErr) throw firstErr;
      const hits = all.filter((n) => GUIDANCE_KEYWORDS_ZH.test(n.title));
      items.push(
        ...hits.map((n) => ({ date: localDate(n.publishedAt, tz), publishedAt: n.publishedAt, title: n.title, section: guidanceSectionZh(n.title), url: n.url, exhibits: [], source: n.source })),
      );
      sources.push({ name: '公開資訊觀測站 重大訊息（方針關鍵字）', provider: 'mops', ok: true, count: hits.length, url: MOPS_T05ST01_PAGE, note: `查詢 ${ms[ms.length - 1]} ~ ${ms[0]}` });
    } catch (e) {
      sources.push({ name: '公開資訊觀測站 重大訊息', provider: 'mops', ok: false, count: 0, url: MOPS_T05ST01_PAGE, error: (e as Error).message.slice(0, 160) });
    }
    const years = [...new Set([Number(to.slice(0, 4)), Number(from.slice(0, 4))])];
    for (const y of years) {
      try {
        const confs = await fetchMopsConferences(code, y);
        items.push(...confs.map((n) => ({ date: localDate(n.publishedAt, tz), publishedAt: n.publishedAt, title: n.title, section: '法人說明會', url: n.url, exhibits: n.url ? [{ label: '簡報 / 影音', url: n.url }] : [], source: n.source })));
        sources.push({ name: `公開資訊觀測站 法人說明會（${y}）`, provider: 'mops', ok: true, count: confs.length, url: MOPS_T100SB02_PAGE });
      } catch (e) {
        sources.push({ name: `公開資訊觀測站 法人說明會（${y}）`, provider: 'mops', ok: false, count: 0, url: MOPS_T100SB02_PAGE, error: (e as Error).message.slice(0, 160) });
      }
    }
  }
  // point-in-time + 區間
  items = filterAsOf(items, asOf, tz)
    .filter((i) => i.date >= from && i.date <= to)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 40);
  return { symbol: info.symbol, from, to, asOf, items, sources, notes };
}
