import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryLRU } from '@/lib/data-adapters/cache';
import { httpConfig } from '@/lib/data-adapters/http';
import { resetLimiters } from '@/lib/data-adapters/ratelimit';
import { resetMarketData } from '@/lib/data-adapters';
import { setContextCache } from '@/lib/history/cache';
import { setHistoryFetcher } from '@/lib/history';
import {
  abnormalVolume,
  CAVEAT,
  getBehavioralIndicators,
  high52,
  inUsEarningsSeason,
  isQuarterEndWindow,
  marketSentimentProxy,
  momentum12_1,
  nearestHoliday,
  nextTwDeadline,
  overreactionZ,
  percentileRank,
  putCallFromRows,
  retailLeverage,
  vixGauge,
  calendarContext,
} from '@/lib/behavioral';
import { barsFrom, seriesOf } from '../history/helpers';

beforeEach(() => {
  resetLimiters();
  resetMarketData();
  setContextCache(new MemoryLRU(200));
  httpConfig.baseDelayMs = 1;
});
afterEach(() => {
  vi.unstubAllGlobals();
  setHistoryFetcher(null);
});

describe('52 週高點接近度（George & Hwang 2004）', () => {
  it('過去 252 日最高 300、最新 240 → 0.8', () => {
    const closes = [...Array.from({ length: 299 }, (_, i) => i + 2), 240]; // 2..300, 240
    const r = high52(barsFrom(closes));
    expect(r.available).toBe(true);
    expect(r.value).toBe(0.8);
    expect(r.details!.high52).toBe(300);
    expect(r.reference).toContain('George');
    expect(r.caveat).toBe(CAVEAT);
    expect(r.caveat).toContain('相關不等於因果');
  });
  it('資料不足時不計算', () => {
    expect(high52(barsFrom([1, 2, 3])).available).toBe(false);
  });
});

describe('異常成交量（Barber & Odean 2008）', () => {
  it('常態量 1000、今日 3000 → 3 倍；近 5 日平均 (4×1000+3000)/5 ÷ 1000 = 1.4', () => {
    const vol = [...Array.from({ length: 299 }, () => 1000), 3000];
    const r = abnormalVolume(barsFrom(Array.from({ length: 300 }, () => 50), '2020-01-01', { volume: vol }));
    expect(r.value).toBe(3);
    expect(r.details!.av5).toBe(1.4);
    expect(r.reading).toContain('2.5 倍以上');
  });
});

describe('短期過度反應 z（De Bondt & Thaler 1985）', () => {
  it('與獨立計算一致', () => {
    // 對數報酬交替 +1% / −1%，最後 5 日連續 +3%
    const lr = Array.from({ length: 199 }, (_, i) => (i % 2 ? -0.01 : 0.01));
    for (let k = 0; k < 5; k++) lr[lr.length - 1 - k] = 0.03;
    const lp = [Math.log(100)];
    for (const r of lr) lp.push(lp[lp.length - 1] + r);
    const bars = barsFrom(lp.map(Math.exp));
    const n = lp.length;
    const r5: number[] = [];
    for (let i = Math.max(5, n - 253); i < n - 1; i++) r5.push(lp[i] - lp[i - 5]);
    const m = r5.reduce((s, v) => s + v, 0) / r5.length;
    const sd = Math.sqrt(r5.reduce((s, v) => s + (v - m) ** 2, 0) / (r5.length - 1));
    const expected = (lp[n - 1] - lp[n - 6] - m) / sd;
    const z = overreactionZ(bars);
    expect(z.value).toBeCloseTo(expected, 3);
    expect(z.value!).toBeGreaterThan(2);
    expect(z.details!.returnPct).toBeCloseTo((Math.exp(0.15) - 1) * 100, 2);
  });
});

describe('動能 12-1（Jegadeesh & Titman 1993）', () => {
  it('每日 +0.1% 複利：P(t−21)/P(t−252) − 1 = 1.001^231 − 1', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 * 1.001 ** i);
    const r = momentum12_1(barsFrom(closes));
    expect(r.value).toBeCloseTo((1.001 ** 231 - 1) * 100, 2);
  });
});

describe('散戶槓桿：融資 vs 法人', () => {
  it('融資 20 日 +20%、使用率 30%、法人 20 日賣超 → 背離', () => {
    const margin = Array.from({ length: 25 }, (_, i) => ({ date: `2024-03-${String(i + 1).padStart(2, '0')}`, balance: i < 4 ? 1000 : 1000 + (i - 4) * 10, limit: 4000 }));
    // 最後一筆 1200；往前第 20 筆（index 4）1000
    const inst = margin.map((m) => ({ date: m.date, total: -100, foreign: -80 }));
    const r = retailLeverage(margin, inst);
    expect(r.value).toBe(20);
    expect(r.details!.marginUsagePct).toBe(30);
    expect(r.details!.institutional20d).toBe(-2000);
    expect(r.details!.divergence).toBe(1);
    expect(r.reading).toContain('背離');
  });
  it('資料不足時不可用', () => {
    expect(retailLeverage([{ date: '2024-01-01', balance: 1, limit: 2 }], []).available).toBe(false);
  });
});

describe('恐慌指標', () => {
  it('VIX 分位：60 個值 10..69，最新 69 → (59 + 0.5)/60', () => {
    const v = vixGauge(barsFrom(Array.from({ length: 60 }, (_, i) => 10 + i)));
    expect(v.value).toBe(69);
    expect(v.details!.percentile1y).toBeCloseTo((59.5 / 60) * 100, 3);
    expect(v.reading).toContain('≥ 30');
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(62.5);
  });
  it('自動偵測選擇權 P/C 欄位；不存在時回傳 null', () => {
    expect(putCallFromRows([{ date: '2024-01-02', put_call_ratio: 1.1 }, { date: '2024-01-03', put_call_ratio: 0.9 }])).toEqual({ date: '2024-01-03', pcr: 0.9, column: 'put_call_ratio' });
    expect(putCallFromRows([{ date: '2024-01-02', iv: 20 }])).toBeNull();
  });
});

describe('市場整體情緒代理（簡化 Baker–Wurgler）', () => {
  it('成分百分位平均 × 2 − 1（手算）', () => {
    const n = 800;
    // 指數單調上漲：每天都在 52 週高點 → 接近度全為 1，百分位（含平手）= 0.5
    const idx = barsFrom(Array.from({ length: n }, (_, i) => 1000 + i), '2020-01-01', { volume: Array.from({ length: n }, (_, i) => (i > n - 6 ? 5000 : 1000 + (i % 7))) });
    // VIX 單調下跌：最新為 756 日最低 → 百分位 0.5/756，反向後 ≈ 0.99934
    const vix = barsFrom(Array.from({ length: n }, (_, i) => 40 - i * 0.03));
    const r = marketSentimentProxy({ indexBars: idx, vixBars: vix });
    expect(r.available).toBe(true);
    expect(r.details!.indexHigh52Pct).toBe(0.5);
    expect(r.details!.vixInversePct).toBeCloseTo(1 - 0.5 / 756, 4);
    // 最後 5 日放量 5 倍 → 成交量比為 756 日最高 → (755 + 0.5) / 756
    expect(r.details!.indexVolumePct).toBeCloseTo(755.5 / 756, 4);
    const expected = ((0.5 + (1 - 0.5 / 756) + 755.5 / 756) / 3) * 2 - 1;
    expect(r.value).toBeCloseTo(expected, 3);
    expect(r.reading).toContain('樂觀');
  });
  it('成分不足 2 項時不計算', () => {
    expect(marketSentimentProxy({ indexBars: barsFrom([1, 2, 3]) }).available).toBe(false);
  });
});

describe('行事曆情境', () => {
  it('台股法定期限 / 美股財報季 / 季底 / 休市日', () => {
    expect(nextTwDeadline('2024-05-01')).toEqual({ date: '2024-05-15', label: 'Q1 季報' });
    expect(nextTwDeadline('2024-11-20')).toEqual({ date: '2025-03-31', label: '年報' });
    expect(inUsEarningsSeason('2024-01-20')).toBe(true);
    expect(inUsEarningsSeason('2024-03-01')).toBe(false);
    expect(isQuarterEndWindow('US', '2024-06-26')).toBe(true);
    expect(isQuarterEndWindow('US', '2024-06-10')).toBe(false);
    expect(nearestHoliday('US', '2024-12-20', 1)).toBe('2024-12-25');
  });
  it('未來公司事件只在 asOf ≈ 今天時列出（point-in-time）', () => {
    const events = [
      { date: '2024-01-25', type: 'earnings', title: '財報發布', source: 'Yahoo' },
      { date: '2024-01-10', type: 'earnings', title: '舊財報', source: 'Yahoo' },
    ];
    const past = calendarContext({ market: 'US', asOf: '2024-01-15', today: '2026-11-08', events, macroHeadlines: [] });
    expect(String(past.details!.companyEvents)).toContain('2024-01-10');
    expect(String(past.details!.companyEvents)).not.toContain('2024-01-25');
    const live = calendarContext({ market: 'US', asOf: '2024-01-15', today: '2024-01-15', events, macroHeadlines: [] });
    expect(String(live.details!.companyEvents)).toContain('2024-01-25');
  });
});

describe('getBehavioralIndicators（point-in-time 整合）', () => {
  it('asOf 之後的暴漲不影響當時的讀數', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nf', { status: 404 })));
    const n = 400;
    const closes = Array.from({ length: n }, (_, i) => (i < 350 ? 100 : 300)); // 第 350 筆後暴漲
    const vols = Array.from({ length: n }, (_, i) => (i < 350 ? 1000 : 9000));
    const all = barsFrom(closes, '2022-01-03', { volume: vols });
    setHistoryFetcher(async (s) => seriesOf(s, all));
    const asOf = all[349].date;
    const r = await getBehavioralIndicators('AAPL', { asOf, includeNews: false });
    expect(r.asOf).toBe(asOf);
    const h = r.indicators.find((x) => x.id === 'high52')!;
    expect(h.value).toBe(1); // 100 / 100：看不到之後的 300
    expect(h.asOf).toBe(asOf);
    expect(r.indicators.find((x) => x.id === 'attention')!.value).toBe(1);
    for (const x of r.indicators) if (x.asOf) expect(x.asOf <= asOf).toBe(true);
    expect(r.indicators.every((x) => x.caveat.includes('相關不等於因果'))).toBe(true);
    expect(r.indicators.map((x) => x.id)).toEqual(expect.arrayContaining(['high52', 'attention', 'overreaction', 'momentum', 'fear', 'media', 'market_sentiment', 'calendar']));
  });
});
