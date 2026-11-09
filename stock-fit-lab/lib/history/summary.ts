/**
 * 長期（上市以來）日線的精簡摘要：純函式，輸入 Bar[]（日期遞增），只用到 ≤ asOf 的資料。
 *
 * 報酬一律以還原價（adjClose ?? close）計算——除權息 / 分割在除權息日當天即為公開資訊，
 * 以還原價計算的日報酬不含前視資訊；價格「水準」（歷史高低點）則同時提供原始價。
 */
import type { Bar } from '../types';
import { pelt } from '../detectors/pelt';
import { fitHmm } from '../detectors/hmm';

export const px = (b: Bar): number => (b.adjClose != null && Number.isFinite(b.adjClose) && b.adjClose > 0 ? b.adjClose : b.close);

export function round(x: number | null | undefined, d = 4): number | null {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

function std(a: number[]): number {
  if (a.length < 2) return NaN;
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

/** 只保留 [from, to] 內、價格有效的 K 棒 */
export function clipBars(bars: Bar[], from?: string, to?: string): Bar[] {
  return bars.filter((b) => (!from || b.date >= from) && (!to || b.date <= to) && Number.isFinite(b.close) && b.close > 0);
}

export interface DrawdownResult {
  maxDrawdownPct: number; // 負值，例如 -35.2
  peakDate: string | null;
  troughDate: string | null;
}

/** 最大回撤（以還原價） */
export function maxDrawdown(bars: Bar[]): DrawdownResult {
  let peak = -Infinity;
  let peakDate: string | null = null;
  let best = 0;
  let bp: string | null = null;
  let bt: string | null = null;
  for (const b of bars) {
    const p = px(b);
    if (p > peak) {
      peak = p;
      peakDate = b.date;
    }
    const dd = p / peak - 1;
    if (dd < best) {
      best = dd;
      bp = peakDate;
      bt = b.date;
    }
  }
  return { maxDrawdownPct: round(best * 100, 2) ?? 0, peakDate: bp, troughDate: bt };
}

export interface YearStat {
  year: number;
  from: string;
  to: string;
  bars: number;
  /** 年度報酬（%）：以前一年最後收盤為基準；第一年以當年第一筆為基準 */
  returnPct: number | null;
  /** 年化波動（%）= std(日對數報酬) × √252 */
  volPct: number | null;
  maxDrawdownPct: number;
  high: number | null;
  low: number | null;
  partial: boolean;
}

export function yearlyStats(bars: Bar[]): YearStat[] {
  const byYear = new Map<number, Bar[]>();
  for (const b of bars) {
    const y = Number(b.date.slice(0, 4));
    const arr = byYear.get(y) ?? [];
    arr.push(b);
    byYear.set(y, arr);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const out: YearStat[] = [];
  let prevLast: Bar | null = null;
  const lastDate = bars.length ? bars[bars.length - 1].date : '';
  for (const y of years) {
    const ys = byYear.get(y)!;
    const base = prevLast ?? ys[0];
    const last = ys[ys.length - 1];
    const seq = prevLast ? [prevLast, ...ys] : ys;
    const lr: number[] = [];
    for (let i = 1; i < seq.length; i++) lr.push(Math.log(px(seq[i]) / px(seq[i - 1])));
    out.push({
      year: y,
      from: ys[0].date,
      to: last.date,
      bars: ys.length,
      returnPct: round((px(last) / px(base) - 1) * 100, 2),
      volPct: lr.length >= 5 ? round(std(lr) * Math.sqrt(252) * 100, 2) : null,
      maxDrawdownPct: maxDrawdown(seq).maxDrawdownPct,
      high: round(Math.max(...ys.map((b) => b.high || b.close)), 4),
      low: round(Math.min(...ys.map((b) => b.low || b.close)), 4),
      partial: !prevLast || (last.date === lastDate && last.date.slice(5) < '12-24'),
    });
    prevLast = last;
  }
  return out;
}

export interface Extremes {
  allTimeHigh: { price: number; date: string } | null;
  allTimeLow: { price: number; date: string } | null;
  adjustedHigh: { price: number; date: string } | null;
  adjustedLow: { price: number; date: string } | null;
  lastClose: number | null;
  /** 最新收盤距歷史高點（還原價）百分比 */
  fromAdjustedHighPct: number | null;
}

export function extremes(bars: Bar[]): Extremes {
  if (!bars.length) return { allTimeHigh: null, allTimeLow: null, adjustedHigh: null, adjustedLow: null, lastClose: null, fromAdjustedHighPct: null };
  let hi = bars[0];
  let lo = bars[0];
  let ahi = bars[0];
  let alo = bars[0];
  for (const b of bars) {
    if ((b.high || b.close) > (hi.high || hi.close)) hi = b;
    if ((b.low || b.close) < (lo.low || lo.close)) lo = b;
    if (px(b) > px(ahi)) ahi = b;
    if (px(b) < px(alo)) alo = b;
  }
  const last = bars[bars.length - 1];
  return {
    allTimeHigh: { price: round(hi.high || hi.close)!, date: hi.date },
    allTimeLow: { price: round(lo.low || lo.close)!, date: lo.date },
    adjustedHigh: { price: round(px(ahi))!, date: ahi.date },
    adjustedLow: { price: round(px(alo))!, date: alo.date },
    lastClose: round(last.close),
    fromAdjustedHighPct: round((px(last) / px(ahi) - 1) * 100, 2),
  };
}

export interface BigMove {
  date: string;
  returnPct: number;
  close: number;
  /** 當日成交量 / 前 20 日均量 */
  volumeRatio: number | null;
}

/** 單日漲跌幅（還原價）絕對值最大的前 N 筆 */
export function topMoves(bars: Bar[], n = 10): BigMove[] {
  const moves: BigMove[] = [];
  for (let i = 1; i < bars.length; i++) {
    const r = px(bars[i]) / px(bars[i - 1]) - 1;
    if (!Number.isFinite(r)) continue;
    let vr: number | null = null;
    if (i >= 20) {
      let s = 0;
      for (let k = i - 20; k < i; k++) s += bars[k].volume || 0;
      const avg = s / 20;
      vr = avg > 0 ? round((bars[i].volume || 0) / avg, 2) : null;
    }
    moves.push({ date: bars[i].date, returnPct: round(r * 100, 2)!, close: round(bars[i].close)!, volumeRatio: vr });
  }
  return moves.sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct)).slice(0, n);
}

export interface DrawdownEpisode {
  peakDate: string;
  troughDate: string;
  recoveryDate: string | null;
  depthPct: number;
  /** 高點到低點的交易日數 */
  barsToTrough: number;
  /** 低點到收復高點的交易日數（未收復為 null） */
  barsToRecover: number | null;
  /** 高點到收復的日曆天數（未收復為 null） */
  daysPeakToRecovery: number | null;
}

/** 回撤事件：自高點下跌超過 minDepthPct 的每一段（高點 → 低點 → 收復），依深度排序取前 N */
export function drawdownEpisodes(bars: Bar[], opts: { minDepthPct?: number; top?: number } = {}): DrawdownEpisode[] {
  const minDepth = (opts.minDepthPct ?? 15) / 100;
  const out: DrawdownEpisode[] = [];
  let peakIdx = 0;
  let troughIdx = 0;
  let inDd = false;
  for (let i = 1; i < bars.length; i++) {
    const p = px(bars[i]);
    if (p >= px(bars[peakIdx])) {
      if (inDd) {
        const depth = px(bars[troughIdx]) / px(bars[peakIdx]) - 1;
        if (-depth >= minDepth) out.push(episode(bars, peakIdx, troughIdx, i));
      }
      peakIdx = i;
      troughIdx = i;
      inDd = false;
    } else {
      inDd = true;
      if (p < px(bars[troughIdx])) troughIdx = i;
    }
  }
  if (inDd) {
    const depth = px(bars[troughIdx]) / px(bars[peakIdx]) - 1;
    if (-depth >= minDepth) out.push(episode(bars, peakIdx, troughIdx, null));
  }
  return out.sort((a, b) => a.depthPct - b.depthPct).slice(0, opts.top ?? 8);
}

function episode(bars: Bar[], pk: number, tr: number, rec: number | null): DrawdownEpisode {
  const dayMs = 86400000;
  return {
    peakDate: bars[pk].date,
    troughDate: bars[tr].date,
    recoveryDate: rec === null ? null : bars[rec].date,
    depthPct: round((px(bars[tr]) / px(bars[pk]) - 1) * 100, 2)!,
    barsToTrough: tr - pk,
    barsToRecover: rec === null ? null : rec - tr,
    daysPeakToRecovery: rec === null ? null : Math.round((Date.parse(bars[rec].date) - Date.parse(bars[pk].date)) / dayMs),
  };
}

export interface OhlcBar {
  date: string; // 該期最後一個交易日
  periodStart: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  changePct: number | null;
}

function weekKey(d: string): string {
  const t = new Date(d + 'T00:00:00Z');
  const day = (t.getUTCDay() + 6) % 7; // 週一 = 0
  t.setUTCDate(t.getUTCDate() - day);
  return t.toISOString().slice(0, 10);
}

/** 降採樣：週 / 月 / 季 / 年 OHLC（含還原收盤與期間漲跌幅） */
export function downsample(bars: Bar[], unit: 'week' | 'month' | 'quarter' | 'year'): OhlcBar[] {
  const key = (d: string) => {
    if (unit === 'week') return weekKey(d);
    if (unit === 'month') return d.slice(0, 7);
    if (unit === 'quarter') return `${d.slice(0, 4)}Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;
    return d.slice(0, 4);
  };
  const out: OhlcBar[] = [];
  let cur = '';
  for (const b of bars) {
    const k = key(b.date);
    if (k !== cur) {
      cur = k;
      out.push({ date: b.date, periodStart: b.date, open: b.open || b.close, high: b.high || b.close, low: b.low || b.close, close: b.close, adjClose: px(b), volume: b.volume || 0, changePct: null });
    } else {
      const o = out[out.length - 1];
      o.date = b.date;
      o.high = Math.max(o.high, b.high || b.close);
      o.low = Math.min(o.low, b.low || b.close);
      o.close = b.close;
      o.adjClose = px(b);
      o.volume += b.volume || 0;
    }
  }
  for (let i = 0; i < out.length; i++) {
    const o = out[i];
    if (i > 0) o.changePct = round((o.adjClose / out[i - 1].adjClose - 1) * 100, 2);
    o.open = round(o.open)!;
    o.high = round(o.high)!;
    o.low = round(o.low)!;
    o.close = round(o.close)!;
    o.adjClose = round(o.adjClose)!;
  }
  return out;
}

export interface Regime {
  from: string;
  to: string;
  weeks: number;
  /** 區段年化平均報酬（%） */
  annReturnPct: number;
  /** 區段年化波動（%） */
  annVolPct: number;
  label: '多頭' | '空頭' | '盤整' | '高波動盤整';
}

export interface RegimeSummary {
  method: string;
  segments: Regime[];
  hmm: {
    /** 最新一週處於高波動狀態的後驗機率（以全樣本平滑估計，僅描述歷史，非預測） */
    pHighVolLatest: number | null;
    highVolShare: number | null;
    lowVolAnnPct: number | null;
    highVolAnnPct: number | null;
    /** Viterbi 路徑中連續 ≥ 4 週的高波動期間（最近 8 段） */
    highVolSpans: { from: string; to: string; weeks: number }[];
  } | null;
}

/** 以週對數報酬做 PELT（平均 + 變異數）切段與二狀態 HMM（高 / 低波動）；只描述歷史，不外推 */
export function detectRegimes(bars: Bar[], opts: { maxSegments?: number } = {}): RegimeSummary {
  const weeks = downsample(bars, 'week');
  const r: number[] = [];
  const d: string[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const v = Math.log(weeks[i].adjClose / weeks[i - 1].adjClose);
    if (Number.isFinite(v)) {
      r.push(v);
      d.push(weeks[i].date);
    }
  }
  const method = 'PELT（常態平均 + 變異數成本，週對數報酬，β = 6·ln n，最短 26 週）＋ 二狀態高斯 HMM（Baum–Welch / Viterbi）';
  if (r.length < 60) return { method, segments: [], hmm: null };
  const res = pelt(r, { penaltyFactor: 6, minSegment: 26 });
  let segments: Regime[] = res.segments.map((s) => {
    const annRet = s.mean * 52 * 100;
    const annVol = s.std * Math.sqrt(52) * 100;
    const label: Regime['label'] = annRet > 15 ? '多頭' : annRet < -10 ? '空頭' : annVol > 35 ? '高波動盤整' : '盤整';
    return { from: weeksStart(d, s.start, weeks), to: d[s.end - 1], weeks: s.end - s.start, annReturnPct: round(annRet, 1)!, annVolPct: round(annVol, 1)!, label };
  });
  const max = opts.maxSegments ?? 16;
  if (segments.length > max) segments = segments.slice(-max);
  let hmm: RegimeSummary['hmm'] = null;
  try {
    const h = fitHmm(r, { maxIter: 100 });
    const spans: { from: string; to: string; weeks: number }[] = [];
    let s = -1;
    for (let i = 0; i <= h.viterbi.length; i++) {
      const hi = i < h.viterbi.length && h.viterbi[i] === 1;
      if (hi && s < 0) s = i;
      if (!hi && s >= 0) {
        if (i - s >= 4) spans.push({ from: d[s], to: d[i - 1], weeks: i - s });
        s = -1;
      }
    }
    hmm = {
      pHighVolLatest: round(h.pHigh[h.pHigh.length - 1], 3),
      highVolShare: round(h.viterbi.filter((v) => v === 1).length / h.viterbi.length, 3),
      lowVolAnnPct: round(h.sigma[0] * Math.sqrt(52) * 100, 1),
      highVolAnnPct: round(h.sigma[1] * Math.sqrt(52) * 100, 1),
      highVolSpans: spans.slice(-8),
    };
  } catch {
    hmm = null;
  }
  return { method, segments, hmm };
}

function weeksStart(d: string[], idx: number, weeks: OhlcBar[]): string {
  // 區段第一個報酬對應的是「該週」；起點以該週第一個交易日表示
  const w = weeks[idx + 1];
  return w ? w.periodStart : d[idx];
}

export interface HistorySummary {
  symbol: string;
  from: string;
  to: string;
  bars: number;
  years: number;
  source: string;
  adjusted: boolean;
  asOf: string;
  /** 全期年化報酬（CAGR，%）與年化波動 */
  cagrPct: number | null;
  annVolPct: number | null;
  maxDrawdown: DrawdownResult;
  extremes: Extremes;
  yearly: YearStat[];
  topMoves: BigMove[];
  drawdowns: DrawdownEpisode[];
  regimes: RegimeSummary;
  notes: string[];
}

export function summarizeHistory(
  bars: Bar[],
  meta: { symbol: string; source: string; adjusted: boolean; asOf?: string },
  opts: { topN?: number; minDrawdownPct?: number; from?: string; to?: string } = {},
): HistorySummary {
  const b = clipBars(bars, opts.from, opts.to);
  const first = b[0];
  const last = b[b.length - 1];
  const lr: number[] = [];
  for (let i = 1; i < b.length; i++) lr.push(Math.log(px(b[i]) / px(b[i - 1])));
  const years = first && last ? (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 86400000) : 0;
  const notes: string[] = [];
  if (!meta.adjusted) notes.push('價格未還原除權息：跨除權息日的報酬可能被低估。');
  notes.push('報酬以還原價計算；歷史高低點同時列原始價。區段 / regime 只描述過去，不代表未來。');
  return {
    symbol: meta.symbol,
    from: first?.date ?? '',
    to: last?.date ?? '',
    bars: b.length,
    years: round(years, 2) ?? 0,
    source: meta.source,
    adjusted: meta.adjusted,
    asOf: meta.asOf ?? last?.date ?? '',
    cagrPct: first && last && years > 0.5 ? round(((px(last) / px(first)) ** (1 / years) - 1) * 100, 2) : null,
    annVolPct: lr.length > 20 ? round(std(lr) * Math.sqrt(252) * 100, 2) : null,
    maxDrawdown: maxDrawdown(b),
    extremes: extremes(b),
    yearly: yearlyStats(b),
    topMoves: topMoves(b, opts.topN ?? 10),
    drawdowns: drawdownEpisodes(b, { minDepthPct: opts.minDrawdownPct ?? 15, top: 8 }),
    regimes: detectRegimes(b),
    notes,
  };
}
