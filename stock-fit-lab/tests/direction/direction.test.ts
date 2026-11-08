import { describe, it, expect } from 'vitest';
import {
  trainDirectionHead,
  buildDirectionSamples,
  walkForwardHeadPredictions,
  evaluateGate,
  gate,
  sweepThresholds,
  brierScore,
  reliabilityDiagram,
  plattScaling,
  isotonicCalibration,
  auc,
  expectedCalibrationError,
  multiTimescaleConsensus,
  resampleByDate,
  resampleEvery,
  adx,
  applyTrendFilters,
  computeFilterInputs,
  type DirectionSample,
} from '@/lib/direction';
import { mulberry32, normalGenerator, simulateRandomWalk } from '@/lib/math/random';

describe('gating', () => {
  it('門檻判斷', () => {
    expect(gate(0.7)).toBe('up');
    expect(gate(0.65)).toBe('up');
    expect(gate(0.35)).toBe('down');
    expect(gate(0.5)).toBe('neutral');
    expect(gate(0.6, { upper: 0.55, lower: 0.45 })).toBe('up');
  });

  it('手算範例：hitRate / actRatio / 混淆矩陣 / 連續判對錯', () => {
    //            up    up    neu   down  up    down  neu   up
    const p = [0.8, 0.7, 0.5, 0.2, 0.66, 0.3, 0.6, 0.9];
    const o = [true, true, false, false, false, true, true, true];
    // 出手：#0 up✓ #1 up✓ #3 down✓ #4 up✗ #5 down✗ #7 up✓ → 6 次出手、4 次對
    const e = evaluateGate(p, o);
    expect(e.n).toBe(8);
    expect(e.acted).toBe(6);
    expect(e.hits).toBe(4);
    expect(e.actRatio).toBeCloseTo(6 / 8, 12);
    expect(e.hitRate).toBeCloseTo(4 / 6, 12);
    // 列 up/down/neutral，欄 實際 up/down
    expect(e.confusion.matrix).toEqual([
      [3, 1],
      [1, 1],
      [1, 1],
    ]);
    expect(e.longestCorrectStreak).toBe(3);
    expect(e.longestWrongStreak).toBe(2);
    expect(e.currentStreak).toEqual({ kind: 'correct', length: 1 });
    expect(e.signals).toEqual(['up', 'up', 'neutral', 'down', 'up', 'down', 'neutral', 'up']);
  });

  it('門檻掃描：門檻越嚴出手越少', () => {
    const z = normalGenerator(1);
    const p = Array.from({ length: 300 }, () => 0.5 + 0.2 * z());
    const o = p.map((v) => v + 0.1 * z() > 0.5);
    const s = sweepThresholds(p, o);
    for (let i = 1; i < s.length; i++) expect(s[i].actRatio).toBeLessThanOrEqual(s[i - 1].actRatio);
  });
});

describe('calibration', () => {
  it('Brier 與可靠度圖：手算範例', () => {
    const p = [0.1, 0.15, 0.8, 0.85, 0.9, 0.5];
    const o = [false, true, true, true, false, true];
    // Brier = (0.01 + 0.7225 + 0.04 + 0.0225 + 0.81 + 0.25) / 6
    expect(brierScore(p, o)).toBeCloseTo((0.01 + 0.7225 + 0.04 + 0.0225 + 0.81 + 0.25) / 6, 12);
    const bins = reliabilityDiagram(p, o);
    expect(bins).toHaveLength(10);
    expect(bins[1].count).toBe(2);
    expect(bins[1].meanPredicted).toBeCloseTo(0.125, 12);
    expect(bins[1].observedFrequency).toBeCloseTo(0.5, 12);
    expect(bins[5].count).toBe(1);
    expect(bins[8].count).toBe(2);
    expect(bins[8].observedFrequency).toBeCloseTo(1, 12);
    expect(bins[9].count).toBe(1);
    expect(bins[9].observedFrequency).toBe(0);
    expect(bins[0].count).toBe(0);
    expect(Number.isNaN(bins[0].meanPredicted)).toBe(true);
  });

  it('AUC：完美排序 = 1、反向 = 0', () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [false, false, true, true])).toBe(1);
    expect(auc([0.9, 0.8, 0.2, 0.1], [false, false, true, true])).toBe(0);
    expect(auc([0.5, 0.5], [false, true])).toBe(0.5);
  });

  it('Platt 與等滲校準降低過度自信模型的 ECE', () => {
    const z = normalGenerator(9);
    const uni = mulberry32(99);
    const u = () => 1 / (1 + Math.exp(-z()));
    const trueP: number[] = [];
    const o: boolean[] = [];
    for (let i = 0; i < 4000; i++) {
      const q = u();
      trueP.push(q);
      o.push(uni() < q);
    }
    // 過度自信：把 logit 放大 3 倍
    const over = trueP.map((q) => 1 / (1 + Math.exp(-3 * Math.log(q / (1 - q)))));
    const tr = { p: over.slice(0, 2000), o: o.slice(0, 2000) };
    const te = { p: over.slice(2000), o: o.slice(2000) };
    const platt = plattScaling(tr.p, tr.o);
    expect(platt.a).toBeGreaterThan(0.2);
    expect(platt.a).toBeLessThan(0.5);
    const iso = isotonicCalibration(tr.p, tr.o);
    const eceRaw = expectedCalibrationError(te.p, te.o);
    expect(expectedCalibrationError(te.p.map(platt.apply), te.o)).toBeLessThan(eceRaw);
    expect(expectedCalibrationError(te.p.map(iso.apply), te.o)).toBeLessThan(eceRaw);
    // 等滲結果單調
    for (let i = 1; i < iso.y.length; i++) expect(iso.y[i]).toBeGreaterThanOrEqual(iso.y[i - 1]);
  });
});

describe('direction head', () => {
  const make = (n: number, signal: number, seed: number): DirectionSample[] => {
    const z = normalGenerator(seed);
    return Array.from({ length: n }, () => {
      const f = [z(), z(), z()];
      const latent = signal * (0.9 * f[0] - 0.5 * f[1]) + z();
      return { features: f, up: latent > 0, absRet: Math.abs(latent) * 0.01 };
    });
  };
  const evalHead = (data: DirectionSample[]) => {
    const head = trainDirectionHead(data.slice(0, 1500), { l2: 1e-3 });
    const test = data.slice(1500);
    const p = test.map((s) => head.predict(s.features));
    const acc = test.filter((s, i) => (p[i] > 0.5) === s.up).length / test.length;
    return { head, acc, auc: auc(p, test.map((s) => s.up)) };
  };

  it('特徵有訊號時樣本外 accuracy 與 AUC > 0.6', () => {
    const r = evalHead(make(2000, 1, 3));
    expect(r.acc).toBeGreaterThan(0.6);
    expect(r.auc).toBeGreaterThan(0.6);
    expect(r.head.coef[0]).toBeGreaterThan(0);
    expect(r.head.coef[1]).toBeLessThan(0);
    expect(r.head.converged).toBe(true);
  });

  it('純雜訊時樣本外 accuracy ≈ 0.5', () => {
    const r = evalHead(make(2000, 0, 4));
    expect(Math.abs(r.acc - 0.5)).toBeLessThan(0.06);
    expect(Math.abs(r.auc - 0.5)).toBeLessThan(0.07);
  });

  it('幅度權重：c = 0 與 c > 0 皆可訓練，權重改變係數', () => {
    const d = make(800, 1, 5);
    const a = trainDirectionHead(d, { magnitudeWeight: 0 });
    const b = trainDirectionHead(d, { magnitudeWeight: 3 });
    expect(a.coef[0]).not.toBeCloseTo(b.coef[0], 6);
  });

  it('walk-forward 樣本建立只用過去資料，隨機漫步上 OOS 準確率 ≈ 50%', () => {
    const prices = simulateRandomWalk(100, 0.01, 700, 13);
    const s = buildDirectionSamples(prices, 5, { start: 60, hurstWindow: 120 });
    expect(s[0].t).toBe(60);
    expect(s[s.length - 1].t! + 5).toBeLessThan(prices.length);
    // 洩漏檢查：竄改未來價格不影響起點 t 的特徵
    const tampered = prices.slice();
    for (let i = 301; i < tampered.length; i++) tampered[i] *= 1.5;
    const s2 = buildDirectionSamples(tampered, 5, { start: 60, hurstWindow: 120 });
    const k = s.findIndex((x) => x.t === 300);
    expect(s2[k].features).toEqual(s[k].features);
    const p = walkForwardHeadPredictions(s, 5, { minTrain: 150, refitEvery: 25 });
    const idx = p.map((v, i) => i).filter((i) => Number.isFinite(p[i]));
    const acc = idx.filter((i) => (p[i] > 0.5) === s[i].up).length / idx.length;
    expect(Math.abs(acc - 0.5)).toBeLessThan(0.1);
  });
});

describe('consensus', () => {
  it('重採樣保留最新收盤', () => {
    expect(resampleEvery([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([1, 4, 7]);
    const dates = ['2024-01-29', '2024-01-30', '2024-02-01', '2024-02-02', '2024-02-05', '2024-02-06'];
    expect(resampleByDate([1, 2, 3, 4, 5, 6], dates, 'week')).toEqual([4, 6]);
    expect(resampleByDate([1, 2, 3, 4, 5, 6], dates, 'month')).toEqual([2, 6]);
  });

  it('三尺度一致才發訊號，不一致降為觀望', () => {
    const prices = Array.from({ length: 800 }, (_, i) => 100 * Math.exp(0.001 * i));
    const allUp = multiTimescaleConsensus(prices, () => 0.8);
    expect(allUp.agree).toBe(true);
    expect(allUp.signal).toBe('up');
    expect(allUp.pUp).toBeCloseTo(0.8, 6);
    // 月線看跌 → 不一致
    const mixed = multiTimescaleConsensus(prices, (p) => (p.length < 60 ? 0.3 : 0.8));
    expect(mixed.agree).toBe(false);
    expect(mixed.signal).toBe('neutral');
    // 一致但信心不足
    const weak = multiTimescaleConsensus(prices, () => 0.55);
    expect(weak.agree).toBe(true);
    expect(weak.signal).toBe('neutral');
    // 資料不足的尺度 → 觀望
    const short = multiTimescaleConsensus(prices.slice(0, 200), () => 0.9);
    expect(short.signal).toBe('neutral');
  });
});

describe('trend filters', () => {
  it('ADX：強趨勢高、盤整低', () => {
    const trend = Array.from({ length: 100 }, (_, i) => ({ high: 101 + i, low: 99 + i, close: 100 + i }));
    const chop = Array.from({ length: 100 }, (_, i) => {
      const c = 100 + (i % 2 ? 1 : -1);
      return { high: c + 1, low: c - 1, close: c };
    });
    const aT = adx(trend).adx;
    const aC = adx(chop).adx;
    expect(Number.isNaN(aT[26])).toBe(true);
    expect(aT[27]).toBeGreaterThan(90);
    expect(aT[99]).toBeGreaterThan(90);
    expect(aC[99]).toBeLessThan(20);
  });

  it('濾網：ADX 低 / Hurst 低 / 盤整 regime 擋下訊號，但不改機率', () => {
    expect(applyTrendFilters({ pUp: 0.8, adx: 30, hurst: 0.6 }).signal).toBe('up');
    const r = applyTrendFilters({ pUp: 0.8, adx: 12, hurst: 0.5, regime: { labels: ['空頭', '盤整', '多頭'], probs: [0.1, 0.7, 0.2] } });
    expect(r.signal).toBe('neutral');
    expect(r.rawSignal).toBe('up');
    expect(r.pUp).toBe(0.8);
    expect(r.blockedBy).toEqual(['adx', 'hurst', 'regime']);
    expect(applyTrendFilters({ pUp: 0.5, adx: 5 }).blockedBy).toEqual([]);
  });

  it('computeFilterInputs 由過去資料產生 ADX / Hurst / regime', () => {
    const prices = simulateRandomWalk(100, 0.01, 400, 21);
    const bars = prices.map((c) => ({ high: c * 1.01, low: c * 0.99, close: c }));
    const f = computeFilterInputs(prices, bars);
    expect(Number.isFinite(f.adx!)).toBe(true);
    expect(Number.isFinite(f.hurst!)).toBe(true);
    expect(f.regime!.probs).toHaveLength(3);
  });
});
