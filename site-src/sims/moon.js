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
