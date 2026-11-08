/**
 * 事件對映：偵測結果若落在事件日（財報、除權息、法說會…）前後 ±tolerance 個交易日內，標記 overlapsEvent。
 * 交易日距離以序列中的 K 棒位置計算；事件若落在非交易日，對應到其後第一根 K 棒；
 * 事件晚於最後一根 K 棒時視為「下一個交易日」。
 */
import type { Bar, DetectorHit } from '../types';
import type { CorporateEvent } from '../data-adapters/types';

const TYPE_LABEL: Record<CorporateEvent['type'], string> = {
  earnings: '財報',
  dividend: '除權息',
  split: '分割',
  conference: '法說會',
  announcement: '重大訊息',
};

/** 第一個 date ≥ target 的 K 棒索引（找不到回傳 bars.length） */
export function barIndexOnOrAfter(bars: Bar[], date: string): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function describeEvent(e: CorporateEvent): string {
  return `${e.date} ${TYPE_LABEL[e.type] ?? e.type}：${e.title}`;
}

export function markEventOverlap(hits: DetectorHit[], bars: Bar[], events: CorporateEvent[], toleranceDays = 1): DetectorHit[] {
  if (!events.length || !bars.length) return hits;
  const evIdx = events
    .filter((e) => e && typeof e.date === 'string')
    .map((e) => ({ e, idx: barIndexOnOrAfter(bars, e.date) }))
    // 早於序列起點的事件不比對
    .filter(({ e }) => e.date >= bars[0].date);
  return hits.map((h) => {
    const matches = evIdx.filter(({ idx }) => Math.abs(idx - h.index) <= toleranceDays);
    if (!matches.length) return h;
    matches.sort((a, b) => Math.abs(a.idx - h.index) - Math.abs(b.idx - h.index));
    return { ...h, overlapsEvent: matches.map(({ e }) => describeEvent(e)).join('；') };
  });
}
