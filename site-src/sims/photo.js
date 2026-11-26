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
