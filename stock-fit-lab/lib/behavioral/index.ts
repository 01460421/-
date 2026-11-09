/**
 * 心理與社會指標（point-in-time）：getBehavioralIndicators(symbol, { asOf }) 只用 asOf 當時已知的資料。
 *  - 行情類（52 週高點、注意力、過度反應、動能）：getLongHistory(symbol, { to: asOf })
 *  - 台股融資 / 法人：FinMind TaiwanStockMarginPurchaseShortSale（含融資限額）、getDataset('institutional')
 *  - 恐慌：^VIX（getLongHistory）；台股另偵測 TAIFEX 選擇權資料集（getDataset(symbol, 'options')，不存在時降級）
 *  - 媒體：searchNews（asOf 前 7 日；權威來源標題數 + 詞典法語氣）
 *  - 市場情緒代理：^TWII / ^GSPC + ^VIX
 *  - 行事曆：lib/calendar 休市日、財報期限、getEvents
 */
import type { Bar, Market } from '../types';
import type { DatasetId } from '../data-adapters/types';
import { addDays } from '../calendar';
import { getMarketData, normalizeSymbol } from '../data-adapters';
import { finmindRequest } from '../data-adapters/finmind';
import { cached } from '../history/cache';
import { getLongHistory } from '../history';
import { searchNews } from '../news';
import { localDate, MARKET_TZ_OF } from '../news/pit';
import {
  abnormalVolume,
  CAVEAT,
  high52,
  marketSentimentProxy,
  mediaReading,
  META,
  momentum12_1,
  overreactionZ,
  putCallFromRows,
  retailLeverage,
  unavailable,
  vixGauge,
  type IndicatorReading,
  type InstRow,
  type MarginRow,
} from './indicators';
import { calendarContext, type CalendarEvent } from './calendar-context';

export * from './indicators';
export { calendarContext, nextTwDeadline, inUsEarningsSeason, isQuarterEndWindow, nearestHoliday } from './calendar-context';

export interface BehavioralResult {
  symbol: string;
  market: Market;
  asOf: string;
  indicators: IndicatorReading[];
  macroHeadlines: { title: string; url: string | null; publishedAt: string; source: string; tags: string[] }[];
  notes: string[];
  caveat: string;
  generatedAt: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function barsTo(symbol: string, asOf: string): Promise<{ bars: Bar[]; source: string } | null> {
  try {
    const h = await getLongHistory(symbol, { to: asOf });
    return { bars: h.bars, source: h.source };
  } catch {
    return null;
  }
}

async function twMargin(code: string, asOf: string): Promise<MarginRow[]> {
  return cached(`ctx:beh:margin:v1:${code}:${asOf}`, asOf < todayIso() ? 7 * 86400 : 3600, async () => {
    const rows = await finmindRequest<Record<string, unknown>>('TaiwanStockMarginPurchaseShortSale', { data_id: code, start_date: addDays(asOf, -60), end_date: asOf });
    return rows
      .filter((r) => typeof r.date === 'string' && (r.date as string) <= asOf)
      .map((r) => ({ date: String(r.date).slice(0, 10), balance: typeof r.MarginPurchaseTodayBalance === 'number' ? r.MarginPurchaseTodayBalance : Number(r.MarginPurchaseTodayBalance) || null, limit: typeof r.MarginPurchaseLimit === 'number' ? r.MarginPurchaseLimit : Number(r.MarginPurchaseLimit) || null }));
  });
}

export async function getBehavioralIndicators(symbol: string, opts: { asOf?: string; includeNews?: boolean } = {}): Promise<BehavioralResult> {
  const info = normalizeSymbol(symbol);
  if (!info) throw new Error(`無法辨識代號：${symbol}`);
  const asOf = (opts.asOf ?? todayIso()).slice(0, 10);
  const market = info.market;
  const tw = market !== 'US';
  const md = getMarketData();
  const notes: string[] = [];

  const [own, vix, index] = await Promise.all([barsTo(info.symbol, asOf), barsTo('^VIX', asOf), barsTo(tw ? '^TWII' : '^GSPC', asOf)]);
  const ownSrc = own ? [{ name: own.source, asOf: own.bars.at(-1)?.date ?? null }] : [];
  const indicators: IndicatorReading[] = [];
  if (own?.bars.length) {
    indicators.push(high52(own.bars, ownSrc), abnormalVolume(own.bars, ownSrc), overreactionZ(own.bars, ownSrc), momentum12_1(own.bars, ownSrc));
  } else {
    for (const m of [META.high52, META.attention, META.overreaction, META.momentum]) indicators.push(unavailable(m, '無法取得行情'));
  }

  // 台股：融資 vs 法人
  if (tw) {
    try {
      const [margin, inst] = await Promise.all([
        twMargin(info.code, asOf),
        md.getDataset(info.symbol, 'institutional', { start: addDays(asOf, -45), end: asOf }).then((t) =>
          t.rows.filter((r) => typeof r.date === 'string' && (r.date as string) <= asOf).map((r): InstRow => ({ date: String(r.date), total: typeof r.total === 'number' ? r.total : null, foreign: typeof r.foreign === 'number' ? r.foreign : null })),
        ),
      ]);
      indicators.push(retailLeverage(margin, inst, [{ name: 'FinMind 融資融券（含融資限額）', asOf: margin.at(-1)?.date }, { name: 'FinMind 三大法人買賣超', asOf: inst.at(-1)?.date }]));
    } catch (e) {
      indicators.push(unavailable(META.retailLeverage, `融資 / 法人資料取得失敗：${(e as Error).message.slice(0, 100)}`));
    }
  }

  // 恐慌：VIX（美股主指標；台股作為全球風險參考）＋ 台股選擇權 P/C（若資料集存在）
  const vixSrc = vix ? [{ name: `^VIX（${vix.source}）`, asOf: vix.bars.at(-1)?.date ?? null }] : [];
  const fear = vix?.bars.length ? vixGauge(vix.bars, vixSrc) : unavailable(META.fear, '無法取得 ^VIX');
  if (tw) {
    try {
      const t = await md.getDataset(info.symbol, 'options' as DatasetId, { start: addDays(asOf, -10), end: asOf });
      const pc = t.unavailableReason ? null : putCallFromRows(t.rows.filter((r) => !r.date || String(r.date) <= asOf));
      if (pc) {
        fear.details = { ...(fear.details ?? {}), putCallRatio: pc.pcr, putCallDate: pc.date, putCallColumn: pc.column };
        fear.sources = [...fear.sources, { name: `選擇權 P/C（${t.source}）`, asOf: pc.date }];
        fear.reading += `；台指選擇權 P/C ${pc.pcr}（${pc.date}）`;
      } else {
        fear.details = { ...(fear.details ?? {}), putCallRatio: null };
        notes.push(`台指選擇權 Put/Call ratio 目前不可用${t.unavailableReason ? `（${t.unavailableReason.slice(0, 60)}）` : ''}；以 VIX 作為全球風險參考。`);
      }
    } catch {
      notes.push('台指選擇權 Put/Call ratio 資料集不存在；以 VIX 作為全球風險參考。');
    }
  }
  indicators.push(fear);

  // 媒體注意力與語氣
  let macroHeadlines: BehavioralResult['macroHeadlines'] = [];
  if (opts.includeNews !== false) {
    try {
      const from = addDays(asOf, -6);
      const n = await searchNews({ symbol: info.symbol, from, to: asOf, asOf, maxFinMindDays: 3, maxMopsMonths: 1, limit: 100 });
      const scored = n.items.filter((i) => i.sentiment);
      const tot = scored.reduce((s, i) => s + i.sentiment!.pos + i.sentiment!.neg, 0);
      const neg = scored.reduce((s, i) => s + i.sentiment!.neg, 0);
      indicators.push(
        mediaReading(
          { count: n.total, meanScore: scored.length ? scored.reduce((s, i) => s + i.sentiment!.score, 0) / scored.length : null, pessimism: tot ? neg / tot : null, from, to: asOf },
          n.sources.filter((s) => s.ok).map((s) => ({ name: s.name, url: s.url, asOf })),
        ),
      );
      macroHeadlines = n.items
        .filter((i) => i.tags?.some((t) => t === 'macro' || t === 'geopolitics'))
        .slice(0, 5)
        .map((i) => ({ title: i.title, url: i.url, publishedAt: i.publishedAt, source: i.source, tags: i.tags ?? [] }));
    } catch (e) {
      indicators.push(unavailable(META.media, `新聞查詢失敗：${(e as Error).message.slice(0, 100)}`));
    }
  } else indicators.push(unavailable(META.media, '此次查詢未包含新聞'));

  // 市場整體情緒代理
  indicators.push(index?.bars.length ? marketSentimentProxy({ indexBars: index.bars, vixBars: vix?.bars }, [{ name: `${tw ? '^TWII' : '^GSPC'}（${index.source}）`, asOf: index.bars.at(-1)?.date }, ...vixSrc]) : unavailable(META.marketSentiment, '無法取得大盤指數行情'));

  // 行事曆情境
  let events: CalendarEvent[] = [];
  try {
    events = (await md.getEvents(info.symbol, { start: addDays(asOf, -60), end: addDays(asOf, 60) })).map((e) => ({ date: e.date, type: e.type, title: e.title, source: e.source }));
  } catch {
    events = [];
  }
  indicators.push(calendarContext({ market, asOf, today: localDate(new Date().toISOString(), MARKET_TZ_OF[market]), events, macroHeadlines }));

  return { symbol: info.symbol, market, asOf, indicators, macroHeadlines, notes, caveat: CAVEAT, generatedAt: new Date().toISOString() };
}
