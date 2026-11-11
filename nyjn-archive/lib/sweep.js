// GET /api/cron/sweep：每天的打掃。
//   1. 清掉 v1 留下的 rl/*.json（以前每個 IP 一個檔案）
//   2. 清掉太久沒更新的雲端存檔（CASE_TTL_DAYS）
//   3. 重算全館計數、大廳動態與投票計數
import { env } from './config.js';
import { fail, getHeader, isAdmin, limit, reply } from './http.js';
import { recountPoll } from './poll.js';
import { recountSite } from './site.js';
import { getStore } from './store.js';
import { safeEqual } from './util.js';

const DAY = 24 * 60 * 60 * 1000;
const LEGACY_RATE_FILE = /^rl\/[0-9a-z_-]{1,80}\.json$/i; // v1：rl/<sha256 前 32 碼>.json
const CASE_FILE = /^case\/[0-9a-f]{64}\.json$/;

/**
 * 授權：設了 CRON_SECRET 就要 Authorization: Bearer <CRON_SECRET>（Vercel 的排程會自動帶）；
 * 沒設但有 ADMIN_KEY 就要 x-admin-key；兩者都沒設則開放，但同一個執行個體一小時只做一次。
 */
function authorize(ctx) {
  const secret = env.cronSecret;
  if (secret) {
    if (!safeEqual(getHeader(ctx.req, 'authorization'), `Bearer ${secret}`)) throw fail(403, 'forbidden', '鑰匙不對');
    return;
  }
  if (env.adminKey) {
    if (!isAdmin(ctx.req)) throw fail(403, 'forbidden', '鑰匙不對');
    return;
  }
  limit('sweepOpen', 'all');
}

export async function sweep(ctx) {
  authorize(ctx);
  const store = getStore();

  // 整個 store 只列一次（list 在 Blob 算進階操作），再自己分出 rl/ 和 case/。
  // 只刪檔名符合我們自己格式的，其他不認得的東西一律不碰。
  const files = await store.list('');
  const legacyRate = files.filter((f) => LEGACY_RATE_FILE.test(f.path)).map((f) => f.path);
  const cutoff = ctx.now - env.caseTtlDays * DAY;
  const staleCases = files.filter((f) => CASE_FILE.test(f.path) && f.uploadedAt < cutoff).map((f) => f.path);
  await store.remove([...legacyRate, ...staleCases]);

  const [tot, voters] = await Promise.all([recountSite(store), recountPoll(store)]);

  return reply(200, {
    ok: true,
    removed: { rl: legacyRate.length, cases: staleCases.length },
    totals: { ...tot, voters },
  });
}
