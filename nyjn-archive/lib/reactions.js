// /api/react（共鳴）與 /api/report（回報）。兩者都只動頻道文件裡的那一筆，
// 頻率限制只用記憶體內的計數，不多花 Blob 的讀寫。
import { LIMITS, PATHS, REACTIONS, env } from './config.js';
import { fail, limit, reply } from './http.js';
import { channelOf, itemIdOf, itemsOf, isVisible, tallyReactions } from './items.js';
import { applyBoardChange, ensureSite, syncSite } from './site.js';
import { getStore } from './store.js';
import { isPlainObject, ownerHash, short12 } from './util.js';

/** 這兩個端點一定要有格式正確的作者鑰匙 */
function requireOwner(o) {
  const oh = ownerHash(o);
  if (!oh) throw fail(400, 'bad_request', '少了作者鑰匙');
  return short12(oh);
}

// ---------- POST /api/react ----------

export async function react(ctx) {
  const store = getStore();
  const body = await ctx.json(LIMITS.body);
  const k = channelOf(body.k);
  const id = itemIdOf(body.id);
  const who = requireOwner(body.o);
  const choice = body.r; // 'a'／'b'／'c'，空字串代表收回
  if (choice !== '' && !REACTIONS.includes(choice)) throw fail(400, 'bad_request');
  limit('react', ctx.ih);

  const result = await store.mutate(PATHS.board(k), (data) => {
    const items = itemsOf(data);
    const item = items.find((other) => other.id === id);
    if (!item || !isVisible(item)) throw fail(404, 'not_found');

    const by = isPlainObject(item.by) ? item.by : {};
    const previous = REACTIONS.includes(by[who]) ? by[who] : '';
    if (previous === choice) {
      return { result: { id, r: tallyReactions(by), mine: choice } }; // 沒變，不用寫
    }
    if (!previous && Object.keys(by).length >= LIMITS.reactors) throw fail(409, 'full', '這一筆的共鳴已經滿了');

    if (choice) by[who] = choice;
    else delete by[who];
    item.by = by;
    item.r = tallyReactions(by);
    return { data: { items }, result: { id, r: item.r, mine: choice } };
  });

  return reply(200, result);
}

// ---------- POST /api/report ----------

export async function report(ctx) {
  const store = getStore();
  const body = await ctx.json(LIMITS.body);
  const k = channelOf(body.k);
  const id = itemIdOf(body.id);
  const who = requireOwner(body.o);
  limit('report', ctx.ih);

  await ensureSite(store);
  const threshold = env.reportHide;
  const result = await store.mutate(PATHS.board(k), (data) => {
    const items = itemsOf(data);
    const item = items.find((other) => other.id === id);
    if (!item) throw fail(404, 'not_found');

    const reporters = Array.isArray(item.fl) ? item.fl : [];
    // 已經被隱藏、同一個人重複回報、或名單滿了：不用再記
    if (!isVisible(item) || reporters.includes(who) || reporters.length >= LIMITS.reports) {
      return { result: { hidden: !isVisible(item), justHidden: false } };
    }

    item.fl = [...reporters, who];
    // 只在「剛好跨過門檻」的那一刻自動隱藏；館主放行（show）之後，再多的回報也只是記在名單上
    const justHidden = reporters.length < threshold && item.fl.length >= threshold;
    if (justHidden) item.hid = 1;
    return { data: { items }, result: { hidden: justHidden, justHidden } };
  });

  // 被隱藏的那一刻，從計數和大廳動態拿掉
  if (result.justHidden) {
    await syncSite(store, (site, rebuilt) => applyBoardChange(site, k, { dv: -1, remove: id }, rebuilt));
  }
  return reply(200, { ok: true, hidden: result.hidden });
}
