// 介紹影片・第一步：從網站本身取材
//   stills  每個房間一張兩倍解析度的靜態畫面（之後在合成頁裡做鏡頭推移）
//   clips   需要「會動」的段落：用假的時鐘一格一格往前走，每格截一張，動作才會完全平順
// 用法：node cap.cjs stills | hero | story | film | all
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8899', OUT = path.join(__dirname, 'src');
const what = process.argv[2] || 'all';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HIDE = '.gd-fab,.gd-bar,.gd-intro{display:none!important}';
const mk = d => fs.mkdirSync(d, { recursive: true });

async function enter(page, hash) {
  await page.goto(BASE + '/' + (hash ? '#' + hash : ''));
  await page.waitForFunction(() => window.__A && window.__A.cur, null, { timeout: 15000 });
}
async function quiet(page) {   // 入館那三張卡按掉、導覽關掉
  if (await page.$('.gd-intro')) await page.keyboard.press('Escape');
  await page.evaluate(() => { const A = window.__A; try { const b = A.Case.d.x.gd; if (b) { b.on = false; b.intro = b.intro || Date.now(); } A.Case.save(); } catch (e) {} });
  await page.addStyleTag({ content: HIDE });
}

async function stills(browser) {
  mk(OUT + '/stills');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await enter(page, ''); await sleep(1200); await quiet(page); await sleep(4200);
  const shot = async (name, opt = {}) => { await page.evaluate(() => document.fonts.ready); await sleep(opt.wait || 900); await page.screenshot({ path: OUT + '/stills/' + name + '.jpg', type: 'jpeg', quality: 93, fullPage: !!opt.full }); console.log('still', name); };
  const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(700); await page.evaluate(() => scrollTo(0, 0)); };
  await shot('hall');
  await go('chronicle'); await shot('chronicle');
  await page.evaluate(() => { try { window.__A.setEra(4, true); if (window.__A.stormPaint) window.__A.stormPaint(); } catch (e) {} }); await shot('chronicle2');
  await go('chapters'); await shot('chapters', { full: true });
  await go('c0'); await shot('c0');
  await go('c7'); await shot('c7');
  await go('film'); await shot('film', { wait: 1500 });
  await go('choices'); await shot('choices');
  await go('rain'); await shot('rain');
  await go('studio'); await shot('studio');
  await go('index'); await shot('index');
  await go('case'); await shot('case');
  await go('play'); await sleep(400);
  try { await page.getByRole('button', { name: '領取到職禮' }).click({ timeout: 3000 }); await sleep(3800); } catch (e) { console.log('  gift:', e.message.split('\n')[0]); }
  await page.evaluate(() => scrollTo(0, 0)); await shot('play');
  await go('darkroom'); await shot('darkroom');
  try {
    const b = page.locator('#r-darkroom button').filter({ hasText: /十/ }).first(); await b.click({ timeout: 3000 }); await sleep(1200);
    await page.getByRole('button', { name: '全部顯影' }).click({ timeout: 3000 }); await sleep(1500);
    await page.evaluate(() => { const s = document.getElementById('dk-stage'); if (s) s.scrollIntoView({ block: 'start' }); scrollBy(0, -130); }); await shot('darkroom2', { wait: 1800 });
  } catch (e) { console.log('  pull:', e.message.split('\n')[0]); }
  await go('album'); await shot('album', { wait: 1500 });
  await go('arcade'); await shot('arcade');
  await go('quests'); await shot('quests');
  await go('story/c0'); await sleep(1200);
  for (let i = 0; i < 40 && !(await page.$('.sty-opt')); i++) { await page.keyboard.press('Space'); await sleep(260); }
  await sleep(1200); await shot('story', { wait: 1500 });
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'stills ok'); await ctx.close();
}

// 假時鐘：每截一格，網站的時間只往前走 16 毫秒（瀏覽器的假 rAF 正好 16 毫秒一拍）
async function clip(browser, name, hash, frames, prep, per) {
  const dir = OUT + '/clips/' + name; mk(dir);
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('  pageerror', e.message));
  await page.clock.install({ time: new Date('2026-11-12T20:00:00') });
  await page.route('**/*.mp4', r => r.abort());   // 放映廳的配樂不抓：音軌不受假時鐘控制
  await enter(page, ''); await page.clock.runFor(1500); await quiet(page); await page.clock.runFor(5000);
  if (hash) { await page.evaluate(x => { location.hash = x; }, hash); await page.clock.runFor(800); }
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' });
  if (prep) await prep(page);
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt(new Date('2026-11-12T20:05:00'));
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    if (per) await per(page, f);
    await page.clock.runFor([17, 17, 16][f % 3]);   // 三格共 50 毫秒，正好每秒六十格
    await page.evaluate(() => { try { window.__A.Plates.tick(performance.now(), true); } catch (e) {} });   // 底片平常每 33 毫秒才重畫一次，這裡每一格都畫
    await page.screenshot({ path: dir + '/' + String(f).padStart(4, '0') + '.jpg', type: 'jpeg', quality: 92 });
  }
  console.log('clip', name, frames, 'frames', ((Date.now() - t0) / 1000).toFixed(0) + 's'); await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  if (what === 'stills' || what === 'all') await stills(browser);
  if (what === 'hero' || what === 'all') await clip(browser, 'hero', '', 1140, async page => {
    await page.addStyleTag({ content: '.tick,.bar,.hero2-in{display:none!important}.hero2{height:100vh!important;min-height:100vh!important;max-height:none!important}.hero2 canvas{width:100%!important;height:100%!important}' });
    await page.evaluate(() => { scrollTo(0, 0); window.dispatchEvent(new Event('resize')); }); await page.clock.runFor(600);
  });
  if (what === 'film' || what === 'all') await clip(browser, 'film', 'film', 420, async page => {
    await page.addStyleTag({ content: '.tick,.bar{display:none!important}' });
    try { await page.getByRole('button', { name: /開始放映/ }).click({ timeout: 3000 }); } catch (e) { console.log('  film start:', e.message.split('\n')[0]); }
    await page.clock.runFor(4200);
    await page.evaluate(() => { const s = document.querySelector('#r-film .plate, #r-film canvas'); if (s) s.scrollIntoView({ block: 'center' }); });
  });
  if (what === 'story' || what === 'all') await clip(browser, 'story', 'story/c0', 540, async page => { await page.clock.runFor(1200); },
    async (page, f) => { if (f === 150 || f === 330) await page.keyboard.press('Space'); });
  await browser.close();
})();
