(window.SIMS = window.SIMS || {}).humidity = function (el, opt) {
  const SM = (t) => 216.7 * 6.112 * Math.exp(17.67 * t / (t + 243.5)) / (t + 273.15);
  const TAB = [4.8, 5.2, 5.6, 5.9, 6.4, 6.8, 7.3, 7.7, 8.3, 8.8, 9.4, 10.0, 10.7, 11.3, 12.1, 12.8, 13.6, 14.5, 15.4, 16.3, 17.3, 18.3, 19.4, 20.6, 21.8, 23.0, 24.4, 25.7, 27.2, 28.7, 30.3, 32.0, 33.8, 35.6, 37.6, 39.6];
  const S = (t) => { // 飽和水氣量 g/m³：0–35 °C 用講義表格內插，35–40 °C 以公式接到 40 °C 的 51.1
    if (t < 0) return SM(t) * 4.8 / SM(0);
    if (t <= 35) { const i = Math.min(34, Math.floor(t)); return TAB[i] + (TAB[i + 1] - TAB[i]) * (t - i); }
    const f = (t - 35) / 5; return SM(t) * ((1 - f) * 39.6 / SM(35) + f * 51.1 / SM(40));
  };
  const dew = (w) => { let a = -40, b = 60; for (let i = 0; i < 50; i++) { const c = (a + b) / 2; if (S(c) < w) a = c; else b = c; } return (a + b) / 2; };
  const PRE = [['圖 E7-4 的 A 點', 30, 17.3], ['寒流清晨 8 °C、RH 95%', 8, 0.95 * S(8)], ['夏季午後 33 °C、RH 50%', 33, 0.5 * S(33)]];
  const st = { T: 30, w: 17.3, Tc: 15 };
  const f1 = (v) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1).replace('-', '−');
  el.innerHTML = `<div class="sim-head"><b>飽和水氣量、相對濕度與露點</b><span>拖動圖上的空氣狀態點（或滑桿），再把空氣冷卻，看相對濕度、露點與凝結量。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 285" role="img" aria-label="飽和水氣量曲線" style="cursor:crosshair"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>氣溫 T</span><input type="range" data-k="T" min="0" max="40" step="0.5"><output></output></label>
    <label class="sl"><span>水氣量</span><input type="range" data-k="w" min="0.5" max="52" step="0.1"><output></output></label>
    <label class="sl"><span>冷卻至 T′</span><input type="range" data-k="Tc" min="0" max="40" step="0.5"><output></output></label>
    <div class="ops">${PRE.map((p, i) => `<button type="button" data-v="${i}">${p[0]}</button>`).join('')}</div>
    <div class="facts"></div>
    <p class="sim-note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note');
  const inputs = [...el.querySelectorAll('input[type=range]')];
  const X = (t) => 50 + t * 9, Y = (w) => 248 - w * 4.2, T_ = (x) => (x - 50) / 9, W_ = (y) => (248 - y) / 4.2;
  const curve = (a, b) => { const p = []; for (let t = a; t <= b + 1e-9; t += 0.5) p.push(`${X(t).toFixed(1)} ${Y(S(t)).toFixed(1)}`); return p; };
  const lab = (x, y, s, c, a = 'start', fs = 14) => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="${fs}" fill="${c}" stroke="var(--card)" stroke-width="3" paint-order="stroke">${s}</text>`;
  function draw() {
    const { T, w, Tc } = st, sT = S(T), Td = dew(w), rh = w / sT * 100, sat = w > sT;
    let s = `<rect x="${X(0)}" y="${Y(52)}" width="${X(40) - X(0)}" height="${Y(0) - Y(52)}" fill="var(--card)"/>`;
    const c = curve(0, 40);
    s += `<path d="M${X(0)} ${Y(0)}L${c.join('L')}L${X(40)} ${Y(0)}Z" fill="var(--teal)" fill-opacity=".1"/>`;
    s += `<path d="M${X(0)} ${Y(52)}L${curve(0, 39.5).filter((p) => Number(p.split(' ')[1]) >= Y(52)).join('L')}L${X(40)} ${Y(52)}Z" fill="var(--red)" fill-opacity=".08"/>`;
    for (let t = 0; t <= 40; t += 5) s += `<line x1="${X(t)}" y1="${Y(0)}" x2="${X(t)}" y2="${Y(52)}" stroke="var(--line)"/><text x="${X(t)}" y="${Y(0) + 16}" text-anchor="middle" font-size="13" fill="var(--ink-2)">${t}</text>`;
    for (let v = 0; v <= 50; v += 10) s += `<line x1="${X(0)}" y1="${Y(v)}" x2="${X(40)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${X(0) - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="13" fill="var(--ink-2)">${v}</text>`;
    s += `<text x="${X(20)}" y="281" text-anchor="middle" font-size="13" fill="var(--ink-2)">氣溫（°C）</text><text x="14" y="${Y(26)}" text-anchor="middle" font-size="13" fill="var(--ink-2)" transform="rotate(-90 14 ${Y(26)})">水氣量（g/m³）</text>`;
    s += `<path d="M${c.join('L')}" fill="none" stroke="var(--teal)" stroke-width="2.5"/>`;
    s += lab(X(3), Y(44), '過飽和區（多餘水氣凝結）', 'var(--red)', 'start', 14) + lab(X(39), Y(3), '未飽和區', 'var(--teal-2)', 'end', 14) + lab(X(33), Y(S(33)) + 4, '飽和曲線', 'var(--teal-2)', 'start', 13);
    // 冷卻路徑
    const B = Tc >= Td ? [Tc, w] : [Tc, S(Tc)];
    if (Math.abs(Tc - T) > 0.01) {
      if (Tc >= Td || sat) s += `<line x1="${X(T)}" y1="${Y(w)}" x2="${X(Math.max(Tc, sat ? T : Td))}" y2="${Y(w)}" stroke="var(--c-P)" stroke-width="2.5"/>`;
      else s += `<line x1="${X(T)}" y1="${Y(w)}" x2="${X(Td)}" y2="${Y(w)}" stroke="var(--c-P)" stroke-width="2.5"/><path d="M${curve(Math.ceil(Tc * 2) / 2, Td).reverse().join('L')}L${X(Tc)} ${Y(S(Tc))}" fill="none" stroke="var(--c-P)" stroke-width="3"/>`;
      if (Tc < Td) s += `<line x1="${X(Tc)}" y1="${Y(w)}" x2="${X(Tc)}" y2="${Y(S(Tc))}" stroke="var(--red)" stroke-width="4"/>` + lab(X(Tc) + 6, (Y(w) + Y(S(Tc))) / 2 + 5, `凝結 ${f1(w - S(Tc))}`, 'var(--red)', 'start', 13);
      s += `<circle cx="${X(B[0])}" cy="${Y(B[1])}" r="5" fill="var(--c-P)"/>` + lab(X(B[0]) - 6, Y(B[1]) + 18, 'B', 'var(--c-P)', 'end');
    }
    if (!sat) s += `<line x1="${X(T)}" y1="${Y(w)}" x2="${X(T)}" y2="${Y(sT)}" stroke="var(--ink-2)" stroke-dasharray="3 3"/><circle cx="${X(T)}" cy="${Y(sT)}" r="3.5" fill="var(--teal)"/>`;
    if (Td >= 0 && Td <= 40) s += `<circle cx="${X(Td)}" cy="${Y(w)}" r="4" fill="var(--card)" stroke="var(--c-P)" stroke-width="2"/><line x1="${X(Td)}" y1="${Y(w)}" x2="${X(Td)}" y2="${Y(0)}" stroke="var(--c-P)" stroke-dasharray="2 3"/>` + lab(X(Td), Y(0) - 6, `露點 ${f1(Td)}`, 'var(--c-P)', 'middle', 13);
    s += `<circle cx="${X(T)}" cy="${Y(w)}" r="9" fill="var(--c-C)" stroke="var(--card)" stroke-width="2.5" style="cursor:grab"/>` + lab(X(T) + (T > 33 ? -12 : 12), Y(w) - 10, 'A', 'var(--c-C)', T > 33 ? 'end' : 'start', 16);
    svg.innerHTML = s;
    const fact = (k, v, full) => `<div class="fact"${full ? ' style="grid-column:1/-1"' : ''}><span>${k}</span><b>${v}</b></div>`;
    let cool;
    if (Tc >= T - 0.01 && !sat) cool = fact(Tc > T + 0.01 ? `加熱至 ${f1(Tc)} °C（水氣量不變）` : '冷卻至 T′', Tc > T + 0.01 ? `RH = ${f1(w)} ÷ ${f1(S(Tc))} = ${Math.round(w / S(Tc) * 100)}%，露點不變` : '請把 T′ 調得比氣溫低', 1);
    else if (Tc >= Td) cool = fact(`冷卻至 ${f1(Tc)} °C`, `尚未達露點，不凝結；RH = ${f1(w)} ÷ ${f1(S(Tc))} = ${Math.round(w / S(Tc) * 100)}%`, 1);
    else cool = fact(`冷卻至 ${f1(Tc)} °C（低於露點）`, `凝結 = S(T<sub>d</sub>) − S(T′) = ${f1(w)} − ${f1(S(Tc))} = ${f1(w - S(Tc))} g/m³`, 1);
    facts.innerHTML = fact('實際水氣量', `${f1(w)} g/m³`) + fact(`飽和水氣量 S(${f1(T)} °C)`, `${f1(sT)} g/m³`) +
      fact('相對濕度 = 實際 ÷ 飽和 × 100%', `${f1(w)} ÷ ${f1(sT)} = ${Math.round(rh)}%${sat ? '（過飽和）' : ''}`, 1) +
      fact('露點 T<sub>d</sub>（S(T<sub>d</sub>) = 實際水氣量）', `${f1(Td)} °C`) + fact('溫度露點差 T − T<sub>d</sub>', `${f1(T - Td)} °C`) + cool;
    note.textContent = sat ? `A 點在曲線上方（過飽和）：多出的 ${f1(w - sT)} g/m³ 水氣會凝結，直到回到飽和曲線上。`
      : '露點只由水氣量決定：A 點水平向左移到曲線，所對應的溫度就是露點。再降溫時沿曲線下滑，曲線向上彎，所以高溫時同樣降溫凝結得較多。';
  }
  function sync() {
    inputs.forEach((i) => { const k = i.dataset.k; i.value = st[k]; i.nextElementSibling.textContent = k === 'w' ? `${f1(st.w)} g/m³` : `${f1(st[k])} °C`; });
    draw();
  }
  inputs.forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); sync(); }));
  el.querySelector('.ops').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const p = PRE[b.dataset.v]; st.T = p[1]; st.w = Math.round(p[2] * 10) / 10; st.Tc = Math.max(0, Math.round(dew(st.w) * 2) / 2 - 5); sync();
  });
  let down = false;
  const move = (e) => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * 420 / r.width, y = (e.clientY - r.top) * 285 / r.height;
    st.T = Math.round(Math.max(0, Math.min(40, T_(x))) * 2) / 2; st.w = Math.round(Math.max(0.5, Math.min(52, W_(y))) * 10) / 10; sync();
  };
  svg.addEventListener('pointerdown', (e) => { down = true; svg.setPointerCapture(e.pointerId); move(e); });
  svg.addEventListener('pointermove', (e) => { if (down) move(e); });
  svg.addEventListener('pointerup', () => { down = false; });
  sync();
};
