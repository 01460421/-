// GET /api/pulse：大廳用的全館摘要。平常只讀兩份文件（sys/site.json、sys/poll.json）。
import { CACHE, PATHS, READ_CACHE_MS } from './config.js';
import { reply } from './http.js';
import { normalizePoll } from './poll.js';
import { blankSite, normalizeSite, publicFeed, updateSite } from './site.js';
import { getStore } from './store.js';
import { isPlainObject } from './util.js';

const RETRY_BUILD_AFTER_MS = 60_000;
let building = null; // 同一個執行個體裡，同時間只重算一次
let buildFailedAt = 0;

/**
 * sys/site.json 還不存在（剛從 v1 升級或全新安裝）：由頻道文件重算一次並建立它。
 * 之後每次 pulse 就只要讀兩份文件。建立失敗不影響回應（先回空的摘要），一分鐘後才會再試，
 * 免得儲存空間有狀況時每個請求都去重算。
 */
function buildSiteOnce(store) {
  if (Date.now() - buildFailedAt < RETRY_BUILD_AFTER_MS) return blankSite();
  building ??= updateSite(store)
    .then((out) => out.site)
    .catch((error) => {
      console.error('[nyjn] could not initialise sys/site.json:', error);
      buildFailedAt = Date.now();
      return blankSite();
    })
    .finally(() => {
      building = null;
    });
  return building;
}

/** 測試用 */
export function resetPulse() {
  building = null;
  buildFailedAt = 0;
}

export async function pulse(ctx) {
  const store = getStore();
  const [siteDoc, pollDoc] = await Promise.all([
    store.read(PATHS.site, { maxAge: READ_CACHE_MS }),
    store.read(PATHS.poll, { maxAge: READ_CACHE_MS }),
  ]);

  const site = isPlainObject(siteDoc.data) ? normalizeSite(siteDoc.data) : await buildSiteOnce(store);
  const poll = normalizePoll(pollDoc.data);

  const body = {
    t: ctx.now,
    totals: { ...site.tot, voters: Object.keys(poll.voters).length },
    feed: publicFeed(site),
    poll: poll.poll,
    storms: poll.storms,
  };
  return reply(200, body, { 'Cache-Control': CACHE.pulse });
}
