// 打開最後的 .ggb，檢查：物件數、各種形式的條數、動畫有沒有自己開始播、播的速度；
// 再停下來，把滑桿放到幾個位置，各截一張圖。
// 用法：node verify.cjs <final.ggb> <截圖的資料夾> [第幾步,第幾步,…]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [, , file, dir, stepsArg] = process.argv;
const steps = (stepsArg || '40,150,200,250,312').split(',').map(Number);
// --browser-js：這個測試環境的 GeoGebra 不執行檔案裡的程式，所以把檔案裡那段程式原封不動放到頁面上，
// 讓 GeoGebra 用頁面的 ggbOnInit 呼叫它；這和檔案的程式被執行時跑的是同一段碼。
const browserJS = process.argv.includes('--browser-js');
const fileJS = browserJS ? require('child_process').execFileSync('unzip', ['-p', file, 'geogebra_javascript.js'], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8') : '';
fs.mkdirSync(dir, { recursive: true });
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><script src="https://www.geogebra.org/apps/deployggb.js"></script>
<style>html,body{margin:0;background:#fff}</style></head><body><div id="ggb"></div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1040, height: 1560 } });
  page.on('pageerror', e => console.log('頁面錯誤', e.message));
  page.on('console', m => { const t = m.text(); if (!/cookie|deprecated|Download the|Ad-?block/i.test(t)) console.log('console:', t.slice(0, 220)); });
  await page.setContent(PAGE, { waitUntil: 'load', timeout: 120000 });
  if (browserJS) await page.addScriptTag({ content: fileJS + '\nwindow.ggbOnInit = ggbOnInit; window.drawTo = drawTo;' });
  const t0 = Date.now();
  await page.evaluate(b64 => {
    window.__ready = false;
    new window.GGBApplet({ appName: 'classic', width: 1000, height: 1520, showToolBar: false, showAlgebraInput: false, showMenuBar: false, enableRightClick: false, showResetIcon: false, perspective: 'G', ggbBase64: b64[0], useBrowserForJS: b64[1] }, true).inject('ggb');
  }, [fs.readFileSync(file).toString('base64'), browserJS]);
  // 不掛自己的 appletOnLoad，讓 GeoGebra 照平常的方式執行檔案裡的 ggbOnInit
  await page.waitForFunction(() => window.ggbApplet && window.ggbApplet.getObjectNumber && window.ggbApplet.getObjectNumber() > 1000, null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => { window.api = window.ggbApplet; });
  await page.waitForTimeout(1500);
  console.log('打開', ((Date.now() - t0) / 1000).toFixed(1), '秒');
  const info = await page.evaluate(() => {
    const api = window.api, names = api.getAllObjectNames(), types = {};
    for (const n of names) { const t = api.getObjectType(n); types[t] = (types[t] || 0) + 1; }
    return { n: names.length, types, running: api.isAnimationRunning(), s: api.getValue('s'), sample: ['c_{1}', 'c_{2}', 'p_{1}'].map(n => api.getValueString(n).slice(0, 110)) };
  });
  console.log('物件', info.n, '：', JSON.stringify(info.types));
  console.log('動畫在播', info.running, '，s =', info.s);
  info.sample.forEach(x => console.log('  ', x));
  // 播的速度：量八秒
  const a = await page.evaluate(() => [performance.now(), window.api.getValue('s')]);
  await page.waitForTimeout(8000);
  const b = await page.evaluate(() => [performance.now(), window.api.getValue('s')]);
  const rate = (b[1] - a[1]) / ((b[0] - a[0]) / 1000);
  console.log('播放速度', rate.toFixed(2), '步／秒（無頭瀏覽器、軟體繪圖）');
  await page.screenshot({ path: path.join(dir, 'playing.png') });
  await page.evaluate(() => window.api.stopAnimation());
  for (const s of steps) {
    const ms = await page.evaluate(v => { const t = performance.now(); window.api.setValue('s', v); return performance.now() - t; }, s);
    await page.waitForTimeout(1200);
    await page.locator('#ggb').screenshot({ path: path.join(dir, `s-${String(s).padStart(3, '0')}.png`) });
    await page.waitForTimeout(300);
    const shown = await page.evaluate(v => { const api = window.api; let k = 0; for (const n of api.getAllObjectNames()) if (n !== 's' && api.getVisible(n)) k++; return k; }, s);
    console.log(`s = ${s}：顯示中的物件 ${shown}，設定花了 ${ms.toFixed(0)} 毫秒`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
