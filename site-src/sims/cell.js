(window.SIMS = window.SIMS || {}).cell = function (el, opt) {
  const MET = {
    Mg: { E: -2.37, z: 2, M: 24.3, sol: 'MgSO₄', tint: 'var(--card)' },
    Zn: { E: -0.76, z: 2, M: 65.4, sol: 'ZnSO₄', tint: 'var(--card)' },
    Fe: { E: -0.44, z: 2, M: 55.8, sol: 'FeSO₄', tint: 'var(--green)' },
    Pb: { E: -0.13, z: 2, M: 207.2, sol: 'Pb(NO₃)₂', tint: 'var(--card)' },
    Cu: { E: 0.34, z: 2, M: 63.5, sol: 'CuSO₄', tint: 'var(--c-P)' },
    Ag: { E: 0.80, z: 1, M: 107.9, sol: 'AgNO₃', tint: 'var(--card)' },
  };
  const ion = (m) => m + (MET[m].z === 1 ? '⁺' : '²⁺');
  const st = { L: 'Zn', R: 'Cu', t: 0, run: !matchMedia('(prefers-reduced-motion: reduce)').matches };
  const btns = (side) => Object.keys(MET).map((m) => `<button type="button" data-s="${side}" data-m="${m}">${m}</button>`).join('');
  el.innerHTML = `<div class="sim-head"><b>化學電池（伽凡尼電池）</b><span>為左、右兩杯各選一種金屬，看哪一極是負極（陽極）、電子與鹽橋離子怎麼流動，以及電池電壓。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="鹽橋電池裝置"></svg></div>
  <div class="sim-ctl">
    <div class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span>左杯</span><div class="ops">${btns('L')}</div></div>
    <div class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span>右杯</span><div class="ops">${btns('R')}</div></div>
    <div class="ops"><button type="button" data-a="run"></button></div>
    <div class="facts">
      <div class="fact" style="grid-column:1/-1"><span>E°電池 = E°正極 − E°負極</span><b data-f="E"></b></div>
      <div class="fact"><span>負極（陽極）：氧化</span><b data-f="an"></b></div><div class="fact"><span>正極（陰極）：還原</span><b data-f="ca"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>全反應</span><b data-f="all"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>電極質量變化</span><b data-f="mass" style="font-size:.9rem"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), f = (k) => el.querySelector(`[data-f="${k}"]`);
  // static scene + moving layer
  svg.innerHTML = '<g data-g="s"></g><g data-g="m"></g>';
  const gS = svg.querySelector('[data-g="s"]'), gM = svg.querySelector('[data-g="m"]');
  const LX = 68, RX = 352; // electrode centres
  const wire = [[LX, 112], [LX, 44], [RX, 44], [RX, 112]];
  const bridge = [[132, 210], [132, 138], [288, 138], [288, 210]];
  const along = (pts, u) => {
    const seg = []; let tot = 0;
    for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(d); tot += d; }
    let s = u * tot;
    for (let i = 0; i < seg.length; i++) { if (s <= seg[i]) { const k = s / seg[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; } s -= seg[i]; }
    return pts[pts.length - 1];
  };
  const info = () => {
    const same = st.L === st.R, anL = MET[st.L].E < MET[st.R].E;
    return { same, an: anL ? st.L : st.R, ca: anL ? st.R : st.L, anSide: anL ? 'L' : 'R' };
  };
  function scene() {
    const I = info();
    let s = '';
    s += `<path d="M${wire.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="var(--ink-2)" stroke-width="2.5"/>`;
    s += `<circle cx="210" cy="44" r="17" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/><text x="210" y="49" font-size="14" font-weight="700" text-anchor="middle" fill="var(--ink)">V</text>`;
    s += `<text x="210" y="20" font-size="12" text-anchor="middle" fill="var(--ink)" font-weight="700">${I.same ? '0.00 V' : (MET[I.ca].E - MET[I.an].E).toFixed(2) + ' V'}</text>`;
    s += `<path d="M${bridge.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="var(--sun)" stroke-width="18" stroke-linejoin="round" opacity=".55"/><text x="210" y="122" font-size="11" text-anchor="middle" fill="var(--ink-2)">鹽橋（KNO₃）</text>`;
    [['L', 30, LX], ['R', 270, RX]].forEach(([side, x, ex]) => {
      const m = st[side], isAn = !I.same && I.anSide === side;
      s += `<rect x="${x + 2}" y="176" width="116" height="92" fill="${MET[m].tint}" opacity="${MET[m].tint === 'var(--card)' ? 0.9 : 0.25}"/>`;
      s += `<path d="M${x} 150 V270 H${x + 120} V150" fill="none" stroke="var(--ink-2)" stroke-width="2"/><line x1="${x}" x2="${x + 120}" y1="176" y2="176" stroke="var(--c-P)" opacity=".4"/>`;
      s += `<rect x="${ex - 9}" y="112" width="18" height="130" rx="2" fill="${m === 'Cu' ? 'var(--c-C)' : m === 'Ag' ? 'var(--line)' : m === 'Pb' ? 'var(--ink-2)' : 'var(--mute)'}" stroke="var(--ink)"/>`;
      s += `<text x="${ex}" y="232" font-size="12" font-weight="700" text-anchor="middle" fill="var(--ink)" stroke="var(--card)" stroke-width="3" paint-order="stroke">${m}</text>`;
      s += `<text x="${x + 60}" y="286" font-size="11" text-anchor="middle" fill="var(--ink-2)">${MET[m].sol}(aq)</text>`;
      if (!I.same) s += `<text x="${ex + (side === 'L' ? 14 : -14)}" y="104" font-size="11" font-weight="700" text-anchor="${side === 'L' ? 'start' : 'end'}" fill="${isAn ? 'var(--red)' : 'var(--c-P)'}">${isAn ? '負極（陽極）' : '正極（陰極）'}</text>`;
      if (!I.same) s += `<text x="${ex + (side === 'L' ? 14 : -14)}" y="90" font-size="10" text-anchor="${side === 'L' ? 'start' : 'end'}" fill="var(--ink-2)">${isAn ? '質量減少' : '質量增加'}</text>`;
    });
    if (!I.same) {
      const dir = I.anSide === 'L' ? 1 : -1;
      [-1, 1].forEach((k) => { const x0 = 210 + 70 * k - 12 * dir; s += `<path d="M${x0} 34 h${24 * dir}" stroke="var(--c-P)" stroke-width="2"/><path d="M${x0 + 24 * dir} 34 l${-7 * dir} -4 v8 z" fill="var(--c-P)"/><text x="${x0 + 12 * dir}" y="28" font-size="11" text-anchor="middle" fill="var(--c-P)">e⁻</text>`; });
    }
    gS.innerHTML = s;
  }
  function moving() {
    const I = info();
    if (I.same) { gM.innerHTML = ''; return; }
    let s = '';
    const fw = I.anSide === 'L';
    for (let i = 0; i < 8; i++) { const u = (st.t * 0.25 + i / 8) % 1, [x, y] = along(wire, fw ? u : 1 - u); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--c-P)"/>`; }
    // anions move toward the anode beaker, K+ toward the cathode beaker (half-way each)
    for (let i = 0; i < 4; i++) {
      const u = (st.t * 0.12 + i / 4) % 1;
      const toAn = fw ? 0.5 - u * 0.5 : 0.5 + u * 0.5, toCa = fw ? 0.5 + u * 0.5 : 0.5 - u * 0.5;
      const [ax, ay] = along(bridge, toAn), [kx, ky] = along(bridge, toCa);
      s += `<text x="${ax.toFixed(1)}" y="${(ay + 4).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--c-X)" font-weight="700">NO₃⁻</text><text x="${kx.toFixed(1)}" y="${(ky + 4).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--red)" font-weight="700">K⁺</text>`;
    }
    gM.innerHTML = s;
  }
  function draw() {
    const I = info();
    scene(); moving();
    el.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', String(st[b.dataset.s] === b.dataset.m)));
    const runB = el.querySelector('[data-a="run"]'); runB.textContent = st.run ? '暫停動畫' : '播放動畫'; runB.setAttribute('aria-pressed', String(st.run));
    if (I.same) {
      ['an', 'ca', 'all'].forEach((k) => { f(k).textContent = '—'; });
      f('E').textContent = '0.00 V（兩極相同，無電流）'; f('mass').textContent = '不變';
      f('note').textContent = '兩杯用同一種金屬時沒有電位差，不會產生電流；化學電池須以活性不同的兩種金屬（或電極）組成。';
      return;
    }
    const A = MET[I.an], Cc = MET[I.ca], n = A.z === Cc.z ? A.z : A.z * Cc.z, a = n / A.z, c = n / Cc.z;
    const co = (k, s) => (k === 1 ? '' : k) + s;
    const sg = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);
    f('E').textContent = `(${sg(Cc.E)}) − (${sg(A.E)}) = ${(Cc.E - A.E).toFixed(2)} V`;
    f('an').textContent = `${I.an} → ${ion(I.an)} + ${co(A.z, 'e⁻')}`;
    f('ca').textContent = `${ion(I.ca)} + ${co(Cc.z, 'e⁻')} → ${I.ca}`;
    f('all').textContent = `${co(a, I.an)} + ${co(c, ion(I.ca))} → ${co(a, ion(I.an))} + ${co(c, I.ca)}（轉移 ${n} mol e⁻）`;
    f('mass').textContent = `每轉移 ${n} mol e⁻：${I.an} 極減少 ${(a * A.M).toFixed(1)} g，${I.ca} 極增加 ${(c * Cc.M).toFixed(1)} g`;
    f('note').textContent = `活性較大的 ${I.an}（E° 較小）失去電子為負極；電子經導線流向 ${I.ca}，不經過溶液與鹽橋。鹽橋中 NO₃⁻ 移向負極杯、K⁺ 移向正極杯，維持兩杯電中性。`;
  }
  el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { st[b.dataset.s] = b.dataset.m; draw(); }));
  let last = 0;
  function frame(now) {
    if (!el.isConnected || !st.run) return;
    if (last) st.t += Math.min(0.05, (now - last) / 1000);
    last = now; moving(); requestAnimationFrame(frame);
  }
  el.querySelector('[data-a="run"]').addEventListener('click', () => { st.run = !st.run; draw(); if (st.run) { last = 0; requestAnimationFrame(frame); } });
  draw();
  if (st.run) requestAnimationFrame(frame);
};
