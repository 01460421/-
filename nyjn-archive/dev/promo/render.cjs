// 介紹影片・第二步：把合成頁一格一格截下來
//   node render.cjs preview 3 10.5 14 ...   指定幾個時間點，各截一張到 preview/
//   node render.cjs range <from> <to>       截第 from 到 to-1 格到 frames/
//   node render.cjs info                    印出全片長度與各段起點
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [mode, ...rest] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--force-color-profile=srgb'] });
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
  p.on('pageerror', e => console.log('pageerror', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
  await p.goto('file://' + path.join(__dirname, 'film.html'));
  const info = await p.evaluate(() => window.ready);
  if (mode === 'info') { console.log(JSON.stringify(info)); }
  else if (mode === 'preview') {
    fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
    for (const s of rest) { const T = parseFloat(s); await p.evaluate(t => window.render(t), T); await p.screenshot({ path: path.join(__dirname, 'preview', 'p' + s.replace('.', '_') + '.jpg'), type: 'jpeg', quality: 90 }); }
    console.log('preview', rest.length, 'total', info.total);
  } else if (mode === 'range') {
    const a = +rest[0], z = Math.min(+rest[1], info.frames), dir = path.join(__dirname, 'frames'); fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    for (let f = a; f < z; f++) { await p.evaluate(t => window.render(t), f / 60); await p.screenshot({ path: path.join(dir, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 96 }); }
    console.log('range', a, z, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  await b.close();
})();
