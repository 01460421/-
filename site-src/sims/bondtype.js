(window.SIMS = window.SIMS || {}).bondtype = function (el, opt) {
  const EN = { H: 2.20, Li: 0.98, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.90, P: 2.19, S: 2.58, Cl: 3.16, K: 0.82, Ca: 1.00, Br: 2.96, I: 2.66 };
  const ZH = { H: '氫', Li: '鋰', C: '碳', N: '氮', O: '氧', F: '氟', Na: '鈉', Mg: '鎂', Al: '鋁', Si: '矽', P: '磷', S: '硫', Cl: '氯', K: '鉀', Ca: '鈣', Br: '溴', I: '碘' };
  const PRE = [['H', 'H'], ['C', 'H'], ['H', 'Cl'], ['H', 'F'], ['Al', 'Cl'], ['Na', 'Cl'], ['K', 'F']];
  const st = { a: 'H', b: 'Cl' };
  const uid = 'b' + Math.random().toString(36).slice(2, 8);
  const opts = Object.keys(EN).map((k) => `<option value="${k}">${k} ${ZH[k]}（${EN[k].toFixed(2)}）</option>`).join('');
  el.innerHTML = `<div class="sim-head"><b>電負度差與鍵型</b><span>選兩個元素，看電負度差 Δχ 落在哪一段，以及鍵結電子偏向哪一邊。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 270" role="img" aria-label="鍵結電子分布與電負度差尺"></svg></div>
  <div class="sim-ctl">
    <label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span>原子 A</span><select data-s="a">${opts}</select></label>
    <label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span>原子 B</span><select data-s="b">${opts}</select></label>
    <div class="ops">${PRE.map(([a, b]) => `<button type="button" data-a="${a}" data-b="${b}">${a}–${b}</button>`).join('')}</div>
    <div class="facts">
      <div class="fact"><span>電負度 χ</span><b data-f="x"></b></div>
      <div class="fact"><span>電負度差 Δχ</span><b data-f="d"></b></div>
      <div class="fact"><span>鍵型（概略判斷）</span><b data-f="t"></b></div>
      <div class="fact"><span>鍵結電子偏向</span><b data-f="s"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg');
  const f = (k) => el.querySelector(`[data-f="${k}"]`);
  const sa = el.querySelector('[data-s="a"]'), sb = el.querySelector('[data-s="b"]');
  const DMAX = 3.3, L = 30, R = 390, SY = 214;
  const sx = (d) => L + (d / DMAX) * (R - L);
  function draw() {
    const xa = EN[st.a], xb = EN[st.b], d = Math.abs(xa - xb), same = st.a === st.b;
    const type = d < 0.4 ? '非極性共價鍵' : d <= 1.7 ? '極性共價鍵' : '以離子鍵為主';
    const ion = 1 - Math.exp(-d * d / 4); // 偏移程度（示意）
    const neg = xa > xb ? 'a' : 'b'; // 電負度較大者
    const AX = 130, BX = 290, CY = 92;
    const share = 0.5 + 0.5 * ion; // 電子對靠近電負度大者的比例
    const ex = Math.min(Math.max(neg === 'a' ? BX + (AX - BX) * share : AX + (BX - AX) * share, AX + 32), BX - 32);
    let s = `<defs><radialGradient id="${uid}g"><stop offset="0" stop-color="var(--c-P)" stop-opacity=".55"/><stop offset="1" stop-color="var(--c-P)" stop-opacity="0"/></radialGradient></defs>`;
    const wa = neg === 'a' ? share : 1 - share, wb = 1 - wa;
    s += `<ellipse cx="${AX}" cy="${CY}" rx="${46 + 26 * wa}" ry="${40 + 22 * wa}" fill="url(#${uid}g)" opacity="${0.35 + wa}"/>`;
    s += `<ellipse cx="${BX}" cy="${CY}" rx="${46 + 26 * wb}" ry="${40 + 22 * wb}" fill="url(#${uid}g)" opacity="${0.35 + wb}"/>`;
    s += `<ellipse cx="${ex}" cy="${CY}" rx="${40 - 12 * ion}" ry="${30 - 6 * ion}" fill="url(#${uid}g)"/>`;
    [[AX, st.a, xa], [BX, st.b, xb]].forEach(([x, e, c], i) => {
      s += `<circle cx="${x}" cy="${CY}" r="24" fill="var(--card)" stroke="var(--ink-2)" stroke-width="1.5"/><text x="${x}" y="${CY + 6}" font-size="17" font-weight="700" text-anchor="middle" fill="var(--ink)">${e}</text>`;
      s += `<text x="${x}" y="${CY + 64}" font-size="13" text-anchor="middle" fill="var(--ink-2)">χ = ${c.toFixed(2)}</text>`;
      const isNeg = (i === 0) === (neg === 'a');
      const lab = same || d < 0.05 ? '' : d > 1.7 ? (isNeg ? '陰離子（−）' : '陽離子（+）') : isNeg ? 'δ−' : 'δ+';
      if (lab) s += `<text x="${x}" y="${CY - 40}" font-size="${d > 1.7 ? 12 : 16}" font-weight="700" text-anchor="middle" fill="${isNeg ? 'var(--c-P)' : 'var(--red)'}">${lab}</text>`;
    });
    s += `<circle cx="${ex - 5}" cy="${CY}" r="4" fill="var(--c-P)"/><circle cx="${ex + 5}" cy="${CY}" r="4" fill="var(--c-P)"/>`;
    s += `<text x="10" y="18" font-size="12" fill="var(--mute)">藍色雲：鍵結電子出現的區域（示意）；兩點：鍵結電子對</text>`;
    // scale
    const seg = [[0, 0.4, 'var(--c-B)', '非極性'], [0.4, 1.7, 'var(--sun)', '極性共價鍵'], [1.7, DMAX, 'var(--c-C)', '離子性為主']];
    seg.forEach(([a, b, c, n]) => { s += `<rect x="${sx(a)}" y="${SY - 14}" width="${sx(b) - sx(a)}" height="14" fill="${c}" opacity=".55"/><text x="${(sx(a) + sx(b)) / 2}" y="${SY - 30}" font-size="12" text-anchor="middle" fill="var(--ink-2)">${n}</text>`; });
    for (let v = 0; v <= 3; v += 0.5) s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${SY}" y2="${SY + 4}" stroke="var(--ink-2)"/><text x="${sx(v)}" y="${SY + 15}" font-size="11" text-anchor="middle" fill="var(--mute)">${v.toFixed(1)}</text>`;
    [0.4, 1.7].forEach((v) => { s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${SY - 18}" y2="${SY + 4}" stroke="var(--ink)" stroke-dasharray="3 2"/>`; });
    s += `<path d="M${sx(d)} ${SY - 16} l-6 -10 h12 z" fill="var(--ink)"/><text x="${Math.min(Math.max(sx(d), L + 30), R - 30)}" y="${SY + 32}" font-size="14" font-weight="700" text-anchor="middle" fill="var(--ink)">Δχ = ${d.toFixed(2)}</text>`;
    s += `<text x="${R}" y="${SY + 50}" font-size="11" text-anchor="end" fill="var(--mute)">界線 0.4、1.7 為概略值，鍵型連續變化</text>`;
    svg.innerHTML = s;
    sa.value = st.a; sb.value = st.b;
    el.querySelectorAll('[data-a]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.a === st.a && b.dataset.b === st.b)));
    f('x').textContent = `${st.a} ${xa.toFixed(2)}、${st.b} ${xb.toFixed(2)}`;
    f('d').textContent = `|${xa.toFixed(2)} − ${xb.toFixed(2)}| = ${d.toFixed(2)}`;
    f('t').textContent = type;
    f('s').textContent = d === 0 ? '均等共用' : d < 0.05 ? '近乎均等共用' : `${neg === 'a' ? st.a : st.b}（電負度較大）`;
    const pair = [st.a, st.b].sort().join('');
    f('note').textContent = pair === 'AlCl' ? 'AlCl₃ 的 Δχ = 1.55 雖接近 1.7，但約 180 °C 即昇華、以 Al₂Cl₆ 分子存在，性質偏向分子化合物：界線只是經驗值。'
      : pair === 'FH' ? 'H–F 的 Δχ = 1.78 略大於 1.7，但 HF 是分子化合物，H–F 為極性很大的共價鍵：0.4、1.7 只是概略界線，仍須配合物質性質判斷。'
      : pair === 'CS' || pair === 'HP' ? '兩者電負度幾乎相同，鍵近似非極性；「金屬＋非金屬＝離子鍵」只是初步判斷，仍以 Δχ 與性質為準。'
        : d > 1.7 ? '電負度差很大，電子幾乎完全轉移到電負度大的原子，形成陰、陽離子，以離子鍵為主。'
          : d >= 0.4 ? '電子對偏向電負度大的原子，兩端帶部分電荷 δ+、δ−，為極性共價鍵；Δχ 愈大，鍵的極性愈大。'
            : '電負度差很小，電子對（近乎）均等共用，為非極性共價鍵。';
  }
  sa.addEventListener('change', () => { st.a = sa.value; draw(); });
  sb.addEventListener('change', () => { st.b = sb.value; draw(); });
  el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { st.a = b.dataset.a; st.b = b.dataset.b; draw(); }));
  draw();
};
