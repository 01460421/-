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
