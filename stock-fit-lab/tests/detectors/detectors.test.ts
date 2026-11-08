import { describe, it, expect } from 'vitest';
import type { Bar, PriceSeries } from '@/lib/types';
import { normalGenerator } from '@/lib/math/random';
import { addDays, isTradingDay } from '@/lib/calendar';
import {
  runDetectors,
  DEFAULT_DETECTOR_CONFIG,
  resolveDetectorConfig,
  cusum,
  pelt,
  bocpd,
  fitHmm,
  pageHinkley,
  volumeSpikes,
  volatilityJumps,
  residualZHits,
  markEventOverlap,
} from '@/lib/detectors';

function tradingDates(n: number, start = '2025-01-02'): string[] {
  const out: string[] = [];
  let d = start;
  while (out.length < n) {
    if (isTradingDay('US', d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** 由報酬率合成價格序列 */
function makeSeries(returns: number[], volumes?: number[]): PriceSeries {
  const dates = tradingDates(returns.length + 1);
  let p = 100;
  const bars: Bar[] = dates.map((date, i) => {
    if (i > 0) p *= Math.exp(returns[i - 1]);
    return { t: Date.parse(date + 'T00:00:00Z'), date, open: p, high: p * 1.005, low: p * 0.995, close: p, volume: volumes?.[i] ?? 1_000_000 };
  });
  return { symbol: 'TEST', market: 'US', currency: 'USD', interval: '1d', source: 'synthetic', fetchedAt: '', asOf: '', delayMinutes: 0, adjusted: true, bars };
}

const ALL_OFF = Object.fromEntries(
  Object.keys(DEFAULT_DETECTOR_CONFIG)
    .filter((k) => k !== 'lookbackBars' && k !== 'eventOverlap')
    .map((k) => [k, { enabled: false }]),
);

function only(name: keyof typeof DEFAULT_DETECTOR_CONFIG, extra: Record<string, unknown> = {}) {
  return { ...ALL_OFF, [name]: { enabled: true, ...extra } };
}

describe('殘差 |z| 與 CUSUM', () => {
  it('注入尖峰 → residual_z 命中正確位置（尾端對齊）', () => {
    const z = normalGenerator(1);
    const n = 200;
    const resid = Array.from({ length: 150 }, () => z());
    resid[120] = 9;
    const series = makeSeries(Array.from({ length: n - 1 }, () => 0.001 * z()));
    const hits = runDetectors({ series, residuals: { poly3: resid }, config: only('residualZ') });
    const spike = hits.find((h) => h.index === n - 150 + 120);
    expect(spike).toBeDefined();
    expect(spike!.detector).toBe('residual_z');
    expect(spike!.severity).toBe('critical');
    expect(spike!.message).toContain('poly3');
    expect(spike!.date).toBe(series.bars[spike!.index].date);
    // 常態雜訊下誤報極少
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  it('residualZHits 使用穩健尺度（單一極端值不會遮蔽自己）', () => {
    const x: number[] = Array.from({ length: 50 }, (_, i) => (i % 2 ? 0.1 : -0.1));
    x[25] = 3;
    expect(residualZHits(x).map((h) => h.index)).toEqual([25]);
  });

  it('CUSUM 偵測平均位移，警報在變化點後不久', () => {
    const z = normalGenerator(2);
    const x = Array.from({ length: 300 }, (_, i) => z() + (i >= 150 ? 1.5 : 0));
    const r = cusum(x, { k: 0.5, h: 5, warmup: 30 });
    const first = r.alarms.find((a) => a.index >= 100)!;
    expect(r.alarms.filter((a) => a.index < 150).length).toBe(0);
    expect(first.direction).toBe('up');
    expect(first.index).toBeGreaterThanOrEqual(150);
    expect(first.index).toBeLessThan(170);
    expect(Math.abs(r.onsets[r.alarms.indexOf(first)] - 150)).toBeLessThanOrEqual(8);
  });

  it('runDetectors 的 CUSUM 在殘差上回報', () => {
    const z = normalGenerator(3);
    const resid = Array.from({ length: 200 }, (_, i) => z() - (i >= 120 ? 2 : 0));
    const series = makeSeries(Array.from({ length: 199 }, () => 0.01 * z()));
    const hits = runDetectors({ series, residuals: { kalman: resid }, config: only('cusum') });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].index).toBeGreaterThanOrEqual(120);
    expect(hits[0].index).toBeLessThan(135);
    expect(hits[0].message).toContain('負向');
  });
});

describe('結構變化：PELT / BOCPD', () => {
  const z = normalGenerator(4);
  const x = Array.from({ length: 300 }, (_, i) => z() + (i >= 180 ? 3 : 0));

  it('PELT 找到平均位移點', () => {
    const r = pelt(x, { minSegment: 10 });
    expect(r.changePoints.length).toBeGreaterThanOrEqual(1);
    const nearest = r.changePoints.reduce((a, b) => (Math.abs(b - 180) < Math.abs(a - 180) ? b : a));
    expect(Math.abs(nearest - 180)).toBeLessThanOrEqual(3);
    expect(r.changePoints.length).toBeLessThanOrEqual(2);
    expect(r.segments[r.segments.length - 1].mean).toBeGreaterThan(2);
  });

  it('PELT 變異數變化', () => {
    const g = normalGenerator(5);
    const y = Array.from({ length: 400 }, (_, i) => g() * (i >= 250 ? 4 : 1));
    const r = pelt(y);
    expect(r.changePoints.some((c) => Math.abs(c - 250) <= 8)).toBe(true);
  });

  it('PELT 無變化時不回報', () => {
    const g = normalGenerator(6);
    expect(pelt(Array.from({ length: 300 }, () => g())).changePoints).toEqual([]);
  });

  it('BOCPD 找到平均位移點', () => {
    const r = bocpd(x, { hazardLambda: 100 });
    expect(r.mapRunLength).toHaveLength(300);
    const near = r.changePoints.filter((c) => Math.abs(c - 180) <= 5);
    expect(near.length).toBe(1);
    expect(r.changePoints.filter((c) => c < 170).length).toBeLessThanOrEqual(1);
    // 變化後執行長度重新累積
    expect(r.mapRunLength[299]).toBeGreaterThan(100);
    expect(r.mapRunLength[299]).toBeLessThan(125);
  });

  it('runDetectors：報酬率的波動變化觸發 PELT 與 BOCPD', () => {
    const g = normalGenerator(7);
    const rets = Array.from({ length: 299 }, (_, i) => g() * (i >= 200 ? 0.04 : 0.008));
    const series = makeSeries(rets);
    const hits = runDetectors({ series, config: { ...ALL_OFF, pelt: { enabled: true }, bocpd: { enabled: true } } });
    const p = hits.filter((h) => h.detector === 'pelt');
    const b = hits.filter((h) => h.detector === 'bocpd');
    expect(p.some((h) => Math.abs(h.index - 201) <= 6)).toBe(true);
    expect(b.some((h) => Math.abs(h.index - 201) <= 6)).toBe(true);
  });
});

describe('HMM 波動 regime', () => {
  it('還原兩個波動狀態並偵測切換', () => {
    const g = normalGenerator(8);
    const regime = (i: number) => (i >= 150 && i < 250 ? 1 : 0);
    const rets = Array.from({ length: 400 }, (_, i) => g() * (regime(i) ? 0.035 : 0.007));
    const h = fitHmm(rets);
    expect(h.sigma[0]).toBeGreaterThan(0.005);
    expect(h.sigma[0]).toBeLessThan(0.0095);
    expect(h.sigma[1]).toBeGreaterThan(0.028);
    expect(h.sigma[1]).toBeLessThan(0.042);
    const acc = h.viterbi.filter((s, i) => s === regime(i)).length / rets.length;
    expect(acc).toBeGreaterThan(0.93);
    expect(h.pHigh[200]).toBeGreaterThan(0.9);
    expect(h.A[0][0]).toBeGreaterThan(0.9);

    const series = makeSeries(rets.slice(1));
    const hits = runDetectors({ series, config: only('hmm') }).filter((x) => x.detector === 'hmm_regime');
    const up = hits.find((x) => x.severity === 'warn' && Math.abs(x.index - 150) <= 6);
    const down = hits.find((x) => x.severity === 'info' && Math.abs(x.index - 250) <= 6);
    expect(up?.message).toContain('低 → 高');
    expect(down?.message).toContain('高 → 低');
  });
});

describe('成交量與波動', () => {
  it('成交量 > 2.5 × 20 日均量', () => {
    const g = normalGenerator(9);
    const vols = Array.from({ length: 100 }, () => 1_000_000 * (1 + 0.1 * g()));
    vols[60] = 4_000_000;
    const series = makeSeries(Array.from({ length: 99 }, () => 0.01 * g()), vols);
    expect(volumeSpikes(series.bars).map((v) => v.index)).toEqual([60]);
    const hits = runDetectors({ series, config: only('volumeSpike') });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ detector: 'volume_spike', index: 60, threshold: 2.5 });
    expect(hits[0].value).toBeGreaterThan(3.5);
  });

  it('前值填補的 K 棒不觸發成交量異常', () => {
    const series = makeSeries(new Array(40).fill(0));
    series.bars[30] = { ...series.bars[30], volume: 0, filled: true };
    series.bars[31] = { ...series.bars[31], volume: 5_000_000, filled: true };
    expect(volumeSpikes(series.bars)).toEqual([]);
  });

  it('實現波動率跳升', () => {
    const g = normalGenerator(10);
    const rets = Array.from({ length: 199 }, (_, i) => g() * (i >= 150 ? 0.05 : 0.01));
    const series = makeSeries(rets);
    const { jumps, ratios } = volatilityJumps(series.bars);
    expect(Number.isNaN(ratios[10])).toBe(true);
    expect(jumps.some((j) => j.index >= 151 && j.index <= 156)).toBe(true);
    expect(jumps.filter((j) => j.index < 145).length).toBe(0);
    const hits = runDetectors({ series, config: only('volJump') });
    expect(hits.some((h) => h.detector === 'vol_jump' && h.index >= 151 && h.index <= 156)).toBe(true);
  });
});

describe('模型漂移 Page–Hinkley', () => {
  it('誤差序列惡化 → 警報在惡化後', () => {
    const g = normalGenerator(11);
    const err = Array.from({ length: 300 }, (_, i) => Math.abs(g()) * (i >= 200 ? 2.5 : 1));
    const r = pageHinkley(err);
    expect(r.alarms.filter((a) => a < 200)).toEqual([]);
    expect(r.alarms[0]).toBeGreaterThanOrEqual(200);
    expect(r.alarms[0]).toBeLessThan(230);
  });

  it('穩定誤差不誤報；runDetectors 尾端對齊', () => {
    const g = normalGenerator(12);
    const stable = Array.from({ length: 300 }, () => Math.abs(g()));
    expect(pageHinkley(stable).alarms).toEqual([]);
    const worsening = Array.from({ length: 120 }, (_, i) => Math.abs(g()) * (i >= 80 ? 3 : 1));
    const series = makeSeries(Array.from({ length: 199 }, () => 0.01 * g()));
    const hits = runDetectors({ series, modelErrors: { holtwinters: worsening }, config: only('pageHinkley') });
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBeGreaterThanOrEqual(200 - 120 + 80);
    expect(hits[0].message).toContain('holtwinters');
  });
});

describe('事件對映與設定', () => {
  it('±1 交易日內標記 overlapsEvent（週末事件對應下一個交易日）', () => {
    const series = makeSeries(new Array(20).fill(0));
    const bars = series.bars;
    const hits = [
      { detector: 'x', index: 5, date: bars[5].date, severity: 'warn' as const, message: '', value: 1, threshold: 1 },
      { detector: 'x', index: 12, date: bars[12].date, severity: 'warn' as const, message: '', value: 1, threshold: 1 },
    ];
    const out = markEventOverlap(hits, bars, [
      { date: bars[6].date, type: 'earnings', title: 'Q3 財報', source: 't' },
      { date: '2024-01-01', type: 'dividend', title: '很久以前', source: 't' },
    ]);
    expect(out[0].overlapsEvent).toContain('Q3 財報');
    expect(out[0].overlapsEvent).toContain('財報');
    expect(out[1].overlapsEvent).toBeUndefined();
    // 2025-01-04 為週六 → 對應 2025-01-06（bars[2]）
    const sat = markEventOverlap([{ ...hits[0], index: 3, date: bars[3].date }], bars, [{ date: '2025-01-04', type: 'dividend', title: '除息', source: 't' }]);
    expect(bars[2].date).toBe('2025-01-06');
    expect(sat[0].overlapsEvent).toContain('除息');
  });

  it('runDetectors 帶入事件；lookbackBars 只回傳最近命中；可關閉', () => {
    const g = normalGenerator(13);
    const vols = new Array(100).fill(1_000_000);
    vols[50] = 5_000_000;
    vols[98] = 5_000_000;
    const series = makeSeries(Array.from({ length: 99 }, () => 0.01 * g()), vols);
    const events = [{ date: series.bars[51].date, type: 'earnings' as const, title: '法說會', source: 't' }];
    const all = runDetectors({ series, events, config: only('volumeSpike') });
    expect(all.map((h) => h.index)).toEqual([50, 98]);
    expect(all[0].overlapsEvent).toContain('法說會');
    const recent = runDetectors({ series, events, config: { ...only('volumeSpike'), lookbackBars: 5 } });
    expect(recent.map((h) => h.index)).toEqual([98]);
    expect(runDetectors({ series, config: { ...only('volumeSpike'), volumeSpike: { enabled: false } } })).toEqual([]);
    expect(runDetectors({ series: { ...series, bars: [] } })).toEqual([]);
  });

  it('預設設定全部啟用、部分覆寫保留其他欄位', () => {
    const c = resolveDetectorConfig({ cusum: { h: 8 } });
    expect(c.cusum).toMatchObject({ enabled: true, h: 8, k: 0.5 });
    expect(DEFAULT_DETECTOR_CONFIG.cusum.h).toBe(5);
    expect(Object.values(DEFAULT_DETECTOR_CONFIG).filter((v) => typeof v === 'object').every((v) => (v as { enabled: boolean }).enabled)).toBe(true);
  });

  it('預設設定在隨機漫步上不會大量誤報', () => {
    const g = normalGenerator(14);
    const series = makeSeries(Array.from({ length: 499 }, () => 0.012 * g()));
    const hits = runDetectors({ series });
    expect(hits.length).toBeLessThan(15);
    for (const h of hits) expect(h.date).toBe(series.bars[h.index].date);
  });
});
