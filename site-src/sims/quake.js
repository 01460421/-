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
