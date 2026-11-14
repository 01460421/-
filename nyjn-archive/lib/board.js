// /api/board：讀頻道、貼一筆、刪一筆。
import { CACHE, CHANNELS, LIMITS, PATHS, READ_CACHE_MS, MEM_RATES } from './config.js';
import { fail, isAdmin, limit, rateLimited, reply } from './http.js';
import {
  buildDraft,
  channelOf,
  countVisible,
  feedEntry,
  isVisible,
  itemIdOf,
  itemsOf,
  publicItem,
  sameContent,
} from './items.js';
import { block, blockedFor, take } from './ratelimit.js';
import {
  applyBoardChange,
  ensureSite,
  isBanned,
  ledgerAdd,
  ledgerCheck,
  normalizeSite,
  syncSite,
} from './site.js';
import { getStore } from './store.js';
import { isPlainObject, newId, ownerHash, sha1, short12 } from './util.js';

/** If-None-Match 是否包含這個 ETag（弱比較：不管 W/ 前綴） */
function etagMatches(header, etag) {
  if (!header) return false;
  if (header.trim() === '*') return true;
  const bare = (tag) => tag.trim().replace(/^W\//i, '');
  return header.split(',').some((tag) => bare(tag) === bare(etag));
}

// ---------- GET /api/board?k= ----------

export async function listBoard(ctx) {
  const store = getStore();
  const k = channelOf(ctx.query.k);

  // fresh=<任意值>：前端剛寫入後用它跳過 CDN；這時也不走記憶體快取。
  // 但同一個 IP 一分鐘內要了太多次「最新的」，就退回快取，省 Blob 的讀取額度。
  const fresh = 'fresh' in ctx.query;
  let maxAge = READ_CACHE_MS;
  if (fresh) {
    const [max, windowMs] = MEM_RATES.freshRead;
    if (take(`freshRead:${ctx.ih}`, max, windowMs).ok) maxAge = 0;
  }

  const { data } = await store.read(PATHS.board(k), { maxAge });
  const items = itemsOf(data).filter(isVisible).map(publicItem);

  // ETag 只看公開的內容（回應裡的 t 每次都不同，所以是弱 ETag）
  const etag = `W/"${sha1(`${k}:${JSON.stringify(items)}`).slice(0, 32)}"`;
  const headers = { ETag: etag, 'Cache-Control': fresh ? CACHE.none : CACHE.board };

  if (etagMatches(ctx.header('if-none-match'), etag)) return reply(304, null, headers);
  return reply(200, { k, items, n: items.length, t: ctx.now }, headers);
}

// ---------- POST /api/board ----------

export async function postBoard(ctx) {
  const store = getStore();
  const body = await ctx.json(LIMITS.body);
  const k = channelOf(body.k);
  const draft = buildDraft(k, body);

  // 蜜罐：機器人填了隱藏欄位。照常回 201，但什麼都不寫（也不碰儲存空間）。
  if (body.hp) {
    return reply(201, { item: publicItem({ id: newId(ctx.now), t: ctx.now, ...draft }) });
  }

  // 鑰匙缺少或格式不對 → 匿名（oh 是空字串，之後不能自己刪），和 v1 相容
  const oh = ownerHash(body.o);
  const ih = ctx.ih;
  const limiterKey = `post:${ih}`;

  // 這個 IP 剛剛才被帳本擋過，時間還沒到就不用再讀一次
  const stillBlocked = blockedFor(limiterKey, ctx.now);
  if (stillBlocked) throw rateLimited(stillBlocked);

  // 第 1 次讀取：全館文件，檢查停權與頻率。這份快照稍後還會當成條件寫入的起點。
  let seed = await store.read(PATHS.site);
  if (!isPlainObject(seed.data)) {
    // 只有剛升級或全新安裝的第一次會走到：先把全館文件建立起來，再重讀一次
    await ensureSite(store, seed);
    seed = await store.read(PATHS.site);
  }
  const site = normalizeSite(seed.data);
  if (isBanned(site, short12(oh), ih)) throw fail(403, 'banned');
  const rate = ledgerCheck(site, ih, ctx.now);
  if (!rate.ok) {
    block(limiterKey, ctx.now + rate.retryAfter * 1000, ctx.now);
    throw rateLimited(rate.retryAfter);
  }

  // 第 2 次讀取 + 第 1 次寫入：接到頻道文件的最後面
  const item = { id: '', t: ctx.now, name: draft.name, oh, ih };
  if (draft.x !== undefined) item.x = draft.x;
  if (draft.w !== undefined) item.w = draft.w;
  if (draft.q !== undefined) item.q = draft.q;

  const { dv } = await store.mutate(PATHS.board(k), (data) => {
    const items = itemsOf(data);

    // 同一位作者（匿名的話看 IP）十分鐘內送出和自己上一筆一模一樣的內容 → 409
    const mine = (other) => (oh ? other.oh === oh : !other.oh && Boolean(other.ih) && other.ih === ih);
    const last = items.findLast(mine);
    if (last && ctx.now - last.t < LIMITS.dupWindowMs && sameContent(last, item)) {
      throw fail(409, 'duplicate');
    }

    do item.id = newId(ctx.now);
    while (items.some((other) => other.id === item.id));

    const next = [...items, item].slice(-CHANNELS[k].keep);
    return { data: { items: next }, result: { dv: countVisible(next) - countVisible(items) } };
  });

  // 第 2 次寫入：帳本、大廳動態、計數（用第 1 次讀到的快照做條件寫入，被搶先才會重讀）
  await syncSite(
    store,
    (current, rebuilt) => {
      ledgerAdd(current, ih, ctx.now);
      applyBoardChange(current, k, { dv, add: feedEntry(k, item) }, rebuilt);
    },
    { seed },
  );

  return reply(201, { item: publicItem(item) });
}

// ---------- DELETE /api/board?k=&id= ----------

export async function deleteBoard(ctx) {
  const store = getStore();
  const k = channelOf(ctx.query.k);
  const id = itemIdOf(ctx.query.id);

  // 作者：x-owner 標頭，或 v1 的 &o=；館主：x-admin-key
  const admin = isAdmin(ctx.req);
  const oh = ownerHash(ctx.header('x-owner') || ctx.query.o);
  if (!admin) {
    if (!oh) throw fail(403, 'forbidden', '只有作者或館主能刪'); // 沒有任何憑證，不必讀檔
    limit('boardDelete', ctx.ih);
  }

  await ensureSite(store);
  const { wasVisible } = await store.mutate(PATHS.board(k), (data) => {
    const items = itemsOf(data);
    const target = items.find((item) => item.id === id);
    if (!target) throw fail(404, 'not_found');
    if (!admin && (!target.oh || target.oh !== oh)) throw fail(403, 'forbidden', '只有作者或館主能刪');
    return {
      data: { items: items.filter((item) => item !== target) },
      result: { wasVisible: isVisible(target) },
    };
  });

  // 被隱藏的本來就不在計數和動態裡，不用多寫一次
  if (wasVisible) {
    await syncSite(store, (site, rebuilt) => applyBoardChange(site, k, { dv: -1, remove: id }, rebuilt));
  }
  return reply(200, { ok: true });
}
