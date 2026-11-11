// /api/board：讀、貼、刪，以及驗證、蜜罐、重複、頻率、ETag、v1 相容。
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import board from '../api/board.js';
import pulse from '../api/pulse.js';
import { sha256 } from '../lib/util.js';
import { ALICE, BOB, call, freshWorld, key, resetLimiter } from './helpers.mjs';

const NOON = Date.UTC(2026, 10, 11, 12, 0, 0);
const TEN_MINUTES = 10 * 60 * 1000;

let store;
beforeEach(() => {
  store = freshWorld();
});

const post = (body, extra = {}) => call(board, { method: 'POST', url: '/api/board', body, ...extra });
const list = (k, extra = {}) => call(board, { url: `/api/board?k=${k}`, ...extra });
const del = (k, id, extra = {}) => call(board, { method: 'DELETE', url: `/api/board?k=${k}&id=${id}`, ...extra });
const stored = async (k) => (await store.read(`board/${k}.json`)).data.items;

describe('GET /api/board', () => {
  test('empty channel has the documented shape and cache headers', async () => {
    const res = await list('h33');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json), ['k', 'items', 'n', 't']);
    assert.equal(res.json.k, 'h33');
    assert.deepEqual(res.json.items, []);
    assert.equal(res.json.n, 0);
    assert.equal(typeof res.json.t, 'number');
    assert.equal(res.headers['cache-control'], 'public, max-age=0, s-maxage=10, stale-while-revalidate=60');
    assert.match(res.headers.etag, /^W\/"[0-9a-f]+"$/);
  });

  test('unknown or missing channel → 400 bad_channel', async () => {
    for (const url of ['/api/board?k=nope', '/api/board', '/api/board?k=__proto__']) {
      const res = await call(board, { url });
      assert.equal(res.status, 400);
      assert.equal(res.json.code, 'bad_channel');
      assert.equal(typeof res.json.error, 'string');
      assert.equal(res.headers['cache-control'], 'no-store');
    }
  });

  test('hidden items are not listed and do not count', async () => {
    await store.write('board/wall.json', {
      items: [
        { id: 'aaaaaa01', t: 1, name: '甲', oh: '', x: '看得到' },
        { id: 'aaaaaa02', t: 2, name: '乙', oh: '', x: '被藏起來', hid: 1 },
      ],
    });
    const res = await list('wall');
    assert.equal(res.json.n, 1);
    assert.deepEqual(res.json.items.map((i) => i.id), ['aaaaaa01']);
  });

  test('ETag: If-None-Match gives 304 until the content changes', async () => {
    await post({ k: 'h33', o: ALICE, name: '愛麗絲', x: '第一段' });
    const first = await list('h33', { url: '/api/board?k=h33&fresh=1' });
    const etag = first.headers.etag;
    assert.ok(etag);

    const again = await list('h33', { headers: { 'If-None-Match': etag } });
    assert.equal(again.status, 304);
    assert.equal(again.text, '');
    assert.equal(again.headers.etag, etag);
    assert.match(again.headers['cache-control'], /s-maxage=10/);

    // 清單裡多個 ETag、或是去掉 W/ 的寫法也認得
    const strong = etag.replace(/^W\//, '');
    const multi = await list('h33', { headers: { 'if-none-match': `"zzz", ${strong}` } });
    assert.equal(multi.status, 304);

    await post({ k: 'h33', o: BOB, name: '鮑伯', x: '第二段' });
    const changed = await list('h33', { headers: { 'If-None-Match': etag } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.etag, etag);
    assert.equal(changed.json.n, 2);
  });

  test('fresh=<anything> switches the response to no-store', async () => {
    assert.equal((await list('h33', { url: '/api/board?k=h33&fresh=1762828800000' })).headers['cache-control'], 'no-store');
    assert.equal((await list('h33', { url: '/api/board?k=h33&fresh=' })).headers['cache-control'], 'no-store');
  });

  test('plain reads are served from the short in-memory cache; fresh reads are not', async () => {
    await post({ k: 'h33', o: ALICE, x: '一' });
    await list('h33');
    store.driver.stats.reads = 0;
    await list('h33');
    await list('h33');
    assert.equal(store.driver.stats.reads, 0);
    await list('h33', { url: '/api/board?k=h33&fresh=1' });
    assert.equal(store.driver.stats.reads, 1);
  });
});

describe('POST /api/board', () => {
  test('relay post: public shape out, private fields stored', async () => {
    const res = await post({ k: 'h33', o: ALICE, name: '愛麗絲', x: '雨停了。' }, { ip: '198.51.100.9' });
    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.json), ['item']);
    assert.deepEqual(Object.keys(res.json.item), ['id', 't', 'name', 'x', 'r']);
    assert.match(res.json.item.id, /^[a-z0-9]{9,20}$/);
    assert.deepEqual(res.json.item.r, { a: 0, b: 0, c: 0 });
    assert.equal(res.headers['cache-control'], 'no-store');

    const [saved] = await stored('h33');
    assert.equal(saved.oh, sha256(ALICE)); // 和 v1 相同的導出方式
    assert.match(saved.ih, /^[0-9a-f]{16}$/);
    assert.equal(saved.ih, sha256('nyjn|198.51.100.9').slice(0, 16));
    assert.equal(saved.x, '雨停了。');

    const listed = await list('h33', { url: '/api/board?k=h33&fresh=1' });
    assert.deepEqual(listed.json.items, [res.json.item]);
    assert.equal(listed.json.n, 1);
  });

  test('public endpoints never echo oh / ih / by / fl / hid', async () => {
    await store.write('board/free.json', {
      items: [
        {
          id: 'priv000001',
          t: 5,
          name: '某人',
          oh: sha256(ALICE),
          ih: 'feedfacefeedface',
          x: '內容',
          r: { a: 1, b: 0, c: 0 },
          by: { abcdefabcdef: 'a' },
          fl: ['123456123456'],
          pin: 1,
          secret: '未來新增的欄位也不該漏',
        },
      ],
    });
    const res = await list('free');
    assert.deepEqual(res.json.items, [{ id: 'priv000001', t: 5, name: '某人', x: '內容', r: { a: 1, b: 0, c: 0 }, pin: 1 }]);
    for (const leak of [sha256(ALICE), 'feedfacefeedface', 'abcdefabcdef', '123456123456', '未來新增']) {
      assert.ok(!res.text.includes(leak), `leaked ${leak}`);
    }
  });

  test('costs 2 reads + 2 writes once sys/site.json exists', async () => {
    await post({ k: 'h33', o: ALICE, x: '暖身' });
    const { stats } = store.driver;
    Object.assign(stats, { reads: 0, writes: 0, lists: 0, removes: 0 });
    const res = await post({ k: 'wall', o: ALICE, x: '量一下' });
    assert.equal(res.status, 201);
    assert.deepEqual(stats, { reads: 2, writes: 2, lists: 0, removes: 0 });
  });

  test('validation failures', async () => {
    const cases = [
      [{ k: 'nope', o: ALICE, x: 'hi' }, 400, 'bad_channel'],
      [{ o: ALICE, x: 'hi' }, 400, 'bad_channel'],
      [{ k: 'h33', o: ALICE, x: '' }, 400, 'empty'],
      [{ k: 'h33', o: ALICE, x: '   \n\t ' }, 400, 'empty'],
      [{ k: 'h33', o: ALICE }, 400, 'empty'],
      [{ k: 'h33', o: ALICE, x: { evil: 1 } }, 400, 'empty'],
      [{ k: 'theory', o: ALICE, x: '我猜是他' }, 400, 'bad_request'], // 少了 q
      [{ k: 'theory', o: ALICE, q: 'q13', x: '我猜是他' }, 400, 'bad_request'],
      [{ k: 'theory', o: ALICE, q: 'q0', x: '我猜是他' }, 400, 'bad_request'],
      [{ k: 'theory', o: ALICE, q: 'q3', x: ' ' }, 400, 'empty'],
      [{ k: 'gallery', o: ALICE }, 400, 'empty'],
      [{ k: 'gallery', o: ALICE, w: { kind: 'card', name: '  ', say: '沒有名字' } }, 400, 'empty'],
      [{ k: 'gallery', o: ALICE, w: { kind: 'piece', title: '只有標題', text: '' } }, 400, 'empty'],
      [{ k: 'gallery', o: ALICE, w: { kind: 'video' } }, 400, 'empty'],
    ];
    for (const [body, status, code] of cases) {
      const res = await post(body);
      assert.equal(res.status, status, JSON.stringify(body));
      assert.equal(res.json.code, code, JSON.stringify(body));
      assert.ok(res.json.error.length > 0);
    }
    assert.equal(store.driver.stats.writes, 0);

    for (const rawBody of ['not json', '[1,2]', '"text"', 'null', '']) {
      const res = await post(undefined, { rawBody });
      assert.equal(res.status, 400, rawBody);
      assert.equal(res.json.code, 'bad_request', rawBody);
    }
  });

  test('over-long fields are clipped, control characters stripped', async () => {
    const res = await post({ k: 'h33', o: ALICE, name: '名'.repeat(40), x: `a\u0000b\u0007c\n${'雨'.repeat(400)}` });
    assert.equal(res.status, 201);
    assert.equal(res.json.item.name, '名'.repeat(16));
    assert.equal(res.json.item.x.length, 240);
    assert.ok(res.json.item.x.startsWith('abc\n雨'));

    const theory = await post({ k: 'theory', o: ALICE, q: 'q12', x: '謎'.repeat(999) });
    assert.equal(theory.status, 201);
    assert.equal(theory.json.item.x.length, 400);
    assert.equal(theory.json.item.q, 'q12');
    assert.deepEqual(Object.keys(theory.json.item), ['id', 't', 'name', 'x', 'q', 'r']);
  });

  test('gallery works are cleaned like v1', async () => {
    const piece = await post({
      k: 'gallery',
      o: ALICE,
      name: '畫家',
      w: {
        kind: 'piece',
        title: '題'.repeat(50),
        text: '字'.repeat(1500),
        ref: { type: 'plate', ch: 'c13', shot: 4.9, extra: 'drop me' },
        junk: true,
      },
    });
    assert.equal(piece.status, 201);
    assert.deepEqual(piece.json.item.w, {
      kind: 'piece',
      title: '題'.repeat(30),
      text: '字'.repeat(1200),
      ref: { type: 'plate', ch: 'c13', shot: 4 },
    });

    const relayRef = await post({
      k: 'gallery',
      o: BOB,
      w: { kind: 'piece', text: '引用接龍', ref: { type: 'relay', k: 'h33', by: '某某', x: '原文' } },
    });
    assert.deepEqual(relayRef.json.item.w.ref, { type: 'relay', k: 'h33', by: '某某', x: '原文' });

    // 章節只有 c0–c13；超出範圍的版畫引用整個丟掉
    const badRef = await post({
      k: 'gallery',
      o: key('carol'),
      w: { kind: 'piece', text: '章節不存在', ref: { type: 'plate', ch: 'c14', shot: 1 } },
    });
    assert.equal(badRef.json.item.w.ref, null);

    const card = await post({
      k: 'gallery',
      o: key('dave'),
      w: { kind: 'card', name: '林'.repeat(30), alias: '阿林', say: '話'.repeat(100), ch: 'c99', shot: -3 },
    });
    assert.equal(card.status, 201);
    assert.deepEqual(card.json.item.w, {
      kind: 'card',
      name: '林'.repeat(20),
      alias: '阿林',
      kind2: '',
      era: '',
      item: '',
      from: '',
      say: '話'.repeat(80),
      ch: 'c0',
      shot: 0,
    });
  });

  test('request body over 6000 characters → 413', async () => {
    const big = await post({ k: 'h33', o: ALICE, x: 'x'.repeat(6000) });
    assert.equal(big.status, 413);
    assert.equal(big.json.code, 'too_large');

    // 中文字是 3 個位元組：2000 個字（6000 位元組左右）還在 6000 字元以內，要收
    const cjk = await post({ k: 'h33', o: ALICE, x: '雨'.repeat(2000) });
    assert.equal(cjk.status, 201);

    const viaVercel = await post({ k: 'h33', o: BOB, x: 'x'.repeat(6000) }, { vercel: true });
    assert.equal(viaVercel.status, 413);
  });

  test('honeypot: 201 but nothing is written', async () => {
    const res = await post({ k: 'h33', o: ALICE, name: 'bot', x: 'buy pills', hp: 'http://spam.example' });
    assert.equal(res.status, 201);
    assert.equal(res.json.item.x, 'buy pills');
    assert.match(res.json.item.id, /^[a-z0-9]+$/);
    assert.deepEqual(store.driver.stats, { reads: 0, writes: 0, removes: 0, lists: 0 });
    assert.equal((await list('h33')).json.n, 0);
  });

  test('same author, same channel, same text within ten minutes → 409 duplicate', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: NOON });
    const body = { k: 'h33', o: ALICE, name: '愛麗絲', x: '同一句話' };
    assert.equal((await post(body)).status, 201);

    const dup = await post(body);
    assert.equal(dup.status, 409);
    assert.equal(dup.json.code, 'duplicate');

    assert.equal((await post({ ...body, o: BOB })).status, 201, 'another author may say the same thing');
    assert.equal((await post({ ...body, k: 'wall' })).status, 201, 'another channel is fine');
    assert.equal((await post({ ...body, x: '另一句話' })).status, 201);
    assert.equal((await post(body)).status, 201, 'only the author’s latest item is compared');

    t.mock.timers.tick(TEN_MINUTES + 1);
    resetLimiter();
    assert.equal((await post(body)).status, 201, 'allowed again after ten minutes');
  });

  test('duplicate check also covers theories (per question) and works', async () => {
    const theory = { k: 'theory', o: ALICE, q: 'q1', x: '兇手是管家' };
    assert.equal((await post(theory)).status, 201);
    assert.equal((await post(theory)).json.code, 'duplicate');
    assert.equal((await post({ ...theory, q: 'q2' })).status, 201);

    const work = { k: 'gallery', o: ALICE, w: { kind: 'card', name: '林', say: '嗨' } };
    assert.equal((await post(work)).status, 201);
    assert.equal((await post(work)).json.code, 'duplicate');
  });

  test('rate limit: 7th post in ten minutes → 429 with Retry-After', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: NOON });
    const channels = ['h33', 'wall', 'post', 'free', 'h33', 'wall']; // 跨頻道合計
    for (let i = 0; i < 6; i += 1) {
      const res = await post({ k: channels[i], o: ALICE, x: `第 ${i} 段` });
      assert.equal(res.status, 201, `post ${i}`);
      t.mock.timers.tick(1000);
    }

    const blocked = await post({ k: 'free', o: ALICE, x: '第七段' });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.code, 'rate_limited');
    const retry = Number(blocked.headers['retry-after']);
    assert.ok(Number.isInteger(retry) && retry > 0 && retry <= 600, `Retry-After = ${blocked.headers['retry-after']}`);
    assert.equal(retry, 594); // 第一筆在 6 秒前，還要 594 秒才滿十分鐘

    // 換一把鑰匙沒用（算的是 IP），換一個 IP 才行
    assert.equal((await post({ k: 'free', o: BOB, x: '換鑰匙' })).status, 429);
    assert.equal((await post({ k: 'free', o: BOB, x: '換 IP' }, { ip: '198.51.100.77' })).status, 201);

    // 就算這個執行個體的記憶體計數歸零（例如換了一個執行個體），帳本還是擋得住
    resetLimiter();
    const reads = store.driver.stats.reads;
    assert.equal((await post({ k: 'free', o: ALICE, x: '再試' })).status, 429);
    assert.equal(store.driver.stats.reads, reads + 1, 'one read of sys/site.json');
    // 被擋過之後，同一個執行個體不用再讀就知道要擋
    assert.equal((await post({ k: 'free', o: ALICE, x: '又試' })).status, 429);
    assert.equal(store.driver.stats.reads, reads + 1);

    t.mock.timers.tick(594 * 1000);
    assert.equal((await post({ k: 'free', o: ALICE, x: '等夠了' })).status, 201);
  });

  test('rate limit: daily cap resets at UTC midnight', async (t) => {
    store = freshWorld({ RATE_DAY: '3', RATE_10MIN: '100' });
    t.mock.timers.enable({ apis: ['Date'], now: NOON });
    for (let i = 0; i < 3; i += 1) assert.equal((await post({ k: 'h33', o: ALICE, x: `今天第 ${i} 段` })).status, 201);

    const blocked = await post({ k: 'h33', o: ALICE, x: '今天第四段' });
    assert.equal(blocked.status, 429);
    assert.equal(Number(blocked.headers['retry-after']), 12 * 3600);

    t.mock.timers.tick(12 * 3600 * 1000 + 1000);
    assert.equal((await post({ k: 'h33', o: ALICE, x: '隔天' })).status, 201);
    const { data } = await store.read('sys/site.json');
    assert.equal(data.rl.day, '2026-11-12');
    assert.deepEqual(Object.values(data.rl.ip).map((times) => times.length), [1]);
  });

  test('missing or malformed owner key is accepted as anonymous (v1 compatible)', async () => {
    for (const o of [undefined, 'short', 'UPPERCASE0000000000000', 'x'.repeat(41), 12345678901234567]) {
      const res = await post({ k: 'h33', o, x: `匿名 ${String(o).slice(0, 5)}` });
      assert.equal(res.status, 201, String(o));
    }
    assert.ok((await stored('h33')).every((item) => item.oh === ''));
  });

  test('each channel keeps only its newest items', async () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ id: `seed${String(i).padStart(6, '0')}`, t: i + 1, name: '', oh: '', x: `#${i}` }));
    await store.write('board/post.json', { items });
    const res = await post({ k: 'post', o: ALICE, x: '第 501 筆' });
    assert.equal(res.status, 201);
    const after = await stored('post');
    assert.equal(after.length, 500);
    assert.equal(after[0].id, 'seed000001');
    assert.equal(after.at(-1).id, res.json.item.id);
    // 計數是「看得見的筆數」，頻道滿了之後不會再往上加
    assert.equal((await call(pulse, { url: '/api/pulse' })).json.totals.relay, 500);
  });

  test('two posts at the same moment both land', async () => {
    const results = await Promise.all([
      post({ k: 'h33', o: ALICE, x: '同時一' }, { ip: '198.51.100.1' }),
      post({ k: 'h33', o: BOB, x: '同時二' }, { ip: '198.51.100.2' }),
      post({ k: 'h33', o: key('carol'), x: '同時三' }, { ip: '198.51.100.3' }),
    ]);
    assert.deepEqual(results.map((r) => r.status), [201, 201, 201]);
    const texts = (await stored('h33')).map((item) => item.x).sort();
    assert.deepEqual(texts, ['同時一', '同時三', '同時二']);
    const site = (await store.read('sys/site.json')).data;
    assert.equal(site.tot.relay, 3);
    assert.equal(site.feed.length, 3);
    assert.equal(Object.keys(site.rl.ip).length, 3);
  });

  test('works with Vercel-style req.query / req.body, including a text/plain JSON string', async () => {
    const parsed = await post({ k: 'h33', o: ALICE, x: '已解析的物件' }, { vercel: true });
    assert.equal(parsed.status, 201);
    const asText = await post(undefined, { vercel: true, rawBody: JSON.stringify({ k: 'h33', o: BOB, x: '字串本體' }) });
    assert.equal(asText.status, 201);
    const listed = await list('h33', { url: '/api/board?k=h33&fresh=1', vercel: true });
    assert.deepEqual(listed.json.items.map((i) => i.x), ['已解析的物件', '字串本體']);
    const removed = await del('h33', parsed.json.item.id, { vercel: true, headers: { 'x-owner': ALICE } });
    assert.equal(removed.status, 200);
  });
});

describe('DELETE /api/board', () => {
  test('owner, non-owner and admin', async () => {
    store = freshWorld({ ADMIN_KEY: 'curator-secret' });
    const a = (await post({ k: 'h33', o: ALICE, x: '愛麗絲的' })).json.item;
    const b = (await post({ k: 'h33', o: BOB, x: '鮑伯的' })).json.item;
    const c = (await post({ k: 'h33', o: BOB, x: '鮑伯的第二段' })).json.item;

    const stranger = await del('h33', a.id, { headers: { 'x-owner': BOB } });
    assert.equal(stranger.status, 403);
    assert.equal(stranger.json.code, 'forbidden');

    const nobody = await del('h33', a.id);
    assert.equal(nobody.status, 403);
    assert.equal(nobody.json.code, 'forbidden');

    const wrongAdmin = await del('h33', a.id, { headers: { 'x-admin-key': 'curator-secreT' } });
    assert.equal(wrongAdmin.status, 403);

    const owner = await del('h33', a.id, { headers: { 'x-owner': ALICE } });
    assert.equal(owner.status, 200);
    assert.deepEqual(owner.json, { ok: true });

    const legacyQuery = await call(board, { method: 'DELETE', url: `/api/board?k=h33&id=${b.id}&o=${BOB}` });
    assert.equal(legacyQuery.status, 200, 'v1 style &o= still works');

    const admin = await del('h33', c.id, { headers: { 'x-admin-key': 'curator-secret' } });
    assert.equal(admin.status, 200);

    assert.deepEqual(await stored('h33'), []);
    const site = (await store.read('sys/site.json')).data;
    assert.equal(site.tot.relay, 0);
    assert.deepEqual(site.feed, []);
  });

  test('404 for a missing item, 400 for bad parameters', async () => {
    await post({ k: 'h33', o: ALICE, x: '在' });
    const missing = await del('h33', 'zzzzzzzzzz', { headers: { 'x-owner': ALICE } });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.code, 'not_found');

    const badId = await del('h33', 'NOT%20AN%20ID', { headers: { 'x-owner': ALICE } });
    assert.equal(badId.status, 400);
    assert.equal(badId.json.code, 'bad_id');

    const noId = await call(board, { method: 'DELETE', url: '/api/board?k=h33', headers: { 'x-owner': ALICE } });
    assert.equal(noId.json.code, 'bad_id');

    const badChannel = await del('nope', 'zzzzzzzzzz', { headers: { 'x-owner': ALICE } });
    assert.equal(badChannel.json.code, 'bad_channel');
  });

  test('anonymous posts can only be removed by the admin', async () => {
    freshWorld({ ADMIN_KEY: 'curator-secret' });
    const anon = (await post({ k: 'h33', x: '沒有鑰匙' })).json.item;
    assert.equal((await del('h33', anon.id, { headers: { 'x-owner': ALICE } })).status, 403);
    assert.equal((await del('h33', anon.id, { headers: { 'x-admin-key': 'curator-secret' } })).status, 200);
  });
});

describe('v1 data', () => {
  const legacy = () => ({
    items: [
      { id: 'lzk3a9f0x1q2', t: 1750000000000, name: '老讀者', oh: sha256(ALICE), x: '很久以前的一段' },
      { id: 'lzk3b1c2d3e4', t: 1750000100000, name: '', oh: '', x: '匿名的一段' },
    ],
  });

  test('is listed as-is, with zeroed reactions', async () => {
    await store.write('board/h33.json', legacy());
    await store.write('board/gallery.json', {
      items: [{ id: 'lzk3c5d6e7f8', t: 1750000200000, name: '畫家', oh: sha256(BOB), w: { kind: 'card', name: '林', say: '嗨', ch: 'c2', shot: 1 } }],
    });
    const relay = await list('h33');
    assert.deepEqual(relay.json.items, [
      { id: 'lzk3a9f0x1q2', t: 1750000000000, name: '老讀者', x: '很久以前的一段', r: { a: 0, b: 0, c: 0 } },
      { id: 'lzk3b1c2d3e4', t: 1750000100000, name: '', x: '匿名的一段', r: { a: 0, b: 0, c: 0 } },
    ]);
    const gallery = await list('gallery');
    assert.equal(gallery.json.items[0].w.name, '林');
  });

  test('an old author can still delete their own item (same oh derivation), others cannot', async () => {
    await store.write('board/h33.json', legacy());
    const other = await call(board, { method: 'DELETE', url: `/api/board?k=h33&id=lzk3a9f0x1q2&o=${BOB}` });
    assert.equal(other.status, 403);
    const author = await call(board, { method: 'DELETE', url: `/api/board?k=h33&id=lzk3a9f0x1q2&o=${ALICE}` });
    assert.equal(author.status, 200);
    assert.deepEqual((await stored('h33')).map((i) => i.id), ['lzk3b1c2d3e4']);
  });

  test('first write after the upgrade builds sys/site.json from the existing channels', async () => {
    await store.write('board/h33.json', legacy());
    const res = await post({ k: 'wall', o: BOB, name: '新人', x: '升級後的第一段' });
    assert.equal(res.status, 201);
    const site = (await store.read('sys/site.json')).data;
    assert.equal(site.v, 2);
    assert.deepEqual(site.tot, { relay: 3, works: 0, theories: 0 });
    assert.deepEqual(site.feed.map((e) => e.id), [res.json.item.id, 'lzk3b1c2d3e4', 'lzk3a9f0x1q2']);
    assert.equal(Object.values(site.rl.ip).flat().length, 1);
  });
});
