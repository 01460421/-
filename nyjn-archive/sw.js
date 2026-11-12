/* 逆雨檔案館的離線快取。
   版本來自註冊時的 ?v=（assets/js/config.js 的 SITE_VERSION）；版本一變，舊的快取整份丟掉。
   /api 一律走網路，不經過這裡。 */
const V = new URL(self.location.href).searchParams.get('v') || '0';
const CACHE = 'nyjn-' + V;
const q = (p) => p + '?v=' + V;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png',
  q('assets/css/base.css'), q('assets/css/plus.css'), q('assets/js/theme.js'), q('assets/js/config.js'),
  q('assets/js/paint.js'), q('assets/js/film.js'), q('assets/js/data.js'), q('assets/js/app.js'),
  q('assets/js/plus/kit.js'), q('assets/js/plus/settings.js'), q('assets/js/plus/sound.js'), q('assets/js/plus/gloss.js'),
  q('assets/js/plus/palette.js'), q('assets/js/plus/reader.js'), q('assets/js/plus/score.js'), q('assets/js/plus/cinema.js'), q('assets/js/plus/quiz.js'),
  q('assets/js/plus/rank.js'), q('assets/js/plus/social.js'), q('assets/js/plus/sync.js'), q('assets/js/plus/admin.js'),
  q('assets/css/game.css'), q('assets/js/plus/game.js'), q('assets/js/plus/quests.js'), q('assets/js/plus/darkroom.js'), q('assets/js/plus/album.js'), q('assets/js/plus/arcade.js'),
  q('assets/js/plus/games/order.js'), q('assets/js/plus/games/match.js'), q('assets/js/plus/games/catch.js'), q('assets/js/plus/games/code.js'), q('assets/js/plus/shop.js'), q('assets/js/plus/profile.js'),
  q('assets/js/boot.js')];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('nyjn-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // 字型等外部資源交給瀏覽器
  if (url.pathname.indexOf('/api/') >= 0) return;             // 後端永遠走網路
  if (url.pathname.endsWith('/sw.js')) return;
  if (req.headers.has('range') || /\.(mp4|m4a|mp3|ogg|webm|wav)$/i.test(url.pathname)) return;   // 配樂是分段抓的大檔，交給瀏覽器
  if (req.mode === 'navigate') {                              // 頁面：先網路，斷線才用快取
    e.respondWith(fetch(req).then((r) => {
      if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); }
      return r;
    }).catch(() => caches.match('index.html').then((r) => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {   // 其他：先給快取，同時在背景更新
    const net = fetch(req).then((r) => { if (r && r.ok && r.type === 'basic') c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })));
});
