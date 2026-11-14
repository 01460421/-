/* 配樂同步的情境測試。每一種情境都數「音軌被定位了幾次」（每一次都是聽得到的斷點），
   以及影片和配樂差多少：平常播放、慢裝置、跳章、暫停、畫面卡住、拖進度條、片尾、
   音檔載不到、配樂遲到、被系統暫停、朗讀模式、瀏覽器擋下自動播放。

   需要 Playwright（見 dev/smoke.cjs 開頭）：
     node dev/score.cjs               自己開本機伺服器
     node dev/score.cjs <網址> [情境]  對指定的網址跑，可以只跑某一個情境（例如 B）
*/
const { spawn } = require('node:child_process');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('找不到 Playwright。先執行：npm i -D playwright && npx playwright install chromium'); process.exit(2); }
let BASE = process.argv[2] || '';
const only = process.argv[3] || '';
let fails = 0, checks = 0;
const ok = (c, what, extra) => { checks++; console.log((c ? '  ✓ ' : '  ✗ ') + what + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 850 } });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  if (o.init) await p.addInitScript(o.init);
  if (o.cpu) { const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: o.cpu }); }
  if (o.route) await p.route('**/assets/audio/score.mp4', o.route);
  await p.goto(BASE + (o.hash || '/#film')); await p.waitForTimeout(1200);
  return p;
}
// 開始量：seeks = 定位次數；pauses = 音軌被暫停的次數；drift = 配樂出聲時「配樂時間 − 影片時間」
const meter = p => p.evaluate(() => {
  const a = __A.Score.audio, m = window.__m = { seeks: 0, pauses: 0, waits: 0, d: [] };
  a.addEventListener('seeking', () => m.seeks++); a.addEventListener('pause', () => m.pauses++); a.addEventListener('waiting', () => m.waits++);
  clearInterval(window.__mi); window.__mi = setInterval(() => { if (!a.paused && !a.seeking && a.readyState >= 3 && __A.Cinema.playing) m.d.push(+(a.currentTime - __A.Cinema.now).toFixed(3)); }, 100);
});
const read = (p, lastN) => p.evaluate(n => { const m = __m, d = m.d.slice(-n), a = __A.Score.audio; return { seeks: m.seeks, pauses: m.pauses, waits: m.waits, max: d.length ? Math.max(...d.map(Math.abs)) : null, n: d.length, film: +__A.Cinema.now.toFixed(2), audio: +a.currentTime.toFixed(2), playing: __A.Cinema.playing, apaused: a.paused, label: __A.Score.label() }; }, lastN || 20);
const start = async p => { await p.click('.film-big'); await p.waitForFunction(() => !!__A.Score.audio, null, { timeout: 10000 }); await meter(p); };

const T = {
  async A_normal(b) {
    const p = await open(b); await start(p); await sleep(15000); const r = await read(p, 100);
    ok(r.seeks === 0, '平常播放 15 秒：音軌一次都沒被定位', r); ok(r.max !== null && r.max < 0.15, '影片和配樂差不到 0.15 秒'); ok(Math.abs(r.film - 15) < 1.2, '影片照實際時間前進');
    await p.context().close();
  },
  async B_slow(b) {
    const p = await open(b, { cpu: 6, route: async r => { await sleep(700); r.continue(); } }); await start(p); await sleep(30000); const r = await read(p, 100);
    ok(r.seeks === 0, '慢裝置（CPU ×6）加上每個音檔請求延遲 0.7 秒，播放 30 秒：音軌一次都沒被定位', r); ok(r.max !== null && r.max < 0.35, '影片和配樂差不到 0.35 秒'); ok(r.film > 24, '影片沒有被拖慢');
    await p.context().close();
  },
  async C_jump_pause_freeze_rate(b) {
    const p = await open(b); await start(p); await sleep(3000);
    await p.evaluate(() => [...document.querySelectorAll('.film-list button')].find(x => x.textContent.includes('孤獨之歌')).click()); await sleep(5000);
    let r = await read(p, 20); ok(r.seeks === 1, '跳到第七章：定位一次', r); ok(r.max < 0.15 && r.film > 100, '跳過去之後兩邊對在一起');
    for (let i = 0; i < 3; i++) { await p.keyboard.press('k'); await sleep(900); await p.keyboard.press('k'); await sleep(1500); }
    r = await read(p, 10); ok(r.seeks === 1, '暫停再播放三次：沒有多出定位', r); ok(r.max < 0.15, '暫停再播放之後仍然對齊');
    const f0 = r.film; await p.evaluate(() => { const t = Date.now(); while (Date.now() - t < 3000); }); await sleep(1500);
    r = await read(p, 8); ok(r.seeks === 1, '畫面整個卡住 3 秒：配樂沒被拉回去（沒有定位）', r); ok(r.film - f0 > 4 && r.max < 0.2, '卡完之後影片自己追上配樂', +(r.film - f0).toFixed(2));
    await p.click('.film-row button[aria-label="播放速度"], .film-row button:has-text("1×")').catch(() => {}); await sleep(4000);
    r = await read(p, 15); const rate = await p.evaluate(() => __A.Score.audio.playbackRate);
    ok(rate === 1.25 && r.seeks === 1 && r.max < 0.2, '改成 1.25 倍速：配樂跟著變速，沒有定位', { rate, max: r.max, seeks: r.seeks });
    ok(!p.errs.length, '沒有 script 錯誤', p.errs);
    await p.context().close();
  },
  async D_scrub(b) {
    const p = await open(b); await start(p); await sleep(2500);
    const box = await p.evaluate(() => { const r = document.querySelector('.film-bar').getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
    await p.mouse.move(box.x + box.w * 0.2, box.y); await p.mouse.down();
    for (let i = 1; i <= 24; i++) { await p.mouse.move(box.x + box.w * (0.2 + i * 0.02), box.y); await sleep(25); }
    await p.mouse.up(); await sleep(4000);
    const r = await read(p, 15); ok(r.seeks <= 2, '拖進度條 24 步：拖的時候配樂先停，放開才定位', r); ok(r.max < 0.2 && Math.abs(r.film / 1645.5 - 0.68) < 0.02, '放開之後停在拖到的位置，兩邊對齊');
    await p.context().close();
  },
  async E_end_coda(b) {
    const p = await open(b); await start(p); await sleep(1500);
    const box = await p.evaluate(() => { const r = document.querySelector('.film-bar').getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
    await p.mouse.click(box.x + box.w * 0.9975, box.y); await sleep(8000);
    let s = await p.evaluate(() => ({ playing: __A.Cinema.playing, coda: __A.Score.coda, apaused: __A.Score.audio.paused, at: +__A.Score.audio.currentTime.toFixed(1), end: !document.querySelector('.film-end').hidden }));
    ok(!s.playing && s.end && s.coda && !s.apaused && s.at > 1645, '影片放完：配樂繼續把尾奏奏完', s);
    await p.evaluate(() => { const b = [...document.querySelectorAll('.film-end button')][0]; b.click(); }); await sleep(3500);
    s = await p.evaluate(() => ({ playing: __A.Cinema.playing, coda: __A.Score.coda, film: +__A.Cinema.now.toFixed(1), at: +__A.Score.audio.currentTime.toFixed(1) }));
    ok(s.playing && !s.coda && s.film < 6 && Math.abs(s.at - s.film) < 0.3, '從頭再放一次：配樂回到開頭', s);
    await p.context().close();
  },
  async F_fail(b) {
    const p = await open(b, { route: r => r.abort() }); await p.click('.film-big'); await sleep(6000);
    const s = await p.evaluate(() => ({ failed: __A.Score.failed, label: __A.Score.label(), film: +__A.Cinema.now.toFixed(1), playing: __A.Cinema.playing }));
    ok(s.failed && s.label === '配樂（環境音）' && s.playing && s.film > 4.5, '音檔載不到：退回環境音，影片照自己的時鐘走', s);
    await p.context().close();
  },
  async G_stall(b) {
    // 起步時音檔要 6 秒才回來：影片最多等 3 秒就先走，配樂回來之後再接上
    let n = 0; const p = await open(b, { route: async r => { n++; await sleep(6000); r.continue(); } });
    await p.click('.film-big'); await sleep(2000);
    let s = await p.evaluate(() => ({ film: +__A.Cinema.now.toFixed(2), label: __A.Score.label() })); ok(s.film < 0.2 && s.label === '配樂 載入中', '配樂還沒到：影片先等著', s);
    await sleep(3000); s = await p.evaluate(() => ({ film: +__A.Cinema.now.toFixed(2) })); ok(s.film > 1, '等超過 3 秒：影片先走', s);
    await meter(p); await sleep(14000); const r = await read(p, 20);
    ok(!r.apaused && r.max !== null && r.max < 0.3 && r.seeks <= 2, '配樂回來之後接上，最多定位兩次', r);
    await p.context().close();
  },
  async H_syspause(b) {
    const p = await open(b); await start(p); await sleep(3000);
    await p.evaluate(() => __A.Score.audio.pause()); await sleep(600);
    let s = await p.evaluate(() => ({ playing: __A.Cinema.playing })); ok(!s.playing, '音軌被系統暫停（耳機、來電）：影片跟著停', s);
    await p.evaluate(() => __A.Score.audio.play()); await sleep(2500);
    const r = await read(p, 10); ok(r.playing && !r.apaused && r.max < 0.15 && r.seeks === 0, '系統恢復播放：影片跟著接下去，沒有定位', r);
    await p.context().close();
  },
  async I_voice(b) {
    // 假的語音引擎：每個字唸 0.3 秒，一定會超過每句的時間，逼出「影片等朗讀」
    const init = () => {
      const fake = { getVoices: () => [{ lang: 'zh-TW', name: 'fake' }], cancel() { clearTimeout(this.t); }, speak(u) { clearTimeout(this.t); this.t = setTimeout(() => u.onend && u.onend(), u.text.length * 300); }, addEventListener() {} };
      Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    };
    const p = await open(b, { init }); await p.evaluate(() => { __A.Settings.set('voice', true); });
    await start(p); await p.evaluate(() => [...document.querySelectorAll('.film-list button')][3].click()); await sleep(26000);
    const r = await read(p, 10), a2 = await p.evaluate(() => ({ t: __A.Score.audio.currentTime, f: __A.Cinema.now }));
    ok(r.pauses === 0, '朗讀模式播放 26 秒：配樂沒有被暫停過', r); ok(r.seeks <= 2, '朗讀模式：只在跳轉時定位', r.seeks); ok(a2.t - a2.f > 1, '影片等朗讀，配樂繼續走（配樂比影片快）', { audio: +a2.t.toFixed(1), film: +a2.f.toFixed(1) });
    ok(!p.errs.length, '沒有 script 錯誤', p.errs);
    await p.context().close();
  }
};
(async () => {
  let server = null;
  if (!BASE) {
    const PORT = String(18000 + Math.floor(Math.random() * 2000)); BASE = 'http://127.0.0.1:' + PORT;
    server = spawn(process.execPath, [path.join(__dirname, 'server.mjs'), '--port', PORT], { env: Object.assign({}, process.env, { NYJN_STORE: 'memory', PORT }), stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((res, rej) => { server.stdout.once('data', res); server.once('exit', () => rej(new Error('伺服器沒有啟動'))); setTimeout(() => rej(new Error('伺服器啟動逾時')), 8000); });
  }
  try {
    const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    for (const k of Object.keys(T)) { if (only && !k.startsWith(only)) continue; console.log(k); try { await T[k](b); } catch (e) { fails++; console.log('  ✗ 例外：' + e.message.split('\n')[0]); } }
    await b.close();
    // 瀏覽器擋下自動播放：直接開 #film/c1，沒有手勢
    if (!only || 'J_blocked'.startsWith(only)) {
      console.log('J_blocked'); const b2 = await chromium.launch();
      const p = await open(b2, { hash: '/#film/c1' }); await sleep(4000);
      let s = await p.evaluate(() => ({ label: __A.Score.label(), playing: __A.Cinema.playing, film: +__A.Cinema.now.toFixed(1) }));
      const blocked = s.label === '點此播放配樂';
      ok(s.playing && (blocked || s.label === '配樂 開'), '沒有手勢就自動開始：影片照樣走' + (blocked ? '，配樂等使用者點一下' : '（這個瀏覽器沒有擋）'), s);
      if (blocked) { const f0 = s.film; await p.click('.film-row button:has-text("點此播放配樂")'); await sleep(3000); s = await p.evaluate(() => ({ label: __A.Score.label(), a: +__A.Score.audio.currentTime.toFixed(1), film: +__A.Cinema.now.toFixed(1), paused: __A.Score.audio.paused })); ok(!s.paused && Math.abs(s.a - s.film) < 0.3 && s.film > f0 + 2, '點了之後配樂接上', s); }
      await b2.close();
    }
  } finally { if (server) server.kill(); }
  console.log(fails ? `\n${fails} 項沒過（共 ${checks} 項）` : `\n全部通過：${checks} 項檢查`); process.exit(fails ? 1 : 0);
})();
