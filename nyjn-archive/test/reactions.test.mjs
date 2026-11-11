// /api/react 與 /api/report。
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import board from '../api/board.js';
import pulse from '../api/pulse.js';
import react from '../api/react.js';
import report from '../api/report.js';
import { sha256 } from '../lib/util.js';
import { ALICE, BOB, CAROL, call, freshWorld, key, resetLimiter } from './helpers.mjs';

let store;
let item; // 每個測試開始時 h33 裡都有愛麗絲的一段

beforeEach(async () => {
  store = freshWorld();
  const res = await call(board, { method: 'POST', url: '/api/board', body: { k: 'h33', o: ALICE, name: '愛麗絲', x: '雨停了' } });
  item = res.json.item;
});

const short = (o) => sha256(o).slice(0, 12);
const doReact = (body, extra = {}) => call(react, { method: 'POST', url: '/api/react', body, ...extra });
const doReport = (body, extra = {}) => call(report, { method: 'POST', url: '/api/report', body, ...extra });
const storedItem = async () => (await store.read('board/h33.json')).data.items.find((i) => i.id === item.id);
const listed = async () => (await call(board, { url: '/api/board?k=h33&fresh=1' })).json.items;

describe('POST /api/react', () => {
  test('add, change and withdraw keep the counts right', async () => {
    const added = await doReact({ k: 'h33', id: item.id, o: BOB, r: 'a' });
    assert.equal(added.status, 200);
    assert.deepEqual(added.json, { id: item.id, r: { a: 1, b: 0, c: 0 }, mine: 'a' });

    const second = await doReact({ k: 'h33', id: item.id, o: CAROL, r: 'a' });
    assert.deepEqual(second.json.r, { a: 2, b: 0, c: 0 });

    // 每位作者對每一筆只有一個共鳴：改成 c，a 要減回去
    const changed = await doReact({ k: 'h33', id: item.id, o: BOB, r: 'c' });
    assert.deepEqual(changed.json, { id: item.id, r: { a: 1, b: 0, c: 1 }, mine: 'c' });

    // 重複按同一個不會多算，也不會多寫一次
    const writes = store.driver.stats.writes;
    const same = await doReact({ k: 'h33', id: item.id, o: BOB, r: 'c' });
    assert.deepEqual(same.json.r, { a: 1, b: 0, c: 1 });
    assert.equal(store.driver.stats.writes, writes);

    const withdrawn = await doReact({ k: 'h33', id: item.id, o: BOB, r: '' });
    assert.deepEqual(withdrawn.json, { id: item.id, r: { a: 1, b: 0, c: 0 }, mine: '' });

    const again = await doReact({ k: 'h33', id: item.id, o: BOB, r: '' });
    assert.deepEqual(again.json, { id: item.id, r: { a: 1, b: 0, c: 0 }, mine: '' });

    // 存的是 oh 的前 12 碼；公開清單只有計數
    const saved = await storedItem();
    assert.deepEqual(saved.by, { [short(CAROL)]: 'a' });
    assert.deepEqual(saved.r, { a: 1, b: 0, c: 0 });
    const [pub] = await listed();
    assert.deepEqual(pub.r, { a: 1, b: 0, c: 0 });
    assert.equal(pub.by, undefined);
  });

  test('validation', async () => {
    const cases = [
      [{ k: 'nope', id: item.id, o: BOB, r: 'a' }, 400, 'bad_channel'],
      [{ k: 'h33', id: 'NOPE', o: BOB, r: 'a' }, 400, 'bad_id'],
      [{ k: 'h33', o: BOB, r: 'a' }, 400, 'bad_id'],
      [{ k: 'h33', id: item.id, r: 'a' }, 400, 'bad_request'], // 沒有鑰匙
      [{ k: 'h33', id: item.id, o: 'too-short', r: 'a' }, 400, 'bad_request'],
      [{ k: 'h33', id: item.id, o: BOB, r: 'z' }, 400, 'bad_request'],
      [{ k: 'h33', id: item.id, o: BOB }, 400, 'bad_request'], // 收回要明確給空字串
      [{ k: 'h33', id: 'zzzzzzzzzz', o: BOB, r: 'a' }, 404, 'not_found'],
      [{ k: 'wall', id: item.id, o: BOB, r: 'a' }, 404, 'not_found'],
    ];
    for (const [body, status, code] of cases) {
      const res = await doReact(body);
      assert.equal(res.status, status, JSON.stringify(body));
      assert.equal(res.json.code, code, JSON.stringify(body));
    }
    assert.equal((await call(react, { url: '/api/react' })).status, 405);
  });

  test('hidden items cannot be reacted to', async () => {
    const doc = (await store.read('board/h33.json')).data;
    doc.items[0].hid = 1;
    await store.mutate('board/h33.json', () => ({ data: doc }));
    const res = await doReact({ k: 'h33', id: item.id, o: BOB, r: 'a' });
    assert.equal(res.status, 404);
  });

  test('at most 200 reactors per item → 409 full (existing reactors can still change)', async () => {
    await store.mutate('board/h33.json', (data) => {
      const by = {};
      for (let i = 0; i < 199; i += 1) by[String(i).padStart(12, '0')] = 'b';
      data.items[0].by = by;
      data.items[0].r = { a: 0, b: 199, c: 0 };
      return { data };
    });
    assert.equal((await doReact({ k: 'h33', id: item.id, o: BOB, r: 'a' })).status, 200); // 第 200 位
    const full = await doReact({ k: 'h33', id: item.id, o: CAROL, r: 'a' });
    assert.equal(full.status, 409);
    assert.equal(full.json.code, 'full');
    const change = await doReact({ k: 'h33', id: item.id, o: BOB, r: 'c' });
    assert.deepEqual(change.json.r, { a: 0, b: 199, c: 1 });
  });

  test('30 per minute per IP (in memory only)', async () => {
    for (let i = 0; i < 30; i += 1) {
      const res = await doReact({ k: 'h33', id: item.id, o: key(`fan${i}`), r: 'a' });
      assert.equal(res.status, 200, `reaction ${i}`);
    }
    const reads = store.driver.stats.reads;
    const blocked = await doReact({ k: 'h33', id: item.id, o: key('fan30'), r: 'a' });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.code, 'rate_limited');
    assert.ok(Number(blocked.headers['retry-after']) >= 1 && Number(blocked.headers['retry-after']) <= 60);
    assert.equal(store.driver.stats.reads, reads, 'a blocked request never touches storage');
    assert.equal((await doReact({ k: 'h33', id: item.id, o: key('fan30'), r: 'a' }, { ip: '198.51.100.5' })).status, 200);
  });

  test('concurrent reactions on the same item all count', async () => {
    const fans = Array.from({ length: 5 }, (_, i) => key(`crowd${i}`));
    const results = await Promise.all(
      fans.map((o, i) => doReact({ k: 'h33', id: item.id, o, r: 'b' }, { ip: `198.51.100.${10 + i}` })),
    );
    assert.ok(results.every((r) => r.status === 200));
    assert.deepEqual((await storedItem()).r, { a: 0, b: 5, c: 0 });
  });
});

describe('POST /api/report', () => {
  const reportFrom = (o, ip) => doReport({ k: 'h33', id: item.id, o }, { ip });

  test('the same person only counts once; three different people hide the item', async () => {
    const first = await reportFrom(BOB, '198.51.100.1');
    assert.equal(first.status, 200);
    assert.deepEqual(first.json, { ok: true, hidden: false });

    const writes = store.driver.stats.writes;
    const repeat = await reportFrom(BOB, '198.51.100.1');
    assert.deepEqual(repeat.json, { ok: true, hidden: false });
    assert.equal(store.driver.stats.writes, writes, 'a repeated report writes nothing');
    assert.deepEqual((await storedItem()).fl, [short(BOB)]);

    assert.deepEqual((await reportFrom(CAROL, '198.51.100.2')).json, { ok: true, hidden: false });
    assert.equal((await listed()).length, 1, 'still visible at two reports');

    const third = await reportFrom(key('dave'), '198.51.100.3');
    assert.deepEqual(third.json, { ok: true, hidden: true });

    const saved = await storedItem();
    assert.equal(saved.hid, 1);
    assert.equal(saved.fl.length, 3);
    assert.deepEqual(await listed(), []);

    // 計數和大廳動態也跟著拿掉
    const lobby = (await call(pulse, { url: '/api/pulse' })).json;
    assert.equal(lobby.totals.relay, 0);
    assert.deepEqual(lobby.feed, []);

    // 之後再有人回報：已經藏起來了，不用再記
    assert.deepEqual((await reportFrom(key('erin'), '198.51.100.4')).json, { ok: true, hidden: true });
    assert.equal((await storedItem()).fl.length, 3);
  });

  test('REPORT_HIDE changes the threshold', async () => {
    process.env.REPORT_HIDE = '1';
    assert.deepEqual((await reportFrom(BOB)).json, { ok: true, hidden: true });
  });

  test('validation and rate limit (5 per ten minutes per IP)', async () => {
    assert.equal((await doReport({ k: 'h33', id: item.id })).json.code, 'bad_request');
    assert.equal((await doReport({ k: 'h33', id: item.id, o: 'nope' })).json.code, 'bad_request');
    assert.equal((await doReport({ k: 'zzz', id: item.id, o: BOB })).json.code, 'bad_channel');
    assert.equal((await doReport({ k: 'h33', id: '', o: BOB })).json.code, 'bad_id');
    assert.equal((await doReport({ k: 'h33', id: 'zzzzzzzzzz', o: BOB })).status, 404);

    resetLimiter();
    for (let i = 0; i < 5; i += 1) assert.equal((await reportFrom(BOB)).status, 200);
    const blocked = await reportFrom(CAROL);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers['retry-after']) <= 600);
  });
});
