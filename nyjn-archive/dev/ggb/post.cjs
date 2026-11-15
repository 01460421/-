// 把 finish.py 調好的檔再打開一次，排成橫的畫面（圖在左，右邊放標題、計數和正在畫的方程式），存成最後的 .ggb。
// 用法：node post.cjs <stage.ggb> <final.ggb> --title 十四行詩
const fs = require('fs');
const { chromium } = require('playwright');
const [, , src, out, , title] = process.argv;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><script src="https://www.geogebra.org/apps/deployggb.js"></script><style>html,body{margin:0;background:#fff}</style></head><body><div id="ggb"></div></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(PAGE, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(b64 => { window.__r = false; new window.GGBApplet({ appName: 'classic', width: 1920, height: 1080, showToolBar: false, showAlgebraInput: false, showMenuBar: false, enableRightClick: false, showResetIcon: false, perspective: 'G', ggbBase64: b64, appletOnLoad: api => { window.api = api; window.__r = true; } }, true).inject('ggb'); }, fs.readFileSync(src).toString('base64'));
  await page.waitForFunction(() => window.__r, null, { timeout: 600000 });
  const r = await page.evaluate(t => {
    const api = window.api, out = {};
    const H = 24, ymin = -1.2, ymax = H + 0.6, span = ymax - ymin, xmin = -2.2, xmax = xmin + span * 1920 / 1080;
    api.setCoordSystem(xmin, xmax, ymin, ymax);
    // 只放圖和方程式：右邊一欄，最近畫上去的方程式
    api.evalCommand(`info = Text("", (18.2, ${H - 0.2}))`);
    const style = { info: [52, 46, 40, 0.86] };
    for (const [n, [r, g, b, size]] of Object.entries(style)) {
      api.setColor(n, r, g, b);
      api.setFixed(n, true, false);
      api.setLabelVisible(n, false);
      api.setLayer(n, 4);
      try { api.evalXML(`<element type="text" label="${n}"><font serif="${n === 'title'}" sizeM="${size}" style="0"/></element>`); out[n] = 'ok'; } catch (e) { out[n] = String(e).slice(0, 80); }
    }
    return out;
  }, title);
  console.log('字型大小', JSON.stringify(r));
  await page.waitForTimeout(800);
  fs.writeFileSync(out, Buffer.from(await page.evaluate(() => window.api.getBase64()), 'base64'));
  await page.screenshot({ path: out.replace('.ggb', '-layout.png') });
  console.log('存檔', out, (fs.statSync(out).size / 1048576).toFixed(2), 'MB');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
