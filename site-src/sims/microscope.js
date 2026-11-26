(window.SIMS = window.SIMS || {}).microscope = function (el, opt) {
  const uid = 'mc' + Math.random().toString(36).slice(2, 8);
  const OCS = [10, 15], OBJS = [4, 10, 40, 100];
  const L = 0.1, H = 0.05; // 標本細胞的實際長、寬（mm）
  let oc = opt.ocular || 10, ob = opt.objective || 10, light = false, prevM = null;
  const btns = (arr, key, cur) => arr.map((v) => `<button type="button" data-${key}="${v}" aria-pressed="${v === cur}">${v}×</button>`).join('');
  el.innerHTML = `<style>.sim[data-sim="microscope"] .grp{display:grid;gap:4px}.sim[data-sim="microscope"] .grp small{color:var(--mute);font-size:.78rem}</style>
  <div class="sim-head"><b>顯微鏡的倍率與視野</b><span>轉換物鏡或目鏡，看總倍率、視野直徑與視野中的細胞如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 300 300" role="img" aria-label="顯微鏡視野"></svg></div>
  <div class="sim-ctl">
    <div class="grp"><small>目鏡</small><div class="ops" data-g="oc">${btns(OCS, 'oc', oc)}</div></div>
    <div class="grp"><small>物鏡（轉旋轉盤；100× 為油鏡）</small><div class="ops" data-g="ob">${btns(OBJS, 'ob', ob)}</div></div>
    <div class="ops"><button type="button" data-light aria-pressed="false">開大光圈／調亮光源</button></div>
    <div class="facts">
      <div class="fact"><span>總倍率 M ＝ 目鏡 × 物鏡</span><b data-f="m"></b></div>
      <div class="fact"><span>視野直徑（40× 時為 4 mm）</span><b data-f="d"></b></div>
      <div class="fact"><span>直徑上排列的細胞數</span><b data-f="n"></b></div>
      <div class="fact"><span>估計細胞長 ＝ 直徑 ÷ 個數</span><b data-f="s"></b></div>
      <div class="fact"><span>佈滿視野的細胞數（約）</span><b data-f="a"></b></div>
      <div class="fact"><span>視野亮度</span><b data-f="b"></b></div>
    </div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg');
  const fmt = (x, d) => (+x.toFixed(d)).toString();
  function draw() {
    const M = oc * ob, D = 4 * 40 / M; // mm
    const R = 132, cx = 150, cy = 146, s = 2 * R / D; // px per mm
    const Ls = L * s, Hs = H * s, sw = Math.max(0.5, Math.min(3, Hs * 0.07));
    const N = D / L, nArea = Math.PI * D * D / 4 / (L * H);
    let dark = 0.55 * Math.log(M / 40) / Math.log(1500 / 40);
    dark = Math.max(0, Math.min(0.55, dark)) * (light ? 0.3 : 1);
    const nucR = Math.min(Hs * 0.22, Ls * 0.15);
    const pat = `<pattern id="${uid}p" patternUnits="userSpaceOnUse" x="${cx}" y="${cy - Hs / 2}" width="${Ls}" height="${2 * Hs}">
      <rect x="0" y="0" width="${Ls}" height="${Hs}" fill="var(--card)" stroke="var(--c-E)" stroke-width="${sw}"/>
      <rect x="${-Ls / 2}" y="${Hs}" width="${Ls}" height="${Hs}" fill="var(--card)" stroke="var(--c-E)" stroke-width="${sw}"/>
      <rect x="${Ls / 2}" y="${Hs}" width="${Ls}" height="${Hs}" fill="var(--card)" stroke="var(--c-E)" stroke-width="${sw}"/>
      <circle cx="${Ls * 0.62}" cy="${Hs * 0.5}" r="${nucR}" fill="var(--c-E)" opacity=".75"/>
      <circle cx="${Ls * 0.12}" cy="${Hs * 1.5}" r="${nucR}" fill="var(--c-E)" opacity=".75"/>
      <circle cx="${Ls * 1.12}" cy="${Hs * 1.5}" r="${nucR}" fill="var(--c-E)" opacity=".75"/></pattern>`;
    let row = '';
    const k = Math.ceil(N / 2) + 1;
    for (let i = -k; i < k; i++) row += `<rect x="${cx + i * Ls}" y="${cy - Hs / 2}" width="${Ls}" height="${Hs}" fill="var(--sun)" opacity="${i % 2 ? 0.45 : 0.3}"/>`;
    svg.innerHTML = `<defs>${pat}<clipPath id="${uid}c"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>
      <rect x="0" y="0" width="300" height="300" fill="var(--ink)"/>
      <g clip-path="url(#${uid}c)"><rect x="0" y="0" width="300" height="300" fill="url(#${uid}p)"/>${row}
        <line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="var(--red)" stroke-width="1.2" stroke-dasharray="5 4"/>
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="var(--ink)" opacity="${dark.toFixed(3)}"/></g>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--mute)" stroke-width="2"/>
      <text x="150" y="293" text-anchor="middle" font-size="12" fill="var(--card)">${M}×　視野直徑 ${fmt(D, 2)} mm（紅虛線）</text>`;
    const nTxt = N >= 10 ? Math.round(N) : fmt(N, 1), est = D * 1000 / +nTxt;
    q('[data-f="m"]').textContent = `${oc} × ${ob} = ${M}×`;
    q('[data-f="d"]').textContent = `4 × 40/${M} = ${fmt(D, 2)} mm`;
    q('[data-f="n"]').textContent = N >= 1 ? `約 ${nTxt} 個` : `不到 1 個（細胞比視野大）`;
    q('[data-f="s"]').textContent = `${fmt(D * 1000, 0)} μm ÷ ${nTxt} ≈ ${fmt(est, 0)} μm`;
    q('[data-f="a"]').textContent = nArea >= 10 ? `約 ${Math.round(nArea / 10) * 10} 個` : `約 ${fmt(nArea, 1)} 個`;
    q('[data-f="b"]').textContent = dark < 0.08 ? '明亮' : dark < 0.22 ? '稍暗' : dark < 0.38 ? '較暗' : '很暗';
    let note;
    if (prevM && prevM !== M) {
      const r = M / prevM, rs = r >= 1 ? `${fmt(r, 2)} 倍` : `1/${fmt(1 / r, 2)}`;
      note = `倍率由 ${prevM}× 變為 ${M}×（${rs}）：視野直徑與直徑上的細胞數都變為 ${r >= 1 ? '1/' + fmt(r, 2) : fmt(1 / r, 2) + ' 倍'}，佈滿視野的細胞數變為 ${r >= 1 ? '1/' + fmt(r * r, 2) : fmt(1 / (r * r), 2) + ' 倍'}（面積∝1/M²）${r > 1 ? '；視野變暗，可開大光圈或調亮光源' : ''}。`;
    } else note = '倍率是長度的倍數：視野直徑∝1/M，排成一列的細胞數∝1/M、佈滿視野的細胞數∝1/M²；細胞本身大小不變，估計值都約 100 μm。';
    q('[data-note]').textContent = note;
    prevM = M;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !el.contains(b)) return;
    if (b.dataset.oc) oc = +b.dataset.oc;
    if (b.dataset.ob) ob = +b.dataset.ob;
    if (b.hasAttribute('data-light')) { light = !light; b.setAttribute('aria-pressed', light); prevM = null; }
    el.querySelectorAll('[data-oc]').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.oc === oc));
    el.querySelectorAll('[data-ob]').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.ob === ob));
    draw();
  });
  draw();
};
