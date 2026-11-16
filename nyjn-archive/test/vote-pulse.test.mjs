// /api/vote 與 /api/pulse。
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import board from '../api/board.js';
import pulse from '../api/pulse.js';
import vote from '../api/vote.js';
import { decodeVoter, encodeVoter } from '../lib/poll.js';
import { sha256 } from '../lib/util.js';
import { ALICE, BOB, CAROL, call, freshWorld, key } from './helpers.mjs';

let store;
beforeEach(() => {
  store = freshWorld();
});

const short = (o) => sha256(o).slice(0, 12);
const cast = (body, extra = {}) => call(vote, { method: 'POST', url: '/api/vote', body, ...extra });
const post = (body, extra = {}) => call(board, { method: 'POST', url: '/api/board', body, ...extra });
const lobby = async () => (await call(pulse, { url: '/api/pulse' })).json;
const pollDoc = async () => (await store.read('sys/poll.json')).data;

const SCENES = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
const emptyPoll = () => Object.fromEntries(SCENES.map((s) => [s, { a: 0, b: 0 }]));
const emptyStorms = () => Array(11).fill(0);

describe('voter encoding', () => {
  test('nine characters: eight scenes then the storm in base 36', () => {
    assert.equal(encodeVoter({ picks: { s1: 'a', s2: 'b', s4: 'a' }, storm: 6 }), 'ab-a----6');
    assert.equal(encodeVoter({ picks: {}, storm: -1 }), '---------');
    assert.equal(encodeVoter({ picks: { s8: 'b' }, storm: 10 }), '-------ba');
    assert.equal(encodeVoter({ picks: {}, storm: 0 }), '--------0');

    assert.deepEqual(decodeVoter('ab-a----6'), { picks: { s1: 'a', s2: 'b', s4: 'a' }, storm: 6 });
    assert.deepEqual(decodeVoter('-------ba'), { picks: { s8: 'b' }, storm: 10 });
    for (const junk of [undefined, '', 'ab-a----', 'ab-a----66', 'xb-a----6', 'ab-a----z', 42]) {
      assert.deepEqual(decodeVoter(junk), { picks: {}, storm: -1 }, String(junk));
    }
  });
});

describe('POST /api/vote', () => {
  test('first ballot: tallies, voter count, and the stored 9-char record', async () => {
    const res = await cast({ o: ALICE, picks: { s1: 'a', s4: 'b' }, storm: 6 });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json), ['poll', 'storms', 'voters', 'mine']);
    assert.deepEqual(res.json.poll, { ...emptyPoll(), s1: { a: 1, b: 0 }, s4: { a: 0, b: 1 } });
    assert.deepEqual(res.json.storms, [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
    assert.equal(res.json.voters, 1);
    assert.deepEqual(res.json.mine, { picks: { s1: 'a', s4: 'b' }, storm: 6 });
    assert.equal(res.headers['cache-control'], 'no-store');

    const doc = await pollDoc();
    assert.equal(doc.v, 2);
    assert.deepEqual(doc.voters, { [short(ALICE)]: 'a--b----6' });
    assert.equal(doc.voters[short(ALICE)].length, 9);
  });

  test('changing and withdrawing picks and the storm adjusts tallies by the difference', async () => {
    await cast({ o: ALICE, picks: { s1: 'a', s4: 'b' }, storm: 6 });
    await cast({ o: BOB, picks: { s1: 'a', s2: 'b' }, storm: 10 });
    await cast({ o: CAROL, picks: { s1: 'b' }, storm: 6 });

    let state = await lobby();
    assert.deepEqual(state.poll.s1, { a: 2, b: 1 });
    assert.deepEqual(state.storms, [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1]);

    // 改：s1 從 a 換成 b；沒帶到的 s4 和雨次維持原樣
    const changed = await cast({ o: ALICE, picks: { s1: 'b' } });
    assert.deepEqual(changed.json.poll.s1, { a: 1, b: 2 });
    assert.deepEqual(changed.json.poll.s4, { a: 0, b: 1 });
    assert.deepEqual(changed.json.mine, { picks: { s1: 'b', s4: 'b' }, storm: 6 });
    assert.equal((await pollDoc()).voters[short(ALICE)], 'b--b----6');

    // 換雨次
    const moved = await cast({ o: ALICE, storm: 0 });
    assert.deepEqual(moved.json.storms, [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
    assert.deepEqual(moved.json.mine, { picks: { s1: 'b', s4: 'b' }, storm: 0 });

    // 收回：空字串收回一個時刻，-1 收回雨次
    const withdrawn = await cast({ o: ALICE, picks: { s4: '' }, storm: -1 });
    assert.deepEqual(withdrawn.json.poll.s4, { a: 0, b: 0 });
    assert.deepEqual(withdrawn.json.storms, [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
    assert.deepEqual(withdrawn.json.mine, { picks: { s1: 'b' }, storm: -1 });
    assert.equal(withdrawn.json.voters, 3);
    assert.equal((await pollDoc()).voters[short(ALICE)], 'b--------');

    // 全部收回的人從名單上消失
    const gone = await cast({ o: ALICE, picks: { s1: '' } });
    assert.equal(gone.json.voters, 2);
    assert.deepEqual(gone.json.mine, { picks: {}, storm: -1 });
    assert.equal((await pollDoc()).voters[short(ALICE)], undefined);
    assert.deepEqual(gone.json.poll.s1, { a: 1, b: 1 });

    // 鮑伯選了第 10 場雨：第 9 個字元是 36 進位的 a
    assert.equal((await pollDoc()).voters[short(BOB)], 'ab------a');

    state = await lobby();
    assert.equal(state.totals.voters, 2);
  });

  test('an identical ballot (or one with nothing in it) writes nothing', async () => {
    await cast({ o: ALICE, picks: { s2: 'a' }, storm: 3 });
    const writes = store.driver.stats.writes;
    const same = await cast({ o: ALICE, picks: { s2: 'a' }, storm: 3 });
    assert.deepEqual(same.json.mine, { picks: { s2: 'a' }, storm: 3 });
    const peek = await cast({ o: ALICE });
    assert.deepEqual(peek.json.mine, { picks: { s2: 'a' }, storm: 3 });
    const stranger = await cast({ o: BOB });
    assert.deepEqual(stranger.json.mine, { picks: {}, storm: -1 });
    assert.equal(stranger.json.voters, 1);
    assert.equal(store.driver.stats.writes, writes);
  });

  test('validation', async () => {
    const bad = [
      { picks: { s1: 'a' } }, // 沒有鑰匙
      { o: 'short', picks: { s1: 'a' } },
      { o: ALICE, picks: { s9: 'a' } },
      { o: ALICE, picks: { s1: 'c' } },
      { o: ALICE, picks: ['a'] },
      { o: ALICE, picks: 'a' },
      { o: ALICE, storm: 11 },
      { o: ALICE, storm: -2 },
      { o: ALICE, storm: 1.5 },
      { o: ALICE, storm: '6' },
    ];
    for (const body of bad) {
      const res = await cast(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.json.code, 'bad_request', JSON.stringify(body));
    }
    assert.equal(store.driver.stats.writes, 0);
  });

  test('roster is capped at 20000: new voters get 409 full, existing ones can still change', async () => {
    const voters = {};
    for (let i = 0; i < 19999; i += 1) voters[i.toString(16).padStart(12, '0')] = 'a--------';
    await store.write('sys/poll.json', { v: 2, poll: { ...emptyPoll(), s1: { a: 19999, b: 0 } }, storms: emptyStorms(), voters });

    assert.equal((await cast({ o: ALICE, picks: { s1: 'b' } })).json.voters, 20000);
    const full = await cast({ o: BOB, picks: { s1: 'b' } });
    assert.equal(full.status, 409);
    assert.equal(full.json.code, 'full');
    const change = await cast({ o: ALICE, picks: { s1: 'a' } });
    assert.equal(change.status, 200);
    assert.deepEqual(change.json.poll.s1, { a: 20000, b: 0 });
  });

  test('20 per minute per IP', async () => {
    for (let i = 0; i < 20; i += 1) assert.equal((await cast({ o: ALICE, storm: i % 11 })).status, 200);
    const blocked = await cast({ o: ALICE, storm: 1 });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers['retry-after']) <= 60);
  });

  test('concurrent ballots all land', async () => {
    const people = Array.from({ length: 5 }, (_, i) => key(`voter${i}`));
    const results = await Promise.all(people.map((o, i) => cast({ o, picks: { s3: 'a' }, storm: 2 }, { ip: `198.51.100.${i + 1}` })));
    assert.ok(results.every((r) => r.status === 200));
    const doc = await pollDoc();
    assert.deepEqual(doc.poll.s3, { a: 5, b: 0 });
    assert.equal(doc.storms[2], 5);
    assert.equal(Object.keys(doc.voters).length, 5);
  });
});

describe('GET /api/pulse', () => {
  test('empty site: zeroed shape, and the cache header', async () => {
    const res = await call(pulse, { url: '/api/pulse' });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json), ['t', 'totals', 'feed', 'poll', 'storms']);
    assert.deepEqual(res.json.totals, { relay: 0, works: 0, theories: 0, voters: 0 });
    assert.deepEqual(res.json.feed, []);
    assert.deepEqual(res.json.poll, emptyPoll());
    assert.deepEqual(res.json.storms, emptyStorms());
    assert.equal(res.headers['cache-control'], 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
  });

  test('totals, newest-first feed and snippets of at most 40 characters', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 11, 12, 0, 0) });
    const long = '這是一段很長很長的接龍，'.repeat(10);
    const posts = [
      [{ k: 'h33', o: ALICE, name: '愛麗絲', x: long }, '198.51.100.1'],
      [{ k: 'wall', o: BOB, name: '鮑伯', x: '  有\n換行   和  多餘空白  ' }, '198.51.100.2'],
      [{ k: 'theory', o: CAROL, name: '卡蘿', q: 'q5', x: '我覺得是😀😀😀' + '😀'.repeat(30) }, '198.51.100.3'],
      [{ k: 'gallery', o: ALICE, name: '愛麗絲', w: { kind: 'piece', title: '作品的標題', text: '作品的內文' } }, '198.51.100.1'],
      [{ k: 'gallery', o: BOB, name: '鮑伯', w: { kind: 'card', name: '林默', say: '台詞' } }, '198.51.100.2'],
      [{ k: 'gallery', o: CAROL, name: '卡蘿', w: { kind: 'piece', text: '沒有標題的作品' } }, '198.51.100.3'],
    ];
    const ids = [];
    for (const [body, ip] of posts) {
      const res = await post(body, { ip });
      assert.equal(res.status, 201);
      ids.push(res.json.item.id);
      t.mock.timers.tick(1000);
    }
    await call(vote, { method: 'POST', url: '/api/vote', body: { o: ALICE, picks: { s1: 'a' }, storm: 4 } });
    t.mock.timers.tick(6000); // 過了記憶體快取的時間

    const res = await lobby();
    assert.deepEqual(res.totals, { relay: 2, works: 3, theories: 1, voters: 1 });
    assert.deepEqual(res.feed.map((e) => e.id), [...ids].reverse(), 'newest first');
    assert.deepEqual(res.feed.map((e) => e.k), ['gallery', 'gallery', 'gallery', 'theory', 'wall', 'h33']);
    for (const entry of res.feed) {
      assert.deepEqual(Object.keys(entry), ['k', 'id', 't', 'name', 's']);
      assert.ok(entry.s.length <= 40, `${entry.s} (${entry.s.length})`);
    }
    const [untitled, card, titled, theory, wall, relay] = res.feed;
    assert.equal(relay.s, long.slice(0, 40));
    assert.equal(relay.name, '愛麗絲');
    assert.equal(wall.s, '有 換行 和 多餘空白');
    assert.equal(theory.s, '我覺得是' + '😀'.repeat(18), 'never cuts a surrogate pair in half');
    assert.equal(titled.s, '作品的標題');
    assert.equal(card.s, '林默');
    assert.equal(untitled.s, '沒有標題的作品');
    assert.deepEqual(res.poll.s1, { a: 1, b: 0 });
    assert.equal(res.storms[4], 1);

    // 帳本、停權名單、IP 雜湊都不會出現在摘要裡
    const text = JSON.stringify(res);
    assert.ok(!text.includes('"rl"') && !text.includes('"ban"') && !text.includes(sha256(ALICE).slice(0, 12)));
  });

  test('feed keeps only the newest 24', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 11, 12, 0, 0) });
    for (let i = 0; i < 26; i += 1) {
      const res = await post({ k: 'free', o: key(`writer${i}`), x: `第 ${i} 段` }, { ip: `198.51.100.${i}` });
      assert.equal(res.status, 201);
      t.mock.timers.tick(1000);
    }
    t.mock.timers.tick(6000);
    const res = await lobby();
    assert.equal(res.feed.length, 24);
    assert.equal(res.feed[0].s, '第 25 段');
    assert.equal(res.feed.at(-1).s, '第 2 段');
    assert.equal(res.totals.relay, 26);
  });

  test('reads exactly two documents once sys/site.json exists', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 11, 12, 0, 0) });
    await post({ k: 'h33', o: ALICE, x: '有東西了' });
    t.mock.timers.tick(6000); // 讓剛才寫入時留下的記憶體快取過期
    const fresh = freshStats();
    await lobby();
    assert.deepEqual(store.driver.stats, { ...fresh, reads: 2 });
    await lobby(); // 幾秒內再問一次：記憶體快取，完全不讀
    assert.deepEqual(store.driver.stats, { ...fresh, reads: 2 });
    t.mock.timers.tick(6000);
    await lobby();
    assert.deepEqual(store.driver.stats, { ...fresh, reads: 4 });
  });

  test('fresh upgrade from v1: the first pulse recounts once and creates sys/site.json', async () => {
    await store.write('board/h33.json', {
      items: [
        { id: 'old0000001', t: 100, name: '甲', oh: '', x: '舊的一' },
        { id: 'old0000002', t: 300, name: '乙', oh: '', x: '舊的二' },
      ],
    });
    await store.write('board/gallery.json', {
      items: [{ id: 'old0000003', t: 200, name: '丙', oh: '', w: { kind: 'card', name: '林' } }],
    });
    const first = await lobby();
    assert.deepEqual(first.totals, { relay: 2, works: 1, theories: 0, voters: 0 });
    assert.deepEqual(first.feed.map((e) => e.id), ['old0000002', 'old0000003', 'old0000001']);

    const site = (await store.read('sys/site.json')).data;
    assert.deepEqual(site.tot, { relay: 2, works: 1, theories: 0 });
    assert.equal(site.v, 2);
  });

  function freshStats() {
    Object.assign(store.driver.stats, { reads: 0, writes: 0, lists: 0, removes: 0 });
    return { reads: 0, writes: 0, lists: 0, removes: 0 };
  }
});
