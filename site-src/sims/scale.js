(window.SIMS = window.SIMS || {}).scale = function (el, opt) {
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');
  const sci = (x, d) => { const e = Math.floor(Math.log10(x) + 1e-12); let a = x / 10 ** e; let s = a.toFixed(d); if (Number(s) >= 10) { s = (a / 10).toFixed(d); return s + '×10' + sup(e + 1); } return s + '×10' + sup(e); };
  const LO = -15, HI = 27;
  const OBJ = [
    ['質子', 1.7e-15], ['鈾原子核', 1.5e-14], ['氫原子', 1.06e-10], ['DNA 雙股寬', 2e-9], ['病毒', 1e-7],
    ['紅血球（細胞）', 8e-6], ['人的身高', 1.7], ['玉山高度', 3952], ['地球直徑', 1.27e7], ['地月距離', 3.84e8],
    ['日地距離', 1.5e11], ['1 光年', 9.46e15], ['銀河系直徑', 1e21], ['仙女座星系距離', 2.4e22], ['可觀測宇宙直徑', 8.8e26],
  ].map(([n, v]) => ({ n, v, L: Math.log10(v) }));
  const st = { c: -5, w: 11, a: 2, b: 6 };
  el.innerHTML = `<div class="sim-head"><b>自然界的長度尺度</b><span>拖動滑桿移動放大視窗；選兩個對象（或點刻度上的圓點），看相差幾個數量級。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 250" role="img" aria-label="對數長度尺"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>視窗中心</span><input type="range" data-k="c" min="-15" max="27" step="0.5" value="-5"><output></output></label>
    <label class="sl"><span>視窗寬度</span><input type="range" data-k="w" min="3" max="42" step="1" value="11"><output></output></label>
    <label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span style="color:var(--c-P)">● 甲</span><select data-s="a"></select></label>
    <label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span style="color:var(--c-C)">● 乙</span><select data-s="b"></select></label>
    <div class="facts"><div class="fact"><span>甲</span><b data-f="a"></b></div><div class="fact"><span>乙</span><b data-f="b"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>乙 ÷ 甲</span><b data-f="r"></b></div></div>
    <p class="sim-note">對數尺上每一大格都是 10 倍；數量級取 log 值四捨五入（以 √10 ≈ 3.16 為界）。原子約 10⁻¹⁰ m、原子核約 10⁻¹⁵ m，兩者相差約 10⁵ 倍。</p>
  </div></div>`;
  const svg = el.querySelector('svg');
  el.querySelectorAll('select').forEach((s) => { s.innerHTML = OBJ.map((o, i) => `<option value="${i}">${o.n}</option>`).join(''); s.value = st[s.dataset.s]; });
  const X0 = 12, X1 = 408;
  const ox = (L) => X0 + ((L - LO) / (HI - LO)) * (X1 - X0);
  function draw() {
    const w = st.w, c = Math.min(Math.max(st.c, LO + w / 2), HI - w / 2), a = c - w / 2, b = c + w / 2;
    const zx = (L) => X0 + ((L - a) / (b - a)) * (X1 - X0);
    let s = `<text x="${X0}" y="14" font-size="11" fill="var(--ink-2)">全尺度（10⁻¹⁵ m ～ 10²⁷ m）</text>`;
    s += `<line x1="${X0}" y1="40" x2="${X1}" y2="40" stroke="var(--ink-2)"/>`;
    for (let e = LO; e <= HI; e++) {
      const x = ox(e), big = e % 5 === 0;
      s += `<line x1="${x}" y1="${big ? 34 : 37}" x2="${x}" y2="${big ? 46 : 43}" stroke="var(--ink-2)"/>`;
      if (big) s += `<text x="${x}" y="60" font-size="10" text-anchor="middle" fill="var(--ink-2)">10${sup(e)}</text>`;
    }
    s += `<rect x="${ox(a)}" y="28" width="${ox(b) - ox(a)}" height="24" fill="var(--teal)" fill-opacity=".15" stroke="var(--teal)" rx="3"/>`;
    s += `<path d="M${ox(a)} 52 L${X0} 92 M${ox(b)} 52 L${X1} 92" stroke="var(--teal)" stroke-dasharray="3 3" fill="none"/>`;
    OBJ.forEach((o, i) => { const col = i === st.a ? 'var(--c-P)' : i === st.b ? 'var(--c-C)' : 'var(--ink-2)'; s += `<circle cx="${ox(o.L)}" cy="40" r="${i === st.a || i === st.b ? 4.5 : 2.5}" fill="${col}"/>`; });
    // zoom ruler
    const Y = 212;
    s += `<rect x="${X0}" y="92" width="${X1 - X0}" height="150" fill="var(--card)" stroke="var(--teal)" rx="6"/>`;
    s += `<line x1="${X0}" y1="${Y}" x2="${X1}" y2="${Y}" stroke="var(--ink)" stroke-width="1.5"/>`;
    const step = w > 24 ? 5 : w > 8 ? 2 : 1;
    for (let e = Math.ceil(a); e <= Math.floor(b); e++) {
      const x = zx(e);
      s += `<line x1="${x}" y1="${Y - 7}" x2="${x}" y2="${Y + 7}" stroke="var(--ink)"/>`;
      if (e % step === 0) s += `<text x="${x}" y="${Y + 21}" font-size="13" text-anchor="middle" fill="var(--ink)">10${sup(e)}</text>`;
      if (w <= 12) for (let k = 2; k <= 9; k++) { const xm = zx(e + Math.log10(k)); if (xm < X1) s += `<line x1="${xm}" y1="${Y - 3}" x2="${xm}" y2="${Y + 3}" stroke="var(--mute)"/>`; }
    }
    const rows = [-1e9, -1e9, -1e9, -1e9];
    OBJ.forEach((o, i) => {
      if (o.L < a - 1e-9 || o.L > b + 1e-9) return;
      const x = zx(o.L), sel = i === st.a || i === st.b, col = i === st.a ? 'var(--c-P)' : i === st.b ? 'var(--c-C)' : 'var(--ink-2)';
      const tw = o.n.length * 13.5 + 6, x0 = Math.min(Math.max(x - tw / 2, X0 + 2), X1 - tw - 2);
      let r = rows.findIndex((end) => end < x0); if (r < 0) r = rows.length - 1; rows[r] = x0 + tw;
      const ly = Y - 20 - r * 22;
      s += `<line x1="${x}" y1="${Y}" x2="${x}" y2="${ly + 4}" stroke="${col}" stroke-opacity=".6"/>`;
      s += `<g data-i="${i}" style="cursor:pointer"><circle cx="${x}" cy="${Y}" r="${sel ? 6 : 4.5}" fill="${col}" stroke="var(--card)" stroke-width="1.5"/>`;
      s += `<text x="${x0 + tw / 2}" y="${ly}" text-anchor="middle" font-size="13.5" fill="${col}" font-weight="${sel ? 700 : 400}">${o.n}</text></g>`;
    });
    s += `<text x="${X1 - 6}" y="108" font-size="11" text-anchor="end" fill="var(--teal)">放大：${sci(10 ** a, 1)} ～ ${sci(10 ** b, 1)} m</text>`;
    svg.innerHTML = s;
    el.querySelector('[data-k="c"]').value = c; st.c = c;
    el.querySelector('[data-k="c"] + output').textContent = sci(10 ** c, 1) + ' m';
    el.querySelector('[data-k="w"] + output').textContent = w + ' 個數量級';
    const A = OBJ[st.a], B = OBJ[st.b], d = B.L - A.L, r = B.v / A.v;
    el.querySelector('[data-f="a"]').textContent = sci(A.v, 2) + ' m ≈ 10' + sup(Math.round(A.L));
    el.querySelector('[data-f="b"]').textContent = sci(B.v, 2) + ' m ≈ 10' + sup(Math.round(B.L));
    el.querySelector('[data-f="r"]').textContent = sci(r, 1) + ' 倍 → log = ' + d.toFixed(2) + '，相差約 ' + Math.abs(Math.round(d)) + ' 個數量級';
  }
  el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => { st[inp.dataset.k] = Number(inp.value); draw(); }));
  el.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => { st[s.dataset.s] = Number(s.value); draw(); }));
  svg.addEventListener('click', (e) => {
    const g = e.target.closest('g[data-i]'); if (!g) return;
    const i = Number(g.dataset.i); if (i === st.b) return;
    st.a = st.b; st.b = i;
    el.querySelector('[data-s="a"]').value = st.a; el.querySelector('[data-s="b"]').value = st.b; draw();
  });
  draw();
};
