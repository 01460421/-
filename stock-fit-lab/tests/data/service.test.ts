import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PriceSeries } from '@/lib/types';
import type { DataTable, HistoryRequest } from '@/lib/data-adapters/types';
import { createMarketDataService, getMarketData, mergeEvents, type ExtendedAdapter } from '@/lib/data-adapters/index';
import { MemoryLRU, TieredCache, KvRestStore, ttlForInterval, secondsUntilNextClose } from '@/lib/data-adapters/cache';
import { fetchWithRetry, httpConfig, HttpError, UnsupportedError } from '@/lib/data-adapters/http';
import { TokenBucket, resetLimiters } from '@/lib/data-adapters/ratelimit';
import * as fx from './fixtures';

function series(symbol: string, source: string, n = 5): PriceSeries {
  const bars = Array.from({ length: n }, (_, i) => {
    const date = `2026-10-${String(i + 1).padStart(2, '0')}`;
    return { t: Date.parse(date + 'T00:00:00Z'), date, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000 };
  });
  return { symbol, market: symbol.endsWith('.TWO') ? 'TWO' : symbol.endsWith('.TW') ? 'TW' : 'US', currency: 'TWD', interval: '1d', source, fetchedAt: '', asOf: '', delayMinutes: 0, adjusted: true, bars };
}

class FakeAdapter implements ExtendedAdapter {
  calls = 0;
  fail: Error | null = null;
  constructor(
    readonly id: string,
    readonly markets: ('TW' | 'TWO' | 'US')[],
    readonly name = id,
    readonly requiresKey = false,
    private configured = true,
    private intraday = true,
  ) {}
  isConfigured() {
    return this.configured;
  }
  supportsInterval(i: string) {
    return this.intraday || i === '1d';
  }
  async getHistory(symbol: string, req: HistoryRequest) {
    this.calls++;
    if (this.fail) throw this.fail;
    return { ...series(symbol, this.name), interval: req.interval };
  }
  async getQuote(symbol: string) {
    this.calls++;
    if (this.fail) throw this.fail;
    return { symbol, price: 1, at: '', delayMinutes: 0, source: this.name };
  }
  async getDataset(symbol: string, dataset: string): Promise<DataTable> {
    if (this.fail) throw this.fail;
    return { dataset, title: 't', symbol, source: this.name, fetchedAt: '', asOf: '', delayMinutes: 0, columns: [], rows: [{ a: 1 }] };
  }
  async getEvents() {
    if (this.fail) throw this.fail;
    return [{ date: '2026-10-03', type: 'dividend' as const, title: `${this.name} div`, source: this.name }];
  }
}

function setup() {
  const finmind = new FakeAdapter('finmind', ['TW', 'TWO'], 'FinMind', false, true, false);
  const twse = new FakeAdapter('twse', ['TW'], 'TWSE', false, true, false);
  const tpex = new FakeAdapter('tpex', ['TWO'], 'TPEx', false, true, false);
  const yahoo = new FakeAdapter('yahoo', ['TW', 'TWO', 'US'], 'Yahoo Finance');
  const polygon = new FakeAdapter('polygon', ['US'], 'Polygon.io', true, false);
  const alphavantage = new FakeAdapter('alphavantage', ['US'], 'Alpha Vantage', true, true);
  const finnhub = new FakeAdapter('finnhub', ['US'], 'Finnhub', true, true);
  const cache = new TieredCache(new MemoryLRU(100), null);
  const alerts: string[] = [];
  const svc = createMarketDataService({ adapters: [finmind, twse, tpex, yahoo, polygon, alphavantage, finnhub], cache, onHealthAlert: (h) => alerts.push(h.adapterId) });
  return { svc, cache, finmind, twse, tpex, yahoo, polygon, alphavantage, finnhub, alerts };
}

beforeEach(() => {
  resetLimiters();
  httpConfig.baseDelayMs = 1;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('MarketDataService 優先序與降級', () => {
  it('台股上市：FinMind 優先', async () => {
    const { svc, finmind, yahoo } = setup();
    const s = await svc.getHistory('2330');
    expect(s.source).toBe('FinMind');
    expect(s.symbol).toBe('2330.TW');
    expect(finmind.calls).toBe(1);
    expect(yahoo.calls).toBe(0);
  });

  it('FinMind 失敗 → TWSE；上櫃 → TPEx', async () => {
    const { svc, finmind } = setup();
    finmind.fail = new HttpError('quota', 429, '');
    expect((await svc.getHistory('2330.TW')).source).toBe('TWSE');
    expect((await svc.getHistory('6488')).source).toBe('TPEx');
  });

  it('盤中頻率跳過不支援的 FinMind / TWSE，改用 Yahoo', async () => {
    const { svc, finmind, twse } = setup();
    const s = await svc.getHistory('2330', { interval: '5m' });
    expect(s.source).toBe('Yahoo Finance');
    expect(finmind.calls + twse.calls).toBe(0);
  });

  it('美股：Yahoo → 跳過未設定金鑰的 Polygon → Alpha Vantage', async () => {
    const { svc, yahoo, polygon } = setup();
    yahoo.fail = new HttpError('HTTP 429', 429, '');
    const s = await svc.getHistory('AAPL');
    expect(s.source).toBe('Alpha Vantage');
    expect(polygon.calls).toBe(0);
  });

  it('快取命中不再呼叫資料源', async () => {
    const { svc, finmind } = setup();
    await svc.getHistory('2330');
    await svc.getHistory('2330');
    expect(finmind.calls).toBe(1);
  });

  it('全部失敗 → 回傳快取並標示 stale；完全沒有資料才丟錯', async () => {
    const { svc, cache, finmind, twse, yahoo, alerts } = setup();
    const first = await svc.getHistory('2330');
    expect(first.stale).toBeFalsy();
    // 讓快取過期
    const key = 'hist:v1:2330.TW:1d:-:-';
    const e = await cache.get<PriceSeries>(key);
    cache.l1.setEntry(key, { ...e!, freshUntil: Date.now() - 1 });
    for (const a of [finmind, twse, yahoo]) a.fail = new Error('down');
    const s = await svc.getHistory('2330');
    expect(s.stale).toBe(true);
    expect(s.bars).toHaveLength(5);
    expect(s.source).toBe('FinMind');
    // 範圍不同但同代號：取最近一次成功資料並裁切
    const s2 = await svc.getHistory('2330', { start: '2026-10-03' });
    expect(s2.stale).toBe(true);
    expect(s2.bars[0].date).toBe('2026-10-03');
    await expect(svc.getHistory('2317')).rejects.toThrow(/所有資料源/);
    const h = svc.health().find((x) => x.adapterId === 'finmind')!;
    expect(h.failures).toBeGreaterThanOrEqual(2);
    expect(h.consecutiveFailures).toBeGreaterThanOrEqual(2);
    expect(h.lastError).toBe('down');
    expect(alerts).toContain('finmind'); // 連續失敗兩次通知
  });

  it('UnsupportedError 不計入健康失敗', async () => {
    const { svc, finmind } = setup();
    finmind.fail = new UnsupportedError('nope');
    await svc.getHistory('2330');
    expect(svc.health().find((x) => x.adapterId === 'finmind')!.failures).toBe(0);
  });

  it('無法辨識代號丟錯', async () => {
    const { svc } = setup();
    await expect(svc.getHistory('不存在的公司名稱')).rejects.toThrow(/無法辨識/);
  });

  it('getDataset 永不丟錯；未接入資料集回傳 unavailableReason', async () => {
    const { svc, finmind, twse } = setup();
    const ok = await svc.getDataset('2330', 'institutional');
    expect(ok.source).toBe('FinMind');
    finmind.fail = new Error('x');
    twse.fail = new Error('y');
    const bad = await svc.getDataset('2317', 'margin');
    expect(bad.unavailableReason).toMatch(/資料源失敗/);
    const opt = await svc.getDataset('AAPL', 'options');
    expect(opt.unavailableReason).toBeTruthy();
    expect(opt.rows).toEqual([]);
    const nope = await svc.getDataset('???', 'news');
    expect(nope.unavailableReason).toMatch(/無法辨識/);
  });

  it('getEvents 合併多來源並去重', async () => {
    const { svc } = setup();
    const ev = await svc.getEvents('2330');
    expect(ev).toHaveLength(1);
    expect(mergeEvents([...ev, { date: '2026-01-01', type: 'earnings', title: 'x', source: 's' }])).toHaveLength(2);
    expect(await svc.getEvents('^VIX')).toEqual([]);
  });

  it('getQuote：資料源全失敗時以最近收盤替代', async () => {
    const { svc, yahoo, finmind, twse } = setup();
    expect((await svc.getQuote('2330'))?.source).toBe('Yahoo Finance');
    const s2 = setup();
    s2.yahoo.fail = new Error('x');
    s2.finmind.fail = null;
    void yahoo;
    void finmind;
    void twse;
    expect((await s2.svc.getQuote('2330'))?.source).toBe('FinMind');
  });

  it('macro 資料集組合多個指數', async () => {
    const { svc } = setup();
    const t = await svc.getDataset('2330', 'macro');
    expect(t.rows.map((r) => r.symbol)).toEqual(['^TWII', '^TWOII', '^GSPC', '^SOX', '^VIX', 'TWD=X', '^TNX']);
    expect(t.rows[0].close).toBe(104);
  });

  it('getMarketData 為單例', () => {
    expect(getMarketData()).toBe(getMarketData());
  });
});

describe('fetchWithRetry', () => {
  it('429 → 退避重試成功', async () => {
    const f = vi.fn().mockResolvedValueOnce(fx.jsonResponse({}, 429, { 'retry-after': '0' })).mockResolvedValueOnce(fx.jsonResponse({ ok: 1 }));
    vi.stubGlobal('fetch', f);
    const r = await fetchWithRetry('https://example.test/a');
    expect(await r.json()).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('5xx 重試用盡後丟出 HttpError；4xx 不重試', async () => {
    const f = vi.fn().mockImplementation(async () => fx.jsonResponse({}, 503));
    vi.stubGlobal('fetch', f);
    await expect(fetchWithRetry('https://example.test/b', { retries: 2 })).rejects.toMatchObject({ status: 503 });
    expect(f).toHaveBeenCalledTimes(3);
    const g = vi.fn().mockImplementation(async () => fx.jsonResponse({}, 404));
    vi.stubGlobal('fetch', g);
    await expect(fetchWithRetry('https://example.test/c')).rejects.toMatchObject({ status: 404 });
    expect(g).toHaveBeenCalledTimes(1);
  });

  it('逾時視為可重試錯誤', async () => {
    const f = vi.fn().mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    );
    vi.stubGlobal('fetch', f);
    await expect(fetchWithRetry('https://example.test/d', { timeoutMs: 20, retries: 1 })).rejects.toThrow(/timeout/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('錯誤訊息遮蔽金鑰', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => fx.jsonResponse({}, 401)));
    const e = await fetchWithRetry('https://example.test/e?apikey=SECRET123').catch((x) => x);
    expect(e.message).not.toContain('SECRET123');
  });
});

describe('TokenBucket', () => {
  it('容量用完需等待補充，並統計每小時用量', () => {
    let now = 0;
    const b = new TokenBucket({ capacity: 2, refillPerSec: 1, hourlyQuota: 10 }, () => now);
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(false);
    expect(b.waitMs()).toBe(1000);
    now = 1000;
    expect(b.tryTake()).toBe(true);
    expect(b.usedLastHour()).toBe(3);
    now = 3600_000 + 2000;
    expect(b.usedLastHour()).toBe(0);
  });
});

describe('cache', () => {
  it('MemoryLRU 淘汰最舊項目', async () => {
    const c = new MemoryLRU(2);
    await c.set('a', 1, 60);
    await c.set('b', 2, 60);
    await c.get('a');
    await c.set('c', 3, 60);
    expect(await c.get('b')).toBeNull();
    expect((await c.get('a'))?.value).toBe(1);
  });

  it('KV REST：寫入 / 讀取；KV 失敗時降級為記憶體', async () => {
    const store = new Map<string, string>();
    const f = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const m = url.match(/\/(get|set)\/([^?]+)/)!;
      const key = decodeURIComponent(m[2]);
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer kvtok');
      if (m[1] === 'set') {
        expect(url).toMatch(/EX=\d+/);
        store.set(key, String(init.body));
        return fx.jsonResponse({ result: 'OK' });
      }
      return fx.jsonResponse({ result: store.get(key) ?? null });
    });
    vi.stubGlobal('fetch', f);
    const kv = new KvRestStore('https://kv.example', 'kvtok');
    const tiered = new TieredCache(new MemoryLRU(10), kv);
    await tiered.set('k', { x: 1 }, 60);
    const fresh = new TieredCache(new MemoryLRU(10), kv);
    expect((await fresh.get<{ x: number }>('k'))?.value).toEqual({ x: 1 });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('kv down')));
    await tiered.set('k2', 5, 60);
    expect((await tiered.get<number>('k2'))?.value).toBe(5);
    expect(tiered.kvErrors).toBeGreaterThan(0);
  });

  it('TTL：盤中 60 秒；日線到下一次收盤發布', () => {
    expect(ttlForInterval('5m', 'TW')).toBe(60);
    // 2026-11-09（一）10:00 台北 → 當日 14:30 發布：4.5 小時
    expect(secondsUntilNextClose('TW', new Date('2026-11-09T02:00:00Z'))).toBe(4.5 * 3600);
    // 週六 → 下週一 14:30
    expect(secondsUntilNextClose('TW', new Date('2026-11-07T06:30:00Z'))).toBe(48 * 3600);
    // 美股 2026-11-09 16:45 NY（EST, UTC-5）→ 隔日 16:30 NY
    expect(secondsUntilNextClose('US', new Date('2026-11-09T21:45:00Z'))).toBe(23.75 * 3600);
  });
});
