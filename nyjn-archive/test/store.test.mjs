// 儲存層：三種 driver 的條件寫入、mutate 的重試、讀取快取、driver 的選擇，以及沒有儲存空間時的 503。
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, test } from 'node:test';
import { BlobPreconditionFailedError, BlobStoreSuspendedError } from '@vercel/blob';
import admin from '../api/admin.js';
import board from '../api/board.js';
import caseApi from '../api/case.js';
import sweep from '../api/cron/sweep.js';
import health from '../api/health.js';
import pulse from '../api/pulse.js';
import react from '../api/react.js';
import report from '../api/report.js';
import vote from '../api/vote.js';
import { createBlobDriver } from '../lib/store-blob.js';
import { createFileDriver } from '../lib/store-file.js';
import { createMemoryDriver } from '../lib/store-memory.js';
import { ConflictError, StoreUnavailableError, createStore, getStore, storeKind } from '../lib/store.js';
import { ALICE, call, freshWorld } from './helpers.mjs';

const tmpDirs = [];
async function tmpDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'nyjn-test-'));
  tmpDirs.push(dir);
  return dir;
}
after(async () => {
  for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  freshWorld();
});

// 同一組測試跑在 memory 和 file 兩種 driver 上：它們必須有一樣的條件寫入語意
const drivers = {
  memory: async () => createMemoryDriver(),
  file: async () => createFileDriver(await tmpDir()),
};

for (const [name, makeDriver] of Object.entries(drivers)) {
  describe(`${name} driver`, () => {
    let store;
    beforeEach(async () => {
      store = createStore(await makeDriver());
    });

    test('read of a missing document gives null data and no etag', async () => {
      assert.deepEqual(await store.read('board/h33.json'), { data: null, etag: null });
    });

    test('create must fail when the document already exists', async () => {
      const created = await store.write('sys/site.json', { n: 1 });
      assert.ok(created.etag);
      await assert.rejects(store.write('sys/site.json', { n: 2 }), ConflictError);
      assert.deepEqual((await store.read('sys/site.json')).data, { n: 1 });
    });

    test('update must fail when the etag has changed (or the document is gone)', async () => {
      await store.write('sys/site.json', { n: 1 });
      const first = await store.read('sys/site.json');
      await store.write('sys/site.json', { n: 2 }, { etag: first.etag });

      await assert.rejects(store.write('sys/site.json', { n: 3 }, { etag: first.etag }), (error) => {
        assert.ok(error instanceof ConflictError);
        assert.equal(error.code, 'conflict');
        return true;
      });
      assert.deepEqual((await store.read('sys/site.json')).data, { n: 2 });

      await store.remove('sys/site.json');
      await assert.rejects(store.write('sys/site.json', { n: 4 }, { etag: first.etag }), ConflictError);
      assert.equal((await store.read('sys/site.json')).data, null);
    });

    test('the etag changes with every write and round-trips unicode', async () => {
      const a = await store.write('board/h33.json', { items: [{ x: '逆雨 🌧️' }] });
      const read = await store.read('board/h33.json');
      assert.equal(read.etag, a.etag);
      assert.deepEqual(read.data, { items: [{ x: '逆雨 🌧️' }] });
      const b = await store.write('board/h33.json', { items: [] }, { etag: read.etag });
      assert.notEqual(b.etag, a.etag);
    });

    test('list returns path, uploadedAt and size, filtered by prefix', async () => {
      await store.write('board/h33.json', { items: [] });
      await store.write('case/abc.json', { rev: 1 });
      await store.write('case/def.json', { rev: 2 });
      const all = await store.list('');
      assert.deepEqual(all.map((f) => f.path), ['board/h33.json', 'case/abc.json', 'case/def.json']);
      for (const file of all) {
        assert.equal(typeof file.uploadedAt, 'number');
        assert.ok(Math.abs(file.uploadedAt - Date.now()) < 60_000);
        assert.ok(file.size > 0);
      }
      assert.deepEqual((await store.list('case/')).map((f) => f.path), ['case/abc.json', 'case/def.json']);
      assert.deepEqual(await store.list('nothing/'), []);
    });

    test('remove takes one path or many and ignores missing ones', async () => {
      await store.write('case/abc.json', { rev: 1 });
      await store.write('case/def.json', { rev: 2 });
      await store.remove('case/abc.json');
      await store.remove(['case/def.json', 'case/never-existed.json']);
      await store.remove([]);
      assert.deepEqual(await store.list(''), []);
    });

    test('unsafe paths are refused', async () => {
      for (const bad of ['../etc/passwd.json', 'board/../../x.json', '/abs.json', 'board/h33', 'a b.json', 'board\\h33.json', '']) {
        await assert.rejects(store.read(bad), /unsafe storage path/, bad);
        await assert.rejects(store.write(bad, {}), /unsafe storage path/, bad);
      }
    });

    test('a corrupt document reads as null but can still be overwritten', async () => {
      await store.driver.put('board/h33.json', '{ not json');
      const broken = await store.read('board/h33.json');
      assert.equal(broken.data, null);
      assert.ok(broken.etag);
      await store.mutate('board/h33.json', (data) => {
        assert.equal(data, null);
        return { data: { items: [] } };
      });
      assert.deepEqual((await store.read('board/h33.json')).data, { items: [] });
    });

    test('mutate: read → change → conditional write, returning the result', async () => {
      const first = await store.mutate('sys/poll.json', (data) => {
        assert.equal(data, null);
        return { data: { n: 1 }, result: 'created' };
      });
      assert.equal(first, 'created');
      const second = await store.mutate('sys/poll.json', (data) => ({ data: { n: data.n + 1 }, result: data.n + 1 }));
      assert.equal(second, 2);
      // 沒有回傳 data：不寫
      const etag = (await store.read('sys/poll.json')).etag;
      assert.equal(await store.mutate('sys/poll.json', (data) => ({ result: `still ${data.n}` })), 'still 2');
      assert.equal((await store.read('sys/poll.json')).etag, etag);
    });

    test('mutate retries when someone else writes in between (both changes land)', async () => {
      await store.write('board/h33.json', { items: ['seed'] });
      let attempts = 0;
      await store.mutate('board/h33.json', async (data) => {
        attempts += 1;
        if (attempts === 1) {
          // 模擬另一個請求在我們「讀完之後、寫入之前」搶先寫了一筆
          await store.mutate('board/h33.json', (other) => ({ data: { items: [...other.items, 'theirs'] } }));
        }
        return { data: { items: [...data.items, 'mine'] } };
      });
      assert.equal(attempts, 2, 'the first attempt lost the race and was redone on fresh data');
      assert.deepEqual((await store.read('board/h33.json')).data, { items: ['seed', 'theirs', 'mine'] });
    });

    test('mutate: interleaved concurrent mutations all land', async () => {
      const writers = Array.from({ length: 5 }, (_, i) =>
        store.mutate('sys/site.json', (data) => ({ data: { list: [...(data?.list || []), i] } })),
      );
      await Promise.all(writers);
      const { list } = (await store.read('sys/site.json')).data;
      assert.deepEqual([...list].sort(), [0, 1, 2, 3, 4]);
    });

    test('mutate gives up after six conflicting attempts', async () => {
      await store.write('sys/site.json', { n: 0 });
      let attempts = 0;
      const stubborn = store.mutate('sys/site.json', async (data) => {
        attempts += 1;
        await store.mutate('sys/site.json', (other) => ({ data: { n: other.n + 1 } })); // 每一輪都被搶先
        return { data: { n: data.n + 100 } };
      });
      await assert.rejects(stubborn, ConflictError);
      assert.equal(attempts, 6);
      assert.deepEqual((await store.read('sys/site.json')).data, { n: 6 });
    });

    test('mutate: an exception from fn aborts without writing, other errors are not retried', async () => {
      await store.write('sys/site.json', { n: 0 });
      let calls = 0;
      await assert.rejects(
        store.mutate('sys/site.json', () => {
          calls += 1;
          throw new Error('nope');
        }),
        /nope/,
      );
      assert.equal(calls, 1);
      assert.deepEqual((await store.read('sys/site.json')).data, { n: 0 });
    });

    test('mutate with a seed skips the first read but still retries on conflict', async () => {
      await store.write('sys/site.json', { n: 1 });
      const seed = await store.read('sys/site.json');
      await store.mutate('sys/site.json', (data) => ({ data: { n: data.n + 1 } })); // 快照過期了
      const seen = [];
      await store.mutate(
        'sys/site.json',
        (data) => {
          seen.push(data.n);
          return { data: { n: data.n + 10 } };
        },
        { seed },
      );
      assert.deepEqual(seen, [1, 2], 'first the stale seed, then a fresh read');
      assert.deepEqual((await store.read('sys/site.json')).data, { n: 12 });
    });
  });
}

describe('read cache', () => {
  test('maxAge serves repeated reads from memory; plain reads and mutate always hit the driver', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const driver = createMemoryDriver();
    const store = createStore(driver);
    await store.write('board/h33.json', { items: [1] });
    driver.stats.reads = 0;

    const cached = await store.read('board/h33.json', { maxAge: 5000 });
    assert.deepEqual(cached.data, { items: [1] });
    assert.equal(driver.stats.reads, 0, 'our own write primed the cache');

    cached.data.items.push('local change'); // 呼叫端改自己拿到的那份，不會污染快取
    assert.deepEqual((await store.read('board/h33.json', { maxAge: 5000 })).data, { items: [1] });

    await store.read('board/h33.json');
    assert.equal(driver.stats.reads, 1, 'no maxAge → always fresh');

    await store.mutate('board/h33.json', (data) => ({ data: { items: [...data.items, 2] } }));
    assert.equal(driver.stats.reads, 2, 'mutate always re-reads');
    assert.deepEqual((await store.read('board/h33.json', { maxAge: 5000 })).data, { items: [1, 2] });
    assert.equal(driver.stats.reads, 2);

    t.mock.timers.tick(5001);
    await store.read('board/h33.json', { maxAge: 5000 });
    assert.equal(driver.stats.reads, 3, 'expired after maxAge');

    await store.remove('board/h33.json');
    assert.equal((await store.read('board/h33.json', { maxAge: 5000 })).data, null);
  });
});

describe('file driver specifics', () => {
  test('documents are plain JSON files under the data directory, with no temp files left behind', async () => {
    const dir = await tmpDir();
    const store = createStore(createFileDriver(dir));
    await store.write('board/h33.json', { items: [{ id: 'a' }] });
    await store.mutate('board/h33.json', (data) => ({ data: { items: [...data.items, { id: 'b' }] } }));
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'board', 'h33.json'), 'utf8')), {
      items: [{ id: 'a' }, { id: 'b' }],
    });
    assert.deepEqual(await readdir(path.join(dir, 'board')), ['h33.json']);
  });

  test('NYJN_STORE=file works end to end through a handler', async () => {
    const dir = await tmpDir();
    freshWorld({ NYJN_STORE: 'file', NYJN_DATA_DIR: dir });
    assert.equal(getStore().kind, 'file');
    const posted = await call(board, { method: 'POST', url: '/api/board', body: { k: 'h33', o: ALICE, x: '寫進檔案' } });
    assert.equal(posted.status, 201);
    const listed = await call(board, { url: '/api/board?k=h33&fresh=1' });
    assert.deepEqual(listed.json.items.map((i) => i.x), ['寫進檔案']);
    assert.deepEqual((await readdir(dir)).sort(), ['board', 'sys']);
    assert.equal((await call(health, { url: '/api/health' })).json.store, 'file');
  });
});

describe('blob driver (against a fake SDK — no network)', () => {
  /** 模仿 @vercel/blob 2.x 的行為：get 找不到回 null、put 依 allowOverwrite／ifMatch 決定成敗 */
  function fakeSdk({ existsError = () => new Error('Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it.') } = {}) {
    const blobs = new Map();
    const calls = [];
    let seq = 0;
    return {
      blobs,
      calls,
      BlobPreconditionFailedError,
      async get(pathname, options) {
        calls.push(['get', pathname, options]);
        const blob = blobs.get(pathname);
        if (!blob) return null;
        return { statusCode: 200, stream: new Response(blob.body).body, headers: new Headers(), blob: { pathname, etag: blob.etag } };
      },
      async put(pathname, body, options) {
        calls.push(['put', pathname, options]);
        const blob = blobs.get(pathname);
        if (options.ifMatch) {
          if (!blob || blob.etag !== options.ifMatch) throw new BlobPreconditionFailedError();
        } else if (blob && !options.allowOverwrite) {
          throw existsError();
        }
        seq += 1;
        blobs.set(pathname, { body, etag: `"etag-${seq}"`, uploadedAt: new Date(1700000000000 + seq) });
        return { pathname, url: `https://store.private.blob.vercel-storage.com/${pathname}`, etag: `"etag-${seq}"` };
      },
      async del(pathnames, options) {
        calls.push(['del', pathnames, options]);
        for (const pathname of pathnames) blobs.delete(pathname);
      },
      async head(pathname) {
        calls.push(['head', pathname]);
        return { etag: blobs.get(pathname)?.etag };
      },
      async list(options) {
        calls.push(['list', options]);
        const all = [...blobs.entries()].filter(([pathname]) => pathname.startsWith(options.prefix || ''));
        const start = options.cursor ? Number(options.cursor) : 0;
        const page = all.slice(start, start + 2); // 故意一頁只給兩筆，測分頁
        return {
          blobs: page.map(([pathname, blob]) => ({ pathname, size: blob.body.length, uploadedAt: blob.uploadedAt, etag: blob.etag })),
          hasMore: start + 2 < all.length,
          cursor: start + 2 < all.length ? String(start + 2) : undefined,
        };
      },
    };
  }

  test('uses private access, bypasses the CDN cache on reads, and never adds a random suffix', async () => {
    const sdk = fakeSdk();
    const store = createStore(createBlobDriver(sdk));
    assert.deepEqual(await store.read('board/h33.json'), { data: null, etag: null });
    await store.write('board/h33.json', { items: [] });
    const read = await store.read('board/h33.json');
    assert.deepEqual(read, { data: { items: [] }, etag: '"etag-1"' });
    await store.write('board/h33.json', { items: [1] }, { etag: read.etag });

    const [, , getOptions] = sdk.calls.find(([name]) => name === 'get');
    assert.equal(getOptions.access, 'private');
    assert.equal(getOptions.useCache, false);
    assert.ok(getOptions.abortSignal instanceof AbortSignal);

    const puts = sdk.calls.filter(([name]) => name === 'put').map(([, , options]) => options);
    assert.equal(puts[0].access, 'private');
    assert.equal(puts[0].addRandomSuffix, false);
    assert.equal(puts[0].contentType, 'application/json');
    assert.equal(puts[0].allowOverwrite, false, 'create must not overwrite');
    assert.equal(puts[0].ifMatch, undefined);
    assert.equal(puts[1].allowOverwrite, true);
    assert.equal(puts[1].ifMatch, '"etag-1"', 'update is conditional on the etag we read');
  });

  test('a failed precondition becomes ConflictError, and mutate retries through it', async () => {
    const sdk = fakeSdk();
    const store = createStore(createBlobDriver(sdk));
    await store.write('sys/site.json', { n: 1 });
    const stale = await store.read('sys/site.json');
    await store.write('sys/site.json', { n: 2 }, { etag: stale.etag });
    await assert.rejects(store.write('sys/site.json', { n: 3 }, { etag: stale.etag }), ConflictError);

    let attempts = 0;
    await store.mutate('sys/site.json', async (data) => {
      attempts += 1;
      if (attempts === 1) sdk.blobs.set('sys/site.json', { body: '{"n":50}', etag: '"changed-elsewhere"' });
      return { data: { n: data.n + 1 } };
    });
    assert.equal(attempts, 2);
    assert.deepEqual((await store.read('sys/site.json')).data, { n: 51 });
  });

  test('creating a document that already exists becomes ConflictError — whatever the SDK error looks like', async () => {
    const withMessage = createStore(createBlobDriver(fakeSdk()));
    await withMessage.write('sys/poll.json', { n: 1 });
    await assert.rejects(withMessage.write('sys/poll.json', { n: 2 }), ConflictError);

    // 訊息改掉了也認得出來：建立失敗後會實際確認檔案在不在
    const opaque = fakeSdk({ existsError: () => new Error('Vercel Blob: Unknown error, please visit https://vercel.com/help.') });
    const store = createStore(createBlobDriver(opaque));
    await store.write('sys/poll.json', { n: 1 });
    await assert.rejects(store.write('sys/poll.json', { n: 2 }), ConflictError);
    assert.deepEqual((await store.read('sys/poll.json')).data, { n: 1 });
  });

  test('a create that fails for another reason is not mistaken for a conflict', async () => {
    const sdk = fakeSdk();
    sdk.put = async () => {
      throw new Error('socket hang up');
    };
    const store = createStore(createBlobDriver(sdk));
    await assert.rejects(store.write('sys/poll.json', { n: 1 }), /socket hang up/);
  });

  test('list follows the cursor; remove sends pathnames in one call', async () => {
    const sdk = fakeSdk();
    const store = createStore(createBlobDriver(sdk));
    for (const name of ['a', 'b', 'c', 'd', 'e']) await store.write(`rl/${name}.json`, { t: [1] });
    await store.write('board/h33.json', { items: [] });

    const listed = await store.list('rl/');
    assert.deepEqual(listed.map((f) => f.path), ['rl/a.json', 'rl/b.json', 'rl/c.json', 'rl/d.json', 'rl/e.json']);
    assert.equal(typeof listed[0].uploadedAt, 'number');
    assert.equal(sdk.calls.filter(([name]) => name === 'list').length, 3);

    await store.remove(listed.map((f) => f.path));
    const dels = sdk.calls.filter(([name]) => name === 'del');
    assert.equal(dels.length, 1);
    assert.equal(dels[0][1].length, 5);
    assert.deepEqual([...sdk.blobs.keys()], ['board/h33.json']);
  });

  test('a suspended or missing store surfaces as 503 no_store, not a 500', async () => {
    const sdk = fakeSdk();
    sdk.get = async () => {
      throw new BlobStoreSuspendedError();
    };
    const store = createStore(createBlobDriver(sdk));
    await assert.rejects(store.read('board/h33.json'), StoreUnavailableError);

    const noCredentials = fakeSdk();
    noCredentials.put = async () => {
      throw new Error('Vercel Blob: No blob credentials found. Pass a `token` option, set `BLOB_READ_WRITE_TOKEN`, …');
    };
    await assert.rejects(createStore(createBlobDriver(noCredentials)).write('board/h33.json', {}), StoreUnavailableError);
  });
});

describe('driver selection', () => {
  const pick = (env) => {
    freshWorld();
    delete process.env.NYJN_STORE;
    Object.assign(process.env, env);
    return storeKind();
  };

  test('NYJN_STORE wins; then a Blob token; then "none" on Vercel; otherwise local files', () => {
    assert.equal(pick({}), 'file');
    assert.equal(pick({ VERCEL: '1' }), 'none');
    assert.equal(pick({ VERCEL: '1', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_abc_def' }), 'blob');
    assert.equal(pick({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_abc_def' }), 'blob');
    assert.equal(pick({ VERCEL: '1', BLOB_STORE_ID: 'store_abc' }), 'blob', 'OIDC mode: store id without a token');
    assert.equal(pick({ NYJN_STORE: 'memory', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_abc_def', VERCEL: '1' }), 'memory');
    assert.equal(pick({ NYJN_STORE: 'file', VERCEL: '1' }), 'file');
    assert.equal(pick({ NYJN_STORE: ' Blob ' }), 'blob');
    assert.equal(pick({ NYJN_STORE: 'none' }), 'none');
  });

  test('getStore keeps one instance per kind', () => {
    freshWorld();
    assert.equal(getStore(), getStore());
    assert.equal(getStore().kind, 'memory');
  });
});

describe('no storage (running on Vercel without a Blob store)', () => {
  beforeEach(() => {
    freshWorld({ ADMIN_KEY: 'k' });
    delete process.env.NYJN_STORE;
    process.env.VERCEL = '1';
  });

  test('health still answers 200, with ok:false and store:"none"', async () => {
    const res = await call(health, { url: '/api/health' });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.store, 'none');
    assert.equal(res.json.api, 2);
    assert.equal(res.json.v, '2.0.0');
  });

  test('every storage-touching endpoint answers 503 no_store', async () => {
    const id = 'ab'.repeat(32);
    const requests = [
      [board, { url: '/api/board?k=h33' }],
      [board, { url: '/api/board?k=not-even-valid' }],
      [board, { method: 'POST', url: '/api/board', body: { k: 'h33', o: ALICE, x: 'hi' } }],
      [board, { method: 'POST', url: '/api/board', body: { k: 'h33', o: ALICE, x: 'hi', hp: 'bot' } }],
      [board, { method: 'DELETE', url: '/api/board?k=h33&id=abcdef1234', headers: { 'x-owner': ALICE } }],
      [react, { method: 'POST', url: '/api/react', body: { k: 'h33', id: 'abcdef1234', o: ALICE, r: 'a' } }],
      [report, { method: 'POST', url: '/api/report', body: { k: 'h33', id: 'abcdef1234', o: ALICE } }],
      [pulse, { url: '/api/pulse' }],
      [vote, { method: 'POST', url: '/api/vote', body: { o: ALICE, storm: 1 } }],
      [caseApi, { url: `/api/case?id=${id}` }],
      [caseApi, { method: 'PUT', url: '/api/case', body: { id, data: 'x' } }],
      [caseApi, { method: 'DELETE', url: `/api/case?id=${id}` }],
      [admin, { url: '/api/admin?view=queue', headers: { 'x-admin-key': 'k' } }],
      [admin, { url: '/api/admin?view=export', headers: { 'x-admin-key': 'k' } }],
      [admin, { method: 'POST', url: '/api/admin', body: { act: 'recount' }, headers: { 'x-admin-key': 'k' } }],
      [admin, { method: 'POST', url: '/api/admin', body: { act: 'hide', k: 'h33', id: 'abcdef1234' }, headers: { 'x-admin-key': 'k' } }],
      [sweep, { url: '/api/cron/sweep', headers: { 'x-admin-key': 'k' } }],
    ];
    for (const [handler, options] of requests) {
      const res = await call(handler, options);
      assert.equal(res.status, 503, `${options.method || 'GET'} ${options.url}`);
      assert.equal(res.json.code, 'no_store');
      assert.equal(typeof res.json.error, 'string');
      assert.equal(res.headers['cache-control'], 'no-store');
    }
  });

  test('admin ping needs no storage', async () => {
    assert.equal((await call(admin, { url: '/api/admin?view=ping', headers: { 'x-admin-key': 'k' } })).status, 200);
  });
});

describe('health', () => {
  test('documented shape, cache header, and no storage access', async () => {
    const store = freshWorld();
    const res = await call(health, { url: '/api/health' });
    assert.equal(res.status, 200);
    const { t, ...rest } = res.json;
    assert.deepEqual(rest, {
      ok: true,
      api: 2,
      v: '2.0.0',
      store: 'memory',
      features: ['board', 'react', 'report', 'vote', 'pulse', 'case', 'admin'],
      limits: { relay: 240, theory: 400, piece: 1200, items: 500 },
    });
    assert.ok(Math.abs(t - Date.now()) < 5000);
    assert.equal(res.headers['cache-control'], 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    assert.deepEqual(store.driver.stats, { reads: 0, writes: 0, removes: 0, lists: 0 });
    assert.equal((await call(health, { method: 'POST', url: '/api/health', body: {} })).status, 405);
  });
});
