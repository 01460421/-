(window.SIMS = window.SIMS || {}).lapse = function (el, opt) {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { T: 25, Td: 21, H: 3.0, gm: 6, u: 0.5, play: !reduce };
  const S = (t) => 216.7 * 6.112 * Math.exp(17.67 * t / (t + 243.5)) / (t + 273.15); // 飽和水氣量 g/m³
  const f1 = (v) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1).replace('-', '−');
  el.innerHTML = `<div class="sim-head"><b>空氣塊越山與焚風</b><span>調整地面氣溫、露點與山高，看雲底高度、山頂與背風側的溫度。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 262" role="img" aria-label="空氣塊越過山脈的剖面"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>地面氣溫 T</span><input type="range" data-k="T" min="10" max="35" step="0.5"><output></output></label>
    <label class="sl"><span>露點 T<sub>d</sub></span><input type="range" data-k="Td" min="0" max="35" step="0.5"><output></output></label>
    <label class="sl"><span>山高 H</span><input type="range" data-k="H" min="0.5" max="4" step="0.1"><output></output></label>
    <div class="ops"><span style="font-size:.86rem;color:var(--ink-2);align-self:center">濕絕熱遞減率</span><button type="button" data-g="5">5 °C/km</button><button type="button" data-g="6">6 °C/km</button><button type="button" data-p></button></div>
    <div class="facts"></div>
    <p class="sim-note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note'), pb = el.querySelector('[data-p]');
  const inputs = [...el.querySelectorAll('input[type=range]')];
  const X0 = 40, XP = 215, X1 = 390, Y = (z) => 234 - z * 46;
  const zAt = (x) => { const u = Math.min(1, Math.abs(x - XP) / (XP - X0)); return st.H * Math.pow((Math.cos(Math.PI * u) + 1) / 2, 1.2); };
  function model() {
    const lcl = (st.T - st.Td) / 8, cloud = lcl < st.H; // km；乾 10、露點 2 °C/km
    const Tb = st.T - 10 * Math.min(lcl, st.H);
    const Ts = cloud ? Tb - st.gm * (st.H - lcl) : st.T - 10 * st.H, Tds = cloud ? Ts : st.Td - 2 * st.H;
    return { lcl, cloud, Tb, Ts, Tds, TL: Ts + 10 * st.H, TdL: Tds + 2 * st.H };
  }
  const parcel = (m, x) => { // 空氣塊在 x 處的溫度
    const z = zAt(x);
    if (x <= XP) return z <= m.lcl ? st.T - 10 * z : m.Tb - st.gm * (z - m.lcl);
    return m.Ts + 10 * (st.H - z);
  };
  const lab = (x, y, s, c = 'var(--ink)', a = 'middle') => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="15" fill="${c}" stroke="var(--card)" stroke-width="3" paint-order="stroke">${s}</text>`;
  function draw() {
    const m = model();
    let s = `<rect x="0" y="0" width="420" height="262" fill="var(--card)"/>`;
    for (let z = 0; z <= 4; z++) s += `<line x1="30" y1="${Y(z)}" x2="420" y2="${Y(z)}" stroke="var(--line)"/><text x="26" y="${Y(z) + 4}" font-size="11" text-anchor="end" fill="var(--ink-2)">${z}</text>`;
    s += `<text x="4" y="14" font-size="11" fill="var(--ink-2)">高度 km</text>`;
    const pts = []; for (let x = X0 - 10; x <= X1 + 10; x += 5) pts.push([x, Y(zAt(x))]);
    if (m.cloud) {
      s += `<line x1="30" y1="${Y(m.lcl)}" x2="${XP}" y2="${Y(m.lcl)}" stroke="var(--c-P)" stroke-dasharray="5 4"/>`;
      let xa = X0; while (xa < XP && zAt(xa) < m.lcl) xa += 2;
      for (let x = Math.max(X0, xa - 34); x < xa - 2; x += 8) s += `<line x1="${x}" y1="${Y(m.lcl) + 3}" x2="${x - 3}" y2="${Y(zAt(x)) - 1}" stroke="var(--c-P)" stroke-width="1.5"/>`;
      const cl = []; for (let x = xa - 40; x <= XP + 8; x += 11) { const r = 12 + 3 * Math.sin(x); cl.push([x, Y(Math.max(zAt(x), m.lcl)) - r * 0.7, r]); }
      s += cl.map((c) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${c[2].toFixed(1)}" fill="var(--card)" stroke="var(--mute)"/>`).join('') + cl.map((c) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(c[2] - 1.2).toFixed(1)}" fill="var(--card)"/>`).join('');
    }
    const mtn = `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}L${X1 + 10} 262L${X0 - 10} 262Z`;
    s += `<path d="${mtn}" fill="var(--card)"/>`;
    s += `<path d="M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}L${X1 + 10} 262L${X0 - 10} 262Z" fill="var(--c-B)" fill-opacity=".35" stroke="var(--c-B)" stroke-width="1.5"/>`;
    s += `<path d="M${pts.map((p) => p[0].toFixed(1) + ' ' + (p[1] - 7).toFixed(1)).join('L')}" fill="none" stroke="var(--c-C)" stroke-width="1.5" stroke-dasharray="2 4"/>`;
    s += lab(70, 20, '風向 →', 'var(--teal-2)');
    s += lab(X0, 252, `${f1(st.T)} °C（露點 ${f1(st.Td)}）`, 'var(--ink)', 'start');
    s += lab(X1 + 12, 252, `${f1(m.TL)} °C（露點 ${f1(m.TdL)}）`, 'var(--red)', 'end');
    s += lab(XP, Y(st.H) - (m.cloud ? 26 : 12), `山頂 ${f1(m.Ts)} °C`);
    if (m.cloud) s += lab(34, Y(m.lcl) + (m.lcl > 0.45 ? 17 : -8), `雲底 ${f1(m.Tb)} °C`, 'var(--c-P)', 'start');
    const xp = X0 + st.u * (X1 - X0), tp = parcel(m, xp), yp = Y(zAt(xp)) - 7;
    s += `<circle cx="${xp}" cy="${yp}" r="7" fill="${tp > st.T + 0.05 ? 'var(--red)' : 'var(--c-C)'}" stroke="var(--card)" stroke-width="2"/>`;
    s += lab(Math.min(Math.max(xp, 50), 370), yp - 13, `${f1(tp)} °C`, 'var(--c-C)');
    svg.innerHTML = s;
    const fact = (k, v, full) => `<div class="fact"${full ? ' style="grid-column:1/-1"' : ''}><span>${k}</span><b>${v}</b></div>`;
    const rh0 = S(st.Td) / S(st.T) * 100, rhL = S(m.TdL) / S(m.TL) * 100;
    facts.innerHTML = fact('抬升凝結高度 h = 125 (T − T<sub>d</sub>)', `125 × ${f1(st.T - st.Td)} = ${Math.round(m.lcl * 1000)} m${m.cloud ? '' : '（高於山頂，不成雲）'}`, 1) +
      (m.cloud ? fact('雲底溫度 T − 10h', `${f1(m.Tb)} °C`) + fact(`山頂（濕絕熱 ${st.gm} °C/km）`, `${f1(m.Tb)} − ${st.gm} × ${f1(st.H - m.lcl)} = ${f1(m.Ts)} °C`)
        : fact('山頂（乾絕熱 10 °C/km）', `${f1(st.T)} − 10 × ${f1(st.H)} = ${f1(m.Ts)} °C`, 1)) +
      fact('背風山腳（乾絕熱下沉）', `${f1(m.Ts)} + 10 × ${f1(st.H)} = ${f1(m.TL)} °C`, 1) +
      fact('焚風淨增溫', `${m.TL - st.T > 0.05 ? '+' : ''}${f1(m.TL - st.T)} °C`) + fact('相對濕度 迎風 → 背風', `${Math.round(rh0)}% → ${Math.round(rhL)}%`);
    note.textContent = m.cloud ? `焚風的熱來自迎風坡凝結釋放的潛熱：雲底以上每公里只降 ${st.gm} °C，水分降落後下沉時每公里升 10 °C，所以背風側又熱又乾。` : '空氣塊未達抬升凝結高度就越過山頂：上升、下沉都以乾絕熱 10 °C/km 變化，回到山腳溫度不變——沒有成雲降水，就沒有淨增溫。';
  }
  function sync() {
    if (st.Td > st.T) st.Td = st.T;
    inputs.forEach((i) => { const k = i.dataset.k; i.value = st[k]; i.nextElementSibling.textContent = k === 'H' ? `${st.H.toFixed(1)} km` : `${f1(st[k])} °C`; });
    el.querySelectorAll('[data-g]').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.g) === st.gm));
    pb.textContent = st.play ? '❚❚ 暫停' : '▶ 播放空氣塊'; pb.setAttribute('aria-pressed', st.play);
    draw();
  }
  let run = 0;
  function start() {
    const id = ++run; let last = 0;
    const tick = (ts) => {
      if (!el.isConnected || !st.play || id !== run) return;
      if (last) st.u = (st.u + Math.min(ts - last, 100) / 9000) % 1;
      last = ts; draw(); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  inputs.forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); if (i.dataset.k === 'T' && st.Td > st.T) st.Td = st.T; sync(); }));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.g) st.gm = Number(b.dataset.g);
    if (b.hasAttribute('data-p')) { st.play = !st.play; if (st.play) start(); }
    sync();
  });
  sync();
  if (st.play) start();
};
