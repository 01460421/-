// 雜湊、字串清理、身分相關的小工具。
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from './config.js';

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
export const sha1 = (s) => createHash('sha1').update(String(s)).digest('hex');

// 和 v1 相同：去掉控制字元（保留 \t \n \r），再截到 n 個字元。
// 不是字串或數字的東西一律當成空字串，免得存進 "[object Object]"。
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
export function clip(value, n) {
  const s = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  return s.replace(CONTROL_CHARS, '').slice(0, n);
}

/** 作者鑰匙的格式；v1 前端產生的是 28 個字元，同樣符合 */
export const OWNER_RE = /^[a-z0-9]{16,40}$/;
export const ITEM_ID_RE = /^[a-z0-9]{6,24}$/;
export const CASE_ID_RE = /^[0-9a-f]{64}$/;

/** oh = sha256(o)，和 v1 相同；鑰匙格式不對就回空字串（視為匿名） */
export function ownerHash(o) {
  return typeof o === 'string' && OWNER_RE.test(o) ? sha256(o) : '';
}

/** 共鳴、回報、投票名單用的短代號 */
export const short12 = (oh) => (oh ? String(oh).slice(0, 12) : '');

/** IP 只留雜湊：sha256(HASH_SALT + '|' + ip) 的前 16 碼 */
export function ipHash(ip) {
  return sha256(`${env.hashSalt}|${ip}`).slice(0, 16);
}

/** 固定時間比較：先各自雜湊成等長，再用 timingSafeEqual */
export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a ?? '')).digest();
  const hb = createHash('sha256').update(String(b ?? '')).digest();
  return timingSafeEqual(ha, hb);
}

/** 和 v1 同一種樣子的 id：時間（36 進位）加六個隨機字元 */
export function newId(now = Date.now()) {
  return now.toString(36) + randomInt(36 ** 6).toString(36).padStart(6, '0');
}

/** UTC 的日期字串，例如 2026-11-11 */
export const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

/** 這一天（UTC）開始的時間戳 */
export const utcDayStart = (now) => Math.floor(now / 86_400_000) * 86_400_000;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 非負整數，其他一律當 0 */
export const count = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
