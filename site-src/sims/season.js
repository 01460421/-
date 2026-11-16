(window.SIMS = window.SIMS || {}).season = function (el, opt) {
  const D = Math.PI / 180, EPS = 23.44;
  const KEY = [79, 172, 266, 356];
  const decl = (n) => { // 分段正弦：二分二至日恰為 0、±23.44°
    let d = n < 79 ? n + 365 : n;
    const k = d < 172 ? 0 : d < 266 ? 1 : d < 356 ? 2 : 3, a = KEY[k], b = k < 3 ? KEY[k + 1] : 444, f = (d - a) / (b - a) * Math.PI / 2;
    return EPS * [Math.sin(f), Math.cos(f), -Math.sin(f), -Math.cos(f)][k];
  };
  const ML = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const dateStr = (n) => { let m = 0; while (n > ML[m]) { n -= ML[m]; m++; } return `${m + 1} 月 ${n} 日`; };
  const LATS = [['臺北 25°N', 25.0], ['北回歸線 23.5°N', 23.5], ['赤道 0°', 0], ['北極圈 66.6°N', 66.6]];
  const DAYS = [['春分', 79], ['夏至', 172], ['秋分', 266], ['冬至', 356]];
  const st = { lat: 23.5, day: 172, t: 12 };
  const latStr = (p) => Math.abs(p) < 0.05 ? '0°' : `${Math.abs(p).toFixed(1)}°${p > 0 ? 'N' : 'S'}`;
  el.innerHTML = `<div class="sim-head"><b>太陽的周日路徑與季節</b><span>選擇地點緯度與日期，看太陽在天空的路徑、正午仰角與晝長如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 400 296" role="img" aria-label="地平天球上的太陽路徑"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>緯度 φ</span><input type="range" data-k="lat" min="-90" max="90" step="0.1"><output></output></label>
    <div class="ops" data-g="lat">${LATS.map((p, i) => `<button type="button" data-v="${i}">${p[0]}</button>`).join('')}</div>
    <label class="sl"><span>日期</span><input type="range" data-k="day" min="1" max="365" step="1"><output></output></label>
    <div class="ops" data-g="day">${DAYS.map((p, i) => `<button type="button" data-v="${i}">${p[0]}</button>`).join('')}</div>
    <label class="sl"><span>時刻</span><input type="range" data-k="t" min="0" max="24" step="0.25"><output></output></label>
    <div class="facts"></div>
    <p class="sim-note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note');
  const inputs = [...el.querySelectorAll('input[type=range]')];
  const CX = 200, CY = 212, R = 150, a = -22 * D, e = 20 * D;
  const proj = (x, y, z) => { const xr = x * Math.cos(a) + y * Math.sin(a), yr = -x * Math.sin(a) + y * Math.cos(a); return [CX + R * xr, CY - R * (z * Math.cos(e) + yr * Math.sin(e))]; };
  const sunVec = (phi, dec, H) => { // x 東、y 北、z 天頂；H 為時角（向西為正）
    const cp = Math.cos(phi), sp = Math.sin(phi), cd = Math.cos(dec), sd = Math.sin(dec);
    return [-cd * Math.sin(H), -cd * Math.cos(H) * sp + sd * cp, cd * Math.cos(H) * cp + sd * sp];
  };
  const sg = (v) => (Math.abs(v) < 0.05 ? '0.0' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
  const fmtH = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`; };
  function pathOf(dec, style) {
    let s = '', seg = [], up = null;
    const flush = () => { if (seg.length > 1) s += `<path d="M${seg.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}" fill="none" ${up ? style[0] : style[1]}/>`; };
    for (let h = -180; h <= 180; h += 2) {
      const v = sunVec(st.lat * D, dec * D, h * D), u = v[2] >= 0, p = proj(...v);
      if (up !== null && u !== up) { flush(); seg = [seg[seg.length - 1]]; }
      up = u; seg.push(p);
    }
    flush();
    return s;
  }
  function draw() {
    const phi = st.lat * D, dec = decl(st.day), dr = dec * D;
    let s = `<path d="M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}" fill="var(--card)" stroke="var(--line)"/>`;
    let hz = ''; for (let k = 0; k <= 72; k++) { const p = proj(Math.cos(k * 5 * D), Math.sin(k * 5 * D), 0); hz += (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }
    s += `<path d="${hz}Z" fill="var(--green)" fill-opacity=".14" stroke="var(--green)" stroke-width="1.5"/>`;
    let mer = ''; for (let k = 0; k <= 36; k++) { const p = proj(0, Math.cos(k * 5 * D), Math.sin(k * 5 * D)); mer += (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }
    s += `<path d="${mer}" fill="none" stroke="var(--mute)" stroke-dasharray="3 3"/>`;
    [['北', 0, 1], ['南', 0, -1], ['東', 1, 0], ['西', -1, 0]].forEach(([n, x, y]) => { const p = proj(x * 1.1, y * 1.1, 0); s += `<text x="${p[0]}" y="${p[1] + 5}" text-anchor="middle" font-size="18" font-weight="700" fill="var(--ink)">${n}</text>`; });
    const zp = proj(0, 0, 1); s += `<circle cx="${zp[0]}" cy="${zp[1]}" r="3" fill="var(--ink-2)"/><text x="${zp[0] + 6}" y="${zp[1] - 5}" font-size="15" fill="var(--ink-2)">天頂</text>`;
    const pole = proj(...sunVec(phi, Math.PI / 2, 0));
    s += `<line x1="${CX}" y1="${CY}" x2="${pole[0]}" y2="${pole[1]}" stroke="var(--c-X)" stroke-dasharray="2 3"/><text x="${pole[0] - 6}" y="${pole[1] + (st.lat >= 0 ? 4 : 14)}" text-anchor="end" font-size="14" fill="var(--c-X)">天北極</text>`;
    [EPS, 0, -EPS].forEach((d) => { s += pathOf(d, ['stroke="var(--mute)" stroke-width="1" stroke-opacity=".7"', 'stroke="var(--mute)" stroke-opacity=".25" stroke-dasharray="2 4"']); });
    s += pathOf(dec, ['stroke="var(--c-C)" stroke-width="3"', 'stroke="var(--c-C)" stroke-opacity=".45" stroke-dasharray="5 4" stroke-width="2"']);
    for (let h = -165; h <= 180; h += 15) { const v = sunVec(phi, dr, h * D); if (v[2] > 0) { const p = proj(...v); s += `<circle cx="${p[0]}" cy="${p[1]}" r="2" fill="var(--c-C)"/>`; } }
    const nv = sunVec(phi, dr, 0), np = proj(...nv);
    if (nv[2] > 0) s += `<line x1="${CX}" y1="${CY}" x2="${np[0]}" y2="${np[1]}" stroke="var(--c-C)" stroke-width="1" stroke-dasharray="4 3"/><text x="${np[0] + 9}" y="${np[1] + 16}" font-size="15" fill="var(--c-C)" font-weight="700">正午</text>`;
    const sv = sunVec(phi, dr, (st.t - 12) * 15 * D), sp = proj(...sv);
    s += `<circle cx="${sp[0]}" cy="${sp[1]}" r="9" fill="var(--sun)" stroke="var(--c-C)" stroke-width="2"${sv[2] < 0 ? ' fill-opacity=".35" stroke-opacity=".4"' : ''}/>`;
    s += `<circle cx="${CX}" cy="${CY}" r="3" fill="var(--ink)"/><text x="${CX}" y="${CY + 16}" text-anchor="middle" font-size="14" fill="var(--ink-2)">觀測者</text>`;
    s += `<text x="6" y="18" font-size="16" font-weight="700" fill="var(--ink)">${latStr(st.lat)}　${dateStr(st.day)}</text><text x="6" y="37" font-size="13" fill="var(--mute)">細線：夏至、二分、冬至；虛線：地平線下</text>`;
    svg.innerHTML = s;
    // 讀數
    const zd = st.lat - dec, hNoon = 90 - Math.abs(zd);
    const dir = Math.abs(zd) < 0.05 ? '天頂' : zd > 0 ? '南方' : '北方';
    const tp = Math.tan(phi) * Math.tan(dr), polar = Math.abs(st.lat) > 89.95;
    let day, dayTxt, riseTxt;
    if (polar ? st.lat * dec > 0 : tp >= 1) { day = 24; dayTxt = '永晝（24 h）'; }
    else if (polar ? st.lat * dec < 0 || dec === 0 : tp <= -1) { day = 0; dayTxt = polar && dec === 0 ? '太陽沿地平線繞行' : '永夜（0 h）'; }
    else { const H0 = Math.acos(-tp) / D; day = 2 * H0 / 15; dayTxt = `cos H₀ = ${(-tp).toFixed(3).replace('-', '−')}，H₀ = ${H0.toFixed(1)}°<br>晝長 = 2H₀ ÷ 15°/h = ${fmtH(day)}`; }
    if (day > 0 && day < 24 && !polar) {
      const cA = Math.sin(dr) / Math.cos(phi), A = Math.acos(Math.max(-1, Math.min(1, cA))) / D, dev = 90 - A;
      riseTxt = `cos A = sin δ / cos φ = ${cA.toFixed(3).replace('-', '−')}，A = ${A.toFixed(1)}°<br>${Math.abs(dev) < 0.05 ? '正東' : `東偏${dev > 0 ? '北' : '南'} ${Math.abs(dev).toFixed(1)}°`}`;
    } else riseTxt = '—（無日出日沒）';
    const alt = Math.asin(Math.max(-1, Math.min(1, sv[2]))) / D, az = (Math.atan2(sv[0], sv[1]) / D + 360) % 360;
    const azTxt = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'][Math.round(az / 45) % 8];
    const fact = (k, v, full) => `<div class="fact"${full ? ' style="grid-column:1/-1"' : ''}><span>${k}</span><b>${v}</b></div>`;
    facts.innerHTML = fact('太陽赤緯 δ（直射點緯度）', `${dec >= 0 ? '+' : '−'}${Math.abs(dec).toFixed(1)}°`) +
      fact('單位面積日射 I/I₀ = sin h（正午）', hNoon > 0 ? Math.sin(hNoon * D).toFixed(2) : '0') +
      fact('正午仰角 h = 90° − |φ − δ|', `90° − |${sg(st.lat)} − ${dec < -0.05 ? '(' + sg(dec) + ')' : sg(dec)}| = ${sg(hNoon)}°${hNoon > 0 ? `（${dir}）` : '（地平線下）'}`, 1) +
      fact('晝長（未計折射）', dayTxt, 1) + fact('日出方位（A 由正北向東量）', riseTxt, 1) +
      fact(`此刻 ${String(Math.floor(st.t) % 24).padStart(2, '0')}:${String(Math.round((st.t % 1) * 60)).padStart(2, '0')}（視太陽時）`, alt > 0 ? `仰角 ${alt.toFixed(1)}°，${azTxt}方` : '太陽在地平線下', 1);
    let n = '正午仰角愈大，同樣的陽光照在愈小的面積上（I = I₀ sin h）；晝愈長，受熱時間愈長。兩者隨日期一起變化才是季節的成因，不是日地距離。';
    if (dir === '北方' && hNoon > 0 && st.lat > 0) n = '此日直射點在此地以北：正午太陽在北方，竿影朝南（北回歸線以南地區夏至前後即是如此）。';
    else if (day === 24 || day === 0) n = '極圈以內：|tan φ · tan δ| ≥ 1 時，太陽整天不落（永晝）或整天不升（永夜）。';
    note.textContent = n;
  }
  function sync() {
    inputs.forEach((i) => { i.value = st[i.dataset.k]; });
    inputs[0].nextElementSibling.textContent = latStr(st.lat);
    inputs[1].nextElementSibling.textContent = dateStr(st.day);
    const t = st.t; inputs[2].nextElementSibling.textContent = `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`;
    el.querySelectorAll('[data-g=lat] button').forEach((b) => b.setAttribute('aria-pressed', Math.abs(LATS[b.dataset.v][1] - st.lat) < 0.01));
    el.querySelectorAll('[data-g=day] button').forEach((b) => b.setAttribute('aria-pressed', DAYS[b.dataset.v][1] === st.day));
    draw();
  }
  inputs.forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); sync(); }));
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.parentElement.dataset.g === 'lat') st.lat = LATS[b.dataset.v][1]; else st.day = DAYS[b.dataset.v][1];
    sync();
  });
  sync();
};
