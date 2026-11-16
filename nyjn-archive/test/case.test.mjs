// /api/case：雲端存檔。
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import caseApi from '../api/case.js';
import { call, freshWorld, resetLimiter } from './helpers.mjs';

const ID = 'ab'.repeat(32); // 64 個十六進位字元
const OTHER = 'cd'.repeat(32);

let store;
beforeEach(() => {
  store = freshWorld();
});

const get = (id, extra = {}) => call(caseApi, { url: `/api/case?id=${id}`, ...extra });
const put = (body, extra = {}) => call(caseApi, { method: 'PUT', url: '/api/case', body, ...extra });
const del = (id, extra = {}) => call(caseApi, { method: 'DELETE', url: `/api/case?id=${id}`, ...extra });

describe('/api/case', () => {
  test('PUT then GET round-trips the ciphertext; everything is no-store', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1762828800000 });
    assert.equal((await get(ID)).status, 404);
    assert.equal((await get(ID)).json.code, 'not_found');

    const saved = await put({ id: ID, data: 'ciphertext-v1' });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.json, { rev: 1, t: 1762828800000 });
    assert.equal(saved.headers['cache-control'], 'no-store');

    const loaded = await get(ID);
    assert.equal(loaded.status, 200);
    assert.deepEqual(loaded.json, { rev: 1, t: 1762828800000, data: 'ciphertext-v1' });
    assert.equal(loaded.headers['cache-control'], 'no-store');

    assert.deepEqual((await store.read(`case/${ID}.json`)).data, { rev: 1, t: 1762828800000, data: 'ciphertext-v1' });
    assert.equal((await get(OTHER)).status, 404, 'ids are independent');
  });

  test('rev must match the cloud copy unless force is set', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1000 });
    await put({ id: ID, data: 'one' });
    t.mock.timers.tick(500);

    const next = await put({ id: ID, data: 'two', rev: 1 });
    assert.deepEqual(next.json, { rev: 2, t: 1500 });

    // 另一台裝置還停在 rev 1
    const stale = await put({ id: ID, data: 'from the other device', rev: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.code, 'conflict');
    assert.equal(stale.json.rev, 2);
    assert.equal(stale.json.t, 1500);
    assert.equal(typeof stale.json.error, 'string');

    // 第一次上傳不用帶 rev，但雲端已經有資料時一樣是 409
    const blind = await put({ id: ID, data: 'first upload from a third device' });
    assert.equal(blind.status, 409);
    assert.equal(blind.json.rev, 2);
    assert.equal((await get(ID)).json.data, 'two', 'conflicts change nothing');

    t.mock.timers.tick(500);
    const forced = await put({ id: ID, data: 'forced', rev: 1, force: true });
    assert.equal(forced.status, 200);
    assert.deepEqual(forced.json, { rev: 3, t: 2000 });
    assert.equal((await get(ID)).json.data, 'forced');

    // force 只認真正的 true
    assert.equal((await put({ id: ID, data: 'x', rev: 1, force: 'yes' })).status, 409);
  });

  test('two devices saving at the same moment: one wins, the other gets 409', async () => {
    await put({ id: ID, data: 'base' });
    resetLimiter();
    const results = await Promise.all([
      put({ id: ID, data: 'device A', rev: 1 }, { ip: '198.51.100.1' }),
      put({ id: ID, data: 'device B', rev: 1 }, { ip: '198.51.100.2' }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const loser = results.find((r) => r.status === 409);
    assert.equal(loser.json.rev, 2);
    assert.equal((await get(ID)).json.rev, 2);
  });

  test('DELETE removes the save and is idempotent', async () => {
    await put({ id: ID, data: 'bye' });
    const removed = await del(ID);
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.json, { ok: true });
    assert.equal((await get(ID)).status, 404);
    assert.equal((await del(ID)).status, 200);
    // 刪掉之後可以重新上傳
    assert.equal((await put({ id: ID, data: 'again' })).status, 200);
  });

  test('size cap: data over 300000 characters → 413', async () => {
    const atLimit = await put({ id: ID, data: 'x'.repeat(300000) });
    assert.equal(atLimit.status, 200);
    const tooBig = await put({ id: ID, data: 'x'.repeat(300001), rev: 1 });
    assert.equal(tooBig.status, 413);
    assert.equal(tooBig.json.code, 'too_large');
    const wayTooBig = await put({ id: ID, data: 'x'.repeat(1_200_000), rev: 1 });
    assert.equal(wayTooBig.status, 413);
    assert.equal((await get(ID)).json.rev, 1);
  });

  test('validation', async () => {
    for (const id of ['', 'short', 'g'.repeat(64), 'ab'.repeat(33), '../sys/site']) {
      assert.equal((await get(encodeURIComponent(id))).json.code, 'bad_id', id);
      assert.equal((await del(encodeURIComponent(id))).json.code, 'bad_id', id);
      assert.equal((await put({ id, data: 'x' })).json.code, 'bad_id', id);
    }
    assert.equal((await put({ id: ID })).json.code, 'bad_request');
    assert.equal((await put({ id: ID, data: '' })).json.code, 'bad_request');
    assert.equal((await put({ id: ID, data: { not: 'a string' } })).json.code, 'bad_request');
    assert.equal((await put({ id: ID, data: 'x', rev: '3' })).json.code, 'bad_request');
    assert.equal((await put({ id: ID, data: 'x', rev: -1 })).json.code, 'bad_request');
    assert.equal((await call(caseApi, { method: 'POST', url: '/api/case', body: { id: ID, data: 'x' } })).status, 405);
    assert.equal(store.driver.stats.writes, 0);
  });

  test('upper-case hex ids are accepted and normalised', async () => {
    await put({ id: ID.toUpperCase(), data: 'same save' });
    assert.equal((await get(ID)).json.data, 'same save');
  });

  test('6 writes per minute per IP', async () => {
    for (let i = 0; i < 6; i += 1) {
      const res = await put({ id: ID, data: `v${i}`, rev: i || undefined });
      assert.equal(res.status, 200, `write ${i}`);
    }
    const blocked = await put({ id: ID, data: 'v6', rev: 6 });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.code, 'rate_limited');
    assert.ok(Number(blocked.headers['retry-after']) <= 60);
    assert.equal((await del(ID)).status, 429, 'deleting counts as a write');
    assert.equal((await get(ID)).status, 200, 'reads are not affected');
  });
});
