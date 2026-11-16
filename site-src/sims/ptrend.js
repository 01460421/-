(window.SIMS = window.SIMS || {}).ptrend = function (el, opt) {
  const SYM = ['', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca'];
  const NAME = ['', '氫', '氦', '鋰', '鈹', '硼', '碳', '氮', '氧', '氟', '氖', '鈉', '鎂', '鋁', '矽', '磷', '硫', '氯', '氬', '鉀', '鈣'];
  const PER = (z) => (z <= 2 ? 1 : z <= 10 ? 2 : z <= 18 ? 3 : 4);
  const GRP = [0, 1, 18, 1, 2, 13, 14, 15, 16, 17, 18, 1, 2, 13, 14, 15, 16, 17, 18, 1, 2];
  const MODES = {
    r: { t: '原子半徑', u: 'pm', max: 220, step: 50, d: 0, lab: '共價半徑（pm）',
      v: [null, 31, null, 128, 96, 84, 76, 71, 66, 57, null, 166, 141, 121, 111, 107, 105, 102, null, 203, 176],
      note: '同週期由左而右，核電荷增加、殼層數不變，半徑漸小；同族由上而下多一層，半徑漸大。惰性氣體以凡得瓦半徑表示，不列入比較。' },
    ie: { t: '第一游離能', u: 'kJ/mol', max: 2500, step: 500, d: 0, lab: '第一游離能（kJ/mol）',
      v: [null, 1312, 2372, 520, 900, 801, 1086, 1402, 1314, 1681, 2081, 496, 738, 578, 787, 1012, 1000, 1251, 1521, 419, 590],
      note: '同週期由左而右大致增加，惰性氣體最大、鹼金屬最小；同族由上而下減小。例外：Be＞B、Mg＞Al，N＞O、P＞S（2、15 族比右邊鄰居高）。' },
    en: { t: '電負度', u: '', max: 4.4, step: 1, d: 2, lab: '鮑林電負度（無單位）',
      v: [null, 2.20, null, 0.98, 1.57, 2.04, 2.55, 3.04, 3.44, 3.98, null, 0.93, 1.31, 1.61, 1.90, 2.19, 2.58, 3.16, null, 0.82, 1.00],
      note: '同週期由左而右增大，同族由上而下減小；F 最大（3.98）。惰性氣體一般不列電負度。右上大、左下小。' },
  };
  const st = { m: MODES[opt.mode] ? opt.mode : 'r', z: 11 };
  el.innerHTML = `<div class="sim-head"><b>原子序與週期性趨勢</b><span>切換性質，點（或觸碰）圖上的點讀取元素與數值；比較同週期與同族的變化。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 290" role="img" aria-label="週期性趨勢圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops">${Object.keys(MODES).map((k) => `<button type="button" data-m="${k}">${MODES[k].t}</button>`).join('')}</div>
    <label class="sl"><span>原子序</span><input type="range" min="1" max="20" step="1" value="${st.z}"><output></output></label>
    <div class="facts">
      <div class="fact"><span>選取元素</span><b data-f="el"></b></div>
      <div class="fact"><span data-f="vl"></span><b data-f="v"></b></div>
      <div class="fact"><span>同週期右鄰</span><b data-f="right"></b></div>
      <div class="fact"><span>同族上方／下方</span><b data-f="down"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), rng = el.querySelector('input');
  const f = (k) => el.querySelector(`[data-f="${k}"]`);
  const L = 46, R = 410, T = 24, B = 246;
  const x = (z) => L + ((z - 0.5) / 20) * (R - L);
  const fmt = (v) => (v == null ? '—' : v.toFixed(MODES[st.m].d) + (MODES[st.m].u ? ' ' + MODES[st.m].u : ''));
  const show = (z) => (z && z <= 20 ? `${SYM[z]} ${fmt(MODES[st.m].v[z])}` : '—');
  function draw() {
    const M = MODES[st.m], y = (v) => B - (v / M.max) * (B - T);
    let s = '';
    const bands = [[1, 2], [3, 10], [11, 18], [19, 20]];
    bands.forEach(([a, b], i) => {
      s += `<rect x="${x(a) - (x(2) - x(1)) / 2}" y="${T}" width="${x(b) - x(a) + (x(2) - x(1))}" height="${B - T}" fill="${i % 2 ? 'var(--teal-soft)' : 'var(--card)'}"/>`;
      s += `<text x="${(x(a) + x(b)) / 2}" y="${T - 8}" font-size="11" text-anchor="middle" fill="var(--ink-2)">第 ${i + 1} 週期</text>`;
    });
    for (let v = 0; v <= M.max + 1e-9; v += M.step) s += `<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 4}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="var(--mute)">${v}</text>`;
    s += `<text x="12" y="${(T + B) / 2}" font-size="11" fill="var(--ink-2)" text-anchor="middle" transform="rotate(-90 12 ${(T + B) / 2})">${M.lab}</text>`;
    // lines within periods, broken where no data
    bands.forEach(([a, b]) => {
      let d = '';
      for (let z = a; z <= b; z++) { const v = M.v[z]; if (v == null) { d += ' '; continue; } d += (d.endsWith(' ') || d === '' ? 'M' : 'L') + x(z).toFixed(1) + ' ' + y(v).toFixed(1); }
      s += `<path d="${d.trim()}" fill="none" stroke="var(--teal)" stroke-width="2"/>`;
    });
    for (let z = 1; z <= 20; z++) {
      const v = M.v[z], g = GRP[z], col = g === 18 ? 'var(--red)' : g === 1 && z > 1 ? 'var(--green)' : 'var(--teal)';
      s += `<text x="${x(z)}" y="${B + 14}" font-size="11" text-anchor="middle" fill="${z === st.z ? 'var(--ink)' : 'var(--mute)'}" font-weight="${z === st.z ? 700 : 400}">${SYM[z]}</text>`;
      s += `<text x="${x(z)}" y="${B + 26}" font-size="9" text-anchor="middle" fill="var(--mute)">${z}</text>`;
      if (v == null) continue;
      const on = z === st.z;
      s += `<circle cx="${x(z)}" cy="${y(v)}" r="${on ? 6.5 : 4}" fill="${col}" stroke="${on ? 'var(--ink)' : 'var(--card)'}" stroke-width="${on ? 2 : 1}"/>`;
    }
    const v0 = M.v[st.z];
    if (v0 != null) {
      const tx = Math.min(Math.max(x(st.z), L + 50), R - 50), ty = Math.max(y(v0) - 14, T + 12);
      s += `<g pointer-events="none"><rect x="${tx - 48}" y="${ty - 13}" width="96" height="18" rx="4" fill="var(--ink)" opacity=".85"/><text x="${tx}" y="${ty}" font-size="11" text-anchor="middle" fill="#fff">${SYM[st.z]}：${fmt(v0)}</text></g>`;
    } else s += `<text x="${x(st.z)}" y="${B - 8}" font-size="10" text-anchor="middle" fill="var(--red)">不列</text>`;
    for (let z = 1; z <= 20; z++) s += `<rect data-z="${z}" x="${x(z) - (x(2) - x(1)) / 2}" y="${T}" width="${x(2) - x(1)}" height="${B - T + 28}" fill="transparent" style="cursor:pointer"/>`;
    s += `<text x="${R}" y="${B + 40}" font-size="10" text-anchor="end" fill="var(--mute)"><tspan fill="var(--green)">●</tspan> 鹼金屬　<tspan fill="var(--red)">●</tspan> 惰性氣體　原子序 Z →</text>`;
    svg.innerHTML = s;
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.m)));
    rng.value = st.z; rng.nextElementSibling.textContent = SYM[st.z];
    const z = st.z, p = PER(z), g = GRP[z];
    let right = null; for (let k = z + 1; k <= 20 && PER(k) === p; k++) { right = k; break; }
    let down = null, up = null; for (let k = z + 1; k <= 20; k++) if (GRP[k] === g) { down = k; break; }
    for (let k = z - 1; k >= 1; k--) if (GRP[k] === g) { up = k; break; }
    f('el').textContent = `${SYM[z]} ${NAME[z]}（第 ${p} 週期，第 ${g} 族）`;
    f('vl').textContent = M.t;
    f('v').textContent = v0 == null ? (st.m === 'r' ? '惰性氣體不比較' : '不列') : fmt(v0);
    f('right').textContent = show(right);
    f('down').textContent = `↑ ${show(up)}　↓ ${show(down)}`;
    f('note').textContent = M.note;
  }
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; draw(); }));
  rng.addEventListener('input', () => { st.z = Number(rng.value); draw(); });
  const pick = (e) => { const t = e.target.closest('[data-z]'); if (t) { st.z = Number(t.dataset.z); draw(); } };
  svg.addEventListener('pointerdown', pick);
  svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e); });
  draw();
};
