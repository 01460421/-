/* atomshell */
(window.SIMS = window.SIMS || {}).atomshell = function (el, opt) {
  const E = [null,
    ['H', '氫', 1], ['He', '氦', 4], ['Li', '鋰', 7], ['Be', '鈹', 9], ['B', '硼', 11], ['C', '碳', 12], ['N', '氮', 14],
    ['O', '氧', 16], ['F', '氟', 19], ['Ne', '氖', 20], ['Na', '鈉', 23], ['Mg', '鎂', 24], ['Al', '鋁', 27], ['Si', '矽', 28],
    ['P', '磷', 31], ['S', '硫', 32], ['Cl', '氯', 35], ['Ar', '氬', 40], ['K', '鉀', 39], ['Ca', '鈣', 40]];
  const CAP = [2, 8, 8, 2];
  const sup = (n) => String(n).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join('');
  const SH = ['K', 'L', 'M', 'N'];
  const st = { Z: Number(opt.Z) >= 1 && Number(opt.Z) <= 20 ? Math.round(Number(opt.Z)) : 11 };
  const shells = (Z) => { const a = []; let r = Z; for (const c of CAP) { if (r <= 0) break; a.push(Math.min(c, r)); r -= c; } return a; };
  const groupOf = (Z, sh) => { const v = sh[sh.length - 1]; if (Z === 2) return 18; if (v <= 2) return v; return v === 8 ? 18 : v + 10; };
  el.innerHTML = `<div class="sim-head"><b>原子的殼層電子排列</b><span>拖動原子序 Z（或點下方週期表），看電子如何依 K、L、M、N 殼層填入。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 384" role="img" aria-label="殼層電子排列示意圖"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>原子序 Z</span><input type="range" min="1" max="20" step="1" value="${st.Z}"><output></output></label>
    <div class="ops"><button type="button" data-d="-1">◀ 前一個</button><button type="button" data-d="1">下一個 ▶</button></div>
    <div class="facts">
      <div class="fact"><span>元素</span><b data-f="el"></b></div>
      <div class="fact"><span>電子排列（K, L, M, N）</span><b data-f="cfg"></b></div>
      <div class="fact"><span>價電子（最外層電子）</span><b data-f="val"></b></div>
      <div class="fact"><span>週期／族</span><b data-f="pg"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>常見同位素：質子數／中子數／質量數</span><b data-f="nuc"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg');
  const rng = el.querySelector('input');
  const f = (k) => el.querySelector(`[data-f="${k}"]`);
  const CX = 180, CY = 122, R = [34, 56, 78, 100];
  // 簡化週期表：第 1–4 週期，第 1、2、13–18 族
  const COLS = [1, 2, 13, 14, 15, 16, 17, 18];
  const pos = (Z) => { const sh = shells(Z); return { p: sh.length, g: groupOf(Z, sh) }; };
  function draw() {
    const Z = st.Z, sh = shells(Z), [sym, name, A] = E[Z];
    const g = groupOf(Z, sh), v = sh[sh.length - 1], noble = g === 18;
    let s = '';
    sh.forEach((n, i) => {
      const r = R[i];
      s += `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="var(--line)" stroke-width="1.5"/>`;
      s += `<text x="${CX + r * 0.71 + 3}" y="${CY - r * 0.71 - 3}" font-size="12" font-weight="700" fill="var(--ink-2)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">${SH[i]}</text>`;
      const outer = i === sh.length - 1;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / n + (n === 2 ? 0 : i * 0.3);
        s += `<circle cx="${(CX + r * Math.cos(a)).toFixed(1)}" cy="${(CY + r * Math.sin(a)).toFixed(1)}" r="5" fill="${outer && !noble ? 'var(--red)' : 'var(--c-P)'}" stroke="var(--card)" stroke-width="1"/>`;
      }
    });
    s += `<circle cx="${CX}" cy="${CY}" r="18" fill="var(--sun)" stroke="var(--c-E)" stroke-width="1"/>`;
    s += `<text x="${CX}" y="${CY + 4}" font-size="12" text-anchor="middle" fill="var(--ink)" font-weight="700">+${Z}</text>`;
    s += `<text x="10" y="18" font-size="13" fill="var(--ink)" font-weight="700">${sym}（${name}）Z = ${Z}</text>`;
    s += `<text x="10" y="238" font-size="11" fill="var(--ink-2)"><tspan fill="var(--red)">●</tspan> 價電子　<tspan fill="var(--c-P)">●</tspan> 內層電子（示意圖，殼層代表能量層級）</text>`;
    // mini periodic table
    const X0 = 20, Y0 = 254, CW = 40, CH = 30;
    COLS.forEach((c, j) => { s += `<text x="${X0 + j * CW + CW / 2}" y="${Y0 - 4}" font-size="9" text-anchor="middle" fill="var(--mute)">${c}</text>`; });
    for (let z = 1; z <= 20; z++) {
      const q = pos(z), j = q.p === 1 && z === 2 ? 7 : COLS.indexOf(q.g);
      const x = X0 + j * CW, y = Y0 + (q.p - 1) * CH, on = z === Z;
      s += `<g data-z="${z}" style="cursor:pointer"><rect x="${x + 1}" y="${y + 1}" width="${CW - 2}" height="${CH - 2}" rx="4" fill="${on ? 'var(--teal)' : 'var(--card)'}" stroke="${on ? 'var(--teal)' : 'var(--line)'}"/>`;
      s += `<text x="${x + 4}" y="${y + 11}" font-size="8" fill="${on ? '#fff' : 'var(--mute)'}">${z}</text>`;
      s += `<text x="${x + CW / 2}" y="${y + 22}" font-size="12" text-anchor="middle" fill="${on ? '#fff' : 'var(--ink)'}" font-weight="700">${E[z][0]}</text></g>`;
    }
    for (let p = 1; p <= 4; p++) s += `<text x="${X0 - 6}" y="${Y0 + (p - 1) * CH + 19}" font-size="9" text-anchor="end" fill="var(--mute)">${p}</text>`;
    svg.innerHTML = s;
    rng.value = Z;
    rng.nextElementSibling.textContent = Z;
    f('el').textContent = `${sym}　${name}`;
    f('cfg').textContent = sh.join(', ');
    f('val').textContent = noble ? `最外層 ${v}（穩定，不易鍵結）` : `${v} 個`;
    f('pg').textContent = `第 ${sh.length} 週期，第 ${g} 族`;
    f('nuc').textContent = `${Z} ／ ${A - Z} ／ ${A}（${sup(A)}${sym}）`;
    f('note').textContent = Z >= 19
      ? `M 層填到 8 個（Ar）後，第 19、20 個電子先填入 N 層，所以是 ${sh.join(',')}，不是 2,8,${Z - 10}。殼層數 ${sh.length} → 第 ${sh.length} 週期。`
      : noble
        ? `${sym} 的最外層已填滿（${v} 個），屬第 18 族，化學性質不活潑。`
        : `殼層數 ${sh.length} → 第 ${sh.length} 週期；最外層 ${v} 個電子 → 第 ${g} 族（族號個位數＝價電子數）。`;
  }
  rng.addEventListener('input', () => { st.Z = Number(rng.value); draw(); });
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { st.Z = Math.min(20, Math.max(1, st.Z + Number(b.dataset.d))); draw(); }));
  svg.addEventListener('click', (e) => { const g = e.target.closest('[data-z]'); if (g) { st.Z = Number(g.dataset.z); draw(); } });
  draw();
};

/* bohr */
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

/* bondtype */
(window.SIMS = window.SIMS || {}).bondtype = function (el, opt) {
  const EN = { H: 2.20, Li: 0.98, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.90, P: 2.19, S: 2.58, Cl: 3.16, K: 0.82, Ca: 1.00, Br: 2.96, I: 2.66 };
  const ZH = { H: '氫', Li: '鋰', C: '碳', N: '氮', O: '氧', F: '氟', Na: '鈉', Mg: '鎂', Al: '鋁', Si: '矽', P: '磷', S: '硫', Cl: '氯', K: '鉀', Ca: '鈣', Br: '溴', I: '碘' };
  const PRE = [['H', 'H'], ['C', 'H'], ['H', 'Cl'], ['H', 'F'], ['Al', 'Cl'], ['Na', 'Cl'], ['K', 'F']];
  const st = { a: 'H', b: 'Cl' };
  const uid = 'b' + Math.random().toString(36).slice(2, 8);
  const opts = Object.keys(EN).map((k) => `<option value="${k}">${k} ${ZH[k]}（${EN[k].toFixed(2)}）</option>`).join('');
  el.innerHTML = `<div class="sim-head"><b>電負度差與鍵型</b><span>選兩個元素，看電負度差 Δχ 落在哪一段，以及鍵結電子偏向哪一邊。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 270" role="img" aria-label="鍵結電子分布與電負度差尺"></svg></div>
  <div class="sim-ctl">
    <label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span>原子 A</span><select data-s="a">${opts}</select></label>
    <label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span>原子 B</span><select data-s="b">${opts}</select></label>
    <div class="ops">${PRE.map(([a, b]) => `<button type="button" data-a="${a}" data-b="${b}">${a}–${b}</button>`).join('')}</div>
    <div class="facts">
      <div class="fact"><span>電負度 χ</span><b data-f="x"></b></div>
      <div class="fact"><span>電負度差 Δχ</span><b data-f="d"></b></div>
      <div class="fact"><span>鍵型（概略判斷）</span><b data-f="t"></b></div>
      <div class="fact"><span>鍵結電子偏向</span><b data-f="s"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg');
  const f = (k) => el.querySelector(`[data-f="${k}"]`);
  const sa = el.querySelector('[data-s="a"]'), sb = el.querySelector('[data-s="b"]');
  const DMAX = 3.3, L = 30, R = 390, SY = 214;
  const sx = (d) => L + (d / DMAX) * (R - L);
  function draw() {
    const xa = EN[st.a], xb = EN[st.b], d = Math.abs(xa - xb), same = st.a === st.b;
    const type = d < 0.4 ? '非極性共價鍵' : d <= 1.7 ? '極性共價鍵' : '以離子鍵為主';
    const ion = 1 - Math.exp(-d * d / 4); // 偏移程度（示意）
    const neg = xa > xb ? 'a' : 'b'; // 電負度較大者
    const AX = 130, BX = 290, CY = 92;
    const share = 0.5 + 0.5 * ion; // 電子對靠近電負度大者的比例
    const ex = Math.min(Math.max(neg === 'a' ? BX + (AX - BX) * share : AX + (BX - AX) * share, AX + 32), BX - 32);
    let s = `<defs><radialGradient id="${uid}g"><stop offset="0" stop-color="var(--c-P)" stop-opacity=".55"/><stop offset="1" stop-color="var(--c-P)" stop-opacity="0"/></radialGradient></defs>`;
    const wa = neg === 'a' ? share : 1 - share, wb = 1 - wa;
    s += `<ellipse cx="${AX}" cy="${CY}" rx="${46 + 26 * wa}" ry="${40 + 22 * wa}" fill="url(#${uid}g)" opacity="${0.35 + wa}"/>`;
    s += `<ellipse cx="${BX}" cy="${CY}" rx="${46 + 26 * wb}" ry="${40 + 22 * wb}" fill="url(#${uid}g)" opacity="${0.35 + wb}"/>`;
    s += `<ellipse cx="${ex}" cy="${CY}" rx="${40 - 12 * ion}" ry="${30 - 6 * ion}" fill="url(#${uid}g)"/>`;
    [[AX, st.a, xa], [BX, st.b, xb]].forEach(([x, e, c], i) => {
      s += `<circle cx="${x}" cy="${CY}" r="24" fill="var(--card)" stroke="var(--ink-2)" stroke-width="1.5"/><text x="${x}" y="${CY + 6}" font-size="17" font-weight="700" text-anchor="middle" fill="var(--ink)">${e}</text>`;
      s += `<text x="${x}" y="${CY + 64}" font-size="13" text-anchor="middle" fill="var(--ink-2)">χ = ${c.toFixed(2)}</text>`;
      const isNeg = (i === 0) === (neg === 'a');
      const lab = same || d < 0.05 ? '' : d > 1.7 ? (isNeg ? '陰離子（−）' : '陽離子（+）') : isNeg ? 'δ−' : 'δ+';
      if (lab) s += `<text x="${x}" y="${CY - 40}" font-size="${d > 1.7 ? 12 : 16}" font-weight="700" text-anchor="middle" fill="${isNeg ? 'var(--c-P)' : 'var(--red)'}">${lab}</text>`;
    });
    s += `<circle cx="${ex - 5}" cy="${CY}" r="4" fill="var(--c-P)"/><circle cx="${ex + 5}" cy="${CY}" r="4" fill="var(--c-P)"/>`;
    s += `<text x="10" y="18" font-size="12" fill="var(--mute)">藍色雲：鍵結電子出現的區域（示意）；兩點：鍵結電子對</text>`;
    // scale
    const seg = [[0, 0.4, 'var(--c-B)', '非極性'], [0.4, 1.7, 'var(--sun)', '極性共價鍵'], [1.7, DMAX, 'var(--c-C)', '離子性為主']];
    seg.forEach(([a, b, c, n]) => { s += `<rect x="${sx(a)}" y="${SY - 14}" width="${sx(b) - sx(a)}" height="14" fill="${c}" opacity=".55"/><text x="${(sx(a) + sx(b)) / 2}" y="${SY - 30}" font-size="12" text-anchor="middle" fill="var(--ink-2)">${n}</text>`; });
    for (let v = 0; v <= 3; v += 0.5) s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${SY}" y2="${SY + 4}" stroke="var(--ink-2)"/><text x="${sx(v)}" y="${SY + 15}" font-size="11" text-anchor="middle" fill="var(--mute)">${v.toFixed(1)}</text>`;
    [0.4, 1.7].forEach((v) => { s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${SY - 18}" y2="${SY + 4}" stroke="var(--ink)" stroke-dasharray="3 2"/>`; });
    s += `<path d="M${sx(d)} ${SY - 16} l-6 -10 h12 z" fill="var(--ink)"/><text x="${Math.min(Math.max(sx(d), L + 30), R - 30)}" y="${SY + 32}" font-size="14" font-weight="700" text-anchor="middle" fill="var(--ink)">Δχ = ${d.toFixed(2)}</text>`;
    s += `<text x="${R}" y="${SY + 50}" font-size="11" text-anchor="end" fill="var(--mute)">界線 0.4、1.7 為概略值，鍵型連續變化</text>`;
    svg.innerHTML = s;
    sa.value = st.a; sb.value = st.b;
    el.querySelectorAll('[data-a]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.a === st.a && b.dataset.b === st.b)));
    f('x').textContent = `${st.a} ${xa.toFixed(2)}、${st.b} ${xb.toFixed(2)}`;
    f('d').textContent = `|${xa.toFixed(2)} − ${xb.toFixed(2)}| = ${d.toFixed(2)}`;
    f('t').textContent = type;
    f('s').textContent = d === 0 ? '均等共用' : d < 0.05 ? '近乎均等共用' : `${neg === 'a' ? st.a : st.b}（電負度較大）`;
    const pair = [st.a, st.b].sort().join('');
    f('note').textContent = pair === 'AlCl' ? 'AlCl₃ 的 Δχ = 1.55 雖接近 1.7，但約 180 °C 即昇華、以 Al₂Cl₆ 分子存在，性質偏向分子化合物：界線只是經驗值。'
      : pair === 'FH' ? 'H–F 的 Δχ = 1.78 略大於 1.7，但 HF 是分子化合物，H–F 為極性很大的共價鍵：0.4、1.7 只是概略界線，仍須配合物質性質判斷。'
      : pair === 'CS' || pair === 'HP' ? '兩者電負度幾乎相同，鍵近似非極性；「金屬＋非金屬＝離子鍵」只是初步判斷，仍以 Δχ 與性質為準。'
        : d > 1.7 ? '電負度差很大，電子幾乎完全轉移到電負度大的原子，形成陰、陽離子，以離子鍵為主。'
          : d >= 0.4 ? '電子對偏向電負度大的原子，兩端帶部分電荷 δ+、δ−，為極性共價鍵；Δχ 愈大，鍵的極性愈大。'
            : '電負度差很小，電子對（近乎）均等共用，為非極性共價鍵。';
  }
  sa.addEventListener('change', () => { st.a = sa.value; draw(); });
  sb.addEventListener('change', () => { st.b = sb.value; draw(); });
  el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { st.a = b.dataset.a; st.b = b.dataset.b; draw(); }));
  draw();
};

/* cell */
(window.SIMS = window.SIMS || {}).cell = function (el, opt) {
  const MET = {
    Mg: { E: -2.37, z: 2, M: 24.3, sol: 'MgSO₄', tint: 'var(--card)' },
    Zn: { E: -0.76, z: 2, M: 65.4, sol: 'ZnSO₄', tint: 'var(--card)' },
    Fe: { E: -0.44, z: 2, M: 55.8, sol: 'FeSO₄', tint: 'var(--green)' },
    Pb: { E: -0.13, z: 2, M: 207.2, sol: 'Pb(NO₃)₂', tint: 'var(--card)' },
    Cu: { E: 0.34, z: 2, M: 63.5, sol: 'CuSO₄', tint: 'var(--c-P)' },
    Ag: { E: 0.80, z: 1, M: 107.9, sol: 'AgNO₃', tint: 'var(--card)' },
  };
  const ion = (m) => m + (MET[m].z === 1 ? '⁺' : '²⁺');
  const st = { L: 'Zn', R: 'Cu', t: 0, run: !matchMedia('(prefers-reduced-motion: reduce)').matches };
  const btns = (side) => Object.keys(MET).map((m) => `<button type="button" data-s="${side}" data-m="${m}">${m}</button>`).join('');
  el.innerHTML = `<div class="sim-head"><b>化學電池（伽凡尼電池）</b><span>為左、右兩杯各選一種金屬，看哪一極是負極（陽極）、電子與鹽橋離子怎麼流動，以及電池電壓。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="鹽橋電池裝置"></svg></div>
  <div class="sim-ctl">
    <div class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span>左杯</span><div class="ops">${btns('L')}</div></div>
    <div class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span>右杯</span><div class="ops">${btns('R')}</div></div>
    <div class="ops"><button type="button" data-a="run"></button></div>
    <div class="facts">
      <div class="fact" style="grid-column:1/-1"><span>E°電池 = E°正極 − E°負極</span><b data-f="E"></b></div>
      <div class="fact"><span>負極（陽極）：氧化</span><b data-f="an"></b></div><div class="fact"><span>正極（陰極）：還原</span><b data-f="ca"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>全反應</span><b data-f="all"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>電極質量變化</span><b data-f="mass" style="font-size:.9rem"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), f = (k) => el.querySelector(`[data-f="${k}"]`);
  // static scene + moving layer
  svg.innerHTML = '<g data-g="s"></g><g data-g="m"></g>';
  const gS = svg.querySelector('[data-g="s"]'), gM = svg.querySelector('[data-g="m"]');
  const LX = 68, RX = 352; // electrode centres
  const wire = [[LX, 112], [LX, 44], [RX, 44], [RX, 112]];
  const bridge = [[132, 210], [132, 138], [288, 138], [288, 210]];
  const along = (pts, u) => {
    const seg = []; let tot = 0;
    for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(d); tot += d; }
    let s = u * tot;
    for (let i = 0; i < seg.length; i++) { if (s <= seg[i]) { const k = s / seg[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; } s -= seg[i]; }
    return pts[pts.length - 1];
  };
  const info = () => {
    const same = st.L === st.R, anL = MET[st.L].E < MET[st.R].E;
    return { same, an: anL ? st.L : st.R, ca: anL ? st.R : st.L, anSide: anL ? 'L' : 'R' };
  };
  function scene() {
    const I = info();
    let s = '';
    s += `<path d="M${wire.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="var(--ink-2)" stroke-width="2.5"/>`;
    s += `<circle cx="210" cy="44" r="17" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/><text x="210" y="49" font-size="14" font-weight="700" text-anchor="middle" fill="var(--ink)">V</text>`;
    s += `<text x="210" y="20" font-size="12" text-anchor="middle" fill="var(--ink)" font-weight="700">${I.same ? '0.00 V' : (MET[I.ca].E - MET[I.an].E).toFixed(2) + ' V'}</text>`;
    s += `<path d="M${bridge.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="var(--sun)" stroke-width="18" stroke-linejoin="round" opacity=".55"/><text x="210" y="122" font-size="11" text-anchor="middle" fill="var(--ink-2)">鹽橋（KNO₃）</text>`;
    [['L', 30, LX], ['R', 270, RX]].forEach(([side, x, ex]) => {
      const m = st[side], isAn = !I.same && I.anSide === side;
      s += `<rect x="${x + 2}" y="176" width="116" height="92" fill="${MET[m].tint}" opacity="${MET[m].tint === 'var(--card)' ? 0.9 : 0.25}"/>`;
      s += `<path d="M${x} 150 V270 H${x + 120} V150" fill="none" stroke="var(--ink-2)" stroke-width="2"/><line x1="${x}" x2="${x + 120}" y1="176" y2="176" stroke="var(--c-P)" opacity=".4"/>`;
      s += `<rect x="${ex - 9}" y="112" width="18" height="130" rx="2" fill="${m === 'Cu' ? 'var(--c-C)' : m === 'Ag' ? 'var(--line)' : m === 'Pb' ? 'var(--ink-2)' : 'var(--mute)'}" stroke="var(--ink)"/>`;
      s += `<text x="${ex}" y="232" font-size="12" font-weight="700" text-anchor="middle" fill="var(--ink)" stroke="var(--card)" stroke-width="3" paint-order="stroke">${m}</text>`;
      s += `<text x="${x + 60}" y="286" font-size="11" text-anchor="middle" fill="var(--ink-2)">${MET[m].sol}(aq)</text>`;
      if (!I.same) s += `<text x="${ex + (side === 'L' ? 14 : -14)}" y="104" font-size="11" font-weight="700" text-anchor="${side === 'L' ? 'start' : 'end'}" fill="${isAn ? 'var(--red)' : 'var(--c-P)'}">${isAn ? '負極（陽極）' : '正極（陰極）'}</text>`;
      if (!I.same) s += `<text x="${ex + (side === 'L' ? 14 : -14)}" y="90" font-size="10" text-anchor="${side === 'L' ? 'start' : 'end'}" fill="var(--ink-2)">${isAn ? '質量減少' : '質量增加'}</text>`;
    });
    if (!I.same) {
      const dir = I.anSide === 'L' ? 1 : -1;
      [-1, 1].forEach((k) => { const x0 = 210 + 70 * k - 12 * dir; s += `<path d="M${x0} 34 h${24 * dir}" stroke="var(--c-P)" stroke-width="2"/><path d="M${x0 + 24 * dir} 34 l${-7 * dir} -4 v8 z" fill="var(--c-P)"/><text x="${x0 + 12 * dir}" y="28" font-size="11" text-anchor="middle" fill="var(--c-P)">e⁻</text>`; });
    }
    gS.innerHTML = s;
  }
  function moving() {
    const I = info();
    if (I.same) { gM.innerHTML = ''; return; }
    let s = '';
    const fw = I.anSide === 'L';
    for (let i = 0; i < 8; i++) { const u = (st.t * 0.25 + i / 8) % 1, [x, y] = along(wire, fw ? u : 1 - u); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--c-P)"/>`; }
    // anions move toward the anode beaker, K+ toward the cathode beaker (half-way each)
    for (let i = 0; i < 4; i++) {
      const u = (st.t * 0.12 + i / 4) % 1;
      const toAn = fw ? 0.5 - u * 0.5 : 0.5 + u * 0.5, toCa = fw ? 0.5 + u * 0.5 : 0.5 - u * 0.5;
      const [ax, ay] = along(bridge, toAn), [kx, ky] = along(bridge, toCa);
      s += `<text x="${ax.toFixed(1)}" y="${(ay + 4).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--c-X)" font-weight="700">NO₃⁻</text><text x="${kx.toFixed(1)}" y="${(ky + 4).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--red)" font-weight="700">K⁺</text>`;
    }
    gM.innerHTML = s;
  }
  function draw() {
    const I = info();
    scene(); moving();
    el.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', String(st[b.dataset.s] === b.dataset.m)));
    const runB = el.querySelector('[data-a="run"]'); runB.textContent = st.run ? '暫停動畫' : '播放動畫'; runB.setAttribute('aria-pressed', String(st.run));
    if (I.same) {
      ['an', 'ca', 'all'].forEach((k) => { f(k).textContent = '—'; });
      f('E').textContent = '0.00 V（兩極相同，無電流）'; f('mass').textContent = '不變';
      f('note').textContent = '兩杯用同一種金屬時沒有電位差，不會產生電流；化學電池須以活性不同的兩種金屬（或電極）組成。';
      return;
    }
    const A = MET[I.an], Cc = MET[I.ca], n = A.z === Cc.z ? A.z : A.z * Cc.z, a = n / A.z, c = n / Cc.z;
    const co = (k, s) => (k === 1 ? '' : k) + s;
    const sg = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);
    f('E').textContent = `(${sg(Cc.E)}) − (${sg(A.E)}) = ${(Cc.E - A.E).toFixed(2)} V`;
    f('an').textContent = `${I.an} → ${ion(I.an)} + ${co(A.z, 'e⁻')}`;
    f('ca').textContent = `${ion(I.ca)} + ${co(Cc.z, 'e⁻')} → ${I.ca}`;
    f('all').textContent = `${co(a, I.an)} + ${co(c, ion(I.ca))} → ${co(a, ion(I.an))} + ${co(c, I.ca)}（轉移 ${n} mol e⁻）`;
    f('mass').textContent = `每轉移 ${n} mol e⁻：${I.an} 極減少 ${(a * A.M).toFixed(1)} g，${I.ca} 極增加 ${(c * Cc.M).toFixed(1)} g`;
    f('note').textContent = `活性較大的 ${I.an}（E° 較小）失去電子為負極；電子經導線流向 ${I.ca}，不經過溶液與鹽橋。鹽橋中 NO₃⁻ 移向負極杯、K⁺ 移向正極杯，維持兩杯電中性。`;
  }
  el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { st[b.dataset.s] = b.dataset.m; draw(); }));
  let last = 0;
  function frame(now) {
    if (!el.isConnected || !st.run) return;
    if (last) st.t += Math.min(0.05, (now - last) / 1000);
    last = now; moving(); requestAnimationFrame(frame);
  }
  el.querySelector('[data-a="run"]').addEventListener('click', () => { st.run = !st.run; draw(); if (st.run) { last = 0; requestAnimationFrame(frame); } });
  draw();
  if (st.run) requestAnimationFrame(frame);
};

/* celldiv */
(window.SIMS = window.SIMS || {}).celldiv = function (el, opt) {
  const P = 'var(--c-P)', M = 'var(--c-C)';
  // [代號, 名稱, 染色體數, 染色分體數, DNA 起, DNA 迄, 同源染色體, 套數, 說明]
  const IP = [['G1', 'G1 期', 4, 0, 2, 2, '2 對', '2n', 'G1 期：細胞生長、合成蛋白質與胞器；染色體以細長的染色質存在。'],
    ['S', 'S 期', 4, '0→8', 2, 4, '2 對', '2n', 'S 期：DNA 複製，DNA 含量 2C→4C；著絲點數不變，染色體數仍為 4。'],
    ['G2', 'G2 期', 4, 8, 4, 4, '2 對', '2n', 'G2 期：繼續生長、合成分裂所需蛋白質；中心體已複製為兩組。']];
  const ST = {
    mitosis: IP.concat([['前', '前期', 4, 8, 4, 4, '2 對', '2n', '前期：染色質濃縮成染色體（各含兩條姊妹染色分體）；核膜、核仁消失，紡錘體形成。'],
      ['中', '中期', 4, 8, 4, 4, '2 對', '2n', '中期：著絲點排列在赤道板上，染色體最濃縮，最適合計數與製作核型。'],
      ['後', '後期', 8, 0, 4, 4, '4 對', '4n', '後期：著絲點分開，姊妹染色分體分離移向兩極，染色體數暫時加倍（8 條），DNA 仍為 4C。'],
      ['末', '末期', 4, 0, 2, 2, '2 對', '2n', '末期＋胞質分裂：核膜、核仁重現，形成兩個子細胞，各 4 條染色體、2C，與母細胞相同。']]),
    meiosis: IP.concat([['前I', '前期 I', 4, 8, 4, 4, '2 對（聯會）', '2n', '前期 I：同源染色體配對（聯會）成 2 個四分體；非姊妹染色分體可互換（末端換色處）。'],
      ['中I', '中期 I', 4, 8, 4, 4, '2 對（成對排列）', '2n', '中期 I：四分體排在赤道板兩側；每對同源染色體朝向哪一極彼此獨立（按「另一種排列」）。'],
      ['後I', '後期 I', 4, 8, 4, 4, '正在分離', '2n', '後期 I：同源染色體分離移向兩極；著絲點不分開，每條仍含兩條染色分體。'],
      ['末I', '末期 I', 2, 4, 2, 2, '無', 'n', '末期 I：形成 2 個子細胞，各 2 條染色體（每條含兩條染色分體），染色體數已減半。'],
      ['前II', '前期 II', 2, 4, 2, 2, '無', 'n', '前期 II：染色體再度濃縮，紡錘體形成；細胞內已無同源染色體。兩次分裂之間不再複製 DNA。'],
      ['中II', '中期 II', 2, 4, 2, 2, '無', 'n', '中期 II：2 條染色體的著絲點排成單列於赤道板上。'],
      ['後II', '後期 II', 4, 0, 2, 2, '無', 'n（兩極各一套）', '後期 II：著絲點分開、姊妹染色分體分離，染色體數暫為 4 條，但沒有同源染色體，不是二倍體。'],
      ['末II', '末期 II', 2, 0, 1, 1, '無', 'n', '末期 II：共得 4 個子細胞，各 2 條染色體、1C；因互換與獨立分配，4 個細胞的組成各不相同。']])
  };
  let mode = opt.mode === 'meiosis' ? 'meiosis' : 'mitosis', i = 0, flip = false;
  el.innerHTML = `<style>.sim[data-sim="celldiv"] .chips button{padding:2px 9px;font-size:.8rem}</style>
  <div class="sim-head"><b>細胞分裂各期的染色體變化</b><span>按「下一期」逐步觀察 2n = 4 的細胞（藍：父方；橙：母方），對照下方數量圖。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg data-c viewBox="0 0 360 170" role="img" aria-label="細胞圖"></svg><svg data-g viewBox="0 0 360 150" role="img" aria-label="DNA 含量與染色體數"></svg></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-m="mitosis">有絲分裂</button><button type="button" data-m="meiosis">減數分裂</button></div>
    <div class="ops"><button type="button" data-step="-1">◀ 上一期</button><button type="button" data-step="1">下一期 ▶</button><button type="button" data-flip>另一種排列</button></div>
    <div class="ops chips" data-chips></div>
    <div class="facts">${['時期', '染色體數', '染色分體數', 'DNA 含量（每個細胞）', '同源染色體', '染色體套數'].map((t, k) => `<div class="fact"><span>${t}</span><b data-f="${k}"></b></div>`).join('')}</div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), cs = q('[data-c]'), gs = q('[data-g]');
  const chrs = () => {
    const x = mode === 'meiosis' && i >= 3;
    return [{ L: 24, ct: [{ c: P }, { c: P, t: x && M }] }, { L: 24, ct: [{ c: M, t: x && P }, { c: M }] }, { L: 14, ct: [{ c: P }, { c: P }] }, { L: 14, ct: [{ c: M }, { c: M }] }];
  };
  function ctd(x, y, L, o, w = 4.5) {
    let h = `<line x1="${x}" y1="${y - L / 2}" x2="${x}" y2="${y + L / 2}" stroke="${o.c}" stroke-width="${w}" stroke-linecap="round"/>`;
    if (o.t) h += `<line x1="${x}" y1="${y + L * 0.2}" x2="${x}" y2="${y + L / 2}" stroke="${o.t}" stroke-width="${w}" stroke-linecap="round"/>`;
    return h;
  }
  const chr = (x, y, c, which) => (which == null ? ctd(x - 2.8, y, c.L, c.ct[0]) + ctd(x + 2.8, y, c.L, c.ct[1]) : ctd(x, y, c.L, c.ct[which])) + `<circle cx="${x}" cy="${y}" r="2.4" fill="var(--ink)"/>`;
  const cell = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="var(--card)" stroke="var(--ink-2)" stroke-width="1.5"/>`;
  const cen = (x, y) => `<path d="M${x - 4},${y}h8M${x},${y - 4}v8" stroke="var(--c-X)" stroke-width="2.4"/>`;
  const spin = (px, y, pts) => cen(px, y) + pts.map(([x, yy]) => `<line x1="${px}" y1="${y}" x2="${x}" y2="${yy}" stroke="var(--mute)" stroke-width="0.9"/>`).join('');
  const nuc = (x, y, r, dash) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="var(--mute)" stroke-width="1.2" ${dash ? 'stroke-dasharray="4 4"' : ''}/>`;
  const stack = (x, cy, list, gap = 7) => { const tot = list.reduce((s, c) => s + c.L, 0) + gap * (list.length - 1); let y = cy - tot / 2; return list.map((c) => { const yy = y + c.L / 2; y += c.L + gap; return [x, yy, c]; }); };
  function squig(x, y, c, n) { let d = `M${x},${y}`; for (let k = 0; k < n; k++) d += ` q4,-6 8,0 t8,0`; return `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.6"/>`; }
  function drawCell() {
    const C = chrs(), cy = 85, code = ST[mode][i][0];
    let h = '';
    if (['G1', 'S', 'G2'].includes(code)) {
      h += cell(180, cy, 110, 70) + `<circle cx="180" cy="${cy}" r="42" fill="var(--bg)" stroke="var(--mute)" stroke-width="1.2"/>`;
      [[P, 2], [M, 2], [P, 1], [M, 1]].forEach(([c, n], k) => {
        const x = 152 + (k % 2) * 8, y = cy - 22 + k * 13;
        h += squig(x, y, c, n + 1);
        if (code === 'G2' || (code === 'S' && k < 2)) h += `<g opacity="${code === 'S' ? 0.55 : 1}">${squig(x + 4, y + 5, c, n + 1)}</g>`;
      });
      h += code === 'G1' ? cen(180, cy - 54) : cen(170, cy - 54) + cen(190, cy - 54);
      if (code === 'S') h += `<text x="180" y="${cy + 62}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">DNA 複製中</text>`;
    } else if (code === '前') {
      h += cell(180, cy, 110, 70) + nuc(180, cy, 46, true) + cen(105, cy - 30) + cen(255, cy - 30);
      [[160, cy - 16, 0], [196, cy - 18, 1], [168, cy + 22, 2], [202, cy + 18, 3]].forEach(([x, y, k]) => { h += chr(x, y, C[k]); });
    } else if (code === '中') {
      const pts = stack(180, cy, [C[0], C[2], C[1], C[3]]);
      h += cell(180, cy, 110, 70) + spin(80, cy, pts.map((p) => [p[0] - 3, p[1]])) + spin(280, cy, pts.map((p) => [p[0] + 3, p[1]]));
      h += `<line x1="180" y1="${cy - 66}" x2="180" y2="${cy + 66}" stroke="var(--sun)" stroke-width="2" stroke-dasharray="4 4"/>`;
      pts.forEach(([x, y, c]) => { h += chr(x, y, c); });
    } else if (code === '後') {
      const L = stack(130, cy, [C[0], C[2], C[1], C[3]], 8), R = stack(230, cy, [C[0], C[2], C[1], C[3]], 8);
      h += `<ellipse cx="180" cy="${cy}" rx="128" ry="62" fill="var(--card)" stroke="var(--ink-2)" stroke-width="1.5"/>` + spin(62, cy, L) + spin(298, cy, R);
      L.forEach(([x, y, c]) => { h += chr(x, y, c, 0); }); R.forEach(([x, y, c]) => { h += chr(x, y, c, 1); });
    } else if (code === '末') {
      [95, 265].forEach((x, s) => { h += cell(x, cy, 78, 62) + nuc(x, cy, 34); stack(x - 12, cy, [C[0], C[1]], 6).concat(stack(x + 12, cy, [C[2], C[3]], 6)).forEach(([xx, y, c]) => { h += chr(xx, y, c, s); }); });
    } else {
      const left = flip ? [C[0], C[3]] : [C[0], C[2]], right = flip ? [C[1], C[2]] : [C[1], C[3]];
      if (code === '前I') {
        h += cell(180, cy, 110, 70) + nuc(180, cy, 46, true) + cen(105, cy - 30) + cen(255, cy - 30);
        h += chr(156, cy, C[0]) + chr(168, cy, C[1]) + chr(194, cy + 2, C[2]) + chr(206, cy + 2, C[3]);
      } else if (code === '中I' || code === '後I') {
        const dx = code === '中I' ? 7 : 52, Lp = stack(180 - dx, cy, left, 22), Rp = stack(180 + dx, cy, right, 22);
        h += cell(180, cy, code === '中I' ? 110 : 128, code === '中I' ? 70 : 62) + spin(code === '中I' ? 80 : 62, cy, Lp) + spin(code === '中I' ? 280 : 298, cy, Rp);
        if (code === '中I') h += `<line x1="180" y1="${cy - 66}" x2="180" y2="${cy + 66}" stroke="var(--sun)" stroke-width="2" stroke-dasharray="4 4"/>`;
        Lp.concat(Rp).forEach(([x, y, c]) => { h += chr(x, y, c); });
      } else if (code === '末II') {
        [left, right].forEach((set, s) => [0, 1].forEach((w) => { const x = 47 + (s * 2 + w) * 89; h += cell(x, cy, 40, 52); stack(x, cy, set, 8).forEach(([xx, y, c]) => { h += chr(xx, y, c, w); }); }));
      } else {
        [left, right].forEach((set, s) => {
          const x = s ? 265 : 95;
          if (code === '後II') {
            h += `<ellipse cx="${x}" cy="${cy}" rx="82" ry="56" fill="var(--card)" stroke="var(--ink-2)" stroke-width="1.5"/>`;
            const A = stack(x - 34, cy, set, 8), B = stack(x + 34, cy, set, 8);
            h += spin(x - 72, cy, A) + spin(x + 72, cy, B); A.forEach(([xx, y, c]) => { h += chr(xx, y, c, 0); }); B.forEach(([xx, y, c]) => { h += chr(xx, y, c, 1); });
          } else {
            h += cell(x, cy, 78, 62);
            if (code === '末I') { h += nuc(x, cy, 32, true); stack(x, cy, set, 10).forEach(([xx, y, c]) => { h += chr(xx, y, c); }); }
            if (code === '前II') { h += cen(x - 30, cy - 40) + cen(x + 30, cy - 40); h += chr(x - 14, cy - 6, set[0]) + chr(x + 16, cy + 8, set[1]); }
            if (code === '中II') { const pts = stack(x, cy, set, 10); h += spin(x - 70, cy, pts) + spin(x + 70, cy, pts); pts.forEach(([xx, y, c]) => { h += chr(xx, y, c); }); }
          }
        });
      }
    }
    cs.innerHTML = h;
  }
  function drawGraph() {
    const S = ST[mode], n = S.length, X0 = 38, X1 = 352, Y0 = 118, Y1 = 22, w = (X1 - X0) / n, sy = (v) => Y0 - v / 8 * (Y0 - Y1);
    let h = `<rect x="${X0 + i * w}" y="${Y1 - 8}" width="${w}" height="${Y0 - Y1 + 8}" fill="var(--sun)" opacity=".4"/>`;
    [0, 2, 4, 6, 8].forEach((v) => { h += `<line x1="${X0}" x2="${X1}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)"/><text x="${X0 - 4}" y="${sy(v) + 4}" font-size="12" text-anchor="end" fill="var(--mute)">${v}</text>`; });
    let dD = '', dC = '';
    S.forEach((s, k) => {
      const x = X0 + k * w, c = s[2] + 0;
      dD += `${k ? 'L' : 'M'}${x},${sy(s[4])}L${x + w},${sy(s[5])}`;
      dC += `${k ? 'L' : 'M'}${x},${sy(c) - 3}L${x + w},${sy(c) - 3}`;
      h += `<text x="${x + w / 2}" y="${Y0 + 14}" font-size="${n > 8 ? 11 : 13}" text-anchor="middle" fill="${k === i ? 'var(--ink)' : 'var(--ink-2)'}" font-weight="${k === i ? 700 : 400}">${s[0]}</text>`;
    });
    h += `<path d="${dD}" fill="none" stroke="var(--teal)" stroke-width="2.6"/><path d="${dC}" fill="none" stroke="var(--c-X)" stroke-width="2" stroke-dasharray="5 3"/>`;
    h += `<line x1="${X0}" x2="${X0 + 18}" y1="8" y2="8" stroke="var(--teal)" stroke-width="2.6"/><text x="${X0 + 22}" y="12" font-size="12.5" fill="var(--ink)">DNA 含量（C）</text>`;
    h += `<line x1="${X0 + 130}" x2="${X0 + 148}" y1="8" y2="8" stroke="var(--c-X)" stroke-width="2" stroke-dasharray="5 3"/><text x="${X0 + 152}" y="12" font-size="12.5" fill="var(--ink)">染色體數（條）</text>`;
    h += `<text x="${X1}" y="${Y0 + 30}" font-size="11" text-anchor="end" fill="var(--mute)">每個細胞；末期以胞質分裂後計</text>`;
    gs.innerHTML = h;
  }
  function render() {
    const s = ST[mode][i];
    drawCell(); drawGraph();
    [s[1], `${s[2]} 條`, `${s[3]} 條`, s[4] === s[5] ? `${s[4]}C` : `${s[4]}C → ${s[5]}C`, s[6], s[7]].forEach((v, k) => { q(`[data-f="${k}"]`).textContent = v; });
    q('[data-note]').textContent = s[8];
    q('[data-chips]').innerHTML = ST[mode].map((t, k) => `<button type="button" data-i="${k}" aria-pressed="${k === i}">${t[1]}</button>`).join('');
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === mode));
    q('[data-flip]').style.display = mode === 'meiosis' ? '' : 'none';
    q('[data-step="-1"]').disabled = i === 0; q('[data-step="1"]').disabled = i === ST[mode].length - 1;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) { mode = b.dataset.m; i = 0; }
    if (b.dataset.step) i = Math.max(0, Math.min(ST[mode].length - 1, i + +b.dataset.step));
    if (b.dataset.i) i = +b.dataset.i;
    if (b.hasAttribute('data-flip')) { flip = !flip; if (i < 4) i = 4; }
    render();
  });
  render();
};

/* circuit */
(window.SIMS = window.SIMS || {}).circuit = function (el, opt) {
  const st = { V: 6, R1: 4, R2: 8, mode: opt.mode === 'parallel' ? 'parallel' : 'series', play: true };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) st.play = false;
  el.innerHTML = `<div class="sim-head"><b>串聯與並聯電路</b><span>切換串聯／並聯，拖動滑桿改變電壓與電阻，看各電阻的電流、電壓與功率。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 400 260" role="img" aria-label="電路圖與電流動畫"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="mode"><button type="button" data-m="series">串聯</button><button type="button" data-m="parallel">並聯</button></div>
    <label class="sl"><span>電壓 V</span><input type="range" data-k="V" min="1.5" max="12" step="0.5" value="6"><output></output></label>
    <label class="sl"><span>R₁</span><input type="range" data-k="R1" min="2" max="30" step="1" value="4"><output></output></label>
    <label class="sl"><span>R₂</span><input type="range" data-k="R2" min="2" max="30" step="1" value="8"><output></output></label>
    <div class="facts">
      <div class="fact" style="grid-column:1/-1"><span>等效電阻 R</span><b data-f="R"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>總電流 I = V / R</span><b data-f="I"></b></div>
      <div class="fact"><span>R₁：電流、電壓</span><b data-f="1"></b></div><div class="fact"><span>R₂：電流、電壓</span><b data-f="2"></b></div>
      <div class="fact"><span>功率 P₁、P₂</span><b data-f="P"></b></div><div class="fact"><span>總功率 P = IV</span><b data-f="Pt"></b></div></div>
    <div class="ops"><button type="button" data-play>暫停</button></div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), $ = (s) => el.querySelector(s);
  const f2 = (x) => (Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
  function zig(x1, y1, x2, y2) { // resistor zigzag between two points (vertical or horizontal)
    const n = 6, pts = [], dx = (x2 - x1) / n, dy = (y2 - y1) / n, hz = y1 === y2;
    for (let i = 0; i <= n; i++) { const o = i === 0 || i === n ? 0 : (i % 2 ? 9 : -9); pts.push(`${x1 + dx * i + (hz ? 0 : o)},${y1 + dy * i + (hz ? o : 0)}`); }
    const pad = hz ? `<rect x="${Math.min(x1, x2)}" y="${y1 - 11}" width="${Math.abs(x2 - x1)}" height="22" fill="var(--bg)"/>` : `<rect x="${x1 - 11}" y="${Math.min(y1, y2)}" width="22" height="${Math.abs(y2 - y1)}" fill="var(--bg)"/>`;
    return pad + `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--c-C)" stroke-width="3" stroke-linejoin="round"/>`;
  }
  let paths = [];
  function build() {
    const ser = st.mode === 'series';
    const P = ser ? [{ d: 'M50 120 L50 40 L350 40 L350 220 L50 220 L50 142', k: 'I' }]
      : [{ d: 'M50 120 L50 40 L200 40', k: 'I' }, { d: 'M200 40 L200 220', k: 'I1' }, { d: 'M200 40 L330 40 L330 220 L200 220', k: 'I2' }, { d: 'M200 220 L50 220 L50 142', k: 'I' }];
    let s = P.map((p) => `<path d="${p.d}" fill="none" stroke="var(--ink)" stroke-width="2"/>`).join('');
    s += `<rect x="30" y="118" width="40" height="28" fill="var(--bg)"/><line x1="32" y1="122" x2="68" y2="122" stroke="var(--ink)" stroke-width="3"/><line x1="41" y1="138" x2="59" y2="138" stroke="var(--ink)" stroke-width="5"/>
      <text x="74" y="120" font-size="13" fill="var(--red)">+</text><text x="74" y="146" font-size="13" fill="var(--c-P)">−</text><text data-t="V" x="58" y="184" font-size="15" fill="var(--ink)"></text>`;
    if (ser) s += zig(160, 40, 260, 40) + zig(350, 90, 350, 170) + `<text data-t="R1" x="210" y="22" font-size="15" text-anchor="middle" fill="var(--ink)"></text><text data-t="R1b" x="210" y="70" font-size="13.5" text-anchor="middle" fill="var(--teal-2)"></text>
      <text data-t="R2" x="342" y="130" font-size="15" text-anchor="end" fill="var(--ink)"></text><text data-t="R2b" x="342" y="148" font-size="13.5" text-anchor="end" fill="var(--teal-2)"></text>`;
    else s += zig(200, 90, 200, 170) + zig(330, 90, 330, 170) + `<circle cx="200" cy="40" r="4" fill="var(--ink)"/><circle cx="200" cy="220" r="4" fill="var(--ink)"/>
      <text data-t="R1" x="183" y="122" font-size="15" text-anchor="end" fill="var(--ink)"></text><text data-t="R1b" x="183" y="141" font-size="13.5" text-anchor="end" fill="var(--teal-2)"></text>
      <text data-t="R2" x="313" y="122" font-size="15" text-anchor="end" fill="var(--ink)"></text><text data-t="R2b" x="313" y="141" font-size="13.5" text-anchor="end" fill="var(--teal-2)"></text>`;
    s += `<g data-dots></g><text x="390" y="252" font-size="11" text-anchor="end" fill="var(--mute)">黃點：電流方向（正電荷流向），速率 ∝ 電流</text>`;
    svg.innerHTML = s;
    paths = P.map((p, i) => ({ el: svg.querySelectorAll('path')[i], k: p.k, off: 0 }));
    paths.forEach((p) => { p.len = p.el.getTotalLength(); });
    el.querySelectorAll('[data-g="mode"] [data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
  }
  let cur = {};
  function calc() {
    const { V, R1, R2 } = st, ser = st.mode === 'series';
    const R = ser ? R1 + R2 : (R1 * R2) / (R1 + R2), I = V / R;
    const I1 = ser ? I : V / R1, I2 = ser ? I : V / R2, V1 = I1 * R1, V2 = I2 * R2;
    cur = { I, I1, I2 };
    $('[data-k="V"] + output').textContent = V.toFixed(1) + ' V';
    $('[data-k="R1"] + output').textContent = R1 + ' Ω';
    $('[data-k="R2"] + output').textContent = R2 + ' Ω';
    $('[data-f="R"]').textContent = ser ? `R₁ + R₂ = ${R1} + ${R2} = ${R} Ω` : `R₁R₂/(R₁+R₂) = ${R1}×${R2}/${R1 + R2} = ${f2(R)} Ω`;
    $('[data-f="I"]').textContent = `${V.toFixed(1)} / ${f2(R)} = ${f2(I)} A`;
    $('[data-f="1"]').textContent = `${f2(I1)} A，${f2(V1)} V`;
    $('[data-f="2"]').textContent = `${f2(I2)} A，${f2(V2)} V`;
    $('[data-f="P"]').textContent = `${f2(I1 * V1)} W、${f2(I2 * V2)} W`;
    $('[data-f="Pt"]').textContent = `${f2(I * V)} W`;
    $('[data-f="note"]').textContent = ser ? `串聯電流處處相同，電壓依電阻比分配（V₁ : V₂ = R₁ : R₂）；電阻大的耗電多。V₁ + V₂ = ${f2(V1 + V2)} V = 電源電壓。`
      : `並聯各支路電壓相同，電流依電阻反比分配（I₁ : I₂ = R₂ : R₁）；電阻小的耗電多。I₁ + I₂ = ${f2(I1 + I2)} A = 總電流，等效電阻比任一電阻小。`;
    const t = (k, v) => { const n = svg.querySelector(`[data-t="${k}"]`); if (n) n.textContent = v; };
    t('V', `V = ${V.toFixed(1)} V`); t('R1', `R₁ = ${R1} Ω`); t('R2', `R₂ = ${R2} Ω`);
    t('R1b', `${f2(I1)} A, ${f2(V1)} V`); t('R2b', `${f2(I2)} A, ${f2(V2)} V`);
    dots(0);
  }
  function dots(dt) {
    let s = '';
    for (const p of paths) {
      const v = Math.min(300, 25 * cur[p.k]); p.off = (p.off + v * dt) % 26;
      for (let d = p.off; d < p.len; d += 26) { const q = p.el.getPointAtLength(d); s += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="3.4" fill="var(--sun)" stroke="var(--c-E)" stroke-width=".8"/>`; }
    }
    svg.querySelector('[data-dots]').innerHTML = s;
  }
  let last = 0, running = false;
  function frame(t) {
    if (!el.isConnected) { running = false; return; }
    if (!st.play) { running = false; return; }
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t; dots(dt); requestAnimationFrame(frame);
  }
  function setPlay(p) { st.play = p; $('[data-play]').textContent = p ? '暫停' : '播放'; if (p && !running) { running = true; last = 0; requestAnimationFrame(frame); } }
  el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => { st[inp.dataset.k] = Number(inp.value); calc(); }));
  $('[data-g="mode"]').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; st.mode = b.dataset.m; build(); calc(); });
  $('[data-play]').addEventListener('click', () => setPlay(!st.play));
  build(); calc(); setPlay(st.play);
};

/* coulomb */
(window.SIMS = window.SIMS || {}).coulomb = function (el, opt) {
  const K = 9.0e9, W = 440, H = 280, CY = 140, S = 500; // S: px per m
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sci = (x, d = 2) => { if (x === 0) return '0'; const e = Math.floor(Math.log10(Math.abs(x))); const m = (x / 10 ** e).toFixed(d - 1); return e === 0 ? m : `${m}×10${String(e).split('').map((c) => SUP[c]).join('')}`; };
  const st = { q1: 2, q2: -1, r: 0.3, lines: true };
  const uid = 'c' + Math.random().toString(36).slice(2, 8);
  el.innerHTML = `<div class="sim-head"><b>庫侖定律與電力線</b><span>調整兩電荷的電量與距離，看兩者受力與電力線如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="兩點電荷的受力與電力線"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>q₁</span><input type="range" data-k="q1" min="-5" max="5" step="0.5" value="2"><output></output></label>
    <label class="sl"><span>q₂</span><input type="range" data-k="q2" min="-5" max="5" step="0.5" value="-1"><output></output></label>
    <label class="sl"><span>距離 r</span><input type="range" data-k="r" min="0.1" max="0.6" step="0.01" value="0.3"><output></output></label>
    <div class="ops" data-g="pre"><button type="button" data-p="2,2">同號等量</button><button type="button" data-p="2,-2">異號等量</button><button type="button" data-p="2,-1">+2q 與 −q</button></div>
    <div class="ops"><button type="button" data-lines aria-pressed="true">顯示電力線</button></div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>F = k|q₁q₂| / r²</span><b data-f="F"></b></div>
      <div class="fact"><span>q₁ 受力</span><b data-f="f1"></b></div><div class="fact"><span>q₂ 受力</span><b data-f="f2"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>連線上合電場為零之處</span><b data-f="z"></b></div></div>
    <p class="sim-note">兩電荷電量不同時，彼此受力仍大小相等、方向相反（作用力與反作用力）；距離加倍，F 變為 1/4。電力線由正電荷出發、止於負電荷，越密處電場越強。</p>
  </div></div>`;
  const svg = el.querySelector('svg');
  function field(x, y, Q) { let ex = 0, ey = 0; for (const c of Q) { const dx = x - c.x, dy = y - c.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2); ex += (c.q * dx) / (d2 * d); ey += (c.q * dy) / (d2 * d); } return [ex, ey]; }
  function trace(c, ang, sgn, Q) {
    let x = c.x + 15 * Math.cos(ang), y = c.y + 15 * Math.sin(ang); const pts = [[x, y]]; let hit = null;
    for (let i = 0; i < 700; i++) {
      let [ex, ey] = field(x, y, Q); let m = Math.hypot(ex, ey) || 1;
      const mx = x + sgn * 1.4 * ex / m, my = y + sgn * 1.4 * ey / m;
      [ex, ey] = field(mx, my, Q); m = Math.hypot(ex, ey) || 1;
      x += sgn * 2.8 * ex / m; y += sgn * 2.8 * ey / m; pts.push([x, y]);
      const o = Q.find((d) => d !== c && Math.hypot(x - d.x, y - d.y) < 12); if (o) { hit = o; break; }
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) break;
    }
    return { pts, hit };
  }
  function arrowMid(pts, sgn) {
    const i = Math.floor(pts.length * (pts.length > 120 ? 0.25 : 0.5)), a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = (b[0] - a[0]) * sgn, dy = (b[1] - a[1]) * sgn; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; const [x, y] = pts[i];
    return `<path d="M${x + 5 * dx} ${y + 5 * dy} L${x - 4 * dx - 3.5 * dy} ${y - 4 * dy + 3.5 * dx} L${x - 4 * dx + 3.5 * dy} ${y - 4 * dy - 3.5 * dx}Z" fill="var(--ink-2)"/>`;
  }
  function draw() {
    const { q1, q2, r } = st, x1 = W / 2 - (r * S) / 2, x2 = W / 2 + (r * S) / 2;
    const Q = [{ x: x1, y: CY, q: q1 }, { x: x2, y: CY, q: q2 }].filter((c) => c.q !== 0);
    let s = '';
    if (st.lines && Q.length) {
      for (const c of Q) {
        const sgn = c.q > 0 ? 1 : -1, n = Math.max(4, Math.round(Math.abs(c.q) * 6));
        for (let k = 0; k < n; k++) {
          const t = trace(c, (2 * Math.PI * k) / n, sgn, Q);
          if (sgn < 0 && t.hit && t.hit.q > 0) continue; // already drawn from the positive charge
          const pts = sgn > 0 ? t.pts : t.pts.slice().reverse();
          s += `<polyline points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="var(--ink-2)" stroke-opacity=".55" stroke-width="1"/>`;
          s += arrowMid(pts, 1);
        }
      }
    }
    // zero-field point on the line
    const a1 = Math.sqrt(Math.abs(q1)), a2 = Math.sqrt(Math.abs(q2)); let zx = null;
    if (q1 && q2) { if (q1 * q2 > 0) zx = r * a1 / (a1 + a2); else if (a1 !== a2) zx = a1 < a2 ? -r * a1 / (a2 - a1) : r + r * a2 / (a1 - a2); }
    if (zx !== null && st.lines) { const px = x1 + zx * S; if (px > 4 && px < W - 4) s += `<circle cx="${px}" cy="${CY}" r="5" fill="var(--c-C)" stroke="var(--card)"/><text x="${px}" y="${CY + 36}" paint-order="stroke" stroke="var(--bg)" stroke-width="4" font-size="12" text-anchor="middle" fill="var(--c-C)">E = 0</text>`; }
    const F = q1 && q2 ? (K * Math.abs(q1 * q2) * 1e-12) / (r * r) : 0, rep = q1 * q2 > 0;
    if (F > 0) {
      let L = Math.min(110, Math.max(14, 30 + 26 * Math.log10(F / 0.01)));
      if (!rep) L = Math.min(L, (x2 - x1) / 2 - 16);
      const dir1 = rep ? -1 : 1;
      [[x1, dir1], [x2, -dir1]].forEach(([x, d]) => { const xs = x + d * 15, xe = xs + d * L; s += `<line x1="${xs}" y1="${CY}" x2="${xe}" y2="${CY}" stroke="var(--red)" stroke-width="3.5" marker-end="url(#${uid}a)"/>`; });
    }
    s += `<line x1="${x1}" y1="${CY + 46}" x2="${x2}" y2="${CY + 46}" stroke="var(--mute)" marker-start="url(#${uid}t)" marker-end="url(#${uid}t)"/><text x="${W / 2}" y="${CY + 62}" paint-order="stroke" stroke="var(--bg)" stroke-width="4" font-size="13" text-anchor="middle" fill="var(--ink-2)">r = ${r.toFixed(2)} m</text>`;
    [[x1, q1, 'q₁'], [x2, q2, 'q₂']].forEach(([x, q, n]) => {
      const col = q > 0 ? 'var(--red)' : q < 0 ? 'var(--c-P)' : 'var(--mute)';
      s += `<circle cx="${x}" cy="${CY}" r="13" fill="${col}" stroke="var(--card)" stroke-width="2"/><text x="${x}" y="${CY + 5}" font-size="16" font-weight="700" text-anchor="middle" fill="#fff">${q > 0 ? '+' : q < 0 ? '−' : '0'}</text>`;
      s += `<text x="${x}" y="${CY - 22}" paint-order="stroke" stroke="var(--bg)" stroke-width="4" font-size="13" text-anchor="middle" fill="var(--ink)">${n} = ${q > 0 ? '+' : q < 0 ? '−' : ''}${Math.abs(q).toFixed(1)} μC</text>`;
    });
    svg.innerHTML = `<defs><marker id="${uid}a" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="var(--red)"/></marker>
      <marker id="${uid}t" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M5 0V10" stroke="var(--mute)" stroke-width="1.5"/></marker></defs>` + s +
      (F > 0 ? `<text x="8" y="${H - 8}" font-size="11" fill="var(--mute)">紅箭頭：電力（長度以對數比例示意）</text>` : '');
    const fq = (q) => (q > 0 ? '+' : q < 0 ? '−' : '') + Math.abs(q).toFixed(1) + ' μC';
    el.querySelector('[data-k="q1"] + output').textContent = fq(q1);
    el.querySelector('[data-k="q2"] + output').textContent = fq(q2);
    el.querySelector('[data-k="r"] + output').textContent = r.toFixed(2) + ' m';
    el.querySelector('[data-f="F"]').textContent = F > 0 ? `9.0×10⁹ × ${sci(Math.abs(q1) * 1e-6)} × ${sci(Math.abs(q2) * 1e-6)} / (${r.toFixed(2)})² = ${F.toPrecision(2)} N（${rep ? '斥力' : '引力'}）` : '有一電荷為 0，F = 0';
    const d1 = F ? (rep ? '向左' : '向右') : '', d2 = F ? (rep ? '向右' : '向左') : '';
    el.querySelector('[data-f="f1"]').textContent = F ? `${F.toPrecision(2)} N，${d1}` : '0';
    el.querySelector('[data-f="f2"]').textContent = F ? `${F.toPrecision(2)} N，${d2}` : '0';
    el.querySelector('[data-f="z"]').textContent = zx === null ? (q1 && q2 ? '無（等量異號：只在無窮遠）' : '—') : `距 q₁ ${Math.abs(zx).toFixed(2)} m（${zx < 0 ? 'q₁ 左側外' : zx > r ? 'q₂ 右側外' : '兩電荷之間'}）`;
    el.querySelector('[data-lines]').setAttribute('aria-pressed', String(st.lines));
  }
  el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => { st[inp.dataset.k] = Number(inp.value); draw(); }));
  el.querySelector('[data-g="pre"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; [st.q1, st.q2] = b.dataset.p.split(',').map(Number); el.querySelector('[data-k="q1"]').value = st.q1; el.querySelector('[data-k="q2"]').value = st.q2; draw(); });
  el.querySelector('[data-lines]').addEventListener('click', () => { st.lines = !st.lines; draw(); });
  draw();
};

/* decay */
(window.SIMS = window.SIMS || {}).decay = function (el, opt) {
  const dating = opt.mode === 'dating';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SYS = [['碳-14 → 氮-14', 5730, '年'], ['鈾-235 → 鉛-207', 7.04e8, '年'], ['鈾-238 → 鉛-206', 4.47e9, '年'], ['銣-87 → 鍶-87', 4.96e10, '年']];
  const st = { N0: 400, T: 2, t: 0, play: false, hist: [], dp: 3, sys: 0 };
  let order = [], dec = [];
  const rng = () => Math.random();
  const head = dating ? `<b>放射性同位素定年</b><span>設定樣品中子元素與母元素的比值 D/P，選定年系統，讀出經過幾個半衰期與岩石年代。</span>`
    : `<b>半衰期與隨機衰變</b><span>按「播放」看原子核隨機衰變，比較實際剩餘數與 N₀(1/2)^(t/T) 曲線；改用少量原子核看看差異。</span>`;
  const ctl = dating ? `<div class="ops" data-g="sys">${SYS.map((s, i) => `<button type="button" data-s="${i}">${s[0]}</button>`).join('')}</div>
    <label class="sl"><span>D/P</span><input type="range" min="0" max="15" step="0.1" value="3"><output></output></label>
    <div class="ops" data-g="pre">${[1, 3, 7, 15].map((v) => `<button type="button" data-v="${v}">D/P = ${v}</button>`).join('')}</div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>半衰期數 n = log₂(1 + D/P)</span><b data-f="n"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>年代 t = T₁/₂ × log₂(1 + D/P)</span><b data-f="age"></b></div>
      <div class="fact"><span>剩餘母元素 P/P₀</span><b data-f="pp"></b></div><div class="fact"><span>半衰期 T₁/₂</span><b data-f="T"></b></div></div>
    <p class="sim-note">D/P 與時間不成正比：D/P 由 1 變 3、由 3 變 7，都只多經過 1 個半衰期。半衰期越長的系統，同一 D/P 代表越老的年代。</p>`
    : `<label class="sl"><span>半衰期 T</span><input type="range" min="1" max="8" step="0.5" value="2"><output></output></label>
    <div class="ops" data-g="n0">${[400, 100, 16].map((v) => `<button type="button" data-v="${v}">N₀ = ${v}</button>`).join('')}</div>
    <div class="ops"><button type="button" data-play>播放</button><button type="button" data-reset>重設</button></div>
    <div class="facts"><div class="fact"><span>經過時間 t</span><b data-f="t"></b></div><div class="fact"><span>實際剩餘 N</span><b data-f="N"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>理論 N₀(1/2)^(t/T)</span><b data-f="th"></b></div><div class="fact" style="grid-column:1/-1"><span>已衰變</span><b data-f="d"></b></div></div>
    <p class="sim-note">無法預測哪一個原子核何時衰變；但大量原子核每經一個半衰期約剩一半。原子核少（N₀ = 16）時，實際剩餘數明顯偏離公式。</p>`;
  el.innerHTML = `<div class="sim-head">${head}</div><div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 440 250" role="img" aria-label="原子核格點與衰變曲線"></svg></div><div class="sim-ctl">${ctl}</div></div>`;
  const svg = el.querySelector('svg'), $ = (s) => el.querySelector(s);
  const GX0 = 238, GX1 = 430, GY0 = 30, GY1 = 205;
  function shuffle(n) { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function grid(isParent, n) {
    const side = Math.ceil(Math.sqrt(n)), cs = 200 / side; let s = '';
    for (let i = 0; i < n; i++) { const r = Math.floor(i / side), c = i % side, p = isParent(i);
      s += `<circle cx="${10 + c * cs + cs / 2}" cy="${15 + r * cs + cs / 2}" r="${cs * 0.38}" fill="${p ? 'var(--c-C)' : 'var(--mute)'}" fill-opacity="${p ? 1 : 0.45}"/>`; }
    return s + `<circle cx="16" cy="234" r="5" fill="var(--c-C)"/><text x="25" y="238" font-size="12.5" fill="var(--ink-2)">${dating ? '母元素 P' : '未衰變'}</text><circle cx="110" cy="234" r="5" fill="var(--mute)" fill-opacity=".45"/><text x="119" y="238" font-size="12.5" fill="var(--ink-2)">${dating ? '子元素 D' : '已衰變'}</text>`;
  }
  function axes(xmax, xlab) {
    let s = `<line x1="${GX0}" y1="${GY1}" x2="${GX1}" y2="${GY1}" stroke="var(--ink-2)"/><line x1="${GX0}" y1="${GY0}" x2="${GX0}" y2="${GY1}" stroke="var(--ink-2)"/>`;
    [1, 0.5, 0.25, 0.125].forEach((f) => { const y = GY1 - f * (GY1 - GY0); s += `<line x1="${GX0}" y1="${y}" x2="${GX1}" y2="${y}" stroke="var(--line)"/><text x="${GX0 - 3}" y="${y + 4}" font-size="11" text-anchor="end" fill="var(--mute)">${['1', '1/2', '1/4', '1/8'][[1, 0.5, 0.25, 0.125].indexOf(f)]}</text>`; });
    for (let k = 0; k <= xmax; k++) { const x = GX0 + (k / xmax) * (GX1 - GX0); s += `<text x="${x}" y="${GY1 + 15}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">${k === 0 ? 0 : k + xlab}</text>`; }
    return s;
  }
  function theory(xmax, fn, col, dash) { const p = []; for (let u = 0; u <= xmax + 1e-9; u += xmax / 100) p.push(`${(GX0 + (u / xmax) * (GX1 - GX0)).toFixed(1)},${(GY1 - fn(u) * (GY1 - GY0)).toFixed(1)}`); return `<polyline points="${p.join(' ')}" fill="none" stroke="${col}" stroke-width="2" ${dash ? 'stroke-dasharray="5 4"' : ''}/>`; }
  // ---------- dating mode ----------
  function drawDating() {
    const n = Math.log2(1 + st.dp), frac = 1 / (1 + st.dp), T = SYS[st.sys][1], nP = Math.round(400 * frac);
    let s = grid((i) => order[i] < nP, 400) + axes(4, 'T');
    s += theory(4, (u) => 0.5 ** u, 'var(--c-C)') + theory(4, (u) => 1 - 0.5 ** u, 'var(--mute)');
    const x = GX0 + (Math.min(n, 4) / 4) * (GX1 - GX0);
    if (n <= 4) s += `<line x1="${x}" y1="${GY0}" x2="${x}" y2="${GY1}" stroke="var(--teal)" stroke-width="1.5"/><circle cx="${x}" cy="${GY1 - frac * (GY1 - GY0)}" r="4.5" fill="var(--c-C)"/><circle cx="${x}" cy="${GY1 - (1 - frac) * (GY1 - GY0)}" r="4.5" fill="var(--ink-2)"/>`;
    s += `<text x="${GX1}" y="14" font-size="12" text-anchor="end" fill="var(--ink-2)">占原有母元素的比例（橫軸：半衰期數）</text>`;
    svg.innerHTML = s;
    const age = T * n, fy = (y) => (y >= 1e8 ? Number((y / 1e8).toPrecision(3)) + ' 億年' : y >= 1e4 ? Number((y / 1e4).toPrecision(3)) + ' 萬年' : Math.round(y) + ' 年');
    $('input[type=range] + output').textContent = 'D/P = ' + st.dp.toFixed(1);
    $('[data-f="n"]').textContent = `log₂(1 + ${st.dp.toFixed(1)}) = ${n.toFixed(2)}`;
    $('[data-f="age"]').textContent = `${fy(T)} × ${n.toFixed(2)} = ${fy(age)}`;
    $('[data-f="pp"]').textContent = `1/(1 + D/P) = ${frac.toFixed(3)}`;
    $('[data-f="T"]').textContent = fy(T);
    el.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.s) === st.sys)));
  }
  // ---------- half-life mode ----------
  function resetRun() { st.t = 0; dec = new Array(st.N0).fill(false); st.hist = [[0, st.N0]]; }
  const remain = () => dec.reduce((a, d) => a + (d ? 0 : 1), 0);
  function step(dt) {
    const p = 1 - 0.5 ** (dt / st.T);
    for (let i = 0; i < st.N0; i++) if (!dec[i] && rng() < p) dec[i] = true;
    st.t += dt; st.hist.push([st.t, remain()]);
  }
  function drawHalf() {
    const N = remain(), xm = 5; let s = grid((i) => !dec[i], st.N0) + axes(xm, 'T');
    s += theory(xm, (u) => 0.5 ** u, 'var(--teal)', true);
    s += `<polyline points="${st.hist.map(([t, n]) => `${(GX0 + (t / st.T / xm) * (GX1 - GX0)).toFixed(1)},${(GY1 - (n / st.N0) * (GY1 - GY0)).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--c-C)" stroke-width="2.2"/>`;
    s += `<text x="${GX1}" y="14" font-size="12" text-anchor="end" fill="var(--ink-2)"><tspan fill="var(--c-C)">— 實際</tspan>　<tspan fill="var(--teal)">- - 理論</tspan>（N/N₀）</text>`;
    svg.innerHTML = s;
    const th = st.N0 * 0.5 ** (st.t / st.T);
    $('input[type=range] + output').textContent = st.T.toFixed(1) + ' s';
    $('[data-f="t"]').textContent = `${st.t.toFixed(1)} s = ${(st.t / st.T).toFixed(2)} T`;
    $('[data-f="N"]').textContent = `${N} 個`;
    $('[data-f="th"]').textContent = `${st.N0} × (1/2)^${(st.t / st.T).toFixed(2)} = ${th.toFixed(1)} 個`;
    $('[data-f="d"]').textContent = `${st.N0 - N} 個（${(((st.N0 - N) / st.N0) * 100).toFixed(0)}%）`;
    $('[data-play]').textContent = st.play ? '暫停' : '播放';
    el.querySelectorAll('[data-g="n0"] button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === st.N0)));
  }
  let last = 0, running = false;
  function frame(ts) {
    if (!el.isConnected || !st.play) { running = false; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60; last = ts; step(Math.min(dt, Math.max(1e-6, 5 * st.T - st.t)));
    if (st.t >= 5 * st.T - 1e-6) st.play = false;
    drawHalf(); if (st.play) requestAnimationFrame(frame); else running = false;
  }
  function play(p) { st.play = p; if (p && st.t >= 5 * st.T - 1e-6) resetRun(); if (p && !running) { running = true; last = 0; requestAnimationFrame(frame); } drawHalf(); }
  function staticRun() { resetRun(); while (st.t < 5 * st.T - 1e-9) step(Math.min(1 / 30, 5 * st.T - st.t)); drawHalf(); }
  if (dating) {
    order = shuffle(400);
    $('input[type=range]').addEventListener('input', (e) => { st.dp = Number(e.target.value); drawDating(); });
    $('[data-g="pre"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.dp = Number(b.dataset.v); $('input[type=range]').value = st.dp; drawDating(); });
    $('[data-g="sys"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.sys = Number(b.dataset.s); drawDating(); });
    drawDating();
  } else {
    $('input[type=range]').addEventListener('input', (e) => { st.T = Number(e.target.value); st.play = false; staticRun(); });
    $('[data-g="n0"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.N0 = Number(b.dataset.v); st.play = false; staticRun(); });
    $('[data-play]').addEventListener('click', () => play(!st.play));
    $('[data-reset]').addEventListener('click', () => { st.play = false; resetRun(); drawHalf(); });
    if (reduce) staticRun(); else { resetRun(); play(true); }
  }
};

/* dilution */
(window.SIMS = window.SIMS || {}).dilution = function (el, opt) {
  const MW = 159.6, VMAX = 500; // CuSO4
  const st = { C1: 0.50, V1: 50, V2: 100 };
  const pts = Array.from({ length: 80 }, () => [Math.random(), Math.random()]);
  el.innerHTML = `<div class="sim-head"><b>溶液的稀釋</b><span>取一定體積的硫酸銅儲備溶液，拖動 V₂ 加水稀釋，看顏色變淡而溶質莫耳數不變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="稀釋前後的燒杯"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>C₁</span><input type="range" data-k="C1" min="0.10" max="1.00" step="0.05"><output></output></label>
    <label class="sl"><span>V₁</span><input type="range" data-k="V1" min="10" max="100" step="5"><output></output></label>
    <label class="sl"><span>V₂</span><input type="range" data-k="V2" min="10" max="${VMAX}" step="5"><output></output></label>
    <div class="ops"><button type="button" data-x="2">稀釋 2 倍</button><button type="button" data-x="5">稀釋 5 倍</button><button type="button" data-x="10">稀釋 10 倍</button></div>
    <div class="facts">
      <div class="fact"><span>溶質莫耳數 n = C₁V₁（不變）</span><b data-f="n"></b></div>
      <div class="fact"><span>稀釋後 C₂ = C₁V₁ / V₂</span><b data-f="c2"></b></div>
      <div class="fact"><span>稀釋倍數 V₂ / V₁</span><b data-f="x"></b></div>
      <div class="fact"><span>重量百分率（設密度 1.00 g/mL）</span><b data-f="p"></b></div>
    </div>
    <p class="sim-note">加水稀釋時溶質的量不變：C₁V₁ = C₂V₂。體積變成幾倍，濃度就變成幾分之一。重量百分率的換算假設稀溶液密度約 1.00 g/mL（溶液 1 mL ≈ 1 g），CuSO₄ 莫耳質量 159.6 g/mol。</p>
  </div></div>`;
  const svg = el.querySelector('svg'), f = (k) => el.querySelector(`[data-f="${k}"]`), sl = {};
  el.querySelectorAll('[data-k]').forEach((i) => { sl[i.dataset.k] = i; });
  function beaker(x, w, h, V, C, n, cap, title) {
    const by = 236, top = by - h, lh = (V / cap) * (h - 10);
    const a = Math.min(0.92, 0.08 + C * 0.85);
    let s = `<text x="${x + w / 2}" y="18" font-size="13" font-weight="700" text-anchor="middle" fill="var(--teal)">${title}</text>`;
    s += `<rect x="${x + 2}" y="${by - lh}" width="${w - 4}" height="${lh}" fill="var(--c-P)" fill-opacity="${a.toFixed(3)}"/>`;
    const N = Math.round(n * 800);
    for (let i = 0; i < N && i < pts.length; i++) s += `<circle cx="${(x + 6 + pts[i][0] * (w - 12)).toFixed(1)}" cy="${(by - 4 - pts[i][1] * (lh - 8)).toFixed(1)}" r="2.6" fill="var(--ink)" opacity=".7"/>`;
    s += `<path d="M${x} ${top} V${by} H${x + w} V${top}" fill="none" stroke="var(--ink-2)" stroke-width="2.5"/>`;
    for (let v = 100; v < cap; v += 100) { const y = by - (v / cap) * (h - 10); s += `<line x1="${x + w - 12}" x2="${x + w}" y1="${y}" y2="${y}" stroke="var(--mute)"/><text x="${x + w - 14}" y="${y + 4}" font-size="9" text-anchor="end" fill="var(--mute)">${v}</text>`; }
    s += `<text x="${x + w / 2}" y="${by + 18}" font-size="12" text-anchor="middle" fill="var(--ink)">V = ${V} mL</text><text x="${x + w / 2}" y="${by + 34}" font-size="12" text-anchor="middle" fill="var(--ink)">C = ${C.toFixed(3)} M</text>`;
    return s;
  }
  function draw() {
    if (st.V2 < st.V1) st.V2 = st.V1;
    const n = (st.C1 * st.V1) / 1000, C2 = n / (st.V2 / 1000);
    let s = beaker(28, 110, 120, st.V1, st.C1, n, 120, '稀釋前（儲備液）');
    s += `<path d="M150 150 H200" stroke="var(--ink-2)" stroke-width="2"/><path d="M200 150 l-8 -5 v10 z" fill="var(--ink-2)"/><text x="175" y="140" font-size="11" text-anchor="middle" fill="var(--ink-2)">加水</text><text x="175" y="170" font-size="11" text-anchor="middle" fill="var(--c-B)">+${st.V2 - st.V1} mL</text>`;
    s += beaker(218, 180, 210, st.V2, C2, n, VMAX, '稀釋後');
    s += `<text x="10" y="294" font-size="11" fill="var(--mute)">● 溶質粒子（示意，數目代表莫耳數）；顏色深淺代表濃度</text>`;
    svg.innerHTML = s;
    for (const k of ['C1', 'V1', 'V2']) { sl[k].value = st[k]; sl[k].nextElementSibling.textContent = k === 'C1' ? st.C1.toFixed(2) + ' M' : st[k] + ' mL'; }
    el.querySelectorAll('[data-x]').forEach((b) => { b.disabled = st.V1 * Number(b.dataset.x) > VMAX; b.style.opacity = b.disabled ? 0.45 : 1; b.setAttribute('aria-pressed', String(st.V2 === st.V1 * Number(b.dataset.x))); });
    f('n').textContent = `${st.C1.toFixed(2)} × ${(st.V1 / 1000).toFixed(3)} = ${n.toFixed(4)} mol`;
    f('c2').textContent = `${n.toFixed(4)} ÷ ${(st.V2 / 1000).toFixed(3)} = ${C2.toFixed(3)} M`;
    f('x').textContent = `${(st.V2 / st.V1).toFixed(2)} 倍`;
    f('p').textContent = `${((n * MW * 100) / st.V2).toFixed(2)}%（${(n * MW).toFixed(2)} g ÷ ${st.V2} g）`;
  }
  Object.values(sl).forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); if (i.dataset.k === 'V2' && st.V2 < st.V1) st.V2 = st.V1; draw(); }));
  el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => { st.V2 = Math.min(VMAX, st.V1 * Number(b.dataset.x)); draw(); }));
  draw();
};

/* dna */
(window.SIMS = window.SIMS || {}).dna = function (el, opt) {
  const B = 'UCAG', AA1 = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
  const N3 = { F: 'Phe', L: 'Leu', S: 'Ser', Y: 'Tyr', C: 'Cys', W: 'Trp', P: 'Pro', H: 'His', Q: 'Gln', R: 'Arg', I: 'Ile', M: 'Met', T: 'Thr', N: 'Asn', K: 'Lys', V: 'Val', A: 'Ala', D: 'Asp', E: 'Glu', G: 'Gly', '*': '終止' };
  const ZH = { Phe: '苯丙胺酸', Leu: '白胺酸', Ser: '絲胺酸', Tyr: '酪胺酸', Cys: '半胱胺酸', Trp: '色胺酸', Pro: '脯胺酸', His: '組胺酸', Gln: '麩醯胺酸', Arg: '精胺酸', Ile: '異白胺酸', Met: '甲硫胺酸', Thr: '蘇胺酸', Asn: '天門冬醯胺', Lys: '離胺酸', Val: '纈胺酸', Ala: '丙胺酸', Asp: '天門冬胺酸', Glu: '麩胺酸', Gly: '甘胺酸', 終止: '終止密碼子' };
  const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const aaOf = (c) => N3[AA1[16 * B.indexOf(c[0]) + 4 * B.indexOf(c[1]) + B.indexOf(c[2])]];
  const comp = (s) => s.split('').map((c) => COMP[c]).join('');
  let strand = opt.mode === 'template' ? 'template' : 'coding', ref = opt.seq || 'GCATGGCCGAGAAGTGGTTCTAAGC', sel = null, mut = null;
  const S = '.sim[data-sim="dna"]';
  el.innerHTML = `<style>${S} .row{display:flex;flex-wrap:wrap;gap:5px;align-items:flex-start;margin:4px 0 8px}${S} .cb{display:grid;font-family:var(--f-mono);font-size:.92rem;line-height:1.3;text-align:center;background:var(--card);border:1.5px solid var(--line);border-radius:7px;padding:2px 4px}
  ${S} .cb.lab{font-family:inherit;font-size:.72rem;color:var(--mute);text-align:right;border-color:transparent;background:none;line-height:1.66}${S} .cb .t{color:var(--ink-2)}${S} .cb .m{color:var(--c-X);font-weight:700}${S} .cb em{font-style:normal;font-size:.78rem;color:var(--teal-2);font-weight:700;border-top:1px solid var(--line)}
  ${S} .cb.st{border-color:var(--green)}${S} .cb.sp{border-color:var(--red)}${S} .cb.sp em{color:var(--red)}${S} .cb.ut{opacity:.6;border-style:dashed}${S} [data-i]{cursor:pointer;border-radius:3px}${S} [data-i]:hover{background:var(--teal-soft)}${S} .hl{background:var(--red);color:#fff!important}${S} .sl2{background:var(--sun)}
  ${S} h4{margin:2px 0;font-size:.85rem;color:var(--ink-2)}${S} input[type=text]{width:100%;font-family:var(--f-mono);letter-spacing:.06em}</style>
  <div class="sim-head"><b>由 DNA 到蛋白質：轉錄、轉譯與突變</b><span>編輯 DNA 序列，看 mRNA 與胺基酸；點一個鹼基再按突變按鈕，比較突變前後。</span></div>
  <div class="sim-body"><div class="sim-viz" style="padding:8px 10px"><h4>原序列</h4><div class="row" data-ref></div><div data-mutwrap></div></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-s="coding">輸入編碼股</button><button type="button" data-s="template">輸入模板股</button></div>
    <label style="display:grid;gap:3px;font-size:.84rem;color:var(--ink-2)"><span data-inlab></span><input type="text" maxlength="60" spellcheck="false" autocomplete="off"></label>
    <div class="ops"><button type="button" data-mu="sub">取代</button><button type="button" data-mu="ins">插入</button><button type="button" data-mu="del">缺失</button><button type="button" data-mu="reset">還原</button></div>
    <div class="facts">
      <div class="fact"><span>起始密碼子 AUG 位置</span><b data-f="st"></b></div>
      <div class="fact"><span>胺基酸數（不含終止）</span><b data-f="n"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>多肽鏈（原序列）</span><b data-f="p"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>突變類型與影響</span><b data-f="m"></b></div>
    </div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), inp = q('input');
  function tr(cod) {
    const m = cod.replace(/T/g, 'U'), st = m.indexOf('AUG'), cods = [];
    let i = st, stop = false;
    if (st >= 0) for (; i + 3 <= m.length; i += 3) { const c = m.slice(i, i + 3), a = aaOf(c); cods.push([i, c, a]); if (a === '終止') { stop = true; i += 3; break; } }
    const prot = cods.filter((c) => c[2] !== '終止').map((c) => c[2]);
    return { m, st, cods, end: st >= 0 ? i : 0, stop, prot };
  }
  function blocks(cod, R, hl, click) {
    const span = (s, j0, cls) => s.split('').map((ch, k) => { const j = j0 + k, h = hl.includes(j) ? ' hl' : sel === j && click ? ' sl2' : ''; return `<span class="${cls}${h}"${click ? ` data-i="${j}"` : ''}>${ch}</span>`; }).join('');
    const blk = (a, b, cls, aa) => `<div class="cb ${cls}"><span>${span(cod.slice(a, b), a, '')}</span><span class="t">${span(comp(cod.slice(a, b)), a, '')}</span><span class="m">${span(R.m.slice(a, b), a, '')}</span><em title="${ZH[aa] || ''}">${aa || '　'}</em></div>`;
    let h = `<div class="cb lab"><span>編碼股 5′→3′</span><span>模板股 3′→5′</span><span>mRNA 5′→3′</span><span>胺基酸</span></div>`;
    const pre = R.st >= 0 ? R.st : cod.length;
    if (pre > 0) h += blk(0, pre, 'ut', '');
    R.cods.forEach(([i, c, a], k) => { h += blk(i, i + 3, k === 0 ? 'st' : a === '終止' ? 'sp' : '', a); });
    if (R.st >= 0 && R.end < cod.length) h += blk(R.end, cod.length, 'ut', '');
    return h;
  }
  function classify(R0, R1) {
    if (mut.type !== 'sub') {
      const sh = !R1.stop ? '，讀到序列末端仍未遇到終止密碼子' : R1.prot.length < R0.prot.length ? `，提早於第 ${R1.prot.length + 1} 個密碼子終止` : '';
      return [`移碼突變（${mut.type === 'ins' ? '插入' : '缺失'} 1 個鹼基）`, `讀框自第 ${Math.floor((mut.pos - R0.st) / 3) + 1} 個密碼子起改變，其後胺基酸大幅改變${sh}。`];
    }
    const k = Math.floor((mut.pos - R0.st) / 3), a0 = R0.prot[k], a1 = R1.cods[k] ? R1.cods[k][2] : '';
    if (R1.prot.join() === R0.prot.join()) return ['同義（沉默）突變', `密碼子 ${R0.cods[k][1]}→${R1.cods[k][1]} 仍對應 ${a0}，胺基酸序列不變（密碼的簡併性）。`];
    if (a1 === '終止') return ['無義突變', `第 ${k + 1} 個密碼子變成終止密碼子 ${R1.cods[k][1]}，多肽鏈只剩 ${R1.prot.length} 個胺基酸。`];
    return ['誤義突變', `第 ${k + 1} 個胺基酸 ${a0}（${ZH[a0]}）→ ${a1}（${ZH[a1]}），只改變一個胺基酸。`];
  }
  function render() {
    const R0 = tr(ref);
    q('[data-ref]').innerHTML = blocks(ref, R0, mut && mut.type === 'sub' ? [mut.pos] : [], true);
    q('[data-inlab]').textContent = strand === 'coding' ? '編碼股（5′→3′，由左往右讀；mRNA＝編碼股 T 換 U）' : '模板股（3′→5′，由左往右；mRNA 與模板股互補且反向）';
    el.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === strand));
    q('[data-f="st"]').textContent = R0.st >= 0 ? `mRNA 第 ${R0.st + 1}–${R0.st + 3} 個核苷酸` : '找不到';
    q('[data-f="n"]').textContent = R0.st >= 0 ? `${R0.prot.length}${R0.stop ? '' : '（未遇終止密碼子）'}` : '0';
    q('[data-f="p"]').textContent = R0.prot.join('–') || '—';
    el.querySelectorAll('[data-mu]').forEach((b) => { b.disabled = R0.st < 0 || (b.dataset.mu === 'reset' && !mut); });
    let note = R0.st < 0 ? '找不到 AUG：轉譯須由起始密碼子開始，這段 mRNA 不會被轉譯。' : '轉譯自第一個 AUG 開始（不是第一個鹼基），三個一組讀到終止密碼子 UAA、UAG 或 UGA 為止；終止密碼子不對應胺基酸。';
    if (mut) {
      const R1 = tr(mut.seq), [t, d] = classify(R0, R1);
      q('[data-mutwrap]').innerHTML = `<h4>突變後（紅色為改變處）</h4><div class="row">${blocks(mut.seq, R1, mut.type === 'del' ? [] : [mut.pos], false)}</div><p style="margin:0;font-size:.85rem">多肽鏈：<b style="font-family:var(--f-mono)">${R1.prot.join('–') || '—'}</b></p>`;
      q('[data-f="m"]').textContent = t; note = d;
    } else { q('[data-mutwrap]').innerHTML = ''; q('[data-f="m"]').textContent = '尚未突變'; }
    q('[data-note]').textContent = note;
  }
  const setInput = () => { inp.value = strand === 'coding' ? ref : comp(ref); };
  inp.addEventListener('input', () => {
    const s = inp.value.toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
    ref = strand === 'coding' ? s : comp(s); mut = null; sel = null; render();
  });
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-i]'); if (c) { sel = +c.dataset.i; mut = null; return render(); }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.s) { strand = b.dataset.s; setInput(); }
    if (b.dataset.mu) {
      const R = tr(ref), lo = R.st + 3, hi = (R.stop ? R.end - 3 : R.end) - 1, t = b.dataset.mu;
      if (t === 'reset' || hi < lo) mut = null;
      else {
        const pos = sel != null && sel >= lo && sel <= hi ? sel : lo + Math.floor(Math.random() * (hi - lo + 1));
        const nb = 'ACGT'.replace(ref[pos], '')[Math.floor(Math.random() * 3)], ib = 'ACGT'[Math.floor(Math.random() * 4)];
        const seq = t === 'sub' ? ref.slice(0, pos) + nb + ref.slice(pos + 1) : t === 'ins' ? ref.slice(0, pos) + ib + ref.slice(pos) : ref.slice(0, pos) + ref.slice(pos + 1);
        mut = { type: t, pos, seq };
      }
    }
    render();
  });
  setInput(); render();
};

/* doppler */
(window.SIMS = window.SIMS || {}).doppler = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uid = 'x' + Math.random().toString(36).slice(2, 8);
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span data-l="${k}">${lab}</span><b data-f="${k}"></b></div>`;
  const V = 340, CV = 40, TE = 0.45, D = 7; // sound speed; visual wave speed px/s; emission interval s; loop s
  el.innerHTML = `<div class="sim-head"><b>運動波源的都卜勒效應</b><span>拖動波源速率 vs，比較波源前方與後方的波前疏密，以及觀察者測得的頻率。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 230" role="img" aria-label="向右運動的聲源發出的圓形波前"></svg></div>
<div class="sim-ctl">
${sl('vs', 'vs', 0, 300, 1, 85)}${sl('f', 'f', 200, 1000, 10, 600)}
<div class="ops"><button type="button" data-o2="1" aria-pressed="true">前方觀察者</button><button type="button" data-o2="-1" aria-pressed="false">後方觀察者</button><button type="button" data-b="play">播放</button></div>
<div class="facts">${fact('main', '')}${fact('lam', '')}${fact('other', '')}${fact('v', '聲速 v（靜止空氣）')}</div>
<p class="sim-note">波源運動使前方波長變短、後方變長；聲速仍是 v，所以前方頻率升高、後方降低。波源本身的頻率 f 沒有改變。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { vs: 85, f: 600, side: 1, t: 3.6 };
  const srcX = (t) => 180 + CV * (P.vs / V) * (t - D / 2);
  function draw() {
    const t = P.t;
    let s = `<defs><clipPath id="${uid}"><rect x="0" y="0" width="360" height="230"/></clipPath></defs><g clip-path="url(#${uid})">`;
    s += `<line x1="0" x2="360" y1="112" y2="112" style="stroke:var(--line)" stroke-dasharray="3 4"/>`;
    for (let k = 0; k * TE <= t; k++) {
      const te = k * TE, r = CV * (t - te), op = Math.max(0.15, 1 - r / 300);
      s += `<circle cx="${srcX(te).toFixed(1)}" cy="112" r="${r.toFixed(1)}" fill="none" style="stroke:var(--c-P);opacity:${op.toFixed(2)}" stroke-width="1.5"/>`;
    }
    s += '</g>';
    const sx = srcX(t);
    s += `<circle cx="${sx}" cy="112" r="8" style="fill:var(--red);stroke:#fff" stroke-width="2"/>`;
    if (P.vs > 0) s += `<path d="M${sx + 12} 112 h${10 + P.vs / 10} l-6 -4 m6 4 l-6 4" fill="none" style="stroke:var(--red)" stroke-width="2"/>`;
    s += `<text x="${sx}" y="136" text-anchor="middle" font-size="11" style="fill:var(--red)">波源</text>`;
    [[344, 1, '前方'], [16, -1, '後方']].forEach(([x, sd, lab]) => {
      const on = P.side === sd;
      s += `<rect x="${x - 12}" y="${on ? 150 : 154}" width="24" height="${on ? 30 : 22}" rx="5" style="fill:${on ? 'var(--sun)' : 'var(--card)'};stroke:var(--ink-2)"/>`;
      s += `<text x="${x}" y="${on ? 170 : 169}" text-anchor="middle" font-size="12" style="fill:var(--ink)">耳</text><text x="${x}" y="198" text-anchor="middle" font-size="11" style="fill:var(--ink-2)">${lab}</text>`;
    });
    s += `<rect x="62" y="211" width="236" height="15" rx="4" style="fill:var(--bg);opacity:.9"/>`;
    s += `<text x="180" y="222" text-anchor="middle" font-size="10" style="fill:var(--mute)">波前間隔為示意（未依實際頻率）；vs/v = ${f(P.vs / V, 2)}</text>`;
    svg.innerHTML = s;
    const fa = (P.f * V) / (V - P.vs), fb = (P.f * V) / (V + P.vs);
    const main = P.side > 0, sg = main ? '−' : '+';
    $('[data-l=main]').textContent = `${main ? '前方' : '後方'}觀察者 f′ = f·v/(v ${sg} vs)`;
    $('[data-f=main]').textContent = `${f(P.f, 0)}×${V}/(${V} ${sg} ${f(P.vs, 0)}) = ${f(main ? fa : fb, 0)} Hz`;
    $('[data-l=lam]').textContent = `${main ? '前方' : '後方'}波長 λ′ = (v ${sg} vs)/f`;
    $('[data-f=lam]').textContent = `${f((main ? V - P.vs : V + P.vs) / P.f, 3)} m（靜止時 ${f(V / P.f, 3)} m）`;
    $('[data-l=other]').textContent = `${main ? '後方' : '前方'}觀察者 f′`;
    $('[data-f=other]').textContent = `${f(main ? fb : fa, 0)} Hz`;
    $('[data-f=v]').textContent = `${V} m/s`;
    $('[data-o=vs]').textContent = `${f(P.vs, 0)} m/s`;
    $('[data-o=f]').textContent = `${f(P.f, 0)} Hz`;
  }
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    P.t += dt;
    if (P.t > D) P.t = 0;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => play(!playing));
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => { P[k] = parseFloat(inp[k].value); if (k === 'vs' && playing) P.t = 0; draw(); }));
  el.querySelectorAll('[data-o2]').forEach((b) => b.addEventListener('click', () => {
    P.side = +b.dataset.o2;
    el.querySelectorAll('[data-o2]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    draw();
  }));
  draw();
  play(!RM);
};

/* doubleslit */
(window.SIMS = window.SIMS || {}).doubleslit = function (el, opt) {
  opt = opt || {};
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  const YW = 15; // half-width of screen window (mm)
  el.innerHTML = `<div class="sim-head"><b>楊氏雙狹縫干涉</b><span>改變波長 λ、狹縫間距 d 與屏距 L，看屏上亮紋間距如何改變。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 290" role="img" aria-label="雙狹縫干涉條紋與光強度分布"></svg></div>
<div class="sim-ctl">
${sl('lam', 'λ', 380, 750, 5, 600)}${sl('d', 'd', 0.1, 0.5, 0.01, 0.25)}${sl('L', 'L', 0.5, 3, 0.1, 1.5)}
<div class="ops"><button type="button" data-p="650">紅光</button><button type="button" data-p="530">綠光</button><button type="button" data-p="450">藍光</button></div>
<div class="facts">${fact('dy', '亮紋間距 Δy = Lλ/d')}${fact('dark', '第 1 暗紋位置 ½Δy')}${fact('sin', '第 1 亮紋 sin θ = λ/d')}${fact('col', '光的顏色')}</div>
<p class="sim-note">Δy 與 L、λ 成正比，與 d 成反比：屏移遠或換紅光條紋變疏，狹縫間距加大條紋變密。中央 m = 0 為亮紋，暗紋在相鄰亮紋正中間。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { lam: 600, d: 0.25, L: 1.5 };
  function rgb(w) {
    let r = 0, g = 0, b = 0;
    if (w < 440) { r = (440 - w) / 60; b = 1; } else if (w < 490) { g = (w - 440) / 50; b = 1; } else if (w < 510) { g = 1; b = (510 - w) / 20; } else if (w < 580) { r = (w - 510) / 70; g = 1; } else if (w < 645) { r = 1; g = (645 - w) / 65; } else r = 1;
    const k = w < 420 ? 0.4 + (0.6 * (w - 380)) / 40 : w > 700 ? 0.4 + (0.6 * (750 - w)) / 50 : 1;
    return `rgb(${[r, g, b].map((c) => Math.round(255 * Math.pow(c * k, 0.8))).join(',')})`;
  }
  const cname = (w) => (w < 450 ? '紫' : w < 495 ? '藍' : w < 570 ? '綠' : w < 590 ? '黃' : w < 620 ? '橙' : '紅');
  function draw() {
    const lam = P.lam * 1e-9, d = P.d * 1e-3, L = P.L;
    const dy = (L * lam) / d * 1000; // mm
    const I = (y) => Math.pow(Math.cos((Math.PI * y) / dy), 2);
    const col = rgb(P.lam);
    const X = (y) => 20 + ((y + YW) / (2 * YW)) * 320;
    let s = '';
    // schematic
    const sx = 330, bx = sx - (40 + P.L * 80), gap = 6 + P.d * 40;
    s += `<rect x="${sx}" y="10" width="6" height="64" style="fill:var(--ink-2)"/><text x="${sx - 4}" y="22" text-anchor="end" font-size="10" style="fill:var(--mute)">屏</text>`;
    s += `<rect x="${bx - 3}" y="10" width="6" height="${42 - gap / 2 - 2}" style="fill:var(--ink)"/><rect x="${bx - 3}" y="${42 - gap / 2 + 2}" width="6" height="${gap - 4}" style="fill:var(--ink)"/><rect x="${bx - 3}" y="${42 + gap / 2 + 2}" width="6" height="${32 - gap / 2 - 2}" style="fill:var(--ink)"/>`;
    s += `<line x1="8" x2="${bx - 6}" y1="42" y2="42" style="stroke:${col}" stroke-width="3"/><path d="M${bx - 6} 42 l-8 -4 v8z" style="fill:${col}"/>`;
    [-1, 1].forEach((sg) => { s += `<path d="M${bx + 3} ${42 + sg * gap / 2} L${sx} ${42 - 26} M${bx + 3} ${42 + sg * gap / 2} L${sx} ${42 + 26}" style="stroke:${col};opacity:.45" stroke-width="1"/>`; });
    s += `<text x="${bx - 8}" y="${42 + gap / 2 + 14}" text-anchor="end" font-size="10" style="fill:var(--ink-2)">d</text>`;
    s += `<line x1="${bx}" x2="${sx}" y1="84" y2="84" style="stroke:var(--ink-2)"/><text x="${(bx + sx) / 2}" y="80" text-anchor="middle" font-size="10" style="fill:var(--ink-2)">L = ${f(P.L, 1)} m（示意，未依比例）</text>`;
    // fringe strip
    s += `<rect x="20" y="98" width="320" height="38" style="fill:#000"/>`;
    for (let i = 0; i < 320; i++) { const y = -YW + ((i + 0.5) / 320) * 2 * YW; s += `<rect x="${20 + i}" y="98" width="1.2" height="38" style="fill:${col};opacity:${I(y).toFixed(2)}"/>`; }
    s += `<text x="20" y="94" font-size="10" style="fill:var(--mute)">屏上條紋（理想情形）</text>`;
    // intensity curve
    const GY = (v) => 240 - v * 82;
    s += `<rect x="20" y="152" width="320" height="94" style="fill:var(--card);stroke:var(--line)"/>`;
    let p = '';
    for (let i = 0; i <= 640; i++) { const y = -YW + (i / 640) * 2 * YW; p += (i ? 'L' : 'M') + X(y).toFixed(2) + ' ' + GY(I(y)).toFixed(1); }
    s += `<path d="${p}" fill="none" style="stroke:var(--teal)" stroke-width="1.6"/>`;
    for (let m = -3; m <= 3; m++) { const y = m * dy; if (Math.abs(y) <= YW && (dy > 2.2 || m === 0)) s += `<text x="${X(y)}" y="149" text-anchor="middle" font-size="9" style="fill:var(--ink-2)">${m === 0 ? 'm = 0' : f(m, 0)}</text>`; }
    if (dy <= YW) s += `<line x1="${X(0)}" x2="${X(dy)}" y1="244" y2="244" style="stroke:var(--c-C)" stroke-width="2"/><line x1="${X(dy)}" x2="${X(dy)}" y1="152" y2="246" style="stroke:var(--c-C)" stroke-dasharray="2 2"/><line x1="${X(0)}" x2="${X(0)}" y1="152" y2="246" style="stroke:var(--c-C)" stroke-dasharray="2 2"/><text x="${X(dy) + 3}" y="238" font-size="11" style="fill:var(--c-C)">Δy</text>`;
    for (let y = -YW; y <= YW; y += 5) s += `<line x1="${X(y)}" x2="${X(y)}" y1="246" y2="251" style="stroke:var(--ink-2)"/><text x="${X(y)}" y="263" text-anchor="middle" font-size="10" style="fill:var(--mute)">${f(y, 0)}</text>`;
    s += `<text x="340" y="280" text-anchor="end" font-size="10" style="fill:var(--mute)">屏上位置 y (mm)</text><text x="20" y="280" font-size="10" style="fill:var(--mute)">光強度 I</text>`;
    svg.innerHTML = s;
    $('[data-f=dy]').textContent = `${f(P.L, 1)}×${P.lam}×10⁻⁹ / ${f(P.d, 2)}×10⁻³ = ${f(dy, 2)} mm`;
    $('[data-f=dark]').textContent = `${f(dy / 2, 2)} mm`;
    $('[data-f=sin]').textContent = `${f(lam / d, 5)}`;
    $('[data-f=col]').innerHTML = `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;background:${col}"></span> ${cname(P.lam)}光 ${P.lam} nm`;
    $('[data-o=lam]').textContent = `${P.lam} nm`;
    $('[data-o=d]').textContent = `${f(P.d, 2)} mm`;
    $('[data-o=L]').textContent = `${f(P.L, 1)} m`;
  }
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => { P[k] = parseFloat(inp[k].value); draw(); }));
  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { P.lam = +b.dataset.p; inp.lam.value = P.lam; draw(); }));
  draw();
};

/* energy */
(window.SIMS = window.SIMS || {}).energy = function (el, opt) {
  const g = 9.8, m = 1.0, MU = 0.08, L = 1.5, W0 = 0.6, AK = 0.5, HMAX = 1.4;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { mode: opt.mode === 'track' ? 'track' : 'pendulum', h0: 1.0, fric: false, play: !reduce, q: 0, qd: 0, Q: 0, vmaxBottom: 0 };
  el.innerHTML = `<div class="sim-head"><b>力學能守恆：單擺與曲面軌道</b><span>選擇單擺或軌道、設定釋放高度，看動能 K 與位能 U 如何互換；加入摩擦後，少掉的力學能變成熱。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 440 280" role="img" aria-label="單擺或軌道動畫與能量長條圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="mode"><button type="button" data-m="pendulum">單擺</button><button type="button" data-m="track">曲面軌道</button></div>
    <label class="sl"><span>釋放高度 h</span><input type="range" min="0.2" max="${HMAX}" step="0.05" value="1"><output></output></label>
    <div class="ops"><button type="button" data-fric>加入摩擦</button><button type="button" data-play>暫停</button><button type="button" data-reset>重新釋放</button></div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>最低點速率（無摩擦）v = √(2gh)</span><b data-f="vb"></b></div>
      <div class="fact"><span>目前高度、速率</span><b data-f="now"></b></div><div class="fact"><span>通過最低點的速率</span><b data-f="vm"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>K + U + 熱 = 總能量（m = 1.0 kg，g = 9.8 m/s²）</span><b data-f="E"></b></div></div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), $ = (s) => el.querySelector(s);
  const f = (x) => (Math.abs(x) > W0 ? AK * (Math.abs(x) - W0) ** 2 : 0);
  const fp = (x) => (Math.abs(x) > W0 ? 2 * AK * (Math.abs(x) - W0) * Math.sign(x) : 0);
  const fpp = (x) => (Math.abs(x) > W0 ? 2 * AK : 0);
  const height = (q) => (st.mode === 'pendulum' ? L * (1 - Math.cos(q)) : f(q));
  const speed = (q, qd) => (st.mode === 'pendulum' ? L * Math.abs(qd) : Math.abs(qd) * Math.sqrt(1 + fp(q) ** 2));
  const sinphi = (q) => (st.mode === 'pendulum' ? Math.sin(q) : fp(q) / Math.sqrt(1 + fp(q) ** 2));
  function acc(q, qd) {
    const fr = st.fric && qd !== 0 ? MU * g * Math.sign(qd) : 0;
    if (st.mode === 'pendulum') return (-g * Math.sin(q) - fr) / L;
    const k = Math.sqrt(1 + fp(q) ** 2), sdd = -g * fp(q) / k - fr;
    return (sdd - qd * qd * fp(q) * fpp(q) / k) / k;
  }
  function reset() {
    st.q = st.mode === 'pendulum' ? -Math.acos(1 - st.h0 / L) : -(W0 + Math.sqrt(st.h0 / AK));
    st.qd = 0; st.Q = 0; st.vmaxBottom = 0; st.stopped = false;
  }
  function step(dt) {
    const n = 40, h = dt / n;
    for (let i = 0; i < n && !st.stopped; i++) {
      const q0 = st.q, v0 = st.qd, s0 = speed(q0, v0);
      const k1 = acc(q0, v0), k2 = acc(q0 + v0 * h / 2, v0 + k1 * h / 2), k3 = acc(q0 + (v0 + k1 * h / 2) * h / 2, v0 + k2 * h / 2), k4 = acc(q0 + (v0 + k2 * h / 2) * h, v0 + k3 * h);
      let q1 = q0 + h * (v0 + h * (k1 + k2 + k3) / 6), v1 = v0 + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
      if (st.fric && v0 !== 0 && Math.sign(v1) !== Math.sign(v0)) v1 = 0; // friction cannot reverse motion by itself
      st.q = q1; st.qd = v1;
      if (st.fric) st.Q += m * MU * g * (s0 + speed(q1, v1)) / 2 * h;
      if (Math.sign(q1) !== Math.sign(q0)) st.vmaxBottom = speed(q1, v1);
      if (st.fric && v1 === 0 && Math.abs(sinphi(q1)) <= MU) st.stopped = true;
    }
  }
  function draw() {
    const pend = st.mode === 'pendulum', hc = height(st.q), v = speed(st.q, st.qd);
    const U = m * g * hc, K = 0.5 * m * v * v, E0 = m * g * st.h0, Qh = st.fric ? Math.max(0, st.Q) : 0;
    let s = '', bx, by;
    const SC = pend ? 85 : 62, OX = 150, GY = 230;
    const Y = (hm) => GY - hm * SC;
    if (pend) {
      const px = OX, py = GY - L * SC; bx = px + L * SC * Math.sin(st.q); by = py + L * SC * Math.cos(st.q);
      const a0 = Math.acos(1 - st.h0 / L);
      s += `<path d="M${px + L * SC * Math.sin(-a0)} ${py + L * SC * Math.cos(a0)} A${L * SC} ${L * SC} 0 0 0 ${px + L * SC * Math.sin(a0)} ${py + L * SC * Math.cos(a0)}" fill="none" stroke="var(--line)" stroke-dasharray="4 4"/>`;
      s += `<rect x="${px - 40}" y="${py - 6}" width="80" height="6" fill="var(--ink-2)"/><line x1="${px}" y1="${py}" x2="${bx}" y2="${by}" stroke="var(--ink)" stroke-width="1.5"/>`;
    } else {
      const pts = []; for (let x = -2.2; x <= 2.201; x += 0.05) pts.push(`${(OX + x * SC).toFixed(1)},${Y(f(x)).toFixed(1)}`);
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--ink-2)" stroke-width="4" stroke-linecap="round"/>`;
      const nx = -fp(st.q), ny = 1, nn = Math.hypot(nx, ny);
      bx = OX + st.q * SC + (nx / nn) * 11; by = Y(hc) - (ny / nn) * 11;
    }
    s += `<line x1="10" y1="${Y(st.h0)}" x2="290" y2="${Y(st.h0)}" stroke="var(--c-C)" stroke-dasharray="5 4"/><text x="12" y="${Y(st.h0) - 5}" font-size="13" fill="var(--c-C)">釋放高度 h = ${st.h0.toFixed(2)} m</text>`;
    s += `<line x1="10" y1="${GY + (pend ? 11 : 0)}" x2="290" y2="${GY + (pend ? 11 : 0)}" stroke="var(--mute)"/><text x="12" y="${GY + 26}" font-size="12" fill="var(--mute)">最低點：U = 0</text>`;
    s += `<circle cx="${bx}" cy="${by}" r="11" fill="var(--c-P)" stroke="var(--card)" stroke-width="2"/>`;
    // bars
    const BM = m * g * HMAX, BH = 190, B0 = 240, bars = [['K', K, 'var(--c-P)'], ['U', U, 'var(--c-C)'], ['熱', Qh, 'var(--red)'], ['E', K + U + Qh, 'var(--teal)']];
    s += `<line x1="300" y1="${B0}" x2="436" y2="${B0}" stroke="var(--ink-2)"/><line x1="300" y1="${B0 - (E0 / BM) * BH}" x2="436" y2="${B0 - (E0 / BM) * BH}" stroke="var(--teal)" stroke-dasharray="3 3"/>`;
    bars.forEach(([n, val, c], i) => {
      const x = 306 + i * 33, hh = Math.max(0, (val / BM) * BH);
      s += `<rect x="${x}" y="${B0 - hh}" width="26" height="${hh}" fill="${c}" rx="2"/><text x="${x + 13}" y="${B0 + 16}" font-size="13" text-anchor="middle" fill="${c}" font-weight="700">${n}</text><text x="${x + 13}" y="${B0 - hh - 4}" font-size="13" text-anchor="middle" fill="var(--ink-2)">${val.toFixed(1)}</text>`;
    });
    s += `<text x="436" y="${B0 + 32}" font-size="11" text-anchor="end" fill="var(--mute)">單位：J</text>`;
    svg.innerHTML = s;
    $('input[type=range] + output').textContent = st.h0.toFixed(2) + ' m';
    $('[data-f="vb"]').textContent = `√(2 × 9.8 × ${st.h0.toFixed(2)}) = ${Math.sqrt(2 * g * st.h0).toFixed(2)} m/s`;
    $('[data-f="now"]').textContent = `${hc.toFixed(2)} m，${v.toFixed(2)} m/s`;
    $('[data-f="vm"]').textContent = st.vmaxBottom ? st.vmaxBottom.toFixed(2) + ' m/s' : '—';
    $('[data-f="E"]').textContent = `${K.toFixed(2)} + ${U.toFixed(2)}${st.fric ? ' + ' + Qh.toFixed(2) : ''} = ${(K + U + Qh).toFixed(2)} J（初始 mgh = ${E0.toFixed(2)} J）`;
    $('[data-f="note"]').textContent = st.fric ? '有摩擦時力學能 K + U 逐漸減少，減少量等於摩擦生熱；但 K + U + 熱 仍等於初始的 mgh，能量守恆。'
      : (pend ? '張力恆與速度垂直不作功，只有重力作功，力學能守恆：最低點速率只由高度差決定，與擺長、質量無關。' : '光滑軌道的正向力不作功，力學能守恆：不論軌道形狀，同一高度速率相同；回到另一側的同一高度才停下。');
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
    $('[data-fric]').setAttribute('aria-pressed', String(st.fric));
    $('[data-play]').textContent = st.play ? '暫停' : '播放';
  }
  let last = 0, running = false;
  function frame(t) {
    if (!el.isConnected || !st.play) { running = false; return; }
    const dt = last ? Math.min(0.04, (t - last) / 1000) : 1 / 60; last = t; step(dt); draw(); requestAnimationFrame(frame);
  }
  function go() { if (st.play && !running) { running = true; last = 0; requestAnimationFrame(frame); } }
  $('input[type=range]').addEventListener('input', (e) => { st.h0 = Number(e.target.value); reset(); draw(); });
  $('[data-g="mode"]').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; st.mode = b.dataset.m; reset(); draw(); });
  $('[data-fric]').addEventListener('click', () => { st.fric = !st.fric; reset(); draw(); });
  $('[data-play]').addEventListener('click', () => { st.play = !st.play; draw(); go(); });
  $('[data-reset]').addEventListener('click', () => { reset(); draw(); go(); });
  reset();
  if (reduce) { // static: show the state passing the lowest point
    const keep = st.q; st.q = 0; st.qd = (st.mode === 'pendulum' ? 1 / L : 1) * Math.sqrt(2 * g * st.h0); st.vmaxBottom = Math.sqrt(2 * g * st.h0); draw(); st.q = keep; st.qd = 0; st.vmaxBottom = 0;
  } else { draw(); go(); }
};

/* enzyme */
(window.SIMS = window.SIMS || {}).enzyme = function (el, opt) {
  const MODES = { temp: '溫度', ph: 'pH', sub: '受質濃度' };
  const ENZ = [['pepsin', '胃蛋白酶', 2, 'var(--c-X)'], ['amylase', '唾液澱粉酶', 6.8, 'var(--c-P)'], ['trypsin', '胰蛋白酶', 8, 'var(--c-C)']];
  let mode = MODES[opt.mode] ? opt.mode : 'temp', T = 37, maxT = 37, pH = 6.8, enz = 1, S = 4, E2 = false;
  const KM = 2, X0 = 46, X1 = 346, Y0 = 200, Y1 = 22;
  const kT = (t) => Math.pow(2, (t - 37) / 10), nat = (t) => 1 / (1 + Math.exp((t - 41) / 2.5));
  let PEAK = 0; for (let t = 0; t <= 80; t += 0.1) PEAK = Math.max(PEAK, kT(t) * nat(t));
  const rT = (t, hist) => kT(t) * nat(Math.max(t, hist)) / PEAK;
  const rP = (p, o) => Math.exp(-Math.pow((p - o) / 1.3, 2));
  const rS = (s, e) => e * s / (KM + s);
  el.innerHTML = `<div class="sim-head"><b>影響酵素活性的因素</b><span>選擇變因並拖動滑桿，看反應速率在曲線上的位置。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 240" role="img" aria-label="反應速率曲線"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="mode">${Object.entries(MODES).map(([k, v]) => `<button type="button" data-mode="${k}">${v}</button>`).join('')}</div>
    <label class="sl"><span data-lab></span><input type="range"><output></output></label>
    <div class="ops" data-x="ph">${ENZ.map((e, i) => `<button type="button" data-enz="${i}">${e[1]}</button>`).join('')}</div>
    <div class="ops" data-x="temp"><button type="button" data-new>換一管新酵素</button></div>
    <div class="ops" data-x="sub"><button type="button" data-e2 aria-pressed="false">酵素量加倍</button></div>
    <div class="facts"><div class="fact"><span data-f="rl">相對反應速率</span><b data-f="r"></b></div><div class="fact"><span data-f="k2"></span><b data-f="v2"></b></div></div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg'), rng = q('input');
  const SET = { temp: [0, 80, 1, ' °C', '溫度'], ph: [0, 14, 0.1, '', 'pH'], sub: [0, 20, 0.2, '', '[S]'] };
  const val = () => (mode === 'temp' ? T : mode === 'ph' ? pH : S);
  function setMode(m) {
    mode = m; const [a, b, st, , lab] = SET[m];
    Object.assign(rng, { min: a, max: b, step: st }); rng.value = val(); q('[data-lab]').textContent = lab;
    el.querySelectorAll('[data-x]').forEach((x) => { x.style.display = x.dataset.x === m ? '' : 'none'; });
    render();
  }
  const sx = (x, a, b) => X0 + (x - a) / (b - a) * (X1 - X0), sy = (y, m) => Y0 - y / m * (Y0 - Y1);
  function path(f, a, b, ym, n = 160) { let d = ''; for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; d += (i ? 'L' : 'M') + sx(x, a, b).toFixed(1) + ',' + sy(f(x), ym).toFixed(1); } return d; }
  function axes(a, b, ticks, xl, ym) {
    let h = `<line x1="${X0}" y1="${Y0}" x2="${X1}" y2="${Y0}" stroke="var(--ink-2)"/><line x1="${X0}" y1="${Y0}" x2="${X0}" y2="${Y1 - 6}" stroke="var(--ink-2)"/>`;
    ticks.forEach((t) => { h += `<text x="${sx(t, a, b)}" y="${Y0 + 14}" font-size="12.5" text-anchor="middle" fill="var(--ink-2)">${t}</text>`; });
    h += `<text x="${X1}" y="${Y0 + 30}" font-size="12.5" text-anchor="end" fill="var(--ink)">${xl}</text>`;
    h += `<text x="12" y="${(Y0 + Y1) / 2}" font-size="12.5" fill="var(--ink)" transform="rotate(-90 12 ${(Y0 + Y1) / 2})" text-anchor="middle">反應速率（相對值）</text>`;
    [0, 0.5, 1].forEach((v) => { if (v * 1 <= ym) h += `<text x="${X0 - 4}" y="${sy(v, ym) + 4}" font-size="11.5" text-anchor="end" fill="var(--mute)">${v}</text>`; });
    return h;
  }
  const dot = (x, y, ym, a, b) => `<line x1="${sx(x, a, b)}" y1="${Y0}" x2="${sx(x, a, b)}" y2="${sy(y, ym)}" stroke="var(--red)" stroke-dasharray="3 3"/><circle cx="${sx(x, a, b)}" cy="${sy(y, ym)}" r="6" fill="var(--red)" stroke="var(--card)" stroke-width="2"/>`;
  function render() {
    let h = '', r, k2, v2, note;
    if (mode === 'temp') {
      h = axes(0, 80, [0, 20, 37, 60, 80], '溫度（°C）', 1.15);
      h += `<path d="${path((t) => rT(t, 0), 0, 80, 1.15)}" fill="none" stroke="var(--teal)" stroke-width="3"/>`;
      const denat = nat(maxT) / nat(T) < 0.97;
      if (denat) h += `<path d="${path((t) => rT(t, maxT), 0, maxT, 1.15, 120)}" fill="none" stroke="var(--red)" stroke-width="2" stroke-dasharray="6 4"/><text x="${sx(Math.min(maxT, 70), 0, 80)}" y="${Y1 + 4}" font-size="12.5" text-anchor="end" fill="var(--red)">曾加熱至 ${maxT} °C 後的活性</text>`;
      r = rT(T, maxT); h += dot(T, r, 1.15, 0, 80);
      k2 = '酵素狀態'; const dp = Math.round((1 - nat(maxT) / nat(T)) * 100); v2 = denat ? `${dp > 97 ? '已變性' : '已部分變性'}（${dp}%）` : T < 30 ? '低溫，活性低（可恢復）' : T <= 42 ? '接近最適溫度' : '高溫，開始變性';
      note = denat ? '先經高溫處理的酵素再降溫，活性回不來：高溫使蛋白質立體構造破壞（變性），通常不可逆。按「換一管新酵素」重來。' : '低溫只是分子動能小、碰撞少，回溫可恢復；超過最適溫度（人體酵素約 37 °C）後構造被破壞，活性急降。';
    } else if (mode === 'ph') {
      h = axes(0, 14, [0, 2, 4, 6, 8, 10, 12, 14], 'pH', 1.15);
      ENZ.forEach((e, i) => { h += `<path d="${path((p) => rP(p, e[2]), 0, 14, 1.15)}" fill="none" stroke="${e[3]}" stroke-width="${i === enz ? 3.2 : 1.4}" opacity="${i === enz ? 1 : 0.45}"/><text x="${sx(e[2], 0, 14) + (i === 2 ? 12 : i === 1 ? -12 : 0)}" y="${sy(1, 1.15) - 6}" font-size="12.5" text-anchor="middle" fill="${e[3]}" font-weight="${i === enz ? 700 : 400}">${e[1]}</text>`; });
      r = rP(pH, ENZ[enz][2]); h += dot(pH, r, 1.15, 0, 14);
      k2 = '最適 pH'; v2 = `${ENZ[enz][1]} 約 ${ENZ[enz][2]}`;
      note = ['胃液 pH 約 2，胃蛋白酶在此最活潑；進入小腸（偏鹼）就失去活性。', '唾液澱粉酶最適 pH 約 6.8；食團到胃中遇強酸即失去活性。', '胰蛋白酶在小腸偏鹼環境（pH 約 8）作用最佳。'][enz] + '偏離最適 pH 過多會使酵素變性。';
    } else {
      const ym = 2.15, e = E2 ? 2 : 1;
      h = axes(0, 20, [0, 2, 5, 10, 15, 20], '受質濃度 [S]（相對值）', ym);
      [1, 2].forEach((v) => { h += `<line x1="${X0}" x2="${X1}" y1="${sy(v, ym)}" y2="${sy(v, ym)}" stroke="var(--mute)" stroke-dasharray="4 4" opacity="${v === e ? 0.9 : 0.35}"/><text x="${X1}" y="${sy(v, ym) - 4}" font-size="11.5" text-anchor="end" fill="var(--mute)">V<tspan font-size="8" dy="2">max</tspan><tspan dy="-2">（酵素 ×${v}）</tspan></text>`; });
      if (E2) h += `<path d="${path((s) => rS(s, 1), 0, 20, ym)}" fill="none" stroke="var(--teal)" stroke-width="1.4" opacity=".45"/>`;
      h += `<path d="${path((s) => rS(s, e), 0, 20, ym)}" fill="none" stroke="var(--teal)" stroke-width="3"/>`;
      r = rS(S, e); h += dot(S, r, ym, 0, 20);
      k2 = 'v ＝ V<sub>max</sub>[S]/(K<sub>m</sub>＋[S])'; v2 = `${e}×${S.toFixed(1)}/(${KM}+${S.toFixed(1)}) = ${r.toFixed(2)}`;
      note = S < KM ? '受質少時，速率約與受質濃度成正比。' : S > 8 ? `活化位幾乎都被占用（飽和），再加受質速率增加有限；${E2 ? '酵素量加倍使最大速率加倍。' : '增加酵素量才能提高最大速率。'}` : '受質增加，速率上升但漸趨平緩。';
    }
    svg.innerHTML = h;
    q('output').textContent = (mode === 'ph' ? pH.toFixed(1) : mode === 'sub' ? S.toFixed(1) : T) + SET[mode][3];
    q('[data-f="rl"]').textContent = mode === 'sub' ? '反應速率（酵素 ×1 的 Vmax＝1）' : '相對反應速率（最大值＝100%）';
    q('[data-f="r"]').textContent = mode === 'sub' ? r.toFixed(2) : `${Math.round(r * 100)} %`;
    q('[data-f="k2"]').innerHTML = k2; q('[data-f="v2"]').textContent = v2; q('[data-note]').textContent = note;
    el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    el.querySelectorAll('[data-enz]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.enz === enz));
  }
  rng.addEventListener('input', () => {
    const v = +rng.value;
    if (mode === 'temp') { T = v; maxT = Math.max(maxT, T); } else if (mode === 'ph') pH = v; else S = v;
    render();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) return setMode(b.dataset.mode);
    if (b.dataset.enz) { enz = +b.dataset.enz; pH = ENZ[enz][2]; rng.value = pH; }
    if (b.hasAttribute('data-new')) maxT = T;
    if (b.hasAttribute('data-e2')) { E2 = !E2; b.setAttribute('aria-pressed', E2); }
    render();
  });
  setMode(mode);
};

/* fitline */
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

/* freefall */
(window.SIMS = window.SIMS || {}).freefall = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>鉛直上拋與落體</b><span>調整初速 v₀（向上為正）與拋出高度，看球的高度–時間圖與最高點、落地時間。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 300" role="img" aria-label="鉛直拋體動畫與高度時間圖"></svg></div>
<div class="sim-ctl">
${sl('v0', 'v₀', -20, 20, 1, 15)}${sl('h0', '拋出高度', 0, 40, 1, 20)}
<div class="ops"><button type="button" data-b="play">播放</button><button type="button" data-p="15">上拋</button><button type="button" data-p="0">自由落體</button><button type="button" data-p="-10">下拋</button></div>
<div class="ops"><button type="button" data-g="9.8" aria-pressed="true">g = 9.8 m/s²</button><button type="button" data-g="10" aria-pressed="false">g = 10 m/s²</button></div>
<div class="facts">${fact('H', '最大高度（離地）h₀ + v₀²/2g')}${fact('tt', '到最高點時間 v₀/g')}${fact('tl', '落地時間')}${fact('vl', '落地速率 √(v₀² + 2gh₀)')}${fact('now', '此刻 t、高度、速度 v')}</div>
<p class="sim-note">加速度全程為 −g：最高點時 v = 0，但 a 仍向下；上升與下降經過同一高度時速率相同、方向相反。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { v0: 15, h0: 20, g: 9.8, t: 0 };
  const yAt = (t) => P.h0 + P.v0 * t - 0.5 * P.g * t * t;
  const vAt = (t) => P.v0 - P.g * t;
  const tLand = () => (P.v0 + Math.sqrt(P.v0 * P.v0 + 2 * P.g * P.h0)) / P.g;
  const Hmax = () => P.h0 + (P.v0 > 0 ? (P.v0 * P.v0) / (2 * P.g) : 0);
  function draw() {
    const tl = tLand(), H = Hmax(), t = Math.min(P.t, tl);
    const top = Math.max(H, 5) * 1.12, T = Math.max(tl, 0.5) * 1.05;
    const Y = (h) => 270 - (h / top) * 245;
    const GX = (tt) => 150 + (tt / T) * 196;
    let s = '';
    // ground + platform
    s += `<rect x="0" y="270" width="360" height="30" style="fill:var(--c-E);opacity:.18"/><line x1="0" x2="360" y1="270" y2="270" style="stroke:var(--c-E)" stroke-width="2"/>`;
    if (P.h0 > 0) s += `<rect x="34" y="${Y(P.h0)}" width="52" height="${270 - Y(P.h0)}" style="fill:var(--line)"/><line x1="30" x2="88" y1="${Y(P.h0)}" y2="${Y(P.h0)}" style="stroke:var(--ink-2)" stroke-width="2"/>`;
    s += `<line x1="0" x2="350" y1="${Y(H)}" y2="${Y(H)}" style="stroke:var(--sun)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="4" y="${Y(H) - 4}" font-size="11" style="fill:var(--ink-2)">最高 ${f(H, 1)} m</text>`;
    // axes
    s += `<line x1="150" x2="150" y1="20" y2="270" style="stroke:var(--ink-2)"/>`;
    for (let k = 1; k <= 4; k++) { const h = (top / 1.12) * k / 4; s += `<text x="146" y="${Y(h) + 4}" text-anchor="end" font-size="10" style="fill:var(--mute)">${f(h, 0)}</text>`; }
    s += `<text x="154" y="16" font-size="11" style="fill:var(--mute)">高度 (m)</text><text x="352" y="296" text-anchor="end" font-size="10" style="fill:var(--mute)">t (s)</text>`;
    const step = T > 4 ? 1 : 0.5;
    for (let k = step; k < T; k += step) s += `<line x1="${GX(k)}" x2="${GX(k)}" y1="270" y2="275" style="stroke:var(--ink-2)"/><text x="${GX(k)}" y="284" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text>`;
    let d = '';
    for (let i = 0; i <= 100; i++) { const tt = (i / 100) * tl; d += (i ? 'L' : 'M') + GX(tt).toFixed(1) + ' ' + Y(yAt(tt)).toFixed(1); }
    s += `<path d="${d}" fill="none" style="stroke:var(--teal)" stroke-width="2.2"/>`;
    if (P.v0 > 0) s += `<line x1="${GX(P.v0 / P.g)}" x2="${GX(P.v0 / P.g)}" y1="${Y(H)}" y2="270" style="stroke:var(--sun)" stroke-dasharray="3 3"/>`;
    s += `<circle cx="${GX(t)}" cy="${Y(yAt(t))}" r="4.5" style="fill:var(--teal);stroke:#fff" stroke-width="1.5"/>`;
    // ball + velocity / acceleration arrows
    const by = Y(yAt(t)) - 8, v = vAt(t);
    s += `<line x1="96" x2="96" y1="20" y2="270" style="stroke:var(--line)" stroke-dasharray="2 3"/>`;
    const vl = Math.max(-60, Math.min(60, -v * 2.5));
    if (Math.abs(vl) > 3) s += `<line x1="114" x2="114" y1="${by}" y2="${by + vl}" style="stroke:var(--c-P)" stroke-width="2.5"/><path d="M114 ${by + vl} l-4 ${vl > 0 ? -7 : 7} h8z" style="fill:var(--c-P)"/><text x="120" y="${by + vl / 2 + 4}" font-size="11" font-style="italic" style="fill:var(--c-P)">v</text>`;
    s += `<line x1="134" x2="134" y1="${by}" y2="${by + 22}" style="stroke:var(--red)" stroke-width="2"/><path d="M134 ${by + 24} l-4 -7 h8z" style="fill:var(--red)"/><text x="139" y="${by + 18}" font-size="11" style="fill:var(--red)">g</text>`;
    s += `<circle cx="96" cy="${by}" r="8" style="fill:var(--c-C);stroke:#fff" stroke-width="2"/>`;
    svg.innerHTML = s;
    $('[data-f=H]').textContent = `${f(H, 2)} m`;
    $('[data-f=tt]').textContent = P.v0 > 0 ? `${f(P.v0 / P.g, 2)} s` : '—（不上升）';
    $('[data-f=tl]').textContent = tl > 0 ? `${f(tl, 2)} s` : '0 s（已在地面）';
    $('[data-f=vl]').textContent = `${f(Math.sqrt(P.v0 * P.v0 + 2 * P.g * P.h0), 2)} m/s`;
    $('[data-f=now]').textContent = `${f(t, 2)} s，${f(yAt(t), 1)} m，${f(v, 1)} m/s`;
    $('[data-o=v0]').textContent = `${f(P.v0, 0)} m/s`;
    $('[data-o=h0]').textContent = `${f(P.h0, 0)} m`;
  }
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0, hold = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    const tl = tLand();
    if (P.t >= tl) { hold += dt; if (hold > 1) { hold = 0; P.t = 0; } } else P.t = Math.min(tl, P.t + dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => { if (!playing && P.t >= tLand()) P.t = 0; play(!playing); });
  const restart = () => { P.t = RM ? Math.max(0, P.v0 / P.g) : 0; hold = 0; draw(); };
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => { P[k] = parseFloat(inp[k].value); restart(); }));
  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    P.v0 = +b.dataset.p; inp.v0.value = P.v0; restart(); if (!RM) play(true);
  }));
  el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
    P.g = +b.dataset.g;
    el.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    restart();
  }));
  if (opt.g === 10) $('[data-g="10"]').click();
  restart();
  play(!RM);
};

/* friction */
(window.SIMS = window.SIMS || {}).friction = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>靜摩擦力與動摩擦力</b><span>由靜止開始以水平力 F 推木箱，拖動 F、m、μs、μk，看摩擦力 f 如何決定。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 290" role="img" aria-label="水平面上的木箱與 f–F 圖"></svg></div>
<div class="sim-ctl">
${sl('F', '推力 F', 0, 60, 1, 20)}${sl('m', 'm', 1, 10, 0.5, 5)}${sl('us', 'μs', 0.05, 1, 0.05, 0.5)}${sl('uk', 'μk', 0.05, 1, 0.05, 0.4)}
<div class="ops"><button type="button" data-g="10" aria-pressed="true">g = 10 m/s²</button><button type="button" data-g="9.8" aria-pressed="false">g = 9.8 m/s²</button></div>
<div class="facts">${fact('N', '正向力 N = mg')}${fact('fs', '最大靜摩擦力 μsN')}${fact('fk', '動摩擦力 μkN')}${fact('f', '摩擦力 f')}${fact('a', '加速度 a = (F − f)/m')}</div>
<p class="sim-note">未滑動時 f 由力平衡決定，等於推力（不是 μsN）；F 超過 μsN 才滑動，此後 f = μkN 固定。μs 只決定滑動的門檻。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { F: 20, m: 5, us: 0.5, uk: 0.4, g: 10 };
  let off = 0;
  function state() {
    const N = P.m * P.g, fs = P.us * N, fk = P.uk * N;
    const slide = P.F > fs + 1e-9;
    const fr = slide ? fk : P.F;
    return { N, fs, fk, slide, fr, a: slide ? (P.F - fk) / P.m : 0 };
  }
  function arrow(x1, y1, x2, y2, col, w) {
    const ang = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(ang), s = Math.sin(ang);
    return `<line x1="${x1}" y1="${y1}" x2="${x2 - 6 * c}" y2="${y2 - 6 * s}" style="stroke:${col}" stroke-width="${w}"/><path d="M${x2} ${y2} L${x2 - 9 * c + 4 * s} ${y2 - 9 * s - 4 * c} L${x2 - 9 * c - 4 * s} ${y2 - 9 * s + 4 * c}Z" style="fill:${col}"/>`;
  }
  function draw() {
    const S = state();
    let s = '';
    // floor
    s += `<rect x="0" y="104" width="360" height="14" style="fill:var(--c-E);opacity:.18"/><line x1="0" x2="360" y1="104" y2="104" style="stroke:var(--c-E)" stroke-width="2"/>`;
    for (let k = 0; k < 360; k += 16) s += `<line x1="${k}" y1="118" x2="${k + 10}" y2="106" style="stroke:var(--c-E);opacity:.4"/>`;
    const bw = 56 + P.m * 2, bh = 40 + P.m, bx = 150 + off, by = 104 - bh;
    s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" style="fill:var(--c-C);opacity:.85"/><text x="${bx + bw / 2}" y="${by + bh / 2 + 4}" text-anchor="middle" font-size="11" style="fill:#fff">${f(P.m, 1)} kg</text>`;
    const pf = P.F * 1.6;
    if (pf > 1) s += arrow(bx - pf - 2, by + bh / 2, bx - 2, by + bh / 2, 'var(--red)', 3) + `<text x="${bx - pf / 2 - 2}" y="${by + bh / 2 - 8}" text-anchor="middle" font-size="11" style="fill:var(--red)">F</text>`;
    const ff = S.fr * 1.6, fx = bx + bw / 2;
    if (ff > 1) s += arrow(fx, 111, fx - ff, 111, 'var(--c-P)', 3) + `<text x="${fx - ff / 2}" y="132" text-anchor="middle" font-size="11" style="fill:var(--c-P)">f = ${f(S.fr, 1)} N</text>`;
    s += `<text x="10" y="20" font-size="12" style="fill:${S.slide ? 'var(--red)' : 'var(--green)'}">${S.slide ? '滑動中：動摩擦力 f = μkN' : (Math.abs(P.F - S.fs) < 1e-9 ? '臨界（即將滑動）：f = μsN' : '靜止：靜摩擦力 f = F')}</text>`;
    // f-F graph
    const GX = (F) => 46 + (F / 60) * 300, GY = (v) => 274 - (v / 60) * 120;
    s += `<rect x="46" y="154" width="300" height="120" style="fill:var(--card);stroke:var(--line)"/>`;
    for (let k = 20; k < 60; k += 20) s += `<line x1="${GX(k)}" x2="${GX(k)}" y1="154" y2="274" style="stroke:var(--line)" stroke-dasharray="2 3"/><line x1="46" x2="346" y1="${GY(k)}" y2="${GY(k)}" style="stroke:var(--line)" stroke-dasharray="2 3"/>`;
    for (let k = 0; k <= 60; k += 20) s += `<text x="${GX(k)}" y="287" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text><text x="42" y="${GY(k) + 4}" text-anchor="end" font-size="10" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="8" y="150" font-size="10" style="fill:var(--mute)">f (N)</text><text x="296" y="287" text-anchor="middle" font-size="10" style="fill:var(--mute)">F (N)</text>`;
    const fsC = Math.min(S.fs, 60);
    let d = `M${GX(0)} ${GY(0)} L${GX(fsC)} ${GY(fsC)}`;
    if (S.fs < 60) d += ` L${GX(S.fs)} ${GY(S.fk)} L${GX(60)} ${GY(S.fk)}`;
    if (S.fs < 60) s += `<line x1="46" x2="346" y1="${GY(S.fs)}" y2="${GY(S.fs)}" style="stroke:var(--sun)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="50" y="${GY(S.fs) - 4}" font-size="10" style="fill:var(--ink-2)">μsN = ${f(S.fs, 1)}</text>`;
    if (S.fk <= 60) s += `<text x="342" y="${GY(S.fk) + 13 > 270 ? GY(S.fk) - 4 : GY(S.fk) + 13}" text-anchor="end" font-size="10" style="fill:var(--c-P)">μkN = ${f(S.fk, 1)}</text>`;
    s += `<path d="${d}" fill="none" style="stroke:var(--c-P)" stroke-width="2.2"/>`;
    s += `<circle cx="${GX(P.F)}" cy="${GY(Math.min(S.fr, 60))}" r="5.5" style="fill:var(--red);stroke:#fff" stroke-width="1.5"/>`;
    svg.innerHTML = s;
    $('[data-f=N]').textContent = `${f(S.N, 1)} N`;
    $('[data-f=fs]').textContent = `${f(S.fs, 1)} N`;
    $('[data-f=fk]').textContent = `${f(S.fk, 1)} N`;
    $('[data-f=f]').textContent = `${f(S.fr, 1)} N（${S.slide ? '動' : '靜'}摩擦）`;
    $('[data-f=a]').textContent = S.slide ? `(${f(P.F, 0)} − ${f(S.fk, 1)}) / ${f(P.m, 1)} = ${f(S.a, 2)} m/s²` : '0（不動）';
    $('[data-o=F]').textContent = `${f(P.F, 0)} N`;
    $('[data-o=m]').textContent = `${f(P.m, 1)} kg`;
    $('[data-o=us]').textContent = f(P.us, 2);
    $('[data-o=uk]').textContent = f(P.uk, 2);
  }
  let raf = 0, last = 0;
  function frame(ts) {
    if (!el.isConnected) { raf = 0; return; }
    const S = state();
    if (!S.slide) { raf = 0; off = 0; draw(); return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    off += (25 + S.a * 12) * dt;
    if (off > 150) off = -40;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function update() {
    off = state().slide ? off : 0;
    draw();
    if (!RM && state().slide && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => {
    P[k] = parseFloat(inp[k].value);
    if (k === 'uk' && P.uk > P.us) { P.uk = P.us; inp.uk.value = P.uk; }
    if (k === 'us' && P.uk > P.us) { P.uk = P.us; inp.uk.value = P.uk; }
    update();
  }));
  el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
    P.g = +b.dataset.g;
    el.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    update();
  }));
  if (opt.F != null) { P.F = +opt.F; inp.F.value = P.F; }
  update();
};

/* gas */
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

/* heat */
(window.SIMS = window.SIMS || {}).heat = function (el, opt) {
  const MAT = { 水: 4186, 鋁: 900, 鐵: 450, 銅: 385 };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = [{ mat: '鐵', m: 200, T: 90, col: 'var(--red)', n: '甲' }, { mat: '水', m: 200, T: 20, col: 'var(--c-P)', n: '乙' }];
  const TEND = 5; let t = reduce ? TEND : 0;
  const opts = Object.keys(MAT).map((k) => `<option value="${k}">${k}（c = ${MAT[k]}）</option>`).join('');
  const ctl = (i) => `<label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span style="color:${S[i].col};font-weight:700">${S[i].n}</span><select data-i="${i}" aria-label="${S[i].n}的物質">${opts}</select></label>
    <label class="sl"><span>m${'₁₂'[i]}</span><input type="range" data-i="${i}" data-k="m" min="50" max="500" step="10" value="${S[i].m}"><output></output></label>
    <label class="sl"><span>T${'₁₂'[i]}</span><input type="range" data-i="${i}" data-k="T" min="0" max="100" step="1" value="${S[i].T}"><output></output></label>`;
  el.innerHTML = `<div class="sim-head"><b>混合的熱平衡</b><span>選兩種物質、設定質量與初溫，按「混合」看兩者溫度如何趨向共同的末溫。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 440 270" role="img" aria-label="溫度計與溫度–時間圖"></svg></div>
  <div class="sim-ctl">${ctl(0)}${ctl(1)}
    <div class="ops"><button type="button" data-mix>混合</button></div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>末溫 T = (m₁c₁T₁ + m₂c₂T₂) / (m₁c₁ + m₂c₂)</span><b data-f="Tf"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>放熱 Q放 = mcΔT（m 用 kg）</span><b data-f="qo"></b></div><div class="fact" style="grid-column:1/-1"><span>吸熱 Q吸 = mcΔT</span><b data-f="qi"></b></div>
      <div class="fact"><span>熱容量 C₁ = m₁c₁</span><b data-f="c1"></b></div><div class="fact"><span>熱容量 C₂ = m₂c₂</span><b data-f="c2"></b></div></div>
    <p class="sim-note">Q放 = Q吸：熱容量（mc）較大的一方溫度變化較小，末溫偏向它的初溫；水的比熱特別大，所以金屬放進水中，水溫只升高一點。（設無散熱、無相變，比熱單位 J/(kg·K)）</p>
  </div></div>`;
  el.querySelectorAll('select').forEach((s) => { s.value = S[s.dataset.i].mat; });
  const svg = el.querySelector('svg'), $ = (s) => el.querySelector(s);
  const TY = (T) => 230 - T * 1.8, GX0 = 170, GX1 = 428;
  const fmtQ = (q) => (Math.abs(q) >= 1000 ? (q / 1000).toFixed(2) + ' kJ' : q.toFixed(0) + ' J');
  function calc() {
    const C = S.map((s) => (s.m / 1000) * MAT[s.mat]), Tf = (C[0] * S[0].T + C[1] * S[1].T) / (C[0] + C[1]);
    return { C, Tf };
  }
  function draw() {
    const { C, Tf } = calc(), k = t >= TEND ? 0 : Math.exp(-t), Tn = S.map((s) => Tf + (s.T - Tf) * k);
    let s = '';
    for (let T = 0; T <= 100; T += 20) s += `<line x1="${GX0}" y1="${TY(T)}" x2="${GX1}" y2="${TY(T)}" stroke="var(--line)"/><text x="${GX0 - 4}" y="${TY(T) + 4}" font-size="12" text-anchor="end" fill="var(--mute)">${T}</text>`;
    s += `<text x="${GX0 - 4}" y="22" font-size="12" text-anchor="end" fill="var(--ink-2)">°C</text><text x="${GX1}" y="252" font-size="12" text-anchor="end" fill="var(--ink-2)">時間 →</text>`;
    s += `<line x1="${GX0}" y1="${TY(Tf)}" x2="${GX1}" y2="${TY(Tf)}" stroke="var(--teal)" stroke-dasharray="5 4"/><text x="${GX1}" y="${TY(Tf) - 7}" font-size="13" text-anchor="end" fill="var(--teal)" paint-order="stroke" stroke="var(--bg)" stroke-width="4">末溫 ${Tf.toFixed(1)} °C</text>`;
    S.forEach((o, i) => {
      const pts = []; for (let u = 0; u <= t + 1e-9; u += 0.05) pts.push(`${(GX0 + (u / TEND) * (GX1 - GX0)).toFixed(1)},${TY(Tf + (o.T - Tf) * Math.exp(-u)).toFixed(1)}`);
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${o.col}" stroke-width="2.5"/>`;
      const x = 40 + i * 62;
      s += `<rect x="${x - 7}" y="${TY(100) - 8}" width="14" height="${TY(0) - TY(100) + 12}" rx="7" fill="var(--card)" stroke="var(--ink-2)"/>`;
      s += `<rect x="${x - 3.5}" y="${TY(Tn[i])}" width="7" height="${TY(0) - TY(Tn[i]) + 6}" fill="${o.col}"/><circle cx="${x}" cy="${TY(0) + 14}" r="11" fill="${o.col}" stroke="var(--ink-2)"/>`;
      s += `<text x="${x}" y="${TY(0) + 36}" font-size="13" text-anchor="middle" fill="${o.col}" font-weight="700">${o.n}・${o.mat}</text><text x="${x + 10}" y="${TY(Tn[i]) + 4}" font-size="12.5" fill="${o.col}">${Tn[i].toFixed(1)}°</text>`;
    });
    svg.innerHTML = s;
    S.forEach((o, i) => { $(`[data-i="${i}"][data-k="m"] + output`).textContent = o.m + ' g'; $(`[data-i="${i}"][data-k="T"] + output`).textContent = o.T + ' °C'; });
    const hot = S[0].T >= S[1].T ? 0 : 1, cold = 1 - hot;
    const q = (i) => `${(S[i].m / 1000).toFixed(2)}×${MAT[S[i].mat]}×${Math.abs(S[i].T - Tf).toFixed(1)}`;
    $('[data-f="Tf"]').textContent = `${Tf.toFixed(1)} °C`;
    $('[data-f="qo"]').textContent = S[0].T === S[1].T ? '0（溫度相同，無熱流）' : `${S[hot].n}：${q(hot)} = ${fmtQ(C[hot] * (S[hot].T - Tf))}`;
    $('[data-f="qi"]').textContent = S[0].T === S[1].T ? '0' : `${S[cold].n}：${q(cold)} = ${fmtQ(C[cold] * (Tf - S[cold].T))}`;
    $('[data-f="c1"]').textContent = C[0].toFixed(0) + ' J/K'; $('[data-f="c2"]').textContent = C[1].toFixed(0) + ' J/K';
  }
  let last = 0, running = false;
  function frame(ts) {
    if (!el.isConnected) { running = false; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts; t = Math.min(TEND, t + dt * 1.6); draw();
    if (t < TEND) requestAnimationFrame(frame); else running = false;
  }
  function mix() { t = 0; if (!running) { running = true; last = 0; requestAnimationFrame(frame); } }
  el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => { S[inp.dataset.i][inp.dataset.k] = Number(inp.value); t = TEND; draw(); }));
  el.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => { S[sel.dataset.i].mat = sel.value; t = TEND; draw(); }));
  $('[data-mix]').addEventListener('click', mix);
  draw(); if (!reduce) mix();
};

/* humidity */
(window.SIMS = window.SIMS || {}).humidity = function (el, opt) {
  const SM = (t) => 216.7 * 6.112 * Math.exp(17.67 * t / (t + 243.5)) / (t + 273.15);
  const TAB = [4.8, 5.2, 5.6, 5.9, 6.4, 6.8, 7.3, 7.7, 8.3, 8.8, 9.4, 10.0, 10.7, 11.3, 12.1, 12.8, 13.6, 14.5, 15.4, 16.3, 17.3, 18.3, 19.4, 20.6, 21.8, 23.0, 24.4, 25.7, 27.2, 28.7, 30.3, 32.0, 33.8, 35.6, 37.6, 39.6];
  const S = (t) => { // 飽和水氣量 g/m³：0–35 °C 用講義表格內插，35–40 °C 以公式接到 40 °C 的 51.1
    if (t < 0) return SM(t) * 4.8 / SM(0);
    if (t <= 35) { const i = Math.min(34, Math.floor(t)); return TAB[i] + (TAB[i + 1] - TAB[i]) * (t - i); }
    const f = (t - 35) / 5; return SM(t) * ((1 - f) * 39.6 / SM(35) + f * 51.1 / SM(40));
  };
  const dew = (w) => { let a = -40, b = 60; for (let i = 0; i < 50; i++) { const c = (a + b) / 2; if (S(c) < w) a = c; else b = c; } return (a + b) / 2; };
  const PRE = [['圖 E7-4 的 A 點', 30, 17.3], ['寒流清晨 8 °C、RH 95%', 8, 0.95 * S(8)], ['夏季午後 33 °C、RH 50%', 33, 0.5 * S(33)]];
  const st = { T: 30, w: 17.3, Tc: 15 };
  const f1 = (v) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1).replace('-', '−');
  el.innerHTML = `<div class="sim-head"><b>飽和水氣量、相對濕度與露點</b><span>拖動圖上的空氣狀態點（或滑桿），再把空氣冷卻，看相對濕度、露點與凝結量。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 285" role="img" aria-label="飽和水氣量曲線" style="cursor:crosshair"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>氣溫 T</span><input type="range" data-k="T" min="0" max="40" step="0.5"><output></output></label>
    <label class="sl"><span>水氣量</span><input type="range" data-k="w" min="0.5" max="52" step="0.1"><output></output></label>
    <label class="sl"><span>冷卻至 T′</span><input type="range" data-k="Tc" min="0" max="40" step="0.5"><output></output></label>
    <div class="ops">${PRE.map((p, i) => `<button type="button" data-v="${i}">${p[0]}</button>`).join('')}</div>
    <div class="facts"></div>
    <p class="sim-note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note');
  const inputs = [...el.querySelectorAll('input[type=range]')];
  const X = (t) => 50 + t * 9, Y = (w) => 248 - w * 4.2, T_ = (x) => (x - 50) / 9, W_ = (y) => (248 - y) / 4.2;
  const curve = (a, b) => { const p = []; for (let t = a; t <= b + 1e-9; t += 0.5) p.push(`${X(t).toFixed(1)} ${Y(S(t)).toFixed(1)}`); return p; };
  const lab = (x, y, s, c, a = 'start', fs = 14) => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="${fs}" fill="${c}" stroke="var(--card)" stroke-width="3" paint-order="stroke">${s}</text>`;
  function draw() {
    const { T, w, Tc } = st, sT = S(T), Td = dew(w), rh = w / sT * 100, sat = w > sT;
    let s = `<rect x="${X(0)}" y="${Y(52)}" width="${X(40) - X(0)}" height="${Y(0) - Y(52)}" fill="var(--card)"/>`;
    const c = curve(0, 40);
    s += `<path d="M${X(0)} ${Y(0)}L${c.join('L')}L${X(40)} ${Y(0)}Z" fill="var(--teal)" fill-opacity=".1"/>`;
    s += `<path d="M${X(0)} ${Y(52)}L${curve(0, 39.5).filter((p) => Number(p.split(' ')[1]) >= Y(52)).join('L')}L${X(40)} ${Y(52)}Z" fill="var(--red)" fill-opacity=".08"/>`;
    for (let t = 0; t <= 40; t += 5) s += `<line x1="${X(t)}" y1="${Y(0)}" x2="${X(t)}" y2="${Y(52)}" stroke="var(--line)"/><text x="${X(t)}" y="${Y(0) + 16}" text-anchor="middle" font-size="13" fill="var(--ink-2)">${t}</text>`;
    for (let v = 0; v <= 50; v += 10) s += `<line x1="${X(0)}" y1="${Y(v)}" x2="${X(40)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${X(0) - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="13" fill="var(--ink-2)">${v}</text>`;
    s += `<text x="${X(20)}" y="281" text-anchor="middle" font-size="13" fill="var(--ink-2)">氣溫（°C）</text><text x="14" y="${Y(26)}" text-anchor="middle" font-size="13" fill="var(--ink-2)" transform="rotate(-90 14 ${Y(26)})">水氣量（g/m³）</text>`;
    s += `<path d="M${c.join('L')}" fill="none" stroke="var(--teal)" stroke-width="2.5"/>`;
    s += lab(X(3), Y(44), '過飽和區（多餘水氣凝結）', 'var(--red)', 'start', 14) + lab(X(39), Y(3), '未飽和區', 'var(--teal-2)', 'end', 14) + lab(X(33), Y(S(33)) + 4, '飽和曲線', 'var(--teal-2)', 'start', 13);
    // 冷卻路徑
    const B = Tc >= Td ? [Tc, w] : [Tc, S(Tc)];
    if (Math.abs(Tc - T) > 0.01) {
      if (Tc >= Td || sat) s += `<line x1="${X(T)}" y1="${Y(w)}" x2="${X(Math.max(Tc, sat ? T : Td))}" y2="${Y(w)}" stroke="var(--c-P)" stroke-width="2.5"/>`;
      else s += `<line x1="${X(T)}" y1="${Y(w)}" x2="${X(Td)}" y2="${Y(w)}" stroke="var(--c-P)" stroke-width="2.5"/><path d="M${curve(Math.ceil(Tc * 2) / 2, Td).reverse().join('L')}L${X(Tc)} ${Y(S(Tc))}" fill="none" stroke="var(--c-P)" stroke-width="3"/>`;
      if (Tc < Td) s += `<line x1="${X(Tc)}" y1="${Y(w)}" x2="${X(Tc)}" y2="${Y(S(Tc))}" stroke="var(--red)" stroke-width="4"/>` + lab(X(Tc) + 6, (Y(w) + Y(S(Tc))) / 2 + 5, `凝結 ${f1(w - S(Tc))}`, 'var(--red)', 'start', 13);
      s += `<circle cx="${X(B[0])}" cy="${Y(B[1])}" r="5" fill="var(--c-P)"/>` + lab(X(B[0]) - 6, Y(B[1]) + 18, 'B', 'var(--c-P)', 'end');
    }
    if (!sat) s += `<line x1="${X(T)}" y1="${Y(w)}" x2="${X(T)}" y2="${Y(sT)}" stroke="var(--ink-2)" stroke-dasharray="3 3"/><circle cx="${X(T)}" cy="${Y(sT)}" r="3.5" fill="var(--teal)"/>`;
    if (Td >= 0 && Td <= 40) s += `<circle cx="${X(Td)}" cy="${Y(w)}" r="4" fill="var(--card)" stroke="var(--c-P)" stroke-width="2"/><line x1="${X(Td)}" y1="${Y(w)}" x2="${X(Td)}" y2="${Y(0)}" stroke="var(--c-P)" stroke-dasharray="2 3"/>` + lab(X(Td), Y(0) - 6, `露點 ${f1(Td)}`, 'var(--c-P)', 'middle', 13);
    s += `<circle cx="${X(T)}" cy="${Y(w)}" r="9" fill="var(--c-C)" stroke="var(--card)" stroke-width="2.5" style="cursor:grab"/>` + lab(X(T) + (T > 33 ? -12 : 12), Y(w) - 10, 'A', 'var(--c-C)', T > 33 ? 'end' : 'start', 16);
    svg.innerHTML = s;
    const fact = (k, v, full) => `<div class="fact"${full ? ' style="grid-column:1/-1"' : ''}><span>${k}</span><b>${v}</b></div>`;
    let cool;
    if (Tc >= T - 0.01 && !sat) cool = fact(Tc > T + 0.01 ? `加熱至 ${f1(Tc)} °C（水氣量不變）` : '冷卻至 T′', Tc > T + 0.01 ? `RH = ${f1(w)} ÷ ${f1(S(Tc))} = ${Math.round(w / S(Tc) * 100)}%，露點不變` : '請把 T′ 調得比氣溫低', 1);
    else if (Tc >= Td) cool = fact(`冷卻至 ${f1(Tc)} °C`, `尚未達露點，不凝結；RH = ${f1(w)} ÷ ${f1(S(Tc))} = ${Math.round(w / S(Tc) * 100)}%`, 1);
    else cool = fact(`冷卻至 ${f1(Tc)} °C（低於露點）`, `凝結 = S(T<sub>d</sub>) − S(T′) = ${f1(w)} − ${f1(S(Tc))} = ${f1(w - S(Tc))} g/m³`, 1);
    facts.innerHTML = fact('實際水氣量', `${f1(w)} g/m³`) + fact(`飽和水氣量 S(${f1(T)} °C)`, `${f1(sT)} g/m³`) +
      fact('相對濕度 = 實際 ÷ 飽和 × 100%', `${f1(w)} ÷ ${f1(sT)} = ${Math.round(rh)}%${sat ? '（過飽和）' : ''}`, 1) +
      fact('露點 T<sub>d</sub>（S(T<sub>d</sub>) = 實際水氣量）', `${f1(Td)} °C`) + fact('溫度露點差 T − T<sub>d</sub>', `${f1(T - Td)} °C`) + cool;
    note.textContent = sat ? `A 點在曲線上方（過飽和）：多出的 ${f1(w - sT)} g/m³ 水氣會凝結，直到回到飽和曲線上。`
      : '露點只由水氣量決定：A 點水平向左移到曲線，所對應的溫度就是露點。再降溫時沿曲線下滑，曲線向上彎，所以高溫時同樣降溫凝結得較多。';
  }
  function sync() {
    inputs.forEach((i) => { const k = i.dataset.k; i.value = st[k]; i.nextElementSibling.textContent = k === 'w' ? `${f1(st.w)} g/m³` : `${f1(st[k])} °C`; });
    draw();
  }
  inputs.forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); sync(); }));
  el.querySelector('.ops').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const p = PRE[b.dataset.v]; st.T = p[1]; st.w = Math.round(p[2] * 10) / 10; st.Tc = Math.max(0, Math.round(dew(st.w) * 2) / 2 - 5); sync();
  });
  let down = false;
  const move = (e) => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * 420 / r.width, y = (e.clientY - r.top) * 285 / r.height;
    st.T = Math.round(Math.max(0, Math.min(40, T_(x))) * 2) / 2; st.w = Math.round(Math.max(0.5, Math.min(52, W_(y))) * 10) / 10; sync();
  };
  svg.addEventListener('pointerdown', (e) => { down = true; svg.setPointerCapture(e.pointerId); move(e); });
  svg.addEventListener('pointermove', (e) => { if (down) move(e); });
  svg.addEventListener('pointerup', () => { down = false; });
  sync();
};

/* hw */
(window.SIMS = window.SIMS || {}).hw = function (el, opt) {
  let mode = opt.mode === 'selection' ? 'selection' : 'hw', p = 0.7, q0 = 0.5, w = 0, G = 100, N = 0, runs = [];
  const NS = [0, 500, 50, 10];
  el.innerHTML = `<div class="sim-head"><b>哈溫平衡與天擇</b><span>拖動對偶基因頻率看基因型頻率；切換到天擇，看 a 的頻率逐代如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 250" role="img" aria-label="基因型頻率或對偶基因頻率圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-m="hw">哈溫平衡</button><button type="button" data-m="selection">天擇（aa 受淘汰）</button></div>
    <div data-w="hw" style="display:grid;gap:8px"><label class="sl"><span>p（A）</span><input type="range" data-v="p" min="0" max="1" step="0.01" value="${p}"><output></output></label></div>
    <div data-w="selection" style="display:grid;gap:8px">
      <label class="sl"><span>起始 q₀</span><input type="range" data-v="q0" min="0.02" max="0.98" step="0.01" value="${q0}"><output></output></label>
      <label class="sl"><span>aa 適存度</span><input type="range" data-v="w" min="0" max="1" step="0.05" value="${w}"><output></output></label>
      <label class="sl"><span>代數</span><input type="range" data-v="G" min="10" max="200" step="10" value="${G}"><output></output></label>
      <div class="ops" data-n>${NS.map((n) => `<button type="button" data-ns="${n}">${n ? 'N = ' + n : '族群極大'}</button>`).join('')}<button type="button" data-re>重新模擬漂變</button></div>
    </div>
    <div class="facts" data-facts></div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg');
  const fmt = (x, d = 3) => (Math.abs(x) < 0.001 && x !== 0 ? x.toExponential(1) : x.toFixed(d));
  const fact = (a, b) => `<div class="fact"><span>${a}</span><b>${b}</b></div>`;
  const next = (qq) => { const s = 1 - w; return (qq - s * qq * qq) / (1 - s * qq * qq); }; // q' = (pq + w q²)/(1 − s q²)
  function binom(n, pr) { let k = 0; for (let i = 0; i < n; i++) if (Math.random() < pr) k++; return k; }
  function simulate() {
    runs = [];
    if (!N) return;
    for (let r = 0; r < 6; r++) { let x = q0; const a = [x]; for (let g = 0; g < G; g++) { x = binom(2 * N, next(x)) / (2 * N); a.push(x); } runs.push(a); }
  }
  function drawHW() {
    const Q = 1 - p, S = 170, X = 34, Y = 40, sp = S * p, cols = ['var(--c-P)', 'var(--c-X)', 'var(--c-C)'];
    let h = `<text x="${X}" y="16" font-size="12" fill="var(--ink-2)">卵（上）× 精子（左），面積＝機率</text>`;
    h += `<text x="${X + sp / 2}" y="${Y - 5}" font-size="12" text-anchor="middle" fill="var(--ink)">${sp > 30 ? 'A：p' : ''}</text><text x="${X + sp + (S - sp) / 2}" y="${Y - 5}" font-size="12" text-anchor="middle" fill="var(--ink)">${S - sp > 30 ? 'a：q' : ''}</text>`;
    const cell = (x, y, ww, hh, c, t) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${c}" opacity=".8" stroke="var(--card)" stroke-width="1.5"/>${ww > 26 && hh > 16 ? `<text x="${x + ww / 2}" y="${y + hh / 2 + 4}" font-size="12" text-anchor="middle" fill="#fff" font-weight="700">${t}</text>` : ''}`;
    h += cell(X, Y, sp, sp, cols[0], 'AA') + cell(X + sp, Y, S - sp, sp, cols[1], 'Aa') + cell(X, Y + sp, sp, S - sp, cols[1], 'Aa') + cell(X + sp, Y + sp, S - sp, S - sp, cols[2], 'aa');
    h += `<text x="${X - 5}" y="${Y + sp / 2 + 4}" font-size="12" text-anchor="end" fill="var(--ink)">${sp > 14 ? 'A' : ''}</text><text x="${X - 5}" y="${Y + sp + (S - sp) / 2 + 4}" font-size="12" text-anchor="end" fill="var(--ink)">${S - sp > 14 ? 'a' : ''}</text>`;
    const bx = 230, bw = 32, H = 170, base = Y + S;
    [[p * p, 'AA', 'p²'], [2 * p * Q, 'Aa', '2pq'], [Q * Q, 'aa', 'q²']].forEach(([v, n, f], k) => {
      const x = bx + k * 42;
      h += `<rect x="${x}" y="${base - v * H}" width="${bw}" height="${v * H}" fill="${cols[k]}" opacity=".85"/><text x="${x + bw / 2}" y="${base - v * H - 5}" font-size="11.5" text-anchor="middle" fill="var(--ink)">${v.toFixed(2)}</text>`;
      h += `<text x="${x + bw / 2}" y="${base + 15}" font-size="12" text-anchor="middle" fill="var(--ink)">${n}</text><text x="${x + bw / 2}" y="${base + 30}" font-size="11" text-anchor="middle" fill="var(--mute)">${f}</text>`;
    });
    h += `<line x1="${bx - 6}" x2="${bx + 126}" y1="${base}" y2="${base}" stroke="var(--ink-2)"/>`;
    svg.innerHTML = h;
    const het = 2 * p * Q, aa = Q * Q;
    q('[data-facts]').innerHTML = fact('q（a）＝ 1 − p', Q.toFixed(2)) + fact('AA ＝ p²', `${p.toFixed(2)}² = ${fmt(p * p)}`) + fact('Aa ＝ 2pq', `2×${p.toFixed(2)}×${Q.toFixed(2)} = ${fmt(het)}`) + fact('aa ＝ q²', `${Q.toFixed(2)}² = ${fmt(aa)}`) + fact('p² + 2pq + q²', fmt(p * p + het + aa, 2)) + fact('攜帶者 Aa ÷ 患者 aa', aa > 0 ? `${(het / aa).toFixed(1)} 倍` : '—');
    q('[data-note]').textContent = Q > 0 && Q <= 0.1 ? `a 很少時，隱性對偶基因多藏在異型合子中：攜帶者約為 aa 個體的 ${(het / aa).toFixed(0)} 倍。` : '理想族群隨機交配一代後，基因型頻率即為 p²：2pq：q²，此後世代不變；顯性對偶基因不會自動變多。';
  }
  function drawSel() {
    const X0 = 44, X1 = 346, Y0 = 210, Y1 = 16, sx = (g) => X0 + g / G * (X1 - X0), sy = (v) => Y0 - v * (Y0 - Y1);
    let h = '';
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => { h += `<line x1="${X0}" x2="${X1}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)"/><text x="${X0 - 5}" y="${sy(v) + 4}" font-size="11.5" text-anchor="end" fill="var(--mute)">${v}</text>`; });
    [0, G / 2, G].forEach((g) => { h += `<text x="${sx(g)}" y="${Y0 + 15}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">${g}</text>`; });
    h += `<text x="${X1}" y="${Y0 + 32}" font-size="12.5" text-anchor="end" fill="var(--ink)">世代</text><text x="12" y="${(Y0 + Y1) / 2}" font-size="12.5" text-anchor="middle" fill="var(--ink)" transform="rotate(-90 12 ${(Y0 + Y1) / 2})">a 的頻率 q</text>`;
    runs.forEach((a) => { h += `<path d="${a.map((v, g) => (g ? 'L' : 'M') + sx(g).toFixed(1) + ',' + sy(v).toFixed(1)).join('')}" fill="none" stroke="var(--c-C)" stroke-width="1.2" opacity=".75"/>`; });
    let x = q0, d = `M${sx(0)},${sy(x)}`, half = null;
    for (let g = 1; g <= G; g++) { x = next(x); d += `L${sx(g).toFixed(1)},${sy(x).toFixed(1)}`; if (half == null && x <= q0 / 2) half = g; }
    h += `<path d="${d}" fill="none" stroke="var(--teal)" stroke-width="3"/>`;
    h += `<rect x="${X0 + 144}" y="${Y1 - 6}" width="156" height="${N ? 36 : 20}" rx="4" fill="var(--bg)" opacity=".88"/>`;
    h += `<line x1="${X0 + 150}" x2="${X0 + 170}" y1="${Y1 + 4}" y2="${Y1 + 4}" stroke="var(--teal)" stroke-width="3"/><text x="${X0 + 174}" y="${Y1 + 8}" font-size="11.5" fill="var(--ink-2)">族群極大（理論）</text>`;
    if (N) h += `<line x1="${X0 + 150}" x2="${X0 + 170}" y1="${Y1 + 20}" y2="${Y1 + 20}" stroke="var(--c-C)" stroke-width="1.5"/><text x="${X0 + 174}" y="${Y1 + 24}" font-size="11.5" fill="var(--ink-2)">N = ${N}（6 次模擬）</text>`;
    svg.innerHTML = h;
    const fix = runs.filter((a) => a[G] >= 1).length, lost = runs.filter((a) => a[G] <= 0).length;
    let f = fact(`第 ${G} 代的 q（理論）`, fmt(x)) + fact(`第 ${G} 代 aa 頻率 q²`, fmt(x * x, 4));
    f += w === 0 ? fact('公式 q₀ ÷ (1 + n q₀)', fmt(q0 / (1 + G * q0))) : fact('每代 aa 的淘汰係數 s ＝ 1 − w', (1 - w).toFixed(2));
    f += fact('q 降為一半所需代數', half ? `${half} 代` : `超過 ${G} 代`);
    if (N) f += fact('漂變模擬：a 消失／固定', `${lost} 次／${fix} 次（共 6 次）`);
    q('[data-facts]').innerHTML = f;
    q('[data-note]').textContent = N && N <= 50 ? '小族群中頻率隨機起伏（遺傳漂變），各次結果不同，a 甚至可能因機率而固定或消失；族群愈大，愈接近理論曲線。'
      : w === 1 ? '各基因型適存度相同（無天擇），大族群中 q 維持不變，符合哈溫平衡。'
      : 'q 愈小，a 愈集中在不受淘汰的異型合子 Aa 中，天擇效率愈低，q 下降愈來愈慢；有害隱性對偶基因因此能長期以低頻率存在。';
  }
  function render() {
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === mode));
    el.querySelectorAll('[data-w]').forEach((d) => { d.style.display = d.dataset.w === mode ? 'grid' : 'none'; });
    el.querySelectorAll('[data-ns]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.ns === N));
    q('[data-re]').style.display = N ? '' : 'none';
    el.querySelectorAll('input[type=range]').forEach((r) => { const v = +r.value; r.nextElementSibling.textContent = r.dataset.v === 'G' ? v + ' 代' : v.toFixed(2); });
    mode === 'hw' ? drawHW() : drawSel();
  }
  el.addEventListener('input', (e) => {
    const r = e.target; if (!r.dataset.v) return;
    const v = +r.value;
    if (r.dataset.v === 'p') p = v; if (r.dataset.v === 'q0') q0 = v; if (r.dataset.v === 'w') w = v; if (r.dataset.v === 'G') G = v;
    if (r.dataset.v !== 'p') simulate();
    render();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) mode = b.dataset.m;
    if (b.dataset.ns) { N = +b.dataset.ns; simulate(); }
    if (b.hasAttribute('data-re')) simulate();
    render();
  });
  render();
};

/* induction */
(window.SIMS = window.SIMS || {}).induction = function (el, opt) {
  const N = 200, PHI0 = 1.0e-4, A = 3.5, XM = 12, PX = 14, CX = 220, CY = 74, TW = 8, EMAX = 0.1;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { x: -XM, v: 8, dir: 1, pol: 1, auto: !reduce, phi: 0, emf: 0, t: 0 };
  const fm = (x, d) => (x < -1e-12 && Number(Math.abs(x).toFixed(d)) ? '−' : '') + Math.abs(x).toFixed(d);
  const flux = (x) => st.pol * PHI0 * Math.pow(1 + (x / A) ** 2, -1.5);
  el.innerHTML = `<div class="sim-head"><b>磁鐵進出線圈的電磁感應</b><span>按「自動往返」或直接拖動磁鐵，比較磁通量 Φ 的變化與感應電動勢、電流方向。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 440 340" role="img" aria-label="磁鐵、線圈、檢流計與 Φ–t、ε–t 圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="run"><button type="button" data-auto>自動往返</button><button type="button" data-pol>磁鐵翻面（N/S 對調）</button></div>
    <label class="sl"><span>位置 x</span><input type="range" data-k="x" min="-12" max="12" step="0.1" value="-12"><output></output></label>
    <label class="sl"><span>速率 v</span><input type="range" data-k="v" min="2" max="20" step="1" value="8"><output></output></label>
    <div class="facts"><div class="fact"><span>每匝磁通量 Φ</span><b data-f="phi"></b></div><div class="fact"><span>ΔΦ/Δt</span><b data-f="d"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>ε = −N ΔΦ/Δt（N = ${N} 匝）</span><b data-f="e"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>冷次定律</span><b data-f="lenz" style="font-family:inherit;font-size:.86rem;font-weight:400"></b></div></div>
    <p class="sim-note">感應電動勢看 Φ 的「變化率」而非 Φ 本身：磁鐵在線圈正中央時 Φ 最大，但瞬間 ε ≈ 0；磁鐵越快，ε 越大；進入與離開時電流方向相反（來拒去留）。</p>
  </div></div>`;
  const svg = el.querySelector('svg'), $ = (s) => el.querySelector(s);
  const G1 = { y: 186, h: 64 }, G2 = { y: 268, h: 64 }, GX0 = 46, GX1 = 430;
  let hist = [];
  // prefill: one window of automatic motion so the graphs are meaningful at once
  (function prefill() { let x = -XM, d = 1, p = flux(x); for (let t = 0; t <= TW; t += 1 / 30) { x += d * st.v / 30; if (x > XM) { x = XM; d = -1; } if (x < -XM) { x = -XM; d = 1; } const q = flux(x); hist.push({ t, phi: q, emf: -N * (q - p) * 30 }); p = q; } st.t = TW; st.x = x; st.dir = d; st.phi = p; st.emf = hist[hist.length - 1].emf; })();
  function coil(front) {
    let s = '';
    for (let i = 0; i < 7; i++) {
      const cx = CX - 30 + i * 10;
      s += front ? `<path d="M${cx} ${CY - 34} A7 34 0 0 0 ${cx} ${CY + 34}" fill="none" stroke="var(--c-E)" stroke-width="3"/>` : `<path d="M${cx} ${CY - 34} A7 34 0 0 1 ${cx} ${CY + 34}" fill="none" stroke="var(--c-E)" stroke-opacity=".45" stroke-width="2.5"/>`;
    }
    return s;
  }
  function graph(g, key, max, label, unit, col) {
    let s = `<line x1="${GX0}" y1="${g.y}" x2="${GX1}" y2="${g.y}" stroke="var(--line)"/><line x1="${GX0}" y1="${g.y - g.h / 2}" x2="${GX0}" y2="${g.y + g.h / 2}" stroke="var(--ink-2)"/>`;
    s += `<text x="${GX0 - 4}" y="${g.y - g.h / 2 + 10}" font-size="15" font-weight="700" text-anchor="end" fill="${col}">${label}</text><text x="${GX0 - 4}" y="${g.y + 4}" font-size="13" text-anchor="end" fill="var(--mute)">0</text><text x="${GX1}" y="${g.y + g.h / 2 + 2}" font-size="13" text-anchor="end" fill="var(--mute)">${unit}</text>`;
    const t0 = st.t - TW, pts = hist.filter((h) => h.t >= t0).map((h) => `${(GX0 + ((h.t - t0) / TW) * (GX1 - GX0)).toFixed(1)},${(g.y - Math.max(-1, Math.min(1, h[key] / max)) * (g.h / 2 - 2)).toFixed(1)}`);
    return s + `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2"/>`;
  }
  function draw() {
    const mx = CX + st.x * PX, nRight = st.pol > 0, I = st.emf / EMAX;
    let s = `<rect x="0" y="0" width="440" height="160" fill="var(--bg)"/>` + coil(false);
    const half = 42;
    s += `<g data-mag style="cursor:grab"><rect x="${mx - half}" y="${CY - 13}" width="${half}" height="26" fill="${nRight ? 'var(--c-P)' : 'var(--red)'}"/><rect x="${mx}" y="${CY - 13}" width="${half}" height="26" fill="${nRight ? 'var(--red)' : 'var(--c-P)'}"/>
      <text x="${mx - half / 2}" y="${CY + 6}" font-size="16" font-weight="700" text-anchor="middle" fill="#fff">${nRight ? 'S' : 'N'}</text><text x="${mx + half / 2}" y="${CY + 6}" font-size="16" font-weight="700" text-anchor="middle" fill="#fff">${nRight ? 'N' : 'S'}</text></g>`;
    s += coil(true);
    if (Math.abs(I) > 0.02) for (let i = 0; i < 7; i += 2) { const ax = CX - 37 + i * 10, up = st.emf < 0, y = CY + (up ? 8 : -8); s += `<path d="M${ax} ${y} l-5 ${up ? 9 : -9} h10z" fill="var(--red)"/>`; }
    // galvanometer
    const ang = Math.max(-1, Math.min(1, I)) * 60 * Math.PI / 180;
    s += `<path d="M${CX - 30} ${CY + 34} V132 H${CX - 26} M${CX + 30} ${CY + 34} V132 H${CX + 26}" fill="none" stroke="var(--ink-2)" stroke-width="1.5"/>`;
    s += `<path d="M${CX - 26} 146 A26 26 0 0 1 ${CX + 26} 146 Z" fill="var(--card)" stroke="var(--ink)"/><text x="${CX}" y="157" font-size="11" text-anchor="middle" fill="var(--ink-2)">G</text>`;
    s += `<line x1="${CX}" y1="146" x2="${CX + 22 * Math.sin(ang)}" y2="${146 - 22 * Math.cos(ang)}" stroke="var(--red)" stroke-width="2"/>`;
    s += `<text x="8" y="18" font-size="14" fill="var(--ink-2)">紅箭頭：線圈前側的感應電流</text>`;
    s += graph(G1, 'phi', PHI0 * 1.1, 'Φ', 't →', 'var(--c-P)') + graph(G2, 'emf', EMAX, 'ε', 't →', 'var(--red)');
    svg.innerHTML = s;
    const dphi = -st.emf / N;
    $('[data-k="x"]').value = st.x; $('[data-k="x"] + output').textContent = fm(st.x, 1) + ' cm';
    $('[data-k="v"] + output').textContent = st.v + ' cm/s';
    $('[data-f="phi"]').textContent = fm(st.phi * 1e5, 2) + '×10⁻⁵ Wb';
    $('[data-f="d"]').textContent = fm(dphi * 1e5, 1) + '×10⁻⁵ Wb/s';
    $('[data-f="e"]').textContent = `−${N} × (${fm(dphi * 1e5, 1)}×10⁻⁵) = ${fm(st.emf * 1000, 1)} mV`;
    let lz = 'Φ 不變 → 無感應電流，檢流計指零。';
    if (Math.abs(st.emf) > 0.001) {
      const inc = st.phi * dphi > 0, bdir = (st.phi > 0) === inc ? '向左' : '向右';
      lz = `原磁場${st.phi > 0 ? '向右' : '向左'}、Φ ${inc ? '增加 → 感應磁場與原磁場反向（增反）' : '減少 → 感應磁場與原磁場同向（減同）'}：感應磁場${bdir}，線圈${bdir === '向左' ? '左' : '右'}端為 N 極。`;
    }
    $('[data-f="lenz"]').textContent = lz;
    $('[data-auto]').setAttribute('aria-pressed', String(st.auto));
  }
  let last = 0, running = false, prevPhi = st.phi;
  function step(dt) {
    if (st.auto) { st.x += st.dir * st.v * dt; if (st.x > XM) { st.x = XM; st.dir = -1; } if (st.x < -XM) { st.x = -XM; st.dir = 1; } }
    st.t += dt; const p = flux(st.x), raw = dt > 0 ? -N * (p - prevPhi) / dt : 0; prevPhi = p; st.phi = p;
    st.emf = st.auto ? raw : st.emf + (raw - st.emf) * Math.min(1, dt / 0.06);
    hist.push({ t: st.t, phi: p, emf: st.emf }); while (hist.length && hist[0].t < st.t - TW - 0.2) hist.shift();
  }
  function frame(t) {
    if (!el.isConnected) { running = false; return; }
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60; last = t; step(dt); draw(); requestAnimationFrame(frame);
  }
  function start() { if (!running) { running = true; last = 0; requestAnimationFrame(frame); } }
  el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => { if (inp.dataset.k === 'x') { st.auto = false; st.x = Number(inp.value); } else st.v = Number(inp.value); start(); if (!running) draw(); }));
  $('[data-auto]').addEventListener('click', () => { st.auto = !st.auto; start(); draw(); });
  $('[data-pol]').addEventListener('click', () => { st.pol = -st.pol; prevPhi = flux(st.x); st.phi = prevPhi; hist = hist.map((h) => ({ t: h.t, phi: -h.phi, emf: -h.emf })); start(); draw(); });
  let drag = false;
  const toX = (e) => { const r = svg.getBoundingClientRect(); return Math.max(-XM, Math.min(XM, (((e.clientX - r.left) / r.width) * 440 - CX) / PX)); };
  svg.addEventListener('pointerdown', (e) => { if (!e.target.closest('[data-mag]')) return; drag = true; st.auto = false; svg.setPointerCapture(e.pointerId); start(); });
  svg.addEventListener('pointermove', (e) => { if (drag) st.x = toX(e); });
  svg.addEventListener('pointerup', () => { drag = false; });
  draw(); if (!reduce) start();
};

/* kinematics */
(window.SIMS = window.SIMS || {}).kinematics = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TMAX = 8;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>等加速度運動的三種圖形</b><span>拖動 v₀、a 與時間 t，看小球位置與 x–t、v–t、a–t 圖如何同步變化。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 440" role="img" aria-label="直線運動與運動圖形"></svg></div>
<div class="sim-ctl">
${sl('v0', 'v₀', -10, 10, 0.5, 4)}${sl('a', 'a', -4, 4, 0.5, -1)}${sl('t', 't', 0, TMAX, 0.05, 3)}
<div class="ops"><button type="button" data-b="play">播放</button><button type="button" data-p="4,1">加速</button><button type="button" data-p="6,-2">減速後折返</button><button type="button" data-p="3,0">等速度</button></div>
<div class="facts">${fact('x', '位置 x = v₀t + ½at²')}${fact('v', '速度 v = v₀ + at')}${fact('a', 'v–t 斜率 = a')}${fact('A', 'v–t 下面積（位移 Δx）')}${fact('s', '路徑長')}</div>
<p class="sim-note">x–t 圖切線斜率是 v，v–t 圖斜率是 a、面積是位移（橫軸下方為負）；v 變號處才是折返點，此時 x–t 圖斜率為零。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { v0: 4, a: -1, t: 3 };
  const xAt = (t) => P.v0 * t + 0.5 * P.a * t * t;
  const vAt = (t) => P.v0 + P.a * t;
  function range(fn) {
    let lo = 0, hi = 0;
    for (let i = 0; i <= 80; i++) { const y = fn((i / 80) * TMAX); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (hi - lo < 2) { hi += 1; lo -= 1; }
    const pad = 0.08 * (hi - lo);
    return [lo - pad, hi + pad];
  }
  const L = 46, R = 346, H = 92;
  function panel(y0, lo, hi, name, unit, col, fn, shade) {
    const X = (t) => L + ((R - L) * t) / TMAX;
    const Y = (v) => y0 + H - ((v - lo) / (hi - lo)) * H;
    let s = `<rect x="${L}" y="${y0}" width="${R - L}" height="${H}" style="fill:var(--card);stroke:var(--line)"/>`;
    s += `<line x1="${L}" x2="${R}" y1="${Y(0)}" y2="${Y(0)}" style="stroke:var(--ink-2)" stroke-width="1"/>`;
    for (let k = 2; k < TMAX; k += 2) s += `<line x1="${X(k)}" x2="${X(k)}" y1="${y0}" y2="${y0 + H}" style="stroke:var(--line)" stroke-dasharray="2 3"/>`;
    s += `<text x="${L - 4}" y="${y0 + 10}" text-anchor="end" font-size="11" style="fill:var(--mute)">${f(hi, 0)}</text><text x="${L - 4}" y="${y0 + H}" text-anchor="end" font-size="11" style="fill:var(--mute)">${f(lo, 0)}</text>`;
    s += `<text x="4" y="${y0 + H / 2 + 4}" font-size="13" font-style="italic" style="fill:${col}">${name}</text><text x="4" y="${y0 + H / 2 + 18}" font-size="10" style="fill:var(--mute)">${unit}</text>`;
    s += shade(X, Y);
    let d = '';
    for (let i = 0; i <= 120; i++) { const t = (i / 120) * TMAX; d += (i ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(fn(t)).toFixed(1); }
    s += `<path d="${d}" fill="none" style="stroke:${col}" stroke-width="2.2"/>`;
    s += `<line x1="${X(P.t)}" x2="${X(P.t)}" y1="${y0}" y2="${y0 + H}" style="stroke:var(--sun)" stroke-width="2"/>`;
    s += `<circle cx="${X(P.t)}" cy="${Y(fn(P.t))}" r="4.5" style="fill:${col};stroke:#fff" stroke-width="1.5"/>`;
    return { s, X, Y };
  }
  function draw() {
    const t = P.t, x = xAt(t), v = vAt(t);
    const xr = range(xAt), vr = range(vAt);
    let s = '';
    // track
    const TX = (p) => 30 + ((p - xr[0]) / (xr[1] - xr[0])) * 300;
    s += `<line x1="30" x2="330" y1="34" y2="34" style="stroke:var(--ink-2)" stroke-width="2"/>`;
    s += `<line x1="${TX(0)}" x2="${TX(0)}" y1="28" y2="40" style="stroke:var(--ink-2)"/><text x="${TX(0)}" y="52" text-anchor="middle" font-size="10" style="fill:var(--mute)">x = 0</text>`;
    s += `<text x="30" y="14" font-size="11" style="fill:var(--mute)">直線軌道（向右為正）</text>`;
    const vx = Math.max(-60, Math.min(60, v * 4));
    if (Math.abs(vx) > 2) s += `<line x1="${TX(x)}" x2="${TX(x) + vx}" y1="20" y2="20" style="stroke:var(--c-P)" stroke-width="2.5"/><path d="M${TX(x) + vx} 20 l${vx > 0 ? -6 : 6} -4 v8z" style="fill:var(--c-P)"/><text x="${TX(x) + vx / 2}" y="16" text-anchor="middle" font-size="10" font-style="italic" style="fill:var(--c-P)">v</text>`;
    s += `<circle cx="${TX(x)}" cy="34" r="8" style="fill:var(--teal);stroke:#fff" stroke-width="2"/>`;
    // x-t with tangent
    const px = panel(64, xr[0], xr[1], 'x', '(m)', 'var(--teal)', xAt, (X, Y) => {
      const dt = 1.3;
      return `<line x1="${X(t - dt)}" y1="${Y(x - v * dt)}" x2="${X(t + dt)}" y2="${Y(x + v * dt)}" style="stroke:var(--c-C)" stroke-width="1.5" stroke-dasharray="5 3"/>`;
    });
    s += px.s + `<text x="${R - 4}" y="76" text-anchor="end" font-size="10" style="fill:var(--c-C)">切線斜率 = v = ${f(v, 1)}</text>`;
    // v-t with signed area
    const pv = panel(184, vr[0], vr[1], 'v', '(m/s)', 'var(--c-P)', vAt, (X, Y) => {
      let pos = `M${X(0)} ${Y(0)}`, neg = pos;
      for (let i = 0; i <= 60; i++) { const tt = (i / 60) * t, vv = vAt(tt); pos += `L${X(tt).toFixed(1)} ${Y(Math.max(vv, 0)).toFixed(1)}`; neg += `L${X(tt).toFixed(1)} ${Y(Math.min(vv, 0)).toFixed(1)}`; }
      pos += `L${X(t)} ${Y(0)}Z`; neg += `L${X(t)} ${Y(0)}Z`;
      return `<path d="${pos}" style="fill:var(--teal);opacity:.25"/><path d="${neg}" style="fill:var(--red);opacity:.25"/>`;
    });
    s += pv.s + `<text x="${R - 4}" y="196" text-anchor="end" font-size="10" style="fill:var(--ink-2)">面積 = Δx（綠正、紅負）</text>`;
    // a-t
    const pa = panel(304, -4.6, 4.6, 'a', '(m/s²)', 'var(--c-X)', () => P.a, (X, Y) => `<rect x="${X(0)}" y="${Math.min(Y(0), Y(P.a))}" width="${X(t) - X(0)}" height="${Math.abs(Y(P.a) - Y(0))}" style="fill:var(--c-X);opacity:.2"/>`);
    s += pa.s + `<text x="${R - 4}" y="316" text-anchor="end" font-size="10" style="fill:var(--ink-2)">面積 = Δv = ${f(P.a * t, 1)} m/s</text>`;
    for (let k = 0; k <= TMAX; k += 2) s += `<text x="${pa.X(k)}" y="410" text-anchor="middle" font-size="11" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="${R}" y="428" text-anchor="end" font-size="11" style="fill:var(--mute)">t (s)</text>`;
    svg.innerHTML = s;
    // readouts
    let path;
    const tr = P.a !== 0 ? -P.v0 / P.a : -1;
    if (tr > 0 && tr < t) { const xt = xAt(tr); path = Math.abs(xt) + Math.abs(x - xt); } else path = Math.abs(x);
    $('[data-f=x]').textContent = `${f(x, 2)} m`;
    $('[data-f=v]').textContent = `${f(v, 2)} m/s`;
    $('[data-f=a]').textContent = `${f(P.a, 1)} m/s²`;
    $('[data-f=A]').textContent = `${f(x, 2)} m`;
    $('[data-f=s]').textContent = `${f(path, 2)} m` + (tr > 0 && tr < t ? `（t = ${f(tr, 2)} s 折返）` : '');
    $('[data-o=v0]').textContent = `${f(P.v0, 1)} m/s`;
    $('[data-o=a]').textContent = `${f(P.a, 1)} m/s²`;
    $('[data-o=t]').textContent = `${f(P.t, 2)} s`;
  }
  // animation
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0, hold = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    if (P.t >= TMAX) { hold += dt; if (hold > 0.8) { hold = 0; P.t = 0; } } else P.t = Math.min(TMAX, P.t + dt);
    inp.t.value = P.t; draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; if (P.t >= TMAX) P.t = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => play(!playing));
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => {
    P[k] = parseFloat(inp[k].value);
    if (k === 't') play(false);
    draw();
  }));
  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    const [v0, a] = b.dataset.p.split(',').map(Number);
    P.v0 = v0; P.a = a; inp.v0.value = v0; inp.a.value = a; P.t = 0; inp.t.value = 0;
    draw(); if (!RM) play(true);
  }));
  if (opt.v0 != null) { P.v0 = +opt.v0; inp.v0.value = P.v0; }
  if (opt.a != null) { P.a = +opt.a; inp.a.value = P.a; }
  draw();
  play(false);
};

/* lapse */
(window.SIMS = window.SIMS || {}).lapse = function (el, opt) {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { T: 25, Td: 21, H: 3.0, gm: 6, u: 0.5, play: !reduce };
  const S = (t) => 216.7 * 6.112 * Math.exp(17.67 * t / (t + 243.5)) / (t + 273.15); // 飽和水氣量 g/m³
  const f1 = (v) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1).replace('-', '−');
  el.innerHTML = `<div class="sim-head"><b>空氣塊越山與焚風</b><span>調整地面氣溫、露點與山高，看雲底高度、山頂與背風側的溫度。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 262" role="img" aria-label="空氣塊越過山脈的剖面"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>地面氣溫 T</span><input type="range" data-k="T" min="10" max="35" step="0.5"><output></output></label>
    <label class="sl"><span>露點 T<sub>d</sub></span><input type="range" data-k="Td" min="0" max="35" step="0.5"><output></output></label>
    <label class="sl"><span>山高 H</span><input type="range" data-k="H" min="0.5" max="4" step="0.1"><output></output></label>
    <div class="ops"><span style="font-size:.86rem;color:var(--ink-2);align-self:center">濕絕熱遞減率</span><button type="button" data-g="5">5 °C/km</button><button type="button" data-g="6">6 °C/km</button><button type="button" data-p></button></div>
    <div class="facts"></div>
    <p class="sim-note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note'), pb = el.querySelector('[data-p]');
  const inputs = [...el.querySelectorAll('input[type=range]')];
  const X0 = 40, XP = 215, X1 = 390, Y = (z) => 234 - z * 46;
  const zAt = (x) => { const u = Math.min(1, Math.abs(x - XP) / (XP - X0)); return st.H * Math.pow((Math.cos(Math.PI * u) + 1) / 2, 1.2); };
  function model() {
    const lcl = (st.T - st.Td) / 8, cloud = lcl < st.H; // km；乾 10、露點 2 °C/km
    const Tb = st.T - 10 * Math.min(lcl, st.H);
    const Ts = cloud ? Tb - st.gm * (st.H - lcl) : st.T - 10 * st.H, Tds = cloud ? Ts : st.Td - 2 * st.H;
    return { lcl, cloud, Tb, Ts, Tds, TL: Ts + 10 * st.H, TdL: Tds + 2 * st.H };
  }
  const parcel = (m, x) => { // 空氣塊在 x 處的溫度
    const z = zAt(x);
    if (x <= XP) return z <= m.lcl ? st.T - 10 * z : m.Tb - st.gm * (z - m.lcl);
    return m.Ts + 10 * (st.H - z);
  };
  const lab = (x, y, s, c = 'var(--ink)', a = 'middle') => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="15" fill="${c}" stroke="var(--card)" stroke-width="3" paint-order="stroke">${s}</text>`;
  function draw() {
    const m = model();
    let s = `<rect x="0" y="0" width="420" height="262" fill="var(--card)"/>`;
    for (let z = 0; z <= 4; z++) s += `<line x1="30" y1="${Y(z)}" x2="420" y2="${Y(z)}" stroke="var(--line)"/><text x="26" y="${Y(z) + 4}" font-size="11" text-anchor="end" fill="var(--ink-2)">${z}</text>`;
    s += `<text x="4" y="14" font-size="11" fill="var(--ink-2)">高度 km</text>`;
    const pts = []; for (let x = X0 - 10; x <= X1 + 10; x += 5) pts.push([x, Y(zAt(x))]);
    if (m.cloud) {
      s += `<line x1="30" y1="${Y(m.lcl)}" x2="${XP}" y2="${Y(m.lcl)}" stroke="var(--c-P)" stroke-dasharray="5 4"/>`;
      let xa = X0; while (xa < XP && zAt(xa) < m.lcl) xa += 2;
      for (let x = Math.max(X0, xa - 34); x < xa - 2; x += 8) s += `<line x1="${x}" y1="${Y(m.lcl) + 3}" x2="${x - 3}" y2="${Y(zAt(x)) - 1}" stroke="var(--c-P)" stroke-width="1.5"/>`;
      const cl = []; for (let x = xa - 40; x <= XP + 8; x += 11) { const r = 12 + 3 * Math.sin(x); cl.push([x, Y(Math.max(zAt(x), m.lcl)) - r * 0.7, r]); }
      s += cl.map((c) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${c[2].toFixed(1)}" fill="var(--card)" stroke="var(--mute)"/>`).join('') + cl.map((c) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(c[2] - 1.2).toFixed(1)}" fill="var(--card)"/>`).join('');
    }
    const mtn = `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}L${X1 + 10} 262L${X0 - 10} 262Z`;
    s += `<path d="${mtn}" fill="var(--card)"/>`;
    s += `<path d="M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}L${X1 + 10} 262L${X0 - 10} 262Z" fill="var(--c-B)" fill-opacity=".35" stroke="var(--c-B)" stroke-width="1.5"/>`;
    s += `<path d="M${pts.map((p) => p[0].toFixed(1) + ' ' + (p[1] - 7).toFixed(1)).join('L')}" fill="none" stroke="var(--c-C)" stroke-width="1.5" stroke-dasharray="2 4"/>`;
    s += lab(70, 20, '風向 →', 'var(--teal-2)');
    s += lab(X0, 252, `${f1(st.T)} °C（露點 ${f1(st.Td)}）`, 'var(--ink)', 'start');
    s += lab(X1 + 12, 252, `${f1(m.TL)} °C（露點 ${f1(m.TdL)}）`, 'var(--red)', 'end');
    s += lab(XP, Y(st.H) - (m.cloud ? 26 : 12), `山頂 ${f1(m.Ts)} °C`);
    if (m.cloud) s += lab(34, Y(m.lcl) + (m.lcl > 0.45 ? 17 : -8), `雲底 ${f1(m.Tb)} °C`, 'var(--c-P)', 'start');
    const xp = X0 + st.u * (X1 - X0), tp = parcel(m, xp), yp = Y(zAt(xp)) - 7;
    s += `<circle cx="${xp}" cy="${yp}" r="7" fill="${tp > st.T + 0.05 ? 'var(--red)' : 'var(--c-C)'}" stroke="var(--card)" stroke-width="2"/>`;
    s += lab(Math.min(Math.max(xp, 50), 370), yp - 13, `${f1(tp)} °C`, 'var(--c-C)');
    svg.innerHTML = s;
    const fact = (k, v, full) => `<div class="fact"${full ? ' style="grid-column:1/-1"' : ''}><span>${k}</span><b>${v}</b></div>`;
    const rh0 = S(st.Td) / S(st.T) * 100, rhL = S(m.TdL) / S(m.TL) * 100;
    facts.innerHTML = fact('抬升凝結高度 h = 125 (T − T<sub>d</sub>)', `125 × ${f1(st.T - st.Td)} = ${Math.round(m.lcl * 1000)} m${m.cloud ? '' : '（高於山頂，不成雲）'}`, 1) +
      (m.cloud ? fact('雲底溫度 T − 10h', `${f1(m.Tb)} °C`) + fact(`山頂（濕絕熱 ${st.gm} °C/km）`, `${f1(m.Tb)} − ${st.gm} × ${f1(st.H - m.lcl)} = ${f1(m.Ts)} °C`)
        : fact('山頂（乾絕熱 10 °C/km）', `${f1(st.T)} − 10 × ${f1(st.H)} = ${f1(m.Ts)} °C`, 1)) +
      fact('背風山腳（乾絕熱下沉）', `${f1(m.Ts)} + 10 × ${f1(st.H)} = ${f1(m.TL)} °C`, 1) +
      fact('焚風淨增溫', `${m.TL - st.T > 0.05 ? '+' : ''}${f1(m.TL - st.T)} °C`) + fact('相對濕度 迎風 → 背風', `${Math.round(rh0)}% → ${Math.round(rhL)}%`);
    note.textContent = m.cloud ? `焚風的熱來自迎風坡凝結釋放的潛熱：雲底以上每公里只降 ${st.gm} °C，水分降落後下沉時每公里升 10 °C，所以背風側又熱又乾。` : '空氣塊未達抬升凝結高度就越過山頂：上升、下沉都以乾絕熱 10 °C/km 變化，回到山腳溫度不變——沒有成雲降水，就沒有淨增溫。';
  }
  function sync() {
    if (st.Td > st.T) st.Td = st.T;
    inputs.forEach((i) => { const k = i.dataset.k; i.value = st[k]; i.nextElementSibling.textContent = k === 'H' ? `${st.H.toFixed(1)} km` : `${f1(st[k])} °C`; });
    el.querySelectorAll('[data-g]').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.g) === st.gm));
    pb.textContent = st.play ? '❚❚ 暫停' : '▶ 播放空氣塊'; pb.setAttribute('aria-pressed', st.play);
    draw();
  }
  let run = 0;
  function start() {
    const id = ++run; let last = 0;
    const tick = (ts) => {
      if (!el.isConnected || !st.play || id !== run) return;
      if (last) st.u = (st.u + Math.min(ts - last, 100) / 9000) % 1;
      last = ts; draw(); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  inputs.forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); if (i.dataset.k === 'T' && st.Td > st.T) st.Td = st.T; sync(); }));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.g) st.gm = Number(b.dataset.g);
    if (b.hasAttribute('data-p')) { st.play = !st.play; if (st.play) start(); }
    sync();
  });
  sync();
  if (st.play) start();
};

/* magnitude */
(window.SIMS = window.SIMS || {}).magnitude = function (el, opt) {
  const st = { mode: opt && opt.mode === 'distance' ? 'distance' : 'brightness', m1: 1, m2: 6, M: 1.4, ld: Math.log10(2.64) };
  const f1 = (x) => (Math.abs(x) < 0.05 ? 0 : x).toFixed(1).replace('-', '−');
  const sgn = (x) => (x > 0.04 ? '+' : '') + f1(x);
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const big = (x) => { if (x >= 0.01 && x < 1e4) return x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(x < 1 ? 3 : 2); const e = Math.floor(Math.log10(x)); return (x / 10 ** e).toFixed(2) + '×10' + String(e).split('').map((c) => SUP[c]).join(''); };
  const PB = [['1 等 vs 6 等', 1, 6], ['天狼星 vs 北極星', -1.46, 1.98], ['織女星 vs 比鄰星', 0.03, 11.1], ['金星 vs 天狼星', -4.9, -1.46]];
  const PD = [['天狼星', 1.4, 2.64], ['比鄰星', 15.6, 1.30], ['織女星', 0.6, 7.7], ['參宿七', -7, 264]];
  el.innerHTML = `<div class="sim-head"><b>星等、亮度與距離</b><span>拖動滑桿改變星等或距離，看亮度比與距離模數如何變化。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 400 260" role="img" aria-label="星等示意圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="mode"><button type="button" data-v="brightness">視星等與亮度比</button><button type="button" data-v="distance">絕對星等與距離</button></div>
    <div data-p="brightness" style="display:grid;gap:8px">
      <label class="sl"><span style="color:var(--c-P)">m₁ 甲星</span><input type="range" data-k="m1" min="-5" max="15" step="0.1"><output></output></label>
      <label class="sl"><span style="color:var(--c-C)">m₂ 乙星</span><input type="range" data-k="m2" min="-5" max="15" step="0.1"><output></output></label>
      <div class="ops" data-g="pb">${PB.map((p, i) => `<button type="button" data-v="${i}">${p[0]}</button>`).join('')}</div>
    </div>
    <div data-p="distance" style="display:grid;gap:8px">
      <label class="sl"><span>M 絕對星等</span><input type="range" data-k="M" min="-10" max="16" step="0.1"><output></output></label>
      <label class="sl"><span>d 距離</span><input type="range" data-k="ld" min="0" max="5" step="0.01"><output></output></label>
      <div class="ops" data-g="pd">${PD.map((p, i) => `<button type="button" data-v="${i}">${p[0]}</button>`).join('')}</div>
    </div>
    <div class="facts"></div>
    <p class="sim-note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note');
  const inputs = [...el.querySelectorAll('input[type=range]')];
  const fact = (k, v, full) => `<div class="fact"${full ? ' style="grid-column:1/-1"' : ''}><span>${k}</span><b>${v}</b></div>`;
  const star = (cx, cy, m, col, name, tc) => {
    const r = 3 + 26 * Math.min(Math.max((15 - m) / 20, 0), 1);
    return `<circle cx="${cx}" cy="${cy}" r="${r * 1.8}" fill="${col}" opacity=".18"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/>` +
      `<text x="${cx}" y="${cy + 62}" text-anchor="middle" font-size="15" fill="${tc}">${name}　m = ${f1(m)}</text>`;
  };
  function drawB() {
    const dm = st.m2 - st.m1, ratio = Math.pow(10, 0.4 * Math.abs(dm));
    let s = `<rect x="0" y="0" width="400" height="150" rx="8" fill="var(--ink)"/>`;
    s += star(110, 66, st.m1, 'var(--c-P)', '甲', 'var(--card)') + star(290, 66, st.m2, 'var(--c-C)', '乙', 'var(--card)');
    s += `<text x="200" y="20" text-anchor="middle" font-size="12" fill="var(--line)">星點大小示意亮度（非實際比例）</text>`;
    const X = (m) => 20 + ((m + 5) / 20) * 360, Y = 200;
    s += `<line x1="20" y1="${Y}" x2="380" y2="${Y}" stroke="var(--ink-2)"/>`;
    for (let m = -5; m <= 15; m++) { const bigT = m % 5 === 0; s += `<line x1="${X(m)}" y1="${Y - (bigT ? 6 : 3)}" x2="${X(m)}" y2="${Y + (bigT ? 6 : 3)}" stroke="var(--ink-2)"/>`; if (bigT) s += `<text x="${X(m)}" y="${Y + 21}" text-anchor="middle" font-size="13" fill="var(--ink-2)">${m}</text>`; }
    s += `<text x="20" y="${Y + 44}" font-size="13" fill="var(--mute)">← 愈亮</text><text x="380" y="${Y + 44}" font-size="13" fill="var(--mute)" text-anchor="end">愈暗 →</text>`;
    s += `<text x="200" y="${Y + 44}" font-size="13" fill="var(--mute)" text-anchor="middle">視星等 m</text>`;
    const a = X(st.m1), b = X(st.m2);
    s += `<path d="M${a} ${Y - 12} L${a} ${Y - 26} L${b} ${Y - 26} L${b} ${Y - 12}" fill="none" stroke="var(--teal)" stroke-width="1.5"/>`;
    s += `<text x="${(a + b) / 2}" y="${Y - 31}" text-anchor="middle" font-size="14" fill="var(--teal-2)">Δm = ${f1(Math.abs(dm))}</text>`;
    s += `<circle cx="${a}" cy="${Y}" r="5" fill="var(--c-P)"/><circle cx="${b}" cy="${Y}" r="5" fill="var(--c-C)"/>`;
    svg.innerHTML = s;
    const brighter = Math.abs(dm) < 0.05 ? '一樣亮' : dm > 0 ? '甲星較亮' : '乙星較亮';
    facts.innerHTML = fact('星等差 Δm = m₂ − m₁', sgn(dm)) + fact('哪顆較亮', brighter) +
      fact('亮度比 b₁ / b₂ = 10<sup>0.4(m₂ − m₁)</sup>', `10<sup>${(0.4 * dm).toFixed(2)}</sup> ≈ ${big(Math.pow(10, 0.4 * dm))}`, 1) +
      fact('較亮者 ÷ 較暗者 = 100<sup>|Δm|/5</sup> ≈ 2.512<sup>|Δm|</sup>', `≈ ${big(ratio)} 倍`, 1);
    note.textContent = '星等數值愈小愈亮；每差 5 等亮度差 100 倍，差 1 等約 2.512 倍（不是 2 倍）。星等差是相減，亮度比卻是 10 的乘冪。';
  }
  function drawD() {
    const d = Math.pow(10, st.ld), mod = 5 * st.ld - 5, m = st.M + mod, L = Math.pow(10, 0.4 * (4.83 - st.M));
    const X = (l) => 50 + l * 66, Y = (v) => 20 + ((21 - v) / 27) * 200;
    let s = `<rect x="50" y="20" width="330" height="200" fill="var(--card)" stroke="var(--line)"/>`;
    for (let l = 0; l <= 5; l++) s += `<line x1="${X(l)}" y1="20" x2="${X(l)}" y2="220" stroke="var(--line)"/><text x="${X(l)}" y="236" text-anchor="middle" font-size="13" fill="var(--ink-2)">${l === 0 ? 1 : l === 1 ? 10 : '10' + SUP[l]}</text>`;
    for (let v = -5; v <= 20; v += 5) s += `<line x1="50" y1="${Y(v)}" x2="380" y2="${Y(v)}" stroke="var(--line)"/><text x="44" y="${Y(v) + 4}" text-anchor="end" font-size="13" fill="var(--ink-2)">${v}</text>`;
    s += `<line x1="50" y1="${Y(0)}" x2="380" y2="${Y(0)}" stroke="var(--ink-2)"/>`;
    s += `<line x1="${X(0)}" y1="${Y(-5)}" x2="${X(5)}" y2="${Y(20)}" stroke="var(--teal)" stroke-width="2"/>`;
    s += `<line x1="${X(1)}" y1="20" x2="${X(1)}" y2="220" stroke="var(--sun)" stroke-width="2" stroke-dasharray="4 3"/><text x="${X(1) + 4}" y="36" font-size="13" fill="var(--ink-2)">d = 10 pc：m = M</text>`;
    s += `<line x1="${X(st.ld)}" y1="${Y(0)}" x2="${X(st.ld)}" y2="${Y(mod)}" stroke="var(--red)" stroke-width="1.5"/>`;
    s += `<circle cx="${X(st.ld)}" cy="${Y(mod)}" r="6" fill="var(--red)" stroke="var(--card)" stroke-width="2"/>`;
    s += `<text x="${Math.min(X(st.ld) + 10, 280)}" y="${Y(mod) + (mod > 12 || (mod < 2 && mod > -3) ? 20 : -12)}" font-size="14" font-weight="700" fill="var(--red)" stroke="var(--card)" stroke-width="3" paint-order="stroke">m − M = ${f1(mod)}</text>`;
    s += `<text x="215" y="255" text-anchor="middle" font-size="13" fill="var(--ink-2)">距離 d（pc，對數尺度）</text><text x="14" y="120" font-size="13" fill="var(--ink-2)" transform="rotate(-90 14 120)" text-anchor="middle">m − M</text>`;
    svg.innerHTML = s;
    facts.innerHTML = fact('距離 d', `${big(d)} pc（${big(d * 3.26)} ly）`) + fact('絕對星等 M', f1(st.M)) +
      fact('距離模數 m − M = 5 log d − 5', `5 × ${st.ld.toFixed(2)} − 5 = ${sgn(mod)}`, 1) +
      fact('視星等 m = M + (m − M)', f1(m)) + fact('亮度 ÷ 在 10 pc 時 = (10/d)²', big(Math.pow(10 / d, 2))) +
      fact('光度 L/L☉ = 10<sup>0.4(4.83 − M)</sup>（M☉ ≈ 4.83）', big(L), 1);
    note.textContent = d > 10.05 ? '比 10 pc 遠，看起來比在 10 pc 處暗，所以 m > M；距離每乘 10，m − M 增加 5（亮度降為 1/100）。' : d < 9.95 ? '比 10 pc 近，看起來比在 10 pc 處亮，所以 m < M。絕對星等只由光度決定，與距離無關。' : '恰在 10 pc：視星等等於絕對星等（定義）。';
  }
  function sync() {
    el.querySelectorAll('[data-g=mode] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === st.mode));
    el.querySelectorAll('[data-p]').forEach((p) => { p.style.display = p.dataset.p === st.mode ? 'grid' : 'none'; });
    inputs.forEach((i) => {
      i.value = st[i.dataset.k];
      const k = i.dataset.k, v = st[k];
      i.nextElementSibling.textContent = k === 'ld' ? big(Math.pow(10, v)) + ' pc' : f1(v);
    });
    if (st.mode === 'brightness') drawB(); else drawD();
  }
  inputs.forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); sync(); }));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const g = b.parentElement.dataset.g, v = b.dataset.v;
    if (g === 'mode') st.mode = v;
    if (g === 'pb') { st.m1 = PB[v][1]; st.m2 = PB[v][2]; }
    if (g === 'pd') { st.M = PD[v][1]; st.ld = Math.log10(PD[v][2]); }
    sync();
  });
  sync();
};

/* microscope */
(window.SIMS = window.SIMS || {}).microscope = function (el, opt) {
  const uid = 'mc' + Math.random().toString(36).slice(2, 8);
  const OCS = [10, 15], OBJS = [4, 10, 40, 100];
  const L = 0.1, H = 0.05; // 標本細胞的實際長、寬（mm）
  let oc = opt.ocular || 10, ob = opt.objective || 10, light = false, prevM = null;
  const btns = (arr, key, cur) => arr.map((v) => `<button type="button" data-${key}="${v}" aria-pressed="${v === cur}">${v}×</button>`).join('');
  el.innerHTML = `<style>.sim[data-sim="microscope"] .grp{display:grid;gap:4px}.sim[data-sim="microscope"] .grp small{color:var(--mute);font-size:.78rem}</style>
  <div class="sim-head"><b>顯微鏡的倍率與視野</b><span>轉換物鏡或目鏡，看總倍率、視野直徑與視野中的細胞如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 300 300" role="img" aria-label="顯微鏡視野"></svg></div>
  <div class="sim-ctl">
    <div class="grp"><small>目鏡</small><div class="ops" data-g="oc">${btns(OCS, 'oc', oc)}</div></div>
    <div class="grp"><small>物鏡（轉旋轉盤；100× 為油鏡）</small><div class="ops" data-g="ob">${btns(OBJS, 'ob', ob)}</div></div>
    <div class="ops"><button type="button" data-light aria-pressed="false">開大光圈／調亮光源</button></div>
    <div class="facts">
      <div class="fact"><span>總倍率 M ＝ 目鏡 × 物鏡</span><b data-f="m"></b></div>
      <div class="fact"><span>視野直徑（40× 時為 4 mm）</span><b data-f="d"></b></div>
      <div class="fact"><span>直徑上排列的細胞數</span><b data-f="n"></b></div>
      <div class="fact"><span>估計細胞長 ＝ 直徑 ÷ 個數</span><b data-f="s"></b></div>
      <div class="fact"><span>佈滿視野的細胞數（約）</span><b data-f="a"></b></div>
      <div class="fact"><span>視野亮度</span><b data-f="b"></b></div>
    </div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg');
  const fmt = (x, d) => (+x.toFixed(d)).toString();
  function draw() {
    const M = oc * ob, D = 4 * 40 / M; // mm
    const R = 132, cx = 150, cy = 146, s = 2 * R / D; // px per mm
    const Ls = L * s, Hs = H * s, sw = Math.max(0.5, Math.min(3, Hs * 0.07));
    const N = D / L, nArea = Math.PI * D * D / 4 / (L * H);
    let dark = 0.55 * Math.log(M / 40) / Math.log(1500 / 40);
    dark = Math.max(0, Math.min(0.55, dark)) * (light ? 0.3 : 1);
    const nucR = Math.min(Hs * 0.22, Ls * 0.15);
    const pat = `<pattern id="${uid}p" patternUnits="userSpaceOnUse" x="${cx}" y="${cy - Hs / 2}" width="${Ls}" height="${2 * Hs}">
      <rect x="0" y="0" width="${Ls}" height="${Hs}" fill="var(--card)" stroke="var(--c-E)" stroke-width="${sw}"/>
      <rect x="${-Ls / 2}" y="${Hs}" width="${Ls}" height="${Hs}" fill="var(--card)" stroke="var(--c-E)" stroke-width="${sw}"/>
      <rect x="${Ls / 2}" y="${Hs}" width="${Ls}" height="${Hs}" fill="var(--card)" stroke="var(--c-E)" stroke-width="${sw}"/>
      <circle cx="${Ls * 0.62}" cy="${Hs * 0.5}" r="${nucR}" fill="var(--c-E)" opacity=".75"/>
      <circle cx="${Ls * 0.12}" cy="${Hs * 1.5}" r="${nucR}" fill="var(--c-E)" opacity=".75"/>
      <circle cx="${Ls * 1.12}" cy="${Hs * 1.5}" r="${nucR}" fill="var(--c-E)" opacity=".75"/></pattern>`;
    let row = '';
    const k = Math.ceil(N / 2) + 1;
    for (let i = -k; i < k; i++) row += `<rect x="${cx + i * Ls}" y="${cy - Hs / 2}" width="${Ls}" height="${Hs}" fill="var(--sun)" opacity="${i % 2 ? 0.45 : 0.3}"/>`;
    svg.innerHTML = `<defs>${pat}<clipPath id="${uid}c"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>
      <rect x="0" y="0" width="300" height="300" fill="var(--ink)"/>
      <g clip-path="url(#${uid}c)"><rect x="0" y="0" width="300" height="300" fill="url(#${uid}p)"/>${row}
        <line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="var(--red)" stroke-width="1.2" stroke-dasharray="5 4"/>
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="var(--ink)" opacity="${dark.toFixed(3)}"/></g>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--mute)" stroke-width="2"/>
      <text x="150" y="293" text-anchor="middle" font-size="12" fill="var(--card)">${M}×　視野直徑 ${fmt(D, 2)} mm（紅虛線）</text>`;
    const nTxt = N >= 10 ? Math.round(N) : fmt(N, 1), est = D * 1000 / +nTxt;
    q('[data-f="m"]').textContent = `${oc} × ${ob} = ${M}×`;
    q('[data-f="d"]').textContent = `4 × 40/${M} = ${fmt(D, 2)} mm`;
    q('[data-f="n"]').textContent = N >= 1 ? `約 ${nTxt} 個` : `不到 1 個（細胞比視野大）`;
    q('[data-f="s"]').textContent = `${fmt(D * 1000, 0)} μm ÷ ${nTxt} ≈ ${fmt(est, 0)} μm`;
    q('[data-f="a"]').textContent = nArea >= 10 ? `約 ${Math.round(nArea / 10) * 10} 個` : `約 ${fmt(nArea, 1)} 個`;
    q('[data-f="b"]').textContent = dark < 0.08 ? '明亮' : dark < 0.22 ? '稍暗' : dark < 0.38 ? '較暗' : '很暗';
    let note;
    if (prevM && prevM !== M) {
      const r = M / prevM, rs = r >= 1 ? `${fmt(r, 2)} 倍` : `1/${fmt(1 / r, 2)}`;
      note = `倍率由 ${prevM}× 變為 ${M}×（${rs}）：視野直徑與直徑上的細胞數都變為 ${r >= 1 ? '1/' + fmt(r, 2) : fmt(1 / r, 2) + ' 倍'}，佈滿視野的細胞數變為 ${r >= 1 ? '1/' + fmt(r * r, 2) : fmt(1 / (r * r), 2) + ' 倍'}（面積∝1/M²）${r > 1 ? '；視野變暗，可開大光圈或調亮光源' : ''}。`;
    } else note = '倍率是長度的倍數：視野直徑∝1/M，排成一列的細胞數∝1/M、佈滿視野的細胞數∝1/M²；細胞本身大小不變，估計值都約 100 μm。';
    q('[data-note]').textContent = note;
    prevM = M;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !el.contains(b)) return;
    if (b.dataset.oc) oc = +b.dataset.oc;
    if (b.dataset.ob) ob = +b.dataset.ob;
    if (b.hasAttribute('data-light')) { light = !light; b.setAttribute('aria-pressed', light); prevM = null; }
    el.querySelectorAll('[data-oc]').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.oc === oc));
    el.querySelectorAll('[data-ob]').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.ob === ob));
    draw();
  });
  draw();
};

/* moon */
(window.SIMS = window.SIMS || {}).moon = function (el, opt) {
  const D = Math.PI / 180, SYN = 29.53;
  const st = { th: 60, play: false };
  const uid = 'm' + Math.random().toString(36).slice(2, 8);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NAMES = [[10, '新月（朔）'], [80, '眉月'], [100, '上弦月'], [170, '盈凸月'], [190, '滿月（望）'], [260, '虧凸月'], [280, '下弦月'], [350, '殘月'], [361, '新月（朔）']];
  const phaseName = (t) => NAMES.find((n) => t < n[0])[1];
  const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const lunar = (n) => n <= 10 ? '初' + CN[n] : n < 20 ? '十' + CN[n - 10] : n === 20 ? '二十' : n < 30 ? '廿' + CN[n - 20] : '三十';
  const hm = (h) => { h = ((h % 24) + 24) % 24; const m = Math.round(h * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  el.innerHTML = `<div class="sim-head"><b>月相的成因</b><span>拖動月球（或滑桿）繞地球轉，看地球上所見的月相、月出時刻與可見時段。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 400 300" role="img" aria-label="日地月俯視圖" style="cursor:pointer"></svg></div>
  <div class="sim-ctl">
    <div style="display:flex;gap:12px;align-items:center"><svg viewBox="0 0 120 120" style="width:112px;flex:none;border-radius:10px" role="img" aria-label="地球上所見的月相"></svg>
      <div><div style="font-size:.78rem;color:var(--mute)">自地球（北半球）所見</div><div data-n style="font-size:1.25rem;font-weight:700;color:var(--teal-2)"></div><div data-s style="font-size:.86rem;color:var(--ink-2)"></div></div></div>
    <label class="sl"><span>日月角距</span><input type="range" min="0" max="359" step="1"><output></output></label>
    <div class="ops"><button type="button" data-v="0">朔</button><button type="button" data-v="90">上弦</button><button type="button" data-v="180">望</button><button type="button" data-v="270">下弦</button><button type="button" data-p>▶ 播放</button></div>
    <div class="facts"></div>
    <p class="sim-note">亮面永遠朝向太陽：上弦月在日東 90°，傍晚在南方、亮面朝西（右）；下弦月清晨在南方、亮面朝東（左）。月出每天約延後 50 分鐘。</p>
  </div></div>`;
  const [svg, ph] = el.querySelectorAll('svg'), rng = el.querySelector('input'), facts = el.querySelector('.facts'), pbtn = el.querySelector('[data-p]');
  const CX = 175, CY = 150, OR = 105;
  const litPath = (cx, cy, R, t) => { // 北半球所見：盈月右亮、虧月左亮
    const c = Math.cos(t * D), rx = Math.abs(c) * R, wax = (t % 360) < 180;
    const s1 = wax ? 1 : 0, s2 = wax ? (c > 0 ? 0 : 1) : (c > 0 ? 1 : 0);
    return `M${cx} ${cy - R} A${R} ${R} 0 0 ${s1} ${cx} ${cy + R} A${rx.toFixed(2)} ${R} 0 0 ${s2} ${cx} ${cy - R}Z`;
  };
  function draw() {
    const t = st.th, mx = CX + OR * Math.cos(t * D), my = CY - OR * Math.sin(t * D);
    let s = `<defs><marker id="${uid}a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--c-C)"/></marker></defs>`;
    for (let y = 40; y <= 260; y += 44) s += `<line x1="395" y1="${y}" x2="318" y2="${y}" stroke="var(--c-C)" stroke-width="2" marker-end="url(#${uid}a)"/>`;
    s += `<text x="395" y="24" text-anchor="end" font-size="15" font-weight="700" fill="var(--c-C)">太陽光 ←</text>`;
    s += `<circle cx="${CX}" cy="${CY}" r="${OR}" fill="none" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="4 4"/>`;
    s += `<path d="M${CX - 69} ${CY - 98} A120 120 0 0 0 ${CX - 104} ${CY - 60}" fill="none" stroke="var(--teal)" stroke-width="2" marker-end="url(#${uid}b)"/><defs><marker id="${uid}b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--teal)"/></marker></defs>`;
    s += `<text x="8" y="22" font-size="14" fill="var(--teal-2)">自北方俯視，月球逆時針公轉</text>`;
    s += `<line x1="${CX}" y1="${CY}" x2="${mx}" y2="${my}" stroke="var(--c-X)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    s += `<circle cx="${CX}" cy="${CY}" r="24" fill="var(--ink-2)"/><path d="M${CX} ${CY - 24} A24 24 0 0 1 ${CX} ${CY + 24}Z" fill="var(--c-P)"/><text x="${CX}" y="${CY + 5}" text-anchor="middle" font-size="13" fill="var(--card)" font-weight="700">地球</text>`;
    [['正午', 30, 0, 'start'], ['黃昏', 0, -31, 'middle'], ['午夜', -30, 0, 'end'], ['清晨', 0, 41, 'middle']].forEach(([n, dx, dy, an]) => { s += `<text x="${CX + dx}" y="${CY + dy + 4}" text-anchor="${an}" font-size="14" fill="var(--ink-2)">${n}</text>`; });
    s += `<g><circle cx="${mx}" cy="${my}" r="22" fill="var(--teal)" fill-opacity=".12"/><circle cx="${mx}" cy="${my}" r="13" fill="var(--ink-2)"/><path d="M${mx} ${my - 13} A13 13 0 0 1 ${mx} ${my + 13}Z" fill="var(--sun)"/><circle cx="${mx}" cy="${my}" r="13" fill="none" stroke="var(--ink)"/></g>`;
    s += `<text x="${mx + (Math.cos(t * D) > 0.3 ? -20 : 20)}" y="${my + (Math.sin(t * D) > 0 ? -18 : 30)}" text-anchor="middle" font-size="15" fill="var(--ink)">月球</text>`;
    s += `<text x="8" y="292" font-size="12" fill="var(--mute)">示意圖，未依比例；向日面恆亮</text>`;
    svg.innerHTML = s;
    ph.innerHTML = `<rect width="120" height="120" fill="var(--ink)"/><circle cx="60" cy="60" r="46" fill="var(--ink-2)"/><path d="${litPath(60, 60, 46, t)}" fill="var(--sun)"/>`;
    // 讀數
    const days = t / 360 * SYN, k = (1 - Math.cos(t * D)) / 2, rise = 6 + t / 15;
    el.querySelector('[data-n]').textContent = phaseName(t);
    el.querySelector('[data-s]').textContent = k < 0.02 ? '幾乎看不見' : t < 180 ? '亮面在右（西側）' : '亮面在左（東側）';
    let vis = [];
    for (const kk of [-1, 0, 1]) { const a = Math.max(rise + 24 * kk, 18), b = Math.min(rise + 12 + 24 * kk, 30); if (b - a > 0.01) vis.push([a, b]); }
    let vt = !vis.length || vis[0][1] - vis[0][0] < 0.7 ? '幾乎看不到（與太陽同升同落）' : vis[0][1] - vis[0][0] > 11.9 ? '整夜可見（18:00–06:00）' : `${hm(vis[0][0])}–${hm(vis[0][1])}`;
    const fact = (n, v, full) => `<div class="fact"${full ? ' style="grid-column:1/-1"' : ''}><span>${n}</span><b>${v}</b></div>`;
    facts.innerHTML = fact('距新月天數 = θ/360° × 29.53 日', `約 ${days.toFixed(1)} 日（農曆約${lunar(Math.min(30, Math.floor(days) + 1))}）`, 1) +
      fact('亮面比例 (1 − cos θ)/2', `${Math.round(k * 100)}%`) + fact('過中天（約）', hm(12 + t / 15)) +
      fact('月出（約）', hm(rise)) + fact('月沒（約）', hm(rise + 12)) +
      fact('夜間可見時段（設 18:00 日落、06:00 日出）', vt, 1);
    rng.value = Math.round(t) % 360; rng.nextElementSibling.textContent = `θ = ${Math.round(t) % 360}°`;
  }
  let run = 0;
  function start() {
    const id = ++run; let last = 0;
    const tick = (ts) => {
      if (!el.isConnected || !st.play || id !== run) return;
      if (last) st.th = (st.th + Math.min(ts - last, 100) * 0.024) % 360;
      last = ts; draw(); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function setPlay(p) { st.play = p; pbtn.textContent = p ? '❚❚ 暫停' : '▶ 播放'; pbtn.setAttribute('aria-pressed', p); if (p) start(); }
  rng.addEventListener('input', () => { setPlay(false); st.th = Number(rng.value); draw(); });
  el.querySelector('.ops').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-p')) setPlay(!st.play); else { setPlay(false); st.th = Number(b.dataset.v); draw(); }
  });
  const drag = (e) => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * 400 / r.width, y = (e.clientY - r.top) * 300 / r.height;
    if (Math.hypot(x - CX, y - CY) < 30) return;
    st.th = ((Math.atan2(CY - y, x - CX) / D) + 360) % 360; draw();
  };
  let down = false;
  svg.addEventListener('pointerdown', (e) => { down = true; setPlay(false); svg.setPointerCapture(e.pointerId); drag(e); });
  svg.addEventListener('pointermove', (e) => { if (down) drag(e); });
  svg.addEventListener('pointerup', () => { down = false; });
  draw();
  if (!reduce && opt && opt.autoplay) setPlay(true);
};

/* newton2 */
(window.SIMS = window.SIMS || {}).newton2 = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uid = 'x' + Math.random().toString(36).slice(2, 8);
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>合力、質量與加速度</b><span>拖動合力 F 與質量 m，看光滑軌道上台車的加速度如何改變。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 270" role="img" aria-label="光滑軌道上的台車與 a–F 圖"></svg></div>
<div class="sim-ctl">
${sl('F', 'F', 0, 20, 0.5, 6)}${sl('m', 'm', 0.5, 10, 0.5, 2)}
<div class="ops"><button type="button" data-b="play">播放</button><button type="button" data-b="reset">從靜止重來</button></div>
<div class="facts">${fact('a', '加速度 a = F / m')}${fact('v2', '2 s 後速度 v = at')}${fact('x2', '2 s 內位移 ½at²')}${fact('now', '此刻 t、v')}</div>
<p class="sim-note">m 固定時 a ∝ F（a–F 圖為過原點直線，斜率 = 1/m）；F 固定時 m 加倍，a 減半。加速度方向與合力相同。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { F: 6, m: 2, t: 0 };
  const LEN = 10, X0 = 40, PXM = 20;
  const acc = () => P.F / P.m;
  function draw() {
    const a = acc(), t = P.t, x = 0.5 * a * t * t, v = a * t;
    let s = `<defs><clipPath id="${uid}c"><rect x="50" y="146" width="296" height="98"/></clipPath></defs>`;
    // track
    s += `<line x1="8" x2="350" y1="104" y2="104" style="stroke:var(--ink-2)" stroke-width="3"/>`;
    for (let k = 0; k <= LEN; k += 2) s += `<line x1="${X0 + k * PXM}" x2="${X0 + k * PXM}" y1="104" y2="111" style="stroke:var(--ink-2)"/><text x="${X0 + k * PXM}" y="123" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="346" y="136" text-anchor="end" font-size="10" style="fill:var(--mute)">位置 (m)，光滑軌道</text>`;
    const x2 = 0.5 * a * 4;
    if (x2 <= LEN) s += `<line x1="${X0 + x2 * PXM}" x2="${X0 + x2 * PXM}" y1="58" y2="104" style="stroke:var(--sun)" stroke-width="2" stroke-dasharray="4 3"/><text x="${X0 + x2 * PXM}" y="54" text-anchor="middle" font-size="10" style="fill:var(--ink-2)">t = 2 s</text>`;
    // cart
    const w = 30 + 3 * P.m, cx = X0 + Math.min(x, LEN) * PXM + w / 2;
    s += `<rect x="${cx - w}" y="76" width="${w}" height="20" rx="4" style="fill:var(--teal)"/><circle cx="${cx - w + 7}" cy="98" r="5" style="fill:var(--ink)"/><circle cx="${cx - 7}" cy="98" r="5" style="fill:var(--ink)"/>`;
    s += `<text x="${cx - w / 2}" y="90" text-anchor="middle" font-size="10" style="fill:#fff">${f(P.m, 1)} kg</text>`;
    const fl = P.F * 4;
    if (fl > 1) s += `<line x1="${cx}" x2="${cx + fl}" y1="86" y2="86" style="stroke:var(--red)" stroke-width="3"/><path d="M${cx + fl + 4} 86 l-9 -5 v10z" style="fill:var(--red)"/><text x="${cx + 4}" y="78" font-size="11" style="fill:var(--red)">F = ${f(P.F, 1)} N</text>`;
    const al = Math.min(90, a * 6);
    if (al > 1) s += `<line x1="${cx - w}" x2="${cx - w + al}" y1="66" y2="66" style="stroke:var(--c-X)" stroke-width="2"/><path d="M${cx - w + al + 3} 66 l-7 -4 v8z" style="fill:var(--c-X)"/><text x="${cx - w}" y="60" font-size="11" style="fill:var(--c-X)">a</text>`;
    s += `<text x="10" y="20" font-size="11" style="fill:var(--ink-2)">t = ${f(t, 2)} s　v = ${f(v, 1)} m/s</text>`;
    // a-F graph
    const GX = (F) => 50 + (F / 20) * 296, GY = (aa) => 244 - (aa / 20) * 98;
    s += `<rect x="50" y="146" width="296" height="98" style="fill:var(--card);stroke:var(--line)"/>`;
    for (let k = 5; k < 20; k += 5) s += `<line x1="${GX(k)}" x2="${GX(k)}" y1="146" y2="244" style="stroke:var(--line)" stroke-dasharray="2 3"/><line x1="50" x2="346" y1="${GY(k)}" y2="${GY(k)}" style="stroke:var(--line)" stroke-dasharray="2 3"/>`;
    s += `<g clip-path="url(#${uid}c)"><line x1="${GX(0)}" y1="${GY(0)}" x2="${GX(20)}" y2="${GY(20 / P.m)}" style="stroke:var(--c-X)" stroke-width="2.2"/>`;
    s += `<circle cx="${GX(P.F)}" cy="${GY(Math.min(a, 19.7))}" r="5" style="fill:var(--red);stroke:#fff" stroke-width="1.5"/></g>`;
    s += `<text x="46" y="${GY(20) + 9}" text-anchor="end" font-size="10" style="fill:var(--mute)">20</text><text x="46" y="${GY(10) + 4}" text-anchor="end" font-size="10" style="fill:var(--mute)">10</text><text x="46" y="246" text-anchor="end" font-size="10" style="fill:var(--mute)">0</text>`;
    s += `<text x="12" y="200" font-size="11" style="fill:var(--c-X)">a</text><text x="4" y="214" font-size="9" style="fill:var(--mute)">(m/s²)</text>`;
    for (let k = 5; k <= 20; k += 5) s += `<text x="${GX(k)}" y="257" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="346" y="268" text-anchor="end" font-size="10" style="fill:var(--mute)">F (N)</text><text x="56" y="160" font-size="10" style="fill:var(--c-X)">斜率 = 1/m = ${f(1 / P.m, 2)} kg⁻¹</text>`;
    svg.innerHTML = s;
    $('[data-f=a]').textContent = `${f(P.F, 1)} / ${f(P.m, 1)} = ${f(a, 2)} m/s²`;
    $('[data-f=v2]').textContent = `${f(a * 2, 2)} m/s`;
    $('[data-f=x2]').textContent = `${f(x2, 2)} m`;
    $('[data-f=now]').textContent = `${f(t, 2)} s，${f(v, 2)} m/s`;
    $('[data-o=F]').textContent = `${f(P.F, 1)} N`;
    $('[data-o=m]').textContent = `${f(P.m, 1)} kg`;
  }
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0, hold = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    const a = acc(), end = 0.5 * a * P.t * P.t >= LEN || P.t >= 4;
    if (end) { hold += dt; if (hold > 0.7) { hold = 0; P.t = 0; } } else P.t = Math.min(a > 0 ? Math.sqrt(2 * LEN / a) : 4, 4, P.t + dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => play(!playing));
  $('[data-b=reset]').addEventListener('click', () => { P.t = 0; hold = 0; draw(); if (!RM) play(true); });
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => {
    P[k] = parseFloat(inp[k].value);
    P.t = RM ? Math.min(2, Math.sqrt(2 * LEN / Math.max(acc(), 1e-9))) : 0; hold = 0; draw();
  }));
  if (RM) P.t = Math.min(2, Math.sqrt(2 * LEN / acc()));
  draw();
  play(!RM);
};

/* orbit */
(window.SIMS = window.SIMS || {}).orbit = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  const NS = 12, RATE = 0.4; // 12 equal-time sectors; 0.4 yr per second of animation
  el.innerHTML = `<div class="sim-head"><b>克卜勒行星運動定律</b><span>調整離心率 e 與半長軸 a，看行星近快遠慢、等時間掃過等面積，以及週期如何隨 a 改變。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 260" role="img" aria-label="橢圓軌道與等時間掃過面積"></svg></div>
<div class="sim-ctl">
${sl('e', 'e', 0, 0.9, 0.01, 0.5)}${sl('a', 'a', 0.3, 5.2, 0.01, 1)}
<div class="ops"><button type="button" data-b="play">播放</button><button type="button" data-p="1,0.017">地球</button><button type="button" data-p="1.524,0.093">火星</button><button type="button" data-p="0.387,0.206">水星</button><button type="button" data-p="5.2,0.048">木星</button></div>
<div class="facts">${fact('T', '週期 T = a^(3/2)（T² = a³）')}${fact('rr', '近日距 a(1−e)／遠日距 a(1+e)')}${fact('vr', '近日速率／遠日速率 = r遠／r近')}${fact('A', `每塊面積（${NS} 等分週期）`)}${fact('now', '經過時間、此刻 r、速率')}</div>
<p class="sim-note">相鄰色塊是相等時間內掃過的面積，形狀不同但面積相等（第二定律）；近日點速率最大。週期只由半長軸決定，與 e 無關（第三定律）。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { e: 0.5, a: 1, t: 0 };
  const period = () => Math.pow(P.a, 1.5);
  function kepler(M) {
    let E = P.e > 0.8 ? Math.PI : M;
    for (let i = 0; i < 30; i++) { const d = (E - P.e * Math.sin(E) - M) / (1 - P.e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
    return E;
  }
  const b = () => P.a * Math.sqrt(1 - P.e * P.e);
  const pos = (M) => { const E = kepler(M); return [P.a * (Math.cos(E) - P.e), b() * Math.sin(E)]; };
  function draw() {
    const a = P.a, e = P.e, bb = b(), T = period();
    const xmin = Math.min(-a * (1 + e), -1), xmax = Math.max(a * (1 - e), 1), ym = Math.max(bb, 1);
    const sc = Math.min(336 / (xmax - xmin), 220 / (2 * ym));
    const sx = 180 - ((xmin + xmax) / 2) * sc, sy = 128;
    const X = (x) => (sx + x * sc).toFixed(1), Y = (y) => (sy - y * sc).toFixed(1);
    const M = ((2 * Math.PI * P.t) / T) % (2 * Math.PI), cur = Math.floor(M / (2 * Math.PI / NS));
    let s = '';
    for (let k = 0; k < NS; k++) {
      const m0 = (2 * Math.PI * k) / NS, m1 = m0 + (2 * Math.PI) / NS;
      let d = `M${X(0)} ${Y(0)}`;
      for (let j = 0; j <= 16; j++) { const p = pos(m0 + ((m1 - m0) * j) / 16); d += `L${X(p[0])} ${Y(p[1])}`; }
      s += `<path d="${d}Z" style="fill:${k === cur ? 'var(--sun)' : k % 2 ? 'var(--teal)' : 'var(--c-P)'};opacity:${k === cur ? 0.55 : 0.16}"/>`;
    }
    s += `<circle cx="${X(0)}" cy="${Y(0)}" r="${sc}" fill="none" style="stroke:var(--mute)" stroke-dasharray="3 4"/>`;
    s += `<text x="${X(0)}" y="${(sy - sc - 4).toFixed(1)}" text-anchor="middle" font-size="10" style="fill:var(--mute)">地球軌道 1 AU</text>`;
    s += `<ellipse cx="${X(-a * e)}" cy="${sy}" rx="${(a * sc).toFixed(1)}" ry="${(bb * sc).toFixed(1)}" fill="none" style="stroke:var(--teal)" stroke-width="2"/>`;
    s += `<line x1="${X(-a * (1 + e))}" x2="${X(a * (1 - e))}" y1="${sy}" y2="${sy}" style="stroke:var(--line)"/>`;
    if (e > 0.02) s += `<circle cx="${X(-2 * a * e)}" cy="${sy}" r="2.5" fill="none" style="stroke:var(--mute)"/>`;
    s += `<text x="${X(a * (1 - e) - 5 / sc)}" y="${sy + 14}" text-anchor="end" font-size="10" style="fill:var(--ink-2)">近日點</text><text x="${X(-a * (1 + e) + 5 / sc)}" y="${sy + 14}" font-size="10" style="fill:var(--ink-2)">遠日點</text>`;
    s += `<circle cx="${X(0)}" cy="${sy}" r="7" style="fill:var(--sun);stroke:var(--c-C)" stroke-width="1.5"/>`;
    const p = pos(M);
    s += `<line x1="${X(0)}" y1="${sy}" x2="${X(p[0])}" y2="${Y(p[1])}" style="stroke:var(--ink-2)" stroke-width="1.2"/>`;
    s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="5.5" style="fill:var(--c-P);stroke:#fff" stroke-width="1.5"/>`;
    s += `<text x="8" y="252" font-size="10" style="fill:var(--mute)">${e > 0.02 ? '空心圓：另一焦點（無天體）　' : ''}動畫：1 秒 = ${RATE} 年</text>`;
    svg.innerHTML = s;
    const rp = a * (1 - e), ra = a * (1 + e), r = Math.hypot(p[0], p[1]);
    const v = 29.78 * Math.sqrt(2 / r - 1 / a);
    $('[data-f=T]').textContent = `${f(T, 3)} 年`;
    $('[data-f=rr]').textContent = `${f(rp, 3)}／${f(ra, 3)} AU`;
    $('[data-f=vr]').textContent = e > 0 ? `${f(ra, 3)} / ${f(rp, 3)} = ${f(ra / rp, 2)}` : '1（圓軌道等速率）';
    $('[data-f=A]').textContent = `πab/${NS} = ${f((Math.PI * a * bb) / NS, 3)} AU²`;
    $('[data-f=now]').textContent = `${f(P.t % T, 2)} 年，${f(r, 3)} AU，${f(v, 1)} km/s`;
    $('[data-o=e]').textContent = f(P.e, 2);
    $('[data-o=a]').textContent = `${f(P.a, 2)} AU`;
  }
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    P.t = (P.t + dt * RATE) % period();
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => play(!playing));
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => { P[k] = parseFloat(inp[k].value); P.t = P.t % period(); draw(); }));
  el.querySelectorAll('[data-p]').forEach((bt) => bt.addEventListener('click', () => {
    const [a, e] = bt.dataset.p.split(',').map(Number);
    P.a = a; P.e = e; inp.a.value = a; inp.e.value = e; P.t = 0; draw();
  }));
  P.t = RM ? period() * 0.3 : 0;
  draw();
  play(!RM);
};

/* osmosis */
(window.SIMS = window.SIMS || {}).osmosis = function (el, opt) {
  const CIN = 0.9, LYSIS = 1.6, cx = 180, cy = 118;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let kind = opt.mode === 'plant' ? 'plant' : 'animal', C = opt.c != null ? +opt.c : 0.6, V = 1, burst = false, parts = [], last = 0, running = false;
  el.innerHTML = `<div class="sim-head"><b>細胞在不同濃度溶液中的滲透</b><span>拖動外界溶液濃度，看水的淨移動方向與細胞體積如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 236" role="img" aria-label="細胞與外界溶液"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="kind"><button type="button" data-k="animal">動物細胞（紅血球）</button><button type="button" data-k="plant">植物細胞（洋蔥表皮）</button></div>
    <label class="sl"><span>外界 NaCl</span><input type="range" min="0" max="3" step="0.05" value="${C}"><output></output></label>
    <div class="ops"><button type="button" data-play>${reduce ? '播放：' : ''}放入新細胞重看一次</button></div>
    <div class="facts">
      <div class="fact"><span>外界溶液（相對於細胞內 0.9%）</span><b data-f="t"></b></div>
      <div class="fact"><span>水的淨移動</span><b data-f="w"></b></div>
      <div class="fact"><span>細胞（原生質體）體積 V/V₀</span><b data-f="v"></b></div>
      <div class="fact"><span>結果</span><b data-f="r"></b></div>
    </div>
    <p class="sim-note" data-note></p>
    <p style="margin:0;font-size:.78rem;color:var(--mute)">藍點：水分子（可通過膜，雙向移動）；橙點：溶質粒子（不能通過膜）。</p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg'), rng = q('input');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dots = Array.from({ length: 200 }, () => ({ x: rnd(8, 352), y: rnd(8, 228), p: rnd(0, 6.28) }));
  const inDots = Array.from({ length: 8 }, () => ({ a: rnd(0, 6.28), r: Math.sqrt(rnd(0.04, 0.6)), p: rnd(0, 6.28) }));
  function target() {
    const raw = 0.4 + 0.6 * CIN / Math.max(C, 0.02); // 含不參與滲透的體積 0.4
    return kind === 'animal' ? raw : Math.min(raw, 1 + 0.04 * Math.min(1, (CIN - C) / CIN * 2));
  }
  function geom() { // 半軸 a、b
    if (kind === 'animal') return [70 * Math.pow(V, 0.25), 44 * Math.pow(V, 0.9)];
    const k = Math.sqrt(Math.min(V, 1.04)); return [98 * k, 62 * k];
  }
  function cellPath(a, b) {
    const crenate = kind === 'animal' && V < 0.97 ? Math.min(0.12, (1 - V) * 0.35) : 0;
    let d = '';
    for (let i = 0; i <= 72; i++) {
      const t = i / 72 * 6.2832, f = 1 + crenate * Math.cos(14 * t);
      d += (i ? 'L' : 'M') + (cx + a * f * Math.cos(t)).toFixed(1) + ',' + (cy + b * f * Math.sin(t)).toFixed(1);
    }
    return d + 'Z';
  }
  function draw(now) {
    const Vt = target(), [a, b] = geom(), net = burst ? 0 : Vt - V;
    const nOut = Math.round(Math.min(200, C / CIN * 60));
    let h = `<rect width="360" height="236" fill="${burst ? 'var(--red)' : 'var(--card)'}" opacity="${burst ? 0.12 : 1}"/>`;
    dots.slice(0, nOut).forEach((d) => { h += `<circle cx="${(d.x + 2 * Math.sin(now / 700 + d.p)).toFixed(1)}" cy="${(d.y + 2 * Math.cos(now / 800 + d.p)).toFixed(1)}" r="2.6" fill="var(--c-C)"/>`; });
    if (kind === 'plant') {
      const tg = Math.max(0, Math.min(1, (CIN - C) / CIN * 2)) * (V >= 0.999 ? 1 : 0), bw = 104 + 3 * tg, bh = 68 + 3 * tg;
      h += `<rect x="${cx - bw}" y="${cy - bh}" width="${2 * bw}" height="${2 * bh}" rx="10" fill="none" stroke="var(--c-B)" stroke-width="6"/>`;
      const rr = roundRect(a, b, Math.max(6, 30 * (1 - Math.min(V, 1)) * 3 + 6));
      h += `<path d="${rr}" fill="var(--card)"/><path d="${rr}" fill="var(--c-X)" fill-opacity="${Math.min(0.75, 0.32 / Math.min(V, 1))}" stroke="var(--ink-2)" stroke-width="1.4"/>`;
      h += `<circle cx="${cx - a * 0.6}" cy="${cy - b * 0.35}" r="9" fill="var(--card)" stroke="var(--ink-2)"/>`;
      h += `<text x="${cx}" y="${cy - bh - 6}" text-anchor="middle" font-size="11" fill="var(--c-B)">細胞壁（全透性）</text>`;
    } else if (burst) {
      h += `<path d="${cellPath(a, b)}" fill="none" stroke="var(--red)" stroke-width="1.5" stroke-dasharray="7 9"/>`;
      h += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" fill="var(--red)" font-weight="700">溶血：細胞膜破裂</text>`;
    } else h += `<path d="${cellPath(a, b)}" fill="var(--card)"/><path d="${cellPath(a, b)}" fill="var(--red)" fill-opacity="${Math.min(0.8, 0.5 / V)}" stroke="var(--red)" stroke-width="1.6"/>`;
    if (!burst) inDots.forEach((d) => { h += `<circle cx="${(cx + d.r * a * 0.92 * Math.cos(d.a + now / 4000 + d.p)).toFixed(1)}" cy="${(cy + d.r * b * 0.92 * Math.sin(d.a + now / 4000 + d.p)).toFixed(1)}" r="2.6" fill="var(--c-C)"/>`; });
    parts.forEach((p) => { const k = p.k0 + (p.k1 - p.k0) * p.t; h += `<circle cx="${(cx + a * k * Math.cos(p.th)).toFixed(1)}" cy="${(cy + b * k * Math.sin(p.th)).toFixed(1)}" r="2.4" fill="var(--c-P)"/>`; });
    if (Math.abs(net) > 0.01) {
      const op = Math.min(1, 0.3 + Math.abs(net) * 3), inw = net > 0;
      [[-1, 0], [1, 0]].forEach(([sx]) => {
        const x0 = cx + sx * (a + (inw ? 40 : 8)), x1 = cx + sx * (a + (inw ? 8 : 40));
        h += `<line x1="${x0}" y1="${cy}" x2="${x1}" y2="${cy}" stroke="var(--c-P)" stroke-width="5" opacity="${op}"/><path d="M${x1},${cy}l${(x0 > x1 ? 9 : -9)},-7v14z" fill="var(--c-P)" opacity="${op}"/>`;
      });
    }
    svg.innerHTML = h;
  }
  function roundRect(a, b, r) { r = Math.min(r, a, b); return `M${cx - a + r},${cy - b}H${cx + a - r}Q${cx + a},${cy - b} ${cx + a},${cy - b + r}V${cy + b - r}Q${cx + a},${cy + b} ${cx + a - r},${cy + b}H${cx - a + r}Q${cx - a},${cy + b} ${cx - a},${cy + b - r}V${cy - b + r}Q${cx - a},${cy - b} ${cx - a + r},${cy - b}Z`; }
  function facts() {
    const Vt = target(), iso = Math.abs(C - CIN) < 0.05, net = burst ? 0 : Vt - V;
    q('output').textContent = C.toFixed(2) + ' %';
    q('[data-f="t"]').textContent = iso ? '等張溶液' : C < CIN ? '低張溶液' : '高張溶液';
    q('[data-f="w"]').textContent = burst ? '細胞已破裂' : Math.abs(net) < 0.01 ? '進出相等（淨移動 0）' : net > 0 ? '進入細胞' : '流出細胞';
    q('[data-f="v"]').textContent = burst ? '—' : V.toFixed(2);
    let r, n;
    if (kind === 'animal') {
      r = burst ? '溶血' : iso ? '維持原狀' : C < CIN ? (Vt >= LYSIS ? '膨脹→將破裂' : '膨脹') : '皺縮';
      n = burst ? '紅血球沒有細胞壁，低張溶液中持續吸水，膨脹超過極限就破裂（溶血）；破裂不可逆，可按「放入新細胞」。' : C > CIN ? '外界溶質濃度高，水由細胞往外淨移動，紅血球皺縮。' : iso ? '約 0.9% NaCl 為紅血球的等張溶液：水分子仍雙向移動，但淨移動為零。' : '水往溶質濃度高的細胞內淨移動，紅血球膨脹；濃度再低就會溶血。';
    } else {
      r = V < 0.985 ? '質壁分離' : iso ? '膨壓小（較軟）' : C < CIN ? '膨壓大（堅挺）' : '開始質壁分離';
      n = C > CIN + 0.04 ? '原生質體失水縮小，與細胞壁分開（質壁分離）；壁與膜之間充滿外界溶液，因細胞壁為全透性。' : C < CIN - 0.04 ? '植物細胞吸水膨脹，但細胞壁限制體積，產生膨壓而不破裂。' : '等張時原生質體恰貼著細胞壁，膨壓小，組織較軟。';
    }
    q('[data-f="r"]').textContent = r; q('[data-note]').textContent = n;
    el.querySelectorAll('[data-k]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.k === kind));
  }
  function step(now) {
    if (!el.isConnected) { running = false; return; }
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const Vt = target();
    if (!burst) {
      V += (Vt - V) * Math.min(1, dt * 0.9);
      if (Math.abs(Vt - V) < 0.002) V = Vt;
      if (kind === 'animal' && V >= LYSIS) { burst = true; parts = []; }
      const net = Vt - V, rin = 6 + Math.max(0, net) * 60, rout = 6 + Math.max(0, -net) * 60;
      [[rin, 1.45, 0.75], [rout, 0.75, 1.45]].forEach(([r, k0, k1]) => { if (Math.random() < r * dt && parts.length < 40) parts.push({ th: rnd(0, 6.28), k0, k1, t: 0 }); });
      parts.forEach((p) => { p.t += dt * 0.9; }); parts = parts.filter((p) => p.t < 1);
    }
    draw(now); facts();
    const settled = burst || Math.abs(target() - V) < 0.002;
    if (reduce && settled) { running = false; parts = []; draw(now); return; }
    requestAnimationFrame(step);
  }
  function go() { if (!running) { running = true; last = 0; requestAnimationFrame(step); } }
  function settle() { const Vt = target(); if (kind === 'animal' && Vt >= LYSIS) burst = true; else V = Vt; parts = []; draw(0); facts(); }
  rng.addEventListener('input', () => { C = +rng.value; if (reduce) settle(); else go(); facts(); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k) { kind = b.dataset.k; V = 1; burst = false; parts = []; }
    if (b.dataset.k && reduce) settle();
    if (b.hasAttribute('data-play')) { V = 1; burst = false; parts = []; go(); facts(); return; }
    if (!reduce) go(); facts(); draw(performance.now());
  });
  if (reduce) settle(); else go();
  facts();
};

/* ph */
(window.SIMS = window.SIMS || {}).ph = function (el, opt) {
  const SUBS = [[2.0, '胃液', 0], [2.2, '檸檬汁', 1], [2.5, '食醋', 2], [5.0, '黑咖啡', 0], [5.6, '雨水', 1], [6.6, '牛奶', 2], [7.4, '血液', 0], [8.1, '海水', 1], [11.2, '氨水', 2], [12.5, '漂白水', 1]];
  // [名稱, 下限, 上限, 酸型色, 中間色, 鹼型色, 顏色名]
  const IND = [
    ['甲基橙', 3.1, 4.4, 'var(--red)', 'var(--c-C)', 'var(--sun)', ['紅', '橙', '黃']],
    ['甲基紅', 4.4, 6.2, 'var(--red)', 'var(--c-C)', 'var(--sun)', ['紅', '橙', '黃']],
    ['石蕊', 4.5, 8.3, 'var(--red)', 'var(--c-X)', 'var(--c-P)', ['紅', '紫', '藍']],
    ['BTB', 6.0, 7.6, 'var(--sun)', 'var(--green)', 'var(--c-P)', ['黃', '綠', '藍']],
    ['酚酞', 8.2, 10.0, 'var(--card)', null, 'var(--red)', ['無色', '淡粉紅', '粉紅']],
  ];
  const st = { lg: -3 }; // log10[H+]
  const uid = 'p' + Math.random().toString(36).slice(2, 8);
  el.innerHTML = `<div class="sim-head"><b>pH、pOH 與指示劑</b><span>拖動滑桿改變 [H⁺]（對數刻度），看 pH、pOH、[OH⁻] 與各指示劑的顏色。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="pH 尺度與指示劑變色範圍"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>[H⁺]</span><input type="range" min="-14" max="0" step="0.05"><output></output></label>
    <div class="ops"><button type="button" data-d="1">[H⁺] × 10</button><button type="button" data-d="-1">[H⁺] ÷ 10</button><button type="button" data-d="0">中性</button></div>
    <div class="facts">
      <div class="fact"><span>pH = −log[H⁺]</span><b data-f="ph"></b></div><div class="fact"><span>pOH = 14.00 − pH</span><b data-f="poh"></b></div>
      <div class="fact"><span>[OH⁻] = 1.0×10⁻¹⁴ / [H⁺]</span><b data-f="oh"></b></div><div class="fact"><span>25 °C 時溶液為</span><b data-f="t"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>指示劑顏色</span><b data-f="ind" style="font-size:.88rem"></b></div>
    </div>
    <p class="sim-note">pH 每差 1，[H⁺] 差 10 倍；25 °C 時 [H⁺][OH⁻] = 1.0×10⁻¹⁴，pH + pOH = 14.00。指示劑只能判斷 pH 落在某一範圍，變色範圍並不以 7 為中心。</p>
  </div></div>`;
  const svg = el.querySelector('svg'), rng = el.querySelector('input'), f = (k) => el.querySelector(`[data-f="${k}"]`);
  const sup = (n) => String(n).split('').map((c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])).join('');
  const sci = (lg) => { let e = Math.floor(lg + 1e-9), m = 10 ** (lg - e); if (m >= 9.95) { m /= 10; e += 1; } return `${m.toFixed(1)}×10${sup(e)} M`; };
  const L = 72, R = 404, X = (p) => L + (p / 14) * (R - L), BY = 70;
  const blend = (I, p) => {
    if (p <= I[1]) return { c: I[3], n: I[6][0] };
    if (p >= I[2]) return { c: I[5], n: I[6][2] };
    const u = (p - I[1]) / (I[2] - I[1]);
    if (!I[4]) return { c: I[5], o: u, base: I[3], n: I[6][1] };
    return u < 0.5 ? { c: I[4], o: u * 2, base: I[3], n: I[6][1] } : { c: I[5], o: (u - 0.5) * 2, base: I[4], n: I[6][1] };
  };
  const stop = (o, c, op) => `<stop offset="${o}" style="stop-color:${c};stop-opacity:${op == null ? 1 : op}"/>`;
  function draw() {
    const pH = -st.lg, pOH = 14 - pH;
    let s = '<defs>';
    s += `<linearGradient id="${uid}s">${stop(0, 'var(--red)')}${stop(0.25, 'var(--c-C)')}${stop(0.4, 'var(--sun)')}${stop(0.5, 'var(--green)')}${stop(0.7, 'var(--c-P)')}${stop(1, 'var(--c-X)')}</linearGradient>`;
    IND.forEach((I, i) => {
      const a = I[1] / 14, b = I[2] / 14, m = (a + b) / 2;
      s += `<linearGradient id="${uid}i${i}">${stop(0, I[3])}${stop(a, I[3])}${I[4] ? stop(m, I[4]) : ''}${stop(b, I[5])}${stop(1, I[5])}</linearGradient>`;
    });
    s += '</defs>';
    SUBS.forEach(([p, n, r]) => {
      const y = BY - 12 - r * 15;
      s += `<line x1="${X(p)}" x2="${X(p)}" y1="${y + 3}" y2="${BY}" stroke="var(--mute)" stroke-width=".8"/><text x="${X(p)}" y="${y}" font-size="11" text-anchor="middle" fill="var(--ink-2)">${n}</text>`;
    });
    s += `<rect x="${L}" y="${BY}" width="${R - L}" height="16" rx="3" fill="url(#${uid}s)"/>`;
    for (let p = 0; p <= 14; p++) s += `<text x="${X(p)}" y="${BY + 30}" font-size="11" text-anchor="middle" fill="var(--ink-2)">${p}</text>`;
    s += `<text x="4" y="${BY + 13}" font-size="12" font-weight="700" fill="var(--ink)">pH</text><text x="${L}" y="${BY + 44}" font-size="10" fill="var(--red)">← 酸性增強</text><text x="${R}" y="${BY + 44}" font-size="10" text-anchor="end" fill="var(--c-X)">鹼性增強 →</text>`;
    const y0 = 140;
    s += `<text x="4" y="${y0 - 8}" font-size="12" font-weight="700" fill="var(--teal)">指示劑變色範圍</text>`;
    const names = [];
    IND.forEach((I, i) => {
      const y = y0 + i * 30;
      s += `<text x="4" y="${y + 15}" font-size="12" fill="var(--ink)">${I[0]}</text><rect x="${L}" y="${y}" width="${R - L}" height="20" rx="3" fill="url(#${uid}i${i})" stroke="var(--line)"/>`;
      s += `<text x="${X(I[1])}" y="${y + 30}" font-size="9" text-anchor="middle" fill="var(--mute)">${I[1].toFixed(1)}</text><text x="${X(I[2])}" y="${y + 30}" font-size="9" text-anchor="middle" fill="var(--mute)">${I[2].toFixed(1)}</text>`;
      const c = blend(I, pH);
      names.push(`${I[0]} ${c.n}`);
      s += `<circle cx="${X(pH)}" cy="${y + 10}" r="9" fill="${c.base || c.c}" stroke="var(--ink)" stroke-width="1.5"/>`;
      if (c.base) s += `<circle cx="${X(pH)}" cy="${y + 10}" r="9" fill="${c.c}" fill-opacity="${c.o.toFixed(2)}"/>`;
    });
    s += `<line x1="${X(pH)}" x2="${X(pH)}" y1="${BY - 4}" y2="${y0 + 148}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".6"/>`;
    s += `<path d="M${X(pH)} ${BY + 18} l-7 10 h14 z" fill="var(--ink)"/>`;
    svg.innerHTML = s;
    rng.value = st.lg; rng.nextElementSibling.textContent = sci(st.lg);
    f('ph').textContent = pH.toFixed(2);
    f('poh').textContent = pOH.toFixed(2);
    f('oh').textContent = sci(-14 - st.lg);
    f('t').textContent = Math.abs(pH - 7) < 0.005 ? '中性' : pH < 7 ? '酸性' : '鹼性';
    f('ind').textContent = names.join('、');
  }
  rng.addEventListener('input', () => { st.lg = Number(rng.value); draw(); });
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { const d = Number(b.dataset.d); st.lg = d ? Math.min(0, Math.max(-14, Math.round((st.lg + d) * 100) / 100)) : -7; draw(); }));
  draw();
};

/* phase */
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

/* photo */
(window.SIMS = window.SIMS || {}).photo = function (el, opt) {
  const MET = [['銫', 2.1], ['鉀', 2.3], ['鈉', 2.4], ['鋅', 4.3], ['銅', 4.7]];
  const H = 6.63e-34, E = 1.6e-19;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { m: 1, wl: 400, I: 60 };
  el.innerHTML = `<div class="sim-head"><b>光電效應</b><span>選金屬，調整入射光的波長與強度，看有沒有光電子、最大動能多大。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 440 340" role="img" aria-label="光照射金屬板與 Kmax–f 圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="met">${MET.map((m, i) => `<button type="button" data-i="${i}">${m[0]} W = ${m[1]} eV</button>`).join('')}</div>
    <label class="sl"><span>波長 λ</span><input type="range" data-k="wl" min="150" max="700" step="5" value="400"><output></output></label>
    <label class="sl"><span>強度</span><input type="range" data-k="I" min="0" max="100" step="5" value="60"><output></output></label>
    <div class="facts"><div class="fact"><span>頻率 f = c/λ</span><b data-f="f"></b></div><div class="fact"><span>光子能量 hf = 1240/λ</span><b data-f="hf"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>最大動能 Kmax = hf − W</span><b data-f="k"></b></div>
      <div class="fact"><span>底限頻率 f₀ = W/h</span><b data-f="f0"></b></div><div class="fact"><span>底限波長 λ₀ = 1240/W</span><b data-f="l0"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>每秒射出的光電子（相對）</span><b data-f="n"></b></div></div>
    <p class="sim-note">能否射出電子只看單一光子能量 hf 是否大於功函數 W；強度只改變光子數（光電子數），不改變 Kmax。Kmax–f 圖為斜率 h 的直線，各金屬互相平行。</p>
  </div></div>`;
  const svg = el.querySelector('svg'), $ = (s) => el.querySelector(s);
  function wlColor(w) {
    if (w < 380) return '#9a8cc4';
    let r = 0, g = 0, b = 0;
    if (w < 440) { r = (440 - w) / 60; b = 1; } else if (w < 490) { g = (w - 440) / 50; b = 1; } else if (w < 510) { g = 1; b = (510 - w) / 20; }
    else if (w < 580) { r = (w - 510) / 70; g = 1; } else if (w < 645) { r = 1; g = (645 - w) / 65; } else r = 1;
    return `rgb(${Math.round(r * 230)},${Math.round(g * 210)},${Math.round(b * 230)})`;
  }
  const GX0 = 50, GX1 = 428, GY0 = 168, GY1 = 318, FMAX = 20, KMIN = -5, KMAX = 6.5;
  const gx = (f) => GX0 + (f / FMAX) * (GX1 - GX0), gy = (k) => GY1 - ((k - KMIN) / (KMAX - KMIN)) * (GY1 - GY0);
  let parts = [], acc = 0;
  function vals() { const W = MET[st.m][1], hf = 1240 / st.wl, f = 3e8 / (st.wl * 1e-9) / 1e14; return { W, hf, f, K: hf - W, f0: (W * E) / H / 1e14 }; }
  function scene() {
    const { K } = vals(), col = wlColor(st.wl), op = 0.15 + 0.6 * st.I / 100;
    let s = `<rect x="40" y="40" width="22" height="100" fill="var(--ink-2)" rx="2"/><text x="51" y="32" font-size="14" text-anchor="middle" fill="var(--ink)">${MET[st.m][0]}</text>`;
    if (st.I > 0) s += `<polygon points="62,60 62,120 260,10 200,10" fill="${col}" fill-opacity="${op}"/><text x="236" y="28" font-size="13" fill="var(--ink-2)">${st.wl < 380 ? '紫外線' : '可見光'} ${st.wl} nm</text>`;
    if (K > 0 && st.I > 0) {
      if (reduce) for (let i = 0; i < 6; i++) { const a = -0.6 + i * 0.25, L = 25 + 70 * Math.sqrt(K / 6) * (0.4 + 0.6 * ((i * 37) % 10) / 10); s += `<line x1="64" y1="${55 + i * 15}" x2="${64 + L * Math.cos(a)}" y2="${55 + i * 15 + L * Math.sin(a)}" stroke="var(--c-P)" stroke-width="1.5"/><circle cx="${64 + L * Math.cos(a)}" cy="${55 + i * 15 + L * Math.sin(a)}" r="3.5" fill="var(--c-P)"/>`; }
      else parts.forEach((p) => { s += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(--c-P)"/>`; });
      s += `<text x="300" y="140" font-size="13" fill="var(--c-P)">e⁻ 光電子射出</text>`;
    } else s += `<text x="${st.I > 0 ? 110 : 80}" y="140" font-size="13" fill="var(--red)">${st.I > 0 ? 'hf < W：沒有光電子（再強也沒有）' : '沒有照光'}</text>`;
    return s;
  }
  function graph() {
    const { W, f, K, f0 } = vals();
    let s = `<line x1="${GX0}" y1="${gy(0)}" x2="${GX1}" y2="${gy(0)}" stroke="var(--ink-2)"/><line x1="${GX0}" y1="${GY0}" x2="${GX0}" y2="${GY1}" stroke="var(--ink-2)"/>`;
    for (let k = -4; k <= 6; k += 2) s += `<text x="${GX0 - 4}" y="${gy(k) + 4}" font-size="11" text-anchor="end" fill="var(--mute)">${k}</text>`;
    for (let q = 5; q <= 20; q += 5) s += `<text x="${gx(q)}" y="${gy(0) + 14}" font-size="11" text-anchor="middle" fill="var(--mute)">${q}</text>`;
    s += `<text x="${GX0 + 4}" y="${GY0 + 4}" font-size="12" fill="var(--ink-2)">Kmax（eV）</text><text x="${GX1}" y="${gy(0) - 6}" font-size="12" text-anchor="end" fill="var(--ink-2)">f（10¹⁴ Hz）</text>`;
    MET.forEach((m, i) => { if (i === st.m) return; const a = (m[1] * E) / H / 1e14; s += `<line x1="${gx(a)}" y1="${gy(0)}" x2="${gx(FMAX)}" y2="${gy(4.136 * (FMAX - a) / 10)}" stroke="var(--line)" stroke-width="1.5"/>`; });
    const slope = 0.4136; // h in eV per 10^14 Hz
    s += `<line x1="${gx(0)}" y1="${gy(-W)}" x2="${gx(f0)}" y2="${gy(0)}" stroke="var(--teal)" stroke-dasharray="4 4"/><line x1="${gx(f0)}" y1="${gy(0)}" x2="${gx(FMAX)}" y2="${gy(slope * (FMAX - f0))}" stroke="var(--teal)" stroke-width="2.5"/>`;
    s += `<circle cx="${gx(0)}" cy="${gy(-W)}" r="3.5" fill="var(--teal)"/><text x="${gx(0) + 6}" y="${gy(-W) + 4}" font-size="12" fill="var(--teal)">−W = −${W} eV</text>`;
    s += `<circle cx="${gx(f0)}" cy="${gy(0)}" r="3.5" fill="var(--teal)"/><text x="${gx(f0)}" y="${gy(0) - 8}" font-size="12" text-anchor="middle" fill="var(--teal)">f₀</text>`;
    s += `<text x="${gx(15)}" y="${gy(slope * (15 - f0)) - 10}" font-size="12" text-anchor="end" fill="var(--teal)">斜率 = h</text>`;
    const py = K > 0 ? gy(K) : gy(0);
    s += `<line x1="${gx(f)}" y1="${GY0}" x2="${gx(f)}" y2="${GY1}" stroke="${wlColor(st.wl)}" stroke-width="1.5"/><circle cx="${gx(f)}" cy="${py}" r="6" fill="${K > 0 ? 'var(--red)' : 'var(--card)'}" stroke="var(--red)" stroke-width="2"/>`;
    return s;
  }
  function draw() {
    const { W, hf, f, K, f0 } = vals();
    svg.innerHTML = scene() + graph();
    $('[data-k="wl"] + output').textContent = st.wl + ' nm';
    $('[data-k="I"] + output').textContent = st.I + ' %';
    $('[data-f="f"]').textContent = f.toFixed(2) + '×10¹⁴ Hz';
    $('[data-f="hf"]').textContent = `1240/${st.wl} = ${hf.toFixed(2)} eV`;
    $('[data-f="k"]').textContent = K > 0 ? `${hf.toFixed(2)} − ${W} = ${K.toFixed(2)} eV（截止電壓 V₀ = ${K.toFixed(2)} V）` : `${hf.toFixed(2)} − ${W} < 0 → 無光電子`;
    $('[data-f="f0"]').textContent = f0.toFixed(2) + '×10¹⁴ Hz';
    $('[data-f="l0"]').textContent = (1240 / W).toFixed(0) + ' nm';
    $('[data-f="n"]').textContent = K > 0 ? `${st.I}（∝ 光強度）` : '0';
    el.querySelectorAll('[data-g="met"] button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.i) === st.m)));
  }
  let last = 0;
  function frame(t) {
    if (!el.isConnected) return;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60; last = t;
    const { K } = vals();
    if (K > 0 && st.I > 0) { acc += dt * st.I * 0.4; while (acc >= 1) { acc -= 1; const a = -0.9 + Math.random() * 1.6, sp = 40 + 260 * Math.sqrt((K * Math.random()) / 6.5); parts.push({ x: 64, y: 50 + Math.random() * 80, vx: sp * Math.cos(a), vy: sp * Math.sin(a) }); } }
    parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; });
    parts = parts.filter((p) => p.x < 440 && p.y > -10 && p.y < 150);
    draw(); requestAnimationFrame(frame);
  }
  el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => { st[inp.dataset.k] = Number(inp.value); if (reduce) draw(); }));
  $('[data-g="met"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.m = Number(b.dataset.i); parts = []; draw(); });
  draw(); if (!reduce) requestAnimationFrame(frame);
};

/* photosyn */
(window.SIMS = window.SIMS || {}).photosyn = function (el, opt) {
  const CO2 = { low: ['0.03%（大氣）', 9], high: ['0.1%（提高）', 18] };
  const TEMP = { 15: [0.6, 1.2], 25: [1, 2.4], 35: [1.15, 4.2] }; // [碳反應酵素的倍率, 呼吸速率]
  const A = 0.4, X0 = 46, X1 = 346, Y0 = 196, Y1 = 18, YMAX = 22, YMIN = -6;
  let I = opt.light != null ? +opt.light : 50, co2 = 'low', tc = 25, others = true;
  el.innerHTML = `<div class="sim-head"><b>光照強度與光合作用速率</b><span>拖動光照強度，切換 CO₂ 濃度與溫度，看哪一個因子限制速率。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 236" role="img" aria-label="光合作用速率曲線"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>光照強度</span><input type="range" min="0" max="100" step="1" value="${I}"><output></output></label>
    <div class="ops">${Object.entries(CO2).map(([k, v]) => `<button type="button" data-co2="${k}">CO₂ ${v[0]}</button>`).join('')}</div>
    <div class="ops">${Object.keys(TEMP).map((k) => `<button type="button" data-t="${k}">${k} °C</button>`).join('')}<button type="button" data-oth aria-pressed="true">比較其他條件</button></div>
    <div class="facts">
      <div class="fact"><span>總光合速率（產生 O₂）</span><b data-f="g"></b></div>
      <div class="fact"><span>呼吸速率（消耗 O₂）</span><b data-f="r"></b></div>
      <div class="fact"><span>淨光合速率 ＝ 總 − 呼吸</span><b data-f="n"></b></div>
      <div class="fact"><span>光補償點／光飽和點</span><b data-f="c"></b></div>
      <div class="fact"><span>目前的限制因子</span><b data-f="l"></b></div>
    </div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg'), rng = q('input');
  const pmax = (c, t) => CO2[c][1] * TEMP[t][0];
  const gross = (i, c, t) => pmax(c, t) * Math.tanh(A * i / pmax(c, t));
  const comp = (c, t) => pmax(c, t) / A * Math.atanh(TEMP[t][1] / pmax(c, t));
  const sat = (c, t) => pmax(c, t) / A * Math.atanh(0.95);
  const sx = (i) => X0 + i / 100 * (X1 - X0), sy = (v) => Y0 - (v - YMIN) / (YMAX - YMIN) * (Y0 - Y1);
  const path = (f) => { let d = ''; for (let i = 0; i <= 100; i += 1) d += (i ? 'L' : 'M') + sx(i).toFixed(1) + ',' + sy(f(i)).toFixed(1); return d; };
  function render() {
    const R = TEMP[tc][1], P = gross(I, co2, tc), N = P - R, Ic = comp(co2, tc), Is = sat(co2, tc);
    let h = `<line x1="${X0}" x2="${X1}" y1="${sy(0)}" y2="${sy(0)}" stroke="var(--ink-2)"/><line x1="${X0}" x2="${X0}" y1="${Y0}" y2="${Y1 - 4}" stroke="var(--ink-2)"/>`;
    h += `<rect x="${X0}" y="${sy(0)}" width="${X1 - X0}" height="${Y0 - sy(0)}" fill="var(--red)" opacity=".06"/>`;
    [-5, 0, 5, 10, 15, 20].filter((v) => Math.abs(v + TEMP[tc][1]) > 1.6).forEach((v) => { h += `<text x="${X0 - 4}" y="${sy(v) + 4}" font-size="11.5" text-anchor="end" fill="var(--mute)">${v}</text>`; });
    [0, 25, 50, 75, 100].forEach((v) => { h += `<text x="${sx(v)}" y="${Y0 + 14}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">${v}</text>`; });
    h += `<text x="${X1}" y="${Y0 + 30}" font-size="12.5" text-anchor="end" fill="var(--ink)">光照強度（相對值）</text>`;
    h += `<text x="12" y="${(Y0 + Y1) / 2}" font-size="12.5" text-anchor="middle" fill="var(--ink)" transform="rotate(-90 12 ${(Y0 + Y1) / 2})">O₂ 淨釋放速率（相對值）</text>`;
    h += `<text x="${X1 - 4}" y="${sy(-4)}" font-size="11.5" text-anchor="end" fill="var(--red)">淨釋放為負：植物淨吸收 O₂</text>`;
    if (others) for (const c in CO2) for (const t in TEMP) if (!(c === co2 && +t === tc)) {
      const sameT = +t === tc, sameC = c === co2;
      if (!sameT && !sameC) continue;
      h += `<path d="${path((i) => gross(i, c, t) - TEMP[t][1])}" fill="none" stroke="${sameT ? 'var(--c-P)' : 'var(--c-C)'}" stroke-width="1.4" opacity=".55" stroke-dasharray="5 4"/>`;
    }
    h += `<path d="${path((i) => gross(i, co2, tc))}" fill="none" stroke="var(--green)" stroke-width="1.6" stroke-dasharray="2 3"/>`;
    const lg = [['var(--teal)', '', '淨光合速率（目前條件）'], ['var(--green)', '2 3', '總光合速率＝淨＋呼吸']];
    if (others) lg.push(['var(--c-P)', '5 4', `淨：CO₂ ${co2 === 'low' ? '0.1%' : '0.03%'}、${tc} °C`], ['var(--c-C)', '5 4', `淨：其他溫度、同 CO₂`]);
    lg.forEach(([c, da, t], k) => { const y = Y1 + 4 + k * 15; h += `<line x1="${X0 + 8}" x2="${X0 + 30}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="2.4" stroke-dasharray="${da}"/><text x="${X0 + 35}" y="${y + 4}" font-size="11" fill="var(--ink-2)">${t}</text>`; });
    h += `<path d="${path((i) => gross(i, co2, tc) - R)}" fill="none" stroke="var(--teal)" stroke-width="3.2"/>`;
    h += `<circle cx="${sx(Ic)}" cy="${sy(0)}" r="4.5" fill="var(--card)" stroke="var(--ink)" stroke-width="1.6"/><text x="${sx(Ic) + 4}" y="${sy(0) + 15}" font-size="11.5" fill="var(--ink)">光補償點</text>`;
    if (Is <= 100) h += `<line x1="${sx(Is)}" x2="${sx(Is)}" y1="${sy(pmax(co2, tc) - R) - 8}" y2="${sy(pmax(co2, tc) - R) + 8}" stroke="var(--ink)" stroke-width="1.6"/><text x="${sx(Is)}" y="${sy(pmax(co2, tc) - R) + 20}" font-size="11.5" text-anchor="middle" fill="var(--ink)">光飽和點</text>`;
    h += `<line x1="${sx(I)}" x2="${sx(I)}" y1="${sy(P)}" y2="${sy(N)}" stroke="var(--green)" stroke-width="2.5"/><circle cx="${sx(I)}" cy="${sy(P)}" r="3.5" fill="var(--green)"/><text x="${sx(I) + 5}" y="${sy((P + N) / 2) + 4}" font-size="11" fill="var(--green)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">呼吸 R＝${R}</text><circle cx="${sx(I)}" cy="${sy(N)}" r="6" fill="var(--red)" stroke="var(--card)" stroke-width="2"/>`;
    h += `<line x1="${X0}" x2="${X0 + 10}" y1="${sy(-R)}" y2="${sy(-R)}" stroke="var(--red)" stroke-width="2"/><text x="${X0 - 4}" y="${sy(-R) + 4}" font-size="10.5" text-anchor="end" fill="var(--red)" font-weight="700">−R</text>`;
    svg.innerHTML = h;
    q('output').textContent = I;
    q('[data-f="g"]').textContent = P.toFixed(1);
    q('[data-f="r"]').textContent = R.toFixed(1);
    q('[data-f="n"]').textContent = `${P.toFixed(1)} − ${R.toFixed(1)} = ${N.toFixed(1)}`;
    q('[data-f="c"]').textContent = `${Ic.toFixed(1)}／${Is <= 100 ? Is.toFixed(0) : '＞100'}`;
    const lim = I < Is * 0.6 ? '光照強度' : co2 === 'low' ? (tc === 15 ? 'CO₂ 濃度與溫度' : 'CO₂ 濃度') : tc === 15 ? '溫度（酵素）' : 'CO₂ 濃度或溫度';
    q('[data-f="l"]').textContent = lim;
    q('[data-note]').textContent = Math.abs(N) < 0.15 ? '在光補償點，光合作用產生的 O₂ 恰等於呼吸消耗的 O₂，淨氣體交換為零。'
      : N < 0 ? '光照低於補償點：仍有光合作用，但總光合速率小於呼吸速率，淨光合速率為負，有機物淨減少。'
      : lim === '光照強度' ? '光弱時速率受光照限制：各條件的曲線在弱光處幾乎重疊，提高 CO₂ 或溫度幫助不大。'
      : `已接近光飽和，再增加光照速率不再上升；此時限制因子變為${lim}，${co2 === 'low' ? '提高 CO₂ 可使曲線上移' : '曲線高度由碳反應的酵素速率決定'}。`;
    el.querySelectorAll('[data-co2]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.co2 === co2));
    el.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.t === tc));
  }
  rng.addEventListener('input', () => { I = +rng.value; render(); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.co2) co2 = b.dataset.co2;
    if (b.dataset.t) tc = +b.dataset.t;
    if (b.hasAttribute('data-oth')) { others = !others; b.setAttribute('aria-pressed', others); }
    render();
  });
  render();
};

/* plates */
(window.SIMS = window.SIMS || {}).plates = function (el, opt) {
  const uid = 'p' + Math.random().toString(36).slice(2, 8);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MODES = {
    ridge: { b: '張裂', t: '張裂型邊界：中洋脊', f: [['相對運動', '互相遠離（張力）'], ['岩石圈', '生成（新海洋地殼）'], ['地形', '中洋脊、裂谷'], ['地震', '淺源'], ['火山', '有：減壓熔融，玄武岩質'], ['實例', '大西洋中洋脊、冰島、東太平洋洋隆；陸上：東非裂谷、紅海']],
      n: '地函物質上升、減壓熔融產生玄武岩質岩漿，在洋脊生成新的海洋地殼，再向兩側推開：離洋脊愈遠，岩石愈老、岩石圈愈厚。' },
    oc: { b: '聚合：洋–陸', t: '聚合型：海洋板塊隱沒到大陸板塊下', f: [['相對運動', '互相靠近（擠壓）'], ['岩石圈', '消滅（海洋板塊隱沒）'], ['地形', '海溝、陸緣山脈'], ['地震', '淺、中、深源皆有，向上覆板塊一側變深'], ['火山', '陸緣火山弧，多安山岩質'], ['實例', '安地斯山脈、北美西北部']],
      n: '密度大的海洋岩石圈隱沒；隱沒板塊約 100 km 深處釋出水分，使上方地函楔熔點降低而部分熔融，所以火山弧在上覆板塊上、與海溝平行。', tw: '臺灣周邊沒有典型的洋–陸隱沒：東北外海與南部外海是兩個方向相反的洋–洋隱沒帶，中間的臺灣本島是弧陸碰撞帶（見另兩個選項）。' },
    oo: { b: '聚合：洋–洋', t: '聚合型：海洋板塊隱沒到海洋板塊下', f: [['相對運動', '互相靠近（擠壓）'], ['岩石圈', '消滅（較老、較冷者隱沒）'], ['地形', '海溝、島弧、弧後盆地'], ['地震', '淺、中、深源皆有'], ['火山', '島弧火山'], ['實例', '馬里亞納、日本、琉球、呂宋島弧']],
      n: '兩個海洋板塊相遇時，較老、較冷（密度較大）者隱沒。由海向陸依序為：海溝 → 島弧 → 弧後盆地；震源沿隱沒板塊由淺而深。', tw: '東北外海：菲律賓海板塊沿琉球海溝向北隱沒到歐亞板塊下（琉球島弧、沖繩海槽、龜山島）；南部外海：南海（歐亞板塊）沿馬尼拉海溝向東隱沒到菲律賓海板塊下（呂宋島弧：綠島、蘭嶼）。' },
    cc: { b: '聚合：陸–陸', t: '聚合型：大陸與大陸碰撞', f: [['相對運動', '互相靠近（擠壓）'], ['岩石圈', '增厚（都不易隱沒）'], ['地形', '褶皺山脈、高原，地殼厚可達 60–70 km'], ['地震', '以淺源為主，分布範圍寬'], ['火山', '無大型火山弧'], ['實例', '喜馬拉雅山、阿爾卑斯山']],
      n: '大陸岩石圈密度小、浮力大，原先的洋底隱沒殆盡後兩陸相撞，地殼擠壓增厚形成高山與山根；沒有沿傾斜帶延伸到數百公里深的地震。', tw: '臺灣本島是呂宋島弧與歐亞大陸邊緣的「弧陸碰撞」（蓬萊造山運動）：海岸山脈是已上陸的島弧，花東縱谷為縫合帶，西部麓山帶褶皺與逆斷層發達。菲律賓海板塊每年約 7–8 cm 向西北擠壓。' },
    tf: { b: '錯動', t: '錯動型邊界：轉形斷層（俯視）', f: [['相對運動', '沿邊界水平錯開（剪力）'], ['岩石圈', '不生成也不消滅'], ['地形', '轉形斷層、線狀谷地'], ['地震', '淺源'], ['火山', '一般無'], ['實例', '中洋脊間的轉形斷層、聖安地列斯斷層']],
      n: '只有兩段洋脊之間的斷層段兩側反向運動，是板塊邊界（地震集中）；洋脊外側的斷裂帶兩側同向移動，不是邊界。' },
  };
  const keys = Object.keys(MODES);
  const st = { mode: keys.includes(opt && opt.mode) ? opt.mode : 'ridge', ph: 0, play: !reduce };
  el.innerHTML = `<div class="sim-head"><b>三類板塊邊界</b><span>選擇邊界類型，看板塊怎麼動、形成哪些地形，以及地震與火山出現在哪裡。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 252" role="img" aria-label="板塊邊界剖面"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="m">${keys.map((k) => `<button type="button" data-v="${k}">${MODES[k].b}</button>`).join('')}</div>
    <div class="ops"><button type="button" data-p></button></div>
    <div class="facts"></div>
    <p class="sim-note"></p>
    <p data-tw style="margin:0;font-size:.86rem;color:var(--ink-2);border-left:3px solid var(--c-E);padding:2px 0 2px 10px"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note'), tw = el.querySelector('[data-tw]'), pb = el.querySelector('[data-p]');
  const SEA = 60, Y = (km) => 80 + km * 0.42, P = (a) => a.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
  const txt = (x, y, s, o = '') => `<text x="${x}" y="${y}" font-size="14" fill="var(--ink)" stroke="var(--card)" stroke-width="3" paint-order="stroke" ${o}>${s}</text>`;
  const arrow = (x1, y1, x2, y2, c = 'var(--ink)') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="3" marker-end="url(#${uid}${c === 'var(--ink)' ? 'a' : 'c'})"/>`;
  const XT = 170, Y0 = 80, TH = 30;
  const slab = (() => { const a = []; let x = XT, y = Y0; for (let s = -(XT - 30); s < 400; s += 2) { const g = s <= 0 ? 0 : 50 * Math.PI / 180 * Math.min(1, s / 80); if (s <= 0) x = XT + s; else { x += 2 * Math.cos(g); y += 2 * Math.sin(g); } a.push([x, y, g]); if (y > 252) break; } return a; })();
  const bot = (p) => [p[0] - TH * Math.sin(p[2]), p[1] + TH * Math.cos(p[2])];
  const iV = slab.findIndex((p) => p[1] >= Y(100)), XV = slab[iV][0];
  const QS = [8, 22, 40, 60, 80, 100, 125, 150, 180, 210, 240, 268].map((k) => (k + XT - 30) / 2);
  let stat = '', top = '';
  function build() {
    const m = st.mode;
    stat = `<defs>${[['a', 'var(--ink)'], ['c', 'var(--c-C)']].map(([k, c]) => `<marker id="${uid}${k}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('')}</defs>`;
    top = '';
    if (m === 'tf') {
      stat += `<rect x="30" y="8" width="390" height="236" fill="var(--c-P)" fill-opacity=".18"/>`;
      stat += `<line x1="30" y1="126" x2="150" y2="126" stroke="var(--mute)" stroke-width="2" stroke-dasharray="6 5"/><line x1="300" y1="126" x2="420" y2="126" stroke="var(--mute)" stroke-width="2" stroke-dasharray="6 5"/>`;
      stat += `<line x1="150" y1="126" x2="300" y2="126" stroke="var(--ink)" stroke-width="3.5"/>`;
      top += `<line x1="150" y1="8" x2="150" y2="126" stroke="var(--red)" stroke-width="5"/><line x1="300" y1="126" x2="300" y2="244" stroke="var(--red)" stroke-width="5"/>`;
      top += arrow(110, 40, 70, 40) + arrow(190, 40, 230, 40) + arrow(260, 212, 220, 212) + arrow(340, 212, 380, 212);
      top += arrow(180, 108, 230, 108, 'var(--c-C)') + arrow(270, 144, 220, 144, 'var(--c-C)');
      top += txt(156, 22, '洋脊') + txt(306, 238, '洋脊') + txt(170, 96, '轉形斷層（板塊邊界）') + txt(36, 118, '斷裂帶（非邊界）', 'font-size="12"') + txt(312, 118, '斷裂帶（非邊界）', 'font-size="12"');
      top += txt(306, 160, '兩側同向') + txt(40, 160, '兩側同向');
      return;
    }
    stat += `<rect x="30" y="${SEA}" width="390" height="192" fill="var(--c-C)" fill-opacity=".14"/>`;
    for (let k = 0; k <= 400; k += 100) stat += `<line x1="24" y1="${Y(k)}" x2="30" y2="${Y(k)}" stroke="var(--ink-2)"/><text x="22" y="${Y(k) + 4}" font-size="11" text-anchor="end" fill="var(--ink-2)">${k}</text>`;
    stat += `<line x1="30" y1="${Y(0)}" x2="30" y2="252" stroke="var(--ink-2)"/><text x="2" y="${SEA - 8}" font-size="10" fill="var(--ink-2)">深度 km</text>`;
    stat += `<rect x="30" y="${SEA}" width="390" height="50" fill="var(--c-P)" fill-opacity=".22"/><line x1="30" y1="${SEA}" x2="420" y2="${SEA}" stroke="var(--c-P)"/>`;
    top += txt(36, 240, '軟流圈', 'fill="var(--c-C)"');
    if (m === 'ridge') {
      const t = (x) => 82 - 12 * Math.exp(-(((x - 225) / 45) ** 2)), th = (x) => 6 + 26 * Math.min(1, Math.abs(x - 225) / 160);
      stat += `<path d="M205 252 L215 ${Y(30)} L222 72 L228 72 L235 ${Y(30)} L245 252Z" fill="var(--red)" fill-opacity=".35"/>`;
      [[30, 221], [229, 420]].forEach(([a, b]) => { const tp = [], bt = []; for (let x = a; x <= b; x += 4) { tp.push([x, t(x)]); bt.push([x, t(x) + th(x)]); } stat += `<path d="M${P(tp)}L${P(bt.reverse())}Z" fill="var(--c-P)" fill-opacity=".7"/>`; });
      top += arrow(120, 52, 70, 52) + arrow(330, 52, 380, 52) + txt(203, 40, '中洋脊（裂谷）') + txt(250, 160, '岩漿上升（減壓熔融）', 'fill="var(--red)"') + txt(60, 104, '海洋岩石圈');
    } else if (m === 'oc' || m === 'oo') {
      const tip = slab.findIndex((p) => p[0] >= XT + 14), yb = 118, ib = slab.findIndex((p) => p[1] >= yb);
      const wedge = slab.slice(tip, ib + 1).map((p) => [p[0], p[1]]);
      let surf = m === 'oc' ? [[420, 52], [XT + 62, 52], [XT + 30, 66]] : [[420, 78], [XV + 100, 78], [XV + 80, 86], [XV + 50, 86], [XV + 30, 78], [XT + 40, 76]];
      stat += `<path d="M${P(slab.map((p) => [p[0], p[1]]))}L${P(slab.map(bot).reverse())}Z" fill="var(--c-P)" fill-opacity=".75"/>`;
      stat += `<path d="M${P(wedge)}L${P([[420, yb]].concat(surf))}Z" fill="${m === 'oc' ? 'var(--c-E)' : 'var(--c-P)'}" fill-opacity="${m === 'oc' ? '.6' : '.45'}"/>`;
      stat += `<ellipse cx="${XV + 2}" cy="${Y(100) - 4}" rx="12" ry="7" fill="var(--red)" fill-opacity=".55"/><line x1="${XV}" y1="${Y(100) - 6}" x2="${XV}" y2="${m === 'oc' ? 30 : 44}" stroke="var(--red)" stroke-width="3" stroke-opacity=".6"/>`;
      stat += `<path d="M${XV - 24} ${m === 'oc' ? 53 : 80} L${XV - 4} ${m === 'oc' ? 26 : 40} L${XV + 4} ${m === 'oc' ? 26 : 40} L${XV + 24} ${m === 'oc' ? 53 : 80}Z" fill="var(--c-E)" fill-opacity=".9"/>`;
      top += arrow(60, 72, 110, 72) + `<line x1="${XT + 4}" y1="44" x2="${XT + 4}" y2="80" stroke="var(--ink)"/>` + txt(XT - 12, 40, '海溝');
      top += txt(XV - 30, 18, m === 'oc' ? '陸緣火山弧' : '島弧') + txt(XV + 10, Y(100) + 26, '地函楔熔融', 'fill="var(--red)" font-size="12"');
      top += txt(36, 101, m === 'oc' ? '海洋板塊（隱沒）' : '較老的海洋板塊（隱沒）', 'font-size="12"') + (m === 'oc' ? txt(330, 90, '大陸板塊') : txt(XV + 40, 72, '弧後盆地', 'font-size="12"'));
    } else {
      const tp = [[30, 52], [150, 52], [190, 36], [215, 18], [235, 18], [262, 36], [300, 52], [420, 52]], bt = [[420, 118], [300, 118], [262, 148], [225, 168], [190, 148], [150, 118], [30, 118]];
      stat += `<path d="M${P(tp)}L${P(bt)}Z" fill="var(--c-E)" fill-opacity=".6"/>`;
      for (let k = 0; k < 3; k++) stat += `<path d="M160 ${70 + k * 10} Q180 ${52 + k * 10} 200 ${70 + k * 10} T240 ${70 + k * 10} T280 ${70 + k * 10}" fill="none" stroke="var(--c-E)" stroke-width="1.5"/>`;
      stat += `<line x1="225" y1="18" x2="225" y2="168" stroke="var(--ink)" stroke-dasharray="4 3"/>`;
      stat += `<path d="M218 178 L240 176 L268 244 L246 248Z" fill="var(--c-P)" fill-opacity=".5"/>`;
      top += arrow(60, 40, 110, 40) + arrow(390, 40, 340, 40) + txt(170, 12, '褶皺山脈') + txt(236, 164, '山根（地殼增厚）', 'font-size="12"') + txt(276, 236, '斷離的舊海洋板塊', 'font-size="12"') + txt(40, 108, '大陸岩石圈') + txt(330, 108, '大陸岩石圈');
    }
    top += `<g font-size="12">${[['var(--red)', '淺源 < 70 km'], ['var(--c-C)', '中源'], ['var(--c-X)', '深源 > 300 km']].map((q, i) => `<circle cx="40" cy="${150 + i * 15}" r="4" fill="${q[0]}"/><text x="48" y="${154 + i * 15}" fill="var(--ink-2)">${q[1]}</text>`).join('')}</g>`;
  }
  const qcol = (y) => { const d = (y - 80) / 0.42; return d < 70 ? 'var(--red)' : d < 300 ? 'var(--c-C)' : 'var(--c-X)'; };
  function dyn() {
    const m = st.mode, ph = st.ph;
    let s = '', q = [];
    if (m === 'ridge') {
      for (let k = 0; k < 12; k++) { const d = (ph + k * 16) % 192; s += `<line x1="${225 - d - 4}" y1="${74 + d * 0.05}" x2="${225 - d - 4}" y2="${84 + d * 0.15}" stroke="var(--card)" stroke-width="2" opacity=".7"/><line x1="${225 + d + 4}" y1="${74 + d * 0.05}" x2="${225 + d + 4}" y2="${84 + d * 0.15}" stroke="var(--card)" stroke-width="2" opacity=".7"/>`; }
      for (let k = 0; k < 4; k++) { const y = 252 - ((ph * 1.6 + k * 45) % 180); s += `<circle cx="${225 + Math.sin(k + y / 20) * 4}" cy="${y}" r="4" fill="var(--red)"/>`; }
      q = [[218, 76], [232, 79], [224, 84], [210, 80], [240, 82]];
    } else if (m === 'oc' || m === 'oo') {
      for (let k = 0; k * 20 < slab.length * 2; k++) { const i = Math.floor(((ph + k * 20) % (slab.length * 2)) / 2); if (i >= slab.length) continue; const a = slab[i], b = bot(a); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--card)" stroke-width="2" opacity=".6"/>`; }
      for (let k = 0; k < 3; k++) { const y = Y(100) - 6 - ((ph * 1.2 + k * 25) % 75); if (y > (m === 'oc' ? 30 : 44)) s += `<circle cx="${XV}" cy="${y}" r="3.5" fill="var(--red)"/>`; }
      q = QS.map((i) => { const p = slab[Math.min(Math.round(i), slab.length - 1)]; return [p[0] - 5 * Math.sin(p[2]), p[1] + 5 * Math.cos(p[2])]; }).concat([[XT + 30, 70], [XT + 50, 82]]);
    } else if (m === 'cc') {
      for (let k = 0; k < 9; k++) { const d = (ph + k * 16) % 140; s += `<line x1="${30 + d}" y1="56" x2="${30 + d}" y2="114" stroke="var(--card)" stroke-width="2" opacity=".55"/><line x1="${420 - d}" y1="56" x2="${420 - d}" y2="114" stroke="var(--card)" stroke-width="2" opacity=".55"/>`; }
      q = [[160, 70], [185, 86], [200, 62], [215, 100], [240, 74], [255, 106], [275, 66], [300, 90], [140, 96], [320, 72]];
    } else {
      for (let k = 0; k < 10; k++) { const d = (ph * 0.8 + k * 15) % 150; [[150, 8, 126], [300, 126, 244]].forEach(([x, y1, y2]) => [x - d, x + d].forEach((xx) => { if (xx > 31 && xx < 419) s += `<line x1="${xx}" y1="${y1}" x2="${xx}" y2="${y2}" stroke="var(--c-P)" stroke-opacity=".3" stroke-width="2"/>`; })); }
      q = [[170, 126], [195, 124], [222, 128], [250, 125], [280, 127], [150, 60], [300, 190]];
    }
    q.forEach((p, i) => { const o = st.play ? 0.45 + 0.55 * Math.abs(Math.sin(ph / 9 + i * 1.7)) : 1; s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${m === 'tf' ? 'var(--red)' : qcol(p[1])}" stroke="var(--card)" opacity="${o.toFixed(2)}"/>`; });
    svg.innerHTML = stat + s + top + `<text x="416" y="248" text-anchor="end" font-size="10" fill="var(--mute)">示意圖，未依比例</text>`;
  }
  function sync() {
    build(); const M = MODES[st.mode];
    el.querySelectorAll('[data-g=m] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === st.mode));
    facts.innerHTML = `<div class="fact" style="grid-column:1/-1"><span>邊界類型</span><b>${M.t}</b></div>` + [0, 1, 2, 4, 3, 5].map((i) => `<div class="fact"${i === 5 || i === 3 ? ' style="grid-column:1/-1"' : ''}><span>${M.f[i][0]}</span><b>${M.f[i][1]}</b></div>`).join('');
    note.textContent = M.n; tw.style.display = M.tw ? '' : 'none'; tw.innerHTML = M.tw ? '<b>臺灣：</b>' + M.tw : '';
    pb.textContent = st.play ? '❚❚ 暫停' : '▶ 播放'; pb.setAttribute('aria-pressed', st.play);
    dyn();
  }
  let run = 0;
  function start() {
    const id = ++run; let last = 0;
    const tick = (ts) => {
      if (!el.isConnected || !st.play || id !== run) return;
      if (last) st.ph += Math.min(ts - last, 100) * 0.012;
      last = ts; dyn(); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v) st.mode = b.dataset.v;
    if (b.hasAttribute('data-p')) { st.play = !st.play; if (st.play) start(); }
    sync();
  });
  sync();
  if (st.play) start();
};

/* ptrend */
(window.SIMS = window.SIMS || {}).ptrend = function (el, opt) {
  const SYM = ['', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca'];
  const NAME = ['', '氫', '氦', '鋰', '鈹', '硼', '碳', '氮', '氧', '氟', '氖', '鈉', '鎂', '鋁', '矽', '磷', '硫', '氯', '氬', '鉀', '鈣'];
  const PER = (z) => (z <= 2 ? 1 : z <= 10 ? 2 : z <= 18 ? 3 : 4);
  const GRP = [0, 1, 18, 1, 2, 13, 14, 15, 16, 17, 18, 1, 2, 13, 14, 15, 16, 17, 18, 1, 2];
  const MODES = {
    r: { t: '原子半徑', u: 'pm', max: 220, step: 50, d: 0, lab: '共價半徑（pm）',
      v: [null, 31, null, 128, 96, 84, 76, 71, 66, 57, null, 166, 141, 121, 111, 107, 105, 102, null, 203, 176],
      note: '同週期由左而右，核電荷增加、殼層數不變，半徑漸小；同族由上而下多一層，半徑漸大。惰性氣體以凡得瓦半徑表示，不列入比較。' },
    ie: { t: '第一游離能', u: 'kJ/mol', max: 2500, step: 500, d: 0, lab: '第一游離能（kJ/mol）',
      v: [null, 1312, 2372, 520, 900, 801, 1086, 1402, 1314, 1681, 2081, 496, 738, 578, 787, 1012, 1000, 1251, 1521, 419, 590],
      note: '同週期由左而右大致增加，惰性氣體最大、鹼金屬最小；同族由上而下減小。例外：Be＞B、Mg＞Al，N＞O、P＞S（2、15 族比右邊鄰居高）。' },
    en: { t: '電負度', u: '', max: 4.4, step: 1, d: 2, lab: '鮑林電負度（無單位）',
      v: [null, 2.20, null, 0.98, 1.57, 2.04, 2.55, 3.04, 3.44, 3.98, null, 0.93, 1.31, 1.61, 1.90, 2.19, 2.58, 3.16, null, 0.82, 1.00],
      note: '同週期由左而右增大，同族由上而下減小；F 最大（3.98）。惰性氣體一般不列電負度。右上大、左下小。' },
  };
  const st = { m: MODES[opt.mode] ? opt.mode : 'r', z: 11 };
  el.innerHTML = `<div class="sim-head"><b>原子序與週期性趨勢</b><span>切換性質，點（或觸碰）圖上的點讀取元素與數值；比較同週期與同族的變化。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 290" role="img" aria-label="週期性趨勢圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops">${Object.keys(MODES).map((k) => `<button type="button" data-m="${k}">${MODES[k].t}</button>`).join('')}</div>
    <label class="sl"><span>原子序</span><input type="range" min="1" max="20" step="1" value="${st.z}"><output></output></label>
    <div class="facts">
      <div class="fact"><span>選取元素</span><b data-f="el"></b></div>
      <div class="fact"><span data-f="vl"></span><b data-f="v"></b></div>
      <div class="fact"><span>同週期右鄰</span><b data-f="right"></b></div>
      <div class="fact"><span>同族上方／下方</span><b data-f="down"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), rng = el.querySelector('input');
  const f = (k) => el.querySelector(`[data-f="${k}"]`);
  const L = 46, R = 410, T = 24, B = 246;
  const x = (z) => L + ((z - 0.5) / 20) * (R - L);
  const fmt = (v) => (v == null ? '—' : v.toFixed(MODES[st.m].d) + (MODES[st.m].u ? ' ' + MODES[st.m].u : ''));
  const show = (z) => (z && z <= 20 ? `${SYM[z]} ${fmt(MODES[st.m].v[z])}` : '—');
  function draw() {
    const M = MODES[st.m], y = (v) => B - (v / M.max) * (B - T);
    let s = '';
    const bands = [[1, 2], [3, 10], [11, 18], [19, 20]];
    bands.forEach(([a, b], i) => {
      s += `<rect x="${x(a) - (x(2) - x(1)) / 2}" y="${T}" width="${x(b) - x(a) + (x(2) - x(1))}" height="${B - T}" fill="${i % 2 ? 'var(--teal-soft)' : 'var(--card)'}"/>`;
      s += `<text x="${(x(a) + x(b)) / 2}" y="${T - 8}" font-size="11" text-anchor="middle" fill="var(--ink-2)">第 ${i + 1} 週期</text>`;
    });
    for (let v = 0; v <= M.max + 1e-9; v += M.step) s += `<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 4}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="var(--mute)">${v}</text>`;
    s += `<text x="12" y="${(T + B) / 2}" font-size="11" fill="var(--ink-2)" text-anchor="middle" transform="rotate(-90 12 ${(T + B) / 2})">${M.lab}</text>`;
    // lines within periods, broken where no data
    bands.forEach(([a, b]) => {
      let d = '';
      for (let z = a; z <= b; z++) { const v = M.v[z]; if (v == null) { d += ' '; continue; } d += (d.endsWith(' ') || d === '' ? 'M' : 'L') + x(z).toFixed(1) + ' ' + y(v).toFixed(1); }
      s += `<path d="${d.trim()}" fill="none" stroke="var(--teal)" stroke-width="2"/>`;
    });
    for (let z = 1; z <= 20; z++) {
      const v = M.v[z], g = GRP[z], col = g === 18 ? 'var(--red)' : g === 1 && z > 1 ? 'var(--green)' : 'var(--teal)';
      s += `<text x="${x(z)}" y="${B + 14}" font-size="11" text-anchor="middle" fill="${z === st.z ? 'var(--ink)' : 'var(--mute)'}" font-weight="${z === st.z ? 700 : 400}">${SYM[z]}</text>`;
      s += `<text x="${x(z)}" y="${B + 26}" font-size="9" text-anchor="middle" fill="var(--mute)">${z}</text>`;
      if (v == null) continue;
      const on = z === st.z;
      s += `<circle cx="${x(z)}" cy="${y(v)}" r="${on ? 6.5 : 4}" fill="${col}" stroke="${on ? 'var(--ink)' : 'var(--card)'}" stroke-width="${on ? 2 : 1}"/>`;
    }
    const v0 = M.v[st.z];
    if (v0 != null) {
      const tx = Math.min(Math.max(x(st.z), L + 50), R - 50), ty = Math.max(y(v0) - 14, T + 12);
      s += `<g pointer-events="none"><rect x="${tx - 48}" y="${ty - 13}" width="96" height="18" rx="4" fill="var(--ink)" opacity=".85"/><text x="${tx}" y="${ty}" font-size="11" text-anchor="middle" fill="#fff">${SYM[st.z]}：${fmt(v0)}</text></g>`;
    } else s += `<text x="${x(st.z)}" y="${B - 8}" font-size="10" text-anchor="middle" fill="var(--red)">不列</text>`;
    for (let z = 1; z <= 20; z++) s += `<rect data-z="${z}" x="${x(z) - (x(2) - x(1)) / 2}" y="${T}" width="${x(2) - x(1)}" height="${B - T + 28}" fill="transparent" style="cursor:pointer"/>`;
    s += `<text x="${R}" y="${B + 40}" font-size="10" text-anchor="end" fill="var(--mute)"><tspan fill="var(--green)">●</tspan> 鹼金屬　<tspan fill="var(--red)">●</tspan> 惰性氣體　原子序 Z →</text>`;
    svg.innerHTML = s;
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.m)));
    rng.value = st.z; rng.nextElementSibling.textContent = SYM[st.z];
    const z = st.z, p = PER(z), g = GRP[z];
    let right = null; for (let k = z + 1; k <= 20 && PER(k) === p; k++) { right = k; break; }
    let down = null, up = null; for (let k = z + 1; k <= 20; k++) if (GRP[k] === g) { down = k; break; }
    for (let k = z - 1; k >= 1; k--) if (GRP[k] === g) { up = k; break; }
    f('el').textContent = `${SYM[z]} ${NAME[z]}（第 ${p} 週期，第 ${g} 族）`;
    f('vl').textContent = M.t;
    f('v').textContent = v0 == null ? (st.m === 'r' ? '惰性氣體不比較' : '不列') : fmt(v0);
    f('right').textContent = show(right);
    f('down').textContent = `↑ ${show(up)}　↓ ${show(down)}`;
    f('note').textContent = M.note;
  }
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; draw(); }));
  rng.addEventListener('input', () => { st.z = Number(rng.value); draw(); });
  const pick = (e) => { const t = e.target.closest('[data-z]'); if (t) { st.z = Number(t.dataset.z); draw(); } };
  svg.addEventListener('pointerdown', pick);
  svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e); });
  draw();
};

/* punnett */
(window.SIMS = window.SIMS || {}).punnett = function (el, opt) {
  const GENES = { R: ['種子形狀', '圓形', '皺形', '圓', '皺'], Y: ['子葉顏色', '黃色', '綠色', '黃', '綠'] };
  let mode = opt.mode === 'di' ? 'di' : 'mono', sim = null;
  const par = [{ R: 'Rr', Y: 'Yy' }, { R: 'Rr', Y: 'Yy' }];
  const sex = ['♀ 母本（卵）', '♂ 父本（精細胞）'];
  el.innerHTML = `<style>.sim[data-sim="punnett"] .pg{display:grid;gap:4px}.sim[data-sim="punnett"] .pg small{color:var(--mute);font-size:.8rem}
  .sim[data-sim="punnett"] .ops button{padding:3px 10px}.sim[data-sim="punnett"] table{border-collapse:collapse;width:100%;font-size:.86rem}
  .sim[data-sim="punnett"] td,.sim[data-sim="punnett"] th{border-bottom:1px solid var(--line);padding:3px 6px;text-align:right}.sim[data-sim="punnett"] td:first-child,.sim[data-sim="punnett"] th:first-child{text-align:left}
  .sim[data-sim="punnett"] td{font-family:var(--f-mono)}</style>
  <div class="sim-head"><b>棋盤方格與遺傳比例</b><span>選擇親代基因型，看配子組合、子代比例，再模擬 400 個子代比較觀察值與預期值。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 340 300" role="img" aria-label="棋盤方格"></svg></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-mode="mono">一對性狀（R/r）</button><button type="button" data-mode="di">兩對性狀（R/r、Y/y）</button></div>
    <div data-par></div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>子代基因型比例</span><b data-f="g"></b></div><div class="fact" style="grid-column:1/-1"><span>子代表現型比例</span><b data-f="p"></b></div></div>
    <div class="ops"><button type="button" data-sim>模擬 400 個子代</button></div>
    <div data-tab></div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg');
  const genes = () => (mode === 'mono' ? ['R'] : ['R', 'Y']);
  const gametes = (p) => genes().reduce((acc, g) => acc.flatMap((a) => [a + p[g][0], a + p[g][1]]), ['']);
  const norm = (a, b) => genes().map((g, k) => [a[k], b[k]].sort((x, y) => (x === g ? -1 : y === g ? 1 : 0)).join('')).join('');
  const phen = (gt) => genes().map((g, k) => (gt.slice(2 * k, 2 * k + 2).includes(g) ? 1 : 0));
  const phName = (ph, short) => ph.map((v, k) => GENES[genes()[k]][short ? (v ? 3 : 4) : (v ? 1 : 2)]).join(short ? '' : '');
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function stats() {
    const G1 = gametes(par[0]), G2 = gametes(par[1]), gt = {}, ph = {};
    G1.forEach((a) => G2.forEach((b) => { const g = norm(a, b), k = phen(g).join(''); gt[g] = (gt[g] || 0) + 1; ph[k] = (ph[k] || 0) + 1; }));
    return { G1, G2, gt, ph, n: G1.length * G2.length };
  }
  const order = (keys) => keys.sort((a, b) => { for (let k = 0; k < a.length; k++) { const s = (c) => (c === c.toUpperCase() ? 0 : 1); if (a[k] !== b[k]) return s(a[k]) - s(b[k]); } return 0; });
  const ratio = (ent, lab) => { const d = ent.reduce((g, e) => gcd(g, e[1]), 0); return ent.map(([k, v]) => `${v / d} ${lab(k)}`).join(' : '); };
  function pea(x, y, ph) {
    const col = mode === 'di' && !ph[1] ? 'var(--c-B)' : 'var(--sun)';
    if (ph[0]) return `<circle cx="${x}" cy="${y}" r="9" fill="${col}" stroke="var(--ink-2)" stroke-width="1"/>`;
    let d = ''; for (let k = 0; k <= 24; k++) { const t = k / 24 * 6.283, r = 8.5 + 1.6 * Math.cos(t * 7); d += (k ? 'L' : 'M') + (x + r * Math.cos(t)).toFixed(1) + ',' + (y + r * Math.sin(t)).toFixed(1); }
    return `<path d="${d}Z" fill="${col}" stroke="var(--ink-2)" stroke-width="1"/>`;
  }
  function drawSquare(S) {
    const n = S.G1.length, hd = 44, cs = (330 - hd) / n, ch = Math.min(cs, (292 - hd) / n);
    svg.setAttribute('viewBox', `0 0 340 ${hd + ch * n + 8}`);
    let h = `<text x="${hd + cs * n / 2 + 4}" y="12" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">${sex[1].slice(0, 4)}的配子</text>`;
    h += `<text x="10" y="${hd + ch * n / 2 + 4}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)" transform="rotate(-90 10 ${hd + ch * n / 2 + 4})">${sex[0].slice(0, 4)}的配子</text>`;
    S.G2.forEach((g, k) => { h += `<text x="${hd + cs * k + cs / 2 + 4}" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="var(--c-P)">${g}</text>`; });
    S.G1.forEach((g, r) => {
      h += `<text x="${hd - 6}" y="${hd + ch * r + ch / 2 + 5}" font-size="14" font-weight="700" text-anchor="end" fill="var(--red)">${g}</text>`;
      S.G2.forEach((b, k) => {
        const gt = norm(g, b), ph = phen(gt), x = hd + cs * k + 4, y = hd + ch * r;
        h += `<rect x="${x}" y="${y}" width="${cs}" height="${ch}" fill="var(--card)" stroke="var(--line)"/>`;
        h += pea(x + cs / 2, y + ch * 0.36, ph) + `<text x="${x + cs / 2}" y="${y + ch * 0.36 + (n > 2 ? 24 : 30)}" font-size="${n > 2 ? 12.5 : 15}" text-anchor="middle" fill="var(--ink)" font-family="var(--f-mono)">${gt}</text>`;
      });
    });
    svg.innerHTML = h;
  }
  function render() {
    const S = stats();
    drawSquare(S);
    const gtO = order(Object.keys(S.gt)).map((k) => [k, S.gt[k]]);
    const phK = Object.keys(S.ph).sort().reverse(), phO = phK.map((k) => [k, S.ph[k]]);
    q('[data-f="g"]').textContent = ratio(gtO, (k) => k);
    q('[data-f="p"]').textContent = ratio(phO, (k) => phName(k.split('').map(Number), mode === 'di'));
    q('[data-par]').innerHTML = par.map((p, i) => `<div class="pg"><small>${sex[i]}：${genes().map((g) => p[g]).join('')}（${phName(phen(genes().map((g) => p[g]).join('')), false)}）</small>${genes().map((g) => `<div class="ops">${[g + g, g + g.toLowerCase(), (g + g).toLowerCase()].map((v) => `<button type="button" data-p="${i}" data-g="${g}" data-v="${v}" aria-pressed="${p[g] === v}">${v}</button>`).join('')}</div>`).join('')}</div>`).join('');
    el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    let tab = '';
    if (sim) {
      tab = `<table><tr><th>表現型</th><th>預期</th><th>觀察</th></tr>${phK.map((k) => `<tr><td style="font-family:inherit">${phName(k.split('').map(Number), false)}</td><td>${(400 * S.ph[k] / S.n).toFixed(0)}</td><td>${sim[k] || 0}</td></tr>`).join('')}</table>`;
    }
    q('[data-tab]').innerHTML = tab;
    const het = mode === 'mono' ? par.every((p) => p.R === 'Rr') : par.every((p) => p.R === 'Rr' && p.Y === 'Yy');
    const test = par.some((p) => genes().every((g) => p[g] === g.toLowerCase().repeat(2)));
    q('[data-note]').textContent = sim ? '觀察值隨機偏離預期值，樣本愈大偏離比例愈小；孟德爾因此大量計數再化為比例。再按一次可重新抽樣。'
      : het ? (mode === 'mono' ? 'Rr 自交：配子 R、r 各 1/2，子代基因型 1：2：1、表現型 3：1（分離律）。' : 'RrYy 自交：每個親代產生 RY、Ry、rY、ry 四種等量配子，16 格得 9：3：3：1＝(3：1)×(3：1)（獨立分配律）。')
      : test ? '與隱性同型合子交配（試交）：子代表現型比例直接反映另一親代產生的配子種類與比例。'
      : '每一格的機率＝兩配子機率的乘積；同型合子只產生一種配子，方格中會出現重複的組合。';
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) { mode = b.dataset.mode; sim = null; }
    if (b.dataset.p) { par[+b.dataset.p][b.dataset.g] = b.dataset.v; sim = null; }
    if (b.hasAttribute('data-sim')) {
      const S = stats(); sim = {};
      for (let k = 0; k < 400; k++) { const a = S.G1[Math.floor(Math.random() * S.G1.length)], c = S.G2[Math.floor(Math.random() * S.G2.length)], p = phen(norm(a, c)).join(''); sim[p] = (sim[p] || 0) + 1; }
    }
    render();
  });
  render();
};

/* quake */
(window.SIMS = window.SIMS || {}).quake = function (el, opt) {
  const VP = 6.0, VS = 3.5, K = VP * VS / (VP - VS), U = 0.5; // U：每單位 km
  const ST = [['A', 70, 60, 'var(--c-P)'], ['B', 330, 80, 'var(--c-C)'], ['C', 215, 228, 'var(--c-B)']];
  const st = { mode: opt && opt.mode === 'hidden' ? 'hidden' : 'free', ex: 175, ey: 125, h: 0, circ: true, guess: null, shown: false };
  el.innerHTML = `<div class="sim-head"><b>三站定位震央</b><span>拖動（或點選）地圖上的震央，看各站的 S−P 時差與定位圓；或切換到「隱藏震央」自己定位。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 400 260" role="img" aria-label="測站地圖" style="cursor:crosshair"></svg><svg viewBox="0 0 400 122" role="img" aria-label="三站地震紀錄" style="margin-top:6px"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="mode"><button type="button" data-v="free">自選震央</button><button type="button" data-v="hidden">隱藏震央（練習）</button></div>
    <label class="sl"><span>震源深度</span><input type="range" min="0" max="40" step="1"><output></output></label>
    <div class="ops" data-g="act"><button type="button" data-a="circ">定位圓</button><button type="button" data-a="new">新地震</button><button type="button" data-a="show">揭曉震央</button></div>
    <div class="facts"></div>
    <p class="sim-note"></p>
  </div></div>`;
  const [map, rec] = el.querySelectorAll('svg'), rng = el.querySelector('input'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note');
  const data = () => ST.map(([n, x, y, c]) => {
    const r = Math.hypot(x - st.ex, y - st.ey) * U, D = Math.hypot(r, st.h), tp = D / VP, ts = D / VS;
    const dt = Math.round((ts - tp) * 10) / 10;
    return { n, x, y, c, tp, ts, dt, d: dt * K };
  });
  function draw() {
    const S = data(), hid = st.mode === 'hidden';
    let s = `<rect width="400" height="260" fill="var(--card)"/>`;
    for (let x = 0; x <= 400; x += 50) s += `<line x1="${x}" y1="0" x2="${x}" y2="260" stroke="var(--line)"/>`;
    for (let y = 0; y <= 260; y += 50) s += `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="var(--line)"/>`;
    s += `<line x1="290" y1="246" x2="390" y2="246" stroke="var(--ink)" stroke-width="2"/><text x="340" y="240" text-anchor="middle" font-size="13" fill="var(--ink)">50 km</text>`;
    if (st.circ) S.forEach((o) => { s += `<circle cx="${o.x}" cy="${o.y}" r="${o.d / U}" fill="${o.c}" fill-opacity=".06" stroke="${o.c}" stroke-width="2"/>`; });
    S.forEach((o) => { s += `<path d="M${o.x} ${o.y - 10} L${o.x + 9} ${o.y + 7} L${o.x - 9} ${o.y + 7}Z" fill="${o.c}" stroke="var(--card)" stroke-width="1.5"/><text x="${o.x + 12}" y="${o.y - 6}" font-size="16" font-weight="700" fill="${o.c}">${o.n}</text>`; });
    if (!hid || st.shown) s += `<text x="${st.ex}" y="${st.ey + 9}" text-anchor="middle" font-size="26" fill="var(--red)" stroke="var(--card)" stroke-width="1.5" paint-order="stroke">★</text><text x="${st.ex + 13}" y="${st.ey + 20}" font-size="13" fill="var(--red)">震央</text>`;
    if (hid && st.guess) s += `<circle cx="${st.guess[0]}" cy="${st.guess[1]}" r="7" fill="none" stroke="var(--c-X)" stroke-width="2.5"/><text x="${st.guess[0] + 10}" y="${st.guess[1] - 8}" font-size="13" fill="var(--c-X)">你的答案</text>`;
    map.innerHTML = s;
    const X = (t) => 50 + t * 5.6;
    let r = `<line x1="${X(0)}" y1="108" x2="${X(60)}" y2="108" stroke="var(--ink-2)"/>`;
    for (let t = 0; t <= 60; t += 10) r += `<line x1="${X(t)}" y1="104" x2="${X(t)}" y2="112" stroke="var(--ink-2)"/><text x="${X(t)}" y="120" font-size="11" text-anchor="middle" fill="var(--ink-2)">${t}</text>`;
    r += `<text x="4" y="120" font-size="11" fill="var(--ink-2)">秒</text>`;
    S.forEach((o, i) => {
      const y0 = 18 + i * 31; let p = `M${X(0)} ${y0}`;
      for (let t = 0; t <= 60; t += 0.2) { let a = 0; if (t > o.tp) a = 4 * Math.exp(-(t - o.tp) / 6); if (t > o.ts) a += 11 * Math.exp(-(t - o.ts) / 7); p += `L${X(t).toFixed(1)} ${(y0 + a * Math.sin(t * 9 + i)).toFixed(1)}`; }
      r += `<text x="4" y="${y0 + 5}" font-size="14" font-weight="700" fill="${o.c}">${o.n} 站</text><path d="${p}" fill="none" stroke="${o.c}" stroke-width="1.2"/>`;
      r += `<line x1="${X(o.tp)}" y1="${y0 - 12}" x2="${X(o.tp)}" y2="${y0 + 12}" stroke="var(--ink)" stroke-dasharray="2 2"/><text x="${X(o.tp) - 3}" y="${y0 - 5}" font-size="12" text-anchor="end" fill="var(--ink)">P</text>`;
      r += `<line x1="${X(o.ts)}" y1="${y0 - 12}" x2="${X(o.ts)}" y2="${y0 + 12}" stroke="var(--ink)" stroke-dasharray="2 2"/><text x="${X(o.ts) + 3}" y="${y0 - 5}" font-size="12" fill="var(--ink)">S</text>`;
    });
    rec.innerHTML = r;
    const fact = (k, v) => `<div class="fact" style="grid-column:1/-1"><span>${k}</span><b>${v}</b></div>`;
    let f = fact('係數 vP·vS/(vP − vS)', `6.0 × 3.5 ÷ (6.0 − 3.5) = ${K.toFixed(1)} km/s`);
    S.forEach((o) => { f += fact(`<strong style="color:${o.c}">${o.n} 站</strong>　S−P 時差 Δt = ${o.dt.toFixed(1)} s`, `d = ${o.dt.toFixed(1)} × ${K.toFixed(1)} ≈ ${o.d.toFixed(0)} km`); });
    if (hid && st.shown && st.guess) f += fact('你的答案與震央相差', `${(Math.hypot(st.guess[0] - st.ex, st.guess[1] - st.ey) * U).toFixed(0)} km`);
    facts.innerHTML = f;
    note.textContent = hid && !st.shown ? '讀三站的 S−P 時差 → 換算距離 → 以各站為圓心畫圓；在地圖上點出三圓交點，再按「揭曉震央」。'
      : st.h > 0 ? `震源深 ${st.h} km：S−P 求得的是「震源距離」，比震央距離長，三圓不交於一點而圍出小三角形，震央在其內。`
        : '單一測站只能得到距離、不知方向；兩圓交於兩點，要三站才能決定唯一的震央。S−P 時差愈大，震源愈遠。';
    rng.value = st.h; rng.nextElementSibling.textContent = `${st.h} km`;
    el.querySelectorAll('[data-g=mode] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === st.mode));
    el.querySelector('[data-a=circ]').setAttribute('aria-pressed', st.circ);
    el.querySelector('[data-a=new]').style.display = el.querySelector('[data-a=show]').style.display = hid ? '' : 'none';
  }
  function quake() { st.ex = 30 + Math.random() * 340; st.ey = 25 + Math.random() * 210; st.guess = null; st.shown = false; st.circ = false; }
  rng.addEventListener('input', () => { st.h = Number(rng.value); draw(); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v) { st.mode = b.dataset.v; if (st.mode === 'hidden') quake(); else st.circ = true; }
    if (b.dataset.a === 'circ') st.circ = !st.circ;
    if (b.dataset.a === 'new') quake();
    if (b.dataset.a === 'show') st.shown = true;
    draw();
  });
  const pt = (e) => { const r = map.getBoundingClientRect(); return [Math.max(0, Math.min(400, (e.clientX - r.left) * 400 / r.width)), Math.max(0, Math.min(260, (e.clientY - r.top) * 260 / r.height))]; };
  let down = false;
  const move = (e) => { const p = pt(e); if (st.mode === 'free') { st.ex = p[0]; st.ey = p[1]; } else st.guess = p; draw(); };
  map.addEventListener('pointerdown', (e) => { down = true; map.setPointerCapture(e.pointerId); move(e); });
  map.addEventListener('pointermove', (e) => { if (down) move(e); });
  map.addEventListener('pointerup', () => { down = false; });
  if (st.mode === 'hidden') quake();
  draw();
};

/* rate */
(window.SIMS = window.SIMS || {}).rate = function (el, opt) {
  const RG = 8.31e-3, T1 = 300; // kJ/(mol·K)
  const st = { exo: opt.mode !== 'endo', cat: false, Ea: 60, dH: 40, T2: 320 };
  const uid = 'r' + Math.random().toString(36).slice(2, 8);
  el.innerHTML = `<div class="sim-head"><b>活化能與有效碰撞</b><span>調整活化能、反應熱與溫度，切換催化劑，看能越過 Ea 的分子比例與反應速率如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 380" role="img" aria-label="位能圖與動能分布"></svg></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-m="exo">放熱反應</button><button type="button" data-m="endo">吸熱反應</button><button type="button" data-c="1">加入催化劑</button></div>
    <label class="sl"><span>Ea（正）</span><input type="range" data-k="Ea" min="20" max="120" step="1"><output></output></label>
    <label class="sl"><span>|ΔH|</span><input type="range" data-k="dH" min="5" max="80" step="1"><output></output></label>
    <label class="sl"><span>T₂</span><input type="range" data-k="T2" min="300" max="400" step="5"><output></output></label>
    <div class="facts">
      <div class="fact"><span>有效 Ea（正／逆）</span><b data-f="ea"></b></div><div class="fact"><span>ΔH = Ea(正) − Ea(逆)</span><b data-f="dh"></b></div>
      <div class="fact"><span>動能 ≥ Ea 的比例 ≈ e^(−Ea/RT)</span><b data-f="fr"></b></div><div class="fact"><span>相對速率（以 T₁、無催化劑為 1）</span><b data-f="k"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), f = (k) => el.querySelector(`[data-f="${k}"]`), sl = {};
  el.querySelectorAll('[data-k]').forEach((i) => { sl[i.dataset.k] = i; });
  const sci = (x) => { const e = Math.floor(Math.log10(x) + 1e-9); const m = x / 10 ** e; return e >= -2 && e < 3 ? String(Number(x.toPrecision(2))) : m.toFixed(1) + '×10' + String(e).split('').map((c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])).join(''); };
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  const effEa = () => { const top = st.exo ? 0 : st.dH; return st.cat ? Math.round(top + 0.5 * (st.Ea - top)) : st.Ea; };
  function energy() {
    const dH = st.exo ? -st.dH : st.dH, Ea = st.Ea, Ec = effEa();
    const lo = Math.min(0, dH) - 8, hi = Ea + 10, Y0 = 26, Y1 = 160, ey = (E) => Y1 - ((E - lo) / (hi - lo)) * (Y1 - Y0);
    const xa = 60, x1 = 110, xp = 220, x2 = 330, xb = 400;
    const path = (pk) => `M${xa} ${ey(0)} H${x1} C${x1 + 50} ${ey(0)} ${xp - 45} ${ey(pk)} ${xp} ${ey(pk)} C${xp + 45} ${ey(pk)} ${x2 - 50} ${ey(dH)} ${x2} ${ey(dH)} H${xb}`;
    let s = `<text x="10" y="16" font-size="12" font-weight="700" fill="var(--teal)">位能圖</text>`;
    s += `<line x1="${xa - 6}" x2="${xa - 6}" y1="${Y0 - 8}" y2="${Y1 + 6}" stroke="var(--ink-2)"/><text x="${xa - 12}" y="${(Y0 + Y1) / 2}" font-size="11" text-anchor="middle" fill="var(--ink-2)" transform="rotate(-90 ${xa - 12} ${(Y0 + Y1) / 2})">位能</text><text x="${xb}" y="${Y1 + 18}" font-size="11" text-anchor="end" fill="var(--ink-2)">反應進行 →</text>`;
    s += `<path d="${path(Ea)}" fill="none" stroke="var(--ink)" stroke-width="2.5"/>`;
    if (st.cat) s += `<path d="${path(Ec)}" fill="none" stroke="var(--c-B)" stroke-width="2.5" stroke-dasharray="6 4"/><text x="${xp}" y="${ey(Ec) - 5}" font-size="11" text-anchor="middle" fill="var(--c-B)">有催化劑</text>`;
    s += `<line x1="${x1}" x2="${xp + 60}" y1="${ey(0)}" y2="${ey(0)}" stroke="var(--mute)" stroke-dasharray="3 3"/><line x1="${xp - 60}" x2="${x2}" y1="${ey(dH)}" y2="${ey(dH)}" stroke="var(--mute)" stroke-dasharray="3 3"/>`;
    const arr = (x, a, b, c, t, side) => Math.abs(a - b) < 1e-9 ? '' : `<line x1="${x}" x2="${x}" y1="${ey(a)}" y2="${ey(b)}" stroke="${c}" stroke-width="2" marker-end="url(#${uid}${c === 'var(--red)' ? 'r' : c === 'var(--c-P)' ? 'p' : 'g'})"/><text x="${x + (side ? 5 : -5)}" y="${(ey(a) + ey(b)) / 2 + 4}" font-size="11" text-anchor="${side ? 'start' : 'end'}" fill="${c}" font-weight="700" stroke="var(--bg)" stroke-width="3" paint-order="stroke">${t}</text>`;
    s += arr(xp - 32, 0, Ea, 'var(--red)', `Ea ${Ea}`, false);
    s += arr(xp + 34, dH, Ea, 'var(--c-P)', `Ea(逆) ${Ea - dH}`, true);
    s += arr(x2 + 8, 0, dH, 'var(--c-C)', `ΔH ${sg(dH)}`, true);
    s += `<text x="${xa + 4}" y="${ey(0) - 5}" font-size="11" fill="var(--ink-2)">反應物</text><text x="${xb - 2}" y="${ey(dH) - 5}" font-size="11" text-anchor="end" fill="var(--ink-2)">生成物</text>`;
    return s;
  }
  function dist() {
    const X0 = 50, X1 = 405, Y0 = 210, Y1 = 345, EM = 130, ex = (E) => X0 + (E / EM) * (X1 - X0);
    const th = (T) => 20 * (T / T1); // 示意尺度
    const fE = (E, T) => Math.sqrt(E) * Math.exp(-E / th(T)) / th(T) ** 1.5;
    const ymax = fE(th(T1) / 2, T1) * 1.1, fy = (v) => Y1 - (v / ymax) * (Y1 - Y0);
    const Ea = effEa();
    let s = `<text x="10" y="${Y0 - 12}" font-size="12" font-weight="700" fill="var(--teal)">分子動能分布（示意，橫軸已壓縮）</text>`;
    s += `<line x1="${X0}" x2="${X1}" y1="${Y1}" y2="${Y1}" stroke="var(--ink-2)"/><line x1="${X0}" x2="${X0}" y1="${Y0 - 4}" y2="${Y1}" stroke="var(--ink-2)"/><text x="${X1}" y="${Y1 + 15}" font-size="11" text-anchor="end" fill="var(--ink-2)">動能 →</text><text x="${X0 - 6}" y="${(Y0 + Y1) / 2}" font-size="11" text-anchor="middle" fill="var(--ink-2)" transform="rotate(-90 ${X0 - 6} ${(Y0 + Y1) / 2})">分子數</text>`;
    [[T1, 'var(--c-P)'], [st.T2, 'var(--red)']].forEach(([T, c], j) => {
      let d = '', sh = `M${ex(Ea)} ${Y1}`;
      for (let E = 0; E <= EM; E += 0.5) { const p = ex(E).toFixed(1) + ' ' + fy(fE(E, T)).toFixed(1); d += (E ? 'L' : 'M') + p; if (E >= Ea) sh += 'L' + p; }
      sh += `L${ex(EM)} ${Y1}Z`;
      s += `<path d="${sh}" fill="${c}" opacity="${j ? 0.28 : 0.22}"/><path d="${d}" fill="none" stroke="${c}" stroke-width="2"/>`;
    });
    s += `<line x1="${ex(Ea)}" x2="${ex(Ea)}" y1="${Y0 - 2}" y2="${Y1}" stroke="${st.cat ? 'var(--c-B)' : 'var(--ink)'}" stroke-width="2" stroke-dasharray="5 3"/><text x="${ex(Ea) + 4}" y="${Y0 + 8}" font-size="11" fill="${st.cat ? 'var(--c-B)' : 'var(--ink)'}">Ea${st.cat ? '（催化）' : ''}</text>`;
    if (st.cat) s += `<line x1="${ex(st.Ea)}" x2="${ex(st.Ea)}" y1="${Y0 + 14}" y2="${Y1}" stroke="var(--mute)" stroke-dasharray="2 3"/>`;
    s += `<text x="${X1}" y="${Y0 + 8}" font-size="11" text-anchor="end"><tspan fill="var(--c-P)">— T₁ = ${T1} K</tspan>　<tspan fill="var(--red)">— T₂ = ${st.T2} K</tspan></text><text x="${X1}" y="${Y0 + 24}" font-size="10" text-anchor="end" fill="var(--mute)">陰影：動能 ≥ Ea 的分子</text>`;
    return s;
  }
  function draw() {
    if (!st.exo && st.Ea < st.dH + 2) st.Ea = st.dH + 2;
    const Ea = effEa(), dH = st.exo ? -st.dH : st.dH;
    const mk = (id, c) => `<marker id="${uid}${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`;
    svg.innerHTML = `<defs>${mk('r', 'var(--red)')}${mk('p', 'var(--c-P)')}${mk('g', 'var(--c-C)')}</defs>` + energy() + dist();
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.m === 'exo') === st.exo)));
    el.querySelector('[data-c]').setAttribute('aria-pressed', String(st.cat));
    for (const k of ['Ea', 'dH', 'T2']) { sl[k].value = st[k]; sl[k].nextElementSibling.textContent = st[k] + (k === 'T2' ? ' K' : ' kJ/mol'); }
    const fr = (E, T) => Math.exp(-E / (RG * T));
    const f1 = fr(Ea, T1), f2 = fr(Ea, st.T2), base = fr(st.Ea, T1);
    f('ea').textContent = `${Ea.toFixed(0)}／${(Ea - dH).toFixed(0)} kJ/mol`;
    f('dh').textContent = `${sg(dH)} kJ/mol（${st.exo ? '放熱' : '吸熱'}）`;
    f('fr').textContent = `T₁：${sci(f1)}；T₂：${sci(f2)}`;
    f('k').textContent = `T₁：${sci(f1 / base)} 倍；T₂：${sci(f2 / base)} 倍`;
    f('note').textContent = st.cat
      ? '催化劑提供活化能較低的新途徑（正、逆反應的 Ea 降低相同的量），ΔH 不變；能越過障礙的分子比例大增，速率加快。'
      : `升溫主要是使動能 ≥ Ea 的分子比例增加（陰影變大），碰撞頻率只略增；Ea 愈大，速率對溫度愈敏感。ΔH 只說明放熱或吸熱，不說明快慢。`;
  }
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.exo = b.dataset.m === 'exo'; draw(); }));
  el.querySelector('[data-c]').addEventListener('click', () => { st.cat = !st.cat; draw(); });
  Object.values(sl).forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); if (!st.exo && i.dataset.k === 'Ea' && st.Ea < st.dH + 2) st.dH = st.Ea - 2; draw(); }));
  draw();
};

/* scale */
(window.SIMS = window.SIMS || {}).scale = function (el, opt) {
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');
  const sci = (x, d) => { const e = Math.floor(Math.log10(x) + 1e-12); let a = x / 10 ** e; let s = a.toFixed(d); if (Number(s) >= 10) { s = (a / 10).toFixed(d); return s + '×10' + sup(e + 1); } return s + '×10' + sup(e); };
  const LO = -15, HI = 27;
  const OBJ = [
    ['質子', 1.7e-15], ['鈾原子核', 1.5e-14], ['氫原子', 1.06e-10], ['DNA 雙股寬', 2e-9], ['病毒', 1e-7],
    ['紅血球（細胞）', 8e-6], ['人的身高', 1.7], ['玉山高度', 3952], ['地球直徑', 1.27e7], ['地月距離', 3.84e8],
    ['日地距離', 1.5e11], ['1 光年', 9.46e15], ['銀河系直徑', 1e21], ['仙女座星系距離', 2.4e22], ['可觀測宇宙直徑', 8.8e26],
  ].map(([n, v]) => ({ n, v, L: Math.log10(v) }));
  const st = { c: -5, w: 11, a: 2, b: 6 };
  el.innerHTML = `<div class="sim-head"><b>自然界的長度尺度</b><span>拖動滑桿移動放大視窗；選兩個對象（或點刻度上的圓點），看相差幾個數量級。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 250" role="img" aria-label="對數長度尺"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>視窗中心</span><input type="range" data-k="c" min="-15" max="27" step="0.5" value="-5"><output></output></label>
    <label class="sl"><span>視窗寬度</span><input type="range" data-k="w" min="3" max="42" step="1" value="11"><output></output></label>
    <label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span style="color:var(--c-P)">● 甲</span><select data-s="a"></select></label>
    <label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span style="color:var(--c-C)">● 乙</span><select data-s="b"></select></label>
    <div class="facts"><div class="fact"><span>甲</span><b data-f="a"></b></div><div class="fact"><span>乙</span><b data-f="b"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>乙 ÷ 甲</span><b data-f="r"></b></div></div>
    <p class="sim-note">對數尺上每一大格都是 10 倍；數量級取 log 值四捨五入（以 √10 ≈ 3.16 為界）。原子約 10⁻¹⁰ m、原子核約 10⁻¹⁵ m，兩者相差約 10⁵ 倍。</p>
  </div></div>`;
  const svg = el.querySelector('svg');
  el.querySelectorAll('select').forEach((s) => { s.innerHTML = OBJ.map((o, i) => `<option value="${i}">${o.n}</option>`).join(''); s.value = st[s.dataset.s]; });
  const X0 = 12, X1 = 408;
  const ox = (L) => X0 + ((L - LO) / (HI - LO)) * (X1 - X0);
  function draw() {
    const w = st.w, c = Math.min(Math.max(st.c, LO + w / 2), HI - w / 2), a = c - w / 2, b = c + w / 2;
    const zx = (L) => X0 + ((L - a) / (b - a)) * (X1 - X0);
    let s = `<text x="${X0}" y="14" font-size="11" fill="var(--ink-2)">全尺度（10⁻¹⁵ m ～ 10²⁷ m）</text>`;
    s += `<line x1="${X0}" y1="40" x2="${X1}" y2="40" stroke="var(--ink-2)"/>`;
    for (let e = LO; e <= HI; e++) {
      const x = ox(e), big = e % 5 === 0;
      s += `<line x1="${x}" y1="${big ? 34 : 37}" x2="${x}" y2="${big ? 46 : 43}" stroke="var(--ink-2)"/>`;
      if (big) s += `<text x="${x}" y="60" font-size="10" text-anchor="middle" fill="var(--ink-2)">10${sup(e)}</text>`;
    }
    s += `<rect x="${ox(a)}" y="28" width="${ox(b) - ox(a)}" height="24" fill="var(--teal)" fill-opacity=".15" stroke="var(--teal)" rx="3"/>`;
    s += `<path d="M${ox(a)} 52 L${X0} 92 M${ox(b)} 52 L${X1} 92" stroke="var(--teal)" stroke-dasharray="3 3" fill="none"/>`;
    OBJ.forEach((o, i) => { const col = i === st.a ? 'var(--c-P)' : i === st.b ? 'var(--c-C)' : 'var(--ink-2)'; s += `<circle cx="${ox(o.L)}" cy="40" r="${i === st.a || i === st.b ? 4.5 : 2.5}" fill="${col}"/>`; });
    // zoom ruler
    const Y = 212;
    s += `<rect x="${X0}" y="92" width="${X1 - X0}" height="150" fill="var(--card)" stroke="var(--teal)" rx="6"/>`;
    s += `<line x1="${X0}" y1="${Y}" x2="${X1}" y2="${Y}" stroke="var(--ink)" stroke-width="1.5"/>`;
    const step = w > 24 ? 5 : w > 8 ? 2 : 1;
    for (let e = Math.ceil(a); e <= Math.floor(b); e++) {
      const x = zx(e);
      s += `<line x1="${x}" y1="${Y - 7}" x2="${x}" y2="${Y + 7}" stroke="var(--ink)"/>`;
      if (e % step === 0) s += `<text x="${x}" y="${Y + 21}" font-size="13" text-anchor="middle" fill="var(--ink)">10${sup(e)}</text>`;
      if (w <= 12) for (let k = 2; k <= 9; k++) { const xm = zx(e + Math.log10(k)); if (xm < X1) s += `<line x1="${xm}" y1="${Y - 3}" x2="${xm}" y2="${Y + 3}" stroke="var(--mute)"/>`; }
    }
    const rows = [-1e9, -1e9, -1e9, -1e9];
    OBJ.forEach((o, i) => {
      if (o.L < a - 1e-9 || o.L > b + 1e-9) return;
      const x = zx(o.L), sel = i === st.a || i === st.b, col = i === st.a ? 'var(--c-P)' : i === st.b ? 'var(--c-C)' : 'var(--ink-2)';
      const tw = o.n.length * 13.5 + 6, x0 = Math.min(Math.max(x - tw / 2, X0 + 2), X1 - tw - 2);
      let r = rows.findIndex((end) => end < x0); if (r < 0) r = rows.length - 1; rows[r] = x0 + tw;
      const ly = Y - 20 - r * 22;
      s += `<line x1="${x}" y1="${Y}" x2="${x}" y2="${ly + 4}" stroke="${col}" stroke-opacity=".6"/>`;
      s += `<g data-i="${i}" style="cursor:pointer"><circle cx="${x}" cy="${Y}" r="${sel ? 6 : 4.5}" fill="${col}" stroke="var(--card)" stroke-width="1.5"/>`;
      s += `<text x="${x0 + tw / 2}" y="${ly}" text-anchor="middle" font-size="13.5" fill="${col}" font-weight="${sel ? 700 : 400}">${o.n}</text></g>`;
    });
    s += `<text x="${X1 - 6}" y="108" font-size="11" text-anchor="end" fill="var(--teal)">放大：${sci(10 ** a, 1)} ～ ${sci(10 ** b, 1)} m</text>`;
    svg.innerHTML = s;
    el.querySelector('[data-k="c"]').value = c; st.c = c;
    el.querySelector('[data-k="c"] + output').textContent = sci(10 ** c, 1) + ' m';
    el.querySelector('[data-k="w"] + output').textContent = w + ' 個數量級';
    const A = OBJ[st.a], B = OBJ[st.b], d = B.L - A.L, r = B.v / A.v;
    el.querySelector('[data-f="a"]').textContent = sci(A.v, 2) + ' m ≈ 10' + sup(Math.round(A.L));
    el.querySelector('[data-f="b"]').textContent = sci(B.v, 2) + ' m ≈ 10' + sup(Math.round(B.L));
    el.querySelector('[data-f="r"]').textContent = sci(r, 1) + ' 倍 → log = ' + d.toFixed(2) + '，相差約 ' + Math.abs(Math.round(d)) + ' 個數量級';
  }
  el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => { st[inp.dataset.k] = Number(inp.value); draw(); }));
  el.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => { st[s.dataset.s] = Number(s.value); draw(); }));
  svg.addEventListener('click', (e) => {
    const g = e.target.closest('g[data-i]'); if (!g) return;
    const i = Number(g.dataset.i); if (i === st.b) return;
    st.a = st.b; st.b = i;
    el.querySelector('[data-s="a"]').value = st.a; el.querySelector('[data-s="b"]').value = st.b; draw();
  });
  draw();
};

/* season */
(window.SIMS = window.SIMS || {}).season = function (el, opt) {
  const D = Math.PI / 180, EPS = 23.44;
  const KEY = [79, 172, 266, 356];
  const decl = (n) => { // 分段正弦：二分二至日恰為 0、±23.44°
    let d = n < 79 ? n + 365 : n;
    const k = d < 172 ? 0 : d < 266 ? 1 : d < 356 ? 2 : 3, a = KEY[k], b = k < 3 ? KEY[k + 1] : 444, f = (d - a) / (b - a) * Math.PI / 2;
    return EPS * [Math.sin(f), Math.cos(f), -Math.sin(f), -Math.cos(f)][k];
  };
  const ML = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const dateStr = (n) => { let m = 0; while (n > ML[m]) { n -= ML[m]; m++; } return `${m + 1} 月 ${n} 日`; };
  const LATS = [['臺北 25°N', 25.0], ['北回歸線 23.5°N', 23.5], ['赤道 0°', 0], ['北極圈 66.6°N', 66.6]];
  const DAYS = [['春分', 79], ['夏至', 172], ['秋分', 266], ['冬至', 356]];
  const st = { lat: 23.5, day: 172, t: 12 };
  const latStr = (p) => Math.abs(p) < 0.05 ? '0°' : `${Math.abs(p).toFixed(1)}°${p > 0 ? 'N' : 'S'}`;
  el.innerHTML = `<div class="sim-head"><b>太陽的周日路徑與季節</b><span>選擇地點緯度與日期，看太陽在天空的路徑、正午仰角與晝長如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 400 296" role="img" aria-label="地平天球上的太陽路徑"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>緯度 φ</span><input type="range" data-k="lat" min="-90" max="90" step="0.1"><output></output></label>
    <div class="ops" data-g="lat">${LATS.map((p, i) => `<button type="button" data-v="${i}">${p[0]}</button>`).join('')}</div>
    <label class="sl"><span>日期</span><input type="range" data-k="day" min="1" max="365" step="1"><output></output></label>
    <div class="ops" data-g="day">${DAYS.map((p, i) => `<button type="button" data-v="${i}">${p[0]}</button>`).join('')}</div>
    <label class="sl"><span>時刻</span><input type="range" data-k="t" min="0" max="24" step="0.25"><output></output></label>
    <div class="facts"></div>
    <p class="sim-note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note');
  const inputs = [...el.querySelectorAll('input[type=range]')];
  const CX = 200, CY = 212, R = 150, a = -22 * D, e = 20 * D;
  const proj = (x, y, z) => { const xr = x * Math.cos(a) + y * Math.sin(a), yr = -x * Math.sin(a) + y * Math.cos(a); return [CX + R * xr, CY - R * (z * Math.cos(e) + yr * Math.sin(e))]; };
  const sunVec = (phi, dec, H) => { // x 東、y 北、z 天頂；H 為時角（向西為正）
    const cp = Math.cos(phi), sp = Math.sin(phi), cd = Math.cos(dec), sd = Math.sin(dec);
    return [-cd * Math.sin(H), -cd * Math.cos(H) * sp + sd * cp, cd * Math.cos(H) * cp + sd * sp];
  };
  const sg = (v) => (Math.abs(v) < 0.05 ? '0.0' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
  const fmtH = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`; };
  function pathOf(dec, style) {
    let s = '', seg = [], up = null;
    const flush = () => { if (seg.length > 1) s += `<path d="M${seg.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}" fill="none" ${up ? style[0] : style[1]}/>`; };
    for (let h = -180; h <= 180; h += 2) {
      const v = sunVec(st.lat * D, dec * D, h * D), u = v[2] >= 0, p = proj(...v);
      if (up !== null && u !== up) { flush(); seg = [seg[seg.length - 1]]; }
      up = u; seg.push(p);
    }
    flush();
    return s;
  }
  function draw() {
    const phi = st.lat * D, dec = decl(st.day), dr = dec * D;
    let s = `<path d="M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}" fill="var(--card)" stroke="var(--line)"/>`;
    let hz = ''; for (let k = 0; k <= 72; k++) { const p = proj(Math.cos(k * 5 * D), Math.sin(k * 5 * D), 0); hz += (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }
    s += `<path d="${hz}Z" fill="var(--green)" fill-opacity=".14" stroke="var(--green)" stroke-width="1.5"/>`;
    let mer = ''; for (let k = 0; k <= 36; k++) { const p = proj(0, Math.cos(k * 5 * D), Math.sin(k * 5 * D)); mer += (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }
    s += `<path d="${mer}" fill="none" stroke="var(--mute)" stroke-dasharray="3 3"/>`;
    [['北', 0, 1], ['南', 0, -1], ['東', 1, 0], ['西', -1, 0]].forEach(([n, x, y]) => { const p = proj(x * 1.1, y * 1.1, 0); s += `<text x="${p[0]}" y="${p[1] + 5}" text-anchor="middle" font-size="18" font-weight="700" fill="var(--ink)">${n}</text>`; });
    const zp = proj(0, 0, 1); s += `<circle cx="${zp[0]}" cy="${zp[1]}" r="3" fill="var(--ink-2)"/><text x="${zp[0] + 6}" y="${zp[1] - 5}" font-size="15" fill="var(--ink-2)">天頂</text>`;
    const pole = proj(...sunVec(phi, Math.PI / 2, 0));
    s += `<line x1="${CX}" y1="${CY}" x2="${pole[0]}" y2="${pole[1]}" stroke="var(--c-X)" stroke-dasharray="2 3"/><text x="${pole[0] - 6}" y="${pole[1] + (st.lat >= 0 ? 4 : 14)}" text-anchor="end" font-size="14" fill="var(--c-X)">天北極</text>`;
    [EPS, 0, -EPS].forEach((d) => { s += pathOf(d, ['stroke="var(--mute)" stroke-width="1" stroke-opacity=".7"', 'stroke="var(--mute)" stroke-opacity=".25" stroke-dasharray="2 4"']); });
    s += pathOf(dec, ['stroke="var(--c-C)" stroke-width="3"', 'stroke="var(--c-C)" stroke-opacity=".45" stroke-dasharray="5 4" stroke-width="2"']);
    for (let h = -165; h <= 180; h += 15) { const v = sunVec(phi, dr, h * D); if (v[2] > 0) { const p = proj(...v); s += `<circle cx="${p[0]}" cy="${p[1]}" r="2" fill="var(--c-C)"/>`; } }
    const nv = sunVec(phi, dr, 0), np = proj(...nv);
    if (nv[2] > 0) s += `<line x1="${CX}" y1="${CY}" x2="${np[0]}" y2="${np[1]}" stroke="var(--c-C)" stroke-width="1" stroke-dasharray="4 3"/><text x="${np[0] + 9}" y="${np[1] + 16}" font-size="15" fill="var(--c-C)" font-weight="700">正午</text>`;
    const sv = sunVec(phi, dr, (st.t - 12) * 15 * D), sp = proj(...sv);
    s += `<circle cx="${sp[0]}" cy="${sp[1]}" r="9" fill="var(--sun)" stroke="var(--c-C)" stroke-width="2"${sv[2] < 0 ? ' fill-opacity=".35" stroke-opacity=".4"' : ''}/>`;
    s += `<circle cx="${CX}" cy="${CY}" r="3" fill="var(--ink)"/><text x="${CX}" y="${CY + 16}" text-anchor="middle" font-size="14" fill="var(--ink-2)">觀測者</text>`;
    s += `<text x="6" y="18" font-size="16" font-weight="700" fill="var(--ink)">${latStr(st.lat)}　${dateStr(st.day)}</text><text x="6" y="37" font-size="13" fill="var(--mute)">細線：夏至、二分、冬至；虛線：地平線下</text>`;
    svg.innerHTML = s;
    // 讀數
    const zd = st.lat - dec, hNoon = 90 - Math.abs(zd);
    const dir = Math.abs(zd) < 0.05 ? '天頂' : zd > 0 ? '南方' : '北方';
    const tp = Math.tan(phi) * Math.tan(dr), polar = Math.abs(st.lat) > 89.95;
    let day, dayTxt, riseTxt;
    if (polar ? st.lat * dec > 0 : tp >= 1) { day = 24; dayTxt = '永晝（24 h）'; }
    else if (polar ? st.lat * dec < 0 || dec === 0 : tp <= -1) { day = 0; dayTxt = polar && dec === 0 ? '太陽沿地平線繞行' : '永夜（0 h）'; }
    else { const H0 = Math.acos(-tp) / D; day = 2 * H0 / 15; dayTxt = `cos H₀ = ${(-tp).toFixed(3).replace('-', '−')}，H₀ = ${H0.toFixed(1)}°<br>晝長 = 2H₀ ÷ 15°/h = ${fmtH(day)}`; }
    if (day > 0 && day < 24 && !polar) {
      const cA = Math.sin(dr) / Math.cos(phi), A = Math.acos(Math.max(-1, Math.min(1, cA))) / D, dev = 90 - A;
      riseTxt = `cos A = sin δ / cos φ = ${cA.toFixed(3).replace('-', '−')}，A = ${A.toFixed(1)}°<br>${Math.abs(dev) < 0.05 ? '正東' : `東偏${dev > 0 ? '北' : '南'} ${Math.abs(dev).toFixed(1)}°`}`;
    } else riseTxt = '—（無日出日沒）';
    const alt = Math.asin(Math.max(-1, Math.min(1, sv[2]))) / D, az = (Math.atan2(sv[0], sv[1]) / D + 360) % 360;
    const azTxt = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'][Math.round(az / 45) % 8];
    const fact = (k, v, full) => `<div class="fact"${full ? ' style="grid-column:1/-1"' : ''}><span>${k}</span><b>${v}</b></div>`;
    facts.innerHTML = fact('太陽赤緯 δ（直射點緯度）', `${dec >= 0 ? '+' : '−'}${Math.abs(dec).toFixed(1)}°`) +
      fact('單位面積日射 I/I₀ = sin h（正午）', hNoon > 0 ? Math.sin(hNoon * D).toFixed(2) : '0') +
      fact('正午仰角 h = 90° − |φ − δ|', `90° − |${sg(st.lat)} − ${dec < -0.05 ? '(' + sg(dec) + ')' : sg(dec)}| = ${sg(hNoon)}°${hNoon > 0 ? `（${dir}）` : '（地平線下）'}`, 1) +
      fact('晝長（未計折射）', dayTxt, 1) + fact('日出方位（A 由正北向東量）', riseTxt, 1) +
      fact(`此刻 ${String(Math.floor(st.t) % 24).padStart(2, '0')}:${String(Math.round((st.t % 1) * 60)).padStart(2, '0')}（視太陽時）`, alt > 0 ? `仰角 ${alt.toFixed(1)}°，${azTxt}方` : '太陽在地平線下', 1);
    let n = '正午仰角愈大，同樣的陽光照在愈小的面積上（I = I₀ sin h）；晝愈長，受熱時間愈長。兩者隨日期一起變化才是季節的成因，不是日地距離。';
    if (dir === '北方' && hNoon > 0 && st.lat > 0) n = '此日直射點在此地以北：正午太陽在北方，竿影朝南（北回歸線以南地區夏至前後即是如此）。';
    else if (day === 24 || day === 0) n = '極圈以內：|tan φ · tan δ| ≥ 1 時，太陽整天不落（永晝）或整天不升（永夜）。';
    note.textContent = n;
  }
  function sync() {
    inputs.forEach((i) => { i.value = st[i.dataset.k]; });
    inputs[0].nextElementSibling.textContent = latStr(st.lat);
    inputs[1].nextElementSibling.textContent = dateStr(st.day);
    const t = st.t; inputs[2].nextElementSibling.textContent = `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`;
    el.querySelectorAll('[data-g=lat] button').forEach((b) => b.setAttribute('aria-pressed', Math.abs(LATS[b.dataset.v][1] - st.lat) < 0.01));
    el.querySelectorAll('[data-g=day] button').forEach((b) => b.setAttribute('aria-pressed', DAYS[b.dataset.v][1] === st.day));
    draw();
  }
  inputs.forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); sync(); }));
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.parentElement.dataset.g === 'lat') st.lat = LATS[b.dataset.v][1]; else st.day = DAYS[b.dataset.v][1];
    sync();
  });
  sync();
};

/* sexlinked */
(window.SIMS = window.SIMS || {}).sexlinked = function (el, opt) {
  const TR = { cb: ['紅綠色盲', 'B', '色盲'], hemo: ['血友病', 'H', '血友病'] };
  let tr = opt.mode === 'hemo' ? 'hemo' : 'cb', mom = 1, dad = 0; // mom: 0 顯性同型、1 攜帶者、2 隱性同型；dad: 0 正常、1 患者
  el.innerHTML = `<style>.sim[data-sim="sexlinked"] table{border-collapse:separate;border-spacing:4px;width:100%;table-layout:fixed;text-align:center}
  .sim[data-sim="sexlinked"] th{font-weight:700;font-size:1.05rem;padding:4px}.sim[data-sim="sexlinked"] td{background:var(--card);border:1.5px solid var(--line);border-radius:10px;padding:8px 2px}
  .sim[data-sim="sexlinked"] td b{display:block;font-family:var(--f-mono);font-size:1.1rem}.sim[data-sim="sexlinked"] td i{font-style:normal;font-size:.8rem;border-radius:999px;padding:0 8px;display:inline-block;margin-top:3px}
  .sim[data-sim="sexlinked"] .af{background:var(--red);color:#fff}.sim[data-sim="sexlinked"] .ca{background:var(--sun);color:var(--ink)}.sim[data-sim="sexlinked"] .no{background:var(--teal-soft);color:var(--teal-2)}
  .sim[data-sim="sexlinked"] .pg small{color:var(--mute);font-size:.8rem}.sim[data-sim="sexlinked"] .pg{display:grid;gap:4px}</style>
  <div class="sim-head"><b>X 性聯隱性遺傳</b><span>選擇父母的基因型，看兒子與女兒各自的患病機率。</span></div>
  <div class="sim-body"><div class="sim-viz" style="padding:10px"><table></table><p data-leg style="margin:6px 0 0;font-size:.8rem;color:var(--ink-2)"></p></div>
  <div class="sim-ctl">
    <div class="ops">${Object.entries(TR).map(([k, v]) => `<button type="button" data-tr="${k}">${v[0]}</button>`).join('')}</div>
    <div class="pg"><small>母親</small><div class="ops" data-mom></div></div>
    <div class="pg"><small>父親</small><div class="ops" data-dad></div></div>
    <div class="facts">
      <div class="fact"><span>兒子中患病的機率</span><b data-f="s"></b></div>
      <div class="fact"><span>女兒中患病的機率</span><b data-f="d"></b></div>
      <div class="fact"><span>女兒中為攜帶者的機率</span><b data-f="c"></b></div>
      <div class="fact"><span>每胎生出患病兒子的機率</span><b data-f="x"></b></div>
    </div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s);
  const X = (a) => `X<sup>${a}</sup>`;
  const frac = (n, d) => { if (!n) return '0'; if (n === d) return '1（100%）'; const g = n % 2 === 0 && d % 2 === 0 ? (n % 4 === 0 && d % 4 === 0 ? 4 : 2) : 1; return `${n / g}/${d / g}（${Math.round(n / d * 100)}%）`; };
  function render() {
    const A = TR[tr][1], a = A.toLowerCase(), name = TR[tr][2];
    const momG = [[A, A], [A, a], [a, a]][mom], dadG = [[A, 'Y'], [a, 'Y']][dad];
    const kind = (g) => { const xs = g.filter((x) => x !== 'Y'); if (g.includes('Y')) return xs[0] === a ? 2 : 0; return xs.filter((x) => x === a).length === 2 ? 2 : xs.includes(a) ? 1 : 0; };
    const lab = ['<i class="no">正常</i>', '<i class="ca">攜帶者</i>', `<i class="af">${name}</i>`];
    let h = `<tr><th style="width:24%"></th>${momG.map((g) => `<th style="color:var(--red)">${X(g)}<br><small style="font-weight:400;font-size:.75rem;color:var(--mute)">卵</small></th>`).join('')}</tr>`;
    let sA = 0, dA = 0, dC = 0;
    dadG.forEach((s) => {
      h += `<tr><th style="color:var(--c-P)">${s === 'Y' ? 'Y' : X(s)}<br><small style="font-weight:400;font-size:.75rem;color:var(--mute)">精子</small></th>`;
      momG.forEach((e) => {
        const g = s === 'Y' ? [e, 'Y'] : [s, e].sort((p, r) => (p === A ? -1 : r === A ? 1 : 0)), k = kind(g), son = s === 'Y';
        if (son && k === 2) sA++; if (!son && k === 2) dA++; if (!son && k === 1) dC++;
        h += `<td><b>${son ? X(g[0]) + 'Y' : X(g[0]) + X(g[1])}</b>${son ? '♂ 兒子' : '♀ 女兒'}<br>${lab[k]}</td>`;
      });
      h += '</tr>';
    });
    q('table').innerHTML = h;
    q('[data-leg]').innerHTML = `${X(A)}：正常對偶基因（顯性）；${X(a)}：${name}對偶基因（隱性）。每一格機率 1/4。`;
    q('[data-mom]').innerHTML = [[A, A], [A, a], [a, a]].map((g, i) => `<button type="button" data-mo="${i}" aria-pressed="${i === mom}">${X(g[0])}${X(g[1])}</button>`).join('');
    q('[data-dad]').innerHTML = [A, a].map((g, i) => `<button type="button" data-da="${i}" aria-pressed="${i === dad}">${X(g)}Y</button>`).join('');
    el.querySelectorAll('[data-tr]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tr === tr));
    q('[data-f="s"]').textContent = frac(sA, 2); q('[data-f="d"]').textContent = frac(dA, 2);
    q('[data-f="c"]').textContent = frac(dC, 2); q('[data-f="x"]').textContent = frac(sA, 4);
    q('[data-note]').textContent = dad === 1 && mom === 0 ? '父親患病：他的 X 必傳給所有女兒（皆為攜帶者），兒子得到父親的 Y，不會由父親得到致病基因。'
      : mom === 2 ? '母親患病：每個兒子的 X 都來自母親且帶致病基因，所以兒子必患病；女兒是否患病取決於父親。'
      : mom === 1 ? `母親為攜帶者：兒子中患病 1/2；但「每胎生出患病兒子」還要乘上生男的 1/2，得 ${frac(sA, 4).split('（')[0]}。注意分母不同。`
      : '母親不帶致病基因，兒子的 X 來自母親，因此兒子都正常；男性患者的致病基因必來自母親。';
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tr) tr = b.dataset.tr;
    if (b.dataset.mo) mom = +b.dataset.mo;
    if (b.dataset.da) dad = +b.dataset.da;
    render();
  });
  render();
};

/* sigfig */
(window.SIMS = window.SIMS || {}).sigfig = function (el, opt) {
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');
  const UNS = { '⁻': '-', '⁰': 0, '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9 };
  const PRE = ['0.00520', '1.008', '3.60', '1500', '2.0×10³', '0.0360', '12.30'];
  el.innerHTML = `<style>.sim[data-sim="sigfig"] .dg{font-family:var(--f-mono);font-size:1.9rem;letter-spacing:.06em;text-align:center;padding:8px 4px 2px;overflow-wrap:anywhere}
  .sim[data-sim="sigfig"] .dg i{font-style:normal}.sim[data-sim="sigfig"] .dg .s{color:var(--teal);font-weight:700}.sim[data-sim="sigfig"] .dg .z{color:var(--mute)}.sim[data-sim="sigfig"] .dg .q{background:var(--sun);border-radius:4px}
  .sim[data-sim="sigfig"] .lg{font-size:.78rem;color:var(--ink-2);text-align:center;margin-bottom:6px}.sim[data-sim="sigfig"] h4{margin:6px 0 0;font-size:.92rem;color:var(--teal-2)}</style>
  <div class="sim-head"><b>有效數字與刻度讀數</b><span>輸入或點選一個測量值，看哪些位數算有效數字；再移動物體，比較兩把尺的讀數。</span></div>
  <div class="sim-body"><div class="sim-viz"><div class="dg"></div>
    <div class="lg"><span style="color:var(--teal);font-weight:700">■ 有效數字</span>　<span style="color:var(--mute)">■ 只表示小數點位置</span>　<span style="background:var(--sun)">■ 無法判斷</span></div>
    <svg viewBox="0 0 420 130" role="img" aria-label="刻度尺讀數"></svg></div>
  <div class="sim-ctl">
    <label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span>測量值</span><input type="text" value="0.00520" inputmode="decimal" aria-label="測量值"></label>
    <div class="ops" data-g="pre">${PRE.map((p) => `<button type="button" data-v="${p}">${p}</button>`).join('')}</div>
    <div class="facts"><div class="fact"><span>有效數字位數</span><b data-f="n"></b></div><div class="fact"><span>科學記號</span><b data-f="sci"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>判斷依據</span><b data-f="why" style="font-family:inherit;font-size:.86rem;font-weight:400"></b></div></div>
    <h4>刻度尺讀數：讀到最小刻度，再估計一位</h4>
    <div class="ops" data-g="ruler"><button type="button" data-r="cm" aria-pressed="true">甲尺：最小刻度 1 cm</button><button type="button" data-r="mm" aria-pressed="false">乙尺：最小刻度 1 mm</button></div>
    <label class="sl"><span>物體長</span><input type="range" min="0.5" max="4.9" step="0.001" value="3.637"><output></output></label>
    <h4>練習：乘除的有效數字</h4>
    <div data-f="q" style="font-family:var(--f-mono);font-size:1rem"></div>
    <div class="ops" data-g="ans"></div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>結果</span><b data-f="fb" style="font-family:inherit;font-size:.88rem;font-weight:400">選一個答案。</b></div></div>
    <div class="ops"><button type="button" data-next>下一題</button></div>
    <p class="sim-note">記錄值＝準確值＋一位估計值；乘除結果的位數與「位數最少」的數相同，計算機顯示的一長串數字不能照抄。</p>
  </div></div>`;
  const $ = (s) => el.querySelector(s);
  function parse(raw) {
    let s = raw.trim().replace(/\s+/g, '').replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => UNS[c]);
    const m = s.match(/^[+-]?(\d*)(\.?)(\d*)(?:(?:e|[×xX*]10\^?)([+-]?\d+))?$/);
    if (!m || (m[1] + m[3]) === '') return null;
    return { int: m[1], dot: m[2] === '.', frac: m[3], exp: Number(m[4] || 0), sci: m[4] !== undefined };
  }
  function analyze() {
    const p = parse($('input[type=text]').value), dg = $('.dg');
    if (!p) { dg.textContent = '？'; $('[data-f="n"]').textContent = '—'; $('[data-f="sci"]').textContent = '—'; $('[data-f="why"]').textContent = '請輸入數字，例如 0.0520 或 2.0×10^3。'; return; }
    const all = p.int + p.frac, first = all.search(/[1-9]/);
    if (first < 0) { dg.textContent = all; $('[data-f="n"]').textContent = '—'; $('[data-f="sci"]').textContent = '0'; $('[data-f="why"]').textContent = '測量值為 0，無法以此判斷位數。'; return; }
    const lastNZ = all.length - 1 - all.split('').reverse().join('').search(/[1-9]/);
    const amb = !p.dot && !p.sci && lastNZ < all.length - 1;
    const endSig = p.dot || p.sci ? all.length - 1 : lastNZ;
    let html = '';
    all.split('').forEach((c, i) => {
      if (i === p.int.length && p.dot) html += '<i>.</i>';
      const cls = i < first ? 'z' : i <= endSig ? 's' : 'q';
      html += `<i class="${cls}">${c}</i>`;
    });
    if (p.dot && p.frac === '') html += '<i>.</i>';
    if (p.sci) html += `<i>×10${sup(p.exp)}</i>`;
    dg.innerHTML = html;
    const e = p.int.length - 1 - first + p.exp, nmin = endSig - first + 1, nmax = all.length - first;
    const mant = (k) => { const d = all.slice(first, first + k); return d[0] + (k > 1 ? '.' + d.slice(1) : '') + '×10' + sup(e); };
    $('[data-f="n"]').textContent = amb ? `${nmin}～${nmax} 位（無法判斷）` : `${nmin} 位`;
    $('[data-f="sci"]').textContent = amb ? `${mant(nmin)} 或 ${mant(nmax)}` : mant(nmin);
    const why = [];
    if (first > 0) why.push('首位非零數字前的 0 只表示小數點位置，不算');
    if (/0/.test(all.slice(first, lastNZ + 1))) why.push('非零數字之間的 0 要算');
    if (lastNZ < all.length - 1) why.push(p.dot || p.sci ? '小數點後（或科學記號中）末尾的 0 是估計值，要算' : '整數末尾的 0 無法判斷，宜改用科學記號');
    if (!why.length) why.push('非零數字皆算');
    $('[data-f="why"]').textContent = why.join('；') + '。';
  }
  // ruler
  const svg = $('svg'); let unit = 'cm';
  function ruler() {
    const L = Number($('input[type=range]').value), X = (v) => 30 + v * 72;
    let s = `<rect x="${X(0)}" y="18" width="${L * 72}" height="26" rx="3" fill="var(--c-C)" fill-opacity=".75"/>`;
    s += `<rect x="20" y="50" width="380" height="62" rx="4" fill="var(--card)" stroke="var(--line)"/>`;
    for (let i = 0; i <= 50; i++) {
      const big = i % 10 === 0, half = i % 5 === 0;
      if (!big && unit === 'cm') continue;
      s += `<line x1="${X(i / 10)}" y1="50" x2="${X(i / 10)}" y2="${50 + (big ? 22 : half ? 15 : 10)}" stroke="var(--ink)" stroke-width="${big ? 1.4 : .8}"/>`;
      if (big) s += `<text x="${X(i / 10)}" y="90" font-size="15" text-anchor="middle" fill="var(--ink)">${i / 10}</text>`;
    }
    s += `<text x="395" y="106" font-size="12" text-anchor="end" fill="var(--ink-2)">cm</text><line x1="${X(L)}" y1="12" x2="${X(L)}" y2="74" stroke="var(--red)" stroke-dasharray="3 2"/>`;
    svg.innerHTML = s;
    const d = unit === 'cm' ? 1 : 2, r = L.toFixed(d), acc = unit === 'cm' ? Math.floor(Number(r)).toString() : (Math.floor(Number(r) * 10) / 10).toFixed(1);
    const est = (Number(r) - Number(acc)).toFixed(d);
    $('output').textContent = `讀作 ${r} cm`;
    $('output').title = `準確值 ${acc}、估計值 ${est}`;
    svg.setAttribute('aria-label', `讀作 ${r} cm：${acc} 為準確值，${est} 為估計值（${d + 1} 位有效數字）`);
    svg.insertAdjacentHTML('beforeend', `<text data-t x="210" y="127" font-size="14" text-anchor="middle" fill="var(--teal-2)">${r} cm ＝ 準確值 ${acc} ＋ 估計值 ${est}（${r.replace('.', '').replace(/^0+/, '').length} 位有效數字）</text>`);
  }
  // practice
  const fmt = (x, k) => { const r = Number(x.toPrecision(k)); const e2 = Math.floor(Math.log10(Math.abs(r)));
    if (e2 > k - 1 || e2 < -3) { const m = (r / 10 ** e2).toFixed(k - 1); return m + '×10' + sup(e2); } return r.toFixed(Math.max(0, k - 1 - e2)); };
  let Q = { a: 4.20, ka: 3, b: 2.6, kb: 2, op: '×' };
  function rnd(k) { const e = Math.floor(Math.random() * (k + 1)) - 1; const m = 1 + Math.random() * 9; return Number((m * 10 ** e).toPrecision(k)); }
  function newQ() { const ka = 2 + Math.floor(Math.random() * 3); let kb = 2 + Math.floor(Math.random() * 3); if (kb === ka) kb = ka === 2 ? 3 : ka - 1; Q = { a: rnd(ka), ka, b: rnd(kb), kb, op: Math.random() < 0.5 ? '×' : '÷' }; showQ(); }
  function showQ() {
    const raw = Q.op === '×' ? Q.a * Q.b : Q.a / Q.b, k = Math.min(Q.ka, Q.kb);
    $('[data-f="q"]').textContent = `${fmt(Q.a, Q.ka)} ${Q.op} ${fmt(Q.b, Q.kb)} = ？`;
    const right = fmt(raw, k), calc = String(Number(raw.toPrecision(7)));
    const opts = [...new Set([right, fmt(raw, Math.max(Q.ka, Q.kb)), calc, fmt(raw, k > 1 ? k - 1 : k + 2)])].sort(() => Math.random() - 0.5);
    $('[data-g="ans"]').innerHTML = opts.map((o) => `<button type="button" aria-pressed="false" data-a="${o}">${o}</button>`).join('');
    $('[data-f="fb"]').textContent = '選一個答案。';
    $('[data-g="ans"]').onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      el.querySelectorAll('[data-g="ans"] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const ok = b.dataset.a === right;
      $('[data-f="fb"]').innerHTML = `${ok ? '<b style="color:var(--green)">正確！</b>' : '<b style="color:var(--red)">再想想。</b>'} 計算機顯示 ${calc}；兩數分別為 ${Q.ka} 位與 ${Q.kb} 位，結果取 ${k} 位：<b>${right}</b>`;
    };
  }
  $('input[type=text]').addEventListener('input', analyze);
  $('[data-g="pre"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $('input[type=text]').value = b.dataset.v; analyze(); });
  $('[data-g="ruler"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; unit = b.dataset.r; el.querySelectorAll('[data-g="ruler"] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); ruler(); });
  $('input[type=range]').addEventListener('input', ruler);
  $('[data-next]').addEventListener('click', newQ);
  analyze(); ruler(); showQ();
};

/* snell */
(window.SIMS = window.SIMS || {}).snell = function (el, opt) {
  opt = opt || {};
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  const MED = [['空氣', 1.0], ['水', 1.33], ['玻璃', 1.5], ['鑽石', 2.42]];
  const ops = (k) => MED.map(([nm, n], i) => `<button type="button" data-${k}="${i}">${nm} ${n.toFixed(2)}</button>`).join('');
  const D = Math.PI / 180;
  el.innerHTML = `<div class="sim-head"><b>光的折射與全反射</b><span>拖動滑桿或直接拖曳入射光線，換不同介質，看折射角與全反射何時發生。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 300" role="img" aria-label="光線在兩介質界面的反射與折射" style="cursor:crosshair"></svg></div>
<div class="sim-ctl">
<label class="sl"><span>θ₁</span><input type="range" data-k="th" min="0" max="89" step="0.5" value="50"><output data-o="th"></output></label>
<div class="ops"><span style="font-size:.86rem;color:var(--ink-2);align-self:center">介質 1（上）</span>${ops('a')}</div>
<div class="ops"><span style="font-size:.86rem;color:var(--ink-2);align-self:center">介質 2（下）</span>${ops('b')}</div>
<div class="facts">${fact('t2', '折射角 θ₂：n₁ sin θ₁ = n₂ sin θ₂')}${fact('tc', '臨界角 θc = sin⁻¹(n₂/n₁)')}${fact('st', '結果')}${fact('rf', '反射光所占比例（約）')}</div>
<p class="sim-note">光疏進光密，折射線偏向法線；光密到光疏且入射角大於臨界角時，沒有折射光，只剩全反射。接近臨界角時折射光變弱、反射光變強。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const th = $('input[data-k=th]');
  const P = { th: 50, a: 0, b: 2 };
  const ray = (x1, y1, x2, y2, col, op, w) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, ang = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(ang), s = Math.sin(ang);
    return `<g style="opacity:${op.toFixed(2)}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${col}" stroke-width="${w}"/><path d="M${mx + 7 * c} ${my + 7 * s} L${mx - 5 * c + 5 * s} ${my - 5 * s - 5 * c} L${mx - 5 * c - 5 * s} ${my - 5 * s + 5 * c}Z" style="fill:${col}"/></g>`;
  };
  const arc = (r, a0, a1, col, lab) => {
    // angles measured from +x axis in SVG coordinates (y down)
    const p = (a) => [180 + r * Math.cos(a), 150 + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1), m = p((a0 + a1) / 2);
    const big = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return `<path d="M${x0} ${y0} A${r} ${r} 0 ${big} ${a1 > a0 ? 1 : 0} ${x1} ${y1}" fill="none" style="stroke:${col}" stroke-width="1.5"/><text x="${180 + (r + 13) * Math.cos((a0 + a1) / 2)}" y="${150 + (r + 13) * Math.sin((a0 + a1) / 2) + 4}" text-anchor="middle" font-size="12" style="fill:${col}">${lab}</text>`;
  };
  function draw() {
    const n1 = MED[P.a][1], n2 = MED[P.b][1], t1 = P.th * D, R = 140;
    const s2 = (n1 * Math.sin(t1)) / n2, tir = s2 > 1;
    const t2 = tir ? null : Math.asin(s2);
    let Rf = 1;
    if (!tir) {
      const ci = Math.cos(t1), ct = Math.cos(t2);
      const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct), rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
      Rf = (rs * rs + rp * rp) / 2;
    }
    let s = '';
    s += `<rect x="0" y="0" width="360" height="150" style="fill:var(--c-P);opacity:${((n1 - 1) * 0.12 + 0.03).toFixed(3)}"/>`;
    s += `<rect x="0" y="150" width="360" height="150" style="fill:var(--c-P);opacity:${((n2 - 1) * 0.12 + 0.03).toFixed(3)}"/>`;
    s += `<line x1="0" x2="360" y1="150" y2="150" style="stroke:var(--ink-2)" stroke-width="1.5"/><line x1="180" x2="180" y1="10" y2="290" style="stroke:var(--mute)" stroke-dasharray="4 4"/>`;
    s += `<text x="8" y="18" font-size="12" style="fill:var(--ink)">${MED[P.a][0]} n₁ = ${n1.toFixed(2)}</text><text x="8" y="292" font-size="12" style="fill:var(--ink)">${MED[P.b][0]} n₂ = ${n2.toFixed(2)}</text><text x="186" y="20" font-size="10" style="fill:var(--mute)">法線</text>`;
    if (n1 > n2) {
      const tc = Math.asin(n2 / n1);
      s += `<line x1="${180 - R * Math.sin(tc)}" y1="${150 - R * Math.cos(tc)}" x2="180" y2="150" style="stroke:var(--c-X)" stroke-dasharray="3 4"/><text x="${180 - (R + 4) * Math.sin(tc)}" y="${150 - (R + 4) * Math.cos(tc)}" text-anchor="end" font-size="11" style="fill:var(--c-X)">θc</text>`;
    }
    const ix = 180 - R * Math.sin(t1), iy = 150 - R * Math.cos(t1);
    s += ray(ix, iy, 180, 150, 'var(--red)', 1, 3);
    s += ray(180, 150, 180 + R * Math.sin(t1), 150 - R * Math.cos(t1), 'var(--red)', Math.max(0.15, Math.sqrt(Rf)), 2.5);
    if (!tir) s += ray(180, 150, 180 + R * Math.sin(t2), 150 + R * Math.cos(t2), 'var(--red)', Math.max(0.15, Math.sqrt(1 - Rf)), 3);
    if (P.th > 1) s += arc(34, -Math.PI / 2 - t1, -Math.PI / 2, 'var(--ink)', 'θ₁');
    if (!tir && t2 > 0.02) s += arc(34, Math.PI / 2 - t2, Math.PI / 2, 'var(--ink)', 'θ₂');
    if (tir) s += `<text x="270" y="190" text-anchor="middle" font-size="13" style="fill:var(--red)">全反射：無折射光</text>`;
    s += `<circle cx="${ix}" cy="${iy}" r="7" style="fill:var(--card);stroke:var(--red)" stroke-width="2"/>`;
    svg.innerHTML = s;
    $('[data-o=th]').textContent = `${f(P.th, 1)}°`;
    $('[data-f=t2]').textContent = tir ? `sin θ₂ = ${f(s2, 3)} > 1，無解` : `${f(t2 / D, 1)}°`;
    $('[data-f=tc]').textContent = n1 > n2 ? `${f(Math.asin(n2 / n1) / D, 1)}°` : '無（n₁ ≤ n₂，不會全反射）';
    $('[data-f=st]').textContent = tir ? '全反射' : n1 === n2 ? '同介質，直進' : n2 > n1 ? '折射，偏向法線' : '折射，偏離法線';
    $('[data-f=rf]').textContent = `${f(Rf * 100, Rf < 0.1 ? 1 : 0)}%`;
  }
  th.addEventListener('input', () => { P.th = parseFloat(th.value); draw(); });
  const pick = (k, i) => {
    P[k] = i;
    el.querySelectorAll(`[data-${k}]`).forEach((b) => b.setAttribute('aria-pressed', +b.dataset[k] === i ? 'true' : 'false'));
    draw();
  };
  el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => pick('a', +b.dataset.a)));
  el.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => pick('b', +b.dataset.b)));
  let drag = false;
  const fromPointer = (e) => {
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const dx = Math.abs(180 - pt.x), dy = Math.max(150 - pt.y, 0.001);
    P.th = Math.min(89, Math.round((Math.atan2(dx, dy) / D) * 2) / 2);
    th.value = P.th; draw();
  };
  svg.addEventListener('pointerdown', (e) => { drag = true; svg.setPointerCapture(e.pointerId); fromPointer(e); });
  svg.addEventListener('pointermove', (e) => { if (drag) fromPointer(e); });
  svg.addEventListener('pointerup', () => { drag = false; });
  svg.addEventListener('pointercancel', () => { drag = false; });
  if (opt.preset === 'tir') { P.th = 60; th.value = 60; pick('a', 1); pick('b', 0); }
  pick('a', P.a); pick('b', P.b);
};

/* solubility */
(window.SIMS = window.SIMS || {}).solubility = function (el, opt) {
  // g / 100 g 水，0–80 °C 每 10 °C（表 C6-1 與文獻值）
  const D = {
    KNO3: { f: 'KNO₃', c: 'var(--red)', s: [13.3, 20.9, 31.6, 45.8, 63.9, 85.5, 110, 138, 169] },
    NaNO3: { f: 'NaNO₃', c: 'var(--c-X)', s: [73, 80.8, 87.6, 94.9, 102, 114, 122, 134, 148] },
    KCl: { f: 'KCl', c: 'var(--c-B)', s: [28.0, 31.2, 34.2, 37.2, 40.1, 42.6, 45.8, 48.8, 51.3] },
    NaCl: { f: 'NaCl', c: 'var(--c-P)', s: [35.7, 35.8, 35.9, 36.1, 36.4, 36.7, 37.0, 37.5, 37.9] },
  };
  const st = { k: D[opt.mode] ? opt.mode : 'KNO3', m: 50, T: 20 };
  const S = (k, T) => { const a = D[k].s, i = Math.min(7, Math.floor(T / 10)); return a[i] + ((a[i + 1] - a[i]) * (T - 10 * i)) / 10; };
  const Tsat = (k, m) => { const a = D[k].s; if (m < a[0]) return null; for (let i = 0; i < 8; i++) if (m <= a[i + 1]) return 10 * i + (10 * (m - a[i])) / (a[i + 1] - a[i]); return null; };
  el.innerHTML = `<div class="sim-head"><b>溶解度曲線與冷卻析晶</b><span>選溶質，設定 100 g 水中溶入的質量與溫度（或直接點圖），看溶液是否飽和、析出多少晶體。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="溶解度曲線"></svg></div>
  <div class="sim-ctl">
    <div class="ops">${Object.keys(D).map((k) => `<button type="button" data-k="${k}">${D[k].f}</button>`).join('')}</div>
    <label class="sl"><span>溶入質量</span><input type="range" data-i="m" min="0" step="0.1"><output></output></label>
    <label class="sl"><span>溫度</span><input type="range" data-i="T" min="0" max="80" step="0.5"><output></output></label>
    <div class="facts">
      <div class="fact"><span>此溫度溶解度 S</span><b data-f="S"></b></div><div class="fact"><span>狀態</span><b data-f="st"></b></div>
      <div class="fact"><span>析出晶體（每 100 g 水）</span><b data-f="x"></b></div><div class="fact"><span>開始析出的溫度</span><b data-f="q"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>溶液的重量百分率濃度</span><b data-f="p"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), f = (k) => el.querySelector(`[data-f="${k}"]`), im = el.querySelector('[data-i="m"]'), iT = el.querySelector('[data-i="T"]');
  const L = 46, R = 408, T0 = 14, B = 256, YM = 180;
  const X = (t) => L + (t / 80) * (R - L), Y = (v) => B - (v / YM) * (B - T0);
  function draw() {
    const k = st.k, s = S(k, st.T), m = st.m, q = Tsat(k, m), over = m > s + 0.05, sat = Math.abs(m - s) <= 0.05;
    const dis = Math.min(m, s);
    let g = `<rect x="${L}" y="${T0}" width="${R - L}" height="${B - T0}" fill="var(--card)" stroke="var(--line)"/>`;
    for (let t = 0; t <= 80; t += 10) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${T0}" y2="${B}" stroke="var(--line)" stroke-width=".6"/><text x="${X(t)}" y="${B + 14}" font-size="11" text-anchor="middle" fill="var(--mute)">${t}</text>`;
    for (let v = 0; v <= YM; v += 20) g += `<line x1="${L}" x2="${R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width=".6"/><text x="${L - 4}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="var(--mute)">${v}</text>`;
    g += `<text x="${(L + R) / 2}" y="${B + 30}" font-size="12" text-anchor="middle" fill="var(--ink-2)">溫度（°C）</text><text x="12" y="${(T0 + B) / 2}" font-size="12" text-anchor="middle" fill="var(--ink-2)" transform="rotate(-90 12 ${(T0 + B) / 2})">溶解度（g／100 g 水）</text>`;
    Object.keys(D).forEach((j) => {
      const on = j === k, d = D[j].s.map((v, i) => (i ? 'L' : 'M') + X(10 * i) + ' ' + Y(v).toFixed(1)).join('');
      g += `<path d="${d}" fill="none" stroke="${D[j].c}" stroke-width="${on ? 3 : 1.5}" opacity="${on ? 1 : 0.35}"/><text x="${X(80) - 3}" y="${Y(D[j].s[8]) + (j === 'NaCl' ? 14 : j === 'KCl' ? -4 : -5)}" font-size="11" text-anchor="end" fill="${D[j].c}" opacity="${on ? 1 : 0.6}" font-weight="${on ? 700 : 400}">${D[j].f}</text>`;
    });
    if (q != null && q > st.T + 0.05) {
      g += `<line x1="${X(80)}" x2="${X(q)}" y1="${Y(m)}" y2="${Y(m)}" stroke="var(--ink-2)" stroke-dasharray="4 3"/>`;
      let d = ''; for (let t = q; t >= st.T - 1e-9; t -= 0.5) d += (d ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(S(k, t)).toFixed(1);
      d += 'L' + X(st.T).toFixed(1) + ' ' + Y(s).toFixed(1);
      g += `<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-dasharray="6 3"/>`;
      g += `<circle cx="${X(q)}" cy="${Y(m)}" r="4.5" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/><text x="${X(q) + 6}" y="${Y(m) - 7}" font-size="11" fill="var(--ink)" stroke="var(--card)" stroke-width="3" paint-order="stroke">開始析出 ${q.toFixed(1)} °C</text>`;
      g += `<line x1="${X(st.T)}" x2="${X(st.T)}" y1="${Y(m)}" y2="${Y(s)}" stroke="var(--c-C)" stroke-width="3"/><text x="${X(st.T) + (st.T < 16 ? 8 : -8)}" y="${(Y(m) + Y(s)) / 2 + 4}" text-anchor="${st.T < 16 ? 'start' : 'end'}" font-size="12" fill="var(--c-C)" font-weight="700" stroke="var(--card)" stroke-width="3" paint-order="stroke">析出 ${(m - s).toFixed(1)} g</text>`;
      g += `<circle cx="${X(st.T)}" cy="${Y(m)}" r="4" fill="none" stroke="var(--c-C)" stroke-width="2"/>`;
    }
    g += `<circle data-pt="1" cx="${X(st.T)}" cy="${Y(dis)}" r="7" fill="var(--sun)" stroke="var(--ink)" stroke-width="2"/>`;
    svg.innerHTML = g;
    el.querySelectorAll('[data-k]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    im.max = D[k].s[8]; im.value = m; iT.value = st.T;
    im.nextElementSibling.textContent = m.toFixed(1) + ' g'; iT.nextElementSibling.textContent = st.T.toFixed(1) + ' °C';
    f('S').textContent = s.toFixed(1) + ' g';
    f('st').textContent = sat ? '飽和' : over ? '飽和＋析出晶體' : '未飽和';
    f('x').textContent = over ? `${m.toFixed(1)} − ${s.toFixed(1)} = ${(m - s).toFixed(1)} g` : '0 g';
    f('q').textContent = q == null ? '0 °C 以上皆不析出' : q.toFixed(1) + ' °C';
    f('p').textContent = `${dis.toFixed(1)} ÷ (100 + ${dis.toFixed(1)}) × 100% = ${((dis / (100 + dis)) * 100).toFixed(1)}%`;
    f('note').textContent = over
      ? `溶質超過此溫度的溶解度：降溫時先沿水平線（組成不變）到曲線，再沿曲線析出晶體；溶液保持飽和，濃度由溶解度決定。（若未析出則為過飽和溶液，不穩定）`
      : k === 'NaCl' ? 'NaCl 的溶解度幾乎不隨溫度改變，冷卻析出的量很少，宜以蒸發結晶回收（海水曬鹽）。'
        : '曲線下方為未飽和溶液：降溫時組成不變，點水平向左移動，碰到曲線才開始析出。KNO₃ 斜率大，宜以冷卻結晶回收。';
  }
  el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { st.k = b.dataset.k; st.m = { KNO3: 50, NaNO3: 110, KCl: 40, NaCl: 37 }[st.k]; draw(); }));
  im.addEventListener('input', () => { st.m = Number(im.value); draw(); });
  iT.addEventListener('input', () => { st.T = Number(iT.value); draw(); });
  let drag = false;
  const pick = (e) => { const r = svg.getBoundingClientRect(), vx = ((e.clientX - r.left) / r.width) * 420, vy = ((e.clientY - r.top) / r.height) * 300; st.T = Math.round(Math.min(80, Math.max(0, ((vx - L) / (R - L)) * 80)) * 2) / 2; st.m = Math.round(Math.min(D[st.k].s[8], Math.max(0, ((B - vy) / (B - T0)) * YM)) * 10) / 10; draw(); };
  svg.addEventListener('pointerdown', (e) => { drag = true; svg.setPointerCapture(e.pointerId); pick(e); });
  svg.addEventListener('pointermove', (e) => { if (drag) pick(e); });
  svg.addEventListener('pointerup', () => { drag = false; });
  draw();
};

/* stoich */
(window.SIMS = window.SIMS || {}).stoich = function (el, opt) {
  // atoms: [dx, dy, element]; glyph about 20 px wide centred at 0,0
  const AT = { H: ['var(--card)', 3.6], O: ['var(--red)', 5.5], N: ['var(--c-P)', 5.5], C: ['var(--ink-2)', 5.5] };
  const SP = {
    H2: { f: 'H₂', M: 2.0, a: [[-3.5, 0, 'H'], [3.5, 0, 'H']] },
    O2: { f: 'O₂', M: 32.0, a: [[-5, 0, 'O'], [5, 0, 'O']] },
    N2: { f: 'N₂', M: 28.0, a: [[-5, 0, 'N'], [5, 0, 'N']] },
    H2O: { f: 'H₂O', M: 18.0, a: [[-6, 4, 'H'], [6, 4, 'H'], [0, -1, 'O']] },
    NH3: { f: 'NH₃', M: 17.0, a: [[-7, 3, 'H'], [7, 3, 'H'], [0, 6, 'H'], [0, -1, 'N']] },
    CH4: { f: 'CH₄', M: 16.0, a: [[-7, 0, 'H'], [7, 0, 'H'], [0, -7, 'H'], [0, 7, 'H'], [0, 0, 'C']] },
    CO2: { f: 'CO₂', M: 44.0, a: [[-6.5, 0, 'O'], [6.5, 0, 'O'], [0, 0, 'C']] },
  };
  const RX = {
    h2o: { eq: '2H₂ + O₂ → 2H₂O', r: [['H2', 2], ['O2', 1]], p: [['H2O', 2]], init: [5, 2] },
    nh3: { eq: 'N₂ + 3H₂ → 2NH₃', r: [['N2', 1], ['H2', 3]], p: [['NH3', 2]], init: [3, 6] },
    ch4: { eq: 'CH₄ + 2O₂ → CO₂ + 2H₂O', r: [['CH4', 1], ['O2', 2]], p: [['CO2', 1], ['H2O', 2]], init: [2, 3] },
  };
  const st = { k: RX[opt.mode] ? opt.mode : 'h2o', n: [0, 0] };
  st.n = RX[st.k].init.slice();
  el.innerHTML = `<div class="sim-head"><b>限量試劑與化學計量</b><span>選反應、拖動兩種反應物的莫耳數，比較「莫耳數 ÷ 係數」，看誰先用完。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="反應前後的粒子與莫耳數"></svg></div>
  <div class="sim-ctl">
    <div class="ops">${Object.keys(RX).map((k) => `<button type="button" data-k="${k}">${RX[k].eq}</button>`).join('')}</div>
    <label class="sl"><span data-l="0"></span><input type="range" data-i="0" min="0" max="8" step="0.5"><output></output></label>
    <label class="sl"><span data-l="1"></span><input type="range" data-i="1" min="0" max="8" step="0.5"><output></output></label>
    <div class="facts">
      <div class="fact" style="grid-column:1/-1"><span>莫耳數 ÷ 係數（商最小者為限量試劑）</span><b data-f="q"></b></div>
      <div class="fact"><span>限量試劑</span><b data-f="lim"></b></div><div class="fact"><span>過量試劑剩餘</span><b data-f="ex"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>生成物（理論產量）</span><b data-f="pr"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>實際反應的莫耳比（＝係數比）</span><b data-f="ratio"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), f = (k) => el.querySelector(`[data-f="${k}"]`), ins = el.querySelectorAll('[data-i]');
  const CELL = 36, X0 = 92, RH = 38;
  const glyph = (sp, cx, cy) => `<g transform="translate(${cx} ${cy}) scale(1.45)">` + SP[sp].a.map(([dx, dy, e]) => `<circle cx="${dx}" cy="${dy}" r="${AT[e][1]}" fill="${AT[e][0]}" stroke="var(--ink)" stroke-width=".6"/>`).join('') + '</g>';
  const fmt = (x) => String(Number((x + 1e-12).toFixed(2)));
  function row(sp, n, y, faded) {
    let s = `<text x="10" y="${y + 5}" font-size="15" font-weight="700" fill="var(--ink)">${SP[sp].f}</text><text x="${X0 - 6}" y="${y + 5}" font-size="13" text-anchor="end" fill="var(--ink-2)">${fmt(n)}</text>`;
    const full = Math.floor(n + 1e-9), part = n - full;
    for (let i = 0; i < full; i++) s += glyph(sp, X0 + CELL / 2 + i * CELL, y);
    if (part > 1e-6) s += `<svg x="${X0 + full * CELL}" y="${y - 18}" width="${(part * CELL).toFixed(1)}" height="36" overflow="hidden">${glyph(sp, CELL / 2, 18)}</svg><line x1="${X0 + (full + part) * CELL}" x2="${X0 + (full + part) * CELL}" y1="${y - 16}" y2="${y + 16}" stroke="var(--mute)" stroke-dasharray="2 2"/>`;
    if (n < 1e-9) s += `<text x="${X0 + 4}" y="${y + 4}" font-size="11" fill="var(--mute)">${faded ? '用完' : '0'}</text>`;
    return s;
  }
  function draw() {
    const R = RX[st.k];
    const q = R.r.map(([sp, c], i) => st.n[i] / c);
    const ext = Math.min(...q);
    const li = q[0] === q[1] ? -1 : q[0] < q[1] ? 0 : 1;
    const left = R.r.map(([sp, c], i) => st.n[i] - c * ext);
    const prod = R.p.map(([sp, c]) => c * ext);
    let s = `<text x="10" y="17" font-size="14" font-weight="700" fill="var(--teal)">反應前</text><text x="410" y="16" font-size="11" text-anchor="end" fill="var(--mute)">每個圖示代表 1 mol（不足 1 個按比例裁切）</text>`;
    let y = 42;
    R.r.forEach(([sp], i) => { s += row(sp, st.n[i], y); y += RH; });
    s += `<line x1="10" x2="410" y1="${y - 12}" y2="${y - 12}" stroke="var(--line)"/><text x="10" y="${y + 12}" font-size="14" font-weight="700" fill="var(--teal)">反應後（反應進度 ${fmt(ext)}）</text>`;
    y += 34;
    R.r.forEach(([sp], i) => { s += row(sp, left[i], y, true); y += RH; });
    R.p.forEach(([sp], i) => { s += row(sp, prod[i], y); y += RH; });
    s += `<text x="10" y="${y + 2}" font-size="12" fill="var(--mute)"><tspan fill="var(--red)">●</tspan> O　<tspan fill="var(--c-P)">●</tspan> N　<tspan fill="var(--ink-2)">●</tspan> C　○ H</text>`;
    svg.setAttribute('viewBox', `0 0 420 ${y + 12}`);
    svg.innerHTML = s;
    el.querySelectorAll('[data-k]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === st.k)));
    ins.forEach((inp, i) => { inp.value = st.n[i]; inp.nextElementSibling.textContent = st.n[i].toFixed(1) + ' mol'; el.querySelector(`[data-l="${i}"]`).textContent = SP[R.r[i][0]].f; });
    const nm = (i) => SP[R.r[i][0]].f;
    f('q').textContent = R.r.map(([sp, c], i) => `${SP[sp].f}：${st.n[i].toFixed(1)} ÷ ${c} = ${fmt(q[i])}`).join('　');
    f('lim').textContent = ext === 0 ? (st.n[0] === 0 && st.n[1] === 0 ? '—' : nm(q[0] === 0 ? 0 : 1) + '（為 0）') : li < 0 ? '恰好完全反應' : nm(li);
    f('ex').textContent = li < 0 ? '無' : `${nm(1 - li)} ${fmt(left[1 - li])} mol（${(left[1 - li] * SP[R.r[1 - li][0]].M).toFixed(1)} g）`;
    f('pr').textContent = R.p.map(([sp], i) => `${SP[sp].f} ${fmt(prod[i])} mol ＝ ${(prod[i] * SP[sp].M).toFixed(1)} g`).join('；');
    f('ratio').textContent = `${R.r.map(([sp]) => SP[sp].f).join(' : ')} : ${R.p.map(([sp]) => SP[sp].f).join(' : ')} ＝ ${R.r.map(([, c]) => fmt(c * ext)).join(' : ')} : ${prod.map(fmt).join(' : ')} ＝ ${R.r.map(([, c]) => c).join(' : ')} : ${R.p.map(([, c]) => c).join(' : ')}`;
    const moreMol = st.n[0] > st.n[1] ? 0 : 1;
    f('note').textContent = li >= 0 && li === moreMol && st.n[0] !== st.n[1]
      ? `${nm(li)} 的莫耳數雖然較多，但除以係數後商較小，仍是限量試劑：判斷要看「莫耳數 ÷ 係數」，不是莫耳數或質量大小。`
      : '所有生成量與消耗量都依限量試劑計算；過量試劑剩餘量 ＝ 原有量 − 消耗量。總質量守恆：反應前後各原子數不變。';
  }
  el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { st.k = b.dataset.k; st.n = RX[st.k].init.slice(); draw(); }));
  ins.forEach((inp, i) => inp.addEventListener('input', () => { st.n[i] = Number(inp.value); draw(); }));
  draw();
};

/* superpose */
(window.SIMS = window.SIMS || {}).superpose = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>波的疊加與駐波</b><span data-h></span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 230" role="img" aria-label="波的疊加"></svg></div>
<div class="sim-ctl">
<div class="ops"><button type="button" data-m="pulse">脈波相遇</button><button type="button" data-m="standing">兩端固定弦的駐波</button></div>
<div data-g="pulse" style="display:grid;gap:8px">
${sl('t', 't', 0, 6, 0.02, 2.4)}
<div class="ops"><button type="button" data-s="1" aria-pressed="true">同側脈波</button><button type="button" data-s="-1" aria-pressed="false">反側脈波</button><button type="button" data-b="play">播放</button></div>
<div class="facts">${fact('mid', 'x = 5.0 m 處 y₁ + y₂')}${fact('max', '繩上最大位移')}</div>
<p class="sim-note">相遇時各點位移等於兩脈波位移相加；同側相加變大，反側完全重疊時繩瞬間變直。分開後兩脈波保持原形狀、各自前進。</p>
</div>
<div data-g="standing" style="display:grid;gap:8px">
${sl('n', 'n', 1, 8, 1, 3)}${sl('L', 'L', 0.5, 2, 0.05, 1.5)}${sl('v', 'v', 50, 400, 10, 200)}
<div class="ops"><button type="button" data-b="play">播放</button></div>
<div class="facts">${fact('lam', 'λₙ = 2L/n')}${fact('fn', 'fₙ = nv/2L')}${fact('nod', '節點數／腹點數')}${fact('f1', '基頻 f₁ = v/2L')}</div>
<p class="sim-note">兩端必為節點，弦長須是半波長的整數倍；腹點數就是 n。相鄰節點相距 λ/2，fₙ 是基頻的 n 倍（動畫已放慢）。</p>
</div>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { mode: opt.mode === 'standing' ? 'standing' : 'pulse', t: 2.4, sign: 1, n: 3, L: 1.5, v: 200, ph: 0.3 };
  const A = 2, Wd = 0.55; // pulse amplitude (cm), width (m)
  const p1 = (x, t) => A * Math.exp(-Math.pow((x - (2 + t)) / Wd, 2));
  const p2 = (x, t) => P.sign * A * Math.exp(-Math.pow((x - (8 - t)) / Wd, 2));
  const SX = (x) => 20 + x * 32, SY = (y) => 125 - y * 24;
  function path(fn, x0, x1, X, Y) {
    let d = '';
    for (let i = 0; i <= 240; i++) { const x = x0 + ((x1 - x0) * i) / 240; d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(fn(x)).toFixed(1); }
    return d;
  }
  function drawPulse() {
    const t = P.t;
    let s = `<line x1="20" x2="340" y1="125" y2="125" style="stroke:var(--line)" stroke-dasharray="3 3"/>`;
    for (let k = 0; k <= 10; k += 2) s += `<text x="${SX(k)}" y="${k ? 222 : 222}" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="340" y="208" text-anchor="end" font-size="10" style="fill:var(--mute)">x (m)</text>`;
    s += `<path d="${path((x) => p1(x, t), 0, 10, SX, SY)}" fill="none" style="stroke:var(--c-P)" stroke-width="1.5" stroke-dasharray="5 3"/>`;
    s += `<path d="${path((x) => p2(x, t), 0, 10, SX, SY)}" fill="none" style="stroke:var(--c-C)" stroke-width="1.5" stroke-dasharray="5 3"/>`;
    s += `<path d="${path((x) => p1(x, t) + p2(x, t), 0, 10, SX, SY)}" fill="none" style="stroke:var(--teal)" stroke-width="3"/>`;
    const a1 = SX(2 + t), a2 = SX(8 - t);
    s += `<path d="M${a1 - 14} 20 h22 l-6 -4 m6 4 l-6 4" fill="none" style="stroke:var(--c-P)" stroke-width="2"/><text x="${a1 - 3}" y="12" text-anchor="middle" font-size="10" style="fill:var(--c-P)">脈波 1</text>`;
    s += `<path d="M${a2 + 14} 20 h-22 l6 -4 m-6 4 l6 4" fill="none" style="stroke:var(--c-C)" stroke-width="2"/><text x="${a2 + 3}" y="12" text-anchor="middle" font-size="10" style="fill:var(--c-C)">脈波 2</text>`;
    s += `<line x1="${SX(5)}" x2="${SX(5)}" y1="30" y2="210" style="stroke:var(--sun)" stroke-width="1.5"/>`;
    s += `<text x="20" y="208" font-size="10" style="fill:var(--ink-2)">虛線：各脈波單獨存在　粗線：合成</text>`;
    svg.innerHTML = s;
    let mx = 0;
    for (let i = 0; i <= 400; i++) { const x = (i / 400) * 10, y = p1(x, t) + p2(x, t); if (Math.abs(y) > Math.abs(mx)) mx = y; }
    $('[data-f=mid]').textContent = `${f(p1(5, t), 2)} + ${f(p2(5, t), 2)} = ${f(p1(5, t) + p2(5, t), 2)} cm`;
    $('[data-f=max]').textContent = `${f(mx, 2)} cm`;
    $('[data-o=t]').textContent = `${f(t, 2)} s`;
  }
  function drawStanding() {
    const n = P.n, X = (x) => 30 + x * 150, Y = (y) => 115 - y * 26;
    const k = (n * Math.PI) / P.L, c = Math.cos(P.ph);
    let s = `<line x1="30" x2="${X(P.L)}" y1="115" y2="115" style="stroke:var(--line)" stroke-dasharray="3 3"/>`;
    s += `<rect x="18" y="70" width="12" height="90" style="fill:var(--ink-2)"/><rect x="${X(P.L)}" y="70" width="12" height="90" style="fill:var(--ink-2)"/>`;
    s += `<path d="${path((x) => A * Math.sin(k * x), 0, P.L, X, Y)}" fill="none" style="stroke:var(--mute)" stroke-dasharray="3 3"/>`;
    s += `<path d="${path((x) => -A * Math.sin(k * x), 0, P.L, X, Y)}" fill="none" style="stroke:var(--mute)" stroke-dasharray="3 3"/>`;
    s += `<path d="${path((x) => A * Math.sin(k * x) * c, 0, P.L, X, Y)}" fill="none" style="stroke:var(--teal)" stroke-width="3"/>`;
    for (let j = 0; j <= n; j++) { const x = X((j * P.L) / n); s += `<circle cx="${x}" cy="115" r="4.5" style="fill:var(--red)"/><text x="${x}" y="182" text-anchor="middle" font-size="11" style="fill:var(--red)">N</text>`; }
    for (let j = 0; j < n; j++) { const x = X(((j + 0.5) * P.L) / n); s += `<text x="${x}" y="${Y(A) - 8}" text-anchor="middle" font-size="11" style="fill:var(--c-P)">A</text>`; }
    if (n >= 1) { const x0 = X(0), x1 = X(P.L / n); s += `<line x1="${x0}" x2="${x1}" y1="198" y2="198" style="stroke:var(--c-C)" stroke-width="1.5"/><line x1="${x0}" x2="${x0}" y1="193" y2="203" style="stroke:var(--c-C)"/><line x1="${x1}" x2="${x1}" y1="193" y2="203" style="stroke:var(--c-C)"/><text x="${(x0 + x1) / 2}" y="214" text-anchor="middle" font-size="11" style="fill:var(--c-C)">λ/2</text>`; }
    s += `<text x="342" y="226" text-anchor="end" font-size="10" style="fill:var(--mute)">L = ${f(P.L, 2)} m　N 節點　A 腹點</text>`;
    svg.innerHTML = s;
    const lam = (2 * P.L) / n, fn = (n * P.v) / (2 * P.L);
    $('[data-f=lam]').textContent = `2 × ${f(P.L, 2)} / ${n} = ${f(lam, 3)} m`;
    $('[data-f=fn]').textContent = `${f(fn, 1)} Hz`;
    $('[data-f=nod]').textContent = `${n + 1}／${n}`;
    $('[data-f=f1]').textContent = `${f(P.v / (2 * P.L), 1)} Hz（fₙ = ${n} f₁）`;
    $('[data-o=n]').textContent = `${n}`;
    $('[data-o=L]').textContent = `${f(P.L, 2)} m`;
    $('[data-o=v]').textContent = `${f(P.v, 0)} m/s`;
  }
  const draw = () => (P.mode === 'pulse' ? drawPulse() : drawStanding());
  const btns = el.querySelectorAll('[data-b=play]');
  let playing = false, raf = 0, last = 0, hold = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    if (P.mode === 'pulse') {
      if (P.t >= 6) { hold += dt; if (hold > 0.6) { hold = 0; P.t = 0; } } else P.t = Math.min(6, P.t + dt * 0.8);
      inp.t.value = P.t;
    } else P.ph += dt * 2 * Math.PI * (0.35 + 0.08 * P.n);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btns.forEach((b) => { b.textContent = on ? '暫停' : '播放'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  function setMode(m) {
    P.mode = m;
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false'));
    el.querySelectorAll('[data-g]').forEach((g) => (g.style.display = g.dataset.g === m ? 'grid' : 'none'));
    $('[data-h]').textContent = m === 'pulse' ? '拖動時間 t 或按播放，看兩個脈波相遇時位移如何相加、分開後是否恢復原狀。' : '選擇諧音數 n，調整弦長 L 與波速 v，看節點、腹點與頻率的關係。';
    svg.setAttribute('aria-label', m === 'pulse' ? '兩脈波相遇的疊加' : '兩端固定弦的駐波');
    if (m === 'standing') { P.ph = 0.3; play(!RM); } else play(false);
    draw();
  }
  btns.forEach((b) => b.addEventListener('click', () => { if (!playing && P.mode === 'pulse' && P.t >= 6) P.t = 0; play(!playing); }));
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));
  el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
    P.sign = +b.dataset.s;
    el.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    draw();
  }));
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => {
    P[k] = parseFloat(inp[k].value);
    if (k === 't') play(false);
    draw();
  }));
  setMode(P.mode);
};

/* titration */
(window.SIMS = window.SIMS || {}).titration = function (el, opt) {
  const KW = 1e-14, KA = 1.8e-5, C = 0.100, VA = 25.0;
  const MODES = {
    sa: { t: '強酸＋強鹼', flask: 'HCl', tit: 'NaOH', s: '0.100 M NaOH 滴定 25.0 mL 0.100 M HCl' },
    sb: { t: '強鹼＋強酸', flask: 'NaOH', tit: 'HCl', s: '0.100 M HCl 滴定 25.0 mL 0.100 M NaOH' },
    wa: { t: '弱酸（醋酸）＋強鹼', flask: 'CH₃COOH', tit: 'NaOH', s: '0.100 M NaOH 滴定 25.0 mL 0.100 M 醋酸（Ka＝1.8×10⁻⁵）' },
  };
  const IND = {
    php: { n: '酚酞', lo: 8.2, hi: 10.0, a: 'var(--card)', b: 'var(--red)', cn: ['無色', '淡粉紅', '粉紅'] },
    btb: { n: '溴瑞香草酚藍', lo: 6.0, hi: 7.6, a: 'var(--sun)', m: 'var(--green)', b: 'var(--c-P)', cn: ['黃', '綠', '藍'] },
    mo: { n: '甲基橙', lo: 3.1, hi: 4.4, a: 'var(--red)', m: 'var(--c-C)', b: 'var(--sun)', cn: ['紅', '橙', '黃'] },
  };
  const st = { m: MODES[opt.mode] ? opt.mode : 'sa', ind: 'php', v: 20.0 };
  const sup = (n) => String(n).split('').map((c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])).join('');
  const sci = (x) => { let e = Math.floor(Math.log10(x)), m = x / 10 ** e; if (m >= 9.995) { m /= 10; e++; } return m.toFixed(2) + '×10' + sup(e) + ' M'; };
  function pH(m, v) {
    const V = VA + v;
    if (m === 'wa') {
      const na = (C * v) / V, ca = (C * VA) / V;
      let lo = -14, hi = 0;
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2, h = 10 ** mid; const g = na + h - KW / h - (ca * KA) / (KA + h); if (g > 0) hi = mid; else lo = mid; }
      return -(lo + hi) / 2;
    }
    const acid = m === 'sa' ? (C * VA) / V : (C * v) / V, base = m === 'sa' ? (C * v) / V : (C * VA) / V, D = acid - base;
    return -Math.log10((D + Math.sqrt(D * D + 4 * KW)) / 2);
  }
  el.innerHTML = `<div class="sim-head"><b>酸鹼滴定曲線</b><span>拖動滑桿（或逐滴加入）滴定液，看 pH 曲線、當量點附近的陡升與錐形瓶中指示劑的顏色。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="滴定裝置與滴定曲線"></svg></div>
  <div class="sim-ctl">
    <div class="ops">${Object.keys(MODES).map((k) => `<button type="button" data-m="${k}">${MODES[k].t}</button>`).join('')}</div>
    <div class="ops">${Object.keys(IND).map((k) => `<button type="button" data-i="${k}">${IND[k].n}</button>`).join('')}</div>
    <label class="sl"><span>滴入體積</span><input type="range" min="0" max="50" step="0.05"><output></output></label>
    <div class="ops"><button type="button" data-d="-1">−1 mL</button><button type="button" data-d="-0.05">−1 滴</button><button type="button" data-d="0.05">+1 滴（0.05 mL）</button><button type="button" data-d="1">+1 mL</button></div>
    <div class="facts">
      <div class="fact"><span>錐形瓶 pH</span><b data-f="ph"></b></div><div class="fact"><span>指示劑顏色</span><b data-f="col"></b></div>
      <div class="fact"><span data-f="l1"></span><b data-f="n1"></b></div><div class="fact"><span data-f="l2"></span><b data-f="n2"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>反應進度</span><b data-f="stt" style="font-size:.9rem"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), rng = el.querySelector('input[type=range]'), f = (k) => el.querySelector(`[data-f="${k}"]`);
  const GX = 150, GY = 24, GW = 256, GH = 232, px = (v) => GX + (v / 50) * GW, py = (p) => GY + GH - (p / 14) * GH;
  const col = (I, p) => {
    if (p <= I.lo) return [I.a, null, 0, I.cn[0]]; if (p >= I.hi) return [I.b, null, 0, I.cn[2]];
    const u = (p - I.lo) / (I.hi - I.lo);
    if (!I.m) return [I.a, I.b, u, I.cn[1]];
    return u < 0.5 ? [I.a, I.m, u * 2, I.cn[1]] : [I.m, I.b, (u - 0.5) * 2, I.cn[1]];
  };
  function draw() {
    const M = MODES[st.m], I = IND[st.ind], p = pH(st.m, st.v), eqp = pH(st.m, 25);
    let s = '';
    // indicator band and axes
    s += `<rect x="${GX}" y="${GY}" width="${GW}" height="${GH}" fill="var(--card)" stroke="var(--line)"/>`;
    s += `<rect x="${GX}" y="${py(I.hi)}" width="${GW}" height="${py(I.lo) - py(I.hi)}" fill="${I.m || I.b}" opacity=".18"/><text x="${GX + GW - 4}" y="${py(I.hi) - 3}" font-size="10" text-anchor="end" fill="var(--ink-2)">${I.n} 變色範圍 ${I.lo.toFixed(1)}–${I.hi.toFixed(1)}</text>`;
    for (let q = 0; q <= 14; q += 2) s += `<line x1="${GX}" x2="${GX + GW}" y1="${py(q)}" y2="${py(q)}" stroke="var(--line)" stroke-width=".6"/><text x="${GX - 4}" y="${py(q) + 4}" font-size="10" text-anchor="end" fill="var(--mute)">${q}</text>`;
    for (let v = 0; v <= 50; v += 10) s += `<text x="${px(v)}" y="${GY + GH + 13}" font-size="10" text-anchor="middle" fill="var(--mute)">${v}</text>`;
    s += `<text x="${GX + GW}" y="${GY + GH + 27}" font-size="11" text-anchor="end" fill="var(--ink-2)">加入 0.100 M ${M.tit} 體積（mL）</text><text x="${GX - 4}" y="${GY - 4}" font-size="11" text-anchor="end" fill="var(--ink-2)">pH</text>`;
    s += `<line x1="${px(25)}" x2="${px(25)}" y1="${GY}" y2="${GY + GH}" stroke="var(--mute)" stroke-dasharray="4 3"/><circle cx="${px(25)}" cy="${py(eqp)}" r="4" fill="none" stroke="var(--ink)" stroke-width="1.5"/><text x="${px(25) + 5}" y="${py(eqp) + (st.m === 'sb' ? -6 : 14)}" font-size="10" fill="var(--ink)">當量點 25.0 mL，pH ${eqp.toFixed(2)}</text>`;
    let d = ''; for (let v = 0; v <= st.v + 1e-9; v += 0.1) d += (v ? 'L' : 'M') + px(v).toFixed(1) + ' ' + py(pH(st.m, v)).toFixed(1);
    if (st.v > 0) d += 'L' + px(st.v).toFixed(1) + ' ' + py(p).toFixed(1);
    s += `<path d="${d}" fill="none" stroke="var(--red)" stroke-width="2.5"/><circle cx="${px(st.v)}" cy="${py(p)}" r="5" fill="var(--red)" stroke="var(--card)" stroke-width="1.5"/>`;
    // burette and flask
    const lv = 18 + (st.v / 50) * 120;
    s += `<rect x="50" y="10" width="16" height="140" fill="var(--card)" stroke="var(--ink-2)"/><rect x="51" y="${lv}" width="14" height="${148 - lv}" fill="var(--c-P)" opacity=".18"/>`;
    for (let v = 0; v <= 50; v += 10) s += `<line x1="50" x2="56" y1="${18 + (v / 50) * 120}" y2="${18 + (v / 50) * 120}" stroke="var(--ink-2)"/><text x="46" y="${22 + (v / 50) * 120}" font-size="8" text-anchor="end" fill="var(--mute)">${v}</text>`;
    s += `<path d="M54 150 h8 l-2 14 h-4 z" fill="var(--ink-2)"/><text x="72" y="40" font-size="10" fill="var(--ink-2)">${M.tit}</text>`;
    const [c1, c2, u, cn] = col(I, p);
    const flask = 'M44 196 V176 H72 V196 L104 262 Q106 268 100 268 H16 Q10 268 12 262 Z';
    s += `<path d="M30 226 H86 L104 262 Q106 268 100 268 H16 Q10 268 12 262 Z" fill="${c1}"/>`;
    if (c2) s += `<path d="M30 226 H86 L104 262 Q106 268 100 268 H16 Q10 268 12 262 Z" fill="${c2}" fill-opacity="${u.toFixed(2)}"/>`;
    s += `<line x1="30" x2="86" y1="226" y2="226" stroke="var(--c-P)" stroke-width="1.5" opacity=".6"/>`;
    s += `<path d="${flask}" fill="none" stroke="var(--ink-2)" stroke-width="2"/><text x="58" y="286" font-size="10" text-anchor="middle" fill="var(--ink-2)">${M.flask} 25.0 mL</text>`;
    svg.innerHTML = s;
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.m)));
    el.querySelectorAll('[data-i]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.i === st.ind)));
    rng.value = st.v; rng.nextElementSibling.textContent = st.v.toFixed(2) + ' mL';
    const n0 = C * VA / 1000, nt = (C * st.v) / 1000, mm = (x) => (x * 1000).toFixed(3) + ' mmol';
    f('ph').textContent = p.toFixed(2);
    f('col').textContent = `${I.n}：${cn}`;
    const acidFlask = st.m !== 'sb';
    f('l1').textContent = st.m === 'wa' ? '醋酸 HA 原有' : acidFlask ? 'H⁺ 原有（HCl）' : 'OH⁻ 原有（NaOH）';
    f('l2').textContent = acidFlask ? 'OH⁻ 加入（NaOH）' : 'H⁺ 加入（HCl）';
    f('n1').textContent = mm(n0); f('n2').textContent = mm(nt);
    const diff = n0 - nt, V = VA + st.v;
    f('stt').textContent = Math.abs(diff) < 1e-9 ? '當量點：恰好完全中和' : diff > 0
      ? (st.m === 'wa' ? `當量點前：剩 HA ${mm(diff)}，生成 A⁻ ${mm(nt)}` : `當量點前：剩 ${acidFlask ? 'H⁺' : 'OH⁻'} ${mm(diff)}，濃度 ${sci(diff / (V / 1000))}`)
      : `當量點後：${acidFlask ? 'OH⁻' : 'H⁺'} 過量 ${mm(-diff)}，濃度 ${sci(-diff / (V / 1000))}`;
    const lo = pH(st.m, 24.5), hi = pH(st.m, 25.5), a = Math.min(lo, hi), b = Math.max(lo, hi);
    const ok = I.lo >= a - 0.05 && I.hi <= b + 0.05;
    f('note').textContent = `${M.s}。24.5→25.5 mL 間 pH 由 ${lo.toFixed(1)} 變到 ${hi.toFixed(1)}；${I.n}（${I.lo.toFixed(1)}–${I.hi.toFixed(1)}）${ok ? '落在陡升段內，可用' : '不在陡升段內，不適用'}。` + (st.m === 'wa' ? `半當量點（12.5 mL）pH ≈ pKa = ${pH('wa', 12.5).toFixed(2)}；當量點溶液為 CH₃COONa，pH > 7。` : '強酸強鹼的當量點 pH = 7.00。');
  }
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; st.ind = st.m === 'wa' ? 'php' : st.ind; draw(); }));
  el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { st.ind = b.dataset.i; draw(); }));
  rng.addEventListener('input', () => { st.v = Number(rng.value); draw(); });
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { st.v = Math.min(50, Math.max(0, Math.round((st.v + Number(b.dataset.d)) * 100) / 100)); draw(); }));
  draw();
};

/* wave */
(window.SIMS = window.SIMS || {}).wave = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>繩波的振幅、波長與頻率</b><span>拖動 A、λ、f，看波形如何前進，以及紅色質點如何只上下振動。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 290" role="img" aria-label="繩上行進橫波與質點振動圖"></svg></div>
<div class="sim-ctl">
${sl('A', 'A', 1, 10, 0.5, 5)}${sl('L', 'λ', 0.4, 2, 0.1, 1.2)}${sl('f', 'f', 0.5, 3, 0.1, 1)}
<div class="ops"><button type="button" data-b="play">播放</button></div>
<div class="facts">${fact('v', '波速 v = fλ')}${fact('T', '週期 T = 1/f')}${fact('y', '紅色質點此刻位移 y')}${fact('E', '振幅 A（能量 ∝ A²）')}</div>
<p class="sim-note">波形（波峰▼）以波速 v 向右移動，每經一個週期 T 前進一個波長；質點只在原位置上下振動，不隨波前進。f 改變時 λ 不變，v 跟著變──真實同一條繩上 v 固定，f 加倍則 λ 減半。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { A: 5, L: 1.2, f: 1, t: 0, t0: 0 };
  const XP = 1.0, W = 4, WIN = 3; // marked particle at 1.0 m; rope 4 m; y–t window 3 s
  const yAt = (x, t) => P.A * Math.sin(2 * Math.PI * (x / P.L - P.f * t));
  const SX = (x) => 20 + x * 80, SY = (y) => 86 - y * 5;
  function draw() {
    const t = P.t, v = P.f * P.L;
    let s = '';
    s += `<line x1="20" x2="340" y1="86" y2="86" style="stroke:var(--line)" stroke-dasharray="3 3"/>`;
    for (let k = 0; k <= W; k++) s += `<text x="${SX(k)}" y="152" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="340" y="164" text-anchor="end" font-size="10" style="fill:var(--mute)">x (m)　位移縱向放大</text>`;
    let d = '';
    for (let i = 0; i <= 200; i++) { const x = (i / 200) * W; d += (i ? 'L' : 'M') + SX(x).toFixed(1) + ' ' + SY(yAt(x, t)).toFixed(1); }
    s += `<path d="${d}" fill="none" style="stroke:var(--teal)" stroke-width="2.5"/>`;
    for (let x = 0.2; x < W; x += 0.2) s += `<circle cx="${SX(x).toFixed(1)}" cy="${SY(yAt(x, t)).toFixed(1)}" r="2.2" style="fill:var(--ink-2)"/>`;
    // crest marker moving at v
    const N = Math.max(1, Math.floor(W / P.L));
    const xc = (((P.L / 4 + v * t) % (N * P.L)) + N * P.L) % (N * P.L);
    s += `<path d="M${SX(xc)} ${SY(P.A) - 6} l-6 -9 h12z" style="fill:var(--c-C)"/>`;
    const xa = xc + P.L <= W ? xc : xc - P.L;
    if (xa >= 0) s += `<line x1="${SX(xa)}" x2="${SX(xa + P.L)}" y1="${SY(-P.A) + 14}" y2="${SY(-P.A) + 14}" style="stroke:var(--c-C)" stroke-width="1.5"/><line x1="${SX(xa)}" x2="${SX(xa)}" y1="${SY(-P.A) + 9}" y2="${SY(-P.A) + 19}" style="stroke:var(--c-C)"/><line x1="${SX(xa + P.L)}" x2="${SX(xa + P.L)}" y1="${SY(-P.A) + 9}" y2="${SY(-P.A) + 19}" style="stroke:var(--c-C)"/><text x="${SX(xa + P.L / 2)}" y="${SY(-P.A) + 28}" text-anchor="middle" font-size="11" style="fill:var(--c-C)">λ = ${f(P.L, 1)} m</text>`;
    // marked particle
    const yp = yAt(XP, t);
    s += `<line x1="${SX(XP)}" x2="${SX(XP)}" y1="${SY(P.A)}" y2="${SY(-P.A)}" style="stroke:var(--red)" stroke-width="1" stroke-dasharray="2 2"/>`;
    s += `<circle cx="${SX(XP)}" cy="${SY(yp)}" r="5.5" style="fill:var(--red);stroke:#fff" stroke-width="1.5"/>`;
    s += `<text x="20" y="18" font-size="11" style="fill:var(--ink-2)">波向右傳播 →　v = ${f(v, 2)} m/s</text>`;
    // y–t graph of the red particle (extends to the right)
    const GX = (tt) => 46 + ((tt - P.t0) / WIN) * 300, GY = (y) => 232 - y * 4.5;
    s += `<rect x="46" y="182" width="300" height="100" style="fill:var(--card);stroke:var(--line)"/><line x1="46" x2="346" y1="232" y2="232" style="stroke:var(--line)"/>`;
    s += `<text x="46" y="176" font-size="10" style="fill:var(--red)">紅色質點的振動圖（y–t 圖）</text><text x="346" y="176" text-anchor="end" font-size="10" style="fill:var(--mute)">橫軸 ${WIN} s</text>`;
    s += `<text x="42" y="${GY(P.A) + 4}" text-anchor="end" font-size="10" style="fill:var(--mute)">${f(P.A, 1)}</text><text x="42" y="${GY(-P.A) + 4}" text-anchor="end" font-size="10" style="fill:var(--mute)">${f(-P.A, 1)}</text><text x="4" y="236" font-size="10" style="fill:var(--mute)">y(cm)</text>`;
    d = '';
    const n = 160;
    for (let i = 0; i <= n; i++) { const tt = P.t0 + ((t - P.t0) * i) / n; d += (i ? 'L' : 'M') + GX(tt).toFixed(1) + ' ' + GY(yAt(XP, tt)).toFixed(1); }
    s += `<path d="${d}" fill="none" style="stroke:var(--red)" stroke-width="2"/>`;
    const T = 1 / P.f;
    if (T <= WIN) s += `<line x1="${GX(P.t0)}" x2="${GX(P.t0 + T)}" y1="276" y2="276" style="stroke:var(--c-X)" stroke-width="1.5"/><text x="${GX(P.t0 + T / 2)}" y="272" text-anchor="middle" font-size="10" style="fill:var(--c-X)">T</text>`;
    svg.innerHTML = s;
    $('[data-f=v]').textContent = `${f(P.f, 1)} × ${f(P.L, 1)} = ${f(v, 2)} m/s`;
    $('[data-f=T]').textContent = `${f(T, 2)} s`;
    $('[data-f=y]').textContent = `${f(yp, 1)} cm`;
    $('[data-f=E]').textContent = `${f(P.A, 1)} cm`;
    $('[data-o=A]').textContent = `${f(P.A, 1)} cm`;
    $('[data-o=L]').textContent = `${f(P.L, 1)} m`;
    $('[data-o=f]').textContent = `${f(P.f, 1)} Hz`;
  }
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    P.t += dt;
    if (P.t - P.t0 > WIN) P.t0 = P.t;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => play(!playing));
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => {
    P[k] = parseFloat(inp[k].value);
    P.t0 = RM ? 0 : P.t; if (RM) P.t = WIN * 0.8;
    draw();
  }));
  P.t = RM ? WIN * 0.8 : 0;
  draw();
  play(!RM);
};
