// GET /api/health：前端開機時用它判斷後端在不在。完全不碰儲存空間，
// 所以 store 只代表「設定上會用哪一種」，不代表真的連得上。
import { API_MAJOR, API_VERSION, CACHE, CHANNELS, FEATURES, LIMITS, storeKind } from './config.js';
import { reply } from './http.js';

export async function health(ctx) {
  const store = storeKind();
  const body = {
    ok: store !== 'none',
    api: API_MAJOR,
    v: API_VERSION,
    store,
    t: ctx.now,
    features: FEATURES,
    limits: {
      relay: LIMITS.relay,
      theory: CHANNELS.theory.text,
      piece: LIMITS.piece,
      items: LIMITS.items,
    },
  };
  return reply(200, body, { 'Cache-Control': CACHE.health });
}
