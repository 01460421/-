import type { Store } from './types';
import { MemoryStore } from './memory';

export type { Store, SnapshotQuery, EventQuery } from './types';
export { MemoryStore } from './memory';

const g = globalThis as unknown as { __sflStore?: Store };

/** 取得全域儲存實例：有 DATABASE_URL / POSTGRES_URL 時用 Postgres，否則記憶體備援。 */
export async function getStore(): Promise<Store> {
  if (g.__sflStore) return g.__sflStore;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const { PostgresStore } = await import('./postgres');
    g.__sflStore = new PostgresStore(url);
  } else {
    g.__sflStore = new MemoryStore();
  }
  return g.__sflStore;
}

/** 測試用：注入儲存實例 */
export function setStore(s: Store | undefined) {
  g.__sflStore = s;
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}
