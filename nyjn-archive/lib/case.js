// /api/case：雲端存檔。前端已經用同步碼把手提箱加密，後端只看得到密文和由同步碼導出的 id；
// 知道 id 的人才讀得到、蓋得掉、刪得掉。全部 no-store。
import { LIMITS, PATHS } from './config.js';
import { fail, limit, reply } from './http.js';
import { getStore } from './store.js';
import { CASE_ID_RE, isPlainObject } from './util.js';

function caseIdOf(value) {
  const id = typeof value === 'string' ? value.toLowerCase() : '';
  if (!CASE_ID_RE.test(id)) throw fail(400, 'bad_id');
  return id;
}

const isSave = (doc) => isPlainObject(doc) && Number.isInteger(doc.rev) && typeof doc.data === 'string';

// ---------- GET /api/case?id= ----------

export async function getCase(ctx) {
  const store = getStore();
  const id = caseIdOf(ctx.query.id);
  limit('caseRead', ctx.ih);

  const { data } = await store.read(PATHS.case(id));
  if (!isSave(data)) throw fail(404, 'not_found', '雲端沒有這份存檔');
  return reply(200, { rev: data.rev, t: data.t, data: data.data });
}

// ---------- PUT /api/case ----------

export async function putCase(ctx) {
  const store = getStore();
  const body = await ctx.json(LIMITS.caseBody);
  const id = caseIdOf(body.id);

  if (typeof body.data !== 'string' || !body.data) throw fail(400, 'bad_request');
  if (body.data.length > LIMITS.caseData) throw fail(413, 'too_large');

  const hasRev = body.rev !== undefined && body.rev !== null;
  if (hasRev && !(Number.isInteger(body.rev) && body.rev >= 0)) throw fail(400, 'bad_request');
  const rev = hasRev ? body.rev : null;
  const force = body.force === true;
  limit('caseWrite', ctx.ih);

  const result = await store.mutate(PATHS.case(id), (current) => {
    const exists = isSave(current);
    // 雲端的版本和帶來的不同（第一次上傳沒帶 rev、但雲端已有資料也算），又沒有 force → 409
    if (exists && !force && current.rev !== rev) {
      throw fail(409, 'conflict', undefined, { extra: { rev: current.rev, t: current.t } });
    }
    const next = { rev: (exists ? current.rev : rev ?? 0) + 1, t: ctx.now, data: body.data };
    return { data: next, result: { rev: next.rev, t: next.t } };
  });

  return reply(200, result);
}

// ---------- DELETE /api/case?id= ----------

export async function deleteCase(ctx) {
  const store = getStore();
  const id = caseIdOf(ctx.query.id);
  limit('caseWrite', ctx.ih);

  await store.remove(PATHS.case(id)); // 本來就不存在也算成功
  return reply(200, { ok: true });
}
