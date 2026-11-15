// 在 GeoGebra 裡錄製：打開最後的 .ggb，滑桿一步一步往前推，每一步截一張 GeoGebra 的畫面，再接成影片。
// 這個測試環境的 GeoGebra 不執行檔案裡的程式，所以把檔案裡那段程式原封不動放到頁面上，每推一步就呼叫一次它的 drawTo()；
// 跑的是和檔案裡同一段碼，畫面全部是 GeoGebra 自己畫的。
// 用法：node record.cjs <final.ggb> <截圖資料夾>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const [, , file, dir] = process.argv;
fs.mkdirSync(dir, { recursive: true });
const js = execFileSync('unzip', ['-p', file, 'geogebra_javascript.js']).toString('utf8');
const SMAX = Number(js.match(/SMAX = (\d+)/)[1]);
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><script src="https://www.geogebra.org/apps/deployggb.js"></script><style>html,body{margin:0;background:#fff;overflow:hidden}</style></head><body><div id="ggb"></div></body></html>`;
const frame = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(PAGE, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(b64 => { new window.GGBApplet({ appName: 'classic', width: 1920, height: 1080, showToolBar: false, showAlgebraInput: false, showMenuBar: false, enableRightClick: false, showResetIcon: false, perspective: 'G', ggbBase64: b64 }, true).inject('ggb'); }, fs.readFileSync(file).toString('base64'));
  await page.waitForFunction(() => window.ggbApplet && window.ggbApplet.getObjectNumber && window.ggbApplet.getObjectNumber() > 1000, null, { timeout: 600000, polling: 500 });
  await page.waitForTimeout(1000);
  // 檔案載入之後才放上那段程式（先放的話，載入檔案時會被清掉）
  await page.addScriptTag({ content: js + '\nwindow.drawTo = drawTo;' });
  await page.evaluate(() => { const a = window.ggbApplet; a.stopAnimation(); a.setVisible('s', false); a.setValue('s', 0); window.drawTo(); });
  await frame(page);
  const t0 = Date.now();
  for (let v = 0; v <= SMAX; v++) {
    await page.evaluate(x => { window.ggbApplet.setValue('s', x); window.drawTo(); }, v);
    await frame(page);
    await page.screenshot({ path: path.join(dir, `s${String(v).padStart(3, '0')}.png`), timeout: 300000 });
    if (v % 20 === 0) {
      const n = await page.evaluate(() => window.shown !== undefined ? window.shown : -1);
      console.log(`第 ${v} / ${SMAX} 步，${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
    }
  }
  const check = await page.evaluate(() => { const a = window.ggbApplet; let k = 0; for (const n of a.getAllObjectNames()) if (/^[cp]_/.test(n) && a.getVisible(n)) k++; return k; });
  console.log('錄完，最後顯示中的方程式與色塊', check, '個');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
