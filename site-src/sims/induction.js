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
