// sys/site.json：全館共用的一份小文件。
//   rl   當天（UTC）的發文帳本：{ day, ip: { <ih>: [時間戳…] } }，取代 v1「每個 IP 一個檔案」的做法
//   feed 大廳動態（最新 24 筆，新的在前）
//   tot  全館計數（只算沒被隱藏的）
//   ban  停權名單：{ o: [<oh12>], ip: [<ih>] }
import { CHANNELS, CHANNEL_KEYS, LIMITS, PATHS, READ_CACHE_MS, env } from './config.js';
import { countVisible, feedEntry, isVisible, itemsOf } from './items.js';
import { count, isPlainObject, utcDay, utcDayStart } from './util.js';

const TEN_MINUTES = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export function blankSite() {
  return {
    v: 2,
    rl: { day: '', ip: {} },
    feed: [],
    tot: { relay: 0, works: 0, theories: 0 },
    ban: { o: [], ip: [] },
  };
}

const strings = (list) => (Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s) : []);

/** 把讀到的東西補成完整的形狀（缺什麼補什麼，型別不對的丟掉） */
export function normalizeSite(data) {
  const site = blankSite();
  if (!isPlainObject(data)) return site;

  if (isPlainObject(data.rl) && typeof data.rl.day === 'string' && isPlainObject(data.rl.ip)) {
    site.rl.day = data.rl.day;
    for (const [ih, times] of Object.entries(data.rl.ip)) {
      if (Array.isArray(times)) site.rl.ip[ih] = times.filter(Number.isFinite);
    }
  }
  if (Array.isArray(data.feed)) {
    site.feed = data.feed.filter((e) => isPlainObject(e) && typeof e.id === 'string' && typeof e.k === 'string');
  }
  if (isPlainObject(data.tot)) {
    for (const key of Object.keys(site.tot)) site.tot[key] = count(data.tot[key]);
  }
  if (isPlainObject(data.ban)) {
    site.ban.o = strings(data.ban.o);
    site.ban.ip = strings(data.ban.ip);
  }
  return site;
}

/** 頻道 → 計數的欄位 */
export function totalKey(k) {
  const kind = CHANNELS[k].kind;
  return kind === 'gallery' ? 'works' : kind === 'theory' ? 'theories' : 'relay';
}

// ---------- 大廳動態 ----------

const byNewest = (a, b) => (b.t || 0) - (a.t || 0);

function feedAdd(site, entry) {
  site.feed = site.feed.filter((e) => !(e.k === entry.k && e.id === entry.id));
  site.feed.push(entry);
  site.feed.sort(byNewest);
  site.feed = site.feed.slice(0, LIMITS.feed);
}

function feedRemove(site, k, id) {
  site.feed = site.feed.filter((e) => !(e.k === k && e.id === id));
}

/** 對外的動態：只挑公開的欄位 */
export function publicFeed(site) {
  return site.feed.slice(0, LIMITS.feed).map((e) => ({ k: e.k, id: e.id, t: e.t, name: e.name || '', s: e.s || '' }));
}

// ---------- 發文帳本 ----------

/**
 * 這個 IP 現在還能不能發文：十分鐘 RATE_10MIN 筆、每天（UTC）RATE_DAY 筆，跨頻道合計。
 * @returns {{ ok: true } | { ok: false, retryAfter: number }}
 */
export function ledgerCheck(site, ih, now) {
  const times = site.rl.ip[ih] || [];
  const recent = times.filter((t) => now - t < TEN_MINUTES).sort((a, b) => a - b);
  const per10 = env.rate10min;
  if (recent.length >= per10) {
    const freesAt = recent[recent.length - per10] + TEN_MINUTES;
    return { ok: false, retryAfter: Math.max(1, Math.ceil((freesAt - now) / 1000)) };
  }
  const dayStart = utcDayStart(now);
  const today = times.filter((t) => t >= dayStart).length;
  if (today >= env.rateDay) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((dayStart + DAY - now) / 1000)) };
  }
  return { ok: true };
}

/** 記一筆。換日時把舊的清掉，只留最近十分鐘內的（十分鐘的視窗會跨過午夜） */
export function ledgerAdd(site, ih, now) {
  const today = utcDay(now);
  if (site.rl.day !== today) {
    const kept = {};
    for (const [key, times] of Object.entries(site.rl.ip)) {
      const recent = times.filter((t) => now - t < TEN_MINUTES);
      if (recent.length) kept[key] = recent;
    }
    site.rl = { day: today, ip: kept };
  }
  const times = site.rl.ip[ih] || [];
  times.push(now);
  site.rl.ip[ih] = times.slice(-(env.rateDay + env.rate10min));
}

// ---------- 停權 ----------

export function isBanned(site, oh12, ih) {
  return (Boolean(oh12) && site.ban.o.includes(oh12)) || (Boolean(ih) && site.ban.ip.includes(ih));
}

export function banAdd(site, oh12, ih) {
  if (oh12 && !site.ban.o.includes(oh12)) site.ban.o = [...site.ban.o, oh12].slice(-LIMITS.bans);
  if (ih && !site.ban.ip.includes(ih)) site.ban.ip = [...site.ban.ip, ih].slice(-LIMITS.bans);
}

export function banRemove(site, target) {
  site.ban.o = site.ban.o.filter((x) => x !== target);
  site.ban.ip = site.ban.ip.filter((x) => x !== target);
}

// ---------- 重算 ----------

/** 把六個頻道都讀一遍（不走快取）。回傳 { h33: [items], … } */
export async function readBoards(store) {
  const docs = await Promise.all(CHANNEL_KEYS.map((k) => store.read(PATHS.board(k))));
  return Object.fromEntries(CHANNEL_KEYS.map((k, i) => [k, itemsOf(docs[i].data)]));
}

/** 由頻道內容算出計數與大廳動態 */
export function summarize(boards) {
  const tot = { relay: 0, works: 0, theories: 0 };
  const feed = [];
  for (const k of CHANNEL_KEYS) {
    const items = boards[k] || [];
    tot[totalKey(k)] += countVisible(items);
    // 每個頻道最新的 24 筆就夠組出全館最新的 24 筆
    for (const item of items.filter(isVisible).slice(-LIMITS.feed)) feed.push(feedEntry(k, item));
  }
  feed.sort(byNewest);
  return { tot, feed: feed.slice(0, LIMITS.feed) };
}

/**
 * 讀 → 改 → 寫 sys/site.json。
 * 文件還不存在時（剛從 v1 升級，或全新安裝）先由頻道文件重算一次計數與動態；
 * 這時 fn 的第二個參數 rebuilt 會是 true，代表「頻道裡現有的東西都已經算進去了」。
 * @param {(site: object, rebuilt: boolean) => any} [fn] 直接改 site；回傳值會成為結果的 result。
 *   省略 fn 代表「只要確定文件存在」：已經存在就不寫。
 * @returns {Promise<{ site: object, result: any }>}
 */
export function updateSite(store, fn, { seed } = {}) {
  return store.mutate(
    PATHS.site,
    async (data) => {
      let site;
      let rebuilt = false;
      if (isPlainObject(data)) {
        site = normalizeSite(data);
      } else {
        site = blankSite();
        Object.assign(site, summarize(await readBoards(store)));
        rebuilt = true;
      }
      const result = { site, result: fn ? fn(site, rebuilt) : undefined };
      return fn || rebuilt ? { data: site, result } : { result };
    },
    { seed },
  );
}

/** 已經確認過 sys/site.json 存在的 store（正常運作下它不會被刪掉，所以每個執行個體確認一次就夠） */
const siteKnown = new WeakSet();

/**
 * 在動頻道文件「之前」先確定 sys/site.json 存在。
 * 理由：如果等頻道寫完才發現它不存在而去重算，重算的結果會包含同一時間其他人剛寫進頻道、
 * 但還沒回報給全館文件的變動，那些變動之後又會再被加一次。先建立好，大家就都只做增減。
 * @param {{ data: any }} [snapshot] 呼叫端剛讀到的 sys/site.json，有的話就不用再讀
 */
export async function ensureSite(store, snapshot) {
  if (!snapshot && siteKnown.has(store)) return;
  const doc = snapshot ?? (await store.read(PATHS.site, { maxAge: READ_CACHE_MS }));
  if (!isPlainObject(doc.data)) await updateSite(store);
  siteKnown.add(store);
}

/**
 * 某個頻道的內容變了之後，把計數和大廳動態跟上。
 * @param {{ dv?: number, add?: object, remove?: string }} change
 *   dv 是「沒被隱藏的筆數」的增減；add 是要放進動態的項目；remove 是要從動態拿掉的 id
 */
export function applyBoardChange(site, k, { dv = 0, add = null, remove = null }, rebuilt = false) {
  if (rebuilt) return; // 剛由頻道文件重算過，這次的變動已經在裡面了
  const key = totalKey(k);
  site.tot[key] = Math.max(0, site.tot[key] + dv);
  if (remove) feedRemove(site, k, remove);
  if (add) feedAdd(site, add);
}

/**
 * 盡力而為地更新全館文件：頻道那邊已經寫成功了，這裡失敗不該讓整個請求失敗
 * （計數的誤差由每天的 sweep 或館主的 recount 修正）。
 */
export async function syncSite(store, fn, options) {
  try {
    await updateSite(store, fn, options);
  } catch (error) {
    console.error('[nyjn] sys/site.json update failed:', error);
  }
}

/**
 * 重算全館計數與動態並寫回（帳本與停權名單保留）；內容沒變就不寫。回傳新的計數。
 * 重算和「同一瞬間剛好有人貼文」之間沒有鎖：那一筆有極小的機會被多算或少算一次，
 * 下一次重算（每天的 sweep）就會修正。
 */
export function recountSite(store) {
  return store.mutate(PATHS.site, async (data) => {
    // 每一輪都重讀頻道：被搶先而重來時，不拿舊的統計去蓋掉別人剛做的增減
    const fresh = summarize(await readBoards(store));
    const exists = isPlainObject(data);
    const site = normalizeSite(data);
    const unchanged =
      exists && JSON.stringify([site.tot, site.feed]) === JSON.stringify([fresh.tot, fresh.feed]);
    if (unchanged) return { result: site.tot };
    site.tot = fresh.tot;
    site.feed = fresh.feed;
    return { data: site, result: site.tot };
  });
}
