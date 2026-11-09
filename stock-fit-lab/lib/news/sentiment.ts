/**
 * 透明的標題情緒分數（詞典法，粗略啟發式）。詞典與方法說明見 sentiment-lexicon.json。
 * 只看標題文字；不讀內文、不判斷語境。介面與 AI 必須把它標示為「粗略啟發式，相關不等於因果」。
 */
import lexicon from './sentiment-lexicon.json';
import type { SentimentScore } from './types';

export const SENTIMENT_LEXICON = lexicon;
export const SENTIMENT_LABEL = '標題情緒為詞典法粗略啟發式（只看標題、可能誤判），僅供參考，相關不等於因果';

interface Term {
  term: string;
  sign: 1 | -1;
}

const ZH_TERMS: Term[] = [...lexicon.positive.zh.map((t) => ({ term: t, sign: 1 as const })), ...lexicon.negative.zh.map((t) => ({ term: t, sign: -1 as const }))].sort((a, b) => b.term.length - a.term.length);
const EN_POS = new Set(lexicon.positive.en.map((w) => w.toLowerCase()));
const EN_NEG = new Set(lexicon.negative.en.map((w) => w.toLowerCase()));
const ZH_NEG = lexicon.negators.zh;
const EN_NEGATORS = new Set(lexicon.negators.en.map((w) => w.toLowerCase()));

function zhNegated(text: string, idx: number): boolean {
  const before = text.slice(Math.max(0, idx - 2), idx);
  return ZH_NEG.some((n) => before.includes(n));
}

/** 單一標題的情緒分數 */
export function scoreHeadline(title: string): SentimentScore {
  let pos = 0;
  let neg = 0;
  const matched: string[] = [];
  // 中文：最長詞優先，已命中的字元位置不再重複計算
  const used = new Array<boolean>(title.length).fill(false);
  for (const { term, sign } of ZH_TERMS) {
    let from = 0;
    for (;;) {
      const i = title.indexOf(term, from);
      if (i < 0) break;
      from = i + term.length;
      let overlap = false;
      for (let k = i; k < i + term.length; k++) if (used[k]) overlap = true;
      if (overlap) continue;
      for (let k = i; k < i + term.length; k++) used[k] = true;
      const s = zhNegated(title, i) ? -sign : sign;
      if (s > 0) pos++;
      else neg++;
      matched.push(s === sign ? term : `否定:${term}`);
    }
  }
  // 英文：完整單字
  const words = title.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
  words.forEach((w, i) => {
    const sign = EN_POS.has(w) ? 1 : EN_NEG.has(w) ? -1 : 0;
    if (!sign) return;
    const negated = EN_NEGATORS.has(words[i - 1] ?? '') || EN_NEGATORS.has(words[i - 2] ?? '');
    const s = negated ? -sign : sign;
    if (s > 0) pos++;
    else neg++;
    matched.push(negated ? `否定:${w}` : w);
  });
  const total = pos + neg;
  return { score: total ? Math.round(((pos - neg) / total) * 1000) / 1000 : 0, pos, neg, matched };
}

export interface DailySentiment {
  date: string;
  count: number;
  /** 當日標題分數平均（−1 ~ 1） */
  meanScore: number;
  pos: number;
  neg: number;
  /** Tetlock 風格媒體悲觀度：負向詞 / 命中詞總數（無命中詞為 null） */
  pessimism: number | null;
}

/** 依日期彙總（dateOf 決定每則屬於哪一天，通常為市場當地日期） */
export function aggregateDaily<T extends { title: string; sentiment?: SentimentScore }>(items: T[], dateOf: (it: T) => string): DailySentiment[] {
  const m = new Map<string, { n: number; sum: number; pos: number; neg: number }>();
  for (const it of items) {
    const s = it.sentiment ?? scoreHeadline(it.title);
    const d = dateOf(it);
    const e = m.get(d) ?? { n: 0, sum: 0, pos: 0, neg: 0 };
    e.n++;
    e.sum += s.score;
    e.pos += s.pos;
    e.neg += s.neg;
    m.set(d, e);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, e]) => ({ date, count: e.n, meanScore: Math.round((e.sum / e.n) * 1000) / 1000, pos: e.pos, neg: e.neg, pessimism: e.pos + e.neg ? Math.round((e.neg / (e.pos + e.neg)) * 1000) / 1000 : null }));
}

/** 標題標籤（總經 / 財報 / 方針 / 法說 / 股利…），供社會情境與方針篩選使用 */
const TAG_RULES: [string, RegExp][] = [
  ['macro', /Fed|FOMC|CPI|PPI|非農|升息|降息|利率|央行|通膨|inflation|interest rate|rate (?:hike|cut)|GDP|關稅|tariff|recession|衰退|失業率|payroll|美債|treasury/i],
  ['earnings', /財報|季報|年報|營收|EPS|每股盈餘|獲利|earnings|results|revenue|10-Q|10-K|2\.02/i],
  ['guidance', /展望|財測|指引|guidance|outlook|forecast|資本支出|capex|capital expenditure/i],
  ['dividend', /股利|配息|除息|除權|dividend|buyback|庫藏股|repurchase/i],
  ['conference', /法說|法人說明會|investor conference|earnings call|conference call/i],
  ['geopolitics', /地緣|戰爭|制裁|sanction|war|地震|earthquake|颱風|typhoon/i],
];

export function tagHeadline(title: string): string[] {
  return TAG_RULES.filter(([, re]) => re.test(title)).map(([t]) => t);
}
