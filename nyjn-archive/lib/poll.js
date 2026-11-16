// /api/vote 與 sys/poll.json。
// 每位作者一筆 9 個字元的紀錄：前 8 個是八個時刻（a／b，- 代表沒選），
// 第 9 個是雨次的 36 進位（0–9、a 代表第 10 場，- 代表沒有）。計數依前後差異增減。
import { LIMITS, PATHS, SCENES, STORM_COUNT } from './config.js';
import { fail, limit, reply } from './http.js';
import { getStore } from './store.js';
import { count, isPlainObject, ownerHash, short12 } from './util.js';

const BLANK_VOTER = '-'.repeat(SCENES.length + 1);
const VOTER_RE = /^[ab-]{8}[0-9a-]$/;

export function blankPoll() {
  return {
    v: 2,
    poll: Object.fromEntries(SCENES.map((s) => [s, { a: 0, b: 0 }])),
    storms: Array(STORM_COUNT).fill(0),
    voters: {},
  };
}

/** 把讀到的東西補成完整的形狀 */
export function normalizePoll(data) {
  const doc = blankPoll();
  if (!isPlainObject(data)) return doc;
  if (isPlainObject(data.poll)) {
    for (const s of SCENES) {
      doc.poll[s] = { a: count(data.poll[s]?.a), b: count(data.poll[s]?.b) };
    }
  }
  if (Array.isArray(data.storms)) {
    doc.storms = doc.storms.map((_, i) => count(data.storms[i]));
  }
  if (isPlainObject(data.voters)) {
    for (const [who, code] of Object.entries(data.voters)) {
      if (typeof code === 'string' && VOTER_RE.test(code) && code !== BLANK_VOTER) doc.voters[who] = code;
    }
  }
  return doc;
}

/** 'ab-a----6' → { picks: { s1: 'a', s2: 'b', s4: 'a' }, storm: 6 }；沒有雨次時 storm 是 -1 */
export function decodeVoter(code) {
  const vote = { picks: {}, storm: -1 };
  if (typeof code !== 'string' || !VOTER_RE.test(code)) return vote;
  SCENES.forEach((s, i) => {
    if (code[i] !== '-') vote.picks[s] = code[i];
  });
  const storm = code[SCENES.length] === '-' ? -1 : Number.parseInt(code[SCENES.length], 36);
  vote.storm = storm >= 0 && storm < STORM_COUNT ? storm : -1;
  return vote;
}

export function encodeVoter(vote) {
  const picks = SCENES.map((s) => vote.picks[s] || '-').join('');
  return picks + (vote.storm >= 0 ? vote.storm.toString(36) : '-');
}

/** 由名單重新數出計數（recount 用，修正任何累積的誤差） */
export function tallyVoters(voters) {
  const { poll, storms } = blankPoll();
  for (const code of Object.values(voters)) {
    const vote = decodeVoter(code);
    for (const [s, pick] of Object.entries(vote.picks)) poll[s][pick] += 1;
    if (vote.storm >= 0) storms[vote.storm] += 1;
  }
  return { poll, storms };
}

/** 檢查請求的 picks／storm；回傳要套用的變更（沒帶到的維持原樣） */
function readBallot(body) {
  const changes = { picks: {}, storm: undefined };

  if (body.picks !== undefined && body.picks !== null) {
    if (!isPlainObject(body.picks)) throw fail(400, 'bad_request');
    for (const [scene, pick] of Object.entries(body.picks)) {
      if (!SCENES.includes(scene) || !['a', 'b', ''].includes(pick)) throw fail(400, 'bad_request');
      changes.picks[scene] = pick;
    }
  }
  if (body.storm !== undefined && body.storm !== null) {
    const storm = body.storm;
    if (!Number.isInteger(storm) || storm < -1 || storm >= STORM_COUNT) throw fail(400, 'bad_request');
    changes.storm = storm;
  }
  return changes;
}

// ---------- POST /api/vote ----------

export async function vote(ctx) {
  const store = getStore();
  const body = await ctx.json(LIMITS.body);
  const oh = ownerHash(body.o);
  if (!oh) throw fail(400, 'bad_request', '少了作者鑰匙');
  const who = short12(oh);
  const changes = readBallot(body);
  limit('vote', ctx.ih);

  const result = await store.mutate(PATHS.poll, (data) => {
    const doc = normalizePoll(data);
    const before = decodeVoter(doc.voters[who]);
    const after = {
      picks: { ...before.picks },
      storm: changes.storm === undefined ? before.storm : changes.storm,
    };
    for (const [scene, pick] of Object.entries(changes.picks)) {
      if (pick) after.picks[scene] = pick;
      else delete after.picks[scene];
    }

    const beforeCode = doc.voters[who] || BLANK_VOTER;
    const afterCode = encodeVoter(after);
    const view = () => ({
      poll: doc.poll,
      storms: doc.storms,
      voters: Object.keys(doc.voters).length,
      mine: after,
    });
    if (afterCode === beforeCode) return { result: view() }; // 沒變，不用寫

    const isNew = beforeCode === BLANK_VOTER;
    if (isNew && Object.keys(doc.voters).length >= LIMITS.voters) throw fail(409, 'full', '投票名單已經滿了');

    // 計數依前後差異增減
    for (const s of SCENES) {
      const was = before.picks[s];
      const now = after.picks[s];
      if (was === now) continue;
      if (was) doc.poll[s][was] = Math.max(0, doc.poll[s][was] - 1);
      if (now) doc.poll[s][now] += 1;
    }
    if (before.storm !== after.storm) {
      if (before.storm >= 0) doc.storms[before.storm] = Math.max(0, doc.storms[before.storm] - 1);
      if (after.storm >= 0) doc.storms[after.storm] += 1;
    }

    // 全部收回的人就從名單拿掉，voters 才會是「真的有投的人數」
    if (afterCode === BLANK_VOTER) delete doc.voters[who];
    else doc.voters[who] = afterCode;

    return { data: doc, result: view() };
  });

  return reply(200, result);
}

/** 重算投票計數並寫回；內容沒變就不寫。回傳投票人數。 */
export function recountPoll(store) {
  return store.mutate(PATHS.poll, (data) => {
    const doc = normalizePoll(data);
    const voters = Object.keys(doc.voters).length;
    const fresh = tallyVoters(doc.voters);
    // 一致就不寫（還沒有人投過、文件不存在時也會走這裡，不會平白建立文件）
    if (JSON.stringify([doc.poll, doc.storms]) === JSON.stringify([fresh.poll, fresh.storms])) {
      return { result: voters };
    }
    doc.poll = fresh.poll;
    doc.storms = fresh.storms;
    return { data: doc, result: voters };
  });
}
