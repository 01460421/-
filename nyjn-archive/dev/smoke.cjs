/* 前端冒煙測試：自己開一個本機伺服器（記憶體儲存），把每個房間走一遍，
   再用兩位訪客試一次接龍與共鳴。任何 script 錯誤或違反內容安全政策都算失敗。

   需要 Playwright（不是這個專案的相依套件）：
     npm i -D playwright && npx playwright install chromium
     node dev/smoke.cjs
*/
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = String(18000 + Math.floor(Math.random() * 2000));
const BASE = 'http://127.0.0.1:' + PORT;
const ROOMS = ['hall', 'chronicle', 'chapters', 'c0', 'c7/3', 'c13', 'film', 'choices', 'rain', 'relay', 'studio', 'studio/wall', 'quiz', 'index', 'index/手提箱', 'questions', 'case', 'about',
  'play', 'quests', 'darkroom', 'album', 'arcade', 'arcade/order', 'arcade/match', 'arcade/catch', 'arcade/code', 'shop', 'profile', 'journal', 'guide'];

async function main() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('找不到 Playwright。先執行：npm i -D playwright && npx playwright install chromium'); process.exit(2); }

  const server = spawn(process.execPath, [path.join(__dirname, 'server.mjs'), '--port', PORT], {
    env: Object.assign({}, process.env, { NYJN_STORE: 'memory', ADMIN_KEY: 'smoke-admin', PORT }), stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((res, rej) => { server.stdout.once('data', res); server.once('exit', () => rej(new Error('伺服器沒有啟動'))); setTimeout(() => rej(new Error('伺服器啟動逾時')), 8000); });

  const browser = await chromium.launch();
  const problems = [];
  let checks = 0;
  const ok = (cond, what) => { checks++; if (!cond) problems.push('✗ ' + what); };
  const visitor = async (tag, opts) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opts));
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(tag + ' script 錯誤：' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/status of (4\d\d)/.test(m.text())) problems.push(tag + ' console：' + m.text()); });
    return page;
  };

  try {
    /* 一、每個房間都打得開，手機寬度下不會橫向溢出 */
    for (const [tag, opts] of [['桌機', {}], ['手機', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
      const p = await visitor(tag, opts);
      for (const r of ROOMS) {
        await p.goto(BASE + '/#' + r); await p.waitForTimeout(450);
        const s = await p.evaluate(() => ({ cur: window.__A && window.__A.cur, shown: [...document.querySelectorAll('.room')].filter(x => !x.hidden).length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
        ok(s.shown === 1, tag + ' #' + r + ' 應該只顯示一個房間（實際 ' + s.shown + '）');
        ok(s.over <= 1, tag + ' #' + r + ' 橫向溢出 ' + s.over + 'px');
      }
      await p.context().close();
    }

    /* 二、放映廳會前進；考核走得完 */
    const p = await visitor('甲');
    await p.goto(BASE + '/#film/c1'); await p.waitForTimeout(1500);
    ok(await p.evaluate(() => window.__A.Cinema.playing), '放映廳帶章節進來時應該自動開始');
    ok(Math.abs(await p.evaluate(() => window.__A.Cinema.total) - 1645.5) < 0.1, '放映廳的時間軸應該和原版紀錄片一樣長（1645.5 秒），配樂才對得上');
    await p.waitForTimeout(2500);
    const sc = await p.evaluate(() => { const S = window.__A.Score, a = S.audio, t = document.querySelector('.film-row .time').textContent.split(' ')[0].split(':'); return { failed: S.failed, label: S.label(), on: !!a && !a.paused, drift: a ? Math.abs(a.currentTime - (+t[0] * 60 + +t[1])) : 99 }; });
    ok(sc.failed || sc.label === '點此播放配樂' || (sc.on && sc.drift < 1.6), '配樂應該跟著影片的時間在播，或已經退回環境音（' + JSON.stringify(sc) + '）');
    await p.keyboard.press(' '); await p.waitForTimeout(200);
    ok(!(await p.evaluate(() => window.__A.Cinema.playing)), '空白鍵應該暫停');
    await p.goto(BASE + '/#quiz'); await p.waitForTimeout(500); await p.click('#quiz-box .btn.pri');
    for (let i = 0; i < 10; i++) { await p.waitForTimeout(120); await p.keyboard.press('1'); await p.waitForTimeout(120); await p.keyboard.press('Enter'); }
    await p.waitForTimeout(300);
    ok(!!(await p.$('.quiz-score')), '考核十題答完應該出現成績');

    /* 三、搜尋 */
    await p.goto(BASE + '/#hall'); await p.waitForTimeout(400); await p.keyboard.press('/'); await p.waitForTimeout(200);
    await p.keyboard.type('琥珀屋'); await p.waitForTimeout(250);
    ok((await p.$$('.find-list li')).length > 0, '搜尋「琥珀屋」應該有結果');
    await p.keyboard.press('Escape');

    /* 四、兩位訪客共用後端：接龍、共鳴、重複送出、投票 */
    ok(await p.evaluate(() => window.__A.Board.mode) === 'api', '應該接上本機後端');
    await p.goto(BASE + '/#relay'); await p.waitForTimeout(500);
    await p.fill('#relay-x', '冒煙測試：鐘敲了第二下。'); await p.click('#relay-form button[type=submit]'); await p.waitForTimeout(700);
    ok((await p.$$('#chain li')).length === 2, '甲接了一段之後應該有兩段');
    const q = await visitor('乙');
    await q.goto(BASE + '/#relay'); await q.waitForTimeout(1200);
    ok((await q.$$('#chain li')).length === 2, '乙應該看得到甲的那一段');
    await q.click('#chain li:nth-child(2) .rx button'); await q.waitForTimeout(600);
    ok(await q.evaluate(() => document.querySelector('#chain li:nth-child(2) .rx button').textContent.endsWith('1')), '乙按下共鳴後計數應該是 1');
    await p.fill('#relay-x', '冒煙測試：鐘敲了第二下。'); await p.click('#relay-form button[type=submit]'); await p.waitForTimeout(600);
    ok((await p.inputValue('#relay-x')).length > 0, '重複的內容應該被擋下，並留在輸入框裡');
    await q.goto(BASE + '/#choices'); await q.waitForTimeout(400); await q.click('.opts .opt'); await q.waitForTimeout(2600);
    ok(!!(await q.$('.split-bar')), '投票送出後應該顯示同好的比例');

    /* 五、遊戲層：到職禮、簽到、沖洗、底片冊、小遊戲開得起來、主題色，重新整理後都還在 */
    const g = await visitor('丙');
    const G = () => g.evaluate(() => ({ w: window.__A.Game.wallet(), album: window.__A.Dark.count(), accent: document.documentElement.dataset.accent || '', dots: window.__A.Game.dots() }));
    await g.goto(BASE + '/#play'); await g.waitForTimeout(600);
    ok((await g.$$('.g-tile')).length === 6, '值勤台應該有六個入口');
    await g.click('.g-gift .btn'); await g.waitForTimeout(300);
    ok((await G()).w.dev === 1200, '到職禮應該給 1200 顯影劑');
    await g.goto(BASE + '/#quests'); await g.waitForTimeout(400); await g.click('.q-sign .btn.pri'); await g.waitForTimeout(300);
    ok((await G()).w.dev === 1300, '簽到第一天應該給 100 顯影劑');
    ok((await g.$$('.q-list .q-row')).length >= 28, '委託應該列出每日、每週和長期');
    await g.goto(BASE + '/#darkroom'); await g.waitForTimeout(500); await g.click('.dk-act .btn:not(.pri)'); await g.waitForTimeout(300); await g.click('.dk-stage .btn.sm').catch(() => {}); await g.waitForTimeout(500);
    const after = await G();
    ok((await g.$$('.dk-card.on')).length === 10, '沖洗十張應該顯影十張');
    ok(after.w.dev === 220 && after.album >= 1 && after.album <= 10, '沖洗十張之後：顯影劑 220，底片冊有進帳（' + JSON.stringify(after) + '）');
    await g.goto(BASE + '/#album'); await g.waitForTimeout(600);
    ok((await g.$$('.al-cell')).length === 78 && (await g.$$('.al-cell:not(.miss)')).length === after.album, '底片冊應該有 78 格，持有的格數和紀錄一致');
    await g.click('.al-cell:not(.miss)'); await g.waitForTimeout(400);
    ok(!!(await g.$('.al-detail')), '點底片應該打開它的來歷'); await g.keyboard.press('Escape');
    for (const id of ['order', 'match', 'catch', 'code']) {
      await g.goto(BASE + '/#arcade/' + id); await g.waitForTimeout(400);
      const start = await g.$('.arc-intro .btn.pri'); ok(!!start, '遊藝室應該有「' + id + '」這個遊戲');
      if (start) { await start.click(); await g.waitForTimeout(700); ok(await g.evaluate(() => { const st = document.querySelector('.arc-stage'); return !!st && st.children.length > 0 && window.__A.Arcade.playing(); }), '「' + id + '」應該開得起來'); }
    }
    await g.goto(BASE + '/#shop'); await g.waitForTimeout(300);
    ok(!(await g.evaluate(() => window.__A.Arcade.playing())), '離開遊藝室之後遊戲應該停下來');
    await g.evaluate(() => window.__A.Game.give({ shard: 200 }, '', true)); await g.goto(BASE + '/#play'); await g.goto(BASE + '/#shop'); await g.waitForTimeout(300);
    await g.click('.sp-item:nth-child(2) .btn'); await g.waitForTimeout(300);
    ok((await G()).accent === 'amber', '換到主題色之後應該立刻換上');
    await g.goto(BASE + '/#profile'); await g.waitForTimeout(500);
    ok((await g.$$('.pf-stats > div')).length === 12, '檔案應該列出十二項紀錄');
    await g.waitForTimeout(700); await g.reload(); await g.waitForTimeout(900);
    const kept = await G();
    ok(kept.w.dev === 220 && kept.album === after.album && kept.accent === 'amber', '重新整理之後，資源、底片冊和主題色都應該還在（' + JSON.stringify(kept) + '）');

    /* 六、劇情互動：親歷走到抉擇、鍵盤確認、揭曉；抉擇頁的結果；我的紀年 */
    const t = await visitor('丁');
    const step = async () => { await t.keyboard.press('Space'); await t.waitForTimeout(50); await t.keyboard.press('Space'); await t.waitForTimeout(110); };
    await t.goto(BASE + '/#c0'); await t.waitForTimeout(900);
    ok(!!(await t.$('.sty-enter a')), '展間應該有親歷的入口');
    await t.goto(BASE + '/#story/c0'); await t.waitForTimeout(900);
    ok(await t.evaluate(() => window.__A.cur === 'story' && document.querySelectorAll('.sty-lines p').length === 1), '親歷應該從第一句旁白開始');
    for (let i = 0; i < 60 && !(await t.$('.sty-opt')); i++) await step();
    ok((await t.$$('.sty-opt')).length === 2, '走到落著抉擇的那張底片，應該停下來等人選');
    await t.waitForTimeout(550); await t.keyboard.press('Space'); await t.keyboard.press('Space'); await t.waitForTimeout(120);
    ok(!(await t.evaluate(() => window.__A.Case.d.choices.s1)), '連按空白鍵不應該替人做選擇');
    await t.keyboard.press('1'); await t.waitForTimeout(120); await t.keyboard.press('Enter'); await t.waitForTimeout(300);
    ok(await t.evaluate(() => window.__A.Case.d.choices.s1 === 'a' && !!document.querySelector('.sty-reveal')), '按 1 再按 Enter：記下選擇並揭曉');
    await t.click('.sty-act .btn'); await t.waitForTimeout(300);
    for (let i = 0; i < 40 && !(await t.$('.sty-sum')); i++) await step();
    ok(!!(await t.$('.sty-sum')) && await t.evaluate(() => window.__A.Story.done() === 1), '走完一章應該出現結尾，並記下親歷過');
    await t.keyboard.press('Escape'); await t.waitForTimeout(500);
    ok(await t.evaluate(() => window.__A.cur === 'c0' && !document.documentElement.classList.contains('sty-on')), '離開親歷應該回到展間');
    await t.evaluate(() => { SC.forEach((x, i) => { if (!window.__A.Case.d.choices[x.id]) window.__A.Case.d.choices[x.id] = i % 2 ? 'a' : 'b'; }); window.__A.Case.save(); });
    await t.goto(BASE + '/#choices'); await t.waitForTimeout(700);
    ok(await t.evaluate(() => document.querySelectorAll('.fa-path li').length === 8 && document.querySelectorAll('.fa-path li.diff').length === 7 - window.__A.Fate.sameN()), '抉擇選完應該畫出你和她的路，岔開的步數和紀錄一致');
    await t.goto(BASE + '/#journal'); await t.waitForTimeout(500);
    ok((await t.$$('.jr-ch')).length === 14 && (await t.$$('.jr-pick')).length === 8, '我的紀年應該有十四章和八個抉擇');

    /* 七、導覽：全新的訪客從大廳進來會演入館；選了帶路，導覽條跟著走；拿連結直接進房間的不演 */
    const n = await visitor('戊');
    await n.goto(BASE + '/'); await n.waitForTimeout(1200);
    ok(!!(await n.$('.gd-intro')), '全新的訪客從大廳進來，應該看到入館');
    await n.click('.gd-card .btn.pri'); await n.waitForTimeout(300); await n.click('.gd-card .btn:not(.pri)'); await n.waitForTimeout(300); await n.click('.gd-card .btn.pri'); await n.waitForTimeout(500);
    ok(!(await n.$('.gd-intro')) && await n.evaluate(() => { const b = document.querySelector('.gd-bar'); return !b.hidden && b.textContent.includes('第 1 站') && !document.documentElement.classList.contains('gd-intro-on'); }), '選了帶路：入館收掉，導覽條停在第一站');
    ok(!!(await n.$('.gd-hall')), '大廳應該多一塊「下一站」');
    await n.evaluate(() => { window.__A.Case.d.read.c0 = Date.now(); window.__A.Case.save(); }); await n.waitForTimeout(900);
    ok(await n.evaluate(() => window.__A.Guide.at() === 2), '手提箱裡有了序幕的戳記：前兩站自己記上，輪到第三站');
    await n.goto(BASE + '/#guide'); await n.waitForTimeout(500);
    ok(await n.evaluate(() => document.querySelectorAll('.gd-route li').length === 8 && document.querySelectorAll('.gd-zone li').length === 20 && document.querySelector('.gd-bar').hidden), '導覽頁：八站、平面圖二十個房間；這一頁不重複顯示導覽條');
    const dl = await visitor('己');
    await dl.goto(BASE + '/#c3/2'); await dl.waitForTimeout(900);
    ok(!(await dl.$('.gd-intro')) && await dl.evaluate(() => document.querySelector('.gd-bar').hidden && !document.querySelector('.gd-fab').hidden), '拿著連結直接進展間：不演入館，導覽收在角落');

    /* 八、字型：逆雨載入了；關於本館和頁尾都連到原創字體頁 */
    await p.goto(BASE + '/'); await p.waitForTimeout(600);
    ok(await p.evaluate(() => document.fonts.ready.then(() => document.fonts.check('40px NiYu', '逆雨檔案館'))), '逆雨字型應該載入');
    ok(await p.evaluate(() => [...document.querySelectorAll('a[href="https://01460421.github.io/niyu/"]')].filter(a => a.target === '_blank' && /noopener/.test(a.rel)).length === 2 && typeof FONT_PAGE === 'string'), '關於本館和頁尾都應該連到原創字體頁（另開分頁）');

    /* 八之二、館刊：關於本館和頁尾都連到 book/；那一頁打得開，五個下載檔都在，而且沒有用到 script */
    ok(await p.evaluate(() => document.querySelector('#book-page') && document.querySelectorAll('a[href="book/"]').length === 2 && BOOK_PAGE === 'book/'), '關於本館和頁尾都應該連到館刊的下載頁');
    await p.goto(BASE + '/book/'); await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.querySelector('h1').textContent === '量雨的人' && document.scripts.length === 0 && document.querySelector('.cover img').naturalWidth > 0), '館刊的下載頁應該打得開，有書衣的圖，沒有 script');
    const bookFiles = await p.evaluate(() => Promise.all([...document.querySelectorAll('.dl a')].map(a => fetch(a.href, { method: 'HEAD' }).then(r => [a.id, r.status, a.getAttribute('download')]))));
    ok(bookFiles.length === 5 && bookFiles.every(f => f[1] === 200 && /^量雨的人/.test(f[2])), '五個下載檔都應該在，存檔的名字是中文書名：' + JSON.stringify(bookFiles));
    await p.goto(BASE + '/'); await p.waitForTimeout(400);

    /* 九、館內配樂：預設關；打開之後跟著房間換段；同一段不重頭；放映廳讓位；回到原來那段時接著播 */
    const mu = await visitor('庚');
    await mu.goto(BASE + '/#chronicle'); await mu.waitForTimeout(900);
    ok(await mu.evaluate(() => { const s = window.__A.Music.state(); return !s.on && !s.playing.length && document.getElementById('b-mus').getAttribute('aria-pressed') === 'false'; }), '館內配樂預設應該是關的');
    await mu.click('#b-mus'); await mu.waitForTimeout(2600);
    ok(await mu.evaluate(() => { const s = window.__A.Music.state(); return s.on && s.id === 'chronicle' && s.playing.join() === 'chronicle' && s.at > .5 && document.getElementById('b-mus').getAttribute('aria-pressed') === 'true'; }), '在暴雨年表打開配樂，應該播〈年表〉那一段', await mu.evaluate(() => window.__A.Music.state()));
    await mu.evaluate(() => { location.hash = 'darkroom'; }); await mu.waitForTimeout(2800);
    const d1 = await mu.evaluate(() => window.__A.Music.state());
    ok(d1.id === 'darkroom' && d1.playing.join() === 'darkroom', '走到暗房，應該換成〈暗房〉，上一段淡出後停下', d1);
    await mu.evaluate(() => { location.hash = 'album'; }); await mu.waitForTimeout(1200);
    const d2 = await mu.evaluate(() => window.__A.Music.state());
    ok(d2.id === 'darkroom' && d2.at > d1.at, '暗房走到底片冊是同一段，不應該重頭播', [d1.at, d2.at]);
    await mu.evaluate(() => { location.hash = 'film'; }); await mu.waitForTimeout(2400);
    ok(await mu.evaluate(() => { const s = window.__A.Music.state(); return s.on && !s.id && !s.playing.length; }), '進放映廳，館內配樂應該讓位');
    await mu.evaluate(() => { location.hash = 'chronicle'; }); await mu.waitForTimeout(1500);
    ok(await mu.evaluate(() => { const s = window.__A.Music.state(); return s.id === 'chronicle' && s.at > 2; }), '回到暴雨年表，應該從剛才停下的地方接著播');
    await mu.keyboard.press('p'); await mu.waitForTimeout(2200);
    ok(await mu.evaluate(() => { const s = window.__A.Music.state(); return !s.on && !s.playing.length; }), '按 P 應該關掉配樂');

    /* 十、標頭 */
    const res = await p.request.get(BASE + '/');
    ok(/script-src 'self'/.test(res.headers()['content-security-policy'] || ''), '首頁應該帶內容安全政策');
    const health = await (await p.request.get(BASE + '/api/health')).json();
    ok(health.ok && health.api === 2, '/api/health 應該回 ok');
  } finally {
    await browser.close(); server.kill();
  }

  if (problems.length) { console.error(problems.join('\n')); console.error('\n' + problems.length + ' 個問題（共 ' + checks + ' 項檢查）'); process.exit(1); }
  console.log('全部通過：' + checks + ' 項檢查');
}
main().catch(e => { console.error(e); process.exit(1); });
