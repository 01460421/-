// /api/admin（審核、停權、備份、重算）與 /api/cron/sweep。
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import admin from '../api/admin.js';
import board from '../api/board.js';
import sweep from '../api/cron/sweep.js';
import pulse from '../api/pulse.js';
import report from '../api/report.js';
import vote from '../api/vote.js';
import { sha256 } from '../lib/util.js';
import { ALICE, BOB, CAROL, call, freshWorld, key, resetLimiter } from './helpers.mjs';

const KEY = 'curator-secret-key';
const AUTH = { 'x-admin-key': KEY };

let store;
beforeEach(() => {
  store = freshWorld({ ADMIN_KEY: KEY });
});

const short = (o) => sha256(o).slice(0, 12);
const post = (body, extra = {}) => call(board, { method: 'POST', url: '/api/board', body, ...extra });
const view = (name, headers = AUTH) => call(admin, { url: `/api/admin?view=${name}`, headers });
const act = (body, headers = AUTH) => call(admin, { method: 'POST', url: '/api/admin', body, headers });
const listed = async (k) => (await call(board, { url: `/api/board?k=${k}&fresh=1` })).json.items;
const stored = async (k) => (await store.read(`board/${k}.json`)).data.items;
const site = async () => (await store.read('sys/site.json')).data;

describe('/api/admin access', () => {
  test('without ADMIN_KEY the whole group is 404', async () => {
    freshWorld(); // 沒有 ADMIN_KEY
    for (const options of [
      { url: '/api/admin?view=ping' },
      { url: '/api/admin?view=ping', headers: { 'x-admin-key': '' } },
      { url: '/api/admin?view=export', headers: AUTH },
      { method: 'POST', url: '/api/admin', body: { act: 'recount' }, headers: AUTH },
      { method: 'DELETE', url: '/api/admin', headers: AUTH },
    ]) {
      const res = await call(admin, options);
      assert.equal(res.status, 404, JSON.stringify(options));
      assert.equal(res.json.code, 'not_found');
    }
  });

  test('wrong or missing key → 403; right key → ping', async () => {
    for (const headers of [{}, { 'x-admin-key': 'nope' }, { 'x-admin-key': KEY + ' ' }, { 'x-admin-key': KEY.slice(0, -1) }]) {
      const res = await view('ping', headers);
      assert.equal(res.status, 403, JSON.stringify(headers));
      assert.equal(res.json.code, 'forbidden');
    }
    assert.equal((await act({ act: 'recount' }, { 'x-admin-key': 'nope' })).status, 403);

    const ok = await view('ping');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json, { ok: true });
    assert.equal(ok.headers['cache-control'], 'no-store');
    assert.equal(store.driver.stats.reads, 0, 'ping does not touch storage');
  });

  test('repeated wrong keys from one IP get slowed down', async () => {
    for (let i = 0; i < 10; i += 1) assert.equal((await view('ping', { 'x-admin-key': `guess${i}` })).status, 403);
    const blocked = await view('ping', { 'x-admin-key': 'guess10' });
    assert.equal(blocked.status, 429);
    assert.equal((await view('ping')).status, 200, 'the real key still works');
  });

  test('unknown view / action / method', async () => {
    assert.equal((await view('nope')).json.code, 'bad_request');
    assert.equal((await view('')).json.code, 'bad_request');
    assert.equal((await act({ act: 'explode' })).json.code, 'bad_request');
    assert.equal((await act({})).json.code, 'bad_request');
    assert.equal((await call(admin, { method: 'PUT', url: '/api/admin', headers: AUTH, body: {} })).status, 405);
  });
});

describe('/api/admin moderation', () => {
  let a;
  let b;
  beforeEach(async () => {
    a = (await post({ k: 'h33', o: ALICE, name: '愛麗絲', x: '第一段' }, { ip: '198.51.100.1' })).json.item;
    b = (await post({ k: 'h33', o: BOB, name: '鮑伯', x: '第二段' }, { ip: '198.51.100.2' })).json.item;
  });

  test('hide / show keep the list, the totals and the feed in step', async () => {
    assert.deepEqual((await act({ act: 'hide', k: 'h33', id: a.id })).json, { ok: true });
    assert.deepEqual((await listed('h33')).map((i) => i.id), [b.id]);
    let doc = await site();
    assert.equal(doc.tot.relay, 1);
    assert.deepEqual(doc.feed.map((e) => e.id), [b.id]);

    // 再藏一次：沒有變化，不會多扣
    await act({ act: 'hide', k: 'h33', id: a.id });
    assert.equal((await site()).tot.relay, 1);

    assert.equal((await act({ act: 'show', k: 'h33', id: a.id })).status, 200);
    assert.deepEqual((await listed('h33')).map((i) => i.id), [a.id, b.id]);
    doc = await site();
    assert.equal(doc.tot.relay, 2);
    assert.deepEqual(doc.feed.map((e) => e.id).sort(), [a.id, b.id].sort());
    assert.equal((await stored('h33'))[0].hid, undefined);
  });

  test('pin / unpin show up in the public list', async () => {
    await act({ act: 'pin', k: 'h33', id: b.id });
    assert.deepEqual((await listed('h33')).map((i) => i.pin), [undefined, 1]);
    await act({ act: 'unpin', k: 'h33', id: b.id });
    assert.deepEqual((await listed('h33')).map((i) => i.pin), [undefined, undefined]);
  });

  test('del removes any item', async () => {
    assert.equal((await act({ act: 'del', k: 'h33', id: a.id })).status, 200);
    assert.deepEqual((await stored('h33')).map((i) => i.id), [b.id]);
    assert.equal((await site()).tot.relay, 1);
    assert.equal((await act({ act: 'del', k: 'h33', id: a.id })).status, 404);
  });

  test('queue lists reported and hidden items with the private details; clear empties the reports', async () => {
    assert.deepEqual((await view('queue')).json, { items: [], bans: { o: [], ip: [] } });

    await call(report, { method: 'POST', url: '/api/report', body: { k: 'h33', id: a.id, o: BOB }, ip: '198.51.100.2' });
    await call(report, { method: 'POST', url: '/api/report', body: { k: 'h33', id: a.id, o: CAROL }, ip: '198.51.100.3' });
    await act({ act: 'hide', k: 'h33', id: b.id });

    const queue = (await view('queue')).json;
    const byId = (x, y) => (x.id < y.id ? -1 : 1);
    assert.deepEqual(
      [...queue.items].sort(byId),
      [
        { k: 'h33', id: b.id, t: b.t, name: '鮑伯', x: '第二段', fl: 0, hid: 1, pin: 0, oh12: short(BOB), ih: sha256('nyjn|198.51.100.2').slice(0, 16) },
        { k: 'h33', id: a.id, t: a.t, name: '愛麗絲', x: '第一段', fl: 2, hid: 0, pin: 0, oh12: short(ALICE), ih: sha256('nyjn|198.51.100.1').slice(0, 16) },
      ].sort(byId),
    );
    assert.ok(queue.items[0].t >= queue.items[1].t, 'newest first');
    assert.deepEqual(queue.bans, { o: [], ip: [] });

    assert.equal((await act({ act: 'clear', k: 'h33', id: a.id })).status, 200);
    assert.equal((await stored('h33'))[0].fl, undefined);
    assert.deepEqual((await view('queue')).json.items.map((i) => i.id), [b.id]);
  });

  test('after the admin shows a reported item again, further reports do not re-hide it until cleared', async () => {
    process.env.REPORT_HIDE = '2';
    const reportFrom = (o, ip) => call(report, { method: 'POST', url: '/api/report', body: { k: 'h33', id: a.id, o }, ip });
    await reportFrom(BOB, '198.51.100.2');
    assert.equal((await reportFrom(CAROL, '198.51.100.3')).json.hidden, true);
    await act({ act: 'show', k: 'h33', id: a.id });
    assert.equal((await reportFrom(key('dave'), '198.51.100.4')).json.hidden, false);
    assert.equal((await listed('h33')).length, 2);

    await act({ act: 'clear', k: 'h33', id: a.id });
    await reportFrom(key('erin'), '198.51.100.5');
    assert.equal((await reportFrom(key('frank'), '198.51.100.6')).json.hidden, true, 'a fresh round of reports hides it again');
  });

  test('ban hides the item and blocks the author and the IP; unban lifts it', async () => {
    assert.equal((await act({ act: 'ban', k: 'h33', id: a.id })).status, 200);
    assert.deepEqual((await listed('h33')).map((i) => i.id), [b.id]);
    const aliceIp = sha256('nyjn|198.51.100.1').slice(0, 16);
    assert.deepEqual((await site()).ban, { o: [short(ALICE)], ip: [aliceIp] });
    assert.deepEqual((await view('queue')).json.bans, { o: [short(ALICE)], ip: [aliceIp] });

    // 同一把鑰匙換了 IP：擋
    const sameKey = await post({ k: 'wall', o: ALICE, x: '我換了網路' }, { ip: '198.51.100.50' });
    assert.equal(sameKey.status, 403);
    assert.equal(sameKey.json.code, 'banned');
    // 同一個 IP 換了鑰匙：擋
    const sameIp = await post({ k: 'wall', o: key('alice2'), x: '我換了鑰匙' }, { ip: '198.51.100.1' });
    assert.equal(sameIp.json.code, 'banned');
    // 匿名也擋（看 IP）
    assert.equal((await post({ k: 'wall', x: '匿名' }, { ip: '198.51.100.1' })).json.code, 'banned');
    // 不相干的人不受影響
    assert.equal((await post({ k: 'wall', o: CAROL, x: '路人' }, { ip: '198.51.100.3' })).status, 201);
    assert.equal((await store.read('board/wall.json')).data.items.length, 1);

    assert.equal((await act({ act: 'unban', target: short(ALICE) })).status, 200);
    assert.deepEqual((await site()).ban, { o: [], ip: [aliceIp] });
    assert.equal((await post({ k: 'wall', o: ALICE, x: '解除了鑰匙' }, { ip: '198.51.100.50' })).status, 201);
    assert.equal((await post({ k: 'wall', o: ALICE, x: 'IP 還沒解' }, { ip: '198.51.100.1' })).json.code, 'banned');

    assert.equal((await act({ act: 'unban', target: aliceIp })).status, 200);
    assert.equal((await post({ k: 'wall', o: ALICE, x: '都解除了' }, { ip: '198.51.100.1' })).status, 201);

    assert.equal((await act({ act: 'unban', target: 'not-a-hash' })).json.code, 'bad_request');
    assert.equal((await act({ act: 'unban' })).json.code, 'bad_request');
  });

  test('item actions validate k and id', async () => {
    assert.equal((await act({ act: 'hide', k: 'nope', id: a.id })).json.code, 'bad_channel');
    assert.equal((await act({ act: 'hide', k: 'h33' })).json.code, 'bad_id');
    assert.equal((await act({ act: 'pin', k: 'h33', id: 'zzzzzzzzzz' })).status, 404);
  });

  test('export returns the full documents, private fields included', async () => {
    await call(vote, { method: 'POST', url: '/api/vote', body: { o: ALICE, picks: { s1: 'a' } } });
    const res = await view('export');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json), ['t', 'board', 'site', 'poll']);
    assert.deepEqual(Object.keys(res.json.board), ['h33', 'wall', 'post', 'free', 'gallery', 'theory']);
    assert.equal(res.json.board.h33.items.length, 2);
    assert.equal(res.json.board.h33.items[0].oh, sha256(ALICE));
    assert.deepEqual(res.json.board.theory, { items: [] });
    assert.equal(res.json.site.tot.relay, 2);
    assert.deepEqual(res.json.poll.voters, { [short(ALICE)]: 'a--------' });
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  test('recount repairs drifted totals, feed and poll tallies', async () => {
    await call(vote, { method: 'POST', url: '/api/vote', body: { o: ALICE, picks: { s1: 'a' }, storm: 3 } });
    // 把計數弄亂
    await store.mutate('sys/site.json', (data) => ({ data: { ...data, tot: { relay: 99, works: 7, theories: 1 }, feed: [] } }));
    await store.mutate('sys/poll.json', (data) => {
      data.poll.s1 = { a: 50, b: 50 };
      data.storms[3] = 0;
      return { data };
    });

    assert.deepEqual((await act({ act: 'recount' })).json, { ok: true });
    const doc = await site();
    assert.deepEqual(doc.tot, { relay: 2, works: 0, theories: 0 });
    assert.deepEqual(doc.feed.map((e) => e.id).sort(), [a.id, b.id].sort());
    assert.equal(Object.keys(doc.rl.ip).length, 2, 'the rate ledger survives a recount');
    const poll = (await store.read('sys/poll.json')).data;
    assert.deepEqual(poll.poll.s1, { a: 1, b: 0 });
    assert.equal(poll.storms[3], 1);
  });
});

describe('GET /api/cron/sweep', () => {
  const run = (headers = {}) => call(sweep, { url: '/api/cron/sweep', headers });
  const DAY = 86_400_000;

  async function seedLeftovers() {
    const { files } = store.driver;
    // v1 留下的每個 IP 一個檔案
    await store.write('rl/0123456789abcdef0123456789abcdef.json', { t: [1, 2, 3] });
    await store.write('rl/fedcba9876543210fedcba9876543210.json', { t: [4] });
    // 一份很久沒動的存檔、一份最近的
    await store.write(`case/${'aa'.repeat(32)}.json`, { rev: 1, t: 1, data: 'old' });
    await store.write(`case/${'bb'.repeat(32)}.json`, { rev: 1, t: 2, data: 'recent' });
    files.get(`case/${'aa'.repeat(32)}.json`).uploadedAt = Date.now() - 366 * DAY;
    files.get(`case/${'bb'.repeat(32)}.json`).uploadedAt = Date.now() - 364 * DAY;
  }

  test('CRON_SECRET set: needs Authorization: Bearer <secret>', async () => {
    store = freshWorld({ CRON_SECRET: 'cron-secret', ADMIN_KEY: KEY });
    assert.equal((await run()).status, 403);
    assert.equal((await run({ authorization: 'Bearer wrong' })).status, 403);
    assert.equal((await run({ authorization: 'cron-secret' })).status, 403);
    assert.equal((await run(AUTH)).status, 403, 'the admin key is not accepted when CRON_SECRET is set');
    assert.equal(store.driver.stats.lists, 0);

    const ok = await run({ authorization: 'Bearer cron-secret' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.ok, true);
    assert.equal((await run({ authorization: 'Bearer cron-secret' })).status, 200, 'no hourly throttle when authorised');
  });

  test('only ADMIN_KEY set: needs x-admin-key', async () => {
    assert.equal((await run()).status, 403);
    assert.equal((await run({ 'x-admin-key': 'nope' })).json.code, 'forbidden');
    assert.equal((await run({ authorization: `Bearer ${KEY}` })).status, 403);
    assert.equal((await run(AUTH)).status, 200);
  });

  test('neither set: open, but only once per hour per instance', async (t) => {
    store = freshWorld();
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 11, 3, 0, 0) });
    assert.equal((await run()).status, 200);
    const again = await run();
    assert.equal(again.status, 429);
    assert.equal(again.json.code, 'rate_limited');
    assert.equal(Number(again.headers['retry-after']), 3600);
    t.mock.timers.tick(3_600_000);
    assert.equal((await run()).status, 200);
  });

  test('removes v1 rl/*.json and expired saves, then recounts', async () => {
    await post({ k: 'h33', o: ALICE, x: '一' }, { ip: '198.51.100.1' });
    await post({ k: 'gallery', o: BOB, w: { kind: 'card', name: '林' } }, { ip: '198.51.100.2' });
    await post({ k: 'theory', o: CAROL, q: 'q1', x: '推測' }, { ip: '198.51.100.3' });
    await call(vote, { method: 'POST', url: '/api/vote', body: { o: ALICE, storm: 1 } });
    await seedLeftovers();
    await store.mutate('sys/site.json', (data) => ({ data: { ...data, tot: { relay: 9, works: 9, theories: 9 } } }));

    const res = await run(AUTH);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      ok: true,
      removed: { rl: 2, cases: 1 },
      totals: { relay: 1, works: 1, theories: 1, voters: 1 },
    });
    assert.equal(res.headers['cache-control'], 'no-store');

    const left = (await store.list('')).map((f) => f.path);
    assert.deepEqual(left, [
      'board/gallery.json',
      'board/h33.json',
      'board/theory.json',
      `case/${'bb'.repeat(32)}.json`,
      'sys/poll.json',
      'sys/site.json',
    ]);
    assert.deepEqual((await site()).tot, { relay: 1, works: 1, theories: 1 });
    resetLimiter();
    assert.equal((await call(pulse, { url: '/api/pulse' })).json.totals.relay, 1);

    // 第二次：沒有東西要清，計數也沒變 → 一次列表，零寫入
    Object.assign(store.driver.stats, { reads: 0, writes: 0, lists: 0, removes: 0 });
    const second = await run(AUTH);
    assert.deepEqual(second.json.removed, { rl: 0, cases: 0 });
    assert.equal(store.driver.stats.lists, 1);
    assert.equal(store.driver.stats.writes, 0);
    assert.equal(store.driver.stats.removes, 0);
  });

  test('CASE_TTL_DAYS is honoured', async () => {
    await seedLeftovers();
    process.env.CASE_TTL_DAYS = '30';
    const res = await run(AUTH);
    assert.deepEqual(res.json.removed, { rl: 2, cases: 2 });
  });

  test('only GET is allowed', async () => {
    assert.equal((await call(sweep, { method: 'POST', url: '/api/cron/sweep', headers: AUTH, body: {} })).status, 405);
  });
});
