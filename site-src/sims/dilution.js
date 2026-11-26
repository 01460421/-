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
