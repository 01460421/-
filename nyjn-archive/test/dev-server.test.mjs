// 本機開發伺服器：靜態檔案、不該送的路徑、/api 路由、vercel.json 的 headers。
// 靜態根目錄用臨時資料夾（不依賴另一位工程師正在改的 index.html / vercel.json），api/ 用真的。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createDevServer } from '../dev/server.mjs';
import { ALICE, freshWorld } from './helpers.mjs';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let tmp;
let root;
let server;
let port;

const VERCEL_JSON = {
  headers: [
    { source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/' }] },
    // 以下的寫法不支援，應該被忽略
    { source: '/:path*', headers: [{ key: 'X-Fancy-Param', value: '1' }] },
    { source: '/(?!api/).*', headers: [{ key: 'X-Fancy-Regex', value: '1' }] },
    { source: '/(.*)', has: [{ type: 'query', key: 'x' }], headers: [{ key: 'X-Fancy-Has', value: '1' }] },
    { source: 'no-leading-slash', headers: [{ key: 'X-Bad', value: '1' }] },
    { headers: [{ key: 'X-No-Source', value: '1' }] },
  ],
};

async function put(relative, content) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

/** 不經過 fetch 的網址正規化，原樣送出路徑（測 ../ 用） */
function raw(pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

before(async () => {
  freshWorld(); // NYJN_STORE=memory
  tmp = await mkdtemp(path.join(tmpdir(), 'nyjn-dev-'));
  root = path.join(tmp, 'site');
  await writeFile(path.join(tmp, 'secret.txt'), 'TOP SECRET (outside the project)');

  await put('index.html', '<!doctype html><title>逆雨檔案館</title>');
  await put('sub/index.html', '<p>sub</p>');
  await put('assets/css/base.css', 'body{}');
  await put('assets/js/app.js', 'console.log(1)');
  await put('assets/data.json', '{"a":1}');
  await put('assets/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await put('assets/pixel.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await put('assets/.hidden', 'hidden');
  await put('manifest.webmanifest', '{"name":"x"}');
  await put('favicon.ico', Buffer.from([0, 0, 1, 0]));
  await put('robots.txt', 'User-agent: *');
  await put('sitemap.xml', '<urlset/>');
  await put('sw.js', '// sw');
  await put('file.unknownext', 'bytes');
  await put('.env', 'ADMIN_KEY=do-not-serve');
  await put('.data/board/h33.json', '{"items":["PRIVATE DATA"]}');
  await put('node_modules/pkg/index.js', 'module.exports = "PRIVATE"');
  await put('lib/store.js', '// PRIVATE lib');
  await put('dev/server.mjs', '// PRIVATE dev');
  await put('test/x.test.mjs', '// PRIVATE test');
  await put('api/board.js', '// PRIVATE api source in the static root');
  await put('vercel.json', JSON.stringify(VERCEL_JSON));
  await symlink(path.join(tmp, 'secret.txt'), path.join(root, 'assets', 'link.txt'));

  server = createDevServer({ root, apiDir: path.join(PROJECT, 'api') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(tmp, { recursive: true, force: true });
});

describe('static files', () => {
  test('/ serves index.html; directories serve their index.html', async () => {
    const home = await raw('/');
    assert.equal(home.status, 200);
    assert.equal(home.headers['content-type'], 'text/html; charset=utf-8');
    assert.match(home.text, /逆雨檔案館/);
    assert.equal((await raw('/index.html')).text, home.text);
    assert.equal((await raw('/sub/')).text, '<p>sub</p>');
    assert.equal((await raw('/?utm=1')).status, 200, 'query strings are ignored');
  });

  test('content types', async () => {
    const expected = {
      '/assets/css/base.css': 'text/css; charset=utf-8',
      '/assets/js/app.js': 'text/javascript; charset=utf-8',
      '/assets/data.json': 'application/json; charset=utf-8',
      '/assets/icon.svg': 'image/svg+xml',
      '/assets/pixel.png': 'image/png',
      '/manifest.webmanifest': 'application/manifest+json; charset=utf-8',
      '/favicon.ico': 'image/x-icon',
      '/robots.txt': 'text/plain; charset=utf-8',
      '/sitemap.xml': 'application/xml; charset=utf-8',
      '/file.unknownext': 'application/octet-stream',
    };
    for (const [url, type] of Object.entries(expected)) {
      const res = await raw(url);
      assert.equal(res.status, 200, url);
      assert.equal(res.headers['content-type'], type, url);
    }
  });

  test('HEAD has headers but no body; other methods are refused', async () => {
    const head = await raw('/assets/js/app.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers['content-length'], '14');
    assert.equal(head.text, '');
    const post = await raw('/index.html', { method: 'POST', body: 'x' });
    assert.equal(post.status, 405);
  });

  test('missing files → 404', async () => {
    assert.equal((await raw('/nope.html')).status, 404);
    assert.equal((await raw('/assets/')).status, 404, 'no directory listings');
    assert.equal((await raw('/assets/js/app.js/extra')).status, 404);
  });

  test('a root 404.html is used as the not-found page (status stays 404)', async () => {
    await put('404.html', '<h1>查無此頁</h1>');
    try {
      const res = await raw('/nope.html');
      assert.equal(res.status, 404);
      assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
      assert.match(res.text, /查無此頁/);
      const hidden = await raw('/.env');
      assert.equal(hidden.status, 404);
      assert.ok(!hidden.text.includes('do-not-serve'));
    } finally {
      await rm(path.join(root, '404.html'));
    }
  });

  test('no directory traversal', async () => {
    const attempts = [
      '/../secret.txt',
      '/assets/../../secret.txt',
      '/%2e%2e/secret.txt',
      '/%2E%2E%2Fsecret.txt',
      '/assets/%2e%2e/%2e%2e/secret.txt',
      '/assets/..%2f..%2fsecret.txt',
      '/..%5csecret.txt',
      '/assets/....//....//secret.txt',
      '//secret.txt',
      '/%00/../secret.txt',
      '/%E0%A4%A', // 壞掉的編碼
    ];
    for (const url of attempts) {
      const res = await raw(url);
      assert.ok([400, 404].includes(res.status), `${url} → ${res.status}`);
      assert.ok(!res.text.includes('TOP SECRET'), url);
    }
    const viaLink = await raw('/assets/link.txt');
    assert.equal(viaLink.status, 404, 'a symlink pointing outside the project is not followed');
  });

  test('never serves .data/, node_modules/, dotfiles, lib/, dev/, test/ (or api/ sources)', async () => {
    const blocked = [
      '/.env',
      '/.data/board/h33.json',
      '/.data/',
      '/assets/.hidden',
      '/node_modules/pkg/index.js',
      '/lib/store.js',
      '/LIB/store.js',
      '/dev/server.mjs',
      '/test/x.test.mjs',
      '/assets/../lib/store.js',
      '/sub/../.env',
    ];
    for (const url of blocked) {
      const res = await raw(url);
      assert.equal(res.status, 404, url);
      assert.ok(!res.text.includes('PRIVATE') && !res.text.includes('do-not-serve'), url);
    }
    const source = await raw('/api/board.js');
    assert.equal(source.status, 404);
    assert.ok(!source.text.includes('PRIVATE'));
  });
});

describe('/api routing', () => {
  test('routes to the real handlers (memory store)', async () => {
    const health = await raw('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.store, 'memory');
    assert.equal(health.json.v, '2.0.0');

    const posted = await raw('/api/board', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { k: 'h33', o: ALICE, name: '開發者', x: '從開發伺服器貼的' },
    });
    assert.equal(posted.status, 201);

    const listed = await raw('/api/board?k=h33&fresh=1');
    assert.deepEqual(listed.json.items.map((i) => i.x), ['從開發伺服器貼的']);
    assert.equal(listed.headers['cache-control'], 'no-store');

    const cached = await raw('/api/board?k=h33', { headers: { 'if-none-match': listed.headers.etag } });
    assert.equal(cached.status, 304);

    const removed = await raw(`/api/board?k=h33&id=${posted.json.item.id}`, { method: 'DELETE', headers: { 'x-owner': ALICE } });
    assert.equal(removed.status, 200);

    const pulse = await raw('/api/pulse');
    assert.equal(pulse.status, 200);
    assert.equal(pulse.json.totals.relay, 0);
  });

  test('nested route /api/cron/sweep', async () => {
    const res = await raw('/api/cron/sweep');
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
  });

  test('unknown endpoints and odd names → JSON 404, never a file', async () => {
    for (const url of ['/api/nope', '/api', '/api/', '/api/board/', '/api/../lib/store', '/api/%2e%2e/lib/store', '/api/cron', '/api/.env']) {
      const res = await raw(url);
      assert.equal(res.status, 404, url);
      assert.equal(res.json?.code, 'not_found', url);
    }
  });

  test('oversized request bodies are refused with 413', async () => {
    const res = await raw('/api/board', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { k: 'h33', o: ALICE, x: 'x'.repeat(50_000) },
    });
    assert.equal(res.status, 413);
    assert.equal(res.json.code, 'too_large');
  });
});

describe('vercel.json headers', () => {
  test('/(.*) applies everywhere; /assets/(.*) and exact paths only where they match', async () => {
    const home = await raw('/');
    assert.equal(home.headers['x-frame-options'], 'DENY');
    assert.equal(home.headers['cache-control'], 'public, max-age=0, must-revalidate');
    assert.equal(home.headers['service-worker-allowed'], undefined);

    const asset = await raw('/assets/js/app.js');
    assert.equal(asset.headers['x-frame-options'], 'DENY');
    assert.equal(asset.headers['cache-control'], 'public, max-age=31536000, immutable', 'the later, more specific rule wins');

    const sw = await raw('/sw.js');
    assert.equal(sw.headers['service-worker-allowed'], '/');
    assert.equal(sw.headers['cache-control'], 'public, max-age=0, must-revalidate');

    assert.equal((await raw('/nope.html')).headers['x-frame-options'], 'DENY', 'also on 404s');
  });

  test('a function’s own headers win over vercel.json', async () => {
    const health = await raw('/api/health');
    assert.equal(health.headers['x-frame-options'], 'DENY');
    assert.equal(health.headers['cache-control'], 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  });

  test('fancier patterns are ignored', async () => {
    const res = await raw('/index.html?x=1');
    for (const name of ['x-fancy-param', 'x-fancy-regex', 'x-fancy-has', 'x-bad', 'x-no-source']) {
      assert.equal(res.headers[name], undefined, name);
    }
  });

  test('edits to vercel.json are picked up; a broken or missing file just means no extra headers', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const file = path.join(root, 'vercel.json');
    const bump = async (content, seconds) => {
      await writeFile(file, content);
      const when = new Date(Date.now() + seconds * 1000);
      await utimes(file, when, when); // 確保 mtime 一定不同
    };

    await bump(JSON.stringify({ headers: [{ source: '/(.*)', headers: [{ key: 'X-Edited', value: 'yes' }] }] }), 10);
    const edited = await raw('/');
    assert.equal(edited.headers['x-edited'], 'yes');
    assert.equal(edited.headers['x-frame-options'], undefined);
    assert.equal(edited.headers['cache-control'], 'no-cache', 'the dev default when nothing overrides it');

    await bump('{ not json', 20);
    assert.equal((await raw('/')).headers['x-edited'], undefined);

    await bump(JSON.stringify({ rewrites: [] }), 30);
    assert.equal((await raw('/')).status, 200);

    await rm(file);
    assert.equal((await raw('/')).status, 200);
    await bump(JSON.stringify(VERCEL_JSON), 40);
    assert.equal((await raw('/')).headers['x-frame-options'], 'DENY');
  });
});

describe('command line', () => {
  /** 啟動 `node dev/server.mjs …`，等它印出那一行網址 */
  function start(args, env = {}) {
    const child = spawn(process.execPath, [path.join(PROJECT, 'dev', 'server.mjs'), ...args], {
      cwd: PROJECT,
      env: { ...process.env, NYJN_STORE: 'memory', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const ready = new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error(`dev server did not start: ${out}`)), 10_000);
      child.stdout.on('data', (chunk) => {
        out += chunk;
        const match = /http:\/\/localhost:(\d+)/.exec(out);
        if (match) {
          clearTimeout(timer);
          resolve({ line: out, port: Number(match[1]) });
        }
      });
      child.stderr.on('data', (chunk) => {
        out += chunk;
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`dev server exited (${code}): ${out}`));
      });
    });
    const stop = () =>
      new Promise((resolve) => {
        child.removeAllListeners('exit');
        child.once('exit', resolve);
        child.kill('SIGTERM');
      });
    return { ready, stop };
  }

  test('--port N: prints one line with the URL and serves the real project', async () => {
    const child = start(['--port', '0']);
    try {
      const { line, port: childPort } = await child.ready;
      assert.equal(line.trim().split('\n').length, 1, 'exactly one line on start');
      assert.match(line, /memory/);
      const res = await fetch(`http://127.0.0.1:${childPort}/api/health`);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).store, 'memory');
      const home = await fetch(`http://127.0.0.1:${childPort}/`);
      assert.equal(home.status, 200);
      assert.match(home.headers.get('content-type'), /^text\/html/);
      assert.equal((await fetch(`http://127.0.0.1:${childPort}/lib/store.js`)).status, 404);
      assert.equal((await fetch(`http://127.0.0.1:${childPort}/package.json`)).status, 200);
    } finally {
      await child.stop();
    }
  });

  test('PORT env is honoured, and the default store is the local file store', async () => {
    const dataDir = path.join(tmp, 'cli-data');
    const child = start([], { PORT: '0', NYJN_STORE: '', NYJN_DATA_DIR: dataDir, BLOB_READ_WRITE_TOKEN: '' });
    try {
      const { line, port: childPort } = await child.ready;
      assert.match(line, /file/);
      const health = await (await fetch(`http://127.0.0.1:${childPort}/api/health`)).json();
      assert.equal(health.store, 'file');
    } finally {
      await child.stop();
    }
  });
});
