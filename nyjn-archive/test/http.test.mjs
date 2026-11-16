// 共同外殼：CORS、OPTIONS、405、錯誤格式、本體大小上限、頻率限制器。
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { beforeEach, describe, test } from 'node:test';
import board from '../api/board.js';
import health from '../api/health.js';
import { fail, readJson, reply, serve } from '../lib/http.js';
import { block, blockedFor, limiterSize, resetLimiter, take } from '../lib/ratelimit.js';
import { ipHash, ownerHash, safeEqual, sha256 } from '../lib/util.js';
import { ALICE, call, freshWorld } from './helpers.mjs';

beforeEach(() => {
  freshWorld();
});

describe('CORS', () => {
  test('default: any origin, no Vary', async () => {
    const res = await call(health, { url: '/api/health', headers: { origin: 'https://anything.example' } });
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.equal(res.headers.vary, undefined);
    assert.equal(res.headers['access-control-allow-methods'], 'GET,POST,PUT,DELETE,OPTIONS');
    assert.equal(res.headers['access-control-allow-headers'], 'content-type,x-admin-key,x-owner,if-none-match');
  });

  test('ALLOW_ORIGINS: echoes a listed origin, falls back to the first, and adds Vary: Origin', async () => {
    process.env.ALLOW_ORIGINS = 'https://nyjn.example, https://staging.nyjn.example';
    const listed = await call(health, { url: '/api/health', headers: { origin: 'https://staging.nyjn.example' } });
    assert.equal(listed.headers['access-control-allow-origin'], 'https://staging.nyjn.example');
    assert.equal(listed.headers.vary, 'Origin');

    const other = await call(health, { url: '/api/health', headers: { origin: 'https://evil.example' } });
    assert.equal(other.headers['access-control-allow-origin'], 'https://nyjn.example');
    assert.equal(other.headers.vary, 'Origin');

    const none = await call(health, { url: '/api/health' });
    assert.equal(none.headers['access-control-allow-origin'], 'https://nyjn.example');
  });

  test('OPTIONS preflight → 204 with no body, on every method-restricted endpoint', async () => {
    const res = await call(board, { method: 'OPTIONS', url: '/api/board', headers: { origin: 'https://x.example' } });
    assert.equal(res.status, 204);
    assert.equal(res.text, '');
    assert.equal(res.headers['access-control-max-age'], '86400');
  });
});

describe('errors', () => {
  test('unsupported method → 405 method, with Allow', async () => {
    const res = await call(board, { method: 'PATCH', url: '/api/board?k=h33' });
    assert.equal(res.status, 405);
    assert.equal(res.json.code, 'method');
    assert.equal(res.headers.allow, 'GET, POST, DELETE, OPTIONS');
  });

  test('HEAD is served like GET', async () => {
    const res = await call(health, { method: 'HEAD', url: '/api/health' });
    assert.equal(res.status, 200);
  });

  test('every error has { error, code } and is never cached', async () => {
    const res = await call(board, { url: '/api/board?k=zzz' });
    assert.deepEqual(Object.keys(res.json), ['error', 'code']);
    assert.match(res.headers['content-type'], /^application\/json/);
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  test('unexpected exceptions become a generic 500 — details only go to the log', async (t) => {
    const logged = t.mock.method(console, 'error', () => {});
    const handler = (req, res) =>
      serve(req, res, {
        GET: async () => {
          throw new Error('secret internals: /var/task/lib/x.js token=abc');
        },
      });
    const res = await call(handler, { url: '/api/boom' });
    assert.equal(res.status, 500);
    assert.deepEqual(res.json, { error: '後端出了點狀況，稍後再試', code: 'server' });
    assert.ok(!res.text.includes('secret'));
    assert.equal(logged.mock.callCount(), 1);
  });

  test('HttpError can carry extra fields and headers', async () => {
    const handler = (req, res) =>
      serve(req, res, {
        GET: async () => {
          throw fail(409, 'conflict', undefined, { extra: { rev: 7 }, headers: { 'X-Test': '1' } });
        },
        POST: async () => reply(201, { ok: true }, { 'X-Made': 'yes' }),
      });
    const res = await call(handler, { url: '/x' });
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'conflict');
    assert.equal(res.json.rev, 7);
    assert.equal(res.headers['x-test'], '1');
    const made = await call(handler, { method: 'POST', url: '/x', body: {} });
    assert.equal(made.status, 201);
    assert.equal(made.headers['x-made'], 'yes');
  });
});

describe('request bodies', () => {
  const streamReq = (chunks, headers = {}) => Object.assign(Readable.from(chunks), { headers, method: 'POST', url: '/' });

  test('a declared Content-Length over the byte cap is refused before reading', async () => {
    let consumed = 0;
    const req = streamReq(
      (function* gen() {
        consumed += 1;
        yield Buffer.alloc(10);
      })(),
      { 'content-length': String(100 * 3 + 1) },
    );
    await assert.rejects(readJson(req, 100), (error) => error.status === 413 && error.code === 'too_large');
    assert.equal(consumed <= 1, true);
  });

  test('a body that lies about its length is cut off at the byte cap', async () => {
    const chunk = Buffer.from('x'.repeat(200));
    const req = streamReq([chunk, chunk, chunk, chunk], {}); // 800 位元組，沒有 Content-Length
    await assert.rejects(readJson(req, 100), (error) => error.status === 413);
  });

  test('character cap applies after decoding; multi-byte text is not penalised', async () => {
    const body = JSON.stringify({ x: '雨'.repeat(90) }); // 約 98 個字元、278 個位元組
    assert.ok(body.length <= 100 && Buffer.byteLength(body) > 100);
    assert.deepEqual(await readJson(streamReq([Buffer.from(body)]), 100), { x: '雨'.repeat(90) });
    const over = JSON.stringify({ x: 'y'.repeat(100) });
    await assert.rejects(readJson(streamReq([Buffer.from(over)]), 100), (error) => error.status === 413);
  });

  test('chunked bodies are reassembled, including a multi-byte character split across chunks', async () => {
    const bytes = Buffer.from(JSON.stringify({ x: '逆雨' }));
    const cut = bytes.indexOf(Buffer.from('雨')) + 1;
    assert.deepEqual(await readJson(streamReq([bytes.subarray(0, cut), bytes.subarray(cut)]), 100), { x: '逆雨' });
  });

  test('Vercel-style req.body: object, string, Buffer, and a getter that throws on bad JSON', async () => {
    assert.deepEqual(await readJson({ headers: {}, body: { a: 1 } }, 100), { a: 1 });
    assert.deepEqual(await readJson({ headers: {}, body: '{"a":2}' }, 100), { a: 2 });
    assert.deepEqual(await readJson({ headers: {}, body: Buffer.from('{"a":3}') }, 100), { a: 3 });
    await assert.rejects(readJson({ headers: {}, body: [1, 2] }, 100), (error) => error.code === 'bad_request');
    await assert.rejects(readJson({ headers: {}, body: { a: 'x'.repeat(200) } }, 100), (error) => error.status === 413);
    const throwing = {
      headers: {},
      get body() {
        throw new Error('Invalid JSON');
      },
    };
    await assert.rejects(readJson(throwing, 100), (error) => error.status === 400 && error.code === 'bad_request');
  });

  test('no body at all → 400 bad_request', async () => {
    const res = await call(board, { method: 'POST', url: '/api/board' });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'bad_request');
  });
});

describe('identity helpers', () => {
  test('owner key format and hashing', () => {
    assert.equal(ownerHash(ALICE), sha256(ALICE));
    assert.equal(ownerHash('a'.repeat(16)).length, 64);
    assert.equal(ownerHash('a'.repeat(40)).length, 64);
    for (const bad of ['a'.repeat(15), 'a'.repeat(41), 'A'.repeat(20), 'with space 0000000000', '', null, undefined, 123, {}]) {
      assert.equal(ownerHash(bad), '', String(bad));
    }
  });

  test('IP hash uses HASH_SALT (default nyjn) and keeps 16 hex characters', () => {
    assert.equal(ipHash('203.0.113.7'), sha256('nyjn|203.0.113.7').slice(0, 16));
    process.env.HASH_SALT = 'pepper';
    assert.equal(ipHash('203.0.113.7'), sha256('pepper|203.0.113.7').slice(0, 16));
  });

  test('safeEqual compares whole strings of any length', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
    assert.equal(safeEqual('', ''), true);
    assert.equal(safeEqual(undefined, ''), true);
  });
});

describe('in-memory rate limiter', () => {
  test('sliding window with a precise Retry-After', () => {
    const t0 = 1_000_000;
    assert.deepEqual(take('k', 2, 60_000, t0), { ok: true });
    assert.deepEqual(take('k', 2, 60_000, t0 + 10_000), { ok: true });
    assert.deepEqual(take('k', 2, 60_000, t0 + 20_000), { ok: false, retryAfter: 40 });
    assert.deepEqual(take('other', 2, 60_000, t0 + 20_000), { ok: true });
    // 第一筆過期之後又有一個名額
    assert.deepEqual(take('k', 2, 60_000, t0 + 60_000), { ok: true });
    assert.deepEqual(take('k', 2, 60_000, t0 + 60_001), { ok: false, retryAfter: 10 });
  });

  test('block / blockedFor', () => {
    const t0 = 5_000_000;
    assert.equal(blockedFor('ip', t0), 0);
    block('ip', t0 + 90_000, t0);
    assert.equal(blockedFor('ip', t0 + 1), 90);
    assert.equal(blockedFor('ip', t0 + 90_000), 0);
    block('past', t0 - 1, t0);
    assert.equal(blockedFor('past', t0), 0);
  });

  test('old keys are pruned so the map cannot grow without bound', () => {
    resetLimiter();
    const t0 = 9_000_000;
    for (let i = 0; i < 6000; i += 1) take(`flood:${i}`, 5, 1000, t0);
    assert.ok(limiterSize() <= 5001, `size ${limiterSize()}`);
    take('later', 5, 1000, t0 + 5000);
    for (let i = 0; i < 600; i += 1) take('later', 1000, 1000, t0 + 5000);
    assert.ok(limiterSize() <= 2, `expired keys are dropped (size ${limiterSize()})`);
  });
});
