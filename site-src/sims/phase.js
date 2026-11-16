(window.SIMS = window.SIMS || {}).phase = function (el, opt) {
  const SUBS = {
    water: { n: '水', tmin: -40, tmax: 420, tstep: 40, pmin: -4, pmax: 3, tp: [0.01, 0.00604], cp: [374, 217.7],
      vap: [[273.16, 0.00604], [298.15, 0.0313], [323.15, 0.122], [353.15, 0.467], [373.15, 1.0], [393.15, 1.96], [423.15, 4.70], [473.15, 15.3], [523.15, 39.3], [573.15, 84.8], [623.15, 163.5], [647.15, 217.7]],
      subB: 6146, melt: (P) => 0.01 - (P - 0.00604) / 133, start: [50, 1],
      heat: [[-30, 1], [150, 1]], dec: [[-10, 1], [-10, 1e-4]], decT: '−10 °C 減壓（冷凍乾燥）',
      note: '水的固液線向左傾（斜率為負，加壓約 133 atm 熔點才降 1 °C）；1 atm 高於三相點壓力 0.006 atm，加熱冰會先熔化再沸騰。' },
    co2: { n: '二氧化碳', tmin: -120, tmax: 60, tstep: 20, pmin: -2, pmax: 3, tp: [-56.6, 5.11], cp: [31.0, 72.8],
      vap: [[216.58, 5.11], [233.15, 9.92], [253.15, 19.4], [273.15, 34.4], [293.15, 56.5], [298.15, 63.4], [304.15, 72.8]],
      subB: 3143, melt: (P) => -56.6 + (P - 5.11) * 0.0195, start: [25, 1],
      heat: [[-110, 1], [40, 1]], dec: [[20, 100], [20, 1]], decT: '20 °C 由 100 atm 減壓',
      note: '二氧化碳的固液線向右傾（斜率為正）；三相點壓力 5.11 atm 高於 1 atm，故 1 atm 下乾冰直接昇華（−78.5 °C）。' },
  };
  const NAMES = { s: '固相', l: '液相', g: '氣相', sc: '超臨界流體' };
  const CH = { sl: '熔化', ls: '凝固', lg: '汽化', gl: '凝結（液化）', sg: '昇華', gs: '凝華' };
  const st = { m: opt.mode === 'co2' ? 'co2' : 'water', T: 25, P: 1, ph: null, log: [], anim: 0 };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.innerHTML = `<div class="sim-head"><b>水與二氧化碳的三相圖</b><span>拖動圖上的狀態點（或滑桿），看它落在哪一相；按預設路徑看依序發生哪些相變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 296" role="img" aria-label="相圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-m="water">水</button><button type="button" data-m="co2">二氧化碳</button></div>
    <label class="sl"><span>溫度</span><input type="range" data-k="T" step="0.5"><output></output></label>
    <label class="sl"><span>壓力</span><input type="range" data-k="P" step="0.01"><output></output></label>
    <div class="ops"><button type="button" data-p="heat">加熱（1 atm）</button><button type="button" data-p="dec">減壓</button></div>
    <div class="facts">
      <div class="fact"><span>溫度</span><b data-f="T"></b></div><div class="fact"><span>壓力</span><b data-f="P"></b></div>
      <div class="fact"><span>此狀態</span><b data-f="ph"></b></div><div class="fact"><span>依序發生的相變</span><b data-f="log"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), sT = el.querySelector('[data-k="T"]'), sP = el.querySelector('[data-k="P"]');
  const f = (k) => el.querySelector(`[data-f="${k}"]`);
  const L = 50, R = 408, T0 = 14, B = 252;
  const S = () => SUBS[st.m];
  const X = (t) => L + ((t - S().tmin) / (S().tmax - S().tmin)) * (R - L);
  const Y = (p) => B - ((Math.log10(p) - S().pmin) / (S().pmax - S().pmin)) * (B - T0);
  const vapP = (t) => { const a = S().vap, K = t + 273.15; let i = 0; while (i < a.length - 2 && K > a[i + 1][0]) i++; const [k1, p1] = a[i], [k2, p2] = a[i + 1]; const u = (1 / K - 1 / k1) / (1 / k2 - 1 / k1); return Math.exp(Math.log(p1) + u * (Math.log(p2) - Math.log(p1))); };
  const subP = (t) => S().tp[1] * Math.exp(-S().subB * (1 / (t + 273.15) - 1 / (S().tp[0] + 273.15)));
  function curves() {
    const s = S(), pts = { sub: [], vap: [], melt: [] };
    for (let i = 0; i <= 80; i++) { const t = s.tmin + (s.tp[0] - s.tmin) * i / 80, p = subP(t); if (Math.log10(p) >= s.pmin) pts.sub.push([X(t), Y(p)]); }
    for (let i = 0; i <= 80; i++) { const t = s.tp[0] + (s.cp[0] - s.tp[0]) * i / 80; pts.vap.push([X(t), Y(vapP(t))]); }
    for (let i = 0; i <= 80; i++) { const p = 10 ** (Math.log10(s.tp[1]) + (s.pmax - Math.log10(s.tp[1])) * i / 80); pts.melt.push([X(s.melt(p)), Y(p)]); }
    return pts;
  }
  function phaseOf(t, p) {
    const s = S();
    if (p < s.tp[1]) return t < s.tp[0] && p >= subP(t) ? 's' : 'g';
    if (t < s.melt(p)) return 's';
    if (t > s.cp[0]) return p > s.cp[1] ? 'sc' : 'g';
    if (t < s.tp[0]) return 'l';
    return p >= vapP(t) ? 'l' : 'g';
  }
  const dist = (pl, x, y) => Math.min(...pl.map(([a, b]) => Math.hypot(a - x, b - y)));
  const pstr = (p) => (p >= 100 ? p.toFixed(0) : p >= 1 ? p.toFixed(2) : p >= 0.01 ? p.toFixed(3) : (p / 10 ** Math.floor(Math.log10(p))).toFixed(1) + '×' + tick(Math.floor(Math.log10(p))));
  const tick = (e) => (e === 0 ? '1' : '10' + String(e).split('').map((c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])).join(''));
  function update() {
    const s = S(), pc = curves(), x = X(st.T), y = Y(st.P);
    const ph = phaseOf(st.T, st.P);
    if (st.ph && ph !== st.ph) { const k = st.ph + ph; st.log.push(CH[k] || (ph === 'sc' ? '成為超臨界流體' : '離開超臨界區（無明顯界面）')); if (st.log.length > 4) st.log.shift(); }
    st.ph = ph;
    let on = '';
    if (Math.hypot(x - X(s.tp[0]), y - Y(s.tp[1])) < 6) on = '三相點：固、液、氣三相共存';
    else if (Math.hypot(x - X(s.cp[0]), y - Y(s.cp[1])) < 6) on = '臨界點';
    else if (dist(pc.vap, x, y) < 3) on = '液氣線上：液、氣共存';
    else if (dist(pc.melt, x, y) < 3) on = '固液線上：固、液共存';
    else if (dist(pc.sub, x, y) < 3) on = '固氣線上：固、氣共存';
    const poly = (a) => a.map(([u, v], i) => (i ? 'L' : 'M') + u.toFixed(1) + ' ' + v.toFixed(1)).join('');
    let g = `<rect x="${L}" y="${T0}" width="${R - L}" height="${B - T0}" fill="var(--card)" stroke="var(--line)"/>`;
    for (let t = Math.ceil(s.tmin / s.tstep) * s.tstep; t <= s.tmax; t += s.tstep) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${T0}" y2="${B}" stroke="var(--line)" stroke-width=".6"/><text x="${X(t)}" y="${B + 13}" font-size="11" text-anchor="middle" fill="var(--mute)">${t}</text>`;
    for (let e = s.pmin; e <= s.pmax; e++) g += `<line x1="${L}" x2="${R}" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" stroke="var(--line)" stroke-width=".6"/><text x="${L - 4}" y="${Y(10 ** e) + 4}" font-size="11" text-anchor="end" fill="var(--mute)">${tick(e)}</text>`;
    g += `<text x="${(L + R) / 2}" y="${B + 28}" font-size="11" text-anchor="middle" fill="var(--ink-2)">溫度（°C）</text><text x="12" y="${(T0 + B) / 2}" font-size="11" text-anchor="middle" fill="var(--ink-2)" transform="rotate(-90 12 ${(T0 + B) / 2})">壓力（atm，對數刻度）</text>`;
    g += `<line x1="${L}" x2="${R}" y1="${Y(1)}" y2="${Y(1)}" stroke="var(--c-X)" stroke-dasharray="4 3"/><text x="${R - 3}" y="${Y(1) - 3}" font-size="10" text-anchor="end" fill="var(--c-X)">1 atm</text>`;
    g += `<rect x="${X(s.cp[0])}" y="${T0}" width="${R - X(s.cp[0])}" height="${Y(s.cp[1]) - T0}" fill="var(--c-X)" opacity=".08"/>`;
    g += `<path d="${poly(pc.sub)}" fill="none" stroke="var(--c-P)" stroke-width="2.2"/><path d="${poly(pc.vap)}" fill="none" stroke="var(--c-C)" stroke-width="2.2"/><path d="${poly(pc.melt)}" fill="none" stroke="var(--c-B)" stroke-width="2.2"/>`;
    const lab = st.m === 'water' ? [[-25, 30, '固相'], [60, 30, '液相'], [200, 0.01, '氣相'], [395, 600, '超臨界']] : [[-95, 60, '固相'], [0, 300, '液相'], [-20, 0.1, '氣相'], [45, 400, '超臨界']];
    lab.forEach(([t, p, n]) => { g += `<text x="${X(t)}" y="${Y(p)}" font-size="13" font-weight="700" text-anchor="middle" fill="var(--ink-2)" opacity=".75">${n}</text>`; });
    g += `<circle cx="${X(s.tp[0])}" cy="${Y(s.tp[1])}" r="4" fill="var(--red)"/><text x="${X(s.tp[0]) + 6}" y="${Y(s.tp[1]) + 14}" font-size="11" fill="var(--red)" stroke="var(--card)" stroke-width="3" paint-order="stroke">三相點 ${s.tp[0]} °C、${s.tp[1] < 1 ? '0.006' : s.tp[1]} atm</text>`;
    g += `<circle cx="${X(s.cp[0])}" cy="${Y(s.cp[1])}" r="4" fill="var(--red)"/><text x="${X(s.cp[0]) - 4}" y="${Y(s.cp[1]) - 7}" font-size="11" text-anchor="end" fill="var(--red)" stroke="var(--card)" stroke-width="3" paint-order="stroke">臨界點 ${s.cp[0]} °C、${Math.round(s.cp[1])} atm</text>`;
    const nb = st.m === 'water' ? [[0, '正常熔點 0 °C'], [100, '正常沸點 100 °C']] : [[-78.5, '1 atm 昇華點 −78.5 °C']];
    nb.forEach(([t, n], i) => { g += `<circle cx="${X(t)}" cy="${Y(1)}" r="3.5" fill="var(--c-X)"/><text x="${X(t) + 5}" y="${Y(1) + (i ? -6 : 14)}" font-size="10" fill="var(--c-X)" stroke="var(--card)" stroke-width="3" paint-order="stroke">${n}</text>`; });
    if (st.path) g += `<line x1="${X(st.path[0][0])}" y1="${Y(st.path[0][1])}" x2="${x}" y2="${y}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="5 3"/>`;
    g += `<circle data-drag="1" cx="${x}" cy="${y}" r="9" fill="var(--sun)" stroke="var(--ink)" stroke-width="2" style="cursor:grab"/>`;
    svg.innerHTML = g;
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.m)));
    sT.min = s.tmin; sT.max = s.tmax; sT.value = st.T; sP.min = s.pmin; sP.max = s.pmax; sP.value = Math.log10(st.P);
    sT.nextElementSibling.textContent = st.T.toFixed(1) + ' °C'; sP.nextElementSibling.textContent = pstr(st.P) + ' atm';
    f('T').textContent = `${st.T.toFixed(1)} °C（${(st.T + 273.15 + 1e-9).toFixed(1)} K）`;
    f('P').textContent = pstr(st.P) + ' atm';
    f('ph').textContent = on || NAMES[ph];
    f('log').textContent = st.log.length ? st.log.join(' → ') : '（尚未跨越曲線）';
    f('note').textContent = s.note;
  }
  function setMode(m) { st.m = m; st.anim++; st.T = S().start[0]; st.P = S().start[1]; st.ph = null; st.log = []; st.path = null; update(); }
  function run(key) {
    const [[t1, p1], [t2, p2]] = S()[key], id = ++st.anim;
    st.T = t1; st.P = p1; st.ph = null; st.log = []; st.path = [[t1, p1]]; update();
    const go = (u) => { st.T = t1 + (t2 - t1) * u; st.P = 10 ** (Math.log10(p1) + (Math.log10(p2) - Math.log10(p1)) * u); update(); };
    if (reduce) { for (let i = 1; i <= 60; i++) go(i / 60); return; }
    const t0 = performance.now();
    const step = (now) => { if (!el.isConnected || id !== st.anim) return; const u = Math.min(1, (now - t0) / 3000); go(u); if (u < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));
  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => run(b.dataset.p)));
  sT.addEventListener('input', () => { st.anim++; st.path = null; st.T = Number(sT.value); update(); });
  sP.addEventListener('input', () => { st.anim++; st.path = null; st.P = 10 ** Number(sP.value); update(); });
  let drag = false;
  const toState = (e) => {
    const r = svg.getBoundingClientRect(), vx = ((e.clientX - r.left) / r.width) * 420, vy = ((e.clientY - r.top) / r.height) * 296, s = S();
    st.T = Math.round((s.tmin + ((Math.min(Math.max(vx, L), R) - L) / (R - L)) * (s.tmax - s.tmin)) * 2) / 2;
    st.P = 10 ** (s.pmin + ((B - Math.min(Math.max(vy, T0), B)) / (B - T0)) * (s.pmax - s.pmin));
    update();
  };
  svg.addEventListener('pointerdown', (e) => { drag = true; st.anim++; st.path = null; svg.setPointerCapture(e.pointerId); toState(e); });
  svg.addEventListener('pointermove', (e) => { if (drag) toState(e); });
  svg.addEventListener('pointerup', () => { drag = false; });
  svg.addEventListener('pointercancel', () => { drag = false; });
  setMode(st.m);
};
