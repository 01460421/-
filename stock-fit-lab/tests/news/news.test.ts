import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryLRU } from '@/lib/data-adapters/cache';
import { httpConfig } from '@/lib/data-adapters/http';
import { resetLimiters } from '@/lib/data-adapters/ratelimit';
import { setContextCache } from '@/lib/history/cache';
import { isMopsBlocked, MopsBlockedError, mopsConfig, parseMopsAnnouncements, parseMopsConferences, parseTwseAp04, fetchMopsAnnouncements } from '@/lib/news/mops';
import { parseFinMindNews } from '@/lib/news/finmind-news';
import { eftsHitToNews, filingToNews, parseEfts, parseSubmissions, tickerToCik } from '@/lib/news/sec';
import { buildGdeltQuery, fetchGdelt, gdeltConfig, gdeltDate, parseGdelt } from '@/lib/news/gdelt';
import { asOfCutoffMs, filterAsOf, localToIso, rocDateToIso, normalizeTime } from '@/lib/news/pit';
import { authorityForDomain, tierForSourceName } from '@/lib/news/authority';
import { finalizeItems, searchNews, shortCompanyName } from '@/lib/news';
import type { NewsItem } from '@/lib/news/types';
import * as fx from './fixtures';

const fetchMock = vi.fn();

beforeEach(() => {
  resetLimiters();
  setContextCache(new MemoryLRU(500));
  httpConfig.baseDelayMs = 1;
  mopsConfig.refillPerSec = 1000;
  mopsConfig.baseDelayMs = 1;
  gdeltConfig.refillPerSec = 1000;
  gdeltConfig.baseDelayMs = 1;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.SEC_USER_AGENT;
  delete process.env.FINMIND_TOKEN;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const item = (p: Partial<NewsItem> & { publishedAt: string }): NewsItem => ({ id: p.publishedAt + (p.title ?? ''), title: 't', url: null, source: 's', tier: 'official', kind: 'news', provider: 'mops', ...p });

describe('point-in-time 工具', () => {
  it('民國日期與時間正規化', () => {
    expect(rocDateToIso('113/01/18')).toBe('2024-01-18');
    expect(rocDateToIso('1130118')).toBe('2024-01-18');
    expect(normalizeTime('70003')).toBe('07:00:03');
    expect(normalizeTime('16:36')).toBe('16:36:00');
  });

  it('台北 / 紐約當地時間轉 UTC（含夏令時間）', () => {
    expect(localToIso('2024-01-18', '16:36:34', 'Asia/Taipei')).toBe('2024-01-18T08:36:34.000Z');
    expect(localToIso('2024-07-01', '16:00:00', 'America/New_York')).toBe('2024-07-01T20:00:00.000Z'); // EDT
    expect(localToIso('2024-01-02', '16:00:00', 'America/New_York')).toBe('2024-01-02T21:00:00.000Z'); // EST
  });

  it('asOf 為日期時以當地 23:59:59.999 為截止；之後發布者絕不出現', () => {
    const items = [
      item({ publishedAt: '2024-01-18T15:59:59.000Z', title: 'in' }), // 台北 1/18 23:59:59
      item({ publishedAt: '2024-01-18T16:00:01.000Z', title: 'out' }), // 台北 1/19 00:00:01
      item({ publishedAt: 'not-a-date', title: 'bad' }),
    ];
    const r = filterAsOf(items, '2024-01-18', 'Asia/Taipei');
    expect(r.map((x) => x.title)).toEqual(['in']);
    // 紐約：同一個 UTC 時間仍在 1/18 當天
    expect(filterAsOf(items, '2024-01-18', 'America/New_York').map((x) => x.title)).toEqual(['in', 'out']);
    // 精確 ISO 截止
    expect(filterAsOf(items, '2024-01-18T16:00:00Z').map((x) => x.title)).toEqual(['in']);
    expect(asOfCutoffMs('2024-01-18', 'Asia/Taipei')).toBe(Date.parse('2024-01-18T15:59:59.999Z'));
  });

  it('finalizeItems：過濾 asOf 之後、區間外、等級不足的項目，並附情緒分數', () => {
    const items = [
      item({ publishedAt: '2024-01-17T02:00:00Z', title: '台積電營收創新高', tier: 'major' }),
      item({ publishedAt: '2024-01-19T02:00:00Z', title: '未來新聞（asOf 之後）', tier: 'official' }),
      item({ publishedAt: '2024-01-10T02:00:00Z', title: '區間外', tier: 'official' }),
      item({ publishedAt: '2024-01-18T02:00:00Z', title: '聚合站轉載', tier: 'other' }),
    ];
    const r = finalizeItems(items, { from: '2024-01-15', to: '2024-01-20', asOf: '2024-01-18', tz: 'Asia/Taipei', minTier: 'trade' });
    expect(r.map((x) => x.title)).toEqual(['台積電營收創新高']);
    expect(r[0].sentiment!.score).toBe(1);
  });
});

describe('公開資訊觀測站 / TWSE OpenAPI 解析', () => {
  it('t05st01：解析主旨、時間（台北）、連結回 MOPS，不含說明全文', () => {
    const r = parseMopsAnnouncements(fx.mopsT05st01Html, '2330');
    expect(r).toHaveLength(3);
    expect(r[0].title).toBe('本公司代子公司 TSMC Global Ltd. 公告取得固定收益證券');
    expect(r[0].publishedAt).toBe('2024-01-18T08:36:34.000Z');
    expect(r[0].tier).toBe('official');
    expect(r[0].kind).toBe('disclosure');
    expect(r[0].url).toContain('mopsov.twse.com.tw/mops/web/t05st01');
    expect(r[1].title).toContain('&相關事宜'); // HTML entity 解碼
    expect(r[1].id).toContain(':1'); // seq_no
  });

  it('被網站防護阻擋時拋出 MopsBlockedError；查無資料回傳空陣列', () => {
    expect(isMopsBlocked(fx.mopsBlockedHtml)).toBe(true);
    expect(() => parseMopsAnnouncements(fx.mopsBlockedHtml, '2330')).toThrow(MopsBlockedError);
    expect(parseMopsAnnouncements(fx.mopsEmptyHtml, '2330')).toEqual([]);
  });

  it('fetchMopsAnnouncements：POST 正確表單（民國年 / 月）並快取', async () => {
    fetchMock.mockImplementation(async () => fx.textResponse(fx.mopsT05st01Html));
    const a = await fetchMopsAnnouncements('2330', '2024-01');
    const b = await fetchMopsAnnouncements('2330', '2024-01');
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://mopsov.twse.com.tw/mops/web/ajax_t05st01');
    expect(init.method).toBe('POST');
    expect(init.body).toContain('co_id=2330');
    expect(init.body).toContain('year=113');
    expect(init.body).toContain('month=01');
    expect(init.headers['User-Agent']).toMatch(/stock-fit-lab/);
  });

  it('法人說明會：日期、地點、簡報連結（絕對網址）', () => {
    const r = parseMopsConferences(fx.mopsConferenceHtml, '2330');
    expect(r).toHaveLength(1);
    expect(r[0].publishedAt.slice(0, 10)).toBe('2024-01-18');
    expect(r[0].title).toContain('台北君悅酒店');
    expect(r[0].url).toBe('https://mopsov.twse.com.tw/nas/STR/233020240118M001.pdf');
    expect(r[0].kind).toBe('conference');
  });

  it('TWSE OpenAPI t187ap04_L：「主旨 」欄名含空白、捨棄說明全文、依代號篩選', () => {
    const r = parseTwseAp04(fx.twseAp04, '2330');
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('本公司代子公司公告取得固定收益證券');
    expect(r[0].publishedAt).toBe('2024-01-18T08:36:34.000Z');
    expect(r[0].form).toBe('第20款');
    expect(JSON.stringify(r)).not.toContain('說明全文');
    expect(parseTwseAp04(fx.twseAp04)[1].publishedAt).toBe('2024-01-17T23:00:03.000Z');
  });
});

describe('FinMind 新聞 / 權威分級', () => {
  it('媒體名稱分級：經濟日報=major、中央社=wire、Yahoo 聚合=other', () => {
    const r = parseFinMindNews(fx.finmindNewsDay('2024-01-18').data, '2330');
    expect(r.map((x) => x.tier)).toEqual(['major', 'other', 'wire']);
    expect(r[0].publishedAt).toBe('2024-01-18T00:10:00.000Z');
    expect(r[0].url).toContain('news.google.com');
    expect(tierForSourceName('Reuters')).toBe('wire');
    expect(authorityForDomain('https://money.udn.com/money/story/1')?.tier).toBe('major');
    expect(authorityForDomain('asia.nikkei.com')?.name).toBe('Nikkei');
    expect(authorityForDomain('evil-reuters.com.example')).toBeNull();
  });
});

describe('SEC EDGAR 解析', () => {
  it('submissions：8-K items、acceptanceDateTime、連結', () => {
    const s = parseSubmissions(fx.secSubmissions);
    expect(s.cik).toBe('0000320193');
    expect(s.filings).toHaveLength(5);
    const k = s.filings[1];
    expect(k.form).toBe('8-K');
    expect(k.items).toEqual(['2.02', '9.01']);
    expect(k.acceptedAt).toBe('2024-05-02T20:30:21.000Z');
    expect(k.url).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019324000067/aapl-20240502.htm');
    expect(k.indexUrl).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019324000067/');
    const n = filingToNews(k, 'AAPL');
    expect(n.title).toContain('2.02 營運成果與財務狀況');
    expect(n.tier).toBe('official');
  });

  it('全文檢索：由 _id 組出附件網址', () => {
    const r = parseEfts(fx.eftsResponse);
    expect(r.total).toBe(2);
    expect(r.hits[0].url).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019324000005/a8-kex991q1202412302023.htm');
    expect(r.hits[0].fileType).toBe('EX-99.1');
    const n = eftsHitToNews(r.hits[0], 'AAPL');
    expect(n.dateOnly).toBe(true);
    expect(n.publishedAt).toBe('2024-02-02T04:59:59.000Z');
  });

  it('ticker → CIK 帶 SEC_USER_AGENT（未設定時用通用 UA）', async () => {
    fetchMock.mockImplementation(async () => fx.jsonResponse(fx.secTickers));
    expect(await tickerToCik('aapl')).toEqual({ cik: '0000320193', title: 'Apple Inc.' });
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toBe('stock-fit-lab research');
    setContextCache(new MemoryLRU(10));
    process.env.SEC_USER_AGENT = 'StockFitLab admin@example.com';
    await tickerToCik('NVDA');
    expect(fetchMock.mock.calls[1][1].headers['User-Agent']).toBe('StockFitLab admin@example.com');
  });

  it('公司名稱精簡', () => {
    expect(shortCompanyName('Apple Inc.')).toBe('Apple');
    expect(shortCompanyName('NVIDIA CORP')).toBe('NVIDIA');
  });
});

describe('GDELT', () => {
  it('查詢字串：詞彙 OR + 網域白名單', () => {
    expect(buildGdeltQuery(['TSMC', 'Taiwan Semiconductor'], ['reuters.com', 'ft.com'])).toBe('(TSMC OR "Taiwan Semiconductor") (domain:reuters.com OR domain:ft.com)');
    expect(gdeltDate('20240118T063000Z')).toBe('2024-01-18T06:30:00.000Z');
  });

  it('只保留白名單網域並標示等級', () => {
    const r = parseGdelt(fx.gdeltArticles, '2330.TW');
    expect(r.map((x) => x.domain)).toEqual(['reuters.com', 'asia.nikkei.com', 'reuters.com']);
    expect(r[0].tier).toBe('wire');
    expect(r[1].tier).toBe('major');
  });

  it('429 時退避重試並快取結果', async () => {
    let n = 0;
    fetchMock.mockImplementation(async () => (n++ === 0 ? fx.textResponse('Please limit requests to one every 5 seconds', 429) : fx.jsonResponse(fx.gdeltArticles)));
    const r = await fetchGdelt({ terms: ['TSMC'], from: '2024-01-15', to: '2024-01-20' });
    expect(r).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await fetchGdelt({ terms: ['TSMC'], from: '2024-01-15', to: '2024-01-20' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('2017 年以前不查詢（超出涵蓋範圍）', async () => {
    expect(await fetchGdelt({ terms: ['TSMC'], from: '2010-01-01', to: '2012-01-01' })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('searchNews 整合（point-in-time）', () => {
  it('台股：合併 MOPS / FinMind / GDELT，asOf 之後的項目一律不出現', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('ajax_t05st01')) return fx.textResponse(fx.mopsT05st01Html);
      if (url.includes('TaiwanStockNews')) {
        const d = /start_date=([\d-]+)/.exec(url)![1];
        return fx.jsonResponse(fx.finmindNewsDay(d));
      }
      if (url.includes('gdeltproject')) return fx.jsonResponse(fx.gdeltArticles);
      return fx.textResponse('not found', 404);
    });
    const r = await searchNews({ symbol: '2330', from: '2024-01-15', to: '2024-01-25', asOf: '2024-01-18', minTier: 'trade' });
    expect(r.to).toBe('2024-01-18'); // to 被截到 asOf
    const cutoff = Date.parse('2024-01-18T15:59:59.999Z');
    expect(r.items.length).toBeGreaterThan(0);
    for (const it of r.items) expect(Date.parse(it.publishedAt)).toBeLessThanOrEqual(cutoff);
    expect(r.items.some((x) => x.title.includes('法人說明會'))).toBe(false); // 1/30 公告
    expect(r.items.some((x) => x.title.includes('after asOf'))).toBe(false);
    expect(r.items.some((x) => x.source === 'Yahoo奇摩股市')).toBe(false); // 低於 trade 等級
    expect(r.items.some((x) => x.provider === 'mops')).toBe(true);
    expect(r.items.some((x) => x.provider === 'gdelt')).toBe(true);
    // FinMind 只對需要的日期逐日查詢（start_date 單日、無 end_date）
    const fmCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('TaiwanStockNews'));
    expect(fmCalls.length).toBeLessThanOrEqual(5);
    for (const u of fmCalls) expect(u).not.toContain('end_date');
    expect(r.sources.find((s) => s.provider === 'mops')?.ok).toBe(true);
    expect(r.daily.length).toBeGreaterThan(0);
  });

  it('美股：SEC 申報在 asOf 之後者不出現；Form 4 不列為新聞', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('company_tickers')) return fx.jsonResponse(fx.secTickers);
      if (url.includes('submissions/CIK0000320193')) return fx.jsonResponse(fx.secSubmissions);
      if (url.includes('gdeltproject')) return fx.jsonResponse({ articles: [] });
      return fx.textResponse('nf', 404);
    });
    const r = await searchNews({ symbol: 'AAPL', from: '2024-01-15', to: '2024-05-31', asOf: '2024-05-02', officialOnly: true });
    const forms = r.items.map((x) => x.form);
    expect(forms).toEqual(['8-K', '10-Q', '8-K']);
    expect(r.items.some((x) => x.publishedAt.startsWith('2024-05-03'))).toBe(false);
    expect(r.notes.join()).toContain('SEC_USER_AGENT');
  });
});
