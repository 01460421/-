(window.SIMS = window.SIMS || {}).bohr = function (el, opt) {
  const NMAX = 6, En = (n) => -13.6 / (n * n);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uid = 'b' + Math.random().toString(36).slice(2, 8);
  const st = { ni: 3, nf: 2, seen: new Set(['3-2']), ph: 1 };
  const SER = { 1: '來曼系', 2: '巴耳末系', 3: '帕申系' };
  const yOf = {}; // power scale so upper levels stay apart; n = 1 at the bottom
  for (let n = 1; n <= NMAX; n++) yOf[n] = 22 + 234 * Math.pow(-En(n) / 13.6, 0.25);
  el.innerHTML = `<div class="sim-head"><b>氫原子能階與光譜線</b><span>點選高能階 nᵢ 與低能階 n_f（或直接點能階圖），看放出光子的能量、波長與所屬譜線系。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 440 350" role="img" aria-label="氫原子能階圖與光譜"></svg></div>
  <div class="sim-ctl">
    <div><small style="color:var(--ink-2)">躍遷前（高能階）nᵢ</small><div class="ops" data-g="ni">${[2, 3, 4, 5, 6].map((n) => `<button type="button" data-n="${n}">n = ${n}</button>`).join('')}</div></div>
    <div><small style="color:var(--ink-2)">躍遷後（低能階）n_f</small><div class="ops" data-g="nf">${[1, 2, 3].map((n) => `<button type="button" data-n="${n}">n = ${n}</button>`).join('')}</div></div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>光子能量 ΔE = Eᵢ − E_f</span><b data-f="dE"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>波長 λ = 1240 / ΔE</span><b data-f="wl"></b></div>
      <div class="fact"><span>譜線系</span><b data-f="ser"></b></div><div class="fact"><span>波段</span><b data-f="band"></b></div></div>
    <div class="ops"><button type="button" data-clear>清除光譜</button></div>
    <p class="sim-note">只有落到 n = 2 的躍遷（巴耳末系）落在可見光；落到 n = 1 能階差最大、為紫外線，落到 n = 3 為紅外線。能階差越大，光子能量越大、波長越短。</p>
  </div></div>`;
  const svg = el.querySelector('svg'), $ = (s) => el.querySelector(s);
  function wlColor(w) {
    if (w < 380 || w > 750) return 'var(--ink-2)';
    let r = 0, g = 0, b = 0;
    if (w < 440) { r = (440 - w) / 60; b = 1; } else if (w < 490) { g = (w - 440) / 50; b = 1; } else if (w < 510) { g = 1; b = (510 - w) / 20; }
    else if (w < 580) { r = (w - 510) / 70; g = 1; } else if (w < 645) { r = 1; g = (645 - w) / 65; } else r = 1;
    return `rgb(${Math.round(r * 225)},${Math.round(g * 200)},${Math.round(b * 225)})`;
  }
  const colName = (w) => (w < 380 ? '紫外線' : w > 700 ? '紅外線' : w >= 620 ? '可見光・紅光' : w >= 590 ? '可見光・橙光' : w >= 570 ? '可見光・黃光' : w >= 500 ? '可見光・綠光' : w >= 480 ? '可見光・藍綠光' : w >= 450 ? '可見光・藍光' : w >= 425 ? '可見光・藍紫光' : '可見光・紫光');
  const lam = (ni, nf) => 1240 / (En(ni) - En(nf));
  const SX0 = 24, SX1 = 416, SY = 302, L0 = Math.log10(80), L1 = Math.log10(2000);
  const sx = (w) => SX0 + ((Math.log10(w) - L0) / (L1 - L0)) * (SX1 - SX0);
  function draw() {
    const { ni, nf } = st, w = lam(ni, nf), col = wlColor(w);
    let s = `<defs><linearGradient id="${uid}g" x1="0" x2="1">${[380, 440, 490, 510, 580, 645, 700].map((v) => `<stop offset="${((sx(v) - sx(380)) / (sx(700) - sx(380))).toFixed(3)}" stop-color="${wlColor(v)}"/>`).join('')}</linearGradient></defs>`;
    s += `<text x="8" y="14" font-size="12" fill="var(--mute)">能量（eV）縱軸未依比例</text><line x1="96" y1="22" x2="250" y2="22" stroke="var(--mute)" stroke-dasharray="4 3"/><text x="256" y="26" font-size="12" fill="var(--mute)">n = ∞　0</text>`;
    let lab = 1e9;
    for (let n = 1; n <= NMAX; n++) {
      const y = yOf[n], ly = Math.min(y, lab - 12); lab = ly; const on = n === ni || n === nf;
      s += `<g data-n="${n}" style="cursor:pointer"><rect x="90" y="${y - 5}" width="166" height="10" fill="transparent"/><line x1="96" y1="${y}" x2="250" y2="${y}" stroke="${on ? 'var(--teal)' : 'var(--ink)'}" stroke-width="${on ? 3 : 1.6}"/></g>`;
      s += `<path d="M250 ${y} L256 ${ly}" stroke="var(--line)"/><text x="258" y="${ly + 4}" font-size="12" fill="${on ? 'var(--teal)' : 'var(--ink-2)'}" font-weight="${on ? 700 : 400}">n = ${n}　−${(-En(n)).toFixed(2)}</text>`;
    }
    const ax = 150, y1 = yOf[ni], y2 = yOf[nf];
    s += `<line x1="${ax}" y1="${y1}" x2="${ax}" y2="${y2 - 7}" stroke="var(--red)" stroke-width="2.5"/><path d="M${ax - 6} ${y2 - 9} L${ax} ${y2} L${ax + 6} ${y2 - 9}Z" fill="var(--red)"/>`;
    const my = (y1 + y2) / 2, off = reduce ? 1 : st.ph, x0 = ax + 8 + off * 40; let wave = `M${x0} ${my}`;
    for (let i = 1; i <= 40; i++) wave += ` L${x0 + i * 1.5} ${my + 5 * Math.sin(i * 0.6)}`;
    s += `<path d="${wave}" fill="none" stroke="${col}" stroke-width="2.5"/><path d="M${x0 + 60} ${my - 5} L${x0 + 68} ${my} L${x0 + 60} ${my + 5}Z" fill="${col}"/><text x="${x0 + 4}" y="${my - 10}" font-size="12" fill="var(--ink-2)">hf</text>`;
    // spectrum strip
    s += `<rect x="${SX0}" y="${SY - 30}" width="${SX1 - SX0}" height="34" fill="#15171c" rx="3"/><rect x="${sx(380)}" y="${SY + 6}" width="${sx(700) - sx(380)}" height="5" fill="url(#${uid}g)"/>`;
    st.seen.forEach((k) => { const [a, b] = k.split('-').map(Number), wv = lam(a, b), cur = a === ni && b === nf, c = wv >= 380 && wv <= 700 ? wlColor(wv) : '#9aa3ad';
      s += `<line x1="${sx(wv)}" y1="${SY - 28}" x2="${sx(wv)}" y2="${SY + 2}" stroke="${c}" stroke-width="${cur ? 3.5 : 2}"/>`; });
    [100, 200, 500, 1000, 2000].forEach((v) => { s += `<text x="${sx(v)}" y="${SY + 24}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">${v}</text>`; });
    s += `<text x="${sx(91)}" y="${SY + 40}" font-size="12" fill="var(--ink-2)">紫外線</text><text x="${(sx(380) + sx(700)) / 2}" y="${SY + 40}" font-size="12" text-anchor="middle" fill="var(--ink-2)">可見光</text><text x="${SX1}" y="${SY + 40}" font-size="12" text-anchor="end" fill="var(--ink-2)">紅外線　λ（nm）</text>`;
    s += `<polygon points="${sx(w) - 5},${SY - 38} ${sx(w) + 5},${SY - 38} ${sx(w)},${SY - 31}" fill="var(--red)"/>`;
    svg.innerHTML = s;
    const dE = En(ni) - En(nf);
    const fe = (x) => '−' + Math.abs(x).toFixed(2);
    $('[data-f="dE"]').textContent = `${fe(En(ni))} − (${fe(En(nf))}) = ${dE.toFixed(2)} eV`;
    $('[data-f="wl"]').textContent = `1240 / ${dE.toFixed(2)} ≈ ${w.toFixed(0)} nm`;
    $('[data-f="ser"]').textContent = SER[nf];
    $('[data-f="band"]').textContent = colName(w);
    el.querySelectorAll('[data-g="ni"] button').forEach((b) => { const n = Number(b.dataset.n); b.setAttribute('aria-pressed', String(n === ni)); });
    el.querySelectorAll('[data-g="nf"] button').forEach((b) => { const n = Number(b.dataset.n); b.setAttribute('aria-pressed', String(n === nf)); b.disabled = n >= ni; b.style.opacity = n >= ni ? 0.4 : 1; });
  }
  let running = false, t0 = 0;
  function emit() {
    st.seen.add(st.ni + '-' + st.nf); st.ph = 0; draw();
    if (reduce || running) { t0 = performance.now(); return; }
    running = true; t0 = performance.now();
    const fr = (t) => { if (!el.isConnected) { running = false; return; } st.ph = Math.min(1, (t - t0) / 900); draw(); if (st.ph < 1) requestAnimationFrame(fr); else running = false; };
    requestAnimationFrame(fr);
  }
  function set(ni, nf) { if (nf >= ni || nf > 3) return; st.ni = ni; st.nf = nf; emit(); }
  $('[data-g="ni"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const n = Number(b.dataset.n); set(n, Math.min(st.nf, n - 1)); });
  $('[data-g="nf"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; set(st.ni, Number(b.dataset.n)); });
  svg.addEventListener('click', (e) => { const g = e.target.closest('g[data-n]'); if (!g) return; const n = Number(g.dataset.n);
    if (n > st.nf && n !== st.ni) set(n, st.nf); else if (n < st.ni && n !== st.nf) set(st.ni, n); });
  $('[data-clear]').addEventListener('click', () => { st.seen = new Set([st.ni + '-' + st.nf]); draw(); });
  draw();
};
