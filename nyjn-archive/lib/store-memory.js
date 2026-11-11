// 記憶體 driver：測試用，行程結束就消失。
// 每個操作都先讓出一次事件迴圈，讓並行的請求真的會交錯（這樣才測得到條件寫入的重試）。
import { ConflictError } from './store-errors.js';

const yieldOnce = () => new Promise((resolve) => setImmediate(resolve));

export function createMemoryDriver() {
  /** path → { body, etag, uploadedAt } */
  const files = new Map();
  const stats = { reads: 0, writes: 0, removes: 0, lists: 0 };
  let seq = 0;

  return {
    kind: 'memory',
    retryBaseMs: 1,
    files, // 測試可以直接看或改
    stats,

    async get(path) {
      stats.reads += 1;
      await yieldOnce();
      const file = files.get(path);
      return file ? { body: file.body, etag: file.etag } : { body: null, etag: null };
    },

    async put(path, body, { etag } = {}) {
      stats.writes += 1;
      await yieldOnce();
      const file = files.get(path);
      const ok = etag ? Boolean(file) && file.etag === etag : !file;
      if (!ok) throw new ConflictError(path);
      seq += 1;
      const next = { body, etag: `"m${seq}"`, uploadedAt: Date.now() };
      files.set(path, next);
      return { etag: next.etag };
    },

    async del(paths) {
      stats.removes += 1;
      await yieldOnce();
      for (const path of paths) files.delete(path);
    },

    async list(prefix = '') {
      stats.lists += 1;
      await yieldOnce();
      const out = [];
      for (const [path, file] of files) {
        if (path.startsWith(prefix)) {
          out.push({ path, uploadedAt: file.uploadedAt, size: Buffer.byteLength(file.body) });
        }
      }
      return out.sort((a, b) => (a.path < b.path ? -1 : 1));
    },
  };
}
