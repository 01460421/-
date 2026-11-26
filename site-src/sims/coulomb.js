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
