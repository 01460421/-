// Renders index.html to PDF with Chromium (Playwright).
// Usage: NODE_PATH=/opt/node22/lib/node_modules node build.js <out.pdf>
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const out = process.argv[2] || 'out.pdf';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, 'index.html'), { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  // Give late font subsets a moment to settle.
  await page.waitForTimeout(500);

  const footerFont = "font-family:'WenQuanYi Zen Hei','Noto Sans TC',sans-serif;";
  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      `<div style="${footerFont}font-size:7.5px;color:#7B8790;width:100%;padding:0 16mm;display:flex;justify-content:space-between;align-items:center;">` +
      `<span>116 學測醫學系簡章統整 ・ 彙整日期 2026-09-25 ・ 正式資訊以大考中心與甄選會簡章為準</span>` +
      `<span>第 <span class="pageNumber"></span> 頁 / 共 <span class="totalPages"></span> 頁</span>` +
      `</div>`,
  });
  await browser.close();
  console.log('wrote', out);
})().catch((e) => { console.error(e); process.exit(1); });
