/**
 * 排程工作：以假資料源 / 假通知 / 記憶體儲存驗證收盤工作的快照、回填、事件與健康通知，
 * 以及 Cron 路由的 CRON_SECRET 驗證。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryStore, setStore } from '@/lib/storage';
import { runCloseJob } from '@/jobs/close';
import { runIntradayJob } from '@/jobs/intraday';
import { runBackfillJob } from '@/jobs/backfill';
import { resolveSymbols } from '@/jobs/common';
import { simulateGBM } from '@/lib/math/random';
import type { NotifyMessage } from '@/lib/notify';
import type { AdapterHealth } from '@/lib/data-adapters/types';
import { makeBars, makeSeries } from './helpers';

function fakeMarket(prices: number[], opts: { failFor?: string[]; health?: AdapterHealth[] } = {}) {
  let n = prices.length - 5;
  return {
    advance(k = 1) {
      n = Math.min(prices.length, n + k);
    },
    md: {
      async getHistory(symbol: string) {
        if (opts.failFor?.includes(symbol)) throw new Error('HTTP 503');
        return makeSeries(makeBars(prices.slice(0, n)), symbol);
      },
      async getEvents() {
        return [];
      },
      health: () => opts.health ?? [],
    },
  };
}

describe('jobs', () => {
  afterEach(() => setStore(undefined));

  it('追蹤代號 = 自選清單 ∪ TRACK_SYMBOLS，依市場過濾', async () => {
    const store = new MemoryStore(false);
    await store.upsertWatchlist([{ userId: 'u', symbol: '6488.TWO', market: 'TWO', addedAt: '', source: 'manual' }]);
    process.env.TRACK_SYMBOLS = '2330.TW,AAPL';
    expect((await resolveSymbols(store, 'TW')).sort()).toEqual(['2330.TW', '6488.TWO']);
    expect(await resolveSymbols(store, 'US')).toEqual(['AAPL']);
    delete process.env.TRACK_SYMBOLS;
  });

  it('收盤工作：寫快照、隔日回填、事件日誌、資料源連續失敗通知管理者', async () => {
    const store = new MemoryStore(false);
    const sent: NotifyMessage[] = [];
    const fm = fakeMarket(simulateGBM(100, 0.0003, 0.012, 200, 4), {
      failFor: ['NVDA'],
      health: [{ adapterId: 'yahoo', calls: 10, failures: 3, consecutiveFailures: 2, lastError: 'HTTP 503' }],
    });
    let clock = new Date('2025-09-01T21:30:00Z');
    const deps = { store, marketData: fm.md, notify: async (m: NotifyMessage) => (sent.push(m), [{ channel: 'test', ok: true }]), now: () => clock, symbols: ['AAPL', 'NVDA'] };
    const r1 = await runCloseJob({ ...deps, market: 'US', config: { horizon: 5 } });
    expect(r1.ok).toEqual(['AAPL']);
    expect(r1.failed.map((f) => f.symbol)).toEqual(['NVDA']);
    expect(r1.stats.snapshots).toBeGreaterThanOrEqual(10);
    const snaps = await store.listSnapshots({ symbol: 'AAPL' });
    expect(snaps.every((s) => s.trigger === 'schedule')).toBe(true);
    expect((await store.listEvents({ kind: 'job_run' })).length).toBe(1);
    expect((await store.listEvents({ kind: 'job_error', symbol: 'NVDA' })).length).toBe(1);
    // 資料源健康：連續失敗 2 次 → 管理者通知
    expect(sent.some((m) => m.title.includes('資料源 yahoo'))).toBe(true);

    // 隔天：新收盤 → 前一天快照的第 1 期被回填；NVDA 連續第二次失敗 → 通知
    fm.advance(1);
    clock = new Date('2025-09-02T21:30:00Z');
    const r2 = await runCloseJob({ ...deps, market: 'US', config: { horizon: 5 } });
    expect(r2.stats.outcomes).toBeGreaterThan(0);
    const outs = await store.listOutcomes(snaps.map((s) => s.id));
    expect(outs.length).toBe(snaps.length);
    expect(sent.some((m) => m.title.includes('NVDA 資料源連續失敗'))).toBe(true);
    expect((await store.listEvents({ kind: 'notification' })).length).toBe(sent.length);

    // 回填工作冪等
    const r3 = await runBackfillJob({ ...deps, market: 'US' });
    expect(r3.stats.outcomes ?? 0).toBe(0);
  });

  it('盤中工作：非交易時段跳過並仍寫入 job_run', async () => {
    const store = new MemoryStore(false);
    const fm = fakeMarket(simulateGBM(100, 0, 0.01, 120, 2));
    const r = await runIntradayJob({ store, marketData: fm.md, notify: async () => [], now: () => new Date('2025-09-06T12:00:00Z'), symbols: ['AAPL'] });
    expect(r.skipped).toMatch(/非交易時段/);
    expect((await store.listEvents({ kind: 'job_run' })).length).toBe(1);
    const forced = await runIntradayJob({ store, marketData: fm.md, notify: async () => [], force: true, market: 'US', symbols: ['AAPL'] });
    expect(forced.ok).toEqual(['AAPL']);
  });

  it('Cron 路由：設定 CRON_SECRET 時驗證 Bearer；market 參數檢查', async () => {
    process.env.CRON_SECRET = 's3cret';
    const store = new MemoryStore(false);
    setStore(store);
    const { GET, maxDuration, dynamic } = await import('@/app/api/cron/backfill/route');
    expect(maxDuration).toBe(60); // Hobby 方案上限
    expect(dynamic).toBe('force-dynamic');
    const denied = await GET(new Request('http://x/api/cron/backfill?market=US'));
    expect(denied.status).toBe(401);
    const bad = await GET(new Request('http://x/api/cron/backfill?market=JP', { headers: { authorization: 'Bearer s3cret' } }));
    expect(bad.status).toBe(400);
    delete process.env.CRON_SECRET;
  });
});
