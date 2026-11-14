// 儲存空間的單一入口。三種 driver（blob／file／memory）只負責搬字串，
// JSON、短暫的讀取快取、以及「讀 → 改 → 條件寫入」的重試都在這一層。
//
//   read(path, { maxAge })      → { data, etag }；檔案不存在時 data 是 null
//   write(path, data, { etag }) → 沒帶 etag 代表「建立」，已存在就丟 ConflictError；
//                                  有帶 etag 代表「更新」，ETag 變了就丟 ConflictError
//   remove(path | path[])
//   list(prefix)                → [{ path, uploadedAt（毫秒）, size }]
//   mutate(path, fn, { seed })  → 讀 → fn → 條件寫入，被搶先就重讀重做，最多六次
import { MUTATE_TRIES, env, storeKind } from './config.js';
import { createBlobDriver } from './store-blob.js';
import { ConflictError, StoreUnavailableError } from './store-errors.js';
import { createFileDriver } from './store-file.js';
import { createMemoryDriver } from './store-memory.js';
import { sleep } from './util.js';

export { ConflictError, StoreUnavailableError, storeKind };

// 路徑都是程式自己組的，這裡再擋一次，避免任何形式的 ../ 或怪字元
const SAFE_PATH = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*\.json$/i;

function checkPath(path) {
  if (typeof path !== 'string' || path.length > 200 || !SAFE_PATH.test(path)) {
    throw new Error(`unsafe storage path: ${String(path).slice(0, 80)}`);
  }
  return path;
}

function parse(body) {
  if (body === null) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null; // 壞掉的檔案當成空的（和 v1 相同），下一次寫入會把它蓋掉
  }
}

export function createStore(driver) {
  /** path → { body, etag, at }：存的是字串，每次讀都重新解析，呼叫端拿到的物件可以放心改 */
  const cache = new Map();
  const remember = (path, body, etag) => cache.set(path, { body, etag, at: Date.now() });

  async function read(path, { maxAge = 0 } = {}) {
    checkPath(path);
    if (maxAge > 0) {
      const hit = cache.get(path);
      if (hit && Date.now() - hit.at < maxAge) return { data: parse(hit.body), etag: hit.etag };
    }
    const { body, etag } = await driver.get(path);
    remember(path, body, etag);
    return { data: parse(body), etag };
  }

  async function write(path, data, { etag } = {}) {
    checkPath(path);
    const body = JSON.stringify(data);
    try {
      const result = await driver.put(path, body, { etag: etag || null });
      remember(path, body, result.etag);
      return result;
    } catch (error) {
      cache.delete(path); // 不管為什麼失敗，快取裡的那份都不可信了
      throw error;
    }
  }

  async function remove(pathOrPaths) {
    const paths = (Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths]).map(checkPath);
    if (!paths.length) return;
    for (const path of paths) cache.delete(path);
    await driver.del(paths);
  }

  function list(prefix = '') {
    return driver.list(prefix);
  }

  /**
   * @param {string} path
   * @param {(data: any, info: { attempt: number }) => any} fn
   *   拿到目前的內容（不存在是 null），回傳 { data, result }；
   *   data 是要寫回去的新內容，省略（undefined）代表這次不用寫。fn 可以是 async，也可以丟例外中止。
   *   因為可能重跑，fn 不能有「做一次就好」的副作用。
   * @param {{ seed?: { data: any, etag: string|null } }} [options]
   *   seed 是剛剛才讀到的快照，第一輪直接拿來用，省一次讀取。
   * @returns fn 回傳的 result
   */
  async function mutate(path, fn, { seed } = {}) {
    checkPath(path);
    const base = driver.retryBaseMs ?? 40;
    let lastError;
    for (let attempt = 0; attempt < MUTATE_TRIES; attempt += 1) {
      const current = attempt === 0 && seed ? seed : await read(path);
      const out = await fn(current.data, { attempt });
      if (!out || out.data === undefined) return out?.result;
      try {
        await write(path, out.data, { etag: current.etag });
        return out.result;
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        lastError = error;
        await sleep(base + Math.random() * base * 3); // 加一點隨機的間隔，免得兩邊一直撞在一起
      }
    }
    throw lastError;
  }

  return { kind: driver.kind, driver, read, write, remove, list, mutate };
}

// ---------- 目前的 store（依環境變數決定，測試可以重設） ----------

let current = null; // { key, store }

/** 取得儲存空間；沒有可用的就丟 StoreUnavailableError（對外是 503 no_store） */
export function getStore() {
  const kind = storeKind();
  if (kind === 'none') throw new StoreUnavailableError();

  const key = kind === 'file' ? `file:${env.dataDir}` : kind;
  if (!current || current.key !== key) {
    const driver =
      kind === 'blob' ? createBlobDriver() : kind === 'file' ? createFileDriver(env.dataDir) : createMemoryDriver();
    current = { key, store: createStore(driver) };
  }
  return current.store;
}

/** 測試用：丟掉目前的 store（memory 的資料也一起清空） */
export function resetStore() {
  current = null;
}
