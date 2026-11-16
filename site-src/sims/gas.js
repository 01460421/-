(window.SIMS = window.SIMS || {}).gas = function (el, opt) {
  const R = 0.082, VMIN = 5, VMAX = 80;
  const MODES = { T: { t: '定溫（波以耳）', fix: 'T', g: ['V', 'P'] }, P: { t: '定壓（查理）', fix: 'P', g: ['T', 'V'] }, V: { t: '定容（給呂薩克）', fix: 'V', g: ['T', 'P'] } };
  const mode0 = MODES[opt.mode] ? opt.mode : 'T';
  const st = { m: mode0, T: 300, V: 24.6, n: 1, P: 1, trace: [], run: !matchMedia('(prefers-reduced-motion: reduce)').matches };
  const LIM = { T: [100, 600, 10, 'K'], V: [VMIN, VMAX, 0.1, 'L'], n: [0.5, 3, 0.1, 'mol'] };
  el.innerHTML = `<div class="sim-head"><b>氣體的 P、V、T、n 關係</b><span>選一個固定的變數，拖動其餘滑桿，看活塞、粒子速率與壓力如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 340" role="img" aria-label="活塞容器與氣體圖形"></svg></div>
  <div class="sim-ctl">
    <div class="ops">${Object.keys(MODES).map((k) => `<button type="button" data-m="${k}">${MODES[k].t}</button>`).join('')}</div>
    ${['T', 'V', 'n'].map((k) => `<label class="sl"><span>${k === 'T' ? '溫度 T' : k === 'V' ? '體積 V' : '莫耳數 n'}</span><input type="range" data-k="${k}" min="${LIM[k][0]}" max="${LIM[k][1]}" step="${LIM[k][2]}"><output></output></label>`).join('')}
    <div class="ops"><button type="button" data-a="clr">清除軌跡</button><button type="button" data-a="run"></button></div>
    <div class="facts">
      <div class="fact" style="grid-column:1/-1"><span>壓力 P = nRT / V（R = 0.082 atm·L/(mol·K)）</span><b data-f="P"></b></div>
      <div class="fact"><span>固定的量</span><b data-f="fix"></b></div><div class="fact"><span>守恆關係</span><b data-f="k"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), f = (k) => el.querySelector(`[data-f="${k}"]`);
  const sl = {}; el.querySelectorAll('[data-k]').forEach((i) => { sl[i.dataset.k] = i; });
  const BX = 16, BY = 14, BH = 120, WMAX = 330;
  const W = (V) => (V / VMAX) * WMAX;
  // particles in unit coordinates (0..1) so they rescale with the box
  const parts = Array.from({ length: 60 }, () => { const a = Math.random() * 2 * Math.PI, s = 0.6 + Math.random() * 0.8; return { x: Math.random(), y: Math.random(), vx: Math.cos(a) * s, vy: Math.sin(a) * s }; });
  svg.innerHTML = `<g data-g="box"></g><g data-g="pt">${parts.map(() => '<circle r="3.2" fill="var(--c-C)"/>').join('')}</g><g data-g="graph"></g>`;
  const gBox = svg.querySelector('[data-g="box"]'), gGr = svg.querySelector('[data-g="graph"]'), dots = svg.querySelectorAll('[data-g="pt"] circle');
  const nice = (v) => { const e = 10 ** Math.floor(Math.log10(v)), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; };
  let ax = null;
  function axes() {
    const m = st.m;
    if (m === 'T') ax = { x: [0, VMAX], y: [0, nice((st.n * R * st.T) / VMIN)] };
    if (m === 'P') ax = { x: [0, 600], y: [0, VMAX] };
    if (m === 'V') ax = { x: [0, 600], y: [0, nice((st.n * R * 600) / st.V)] };
  }
  const val = (k) => st[k];
  function drawBox() {
    const w = W(st.V);
    gBox.innerHTML = `<rect x="${BX}" y="${BY}" width="${WMAX + 8}" height="${BH}" fill="var(--card)" stroke="var(--line)"/>
      <path d="M${BX} ${BY} V${BY + BH} M${BX} ${BY} H${BX + WMAX + 8} M${BX} ${BY + BH} H${BX + WMAX + 8}" stroke="var(--ink-2)" stroke-width="3" fill="none"/>
      <rect x="${BX + w}" y="${BY + 2}" width="8" height="${BH - 4}" fill="var(--c-E)"/><rect x="${BX + w + 8}" y="${BY + BH / 2 - 4}" width="${WMAX + 26 - w}" height="8" fill="var(--c-E)" opacity=".7"/>
      <text x="${BX + 6}" y="${BY + BH + 16}" font-size="12" fill="var(--ink-2)">V = ${st.V.toFixed(1)} L　T = ${st.T} K　n = ${st.n.toFixed(1)} mol　P = ${st.P.toFixed(2)} atm</text>`;
  }
  function drawGraph() {
    const [kx, ky] = MODES[st.m].g, GX = 52, GY = 170, GW = 350, GH = 140;
    const px = (v) => GX + ((v - ax.x[0]) / (ax.x[1] - ax.x[0])) * GW, py = (v) => GY + GH - ((v - ax.y[0]) / (ax.y[1] - ax.y[0])) * GH;
    const unit = { P: 'atm', V: 'L', T: 'K' };
    let s = `<rect x="${GX}" y="${GY}" width="${GW}" height="${GH}" fill="var(--card)" stroke="var(--line)"/>`;
    const nd = (v) => { const m = Math.round(v / 10 ** Math.floor(Math.log10(v))); return m === 1 || m === 5 ? 5 : m === 6 ? 6 : 4; };
    const nx = nd(ax.x[1]), ny = nd(ax.y[1]);
    for (let i = 0; i <= nx; i++) { const xv = (ax.x[1] * i) / nx; s += `<text x="${px(xv)}" y="${GY + GH + 13}" font-size="10" text-anchor="middle" fill="var(--mute)">${+xv.toFixed(2)}</text>`; }
    for (let i = 0; i <= ny; i++) { const yv = (ax.y[1] * i) / ny; s += `<text x="${GX - 4}" y="${py(yv) + 3}" font-size="10" text-anchor="end" fill="var(--mute)">${+yv.toFixed(2)}</text>`; if (i) s += `<line x1="${GX}" x2="${GX + GW}" y1="${py(yv)}" y2="${py(yv)}" stroke="var(--line)" stroke-width=".6"/>`; }
    s += `<text x="${GX + GW}" y="${GY + GH + 27}" font-size="11" text-anchor="end" fill="var(--ink-2)">${kx}（${unit[kx]}）</text><text x="${GX - 4}" y="${GY - 5}" font-size="11" text-anchor="end" fill="var(--ink-2)">${ky}（${unit[ky]}）</text>`;
    // theory curve for current state
    let d = '';
    if (st.m === 'T') for (let v = 2; v <= VMAX; v += 0.5) { const p = (st.n * R * st.T) / v; if (p <= ax.y[1]) d += (d ? 'L' : 'M') + px(v).toFixed(1) + ' ' + py(p).toFixed(1); }
    else { const k = st.m === 'P' ? (st.n * R) / st.P : (st.n * R) / st.V; const t2 = Math.min(600, ax.y[1] / k); d = `M${px(0)} ${py(0)}L${px(t2)} ${py(k * t2)}`; }
    s += `<path d="${d}" fill="none" stroke="var(--teal)" stroke-width="1.5" stroke-dasharray="${st.m === 'T' ? '' : '4 3'}" opacity=".8"/>`;
    s += `<path d="${st.trace.map(([a, b], i) => (i ? 'L' : 'M') + px(a).toFixed(1) + ' ' + py(Math.min(b, ax.y[1])).toFixed(1)).join('')}" fill="none" stroke="var(--red)" stroke-width="2.5"/>`;
    s += `<circle cx="${px(val(kx))}" cy="${py(Math.min(val(ky), ax.y[1]))}" r="5" fill="var(--red)" stroke="var(--card)" stroke-width="1.5"/>`;
    s += `<text x="${GX + 6}" y="${GY + 14}" font-size="11" fill="var(--ink-2)">${ky}–${kx} 圖（紅：走過的路徑；綠：${st.m === 'T' ? '等溫線' : '過原點直線，虛線外插'}）</text>`;
    gGr.innerHTML = s;
  }
  function update(push) {
    if (st.m !== 'P') st.P = (st.n * R * st.T) / st.V; else st.V = (st.n * R * st.T) / st.P;
    if (push) { const [kx, ky] = MODES[st.m].g; st.trace.push([val(kx), val(ky)]); if (st.trace.length > 600) st.trace.shift(); }
    for (const k of ['T', 'V', 'n']) { sl[k].value = st[k]; sl[k].disabled = MODES[st.m].fix === k || (st.m === 'P' && k === 'V'); sl[k].nextElementSibling.textContent = (k === 'T' ? st.T : st[k].toFixed(1)) + ' ' + LIM[k][3]; }
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.m)));
    f('P').textContent = `${st.n.toFixed(1)} × 0.082 × ${st.T} ÷ ${st.V.toFixed(1)} = ${st.P.toFixed(2)} atm`;
    f('fix').textContent = st.m === 'T' ? `T = ${st.T} K` : st.m === 'P' ? `P = ${st.P.toFixed(2)} atm` : `V = ${st.V.toFixed(1)} L`;
    f('k').textContent = st.m === 'T' ? `PV = ${(st.P * st.V).toFixed(1)} atm·L` : st.m === 'P' ? `V/T = ${(st.V / st.T).toPrecision(3)} L/K` : `P/T = ${(st.P / st.T).toPrecision(3)} atm/K`;
    f('note').textContent = st.m === 'T' ? '定溫時粒子平均速率不變；體積減半，單位體積粒子數加倍，撞壁次數加倍，壓力加倍（PV 為定值，n 增加則曲線離原點較遠）。'
      : st.m === 'P' ? '定壓下 V 與絕對溫度 T 成正比：升溫使粒子變快、撞壁更用力，活塞須外推使壓力維持不變。溫度加倍要以 K 計算。'
        : '定容下 P 與絕對溫度 T 成正比：粒子速率 ∝ √T，撞壁次數與每次撞擊的力道都增加，壓力上升。';
    axes(); drawBox(); drawGraph(); place();
  }
  function setMode(m) { st.m = m; st.trace = []; axes(); update(true); }
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));
  Object.values(sl).forEach((i) => i.addEventListener('input', () => {
    const k = i.dataset.k; st[k] = Number(i.value);
    if (st.m === 'P') { const V = (st.n * R * st.T) / st.P; if (V > VMAX || V < VMIN) { const lim = V > VMAX ? VMAX : VMIN; if (k === 'T') st.T = Math.floor((lim * st.P) / (st.n * R) / 10) * 10; else st.n = Math.floor(((lim * st.P) / (R * st.T)) * 10) / 10; } }
    update(true);
  }));
  const runBtn = el.querySelector('[data-a="run"]');
  const setRun = () => { runBtn.textContent = st.run ? '暫停粒子' : '播放粒子'; runBtn.setAttribute('aria-pressed', String(st.run)); };
  runBtn.addEventListener('click', () => { st.run = !st.run; setRun(); if (st.run) { last = performance.now(); requestAnimationFrame(frame); } });
  el.querySelector('[data-a="clr"]').addEventListener('click', () => { st.trace = []; update(true); });
  let last = performance.now();
  function place() {
    const N = Math.round(st.n * 20), w = W(st.V) - 8;
    dots.forEach((c, i) => { const p = parts[i]; c.style.display = i < N ? '' : 'none'; c.setAttribute('cx', (BX + 6 + p.x * w).toFixed(1)); c.setAttribute('cy', (BY + 6 + p.y * (BH - 12)).toFixed(1)); });
  }
  function frame(now) {
    if (!el.isConnected || !st.run) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const sp = 9 * Math.sqrt(st.T), w = Math.max(10, W(st.V) - 8);
    parts.forEach((p) => {
      p.x += (p.vx * sp * dt) / w; p.y += (p.vy * sp * dt) / (BH - 12);
      if (p.x < 0) { p.x = -p.x; p.vx = Math.abs(p.vx); } if (p.x > 1) { p.x = 2 - p.x; p.vx = -Math.abs(p.vx); }
      if (p.y < 0) { p.y = -p.y; p.vy = Math.abs(p.vy); } if (p.y > 1) { p.y = 2 - p.y; p.vy = -Math.abs(p.vy); }
      p.x = Math.min(Math.max(p.x, 0), 1);
    });
    place();
    requestAnimationFrame(frame);
  }
  axes(); update(true); place(); setRun();
  if (st.run) requestAnimationFrame(frame);
};
