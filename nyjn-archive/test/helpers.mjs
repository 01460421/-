// 測試共用：假的 req / res，以及每個測試開始前把環境歸零。
import { Readable } from 'node:stream';
import { resetPulse } from '../lib/pulse.js';
import { resetLimiter } from '../lib/ratelimit.js';
import { getStore, resetStore } from '../lib/store.js';

const ENV_KEYS = [
  'NYJN_STORE',
  'NYJN_DATA_DIR',
  'BLOB_READ_WRITE_TOKEN',
  'BLOB_STORE_ID',
  'VERCEL',
  'ADMIN_KEY',
  'CRON_SECRET',
  'ALLOW_ORIGINS',
  'HASH_SALT',
  'RATE_10MIN',
  'RATE_DAY',
  'REPORT_HIDE',
  'CASE_TTL_DAYS',
];

/** 清掉所有相關的環境變數、記憶體 store、頻率限制；回傳乾淨的 memory store */
export function freshWorld(extraEnv = {}) {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.NYJN_STORE = 'memory';
  Object.assign(process.env, extraEnv);
  resetStore();
  resetLimiter();
  resetPulse();
  return process.env.NYJN_STORE === 'memory' ? getStore() : null;
}

/** 測試之間換一個 IP／換一輪頻率限制，但保留 store 裡的資料 */
export { resetLimiter };

function fakeResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    headersSent: false,
    body: '',
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    removeHeader(name) {
      headers.delete(String(name).toLowerCase());
    },
    end(chunk) {
      this.headersSent = true;
      this.body = chunk == null ? '' : String(chunk);
    },
    result() {
      let json = null;
      try {
        json = this.body ? JSON.parse(this.body) : null;
      } catch {
        json = null;
      }
      return { status: this.statusCode, headers: Object.fromEntries(headers), text: this.body, json };
    },
  };
}

/**
 * 直接呼叫一個 api 處理函式。
 * 預設的 req 就是一條單純的串流（像 http.IncomingMessage）；
 * vercel: true 時改成 Vercel 的樣子：req.query / req.body 已經解析好，串流已被讀完。
 */
export async function call(handler, options = {}) {
  const { method = 'GET', url = '/', headers = {}, body, ip = '203.0.113.7', vercel = false, rawBody } = options;

  const payload = rawBody !== undefined ? rawBody : body === undefined ? null : JSON.stringify(body);
  const req = Readable.from(payload === null || vercel ? [] : [Buffer.from(payload)]);
  req.method = method;
  req.url = url;
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = { 'x-forwarded-for': ip };
  if (payload !== null) {
    req.headers['content-type'] = 'application/json';
    req.headers['content-length'] = String(Buffer.byteLength(payload));
  }
  for (const [name, value] of Object.entries(headers)) req.headers[name.toLowerCase()] = value;

  if (vercel) {
    req.query = Object.fromEntries(new URL(url, 'http://localhost').searchParams);
    req.body = rawBody !== undefined ? rawBody : body;
  }

  const res = fakeResponse();
  await handler(req, res);
  return res.result();
}

/** 合法的作者鑰匙（/^[a-z0-9]{16,40}$/） */
export const key = (name) => (name + '0'.repeat(28)).slice(0, 28);

export const ALICE = key('alice');
export const BOB = key('bob');
export const CAROL = key('carol');
