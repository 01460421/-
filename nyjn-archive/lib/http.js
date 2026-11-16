// 請求與回應的共用工具。
// 在 Vercel 上 req 會帶 query / body 這兩個輔助屬性；本機的開發伺服器和測試裡，
// req 只是單純的 http.IncomingMessage。這裡把兩種情況收斂成同一個 ctx。
// 回應一律用 Node 原生的 statusCode / setHeader / end，兩邊都能跑。
import { CACHE, MEM_RATES, env } from './config.js';
import { take } from './ratelimit.js';
import { StoreUnavailableError } from './store-errors.js';
import { ipHash, isPlainObject, safeEqual } from './util.js';

const MESSAGES = {
  bad_request: '格式不對',
  bad_channel: '沒有這個本子',
  bad_id: '編號不對',
  empty: '這一段是空的',
  forbidden: '只有作者或館主能這樣做',
  banned: '這把鑰匙已經被停權',
  not_found: '找不到這一筆',
  method: '不支援的方法',
  duplicate: '這一段剛剛已經送出過了',
  conflict: '雲端的版本不一樣，先同步再存',
  full: '名額已滿',
  too_large: '內容太長',
  rate_limited: '寫得太快了，休息一下再接',
  no_store: '還沒接上儲存空間',
  server: '後端出了點狀況，稍後再試',
};

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code 機器讀的代碼（見 docs/API.md 的表）
   * @param {string} [message] 給人看的中文訊息，省略就用預設的
   * @param {{ headers?: Record<string,string>, extra?: object }} [options] extra 會併進回應的 JSON
   */
  constructor(status, code, message, { headers, extra } = {}) {
    super(message || MESSAGES[code] || MESSAGES.server);
    this.status = status;
    this.code = code;
    this.headers = headers || {};
    this.extra = extra || {};
  }
}

export const fail = (status, code, message, options) => new HttpError(status, code, message, options);

export function rateLimited(retryAfter, message) {
  const secs = Math.max(1, Math.ceil(retryAfter));
  return fail(429, 'rate_limited', message, { headers: { 'Retry-After': String(secs) } });
}

/** 成功的回應；處理函式回傳這個，由 serve() 送出 */
export const reply = (status, body, headers = {}) => ({ status, body, headers });

/** 記憶體內的頻率限制，超過就丟 429（MEM_RATES 裡的名字） */
export function limit(name, key) {
  const [max, windowMs] = MEM_RATES[name];
  const result = take(`${name}:${key}`, max, windowMs);
  if (!result.ok) throw rateLimited(result.retryAfter);
}

// ---------- 請求 ----------

/** 查詢字串 → 單純的字串對照表（重複的參數取第一個） */
export function getQuery(req) {
  const out = Object.create(null);
  if (isPlainObject(req.query)) {
    for (const [key, value] of Object.entries(req.query)) {
      const first = Array.isArray(value) ? value[0] : value;
      out[key] = first == null ? '' : String(first);
    }
    return out;
  }
  const url = String(req.url || '');
  const at = url.indexOf('?');
  if (at < 0) return out;
  for (const [key, value] of new URLSearchParams(url.slice(at + 1))) {
    if (!(key in out)) out[key] = value;
  }
  return out;
}

export function getHeader(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
}

/** 和 v1 相同：x-forwarded-for 的第一段（Vercel 會自己覆寫這個標頭），本機退回連線位址 */
export function clientIp(req) {
  const forwarded = getHeader(req, 'x-forwarded-for').split(',')[0].trim();
  return (forwarded || req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

/** 讀完整個請求本體，超過 maxBytes 就丟 413（不會把超量的資料留在記憶體裡） */
function readStream(req, maxBytes) {
  return new Promise((resolve, reject) => {
    // 已經被別人讀完的串流（例如 Vercel 先解析過）不會再吐資料
    if (req.readableEnded || req.destroyed || typeof req.on !== 'function') {
      resolve(Buffer.alloc(0));
      return;
    }
    const declared = Number(req.headers?.['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      reject(fail(413, 'too_large'));
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      req.off('data', onData);
      if (error) {
        req.resume(); // 剩下的丟掉，讓連線能正常收尾
        reject(error);
      } else {
        resolve(Buffer.concat(chunks));
      }
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > maxBytes) finish(fail(413, 'too_large'));
      else chunks.push(chunk);
    };
    req.on('data', onData);
    req.once('end', () => finish());
    req.once('error', () => finish(fail(400, 'bad_request')));
    // 對方中途斷線：不會有 end，只有 close（正常結束時 end 會先到，這裡就什麼都不做）
    req.once('close', () => finish(fail(400, 'bad_request')));
  });
}

function parseJsonText(text, maxChars) {
  if (text.length > maxChars) throw fail(413, 'too_large');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw fail(400, 'bad_request');
  }
  if (!isPlainObject(parsed)) throw fail(400, 'bad_request');
  return parsed;
}

/**
 * 取得 JSON 本體（一定是物件）。
 * @param {number} maxChars 字元上限，超過回 413
 */
export async function readJson(req, maxChars) {
  let preset;
  try {
    preset = req.body; // Vercel 的 getter：JSON 壞掉時會在這裡丟例外
  } catch {
    throw fail(400, 'bad_request');
  }

  if (preset !== undefined && preset !== null) {
    if (typeof preset === 'string') return parseJsonText(preset, maxChars);
    if (Buffer.isBuffer(preset)) return parseJsonText(preset.toString('utf8'), maxChars);
    if (!isPlainObject(preset)) throw fail(400, 'bad_request');
    if (JSON.stringify(preset).length > maxChars) throw fail(413, 'too_large');
    return preset;
  }

  // 一個 UTF-16 字元最多變成 3 個 UTF-8 位元組，所以位元組的硬上限抓 3 倍
  const raw = await readStream(req, maxChars * 3);
  if (!raw.length) throw fail(400, 'bad_request');
  return parseJsonText(raw.toString('utf8'), maxChars);
}

// ---------- 館主 ----------

export function isAdmin(req) {
  const key = env.adminKey;
  return Boolean(key) && safeEqual(getHeader(req, 'x-admin-key'), key);
}

// ---------- 回應 ----------

function applyCors(req, res) {
  const origins = env.allowOrigins;
  if (origins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    const origin = getHeader(req, 'origin');
    res.setHeader('Access-Control-Allow-Origin', origins.includes(origin) ? origin : origins[0]);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-admin-key,x-owner,if-none-match');
  res.setHeader('Access-Control-Expose-Headers', 'ETag,Retry-After');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  if (body === undefined || body === null) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function sendError(res, error) {
  if (error instanceof HttpError) {
    send(res, error.status, { error: error.message, code: error.code, ...error.extra }, {
      'Cache-Control': CACHE.none,
      ...error.headers,
    });
    return;
  }
  if (error instanceof StoreUnavailableError) {
    if (error.cause) console.error('[nyjn] store unavailable:', error.cause);
    send(res, 503, { error: MESSAGES.no_store, code: 'no_store' }, { 'Cache-Control': CACHE.none });
    return;
  }
  // 其他錯誤：細節只進 log，不給外面看
  console.error('[nyjn]', error);
  send(res, 500, { error: MESSAGES.server, code: 'server' }, { 'Cache-Control': CACHE.none });
}

function makeContext(req, method) {
  const ip = clientIp(req);
  let ih;
  return {
    req,
    method,
    now: Date.now(),
    query: getQuery(req),
    ip,
    /** IP 的雜湊（用到才算） */
    get ih() {
      ih ??= ipHash(ip);
      return ih;
    },
    header: (name) => getHeader(req, name),
    json: (maxChars) => readJson(req, maxChars),
  };
}

/**
 * 每個 api/*.js 的共同外殼：CORS、OPTIONS、方法分派、錯誤轉成統一格式。
 * @param {Record<string, (ctx: object) => Promise<{status:number, body:any, headers:object}>>} routes 以方法為鍵
 * @param {{ guard?: (ctx: object) => void }} [options] guard 在方法分派之前執行（館主那組用它先擋 404／403）
 */
export async function serve(req, res, routes, { guard } = {}) {
  try {
    applyCors(req, res);
    res.setHeader('Cache-Control', CACHE.none);

    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      send(res, 204);
      return;
    }

    const ctx = makeContext(req, method);
    if (guard) await guard(ctx);

    // HEAD 當成沒有本體的 GET（Node 會自己把本體丟掉）
    const run = routes[method] || (method === 'HEAD' ? routes.GET : undefined);
    if (!run) {
      const allow = [...Object.keys(routes), 'OPTIONS'].join(', ');
      throw fail(405, 'method', undefined, { headers: { Allow: allow } });
    }

    const out = await run(ctx);
    send(res, out.status, out.body, out.headers);
  } catch (error) {
    if (res.headersSent) {
      console.error('[nyjn] error after headers were sent:', error);
      res.end();
      return;
    }
    sendError(res, error);
  }
}
