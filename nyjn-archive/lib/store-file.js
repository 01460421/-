// 檔案 driver：本機開發用，把每份文件存成 NYJN_DATA_DIR（預設 .data/）底下的 JSON 檔。
// ETag 是內容的雜湊。「比對 ETag → 寫入」用行程內的鎖串起來，所以只保證單一行程內不會互相蓋掉；
// 同時開兩個開發伺服器指向同一個資料夾不在保證範圍內。
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { ConflictError } from './store-errors.js';
import { sha1 } from './util.js';

const etagOf = (body) => `"${sha1(body)}"`;

export function createFileDriver(dataDir) {
  const root = resolve(dataDir);
  /** path → 排在最後面的那個工作（簡單的互斥鎖） */
  const tails = new Map();
  let tmpSeq = 0;

  const fileOf = (path) => join(root, ...path.split('/'));

  function withLock(path, task) {
    const previous = tails.get(path) || Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => {});
    tails.set(path, tail);
    tail.then(() => {
      if (tails.get(path) === tail) tails.delete(path);
    });
    return run;
  }

  async function get(path) {
    try {
      const body = await readFile(fileOf(path), 'utf8');
      return { body, etag: etagOf(body) };
    } catch (error) {
      if (error.code === 'ENOENT') return { body: null, etag: null };
      throw error;
    }
  }

  return {
    kind: 'file',
    retryBaseMs: 2,
    root,
    get,

    put(path, body, { etag } = {}) {
      return withLock(path, async () => {
        const current = await get(path);
        const ok = etag ? current.etag === etag : current.etag === null;
        if (!ok) throw new ConflictError(path);

        // 先寫暫存檔再改名，讀的人不會讀到寫一半的內容
        const target = fileOf(path);
        await mkdir(dirname(target), { recursive: true });
        tmpSeq += 1;
        const tmp = `${target}.${process.pid}.${tmpSeq}.tmp`;
        await writeFile(tmp, body, 'utf8');
        await rename(tmp, target);
        return { etag: etagOf(body) };
      });
    },

    async del(paths) {
      for (const path of paths) {
        await withLock(path, async () => {
          try {
            await unlink(fileOf(path));
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        });
      }
    },

    async list(prefix = '') {
      let entries;
      try {
        entries = await readdir(root, { recursive: true, withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
      const out = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const full = join(entry.parentPath ?? entry.path, entry.name);
        const path = full.slice(root.length + 1).split(sep).join('/');
        if (!path.startsWith(prefix)) continue;
        try {
          const info = await stat(full);
          out.push({ path, uploadedAt: info.mtimeMs, size: info.size });
        } catch {
          // 列表途中被刪掉的檔案就跳過
        }
      }
      return out.sort((a, b) => (a.path < b.path ? -1 : 1));
    },
  };
}
