import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryLRU } from '@/lib/data-adapters/cache';
import { setContextCache } from '@/lib/history/cache';
import {
  autoGranularity,
  detectRegimes,
  downsample,
  drawdownEpisodes,
  extremes,
  getHistorySummary,
  getLongHistory,
  getRangeSeries,
  maxDrawdown,
  setHistoryFetcher,
  stitchChunks,
  summarizeHistory,
  topMoves,
  yearlyStats,
} from '@/lib/history';
import { barsAt, barsFrom, gaussian, rng, seriesOf } from './helpers';

beforeEach(() => setContextCache(new MemoryLRU(200)));
afterEach(() => setHistoryFetcher(null));

describe('最大回撤', () => {
  it('100 → 120 → 90 → 130：最大回撤 −25%（120 → 90）', () => {
    const b = barsFrom([100, 120, 90, 95, 130, 104]);
    const r = maxDrawdown(b);
    expect(r.maxDrawdownPct).toBe(-25);
    expect(r.peakDate).toBe(b[1].date);
    expect(r.troughDate).toBe(b[2].date);
  });

  it('單調上漲：0', () => {
    expect(maxDrawdown(barsFrom([1, 2, 3, 4])).maxDrawdownPct).toBe(0);
  });
});

describe('逐年統計', () => {
  it('年度報酬以前一年最後收盤為基準；第一年以第一筆為基準', () => {
    const b = barsAt([
      ['2020-06-01', 100],
      ['2020-09-01', 80],
      ['2020-12-31', 110],
      ['2021-03-01', 121],
      ['2021-12-30', 99],
    ]);
    const y = yearlyStats(b);
    expect(y.map((x) => x.year)).toEqual([2020, 2021]);
    expect(y[0].returnPct).toBe(10); // 100 → 110
    expect(y[1].returnPct).toBe(-10); // 110 → 99
    expect(y[0].maxDrawdownPct).toBe(-20); // 100 → 80
    // 2021：110（前一年底）→ 121 → 99：(99/121 − 1) = −18.18%
    expect(y[1].maxDrawdownPct).toBe(-18.18);
    expect(y[0].partial).toBe(true);
    expect(y[1].partial).toBe(false);
  });

  it('年化波動 = std(日對數報酬) × √252', () => {
    // 交替 +1% / −1%：對數報酬 ±ln(1.01) 與 ln(1/1.01)…以實際計算比對
    const closes = [100];
    for (let i = 1; i < 60; i++) closes.push(closes[i - 1] * (i % 2 ? 1.01 : 1 / 1.01));
    const b = barsFrom(closes, '2021-01-04');
    const lr = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
    const m = lr.reduce((s, v) => s + v, 0) / lr.length;
    const sd = Math.sqrt(lr.reduce((s, v) => s + (v - m) ** 2, 0) / (lr.length - 1));
    expect(yearlyStats(b)[0].volPct).toBeCloseTo(sd * Math.sqrt(252) * 100, 1);
  });
});

describe('歷史高低點 / 最大單日漲跌 / 回撤事件', () => {
  const b = barsFrom([100, 110, 99, 120, 60, 66, 90, 121, 125]);

  it('extremes', () => {
    const e = extremes(b);
    expect(e.adjustedHigh).toEqual({ price: 125, date: b[8].date });
    expect(e.adjustedLow).toEqual({ price: 60, date: b[4].date });
    expect(e.allTimeHigh!.price).toBeCloseTo(126.25, 2); // high = close × 1.01
    expect(e.fromAdjustedHighPct).toBe(0);
  });

  it('topMoves 依絕對值排序', () => {
    const t = topMoves(b, 3);
    expect(t.map((x) => x.returnPct)).toEqual([-50, 36.36, 34.44]);
    expect(t[0].date).toBe(b[4].date);
  });

  it('回撤事件：高點 → 低點 → 收復，含交易日數', () => {
    const ep = drawdownEpisodes(b, { minDepthPct: 5 });
    // 110→99（−10%，次日 120 收復）；120→60（−50%，第 7 筆 121 收復）
    expect(ep).toHaveLength(2);
    expect(ep[0]).toMatchObject({ peakDate: b[3].date, troughDate: b[4].date, recoveryDate: b[7].date, depthPct: -50, barsToTrough: 1, barsToRecover: 3 });
    expect(ep[1]).toMatchObject({ peakDate: b[1].date, troughDate: b[2].date, recoveryDate: b[3].date, depthPct: -10 });
  });

  it('尚未收復的回撤 recoveryDate 為 null', () => {
    const ep = drawdownEpisodes(barsFrom([100, 50, 60]), { minDepthPct: 10 });
    expect(ep[0].recoveryDate).toBeNull();
    expect(ep[0].barsToRecover).toBeNull();
  });
});

describe('降採樣', () => {
  it('週 OHLC：開 = 週首、收 = 週末、高低取極值、量加總', () => {
    // 2024-01-01（一）~ 01-12（五）兩週
    const b = barsFrom([10, 12, 11, 9, 13, 14, 15, 13, 16, 17], '2024-01-01', { volume: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2] });
    const w = downsample(b, 'week');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ periodStart: '2024-01-01', date: '2024-01-05', open: 10, close: 13, volume: 5 });
    expect(w[0].high).toBeCloseTo(13.13, 2);
    expect(w[0].low).toBeCloseTo(8.91, 2);
    expect(w[1].changePct).toBeCloseTo((17 / 13 - 1) * 100, 1);
    const m = downsample(b, 'month');
    expect(m).toHaveLength(1);
    expect(m[0].close).toBe(17);
  });

  it('autoGranularity', () => {
    expect(autoGranularity('2024-01-01', '2024-04-01')).toBe('day');
    expect(autoGranularity('2020-01-01', '2024-01-01')).toBe('month');
    expect(autoGranularity('1990-01-01', '2024-01-01')).toBe('year');
  });
});

describe('結構區段（PELT）與 HMM', () => {
  it('低波動上漲 → 高波動下跌：在轉折附近切段', () => {
    const r = rng(11);
    const closes = [100];
    for (let i = 1; i < 1500; i++) {
      const hi = i >= 750;
      closes.push(closes[i - 1] * Math.exp((hi ? -0.0015 : 0.001) + gaussian(r) * (hi ? 0.03 : 0.008)));
    }
    const b = barsFrom(closes, '2000-01-03');
    const res = detectRegimes(b);
    expect(res.segments.length).toBeGreaterThanOrEqual(2);
    const breakDate = b[750].date;
    const near = res.segments.slice(1).some((s) => Math.abs(Date.parse(s.from) - Date.parse(breakDate)) < 120 * 86400000);
    expect(near).toBe(true);
    expect(res.hmm).not.toBeNull();
    expect(res.hmm!.highVolAnnPct!).toBeGreaterThan(res.hmm!.lowVolAnnPct!);
    expect(res.hmm!.pHighVolLatest!).toBeGreaterThan(0.5);
  });
});

describe('分段抓取接合', () => {
  it('以重疊日比例重新縮放舊段的還原價，使報酬連續', () => {
    // 新段的還原因子在重疊日為 0.5（之後有除息），舊段自身以為是 1
    const older = barsAt([
      ['2010-01-04', 100],
      ['2010-01-05', 110],
      ['2010-01-06', 120],
    ]);
    const newer = barsAt([
      ['2010-01-06', 120],
      ['2010-01-07', 130],
    ]).map((b) => ({ ...b, adjClose: b.close * 0.5 }));
    const m = stitchChunks([newer, older]);
    expect(m.map((b) => b.date)).toEqual(['2010-01-04', '2010-01-05', '2010-01-06', '2010-01-07']);
    expect(m[0].adjClose).toBe(50);
    expect(m[1].adjClose).toBe(55);
    expect(m[2].adjClose).toBe(60);
  });
});

describe('getLongHistory / getHistorySummary（point-in-time 與降級）', () => {
  const all = barsFrom(
    Array.from({ length: 600 }, (_, i) => 100 + i),
    '2022-01-03',
  );

  it('to 之後的資料絕不出現在結果與摘要中', async () => {
    setHistoryFetcher(async (s) => seriesOf(s, all));
    const cut = all[300].date;
    const h = await getLongHistory('AAPL', { to: cut });
    expect(h.bars[h.bars.length - 1].date).toBe(cut);
    expect(h.asOf).toBe(cut);
    const sum = await getHistorySummary('AAPL', { to: cut });
    expect(sum.to).toBe(cut);
    expect(sum.extremes.adjustedHigh!.date).toBe(cut);
    expect(sum.yearly.every((y) => y.to <= cut)).toBe(true);
  });

  it('整段請求失敗時改為分段抓取', async () => {
    const calls: { start?: string; end?: string }[] = [];
    setHistoryFetcher(async (s, req) => {
      calls.push({ start: req.start, end: req.end });
      if (!req.end) throw new Error('response too large');
      const bars = all.filter((b) => b.date >= req.start! && b.date <= req.end!);
      if (!bars.length) throw new Error('empty');
      return seriesOf(s, bars);
    });
    const h = await getLongHistory('MSFT');
    expect(h.chunked).toBe(true);
    expect(h.bars).toHaveLength(all.length);
    expect(calls.length).toBeGreaterThan(3);
  });

  it('getRangeSeries 依區間長度降採樣並限制點數', async () => {
    setHistoryFetcher(async (s) => seriesOf(s, all));
    const r = await getRangeSeries('AAPL', { from: all[0].date, to: all[599].date, maxPoints: 50 });
    expect(r.granularity).toBe('month');
    expect(r.points.length).toBeLessThanOrEqual(50);
    expect(r.stats.returnPct).toBeCloseTo((699 / 100 - 1) * 100, 1);
    const d = await getRangeSeries('AAPL', { from: all[0].date, to: all[20].date });
    expect(d.granularity).toBe('day');
    expect(d.points).toHaveLength(21);
  });

  it('summarizeHistory：CAGR 與 notes', () => {
    const s = summarizeHistory(all, { symbol: 'X', source: 'T', adjusted: false });
    expect(s.cagrPct).toBeGreaterThan(0);
    expect(s.notes.join()).toContain('未還原');
  });
});
