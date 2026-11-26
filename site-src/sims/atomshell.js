(window.SIMS = window.SIMS || {}).atomshell = function (el, opt) {
  const E = [null,
    ['H', '氫', 1], ['He', '氦', 4], ['Li', '鋰', 7], ['Be', '鈹', 9], ['B', '硼', 11], ['C', '碳', 12], ['N', '氮', 14],
    ['O', '氧', 16], ['F', '氟', 19], ['Ne', '氖', 20], ['Na', '鈉', 23], ['Mg', '鎂', 24], ['Al', '鋁', 27], ['Si', '矽', 28],
    ['P', '磷', 31], ['S', '硫', 32], ['Cl', '氯', 35], ['Ar', '氬', 40], ['K', '鉀', 39], ['Ca', '鈣', 40]];
  const CAP = [2, 8, 8, 2];
  const sup = (n) => String(n).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join('');
  const SH = ['K', 'L', 'M', 'N'];
  const st = { Z: Number(opt.Z) >= 1 && Number(opt.Z) <= 20 ? Math.round(Number(opt.Z)) : 11 };
  const shells = (Z) => { const a = []; let r = Z; for (const c of CAP) { if (r <= 0) break; a.push(Math.min(c, r)); r -= c; } return a; };
  const groupOf = (Z, sh) => { const v = sh[sh.length - 1]; if (Z === 2) return 18; if (v <= 2) return v; return v === 8 ? 18 : v + 10; };
  el.innerHTML = `<div class="sim-head"><b>原子的殼層電子排列</b><span>拖動原子序 Z（或點下方週期表），看電子如何依 K、L、M、N 殼層填入。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 384" role="img" aria-label="殼層電子排列示意圖"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>原子序 Z</span><input type="range" min="1" max="20" step="1" value="${st.Z}"><output></output></label>
    <div class="ops"><button type="button" data-d="-1">◀ 前一個</button><button type="button" data-d="1">下一個 ▶</button></div>
    <div class="facts">
      <div class="fact"><span>元素</span><b data-f="el"></b></div>
      <div class="fact"><span>電子排列（K, L, M, N）</span><b data-f="cfg"></b></div>
      <div class="fact"><span>價電子（最外層電子）</span><b data-f="val"></b></div>
      <div class="fact"><span>週期／族</span><b data-f="pg"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>常見同位素：質子數／中子數／質量數</span><b data-f="nuc"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg');
  const rng = el.querySelector('input');
  const f = (k) => el.querySelector(`[data-f="${k}"]`);
  const CX = 180, CY = 122, R = [34, 56, 78, 100];
  // 簡化週期表：第 1–4 週期，第 1、2、13–18 族
  const COLS = [1, 2, 13, 14, 15, 16, 17, 18];
  const pos = (Z) => { const sh = shells(Z); return { p: sh.length, g: groupOf(Z, sh) }; };
  function draw() {
    const Z = st.Z, sh = shells(Z), [sym, name, A] = E[Z];
    const g = groupOf(Z, sh), v = sh[sh.length - 1], noble = g === 18;
    let s = '';
    sh.forEach((n, i) => {
      const r = R[i];
      s += `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="var(--line)" stroke-width="1.5"/>`;
      s += `<text x="${CX + r * 0.71 + 3}" y="${CY - r * 0.71 - 3}" font-size="12" font-weight="700" fill="var(--ink-2)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">${SH[i]}</text>`;
      const outer = i === sh.length - 1;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / n + (n === 2 ? 0 : i * 0.3);
        s += `<circle cx="${(CX + r * Math.cos(a)).toFixed(1)}" cy="${(CY + r * Math.sin(a)).toFixed(1)}" r="5" fill="${outer && !noble ? 'var(--red)' : 'var(--c-P)'}" stroke="var(--card)" stroke-width="1"/>`;
      }
    });
    s += `<circle cx="${CX}" cy="${CY}" r="18" fill="var(--sun)" stroke="var(--c-E)" stroke-width="1"/>`;
    s += `<text x="${CX}" y="${CY + 4}" font-size="12" text-anchor="middle" fill="var(--ink)" font-weight="700">+${Z}</text>`;
    s += `<text x="10" y="18" font-size="13" fill="var(--ink)" font-weight="700">${sym}（${name}）Z = ${Z}</text>`;
    s += `<text x="10" y="238" font-size="11" fill="var(--ink-2)"><tspan fill="var(--red)">●</tspan> 價電子　<tspan fill="var(--c-P)">●</tspan> 內層電子（示意圖，殼層代表能量層級）</text>`;
    // mini periodic table
    const X0 = 20, Y0 = 254, CW = 40, CH = 30;
    COLS.forEach((c, j) => { s += `<text x="${X0 + j * CW + CW / 2}" y="${Y0 - 4}" font-size="9" text-anchor="middle" fill="var(--mute)">${c}</text>`; });
    for (let z = 1; z <= 20; z++) {
      const q = pos(z), j = q.p === 1 && z === 2 ? 7 : COLS.indexOf(q.g);
      const x = X0 + j * CW, y = Y0 + (q.p - 1) * CH, on = z === Z;
      s += `<g data-z="${z}" style="cursor:pointer"><rect x="${x + 1}" y="${y + 1}" width="${CW - 2}" height="${CH - 2}" rx="4" fill="${on ? 'var(--teal)' : 'var(--card)'}" stroke="${on ? 'var(--teal)' : 'var(--line)'}"/>`;
      s += `<text x="${x + 4}" y="${y + 11}" font-size="8" fill="${on ? '#fff' : 'var(--mute)'}">${z}</text>`;
      s += `<text x="${x + CW / 2}" y="${y + 22}" font-size="12" text-anchor="middle" fill="${on ? '#fff' : 'var(--ink)'}" font-weight="700">${E[z][0]}</text></g>`;
    }
    for (let p = 1; p <= 4; p++) s += `<text x="${X0 - 6}" y="${Y0 + (p - 1) * CH + 19}" font-size="9" text-anchor="end" fill="var(--mute)">${p}</text>`;
    svg.innerHTML = s;
    rng.value = Z;
    rng.nextElementSibling.textContent = Z;
    f('el').textContent = `${sym}　${name}`;
    f('cfg').textContent = sh.join(', ');
    f('val').textContent = noble ? `最外層 ${v}（穩定，不易鍵結）` : `${v} 個`;
    f('pg').textContent = `第 ${sh.length} 週期，第 ${g} 族`;
    f('nuc').textContent = `${Z} ／ ${A - Z} ／ ${A}（${sup(A)}${sym}）`;
    f('note').textContent = Z >= 19
      ? `M 層填到 8 個（Ar）後，第 19、20 個電子先填入 N 層，所以是 ${sh.join(',')}，不是 2,8,${Z - 10}。殼層數 ${sh.length} → 第 ${sh.length} 週期。`
      : noble
        ? `${sym} 的最外層已填滿（${v} 個），屬第 18 族，化學性質不活潑。`
        : `殼層數 ${sh.length} → 第 ${sh.length} 週期；最外層 ${v} 個電子 → 第 ${g} 族（族號個位數＝價電子數）。`;
  }
  rng.addEventListener('input', () => { st.Z = Number(rng.value); draw(); });
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { st.Z = Math.min(20, Math.max(1, st.Z + Number(b.dataset.d))); draw(); }));
  svg.addEventListener('click', (e) => { const g = e.target.closest('[data-z]'); if (g) { st.Z = Number(g.dataset.z); draw(); } });
  draw();
};
