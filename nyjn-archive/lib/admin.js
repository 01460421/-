// /api/admin：館主的審核工具。沒設定 ADMIN_KEY 時整組都是 404；鑰匙不對是 403。
import { CHANNEL_KEYS, LIMITS, MEM_RATES, PATHS, env } from './config.js';
import { fail, isAdmin, rateLimited, reply } from './http.js';
import { channelOf, isVisible, itemIdOf, itemsOf, feedEntry } from './items.js';
import { blankPoll, recountPoll } from './poll.js';
import { take } from './ratelimit.js';
import {
  applyBoardChange,
  banAdd,
  banRemove,
  blankSite,
  ensureSite,
  normalizeSite,
  readBoards,
  recountSite,
  updateSite,
} from './site.js';
import { getStore } from './store.js';
import { short12 } from './util.js';

/** serve() 的 guard：在分派方法之前先擋掉沒有權限的請求 */
export function adminGuard(ctx) {
  if (!env.adminKey) throw fail(404, 'not_found', '沒有這個功能');
  if (isAdmin(ctx.req)) return;
  // 猜鑰匙的人：同一個 IP 一分鐘內錯太多次就先擋一下
  const [max, windowMs] = MEM_RATES.adminFail;
  const attempt = take(`adminFail:${ctx.ih}`, max, windowMs);
  if (!attempt.ok) throw rateLimited(attempt.retryAfter);
  throw fail(403, 'forbidden', '鑰匙不對');
}

// ---------- GET /api/admin?view= ----------

/** 審核清單裡的一筆：內容加上館主才看得到的資訊 */
function queueItem(k, item) {
  const out = { k, id: item.id, t: item.t, name: typeof item.name === 'string' ? item.name : '' };
  if (item.x !== undefined) out.x = item.x;
  if (item.w !== undefined) out.w = item.w;
  if (item.q) out.q = item.q;
  out.fl = Array.isArray(item.fl) ? item.fl.length : 0;
  out.hid = item.hid ? 1 : 0;
  out.pin = item.pin ? 1 : 0;
  out.oh12 = short12(item.oh);
  out.ih = typeof item.ih === 'string' ? item.ih : '';
  return out;
}

export async function adminGet(ctx) {
  const view = ctx.query.view || '';
  if (view === 'ping') return reply(200, { ok: true });

  if (view === 'queue') {
    const store = getStore();
    const [boards, siteDoc] = await Promise.all([readBoards(store), store.read(PATHS.site)]);
    const items = [];
    for (const k of CHANNEL_KEYS) {
      for (const item of boards[k]) {
        const reported = Array.isArray(item.fl) && item.fl.length > 0;
        if (reported || item.hid) items.push(queueItem(k, item));
      }
    }
    items.sort((a, b) => b.t - a.t);
    return reply(200, { items, bans: normalizeSite(siteDoc.data).ban });
  }

  if (view === 'export') {
    const store = getStore();
    const [boards, siteDoc, pollDoc] = await Promise.all([
      readBoards(store),
      store.read(PATHS.site),
      store.read(PATHS.poll),
    ]);
    const board = Object.fromEntries(CHANNEL_KEYS.map((k) => [k, { items: boards[k] }]));
    // 原樣輸出（這是備份）；還沒建立過的文件給一份空白的，形狀才固定
    return reply(200, { t: ctx.now, board, site: siteDoc.data ?? blankSite(), poll: pollDoc.data ?? blankPoll() });
  }

  throw fail(400, 'bad_request');
}

// ---------- POST /api/admin ----------

/**
 * 對某一筆做的動作：直接改 item，回傳「有沒有真的改到」。
 * del 只是佔個位置，實際的移除在 actOnItem 裡處理。
 */
function setFlag(item, key) {
  if (item[key]) return false;
  item[key] = 1;
  return true;
}

function clearField(item, key) {
  if (item[key] === undefined) return false;
  delete item[key];
  return true;
}

const ITEM_ACTIONS = {
  hide: (item) => setFlag(item, 'hid'),
  show: (item) => clearField(item, 'hid'),
  pin: (item) => setFlag(item, 'pin'),
  unpin: (item) => clearField(item, 'pin'),
  clear: (item) => clearField(item, 'fl'), // 清掉回報
  ban: (item) => setFlag(item, 'hid'), // 停權的同時隱藏這一筆
  del: () => true,
};

async function actOnItem(store, act, body) {
  const k = channelOf(body.k);
  const id = itemIdOf(body.id);

  await ensureSite(store);
  const done = await store.mutate(PATHS.board(k), (data) => {
    const items = itemsOf(data);
    const item = items.find((other) => other.id === id);
    if (!item) throw fail(404, 'not_found');

    const before = isVisible(item);
    const changed = ITEM_ACTIONS[act](item);
    const next = act === 'del' ? items.filter((other) => other !== item) : items;
    const after = act === 'del' ? false : isVisible(item);
    const result = { item, dv: Number(after) - Number(before) };
    return changed ? { data: { items: next }, result } : { result };
  });

  // 全館文件：看得見與否有變就調整計數與動態；ban 另外要記進停權名單。
  // 這裡不用盡力而為的 syncSite：館主的動作沒寫成功要讓館主知道。
  const { item, dv } = done;
  if (dv === 0 && act !== 'ban') return;
  await updateSite(store, (site, rebuilt) => {
    if (act === 'ban') banAdd(site, short12(item.oh), typeof item.ih === 'string' ? item.ih : '');
    if (dv > 0) applyBoardChange(site, k, { dv, add: feedEntry(k, item) }, rebuilt);
    if (dv < 0) applyBoardChange(site, k, { dv, remove: id }, rebuilt);
  });
}

export async function adminPost(ctx) {
  const body = await ctx.json(LIMITS.body);
  const act = typeof body.act === 'string' ? body.act : '';

  if (Object.hasOwn(ITEM_ACTIONS, act)) {
    await actOnItem(getStore(), act, body);
    return reply(200, { ok: true });
  }

  if (act === 'unban') {
    const target = typeof body.target === 'string' ? body.target : '';
    if (!/^([0-9a-f]{12}|[0-9a-f]{16})$/.test(target)) throw fail(400, 'bad_request');
    await updateSite(getStore(), (site) => banRemove(site, target));
    return reply(200, { ok: true });
  }

  if (act === 'recount') {
    const store = getStore();
    await Promise.all([recountSite(store), recountPoll(store)]);
    return reply(200, { ok: true });
  }

  throw fail(400, 'bad_request');
}
