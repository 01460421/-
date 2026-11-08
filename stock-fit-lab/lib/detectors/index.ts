/**
 * 異常與變化偵測（第七節）。每個偵測器可獨立開關、調整門檻。
 *
 *  residual_z   標準化殘差 |z| > 3（穩健 z：中位數 / MAD）
 *  cusum        殘差（無殘差時改用報酬率）雙尾 CUSUM，k / h 以標準差為單位
 *  pelt         PELT 變點（報酬率的常態平均 + 變異數成本）
 *  bocpd        Bayesian online change-point（Adams & MacKay，常數 hazard）
 *  hmm_regime   二狀態高斯 HMM 高 / 低波動 regime 切換
 *  volume_spike 成交量 > 2.5 × 20 日均量
 *  vol_jump     5 日 / 60 日實現波動率比值向上穿越門檻
 *  page_hinkley 模型絕對誤差序列 Page–Hinkley 漂移
 *  事件對映     命中位置 ±1 交易日內有公司事件 → overlapsEvent
 *
 * residuals / modelErrors 陣列與 series.bars 尾端對齊（最後一個元素 = 最後一根 K 棒）。
 */
import type { Bar, DetectorHit, PriceSeries } from '../types';
import type { CorporateEvent } from '../data-adapters/types';
import { cusum, residualZHits } from './residual';
import { pelt } from './pelt';
import { bocpd } from './bocpd';
import { fitHmm } from './hmm';
import { barReturns, pageHinkley, volatilityJumps, volumeSpikes } from './market';
import { markEventOverlap } from './events';

export { robustZ, residualZHits, cusum } from './residual';
export type { CusumOptions, CusumResult, CusumAlarm, ZHit } from './residual';
export { pelt } from './pelt';
export type { PeltOptions, PeltResult } from './pelt';
export { bocpd } from './bocpd';
export type { BocpdOptions, BocpdResult } from './bocpd';
export { fitHmm, viterbiPath } from './hmm';
export type { HmmOptions, HmmResult } from './hmm';
export { volumeSpikes, volatilityJumps, pageHinkley, barReturns } from './market';
export type { PageHinkleyOptions, PageHinkleyResult } from './market';
export { markEventOverlap, barIndexOnOrAfter, describeEvent } from './events';

export interface DetectorConfig {
  residualZ: { enabled: boolean; threshold: number; criticalThreshold: number };
  cusum: { enabled: boolean; k: number; h: number; warmup: number; useReturnsIfNoResiduals: boolean };
  pelt: { enabled: boolean; penalty: number | null; penaltyFactor: number; minSegment: number };
  bocpd: { enabled: boolean; hazardLambda: number; minRunBefore: number; maxRunLength: number };
  hmm: { enabled: boolean; minDuration: number; maxIter: number; minObservations: number };
  volumeSpike: { enabled: boolean; multiple: number; window: number };
  volJump: { enabled: boolean; shortWindow: number; longWindow: number; ratio: number };
  pageHinkley: { enabled: boolean; delta: number; lambda: number; warmup: number };
  eventOverlap: { enabled: boolean; toleranceDays: number };
  /** 只回傳最後 N 根 K 棒內的命中（0 = 全部；排程掃描通知時可設 1–5） */
  lookbackBars: number;
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  residualZ: { enabled: true, threshold: 3, criticalThreshold: 5 },
  cusum: { enabled: true, k: 0.5, h: 5, warmup: 30, useReturnsIfNoResiduals: true },
  pelt: { enabled: true, penalty: null, penaltyFactor: 4, minSegment: 15 },
  bocpd: { enabled: true, hazardLambda: 120, minRunBefore: 15, maxRunLength: 400 },
  hmm: { enabled: true, minDuration: 5, maxIter: 150, minObservations: 60 },
  volumeSpike: { enabled: true, multiple: 2.5, window: 20 },
  volJump: { enabled: true, shortWindow: 5, longWindow: 60, ratio: 2 },
  pageHinkley: { enabled: true, delta: 0.1, lambda: 15, warmup: 20 },
  eventOverlap: { enabled: true, toleranceDays: 1 },
  lookbackBars: 0,
};

/** 每個偵測器可只覆寫部分欄位 */
export type DetectorConfigInput = { [K in keyof DetectorConfig]?: DetectorConfig[K] extends object ? Partial<DetectorConfig[K]> : DetectorConfig[K] };

export function resolveDetectorConfig(input?: DetectorConfigInput): DetectorConfig {
  const out = structuredClone(DEFAULT_DETECTOR_CONFIG) as DetectorConfig;
  if (!input) return out;
  for (const k of Object.keys(input) as (keyof DetectorConfig)[]) {
    const v = input[k];
    if (v === undefined) continue;
    if (typeof v === 'object' && v !== null) Object.assign(out[k] as object, v);
    else (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

export interface DetectorInput {
  series: PriceSeries;
  residuals?: Record<string, number[]>;
  modelErrors?: Record<string, number[]>;
  events?: CorporateEvent[];
  config?: DetectorConfigInput;
}

function fmt(x: number, d = 2): string {
  return Number.isFinite(x) ? x.toFixed(d) : String(x);
}

/** 尾端對齊：回傳陣列在 bars 中的起始偏移，並截掉超出 bars 長度的前段 */
function alignTail(arr: number[], nBars: number): { values: number[]; offset: number } {
  const values = arr.length > nBars ? arr.slice(arr.length - nBars) : arr;
  return { values, offset: nBars - values.length };
}

export function runDetectors(input: DetectorInput): DetectorHit[] {
  const cfg = resolveDetectorConfig(input.config);
  const bars: Bar[] = input.series?.bars ?? [];
  const n = bars.length;
  if (!n) return [];
  const hits: DetectorHit[] = [];
  const push = (h: Omit<DetectorHit, 'date'>) => {
    if (h.index < 0 || h.index >= n) return;
    hits.push({ ...h, date: bars[h.index].date });
  };
  const residuals = input.residuals ?? {};
  const returns = barReturns(bars); // returns[i] ↔ bars[i+1]

  // 1. 殘差 |z|
  if (cfg.residualZ.enabled) {
    for (const [model, arr] of Object.entries(residuals)) {
      const { values, offset } = alignTail(arr, n);
      for (const z of residualZHits(values, cfg.residualZ.threshold)) {
        const az = Math.abs(z.z);
        push({
          detector: 'residual_z',
          index: offset + z.index,
          severity: az >= cfg.residualZ.criticalThreshold ? 'critical' : 'warn',
          message: `[${model}] 標準化殘差 z = ${fmt(z.z)}，超過 ±${cfg.residualZ.threshold}`,
          value: z.z,
          threshold: cfg.residualZ.threshold,
        });
      }
    }
  }

  // 2. CUSUM
  if (cfg.cusum.enabled) {
    const targets: [string, number[], number][] = Object.entries(residuals).map(([m, arr]) => {
      const { values, offset } = alignTail(arr, n);
      return [m, values, offset];
    });
    if (!targets.length && cfg.cusum.useReturnsIfNoResiduals && returns.length > cfg.cusum.warmup) targets.push(['報酬率', returns, 1]);
    for (const [model, values, offset] of targets) {
      const r = cusum(values, cfg.cusum);
      r.alarms.forEach((a, i) => {
        push({
          detector: 'cusum',
          index: offset + a.index,
          severity: 'warn',
          message: `[${model}] CUSUM ${a.direction === 'up' ? '正向' : '負向'}累積和 ${fmt(a.value)} 突破 h = ${cfg.cusum.h}（估計自 ${bars[Math.min(n - 1, offset + r.onsets[i])]?.date ?? '—'} 起偏移）`,
          value: a.value,
          threshold: cfg.cusum.h,
        });
      });
    }
  }

  // 3. 結構變化（PELT / BOCPD）於報酬率
  if (cfg.pelt.enabled && returns.length >= 2 * cfg.pelt.minSegment) {
    const r = pelt(returns, { penalty: cfg.pelt.penalty ?? undefined, penaltyFactor: cfg.pelt.penaltyFactor, minSegment: cfg.pelt.minSegment });
    r.changePoints.forEach((cp) => {
      const before = r.segments.find((s) => s.end === cp);
      const after = r.segments.find((s) => s.start === cp);
      const volRatio = before && after && before.std > 0 ? after.std / before.std : NaN;
      push({
        detector: 'pelt',
        index: cp + 1,
        severity: 'info',
        message: `PELT 結構變點：報酬率平均 ${fmt((before?.mean ?? 0) * 100, 3)}% → ${fmt((after?.mean ?? 0) * 100, 3)}%，波動 ×${fmt(volRatio)}`,
        value: volRatio,
        threshold: r.penalty,
      });
    });
  }
  if (cfg.bocpd.enabled && returns.length >= 2 * cfg.bocpd.minRunBefore) {
    const r = bocpd(returns, { hazardLambda: cfg.bocpd.hazardLambda, minRunBefore: cfg.bocpd.minRunBefore, maxRunLength: cfg.bocpd.maxRunLength });
    for (const cp of r.changePoints) {
      push({
        detector: 'bocpd',
        index: cp + 1,
        severity: 'info',
        message: `Bayesian 變點（hazard 1/${cfg.bocpd.hazardLambda}）：新區段自此開始`,
        value: r.cpProb[Math.min(r.cpProb.length - 1, cp + cfg.bocpd.minRunBefore)] ?? NaN,
        threshold: 1 / cfg.bocpd.hazardLambda,
      });
    }
  }

  // 4. HMM 波動 regime
  if (cfg.hmm.enabled && returns.length >= cfg.hmm.minObservations) {
    try {
      const h = fitHmm(returns, { maxIter: cfg.hmm.maxIter });
      const path = h.viterbi;
      // 兩個狀態的波動差異太小時不視為 regime
      if (h.sigma[1] / Math.max(h.sigma[0], 1e-12) >= 1.3) {
        for (let t = 1; t < path.length; t++) {
          if (path[t] === path[t - 1]) continue;
          let run = 1;
          while (t + run < path.length && path[t + run] === path[t]) run++;
          const reachesEnd = t + run === path.length;
          const pLast = h.pHigh[path.length - 1];
          const pNew = path[t] === 1 ? pLast : 1 - pLast;
          // 太短的切換視為雜訊；但若延續到序列尾端且後驗夠高（剛切換），仍回報
          if (run < cfg.hmm.minDuration && !(reachesEnd && pNew >= 0.8)) continue;
          const toHigh = path[t] === 1;
          push({
            detector: 'hmm_regime',
            index: t + 1,
            severity: toHigh ? 'warn' : 'info',
            message: `HMM 波動 regime 切換：${toHigh ? '低 → 高' : '高 → 低'}波動（σ 低 ${fmt(h.sigma[0] * 100, 2)}%／高 ${fmt(h.sigma[1] * 100, 2)}%）`,
            value: h.pHigh[t],
            threshold: 0.5,
          });
        }
      }
    } catch {
      /* 資料不足 */
    }
  }

  // 5. 成交量 / 波動
  if (cfg.volumeSpike.enabled) {
    for (const v of volumeSpikes(bars, cfg.volumeSpike)) {
      push({
        detector: 'volume_spike',
        index: v.index,
        severity: v.ratio >= cfg.volumeSpike.multiple * 2 ? 'warn' : 'info',
        message: `成交量為 ${cfg.volumeSpike.window} 日均量的 ${fmt(v.ratio, 1)} 倍`,
        value: v.ratio,
        threshold: cfg.volumeSpike.multiple,
      });
    }
  }
  if (cfg.volJump.enabled) {
    for (const j of volatilityJumps(bars, cfg.volJump).jumps) {
      push({
        detector: 'vol_jump',
        index: j.index,
        severity: j.ratio >= cfg.volJump.ratio * 1.5 ? 'critical' : 'warn',
        message: `實現波動率跳升：${cfg.volJump.shortWindow} 日 / ${cfg.volJump.longWindow} 日 = ${fmt(j.ratio)}`,
        value: j.ratio,
        threshold: cfg.volJump.ratio,
      });
    }
  }

  // 6. 模型漂移
  if (cfg.pageHinkley.enabled && input.modelErrors) {
    for (const [model, arr] of Object.entries(input.modelErrors)) {
      const { values, offset } = alignTail(arr.map(Math.abs), n);
      const r = pageHinkley(values, cfg.pageHinkley);
      for (const a of r.alarms) {
        push({
          detector: 'page_hinkley',
          index: offset + a,
          severity: 'warn',
          message: `[${model}] 模型漂移：近期絕對誤差相對長期平均顯著惡化（Page–Hinkley ${fmt(r.stat[a])} > ${cfg.pageHinkley.lambda}）`,
          value: r.stat[a],
          threshold: cfg.pageHinkley.lambda,
        });
      }
    }
  }

  let out = hits;
  if (cfg.eventOverlap.enabled && input.events?.length) out = markEventOverlap(out, bars, input.events, cfg.eventOverlap.toleranceDays);
  if (cfg.lookbackBars > 0) out = out.filter((h) => h.index >= n - cfg.lookbackBars);
  return out.sort((a, b) => a.index - b.index || a.detector.localeCompare(b.detector));
}
