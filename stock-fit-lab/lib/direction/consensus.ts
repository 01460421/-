/**
 * 多時間尺度共識（規格八「漲跌勢判斷為第一優先」第 3 點）：
 * 日、週、月三個尺度分別估計方向機率，方向一致時才給高信心，不一致時自動降為觀望。
 *
 *   共識方向：d_s = sign(p_s − 0.5)，s ∈ {日, 週, 月}
 *   全部一致時合成機率取 logit 平均：\bar p = \sigma\big(\tfrac13\sum_s \mathrm{logit}(p_s)\big)，再套信心門檻；
 *   任一尺度不一致或無法計算 → 觀望。strict 模式下另要求每個尺度各自通過門檻。
 *
 * 重採樣只取每個週期的「最後一筆收盤」，且最後一個（可能尚未結束的）週期以目前最新收盤代表，
 * 不使用任何未來資料。
 */
import { gate, DEFAULT_GATE, type GateSignal, type GateThresholds } from './gating';
import { sigmoid } from '../math/stats';

/** 每 every 筆取一筆（由最新端往回對齊，確保最新收盤被保留） */
export function resampleEvery(prices: number[], every: number): number[] {
  const out: number[] = [];
  for (let i = prices.length - 1; i >= 0; i -= every) out.unshift(prices[i]);
  return out;
}

function weekKey(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 週一 = 0
  const monday = new Date(d.getTime() - dow * 86400000);
  return monday.toISOString().slice(0, 10);
}

/** 依日期（YYYY-MM-DD）分組，取每週 / 每月最後一筆收盤 */
export function resampleByDate(prices: number[], dates: string[], unit: 'week' | 'month'): number[] {
  if (prices.length !== dates.length) throw new Error('resampleByDate: prices 與 dates 長度不一致');
  const out: number[] = [];
  let prevKey = '';
  for (let i = 0; i < prices.length; i++) {
    const k = unit === 'week' ? weekKey(dates[i]) : dates[i].slice(0, 7);
    if (k === prevKey) out[out.length - 1] = prices[i];
    else out.push(prices[i]);
    prevKey = k;
  }
  return out;
}

/** 任一模型都可插入：給定（重採樣後）價格與期數 h，回傳 P(上漲) */
export type PUpFn = (prices: number[], h: number) => number;

export interface ConsensusOptions {
  /** 各尺度的預測期數（預設：日 5、週 1、月 1，大致對應 5–20 日趨勢期） */
  hDaily?: number;
  hWeekly?: number;
  hMonthly?: number;
  thresholds?: GateThresholds;
  /** 提供日期時以日曆週 / 月重採樣，否則以 5 / 21 個交易日近似 */
  dates?: string[];
  /** 每個尺度都必須各自通過門檻才發訊號 */
  strict?: boolean;
  /** 每個尺度最少資料點（不足時該尺度無法判斷 → 觀望） */
  minPoints?: number;
}

export interface ScaleResult {
  scale: 'daily' | 'weekly' | 'monthly';
  n: number;
  h: number;
  pUp: number;
  direction: 'up' | 'down' | 'flat' | 'unavailable';
}

export interface ConsensusResult {
  scales: ScaleResult[];
  agree: boolean;
  direction: 'up' | 'down' | 'mixed';
  /** 一致時為 logit 平均；不一致時為 0.5（不表態） */
  pUp: number;
  signal: GateSignal;
  reason: string;
}

const logit = (p: number) => {
  const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  return Math.log(q / (1 - q));
};

export function multiTimescaleConsensus(daily: number[], pUpFn: PUpFn, opts: ConsensusOptions = {}): ConsensusResult {
  const th = opts.thresholds ?? DEFAULT_GATE;
  const minPts = opts.minPoints ?? 30;
  const weekly = opts.dates ? resampleByDate(daily, opts.dates, 'week') : resampleEvery(daily, 5);
  const monthly = opts.dates ? resampleByDate(daily, opts.dates, 'month') : resampleEvery(daily, 21);
  const specs: { scale: ScaleResult['scale']; y: number[]; h: number }[] = [
    { scale: 'daily', y: daily, h: opts.hDaily ?? 5 },
    { scale: 'weekly', y: weekly, h: opts.hWeekly ?? 1 },
    { scale: 'monthly', y: monthly, h: opts.hMonthly ?? 1 },
  ];
  const scales: ScaleResult[] = specs.map(({ scale, y, h }) => {
    if (y.length < minPts) return { scale, n: y.length, h, pUp: NaN, direction: 'unavailable' };
    let p: number;
    try {
      p = pUpFn(y, h);
    } catch {
      p = NaN;
    }
    if (!Number.isFinite(p)) return { scale, n: y.length, h, pUp: NaN, direction: 'unavailable' };
    return { scale, n: y.length, h, pUp: p, direction: p > 0.5 ? 'up' : p < 0.5 ? 'down' : 'flat' };
  });
  const unavailable = scales.filter((s) => s.direction === 'unavailable');
  if (unavailable.length) {
    return {
      scales,
      agree: false,
      direction: 'mixed',
      pUp: 0.5,
      signal: 'neutral',
      reason: `${unavailable.map((s) => s.scale).join('、')} 尺度資料不足（< ${minPts} 點），無法確認共識 → 觀望`,
    };
  }
  const allUp = scales.every((s) => s.direction === 'up');
  const allDown = scales.every((s) => s.direction === 'down');
  if (!allUp && !allDown) {
    return {
      scales,
      agree: false,
      direction: 'mixed',
      pUp: 0.5,
      signal: 'neutral',
      reason: `尺度方向不一致（${scales.map((s) => `${s.scale}:${s.direction}`).join('，')}）→ 觀望`,
    };
  }
  const pUp = sigmoid(scales.reduce((s, x) => s + logit(x.pUp), 0) / scales.length);
  let signal = gate(pUp, th);
  let reason = `三尺度一致${allUp ? '看漲' : '看跌'}，合成 P(上漲) = ${pUp.toFixed(3)}`;
  if (opts.strict && scales.some((s) => gate(s.pUp, th) === 'neutral')) {
    signal = 'neutral';
    reason += '；strict 模式下有尺度未通過門檻 → 觀望';
  } else if (signal === 'neutral') reason += '，未達信心門檻 → 觀望';
  return { scales, agree: true, direction: allUp ? 'up' : 'down', pUp, signal, reason };
}
