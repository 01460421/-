/**
 * 成交量與波動異常、模型漂移（Page–Hinkley）。
 */
import type { Bar } from '../types';

export interface VolumeSpike {
  index: number;
  ratio: number;
  baseline: number;
}

/** 成交量 > multiple × 前 window 日平均量（排除前值填補與零量） */
export function volumeSpikes(bars: Bar[], opts: { multiple?: number; window?: number } = {}): VolumeSpike[] {
  const multiple = opts.multiple ?? 2.5;
  const window = opts.window ?? 20;
  const out: VolumeSpike[] = [];
  for (let i = window; i < bars.length; i++) {
    const b = bars[i];
    if (b.filled || !(b.volume > 0)) continue;
    let s = 0;
    let n = 0;
    for (let j = i - window; j < i; j++) {
      const v = bars[j];
      if (v.filled || !(v.volume > 0)) continue;
      s += v.volume;
      n++;
    }
    if (n < Math.ceil(window / 2)) continue;
    const base = s / n;
    const ratio = b.volume / base;
    if (ratio > multiple) out.push({ index: i, ratio, baseline: base });
  }
  return out;
}

/** 價格 → 對數報酬（使用 adjClose ?? close；長度 = bars.length − 1，第 i 個對應 bars[i+1]） */
export function barReturns(bars: Bar[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].adjClose ?? bars[i - 1].close;
    const b = bars[i].adjClose ?? bars[i].close;
    r.push(a > 0 && b > 0 ? Math.log(b / a) : 0);
  }
  return r;
}

export interface VolRatioPoint {
  index: number;
  ratio: number;
}

/**
 * 實現波動率比值：RV_short / RV_long，RV_w = sqrt(mean(r²)) over 最近 w 個報酬。
 * 回傳每個 bar 的比值（不足長度為 NaN）與「由下往上穿越門檻」的跳升點。
 */
export function volatilityJumps(bars: Bar[], opts: { shortWindow?: number; longWindow?: number; ratio?: number } = {}): { ratios: number[]; jumps: VolRatioPoint[] } {
  const sw = opts.shortWindow ?? 5;
  const lw = opts.longWindow ?? 60;
  const th = opts.ratio ?? 2;
  const r = barReturns(bars);
  const sq = r.map((v) => v * v);
  const cum = [0];
  for (const v of sq) cum.push(cum[cum.length - 1] + v);
  const ratios = new Array<number>(bars.length).fill(NaN);
  const jumps: VolRatioPoint[] = [];
  let prevAbove = false;
  for (let i = lw; i <= r.length; i++) {
    // 報酬 r[i-1] 對應 bars[i]
    const shortRv = Math.sqrt((cum[i] - cum[i - sw]) / sw);
    const longRv = Math.sqrt((cum[i] - cum[i - lw]) / lw);
    const ratio = longRv > 0 ? shortRv / longRv : NaN;
    ratios[i] = ratio;
    const above = ratio > th;
    if (above && !prevAbove) jumps.push({ index: i, ratio });
    prevAbove = above;
  }
  return { ratios, jumps };
}

export interface PageHinkleyOptions {
  /** 容許的漂移量（以長期平均誤差為單位） */
  delta?: number;
  /** 警報門檻（以長期平均誤差為單位） */
  lambda?: number;
  /** 用前 warmup 筆的平均值把序列標準化（0 = 不標準化） */
  warmup?: number;
}

export interface PageHinkleyResult {
  stat: number[];
  alarms: number[];
}

/**
 * Page–Hinkley 檢定（偵測平均值上升，例如模型絕對誤差惡化）：
 *   m_t = Σ_{i≤t} (x_i − x̄_i − δ)，M_t = min_{i≤t} m_i，PH_t = m_t − M_t > λ → 警報並重置
 */
export function pageHinkley(x: number[], opts: PageHinkleyOptions = {}): PageHinkleyResult {
  const delta = opts.delta ?? 0.1;
  const lambda = opts.lambda ?? 15;
  const warmup = opts.warmup ?? 20;
  let scale = 1;
  if (warmup > 0 && x.length > warmup) {
    const base = x.slice(0, warmup).filter(Number.isFinite);
    const m = base.reduce((a, b) => a + Math.abs(b), 0) / Math.max(1, base.length);
    scale = m > 1e-12 ? m : 1;
  }
  const stat = new Array<number>(x.length).fill(0);
  const alarms: number[] = [];
  let n = 0;
  let avg = 0;
  let mt = 0;
  let Mt = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] / scale;
    if (!Number.isFinite(v)) {
      stat[i] = mt - Mt;
      continue;
    }
    n++;
    avg += (v - avg) / n;
    mt += v - avg - delta;
    Mt = Math.min(Mt, mt);
    stat[i] = mt - Mt;
    if (stat[i] > lambda) {
      alarms.push(i);
      n = 0;
      avg = 0;
      mt = 0;
      Mt = 0;
    }
  }
  return { stat, alarms };
}
