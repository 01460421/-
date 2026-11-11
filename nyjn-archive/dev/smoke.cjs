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
const ROOMS = ['hall', 'chronicle', 'chapters', 'c0', 'c7/3', 'c13', 'film', 'choices', 'rain', 'relay', 'studio', 'studio/wall', 'quiz', 'index', 'index/手提箱', 'questions', 'case', 'about'];

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

    /* 五、標頭 */
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
