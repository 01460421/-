/**
 * 殘差異常：穩健標準化殘差 |z| 門檻、雙尾 CUSUM。
 */
import { mean, median, std } from '../math/stats';

/** 穩健 z 分數：(x − median) / (1.4826·MAD)；MAD 為 0 時退回標準差 */
export function robustZ(x: number[]): number[] {
  const v = x.filter((a) => Number.isFinite(a));
  if (v.length < 3) return x.map(() => 0);
  const med = median(v);
  const mad = median(v.map((a) => Math.abs(a - med))) * 1.4826;
  const scale = mad > 1e-12 ? mad : std(v) || 1;
  return x.map((a) => (Number.isFinite(a) ? (a - med) / scale : 0));
}

export interface ZHit {
  index: number;
  z: number;
}

export function residualZHits(residuals: number[], threshold = 3): ZHit[] {
  const z = robustZ(residuals);
  const out: ZHit[] = [];
  z.forEach((v, i) => {
    if (Math.abs(v) > threshold) out.push({ index: i, z: v });
  });
  return out;
}

export interface CusumOptions {
  /** 參考值 k（以標準差為單位），通常為欲偵測位移的一半 */
  k?: number;
  /** 決策門檻 h（以標準差為單位） */
  h?: number;
  /** 用來估計基準平均 / 標準差的暖機長度；警報後重新暖機 */
  warmup?: number;
}

export interface CusumAlarm {
  index: number;
  direction: 'up' | 'down';
  value: number;
}

export interface CusumResult {
  sPos: number[];
  sNeg: number[];
  alarms: CusumAlarm[];
  /** 估計的變化起點（最後一次 S 從 0 開始累積的位置） */
  onsets: number[];
}

/**
 * 雙尾表格式 CUSUM：
 *   S⁺_t = max(0, S⁺_{t−1} + z_t − k)，S⁻_t = max(0, S⁻_{t−1} − z_t − k)，z_t = (x_t − μ₀)/σ₀
 * 任一側 > h 即警報並重置；μ₀、σ₀ 以暖機區段估計。
 */
export function cusum(x: number[], opts: CusumOptions = {}): CusumResult {
  const k = opts.k ?? 0.5;
  const h = opts.h ?? 5;
  const warmup = Math.max(5, opts.warmup ?? 30);
  const n = x.length;
  const sPos = new Array<number>(n).fill(0);
  const sNeg = new Array<number>(n).fill(0);
  const alarms: CusumAlarm[] = [];
  const onsets: number[] = [];
  let start = 0;
  let mu = 0;
  let sd = 1;
  let ready = false;
  let sp = 0;
  let sn = 0;
  let spStart = 0;
  let snStart = 0;
  for (let i = 0; i < n; i++) {
    if (!ready) {
      if (i - start + 1 >= warmup) {
        const seg = x.slice(start, i + 1).filter(Number.isFinite);
        mu = mean(seg);
        sd = std(seg) || 1e-12;
        ready = true;
        sp = sn = 0;
      }
      continue;
    }
    const v = x[i];
    if (!Number.isFinite(v)) {
      sPos[i] = sp;
      sNeg[i] = sn;
      continue;
    }
    const z = (v - mu) / sd;
    if (sp === 0) spStart = i;
    if (sn === 0) snStart = i;
    sp = Math.max(0, sp + z - k);
    sn = Math.max(0, sn - z - k);
    sPos[i] = sp;
    sNeg[i] = sn;
    if (sp > h || sn > h) {
      const up = sp > h;
      alarms.push({ index: i, direction: up ? 'up' : 'down', value: up ? sp : sn });
      onsets.push(up ? spStart : snStart);
      sp = sn = 0;
      start = i + 1;
      ready = false;
    }
  }
  return { sPos, sNeg, alarms, onsets };
}
