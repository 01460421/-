/**
 * 情境層（history / news / fundamentals / behavioral）共用快取。
 * 只「使用」lib/data-adapters/cache.ts 的公開 API（createCache），不修改它。
 *
 * cached(key, ttlSec, fn)：
 *  - 新鮮命中直接回傳；
 *  - 未命中則執行 fn 並寫入；
 *  - fn 失敗時若有過期快取，回傳過期值並標記 stale（降級），否則拋出原錯誤。
 */
import { createCache, type CacheStore } from '../data-adapters/cache';

let store: CacheStore | null = null;

export function contextCache(): CacheStore {
  if (!store) store = createCache();
  return store;
}

/** 測試用：替換 / 重設快取 */
export function setContextCache(c: CacheStore | null): void {
  store = c;
}

const inflight = new Map<string, Promise<unknown>>();

export interface CachedResult<T> {
  value: T;
  stale: boolean;
  storedAt: number;
}

export async function cachedWithMeta<T>(key: string, ttlSec: number, fn: () => Promise<T>, keepSec?: number): Promise<CachedResult<T>> {
  const c = contextCache();
  const hit = await c.get<T>(key).catch(() => null);
  if (hit && hit.freshUntil > Date.now()) return { value: hit.value, stale: false, storedAt: hit.storedAt };
  const running = inflight.get(key) as Promise<CachedResult<T>> | undefined;
  if (running) return running;
  const p = (async () => {
    try {
      const value = await fn();
      await c.set(key, value, ttlSec, keepSec).catch(() => undefined);
      return { value, stale: false, storedAt: Date.now() };
    } catch (e) {
      if (hit) return { value: hit.value, stale: true, storedAt: hit.storedAt };
      throw e;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>, keepSec?: number): Promise<T> {
  return (await cachedWithMeta(key, ttlSec, fn, keepSec)).value;
}

/** 日期是否已是「過去」（過去的資料可以長期快取） */
export function isPastDate(date: string, now = new Date()): boolean {
  return date < now.toISOString().slice(0, 10);
}
