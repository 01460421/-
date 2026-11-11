// 記憶體內的滑動視窗頻率限制。
// 每個執行個體各算各的，冷啟動就歸零；它只是便宜的第一道防線，不寫任何 Blob。
// （貼文的正式限制在 sys/site.json 的日帳本裡，見 lib/site.js。）

const MAX_KEYS = 5000;
const PRUNE_EVERY = 500;

/** key → { times: number[]（由舊到新）, windowMs } */
const buckets = new Map();
/** key → 解除封鎖的時間戳 */
const blocks = new Map();
let calls = 0;

function prune(now) {
  for (const [key, bucket] of buckets) {
    const newest = bucket.times[bucket.times.length - 1];
    if (newest === undefined || now - newest >= bucket.windowMs) buckets.delete(key);
  }
  for (const [key, until] of blocks) {
    if (until <= now) blocks.delete(key);
  }
  // 清完還是太多（被灌了大量不同的 key）就從最舊的開始丟
  for (const key of buckets.keys()) {
    if (buckets.size <= MAX_KEYS) break;
    buckets.delete(key);
  }
  for (const key of blocks.keys()) {
    if (blocks.size <= MAX_KEYS) break;
    blocks.delete(key);
  }
}

function maybePrune(now) {
  calls += 1;
  if (calls % PRUNE_EVERY === 0 || buckets.size > MAX_KEYS || blocks.size > MAX_KEYS) prune(now);
}

const seconds = (ms) => Math.max(1, Math.ceil(ms / 1000));

/**
 * 記一次並回報有沒有超過。
 * @returns {{ ok: true } | { ok: false, retryAfter: number }} retryAfter 是秒數
 */
export function take(key, limit, windowMs, now = Date.now()) {
  maybePrune(now);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { times: [], windowMs };
    buckets.set(key, bucket);
  }
  bucket.windowMs = windowMs;
  const cutoff = now - windowMs;
  while (bucket.times.length && bucket.times[0] <= cutoff) bucket.times.shift();

  if (bucket.times.length >= limit) {
    // 要等到第 (length - limit) 筆過期，視窗裡才會少於 limit 筆
    const freesAt = bucket.times[bucket.times.length - limit] + windowMs;
    return { ok: false, retryAfter: seconds(freesAt - now) };
  }
  bucket.times.push(now);
  return { ok: true };
}

/** 記住「這個 key 在 until 之前都不用再問儲存空間了」 */
export function block(key, until, now = Date.now()) {
  maybePrune(now);
  if (until > now) blocks.set(key, until);
}

/** 還要封鎖幾秒；沒有被封鎖就回 0 */
export function blockedFor(key, now = Date.now()) {
  const until = blocks.get(key);
  if (until === undefined) return 0;
  if (until <= now) {
    blocks.delete(key);
    return 0;
  }
  return seconds(until - now);
}

/** 測試用：全部歸零 */
export function resetLimiter() {
  buckets.clear();
  blocks.clear();
  calls = 0;
}

/** 測試與除錯用 */
export const limiterSize = () => buckets.size + blocks.size;
