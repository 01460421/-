// 把 fit.py 的結果交給 GeoGebra：由 GeoGebra 自己一條一條建出方程式與上色的多邊形，存成 .ggb。
// 每個物件都掛一個「顯示條件」s ≥ 第幾步，s 是一條會自己往前走的滑桿，打開檔案就照順序畫出來：
//   一、墨線與外輪廓，由上往下，一筆接一筆
//   二、色界與紋理的細線
//   三、上色：色塊由大到小鋪上去（在線的底下）
// 另外輸出一份純文字的方程式清單。
//
// 用法：node build.cjs <fit.py 的 json> <輸出 .ggb> [--title 名字]
// 存出來的檔還要經過 finish.py（把滑桿設成「只往前播一次、打開就播」），再用 verify.cjs 檢查。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [, , src, out, ...rest] = process.argv;
const title = rest.includes('--title') ? rest[rest.indexOf('--title') + 1] : path.basename(out, '.ggb');
const data = JSON.parse(fs.readFileSync(src, 'utf8'));
const { width: W, height: H, unit_px: U } = data.stats;
const PH = { A0: 1, A1: 150, B0: 151, B1: 200, C0: 201, C1: 300 }, SMAX = 312;
const THICK = { out: 4, ink3: 3, ink2: 2, ink1: 1, tone: 1, tex: 1 };
const LAYER = { out: '外輪廓', ink: '墨線', tone: '色界', tex: '紋理' };
const FORM = { line: '直線', arc: '圓弧', parabola: '拋物線 y=f(x)', parabola_y: '拋物線 x=g(y)', cubic: '三次函數 y=f(x)', cubic_y: '三次函數 x=g(y)', circle: '圓', ellipse: '橢圓', polar: '極座標傅立葉', bezier: '三次參數曲線' };

// 排順序：墨線一組一組（同一條鏈的幾段連著畫），鏈依高度由上往下
const lines = data.curves.map((c, i) => ({ ...c, i }));
const order = (list, a, b) => {
  const groups = new Map();
  for (const c of list) { if (!groups.has(c.g)) groups.set(c.g, []); groups.get(c.g).push(c); }
  const gs = [...groups.values()].sort((p, q) => Math.max(...q.map(c => c.y)) - Math.max(...p.map(c => c.y)));
  const flat = gs.flat();
  flat.forEach((c, k) => { c.step = a + Math.floor((k * (b - a + 1)) / flat.length); });
  return flat;
};
const A = order(lines.filter(c => c.k === 'ink' || c.k === 'out'), PH.A0, PH.A1);
const B = order(lines.filter(c => c.k === 'tone' || c.k === 'tex'), PH.B0, PH.B1);
const fills = data.fills.map((f, k) => ({ ...f, step: PH.C0 + Math.floor((k * (PH.C1 - PH.C0 + 1)) / data.fills.length) }));
const r4 = v => Math.round(v * 1e4) / 1e4;

const objs = [
  ...fills.map((f, k) => ({ n: `p_{${k + 1}}`, def: `p_{${k + 1}} = Polygon({${f.pts.map(p => `(${p[0]}, ${p[1]})`).join(', ')}})`, col: f.c, layer: 0, fill: 1, th: 0, step: f.step })),
  ...[...A, ...B].map((c, k) => ({ n: `c_{${k + 1}}`, def: c.imp ? `c_{${k + 1}}: ${c.cmd}` : `c_{${k + 1}} = ${c.cmd}`, col: c.c, layer: 2, fill: 0, th: c.k === 'ink' ? THICK['ink' + c.w] : THICK[c.k], step: c.step, eq: c.eq, f: c.f, k: c.k })),
];

// 方程式清單
const forms = {};
for (const o of objs) if (o.f) forms[o.f] = (forms[o.f] || 0) + 1;
const txt = [
  `${title}：${A.length + B.length} 條方程式，${fills.length} 個上色的多邊形`,
  `座標：一個單位是原圖的 ${U} 像素；圖的範圍 0 ≤ x ≤ ${r4(W / U)}，0 ≤ y ≤ ${r4(H / U)}。`,
  `擬合誤差：原圖的線上每一點到方程式的距離，平均 ${data.stats.err_mean_px} 像素，95% 在 ${data.stats.err_p95_px} 像素以內，最大 ${data.stats.err_max_px} 像素。`,
  `形式：${Object.entries(forms).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${FORM[k] || k} ${v} 條`).join('、')}。`,
  `分層：${Object.entries(data.stats.by_layer).map(([k, v]) => `${LAYER[k] || k} ${v} 條`).join('、')}。`,
  `順序：滑桿 s 從 0 走到 ${SMAX}；第 ${PH.A0}–${PH.A1} 步畫墨線（由上往下），第 ${PH.B0}–${PH.B1} 步畫細線，第 ${PH.C0}–${PH.C1} 步上色。每一條後面的 [s≥n] 是它出現的那一步。`,
  '',
  ...objs.filter(o => o.eq).map(o => `${o.n.replace(/[_{}]/g, '').padEnd(7)} [${LAYER[o.k]}·${FORM[o.f]}] [s≥${o.step}]  ${o.eq}`),
  '',
].join('\n');
fs.writeFileSync(out.replace(/\.ggb$/, '-方程式.txt'), txt);

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><script src="https://www.geogebra.org/apps/deployggb.js"></script>
<style>html,body{margin:0;background:#fff}</style></head><body><div id="ggb"></div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const vw = 1000, vh = Math.round((vw * (H + 160)) / (W + 60));
  const page = await browser.newPage({ viewport: { width: vw + 40, height: vh + 40 } });
  page.on('pageerror', e => console.log('頁面錯誤', e.message));
  const t0 = Date.now();
  await page.setContent(PAGE, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(p => {
    window.__ready = false;
    new window.GGBApplet({ ...p, appletOnLoad: api => { window.api = api; window.__ready = true; } }, true).inject('ggb');
  }, { appName: 'classic', width: vw, height: vh, showToolBar: false, showAlgebraInput: false, showMenuBar: false, enableRightClick: false, showResetIcon: false, perspective: 'G', language: 'zh-TW' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  console.log('GeoGebra 載入', ((Date.now() - t0) / 1000).toFixed(1), '秒，版本', await page.evaluate(() => window.api.getVersion()));
  await page.evaluate(([smax, w]) => {
    const api = window.api;
    api.setRepaintingActive(false);
    api.setAxesVisible(false, false);
    api.setGridVisible(false);
    api.setRounding('4');
    api.evalCommand(`s = Slider(0, ${smax}, 1, 1, 420, false, true, false, false)`);
    api.setValue('s', smax);
    api.evalCommand('SetCoords(s, 0.3, -0.75)');
    api.setColor('s', 120, 100, 60);
    api.setLabelVisible('s', true);
    api.setCaption('s', '繪製進度');
  }, [SMAX, W / U]);
  const BATCH = 300;
  let missing = 0;
  for (let i = 0; i < objs.length; i += BATCH) {
    const part = objs.slice(i, i + BATCH);
    const bad = await page.evaluate(list => {
      const api = window.api, miss = [];
      api.evalCommand(list.map(o => o.def).join('\n'));
      const cond = [];
      for (const o of list) {
        if (!api.exists(o.n)) { miss.push(o.n + '  ' + o.def.slice(0, 90)); continue; }
        api.setColor(o.n, o.col[0], o.col[1], o.col[2]);
        api.setLineThickness(o.n, o.th);
        if (o.fill) api.setFilling(o.n, 1);
        api.setLayer(o.n, o.layer);
        api.setLabelVisible(o.n, false);
        api.setFixed(o.n, true, false);
        cond.push(`SetConditionToShowObject(${o.n}, s >= ${o.step})`);
      }
      api.evalCommand(cond.join('\n'));
      return miss;
    }, part);
    missing += bad.length;
    if (bad.length) console.log('沒建起來', bad.length, '個，例如：', bad.slice(0, 2).join(' ／ '));
    if ((i / BATCH) % 10 === 0) console.log('已建', Math.min(i + BATCH, objs.length), '/', objs.length, ((Date.now() - t0) / 1000).toFixed(0), '秒');
  }
  const m = 0.3;
  await page.evaluate(([w, h, m]) => { window.api.setCoordSystem(-m, w + m, -1.4, h + m); window.api.setRepaintingActive(true); }, [W / U, H / U, m]);
  const n = await page.evaluate(() => window.api.getObjectNumber());
  fs.writeFileSync(out, Buffer.from(await page.evaluate(() => window.api.getBase64()), 'base64'));
  console.log('存檔', out, (fs.statSync(out).size / 1048576).toFixed(1), 'MB，物件', n, '個（應有', objs.length + 1, '），沒建起來', missing, '個，共', ((Date.now() - t0) / 1000).toFixed(0), '秒');
  await browser.close();
  if (missing) process.exit(2);
})().catch(e => { console.error(e); process.exit(1); });
