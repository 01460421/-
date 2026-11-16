(window.SIMS = window.SIMS || {}).magnitude = function (el, opt) {
  const st = { mode: opt && opt.mode === 'distance' ? 'distance' : 'brightness', m1: 1, m2: 6, M: 1.4, ld: Math.log10(2.64) };
  const f1 = (x) => (Math.abs(x) < 0.05 ? 0 : x).toFixed(1).replace('-', '−');
  const sgn = (x) => (x > 0.04 ? '+' : '') + f1(x);
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const big = (x) => { if (x >= 0.01 && x < 1e4) return x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(x < 1 ? 3 : 2); const e = Math.floor(Math.log10(x)); return (x / 10 ** e).toFixed(2) + '×10' + String(e).split('').map((c) => SUP[c]).join(''); };
  const PB = [['1 等 vs 6 等', 1, 6], ['天狼星 vs 北極星', -1.46, 1.98], ['織女星 vs 比鄰星', 0.03, 11.1], ['金星 vs 天狼星', -4.9, -1.46]];
  const PD = [['天狼星', 1.4, 2.64], ['比鄰星', 15.6, 1.30], ['織女星', 0.6, 7.7], ['參宿七', -7, 264]];
  el.innerHTML = `<div class="sim-head"><b>星等、亮度與距離</b><span>拖動滑桿改變星等或距離，看亮度比與距離模數如何變化。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 400 260" role="img" aria-label="星等示意圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="mode"><button type="button" data-v="brightness">視星等與亮度比</button><button type="button" data-v="distance">絕對星等與距離</button></div>
    <div data-p="brightness" style="display:grid;gap:8px">
      <label class="sl"><span style="color:var(--c-P)">m₁ 甲星</span><input type="range" data-k="m1" min="-5" max="15" step="0.1"><output></output></label>
      <label class="sl"><span style="color:var(--c-C)">m₂ 乙星</span><input type="range" data-k="m2" min="-5" max="15" step="0.1"><output></output></label>
      <div class="ops" data-g="pb">${PB.map((p, i) => `<button type="button" data-v="${i}">${p[0]}</button>`).join('')}</div>
    </div>
    <div data-p="distance" style="display:grid;gap:8px">
      <label class="sl"><span>M 絕對星等</span><input type="range" data-k="M" min="-10" max="16" step="0.1"><output></output></label>
      <label class="sl"><span>d 距離</span><input type="range" data-k="ld" min="0" max="5" step="0.01"><output></output></label>
      <div class="ops" data-g="pd">${PD.map((p, i) => `<button type="button" data-v="${i}">${p[0]}</button>`).join('')}</div>
    </div>
    <div class="facts"></div>
    <p class="sim-note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note');
  const inputs = [...el.querySelectorAll('input[type=range]')];
  const fact = (k, v, full) => `<div class="fact"${full ? ' style="grid-column:1/-1"' : ''}><span>${k}</span><b>${v}</b></div>`;
  const star = (cx, cy, m, col, name, tc) => {
    const r = 3 + 26 * Math.min(Math.max((15 - m) / 20, 0), 1);
    return `<circle cx="${cx}" cy="${cy}" r="${r * 1.8}" fill="${col}" opacity=".18"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/>` +
      `<text x="${cx}" y="${cy + 62}" text-anchor="middle" font-size="15" fill="${tc}">${name}　m = ${f1(m)}</text>`;
  };
  function drawB() {
    const dm = st.m2 - st.m1, ratio = Math.pow(10, 0.4 * Math.abs(dm));
    let s = `<rect x="0" y="0" width="400" height="150" rx="8" fill="var(--ink)"/>`;
    s += star(110, 66, st.m1, 'var(--c-P)', '甲', 'var(--card)') + star(290, 66, st.m2, 'var(--c-C)', '乙', 'var(--card)');
    s += `<text x="200" y="20" text-anchor="middle" font-size="12" fill="var(--line)">星點大小示意亮度（非實際比例）</text>`;
    const X = (m) => 20 + ((m + 5) / 20) * 360, Y = 200;
    s += `<line x1="20" y1="${Y}" x2="380" y2="${Y}" stroke="var(--ink-2)"/>`;
    for (let m = -5; m <= 15; m++) { const bigT = m % 5 === 0; s += `<line x1="${X(m)}" y1="${Y - (bigT ? 6 : 3)}" x2="${X(m)}" y2="${Y + (bigT ? 6 : 3)}" stroke="var(--ink-2)"/>`; if (bigT) s += `<text x="${X(m)}" y="${Y + 21}" text-anchor="middle" font-size="13" fill="var(--ink-2)">${m}</text>`; }
    s += `<text x="20" y="${Y + 44}" font-size="13" fill="var(--mute)">← 愈亮</text><text x="380" y="${Y + 44}" font-size="13" fill="var(--mute)" text-anchor="end">愈暗 →</text>`;
    s += `<text x="200" y="${Y + 44}" font-size="13" fill="var(--mute)" text-anchor="middle">視星等 m</text>`;
    const a = X(st.m1), b = X(st.m2);
    s += `<path d="M${a} ${Y - 12} L${a} ${Y - 26} L${b} ${Y - 26} L${b} ${Y - 12}" fill="none" stroke="var(--teal)" stroke-width="1.5"/>`;
    s += `<text x="${(a + b) / 2}" y="${Y - 31}" text-anchor="middle" font-size="14" fill="var(--teal-2)">Δm = ${f1(Math.abs(dm))}</text>`;
    s += `<circle cx="${a}" cy="${Y}" r="5" fill="var(--c-P)"/><circle cx="${b}" cy="${Y}" r="5" fill="var(--c-C)"/>`;
    svg.innerHTML = s;
    const brighter = Math.abs(dm) < 0.05 ? '一樣亮' : dm > 0 ? '甲星較亮' : '乙星較亮';
    facts.innerHTML = fact('星等差 Δm = m₂ − m₁', sgn(dm)) + fact('哪顆較亮', brighter) +
      fact('亮度比 b₁ / b₂ = 10<sup>0.4(m₂ − m₁)</sup>', `10<sup>${(0.4 * dm).toFixed(2)}</sup> ≈ ${big(Math.pow(10, 0.4 * dm))}`, 1) +
      fact('較亮者 ÷ 較暗者 = 100<sup>|Δm|/5</sup> ≈ 2.512<sup>|Δm|</sup>', `≈ ${big(ratio)} 倍`, 1);
    note.textContent = '星等數值愈小愈亮；每差 5 等亮度差 100 倍，差 1 等約 2.512 倍（不是 2 倍）。星等差是相減，亮度比卻是 10 的乘冪。';
  }
  function drawD() {
    const d = Math.pow(10, st.ld), mod = 5 * st.ld - 5, m = st.M + mod, L = Math.pow(10, 0.4 * (4.83 - st.M));
    const X = (l) => 50 + l * 66, Y = (v) => 20 + ((21 - v) / 27) * 200;
    let s = `<rect x="50" y="20" width="330" height="200" fill="var(--card)" stroke="var(--line)"/>`;
    for (let l = 0; l <= 5; l++) s += `<line x1="${X(l)}" y1="20" x2="${X(l)}" y2="220" stroke="var(--line)"/><text x="${X(l)}" y="236" text-anchor="middle" font-size="13" fill="var(--ink-2)">${l === 0 ? 1 : l === 1 ? 10 : '10' + SUP[l]}</text>`;
    for (let v = -5; v <= 20; v += 5) s += `<line x1="50" y1="${Y(v)}" x2="380" y2="${Y(v)}" stroke="var(--line)"/><text x="44" y="${Y(v) + 4}" text-anchor="end" font-size="13" fill="var(--ink-2)">${v}</text>`;
    s += `<line x1="50" y1="${Y(0)}" x2="380" y2="${Y(0)}" stroke="var(--ink-2)"/>`;
    s += `<line x1="${X(0)}" y1="${Y(-5)}" x2="${X(5)}" y2="${Y(20)}" stroke="var(--teal)" stroke-width="2"/>`;
    s += `<line x1="${X(1)}" y1="20" x2="${X(1)}" y2="220" stroke="var(--sun)" stroke-width="2" stroke-dasharray="4 3"/><text x="${X(1) + 4}" y="36" font-size="13" fill="var(--ink-2)">d = 10 pc：m = M</text>`;
    s += `<line x1="${X(st.ld)}" y1="${Y(0)}" x2="${X(st.ld)}" y2="${Y(mod)}" stroke="var(--red)" stroke-width="1.5"/>`;
    s += `<circle cx="${X(st.ld)}" cy="${Y(mod)}" r="6" fill="var(--red)" stroke="var(--card)" stroke-width="2"/>`;
    s += `<text x="${Math.min(X(st.ld) + 10, 280)}" y="${Y(mod) + (mod > 12 || (mod < 2 && mod > -3) ? 20 : -12)}" font-size="14" font-weight="700" fill="var(--red)" stroke="var(--card)" stroke-width="3" paint-order="stroke">m − M = ${f1(mod)}</text>`;
    s += `<text x="215" y="255" text-anchor="middle" font-size="13" fill="var(--ink-2)">距離 d（pc，對數尺度）</text><text x="14" y="120" font-size="13" fill="var(--ink-2)" transform="rotate(-90 14 120)" text-anchor="middle">m − M</text>`;
    svg.innerHTML = s;
    facts.innerHTML = fact('距離 d', `${big(d)} pc（${big(d * 3.26)} ly）`) + fact('絕對星等 M', f1(st.M)) +
      fact('距離模數 m − M = 5 log d − 5', `5 × ${st.ld.toFixed(2)} − 5 = ${sgn(mod)}`, 1) +
      fact('視星等 m = M + (m − M)', f1(m)) + fact('亮度 ÷ 在 10 pc 時 = (10/d)²', big(Math.pow(10 / d, 2))) +
      fact('光度 L/L☉ = 10<sup>0.4(4.83 − M)</sup>（M☉ ≈ 4.83）', big(L), 1);
    note.textContent = d > 10.05 ? '比 10 pc 遠，看起來比在 10 pc 處暗，所以 m > M；距離每乘 10，m − M 增加 5（亮度降為 1/100）。' : d < 9.95 ? '比 10 pc 近，看起來比在 10 pc 處亮，所以 m < M。絕對星等只由光度決定，與距離無關。' : '恰在 10 pc：視星等等於絕對星等（定義）。';
  }
  function sync() {
    el.querySelectorAll('[data-g=mode] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === st.mode));
    el.querySelectorAll('[data-p]').forEach((p) => { p.style.display = p.dataset.p === st.mode ? 'grid' : 'none'; });
    inputs.forEach((i) => {
      i.value = st[i.dataset.k];
      const k = i.dataset.k, v = st[k];
      i.nextElementSibling.textContent = k === 'ld' ? big(Math.pow(10, v)) + ' pc' : f1(v);
    });
    if (st.mode === 'brightness') drawB(); else drawD();
  }
  inputs.forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); sync(); }));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const g = b.parentElement.dataset.g, v = b.dataset.v;
    if (g === 'mode') st.mode = v;
    if (g === 'pb') { st.m1 = PB[v][1]; st.m2 = PB[v][2]; }
    if (g === 'pd') { st.M = PD[v][1]; st.ld = Math.log10(PD[v][2]); }
    sync();
  });
  sync();
};
