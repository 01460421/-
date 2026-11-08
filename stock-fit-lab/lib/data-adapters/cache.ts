/**
 * 行情快取：Upstash / Vercel KV REST（KV_REST_API_URL、KV_REST_API_TOKEN）＋ 記憶體 LRU（L1 與無 KV 時的備援）。
 *
 * 每筆快取存 { value, storedAt, freshUntil }：
 *  - freshUntil 之前視為新鮮，直接回傳；
 *  - 之後仍保留 keepSec（預設 14 天）作為資料源全數失敗時的降級資料（stale）。
 * TTL：盤中頻率 60 秒；日線以上到「下一次收盤 + 緩衝」為止。
 */
import type { Interval, Market } from '../types';
import { addDays, isTradingDay, localParts } from '../calendar';
import { MARKET_TZ, isIntraday, zonedTimeToUtc } from './util';

export interface CacheEntry<T> {
  value: T;
  storedAt: number;
  freshUntil: number;
}

export interface CacheStore {
  readonly kind: string;
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, freshTtlSec: number, keepSec?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

const DEFAULT_KEEP_SEC = 14 * 86400;

export class MemoryLRU implements CacheStore {
  readonly kind = 'memory';
  private map = new Map<string, { entry: CacheEntry<unknown>; expiresAt: number }>();
  constructor(private readonly maxEntries = 500) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.map.delete(key);
      return null;
    }
    // LRU：重新插入到尾端
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.entry as CacheEntry<T>;
  }

  async set<T>(key: string, value: T, freshTtlSec: number, keepSec = DEFAULT_KEEP_SEC): Promise<void> {
    const now = Date.now();
    this.map.delete(key);
    this.map.set(key, { entry: { value, storedAt: now, freshUntil: now + freshTtlSec * 1000 }, expiresAt: now + Math.max(keepSec, freshTtlSec) * 1000 });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  /** 直接寫入既有 entry（保留 storedAt / freshUntil，用於 L2 回填 L1） */
  setEntry<T>(key: string, entry: CacheEntry<T>, keepSec = DEFAULT_KEEP_SEC): void {
    this.map.delete(key);
    this.map.set(key, { entry, expiresAt: entry.storedAt + keepSec * 1000 });
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

/** Upstash / Vercel KV REST API（僅用 fetch，不需 SDK） */
export class KvRestStore implements CacheStore {
  readonly kind = 'kv';
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly timeoutMs = 3000,
  ) {}

  private async call(path: string, body?: string): Promise<unknown> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.url.replace(/\/$/, '')}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`KV HTTP ${res.status}`);
      const j = (await res.json()) as { result?: unknown; error?: string };
      if (j.error) throw new Error(`KV error ${j.error}`);
      return j.result;
    } finally {
      clearTimeout(t);
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const r = await this.call(`get/${encodeURIComponent(key)}`);
    if (typeof r !== 'string') return null;
    try {
      return JSON.parse(r) as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, freshTtlSec: number, keepSec = DEFAULT_KEEP_SEC): Promise<void> {
    const now = Date.now();
    const entry: CacheEntry<T> = { value, storedAt: now, freshUntil: now + freshTtlSec * 1000 };
    await this.call(`set/${encodeURIComponent(key)}?EX=${Math.ceil(Math.max(keepSec, freshTtlSec))}`, JSON.stringify(entry));
  }

  async delete(key: string): Promise<void> {
    await this.call(`del/${encodeURIComponent(key)}`, '');
  }
}

/** 兩層快取：L1 記憶體 + L2 KV；KV 失敗時靜默降級為記憶體 */
export class TieredCache implements CacheStore {
  readonly kind: string;
  kvErrors = 0;
  constructor(
    readonly l1: MemoryLRU,
    readonly l2: CacheStore | null,
  ) {
    this.kind = l2 ? `memory+${l2.kind}` : 'memory';
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const a = await this.l1.get<T>(key);
    if (a && (a.freshUntil > Date.now() || !this.l2)) return a;
    if (this.l2) {
      try {
        const b = await this.l2.get<T>(key);
        if (b) {
          if (!a || b.storedAt >= a.storedAt) {
            this.l1.setEntry(key, b);
            return b;
          }
        }
      } catch {
        this.kvErrors++;
      }
    }
    return a;
  }

  async set<T>(key: string, value: T, freshTtlSec: number, keepSec?: number): Promise<void> {
    await this.l1.set(key, value, freshTtlSec, keepSec);
    if (this.l2) {
      try {
        await this.l2.set(key, value, freshTtlSec, keepSec);
      } catch {
        this.kvErrors++;
      }
    }
  }

  async delete(key: string): Promise<void> {
    await this.l1.delete(key);
    if (this.l2) {
      try {
        await this.l2.delete(key);
      } catch {
        this.kvErrors++;
      }
    }
  }
}

export function createCache(env: Record<string, string | undefined> = process.env): TieredCache {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return new TieredCache(new MemoryLRU(800), url && token ? new KvRestStore(url, token) : null);
}

/** 收盤後多久視為當日資料已發布（台股資料源約 14:30 更新，美股收盤後 30 分鐘） */
const PUBLISH: Record<Market, string> = { TW: '14:30', TWO: '14:30', US: '16:30' };

/** 距離下一次「收盤資料發布」的秒數 */
export function secondsUntilNextClose(market: Market, now = new Date()): number {
  const tz = MARKET_TZ[market];
  let d = localParts(now, tz).date;
  for (let i = 0; i < 15; i++) {
    if (isTradingDay(market, d)) {
      const t = zonedTimeToUtc(d, PUBLISH[market], tz);
      if (t > now.getTime()) return Math.max(60, Math.round((t - now.getTime()) / 1000));
    }
    d = addDays(d, 1);
  }
  return 86400;
}

export function ttlForInterval(interval: Interval, market: Market, now = new Date()): number {
  if (isIntraday(interval)) return 60;
  return secondsUntilNextClose(market, now);
}
