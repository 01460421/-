(window.SIMS = window.SIMS || {}).ph = function (el, opt) {
  const SUBS = [[2.0, '胃液', 0], [2.2, '檸檬汁', 1], [2.5, '食醋', 2], [5.0, '黑咖啡', 0], [5.6, '雨水', 1], [6.6, '牛奶', 2], [7.4, '血液', 0], [8.1, '海水', 1], [11.2, '氨水', 2], [12.5, '漂白水', 1]];
  // [名稱, 下限, 上限, 酸型色, 中間色, 鹼型色, 顏色名]
  const IND = [
    ['甲基橙', 3.1, 4.4, 'var(--red)', 'var(--c-C)', 'var(--sun)', ['紅', '橙', '黃']],
    ['甲基紅', 4.4, 6.2, 'var(--red)', 'var(--c-C)', 'var(--sun)', ['紅', '橙', '黃']],
    ['石蕊', 4.5, 8.3, 'var(--red)', 'var(--c-X)', 'var(--c-P)', ['紅', '紫', '藍']],
    ['BTB', 6.0, 7.6, 'var(--sun)', 'var(--green)', 'var(--c-P)', ['黃', '綠', '藍']],
    ['酚酞', 8.2, 10.0, 'var(--card)', null, 'var(--red)', ['無色', '淡粉紅', '粉紅']],
  ];
  const st = { lg: -3 }; // log10[H+]
  const uid = 'p' + Math.random().toString(36).slice(2, 8);
  el.innerHTML = `<div class="sim-head"><b>pH、pOH 與指示劑</b><span>拖動滑桿改變 [H⁺]（對數刻度），看 pH、pOH、[OH⁻] 與各指示劑的顏色。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="pH 尺度與指示劑變色範圍"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>[H⁺]</span><input type="range" min="-14" max="0" step="0.05"><output></output></label>
    <div class="ops"><button type="button" data-d="1">[H⁺] × 10</button><button type="button" data-d="-1">[H⁺] ÷ 10</button><button type="button" data-d="0">中性</button></div>
    <div class="facts">
      <div class="fact"><span>pH = −log[H⁺]</span><b data-f="ph"></b></div><div class="fact"><span>pOH = 14.00 − pH</span><b data-f="poh"></b></div>
      <div class="fact"><span>[OH⁻] = 1.0×10⁻¹⁴ / [H⁺]</span><b data-f="oh"></b></div><div class="fact"><span>25 °C 時溶液為</span><b data-f="t"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>指示劑顏色</span><b data-f="ind" style="font-size:.88rem"></b></div>
    </div>
    <p class="sim-note">pH 每差 1，[H⁺] 差 10 倍；25 °C 時 [H⁺][OH⁻] = 1.0×10⁻¹⁴，pH + pOH = 14.00。指示劑只能判斷 pH 落在某一範圍，變色範圍並不以 7 為中心。</p>
  </div></div>`;
  const svg = el.querySelector('svg'), rng = el.querySelector('input'), f = (k) => el.querySelector(`[data-f="${k}"]`);
  const sup = (n) => String(n).split('').map((c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])).join('');
  const sci = (lg) => { let e = Math.floor(lg + 1e-9), m = 10 ** (lg - e); if (m >= 9.95) { m /= 10; e += 1; } return `${m.toFixed(1)}×10${sup(e)} M`; };
  const L = 72, R = 404, X = (p) => L + (p / 14) * (R - L), BY = 70;
  const blend = (I, p) => {
    if (p <= I[1]) return { c: I[3], n: I[6][0] };
    if (p >= I[2]) return { c: I[5], n: I[6][2] };
    const u = (p - I[1]) / (I[2] - I[1]);
    if (!I[4]) return { c: I[5], o: u, base: I[3], n: I[6][1] };
    return u < 0.5 ? { c: I[4], o: u * 2, base: I[3], n: I[6][1] } : { c: I[5], o: (u - 0.5) * 2, base: I[4], n: I[6][1] };
  };
  const stop = (o, c, op) => `<stop offset="${o}" style="stop-color:${c};stop-opacity:${op == null ? 1 : op}"/>`;
  function draw() {
    const pH = -st.lg, pOH = 14 - pH;
    let s = '<defs>';
    s += `<linearGradient id="${uid}s">${stop(0, 'var(--red)')}${stop(0.25, 'var(--c-C)')}${stop(0.4, 'var(--sun)')}${stop(0.5, 'var(--green)')}${stop(0.7, 'var(--c-P)')}${stop(1, 'var(--c-X)')}</linearGradient>`;
    IND.forEach((I, i) => {
      const a = I[1] / 14, b = I[2] / 14, m = (a + b) / 2;
      s += `<linearGradient id="${uid}i${i}">${stop(0, I[3])}${stop(a, I[3])}${I[4] ? stop(m, I[4]) : ''}${stop(b, I[5])}${stop(1, I[5])}</linearGradient>`;
    });
    s += '</defs>';
    SUBS.forEach(([p, n, r]) => {
      const y = BY - 12 - r * 15;
      s += `<line x1="${X(p)}" x2="${X(p)}" y1="${y + 3}" y2="${BY}" stroke="var(--mute)" stroke-width=".8"/><text x="${X(p)}" y="${y}" font-size="11" text-anchor="middle" fill="var(--ink-2)">${n}</text>`;
    });
    s += `<rect x="${L}" y="${BY}" width="${R - L}" height="16" rx="3" fill="url(#${uid}s)"/>`;
    for (let p = 0; p <= 14; p++) s += `<text x="${X(p)}" y="${BY + 30}" font-size="11" text-anchor="middle" fill="var(--ink-2)">${p}</text>`;
    s += `<text x="4" y="${BY + 13}" font-size="12" font-weight="700" fill="var(--ink)">pH</text><text x="${L}" y="${BY + 44}" font-size="10" fill="var(--red)">← 酸性增強</text><text x="${R}" y="${BY + 44}" font-size="10" text-anchor="end" fill="var(--c-X)">鹼性增強 →</text>`;
    const y0 = 140;
    s += `<text x="4" y="${y0 - 8}" font-size="12" font-weight="700" fill="var(--teal)">指示劑變色範圍</text>`;
    const names = [];
    IND.forEach((I, i) => {
      const y = y0 + i * 30;
      s += `<text x="4" y="${y + 15}" font-size="12" fill="var(--ink)">${I[0]}</text><rect x="${L}" y="${y}" width="${R - L}" height="20" rx="3" fill="url(#${uid}i${i})" stroke="var(--line)"/>`;
      s += `<text x="${X(I[1])}" y="${y + 30}" font-size="9" text-anchor="middle" fill="var(--mute)">${I[1].toFixed(1)}</text><text x="${X(I[2])}" y="${y + 30}" font-size="9" text-anchor="middle" fill="var(--mute)">${I[2].toFixed(1)}</text>`;
      const c = blend(I, pH);
      names.push(`${I[0]} ${c.n}`);
      s += `<circle cx="${X(pH)}" cy="${y + 10}" r="9" fill="${c.base || c.c}" stroke="var(--ink)" stroke-width="1.5"/>`;
      if (c.base) s += `<circle cx="${X(pH)}" cy="${y + 10}" r="9" fill="${c.c}" fill-opacity="${c.o.toFixed(2)}"/>`;
    });
    s += `<line x1="${X(pH)}" x2="${X(pH)}" y1="${BY - 4}" y2="${y0 + 148}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".6"/>`;
    s += `<path d="M${X(pH)} ${BY + 18} l-7 10 h14 z" fill="var(--ink)"/>`;
    svg.innerHTML = s;
    rng.value = st.lg; rng.nextElementSibling.textContent = sci(st.lg);
    f('ph').textContent = pH.toFixed(2);
    f('poh').textContent = pOH.toFixed(2);
    f('oh').textContent = sci(-14 - st.lg);
    f('t').textContent = Math.abs(pH - 7) < 0.005 ? '中性' : pH < 7 ? '酸性' : '鹼性';
    f('ind').textContent = names.join('、');
  }
  rng.addEventListener('input', () => { st.lg = Number(rng.value); draw(); });
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { const d = Number(b.dataset.d); st.lg = d ? Math.min(0, Math.max(-14, Math.round((st.lg + d) * 100) / 100)) : -7; draw(); }));
  draw();
};
