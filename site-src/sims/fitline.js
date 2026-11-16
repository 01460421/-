(window.SIMS = window.SIMS || {}).fitline = function (el, opt) {
  const sg = (x, d) => (x < 0 && Number(Math.abs(x).toFixed(d)) ? '−' : '') + Math.abs(x).toFixed(d);
  const DS = {
    Fx: { name: '彈力 F 對伸長量 x', xl: '伸長量 x（cm）', yl: '彈力 F（N）', xu: 'cm', yu: 'N', xmax: 14, ymax: 4, xs: [2, 4, 6, 8, 10, 12], m: 0.25, b: 0, sd: 0.08,
      slope: (m) => `斜率 = 彈力常數 k = ${m.toFixed(3)} N/cm = ${(m * 100).toFixed(1)} N/m`, icpt: (b) => `截距 ${sg(b, 2)} N：理論上應過原點，明顯不為 0 時先檢查零點（系統誤差）` },
    LW: { name: '彈簧長度 L 對砝碼重 W', xl: '砝碼重 W（N）', yl: '彈簧長度 L（cm）', xu: 'N', yu: 'cm', xmax: 3.5, ymax: 18, xs: [0.5, 1, 1.5, 2, 2.5, 3], m: 2.0, b: 10.0, sd: 0.25,
      slope: (m) => `斜率 = 1/k = ${m.toFixed(2)} cm/N → k = ${(100 / m).toFixed(1)} N/m`, icpt: (b) => `截距 = 彈簧原長 L₀ ≈ ${b.toFixed(1)} cm（真實的物理量）` },
  };
  const st = { ds: opt.mode === 'LW' ? 'LW' : 'Fx', pts: [], h: [], ls: false };
  const fixed = { Fx: [0.42, 1.05, 1.43, 2.08, 2.45, 3.06], LW: [11.2, 11.8, 13.1, 13.8, 15.2, 15.9] };
  el.innerHTML = `<div class="sim-head"><b>最佳直線與斜率、截距</b><span>拖動兩個方形把手調整你的直線，讓各點均勻分布在線的兩側；也可以拖動數據點。再和最小平方直線比較。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 440 300" role="img" aria-label="散布圖與直線"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="ds">${Object.keys(DS).map((k) => `<button type="button" data-d="${k}">${DS[k].name}</button>`).join('')}</div>
    <div class="ops"><button type="button" data-new>新數據</button><button type="button" data-ls>顯示最小平方直線</button></div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>你的直線</span><b data-f="me"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>最小平方直線</span><b data-f="ls"></b></div>
      <div class="fact"><span>你的 Σ(殘差²)</span><b data-f="r1"></b></div><div class="fact"><span>最小平方的 Σ(殘差²)</span><b data-f="r2"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>斜率與截距的意義</span><b data-f="mean" style="font-family:inherit;font-size:.86rem;font-weight:400"></b></div></div>
    <p class="sim-note">最佳直線不是逐點連線，而是讓縱向偏差（殘差）的平方和最小；它必通過平均點 (x̄, ȳ)。斜率要用線上相距遠的兩點計算並帶單位：縱軸單位／橫軸單位。</p>
  </div></div>`;
  const svg = el.querySelector('svg'), $ = (s) => el.querySelector(s);
  const X0 = 56, X1 = 424, Y0 = 16, Y1 = 250, uidc = 'f' + Math.random().toString(36).slice(2, 8);
  const D = () => DS[st.ds], px = (x) => X0 + (x / D().xmax) * (X1 - X0), py = (y) => Y1 - (y / D().ymax) * (Y1 - Y0);
  const ix = (p) => ((p - X0) / (X1 - X0)) * D().xmax, iy = (p) => ((Y1 - p) / (Y1 - Y0)) * D().ymax;
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return u - 3; };
  function load(random) {
    const d = D(); st.pts = d.xs.map((x, i) => ({ x, y: random ? Math.max(0, d.b + d.m * x + gauss() * d.sd * 1.4) : fixed[st.ds][i] }));
    st.h = [{ x: d.xmax * 0.12, y: d.b + d.m * d.xmax * 0.12 + d.ymax * 0.1 }, { x: d.xmax * 0.9, y: d.b + d.m * d.xmax * 0.9 - d.ymax * 0.06 }];
  }
  function fit() {
    const n = st.pts.length, mx = st.pts.reduce((a, p) => a + p.x, 0) / n, my = st.pts.reduce((a, p) => a + p.y, 0) / n;
    let sxy = 0, sxx = 0; st.pts.forEach((p) => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; });
    const m = sxx ? sxy / sxx : 0; return { m, b: my - m * mx, mx, my };
  }
  const line = (a) => { const m = (a[1].y - a[0].y) / (a[1].x - a[0].x || 1e-9); return { m, b: a[0].y - m * a[0].x }; };
  const ssr = (L) => st.pts.reduce((a, p) => a + (p.y - (L.m * p.x + L.b)) ** 2, 0);
  function draw() {
    const d = D(), me = line(st.h), F = fit();
    let s = `<rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" fill="var(--card)"/>`;
    const xstep = d.xmax > 10 ? 2 : 0.5, ystep = d.ymax > 10 ? 2 : 0.5;
    for (let x = 0; x <= d.xmax + 1e-9; x += xstep) s += `<line x1="${px(x)}" y1="${Y0}" x2="${px(x)}" y2="${Y1}" stroke="var(--line)"/><text x="${px(x)}" y="${Y1 + 15}" font-size="12" text-anchor="middle" fill="var(--ink-2)">${+x.toFixed(1)}</text>`;
    for (let y = 0; y <= d.ymax + 1e-9; y += ystep) s += `<line x1="${X0}" y1="${py(y)}" x2="${X1}" y2="${py(y)}" stroke="var(--line)"/><text x="${X0 - 5}" y="${py(y) + 4}" font-size="12" text-anchor="end" fill="var(--ink-2)">${+y.toFixed(1)}</text>`;
    s += `<text x="${X1}" y="${Y1 + 32}" font-size="13" text-anchor="end" fill="var(--ink)">${d.xl}</text><text x="${X0 + 6}" y="${Y0 + 16}" font-size="13" fill="var(--ink)">${d.yl}</text>`;
    const clipLine = (L, attrs) => `<line x1="${px(0)}" y1="${py(L.b)}" x2="${px(d.xmax)}" y2="${py(L.m * d.xmax + L.b)}" ${attrs}/>`;
    s += `<clipPath id="${uidc}"><rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}"/></clipPath><g clip-path="url(#${uidc})">`;
    st.pts.forEach((p) => { s += `<line x1="${px(p.x)}" y1="${py(p.y)}" x2="${px(p.x)}" y2="${py(me.m * p.x + me.b)}" stroke="var(--red)" stroke-width="2" stroke-opacity=".7"/>`; });
    if (st.ls) s += clipLine(F, 'stroke="var(--c-X)" stroke-width="2" stroke-dasharray="6 4"') + `<circle cx="${px(F.mx)}" cy="${py(F.my)}" r="5" fill="none" stroke="var(--c-X)" stroke-width="2"/>`;
    s += clipLine(me, 'stroke="var(--teal)" stroke-width="2.5"') + '</g>';
    st.pts.forEach((p, i) => { s += `<circle data-p="${i}" cx="${px(p.x)}" cy="${py(p.y)}" r="6" fill="var(--c-P)" stroke="var(--card)" stroke-width="1.5" style="cursor:grab"/>`; });
    st.h.forEach((h, i) => { s += `<rect data-h="${i}" x="${px(h.x) - 8}" y="${py(h.y) - 8}" width="16" height="16" rx="3" fill="var(--teal)" stroke="var(--card)" stroke-width="2" style="cursor:grab"/>`; });
    if (st.ls) s += `<text x="${px(F.mx) + 8}" y="${py(F.my) + 18}" font-size="12" fill="var(--c-X)">平均點</text>`;
    svg.innerHTML = s;
    const fmtL = (L) => `y = ${sg(L.m, 3)}x ${L.b < 0 ? '−' : '+'} ${Math.abs(L.b).toFixed(2)}（斜率 ${sg(L.m, 3)} ${d.yu}/${d.xu}，截距 ${sg(L.b, 2)} ${d.yu}）`;
    $('[data-f="me"]').textContent = fmtL(me);
    $('[data-f="ls"]').textContent = st.ls ? fmtL(F) : '按「顯示最小平方直線」';
    $('[data-f="r1"]').textContent = ssr(me).toFixed(3) + ` ${d.yu}²`;
    $('[data-f="r2"]').textContent = st.ls ? ssr(F).toFixed(3) + ` ${d.yu}²` : '—';
    const L = st.ls ? F : me; $('[data-f="mean"]').textContent = `${st.ls ? '（最小平方）' : '（你的直線）'}${d.slope(L.m)}；${d.icpt(L.b)}`;
    el.querySelectorAll('[data-d]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.d === st.ds)));
    $('[data-ls]').setAttribute('aria-pressed', String(st.ls));
  }
  let drag = null;
  const toSvg = (e) => { const r = svg.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 440, y: ((e.clientY - r.top) / r.height) * 300 }; };
  svg.addEventListener('pointerdown', (e) => { const t = e.target; if (t.dataset.h !== undefined) drag = { k: 'h', i: Number(t.dataset.h) }; else if (t.dataset.p !== undefined) drag = { k: 'p', i: Number(t.dataset.p) }; else return; svg.setPointerCapture(e.pointerId); e.preventDefault(); });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return; const q = toSvg(e), d = D(), y = Math.max(0, Math.min(d.ymax, iy(q.y)));
    if (drag.k === 'h') { const x = Math.max(0, Math.min(d.xmax, ix(q.x))), o = st.h[1 - drag.i]; if (Math.abs(x - o.x) > d.xmax * 0.05) st.h[drag.i].x = x; st.h[drag.i].y = y; }
    else st.pts[drag.i].y = y;
    draw();
  });
  const end = () => { drag = null; }; svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  $('[data-g="ds"]').addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (!b) return; st.ds = b.dataset.d; load(false); draw(); });
  $('[data-new]').addEventListener('click', () => { load(true); draw(); });
  $('[data-ls]').addEventListener('click', () => { st.ls = !st.ls; draw(); });
  load(false); draw();
};
