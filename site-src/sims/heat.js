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
