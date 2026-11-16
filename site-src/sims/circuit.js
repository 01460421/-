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
