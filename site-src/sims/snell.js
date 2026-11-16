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
