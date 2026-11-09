/**
 * 趨勢強度與持續性濾網（規格八「漲跌勢判斷為第一優先」第 4 點）：
 * ADX、Hurst 指數與 regime 機率作為門檻，盤整 regime 下不發出趨勢方向。
 *
 * ADX(14)（Wilder）：
 *   TR_t = \max(H_t-L_t,\ |H_t-C_{t-1}|,\ |L_t-C_{t-1}|)
 *   +DM_t = H_t-H_{t-1}（若 > L_{t-1}-L_t 且 > 0，否則 0）；−DM_t 對稱
 *   Wilder 平滑 S_t = S_{t-1} - S_{t-1}/n + x_t（首值為前 n 期總和）
 *   +DI = 100\,S^{+DM}/S^{TR},\quad DX = 100\,\frac{|{+DI}-{-DI}|}{{+DI}+{-DI}},\quad ADX_t = \frac{(n-1)ADX_{t-1}+DX_t}{n}
 * 所有遞迴皆為因果（只用 ≤ t 的資料），因此一次算出整條序列再取第 t 點不會有前視偏誤。
 */
import { gate, DEFAULT_GATE, type GateSignal, type GateThresholds } from './gating';
import { hasLongMemory } from '../models/advanced/hurst';
import { regimeProbabilities } from '../models/advanced/msar';

export interface OHLC {
  high: number;
  low: number;
  close: number;
}

export function adx(bars: OHLC[], period = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const n = bars.length;
  const out = { adx: new Array<number>(n).fill(NaN), plusDI: new Array<number>(n).fill(NaN), minusDI: new Array<number>(n).fill(NaN) };
  if (n < 2 * period + 1) return out;
  const tr = new Array<number>(n).fill(0);
  const pdm = new Array<number>(n).fill(0);
  const mdm = new Array<number>(n).fill(0);
  for (let t = 1; t < n; t++) {
    const b = bars[t];
    const p = bars[t - 1];
    tr[t] = Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
    const up = b.high - p.high;
    const dn = p.low - b.low;
    pdm[t] = up > dn && up > 0 ? up : 0;
    mdm[t] = dn > up && dn > 0 ? dn : 0;
  }
  let sTR = 0, sP = 0, sM = 0;
  for (let t = 1; t <= period; t++) {
    sTR += tr[t];
    sP += pdm[t];
    sM += mdm[t];
  }
  const dx = new Array<number>(n).fill(NaN);
  for (let t = period; t < n; t++) {
    if (t > period) {
      sTR = sTR - sTR / period + tr[t];
      sP = sP - sP / period + pdm[t];
      sM = sM - sM / period + mdm[t];
    }
    const pdi = sTR > 0 ? (100 * sP) / sTR : 0;
    const mdi = sTR > 0 ? (100 * sM) / sTR : 0;
    out.plusDI[t] = pdi;
    out.minusDI[t] = mdi;
    dx[t] = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
  }
  let a = 0;
  for (let t = period; t < 2 * period; t++) a += dx[t];
  a /= period;
  out.adx[2 * period - 1] = a;
  for (let t = 2 * period; t < n; t++) {
    a = (a * (period - 1) + dx[t]) / period;
    out.adx[t] = a;
  }
  return out;
}

export interface TrendFilterInput {
  pUp: number;
  /** 未提供時以門檻 gate(pUp) 產生 */
  signal?: GateSignal;
  adx?: number;
  hurst?: number;
  regime?: { labels: string[]; probs: number[] };
}

export interface TrendFilterOptions {
  /** ADX 低於此值視為無趨勢（預設 20） */
  adxMin?: number;
  /** Hurst 低於此值視為無持續性（預設 0.55） */
  hurstMin?: number;
  /** 盤整 regime 機率高於此值則不發方向（預設 0.5） */
  rangeProbMax?: number;
  rangeLabel?: string;
  thresholds?: GateThresholds;
}

export interface TrendFilterResult {
  signal: GateSignal;
  /** 原始機率（濾網只壓制訊號，不竄改機率，以免破壞校準） */
  pUp: number;
  rawSignal: GateSignal;
  passed: boolean;
  blockedBy: ('adx' | 'hurst' | 'regime')[];
  reasons: string[];
}

/**
 * 套用 ADX / Hurst / regime 三道濾網。任一道擋下 → 訊號降為觀望。
 * 缺少的輸入（undefined / NaN）視為該道濾網不適用（不擋）。
 */
export function applyTrendFilters(input: TrendFilterInput, opts: TrendFilterOptions = {}): TrendFilterResult {
  const adxMin = opts.adxMin ?? 20;
  const hurstMin = opts.hurstMin ?? 0.55;
  const rangeMax = opts.rangeProbMax ?? 0.5;
  const rangeLabel = opts.rangeLabel ?? '盤整';
  const raw = input.signal ?? gate(input.pUp, opts.thresholds ?? DEFAULT_GATE);
  const blockedBy: TrendFilterResult['blockedBy'] = [];
  const reasons: string[] = [];
  if (raw !== 'neutral') {
    if (input.adx !== undefined && Number.isFinite(input.adx) && input.adx < adxMin) {
      blockedBy.push('adx');
      reasons.push(`ADX ${input.adx.toFixed(1)} < ${adxMin}：趨勢強度不足`);
    }
    if (input.hurst !== undefined && Number.isFinite(input.hurst) && input.hurst <= hurstMin) {
      blockedBy.push('hurst');
      reasons.push(`Hurst ${input.hurst.toFixed(3)} ≤ ${hurstMin}：無長記憶，不做趨勢外推`);
    }
    if (input.regime) {
      const i = input.regime.labels.indexOf(rangeLabel);
      if (i >= 0 && input.regime.probs[i] > rangeMax) {
        blockedBy.push('regime');
        reasons.push(`${rangeLabel} regime 機率 ${(input.regime.probs[i] * 100).toFixed(0)}% > ${(rangeMax * 100).toFixed(0)}%`);
      }
    }
  }
  const passed = blockedBy.length === 0;
  return { signal: passed ? raw : 'neutral', pUp: input.pUp, rawSignal: raw, passed, blockedBy, reasons };
}

/**
 * 由過去資料計算濾網輸入：ADX（需要 OHLC）、Hurst（對數報酬 DFA）、MS-AR regime 機率。
 * 只用傳入的序列，呼叫端負責只傳入「預測起點以前」的資料。
 */
export function computeFilterInputs(
  prices: number[],
  bars?: OHLC[],
  opts: { regimes?: 2 | 3; adxPeriod?: number; hurstWindow?: number } = {},
): { adx?: number; hurst?: number; regime?: { labels: string[]; probs: number[] } } {
  const out: { adx?: number; hurst?: number; regime?: { labels: string[]; probs: number[] } } = {};
  if (bars && bars.length) {
    const a = adx(bars, opts.adxPeriod ?? 14).adx;
    const v = a[a.length - 1];
    if (Number.isFinite(v)) out.adx = v;
  }
  const win = opts.hurstWindow ?? 500;
  const hm = hasLongMemory(prices.slice(-win - 1));
  if (Number.isFinite(hm.H)) out.hurst = hm.H;
  try {
    if (prices.length >= 60) out.regime = regimeProbabilities(prices.slice(-750), opts.regimes ?? 3);
  } catch {
    /* 資料不足：regime 濾網不適用 */
  }
  return out;
}
