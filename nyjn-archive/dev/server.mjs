#!/usr/bin/env node
// 本機開發伺服器：把專案根目錄當靜態網站，/api/* 轉給 api/ 底下的處理函式，
// 並套用 vercel.json 裡簡單的 headers 規則，讓本機盡量接近 Vercel 上的樣子。
//
//   npm run dev                 → http://localhost:8787（資料存在 .data/）
//   npm run dev -- --port 3000  或  PORT=3000 npm run dev
//   NYJN_STORE=memory npm run dev  （資料只放記憶體，關掉就沒了）
//
// 只給開發用：沒有壓縮、沒有 Range、沒有 HTTPS。
import { createReadStream, existsSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = 8787;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

// 這些最上層的資料夾不當靜態檔案送出去（以 . 開頭的檔案和資料夾另外一律不送）
const PRIVATE_TOP_LEVEL = new Set(['node_modules', 'lib', 'dev', 'test', 'api']);

function sendText(res, status, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(text);
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// ---------- vercel.json 的 headers ----------

const hasPatternSyntax = (s) => /[()*:?+[\]{}|\\^$]/.test(s);

/** 只支援 /(.*)、/某個前綴/(.*)、以及完全相同的路徑；其他寫法回 null（忽略） */
function compileSource(source) {
  if (typeof source !== 'string' || !source.startsWith('/')) return null;
  if (source.endsWith('/(.*)')) {
    const prefix = source.slice(0, -'(.*)'.length);
    return hasPatternSyntax(prefix) ? null : (pathname) => pathname.startsWith(prefix);
  }
  return hasPatternSyntax(source) ? null : (pathname) => pathname === source;
}

function compileHeaderRules(config) {
  const rules = [];
  if (!config || !Array.isArray(config.headers)) return rules;
  for (const entry of config.headers) {
    if (!entry || typeof entry !== 'object' || entry.has || entry.missing) continue; // 帶條件的不支援
    const matches = compileSource(entry.source);
    if (!matches || !Array.isArray(entry.headers)) continue;
    const headers = entry.headers
      .filter((h) => h && typeof h.key === 'string' && typeof h.value === 'string')
      .map((h) => [h.key, h.value]);
    if (headers.length) rules.push({ matches, headers });
  }
  return rules;
}

/** 讀 vercel.json；檔案有變（別人正在改）就重新讀 */
function createHeaderRules(root) {
  const file = path.join(root, 'vercel.json');
  let cachedAt = -1;
  let rules = [];
  return async function rulesFor() {
    let info;
    try {
      info = await stat(file);
    } catch {
      cachedAt = -1;
      rules = [];
      return rules;
    }
    if (info.mtimeMs !== cachedAt) {
      cachedAt = info.mtimeMs;
      try {
        rules = compileHeaderRules(JSON.parse(await readFile(file, 'utf8')));
      } catch (error) {
        console.warn(`[dev] vercel.json 讀不懂，先不套用 headers：${error.message}`);
        rules = [];
      }
    }
    return rules;
  };
}

function applyRules(res, rules, pathname) {
  for (const rule of rules) {
    if (!rule.matches(pathname)) continue;
    for (const [key, value] of rule.headers) res.setHeader(key, value);
  }
}

// ---------- /api/* ----------

const API_SEGMENT = /^[a-z0-9][a-z0-9_-]*$/i;

/** /api/board → api/board.js、/api/cron/sweep → api/cron/sweep.js；不是合法的名字或沒有檔案回 null */
function apiFileFor(apiDir, pathname) {
  const segments = pathname.slice('/api/'.length).split('/');
  if (!segments.length || !segments.every((s) => API_SEGMENT.test(s))) return null;
  const file = path.join(apiDir, ...segments) + '.js';
  return existsSync(file) ? file : null;
}

async function handleApi(req, res, apiDir, pathname) {
  const file = apiFileFor(apiDir, pathname);
  if (!file) {
    sendJson(res, 404, { error: '沒有這個端點', code: 'not_found' });
    return;
  }
  try {
    const module = await import(pathToFileURL(file).href);
    if (typeof module.default !== 'function') throw new Error(`${file} has no default export`);
    await module.default(req, res);
  } catch (error) {
    console.error(`[dev] ${pathname} 的處理函式丟出例外：`, error);
    if (!res.headersSent) sendJson(res, 500, { error: '後端出了點狀況，稍後再試', code: 'server' });
    else res.end();
  }
}

// ---------- 靜態檔案 ----------

/** 把網址的路徑對到專案裡的檔案；不該送的（或不存在的）回 null */
async function resolveStatic(root, rootReal, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;

  const segments = decoded.split('/').filter(Boolean);
  // 以 . 開頭的一律不送：擋掉 ..（往上爬）、.data/、.env、.git 之類
  if (segments.some((s) => s.startsWith('.'))) return null;
  if (segments.length && PRIVATE_TOP_LEVEL.has(segments[0].toLowerCase())) return null;

  let file = path.join(root, ...segments);
  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    file = path.join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info?.isFile()) return null;

  // 符號連結不能指到專案外面
  const real = await realpath(file).catch(() => null);
  if (!real || !(real === rootReal || real.startsWith(rootReal + path.sep))) return null;

  return { file, size: info.size, mtime: info.mtime };
}

async function handleStatic(req, res, root, rootReal, pathname, rules) {
  // 和 Vercel 一樣：vercel.json 的 headers 可以蓋掉靜態檔案的預設值，404 也照樣套用。
  // 所以每一種回應都是「先設預設值 → 再套規則 → 送出」。
  const finish = (status, text) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    applyRules(res, rules, pathname);
    res.end(text);
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    finish(405, 'Method Not Allowed');
    return;
  }
  const found = await resolveStatic(root, rootReal, pathname);
  if (!found) {
    // 和 Vercel 一樣：根目錄有 404.html 就拿它當「找不到」的頁面
    const custom = await readFile(path.join(root, '404.html')).catch(() => null);
    if (!custom) {
      finish(404, 'Not Found');
      return;
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', CONTENT_TYPES['.html']);
    res.setHeader('Cache-Control', 'no-store');
    applyRules(res, rules, pathname);
    res.end(req.method === 'HEAD' ? undefined : custom);
    return;
  }

  res.setHeader('Content-Type', CONTENT_TYPES[path.extname(found.file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Last-Modified', found.mtime.toUTCString());
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Accept-Ranges', 'bytes');
  applyRules(res, rules, pathname);

  // 分段請求（bytes=a-b／a-／-n）：瀏覽器在音檔裡跳轉時會用到，Vercel 的靜態檔也支援
  let range = null;
  const wanted = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
  if (wanted && (wanted[1] || wanted[2]) && found.size > 0) {
    let start = wanted[1] ? Number(wanted[1]) : Math.max(0, found.size - Number(wanted[2]));
    let end = wanted[1] && wanted[2] ? Math.min(Number(wanted[2]), found.size - 1) : found.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= found.size) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${found.size}`);
      res.end();
      return;
    }
    range = { start, end };
  }
  if (range) {
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${found.size}`);
    res.setHeader('Content-Length', range.end - range.start + 1);
  } else {
    res.statusCode = 200;
    res.setHeader('Content-Length', found.size);
  }

  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(found.file, range || undefined);
  stream.on('error', (error) => {
    console.error(`[dev] 讀檔失敗 ${found.file}:`, error.message);
    res.destroy();
  });
  stream.pipe(res);
}

/**
 * 從請求行取出路徑（不含查詢字串）。
 * 故意不用 new URL()：它會把 //host 當成網域、把 .. 先化簡掉，我們要看到原樣的路徑才好把關。
 */
function pathnameOf(req) {
  const target = String(req.url || '/');
  if (!target.startsWith('/')) return null; // 例如代理伺服器用的絕對網址，開發伺服器不處理
  const end = target.search(/[?#]/);
  return end < 0 ? target : target.slice(0, end);
}

// ---------- 伺服器 ----------

/**
 * @param {{ root?: string, apiDir?: string, log?: boolean }} [options]
 *   root 是靜態檔案與 vercel.json 的所在；apiDir 是處理函式的所在（預設 root/api）
 */
export function createDevServer({ root = PROJECT_ROOT, apiDir, log = false } = {}) {
  // 開發伺服器預設把資料存成本機檔案（專案根目錄的 .data/），不會碰到線上的 Blob
  process.env.NYJN_STORE ||= 'file';
  process.env.NYJN_DATA_DIR ||= path.join(PROJECT_ROOT, '.data');

  const rootDir = path.resolve(root);
  const apiRoot = path.resolve(apiDir || path.join(rootDir, 'api'));
  const rulesFor = createHeaderRules(rootDir);
  let rootReal = null;

  return http.createServer(async (req, res) => {
    const started = Date.now();
    if (log) {
      res.on('finish', () => {
        console.log(`[dev] ${req.method} ${req.url} → ${res.statusCode} (${Date.now() - started}ms)`);
      });
    }
    try {
      const pathname = pathnameOf(req);
      if (pathname === null) {
        sendText(res, 400, 'Bad Request');
        return;
      }
      const rules = await rulesFor();

      if (pathname === '/api' || pathname.startsWith('/api/')) {
        // 函式自己設的標頭優先（它們在後面才設，會蓋掉這裡的）
        applyRules(res, rules, pathname);
        await handleApi(req, res, apiRoot, pathname);
        return;
      }
      rootReal ??= await realpath(rootDir);
      await handleStatic(req, res, rootDir, rootReal, pathname, rules);
    } catch (error) {
      console.error('[dev] 沒處理到的錯誤：', error);
      if (!res.headersSent) sendText(res, 500, 'Internal Server Error');
      else res.end();
    }
  });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=', 2);
    const value = () => inline ?? argv[(i += 1)];
    if (flag === '--port' || flag === '-p') args.port = value();
    else if (flag === '--host') args.host = value();
    else if (flag === '--log') args.log = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.port ?? process.env.PORT ?? DEFAULT_PORT);
  const host = args.host ?? process.env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`[dev] 埠號不對：${args.port ?? process.env.PORT}`);
    process.exit(1);
  }

  const server = createDevServer({ log: Boolean(args.log) });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `[dev] ${port} 這個埠已經有人在用了，換一個：--port <數字>` : error);
    process.exit(1);
  });
  server.listen(port, host, () => {
    const shown = host === '127.0.0.1' || host === '0.0.0.0' ? 'localhost' : host;
    const store = process.env.NYJN_STORE;
    const where = store === 'file' ? `file → ${path.relative(process.cwd(), process.env.NYJN_DATA_DIR) || '.'}/` : store;
    console.log(`逆雨檔案館 dev  http://${shown}:${server.address().port}  （儲存：${where}）`);
  });

  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections(); // 瀏覽器還掛著的連線不用等
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// 直接執行才啟動；被測試 import 時只拿 createDevServer
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
