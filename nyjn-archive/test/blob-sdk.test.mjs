// Blob driver 接上「真正的」@vercel/blob SDK，但用 undici 的 MockAgent 把 HTTP 攔下來（完全不連網）。
// 目的：確認我們傳給 SDK 的選項，真的變成預期的請求（私有存取、不經快取、條件寫入的標頭），
// 以及 SDK 的錯誤有被翻成 ConflictError／StoreUnavailableError。升級 SDK 時這裡會先知道。
// 伺服器端的回應內容是依 SDK 的錯誤對照表模擬的，不代表真實服務的每個細節。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, describe, test } from 'node:test';
import { createBlobDriver } from '../lib/store-blob.js';
import { ConflictError, StoreUnavailableError, createStore } from '../lib/store.js';

const STORE_ID = 'teststoreid';
const CDN = `https://${STORE_ID}.private.blob.vercel-storage.com`;
const JSON_HEADERS = { headers: { 'content-type': 'application/json' } };

// undici 是 @vercel/blob 自己的相依套件；SDK 用的就是這一份，所以攔得到
let undici = null;
try {
  undici = createRequire(import.meta.url)('undici');
} catch {
  undici = null;
}

describe('blob driver + real SDK (HTTP intercepted)', { skip: undici ? false : 'undici is not resolvable' }, () => {
  let api;
  let cdn;
  let driver;
  const seen = [];

  /** 攔下一次請求，記下它的樣子，回傳指定的回應 */
  function expectCall(pool, match, status, body, headers = JSON_HEADERS.headers) {
    pool.intercept(match).reply((options) => {
      seen.push({ method: options.method, path: options.path, headers: options.headers, body: options.body });
      return { statusCode: status, data: typeof body === 'string' ? body : JSON.stringify(body), responseOptions: { headers } };
    });
  }
  const putCall = { path: (p) => p.startsWith('/api/blob/?pathname='), method: 'PUT' };
  const getCall = (pathname) => ({ path: (p) => p.split('?')[0] === `/${pathname}`, method: 'GET' });
  const putResult = (pathname, etag) => ({
    url: `${CDN}/${pathname}`,
    downloadUrl: `${CDN}/${pathname}?download=1`,
    pathname,
    contentType: 'application/json',
    contentDisposition: 'inline',
    etag,
  });
  const apiError = (code, message = code) => ({ error: { code, message } });

  before(() => {
    for (const name of ['BLOB_STORE_ID', 'VERCEL_OIDC_TOKEN', 'VERCEL_BLOB_API_URL']) delete process.env[name];
    process.env.BLOB_READ_WRITE_TOKEN = `vercel_blob_rw_${STORE_ID}_notarealsecret`;
    const agent = new undici.MockAgent();
    agent.disableNetConnect(); // 沒被攔到的請求一律失敗，保證測試不會真的連出去
    undici.setGlobalDispatcher(agent);
    api = agent.get('https://vercel.com');
    cdn = agent.get(CDN);
    driver = createBlobDriver();
  });

  test('read: private URL with ?cache=0; 404 means "no document"', async () => {
    expectCall(cdn, getCall('board/h33.json'), 404, 'Not Found', {});
    assert.deepEqual(await driver.get('board/h33.json'), { body: null, etag: null });

    expectCall(cdn, getCall('board/h33.json'), 200, '{"items":[]}', { etag: '"v1"', 'content-type': 'application/json' });
    assert.deepEqual(await driver.get('board/h33.json'), { body: '{"items":[]}', etag: '"v1"' });

    const request = seen.at(-1);
    assert.equal(request.path, '/board/h33.json?cache=0', 'useCache:false bypasses the CDN cache');
    assert.match(request.headers.authorization, /^Bearer vercel_blob_rw_/);
  });

  test('create: must not overwrite, no random suffix, private', async () => {
    expectCall(api, putCall, 200, putResult('sys/site.json', '"v1"'));
    assert.deepEqual(await driver.put('sys/site.json', '{"v":2}'), { etag: '"v1"' });

    const { path, headers, body } = seen.at(-1);
    assert.equal(path, '/api/blob/?pathname=sys%2Fsite.json');
    assert.equal(headers['x-vercel-blob-access'], 'private');
    assert.equal(headers['x-add-random-suffix'], '0');
    assert.equal(headers['x-allow-overwrite'], '0');
    assert.equal(headers['x-if-match'], undefined);
    assert.equal(headers['x-content-type'], 'application/json');
    assert.equal(body, '{"v":2}');
  });

  test('update: sends the etag as x-if-match; a failed precondition becomes ConflictError', async () => {
    expectCall(api, putCall, 200, putResult('sys/site.json', '"v2"'));
    await driver.put('sys/site.json', '{"v":2,"n":1}', { etag: '"v1"' });
    assert.equal(seen.at(-1).headers['x-if-match'], '"v1"');
    assert.equal(seen.at(-1).headers['x-allow-overwrite'], '1');

    expectCall(api, putCall, 412, apiError('precondition_failed'));
    await assert.rejects(driver.put('sys/site.json', '{"v":2,"n":2}', { etag: '"v1"' }), ConflictError);
  });

  test('create when the blob already exists becomes ConflictError (by message, or by checking)', async () => {
    expectCall(api, putCall, 400, apiError('bad_request', 'This blob already exists, use `allowOverwrite: true` if you want to overwrite it.'));
    await assert.rejects(driver.put('sys/poll.json', '{}'), ConflictError);

    // 伺服器換了一種說法：driver 會讀一次確認檔案真的在
    expectCall(api, putCall, 409, apiError('some_new_code', 'nope'));
    expectCall(cdn, getCall('sys/poll.json'), 200, '{}', { etag: '"v9"' });
    await assert.rejects(driver.put('sys/poll.json', '{}'), ConflictError);

    // 建立失敗而且檔案也不在：不是衝突，原樣往外丟
    expectCall(api, putCall, 400, apiError('bad_request', 'something else is wrong'));
    expectCall(cdn, getCall('sys/poll.json'), 404, '', {});
    await assert.rejects(driver.put('sys/poll.json', '{}'), /something else is wrong/);
  });

  test('mutate works end to end through the real SDK, including one lost race', async () => {
    const store = createStore(driver);
    expectCall(cdn, getCall('board/wall.json'), 200, '{"items":["a"]}', { etag: '"w1"' });
    expectCall(api, putCall, 412, apiError('precondition_failed')); // 有人搶先
    expectCall(cdn, getCall('board/wall.json'), 200, '{"items":["a","b"]}', { etag: '"w2"' });
    expectCall(api, putCall, 200, putResult('board/wall.json', '"w3"'));

    const result = await store.mutate('board/wall.json', (data) => ({ data: { items: [...data.items, 'mine'] }, result: data.items.length }));
    assert.equal(result, 2, 'the second attempt saw the other writer’s item');
    assert.equal(seen.at(-1).body, '{"items":["a","b","mine"]}');
    assert.equal(seen.at(-1).headers['x-if-match'], '"w2"');
  });

  test('remove sends pathnames in one request; list maps the SDK shape', async () => {
    expectCall(api, { path: '/api/blob/delete', method: 'POST' }, 200, {});
    await driver.del(['rl/a.json', 'rl/b.json']);
    assert.deepEqual(JSON.parse(seen.at(-1).body), { urls: ['rl/a.json', 'rl/b.json'] });

    expectCall(api, { path: (p) => p.startsWith('/api/blob?'), method: 'GET' }, 200, {
      blobs: [{ url: 'u', downloadUrl: 'd', pathname: 'case/x.json', size: 12, uploadedAt: '2026-01-02T03:04:05.000Z', etag: '"z"' }],
      hasMore: false,
    });
    assert.deepEqual(await driver.list('case/'), [{ path: 'case/x.json', uploadedAt: Date.UTC(2026, 0, 2, 3, 4, 5), size: 12 }]);
    assert.match(seen.at(-1).path, /prefix=case%2F/);
    assert.match(seen.at(-1).path, /limit=1000/);
  });

  test('a suspended or missing store, or a bad token, becomes StoreUnavailableError (→ 503 no_store)', async () => {
    for (const code of ['store_suspended', 'store_not_found', 'forbidden']) {
      expectCall(api, putCall, 403, apiError(code));
      await assert.rejects(driver.put('sys/site.json', '{}', { etag: '"v1"' }), StoreUnavailableError, code);
    }
  });
});
