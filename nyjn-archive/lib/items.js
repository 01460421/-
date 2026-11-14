// 「一筆資料」的形狀：驗證進來的內容、決定哪些欄位可以公開。
// 存在 Blob 裡的完整樣子見 docs/API.md；v1 留下的資料只有 id/t/name/oh/x|w，這裡都要能讀。
import { CHANNELS, CHAPTERS, LIMITS, QUESTIONS, REACTIONS } from './config.js';
import { fail } from './http.js';
import { ITEM_ID_RE, clip, count, isPlainObject } from './util.js';

/** 頻道名稱；不認得就丟 400 bad_channel */
export function channelOf(value) {
  const k = typeof value === 'string' ? value : '';
  if (!Object.hasOwn(CHANNELS, k)) throw fail(400, 'bad_channel');
  return k;
}

/** 資料的 id；格式不對就丟 400 bad_id */
export function itemIdOf(value) {
  const id = typeof value === 'string' ? value : '';
  if (!ITEM_ID_RE.test(id)) throw fail(400, 'bad_id');
  return id;
}

/** 頻道文件 → 陣列（文件不存在或壞掉都當成空的） */
export function itemsOf(data) {
  return data && Array.isArray(data.items) ? data.items.filter(isPlainObject) : [];
}

export const isVisible = (item) => !item.hid;
export const countVisible = (items) => items.reduce((n, item) => n + (item.hid ? 0 : 1), 0);

const shotOf = (value) => Math.max(0, value | 0);

/** 展牆的作品。規則和 v1 的 cleanWork 相同，只是章節收斂到 c0–c13。不合格回 null。 */
export function cleanWork(w) {
  if (!isPlainObject(w)) return null;

  if (w.kind === 'piece') {
    const text = clip(w.text, LIMITS.piece);
    if (!text.trim()) return null;
    const r = isPlainObject(w.ref) ? w.ref : null;
    let ref = null;
    if (r && r.type === 'plate' && CHAPTERS.has(r.ch)) {
      ref = { type: 'plate', ch: r.ch, shot: shotOf(r.shot) };
    } else if (r && r.type === 'relay') {
      ref = { type: 'relay', k: clip(r.k, 8), by: clip(r.by, LIMITS.name), x: clip(r.x, LIMITS.relay) };
    }
    return { kind: 'piece', title: clip(w.title, LIMITS.pieceTitle), text, ref };
  }

  if (w.kind === 'card') {
    const card = { kind: 'card' };
    for (const key of ['name', 'alias', 'kind2', 'era', 'item', 'from']) {
      card[key] = clip(w[key], LIMITS.cardField);
    }
    if (!card.name.trim()) return null;
    card.say = clip(w.say, LIMITS.cardSay);
    card.ch = CHAPTERS.has(w.ch) ? w.ch : 'c0';
    card.shot = shotOf(w.shot);
    return card;
  }

  return null;
}

/**
 * 把 POST /api/board 的本體整理成可以存的內容欄位（不含 id、時間與身分）。
 * 太長的字會被截掉而不是退件；空的才退件。
 */
export function buildDraft(k, body) {
  const channel = CHANNELS[k];
  const draft = { name: clip(body.name, LIMITS.name).trim() };

  if (channel.kind === 'gallery') {
    const w = cleanWork(body.w);
    if (!w) throw fail(400, 'empty', '作品是空的');
    draft.w = w;
    return draft;
  }

  if (channel.kind === 'theory') {
    if (typeof body.q !== 'string' || !QUESTIONS.has(body.q)) {
      throw fail(400, 'bad_request', '沒有這一題');
    }
    draft.q = body.q;
  }
  const x = clip(body.x, channel.text).trim();
  if (!x) throw fail(400, 'empty');
  draft.x = x;
  return draft;
}

/** 兩筆的內容是否完全相同（判斷重複送出用） */
export function sameContent(a, b) {
  if ((a.q || '') !== (b.q || '')) return false;
  if (a.w || b.w) return JSON.stringify(a.w ?? null) === JSON.stringify(b.w ?? null);
  return a.x === b.x;
}

/** 由「誰按了什麼」重新數出計數，確保 r 和 by 永遠一致 */
export function tallyReactions(by) {
  const r = { a: 0, b: 0, c: 0 };
  if (isPlainObject(by)) {
    for (const value of Object.values(by)) {
      if (REACTIONS.includes(value)) r[value] += 1;
    }
  }
  return r;
}

const reactionsOf = (item) => ({ a: count(item.r?.a), b: count(item.r?.b), c: count(item.r?.c) });

/**
 * 公開的樣子：只有 id t name x／w q r pin。
 * 用白名單挑欄位，oh / ih / by / fl / hid 以及任何未來新增的欄位都不會漏出去。
 */
export function publicItem(item) {
  const out = { id: item.id, t: item.t, name: typeof item.name === 'string' ? item.name : '' };
  if (item.x !== undefined) out.x = item.x;
  if (item.w !== undefined) out.w = item.w;
  if (item.q) out.q = item.q;
  out.r = reactionsOf(item);
  if (item.pin) out.pin = 1;
  return out;
}

/** 大廳動態用的摘要：把空白壓成一格，取前 40 個字元（不把表情符號之類的成對字元切成一半） */
export function snippet(item) {
  let source = '';
  if (typeof item.x === 'string') source = item.x;
  else if (item.w?.kind === 'piece') source = item.w.title?.trim() ? item.w.title : item.w.text;
  else if (item.w?.kind === 'card') source = item.w.name;
  const flat = String(source ?? '').replace(/\s+/g, ' ').trim();

  let out = '';
  for (const ch of flat) {
    if (out.length + ch.length > LIMITS.snippet) break;
    out += ch;
  }
  return out;
}

export function feedEntry(k, item) {
  return { k, id: item.id, t: item.t, name: typeof item.name === 'string' ? item.name : '', s: snippet(item) };
}
