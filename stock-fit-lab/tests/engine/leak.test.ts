/**
 * 洩漏測試（規格第九節）：純隨機漫步上，所有基礎模型的樣本外 1 日方向準確率必須落在 50% ± 3%。
 * 無前視偏誤時，每個起點的命中是獨立的 Bernoulli(0.5)（未來增量與過去獨立），
 * 因此合併 5 條固定種子路徑（各 600 點、540 個起點，共 2700 個樣本，SE ≈ 0.96%）讓 ±3% 的界線穩健。
 * 另驗證洩漏稽核能把偷看未來的「模型」標為疑似並由檢查 (a)(c) 抓出。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { walkForward } from '@/lib/engine/walkforward';
import { auditForLeakage, checkAdjustedPrices, checkSnapshotsImmutable, snapshotHash } from '@/lib/engine/leak-audit';
import { simulateRandomWalk } from '@/lib/math/random';
import { BASIC_COMPONENT_IDS } from '@/lib/models/registry';
import { MemoryStore } from '@/lib/storage';
import type { Bar, ModelId, PredictionSnapshot } from '@/lib/types';

const SEEDS = [101, 202, 303, 404, 505];
const N = 600;
const paths = SEEDS.map((s) => simulateRandomWalk(100, 0.015, N, s));
const results: Record<string, { acc: number; n: number }> = {};

describe('隨機漫步洩漏測試（h = 1，逐日起點）', () => {
  const ids: ModelId[] = [...BASIC_COMPONENT_IDS, 'ensemble'];
  const pooled: Record<string, { hits: number; n: number; failures: number }> = {};

  beforeAll(() => {
    // 每條路徑跑一次 walk-forward（所有基礎模型 + 集成），各模型結果合併
    for (const p of paths) {
      const wf = walkForward(p, { models: ids, horizons: [1], window: 60, minTrain: 60, step: 1, benchmarks: false });
      for (const id of ids) {
        const m = wf.models[id][1].metrics;
        const acc = (pooled[id] = pooled[id] ?? { hits: 0, n: 0, failures: 0 });
        acc.hits += m.dirHits;
        acc.n += m.dirN;
        acc.failures += wf.failures[id]?.count ?? 0;
      }
    }
  }, 300_000);

  for (const id of ids) {
    it(`${id}：方向準確率 ∈ 50% ± 3%`, () => {
      const { hits, n, failures } = pooled[id];
      expect(failures).toBe(0);
      const acc = hits / n;
      results[id] = { acc, n };
      // 有效方向樣本至少 2000（排除預測恰好持平者）
      expect(n).toBeGreaterThan(2000);
      expect(acc).toBeGreaterThan(0.47);
      expect(acc).toBeLessThan(0.53);
    });
  }

  it('彙總（輸出各模型準確率）', () => {
    // eslint-disable-next-line no-console
    console.log('random-walk h=1 direction accuracy:', Object.fromEntries(Object.entries(results).map(([k, v]) => [k, `${(v.acc * 100).toFixed(2)}% (n=${v.n})`])));
    expect(Object.keys(results).length).toBe(ids.length);
  });
});

describe('洩漏稽核', () => {
  const p = simulateRandomWalk(100, 0.015, 300, 77);
  /** 「偷看未來」的特徵管線：把明日價格放進今日特徵 */
  const peek = (x: number[]) => x.map((_, i) => x[Math.min(i + 1, x.length - 1)]);

  it('偷看未來的模型被標為疑似，檢查 (a)(c) 抓出，計分卡需隱藏', async () => {
    const wf = walkForward(p, { models: ['kalman'], horizons: [1, 5], window: 60, step: 2, preprocess: peek });
    const m = wf.models.kalman[1].metrics;
    expect(m.directionAccuracy).toBeGreaterThan(0.7);
    const audit = await auditForLeakage({ wf, prices: p, preprocess: peek, sampleOrigins: 4 });
    expect(audit.suspect).toBe(true);
    expect(audit.suspects.some((s) => s.model === 'kalman' && s.horizon === 1)).toBe(true);
    expect(audit.passed).toBe(false);
    expect(audit.hiddenModels).toContain('kalman');
    const byId = Object.fromEntries(audit.checks.map((c) => [c.id, c]));
    expect(byId.a.status).toBe('fail');
    expect(byId.a.detail).toMatch(/最後輸入值/);
    expect(byId.c.status).toBe('fail');
  });

  it('全樣本標準化（使用未來統計量）由檢查 (c) 抓出', async () => {
    // 以全樣本平均做「去趨勢再加回」：視窗內數值依賴未來資料
    const fullNorm = (x: number[]) => {
      const mu = x.reduce((a, b) => a + b, 0) / x.length;
      return x.map((v) => v * 0.999 + mu * 0.001);
    };
    const wf = walkForward(p, { models: ['poly'], horizons: [1], window: 60, step: 10, preprocess: fullNorm });
    const audit = await auditForLeakage({ wf, prices: p, preprocess: fullNorm, sampleOrigins: 3 });
    expect(audit.checks.find((c) => c.id === 'c')!.status).toBe('fail');
  });

  it('誠實模型：不疑似、全部檢查通過', async () => {
    const wf = walkForward(p, { models: ['poly', 'kalman', 'holtwinters'], horizons: [1, 5], window: 60, step: 5 });
    const audit = await auditForLeakage({ wf, prices: p, sampleOrigins: 3 });
    expect(audit.suspect).toBe(false);
    expect(audit.passed).toBe(true);
    expect(audit.hiddenModels).toEqual([]);
    expect(audit.checks.find((c) => c.id === 'a')!.status).toBe('pass');
    expect(audit.checks.find((c) => c.id === 'c')!.status).toBe('pass');
  });

  it('(b) 還原因子跳動必須對應公司行動事件', () => {
    const bars: Bar[] = Array.from({ length: 10 }, (_, i) => ({
      t: i,
      date: `2025-01-${String(i + 6).padStart(2, '0')}`,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1,
      adjClose: i < 5 ? 50 : 100, // 1/2 分割發生在 01-11
    }));
    expect(checkAdjustedPrices(bars, []).status).toBe('fail');
    expect(checkAdjustedPrices(bars).status).toBe('warn');
    const ok = checkAdjustedPrices(bars, [{ date: '2025-01-11', type: 'split', title: '1:2 分割', source: 't' }]);
    expect(ok.status).toBe('pass');
    expect(ok.detail).toMatch(/分割/);
  });

  it('(d) 快照雜湊：一致 → 通過；與先前紀錄不符 → 失敗', async () => {
    const store = new MemoryStore(false);
    const snap: PredictionSnapshot = {
      id: 's1',
      createdAt: '2025-01-02T21:30:00.000Z',
      symbol: 'AAPL',
      modelId: 'poly',
      modelVersion: '1',
      params: {},
      trainStart: '2024-06-01',
      trainEnd: '2025-01-02',
      lastPrice: 100,
      targetDates: ['2025-01-03'],
      mean: [101],
      lower: [99],
      upper: [103],
      level: 0.9,
      benchmarks: { naive: [100] },
      trigger: 'schedule',
    };
    await store.appendSnapshots([snap]);
    const ok = await checkSnapshotsImmutable({ store, symbol: 'AAPL', knownHashes: { s1: snapshotHash(snap) } });
    expect(ok.check.status).toBe('pass');
    const bad = await checkSnapshotsImmutable({ store, symbol: 'AAPL', knownHashes: { s1: snapshotHash({ ...snap, mean: [105] }) } });
    expect(bad.check.status).toBe('fail');
    expect(bad.check.detail).toMatch(/改寫/);
  });
});
