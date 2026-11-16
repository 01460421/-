// 把 finish.py 調好的檔再打開一次，排成 1920×1080 的橫畫面：圖在左，右邊一欄是最近畫上去的方程式（LaTeX）。存成最後的 .ggb。
// 直的圖照高度放；橫的圖佔畫面寬度的 55%，右欄的字跟著縮小。
// 用法：node post.cjs <stage.ggb> <final.ggb> --w <圖寬，GeoGebra 單位> --h <圖高>
const fs = require('fs');
const { chromium } = require('playwright');
const [, , src, out, ...rest] = process.argv;
const arg = (k, d) => (rest.includes(k) ? Number(rest[rest.indexOf(k) + 1]) : d);
const W = arg('--w', 16.49), H = arg('--h', 24);
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><script src="https://www.geogebra.org/apps/deployggb.js"></script><style>html,body{margin:0;background:#fff}</style></head><body><div id="ggb"></div></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(PAGE, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(b64 => { window.__r = false; new window.GGBApplet({ appName: 'classic', width: 1920, height: 1080, showToolBar: false, showAlgebraInput: false, showMenuBar: false, enableRightClick: false, showResetIcon: false, perspective: 'G', ggbBase64: b64, appletOnLoad: api => { window.api = api; window.__r = true; } }, true).inject('ggb'); }, fs.readFileSync(src).toString('base64'));
  await page.waitForFunction(() => window.__r, null, { timeout: 600000 });
  // 版面：每單位幾個像素
  const landscape = W > H;
  const k = Math.min((1920 * (landscape ? 0.55 : 0.58)) / W, 1000 / H);
  const left = 50, gap = 60;
  const xmin = -left / k, ymin = -(1080 - H * k) / 2 / k;
  const panel = 1920 - (left + W * k + gap) - 30;
  const size = Math.max(0.55, Math.min(0.9, (panel / 1100) * 0.9));
  const r = await page.evaluate(([xmin, ymin, k, W, gap, size]) => {
    const api = window.api;
    api.setCoordSystem(xmin, xmin + 1920 / k, ymin, ymin + 1080 / k);
    // 自由的文字物件（不是用 Text 指令產生的），程式才能用 setTextValue 改它的內容
    api.evalCommand('info = " "');
    api.evalCommand(`SetCoords(info, ${W + gap / k}, ${ymin + (1080 - 36) / k})`);
    api.setColor('info', 40, 34, 30);
    api.setFixed('info', true, false);
    api.setLabelVisible('info', false);
    api.setLayer('info', 4);
    api.evalXML(`<element type="text" label="info"><font serif="false" sizeM="${size}" style="0"/><isLaTeX val="true"/></element>`);
    api.setTextValue('info', '\\begin{array}{l}y = 0.5x + 3,\\quad 1 \\le x \\le 2 \\\\ x = 11.43 + 0.122 \\cos\\theta,\\quad y = 23.4 + 0.122 \\sin\\theta \\end{array}');
    const test = { latex: /isLaTeX val="true"/.test(api.getXML('info')), independent: api.isIndependent('info') };
    return test;
  }, [xmin, ymin, k, W, gap, size]);
  console.log('版面：每單位', k.toFixed(1), '像素，右欄寬', Math.round(panel), '像素，字級', size.toFixed(2), '；', JSON.stringify(r));
  await page.waitForTimeout(800);
  await page.screenshot({ path: out.replace('.ggb', '-layout.png') });
  await page.evaluate(() => window.api.setTextValue('info', ' '));
  fs.writeFileSync(out, Buffer.from(await page.evaluate(() => window.api.getBase64()), 'base64'));
  console.log('存檔', out, (fs.statSync(out).size / 1048576).toFixed(2), 'MB');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
