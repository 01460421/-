(window.SIMS = window.SIMS || {}).titration = function (el, opt) {
  const KW = 1e-14, KA = 1.8e-5, C = 0.100, VA = 25.0;
  const MODES = {
    sa: { t: '強酸＋強鹼', flask: 'HCl', tit: 'NaOH', s: '0.100 M NaOH 滴定 25.0 mL 0.100 M HCl' },
    sb: { t: '強鹼＋強酸', flask: 'NaOH', tit: 'HCl', s: '0.100 M HCl 滴定 25.0 mL 0.100 M NaOH' },
    wa: { t: '弱酸（醋酸）＋強鹼', flask: 'CH₃COOH', tit: 'NaOH', s: '0.100 M NaOH 滴定 25.0 mL 0.100 M 醋酸（Ka＝1.8×10⁻⁵）' },
  };
  const IND = {
    php: { n: '酚酞', lo: 8.2, hi: 10.0, a: 'var(--card)', b: 'var(--red)', cn: ['無色', '淡粉紅', '粉紅'] },
    btb: { n: '溴瑞香草酚藍', lo: 6.0, hi: 7.6, a: 'var(--sun)', m: 'var(--green)', b: 'var(--c-P)', cn: ['黃', '綠', '藍'] },
    mo: { n: '甲基橙', lo: 3.1, hi: 4.4, a: 'var(--red)', m: 'var(--c-C)', b: 'var(--sun)', cn: ['紅', '橙', '黃'] },
  };
  const st = { m: MODES[opt.mode] ? opt.mode : 'sa', ind: 'php', v: 20.0 };
  const sup = (n) => String(n).split('').map((c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])).join('');
  const sci = (x) => { let e = Math.floor(Math.log10(x)), m = x / 10 ** e; if (m >= 9.995) { m /= 10; e++; } return m.toFixed(2) + '×10' + sup(e) + ' M'; };
  function pH(m, v) {
    const V = VA + v;
    if (m === 'wa') {
      const na = (C * v) / V, ca = (C * VA) / V;
      let lo = -14, hi = 0;
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2, h = 10 ** mid; const g = na + h - KW / h - (ca * KA) / (KA + h); if (g > 0) hi = mid; else lo = mid; }
      return -(lo + hi) / 2;
    }
    const acid = m === 'sa' ? (C * VA) / V : (C * v) / V, base = m === 'sa' ? (C * v) / V : (C * VA) / V, D = acid - base;
    return -Math.log10((D + Math.sqrt(D * D + 4 * KW)) / 2);
  }
  el.innerHTML = `<div class="sim-head"><b>酸鹼滴定曲線</b><span>拖動滑桿（或逐滴加入）滴定液，看 pH 曲線、當量點附近的陡升與錐形瓶中指示劑的顏色。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="滴定裝置與滴定曲線"></svg></div>
  <div class="sim-ctl">
    <div class="ops">${Object.keys(MODES).map((k) => `<button type="button" data-m="${k}">${MODES[k].t}</button>`).join('')}</div>
    <div class="ops">${Object.keys(IND).map((k) => `<button type="button" data-i="${k}">${IND[k].n}</button>`).join('')}</div>
    <label class="sl"><span>滴入體積</span><input type="range" min="0" max="50" step="0.05"><output></output></label>
    <div class="ops"><button type="button" data-d="-1">−1 mL</button><button type="button" data-d="-0.05">−1 滴</button><button type="button" data-d="0.05">+1 滴（0.05 mL）</button><button type="button" data-d="1">+1 mL</button></div>
    <div class="facts">
      <div class="fact"><span>錐形瓶 pH</span><b data-f="ph"></b></div><div class="fact"><span>指示劑顏色</span><b data-f="col"></b></div>
      <div class="fact"><span data-f="l1"></span><b data-f="n1"></b></div><div class="fact"><span data-f="l2"></span><b data-f="n2"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>反應進度</span><b data-f="stt" style="font-size:.9rem"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), rng = el.querySelector('input[type=range]'), f = (k) => el.querySelector(`[data-f="${k}"]`);
  const GX = 150, GY = 24, GW = 256, GH = 232, px = (v) => GX + (v / 50) * GW, py = (p) => GY + GH - (p / 14) * GH;
  const col = (I, p) => {
    if (p <= I.lo) return [I.a, null, 0, I.cn[0]]; if (p >= I.hi) return [I.b, null, 0, I.cn[2]];
    const u = (p - I.lo) / (I.hi - I.lo);
    if (!I.m) return [I.a, I.b, u, I.cn[1]];
    return u < 0.5 ? [I.a, I.m, u * 2, I.cn[1]] : [I.m, I.b, (u - 0.5) * 2, I.cn[1]];
  };
  function draw() {
    const M = MODES[st.m], I = IND[st.ind], p = pH(st.m, st.v), eqp = pH(st.m, 25);
    let s = '';
    // indicator band and axes
    s += `<rect x="${GX}" y="${GY}" width="${GW}" height="${GH}" fill="var(--card)" stroke="var(--line)"/>`;
    s += `<rect x="${GX}" y="${py(I.hi)}" width="${GW}" height="${py(I.lo) - py(I.hi)}" fill="${I.m || I.b}" opacity=".18"/><text x="${GX + GW - 4}" y="${py(I.hi) - 3}" font-size="10" text-anchor="end" fill="var(--ink-2)">${I.n} 變色範圍 ${I.lo.toFixed(1)}–${I.hi.toFixed(1)}</text>`;
    for (let q = 0; q <= 14; q += 2) s += `<line x1="${GX}" x2="${GX + GW}" y1="${py(q)}" y2="${py(q)}" stroke="var(--line)" stroke-width=".6"/><text x="${GX - 4}" y="${py(q) + 4}" font-size="10" text-anchor="end" fill="var(--mute)">${q}</text>`;
    for (let v = 0; v <= 50; v += 10) s += `<text x="${px(v)}" y="${GY + GH + 13}" font-size="10" text-anchor="middle" fill="var(--mute)">${v}</text>`;
    s += `<text x="${GX + GW}" y="${GY + GH + 27}" font-size="11" text-anchor="end" fill="var(--ink-2)">加入 0.100 M ${M.tit} 體積（mL）</text><text x="${GX - 4}" y="${GY - 4}" font-size="11" text-anchor="end" fill="var(--ink-2)">pH</text>`;
    s += `<line x1="${px(25)}" x2="${px(25)}" y1="${GY}" y2="${GY + GH}" stroke="var(--mute)" stroke-dasharray="4 3"/><circle cx="${px(25)}" cy="${py(eqp)}" r="4" fill="none" stroke="var(--ink)" stroke-width="1.5"/><text x="${px(25) + 5}" y="${py(eqp) + (st.m === 'sb' ? -6 : 14)}" font-size="10" fill="var(--ink)">當量點 25.0 mL，pH ${eqp.toFixed(2)}</text>`;
    let d = ''; for (let v = 0; v <= st.v + 1e-9; v += 0.1) d += (v ? 'L' : 'M') + px(v).toFixed(1) + ' ' + py(pH(st.m, v)).toFixed(1);
    if (st.v > 0) d += 'L' + px(st.v).toFixed(1) + ' ' + py(p).toFixed(1);
    s += `<path d="${d}" fill="none" stroke="var(--red)" stroke-width="2.5"/><circle cx="${px(st.v)}" cy="${py(p)}" r="5" fill="var(--red)" stroke="var(--card)" stroke-width="1.5"/>`;
    // burette and flask
    const lv = 18 + (st.v / 50) * 120;
    s += `<rect x="50" y="10" width="16" height="140" fill="var(--card)" stroke="var(--ink-2)"/><rect x="51" y="${lv}" width="14" height="${148 - lv}" fill="var(--c-P)" opacity=".18"/>`;
    for (let v = 0; v <= 50; v += 10) s += `<line x1="50" x2="56" y1="${18 + (v / 50) * 120}" y2="${18 + (v / 50) * 120}" stroke="var(--ink-2)"/><text x="46" y="${22 + (v / 50) * 120}" font-size="8" text-anchor="end" fill="var(--mute)">${v}</text>`;
    s += `<path d="M54 150 h8 l-2 14 h-4 z" fill="var(--ink-2)"/><text x="72" y="40" font-size="10" fill="var(--ink-2)">${M.tit}</text>`;
    const [c1, c2, u, cn] = col(I, p);
    const flask = 'M44 196 V176 H72 V196 L104 262 Q106 268 100 268 H16 Q10 268 12 262 Z';
    s += `<path d="M30 226 H86 L104 262 Q106 268 100 268 H16 Q10 268 12 262 Z" fill="${c1}"/>`;
    if (c2) s += `<path d="M30 226 H86 L104 262 Q106 268 100 268 H16 Q10 268 12 262 Z" fill="${c2}" fill-opacity="${u.toFixed(2)}"/>`;
    s += `<line x1="30" x2="86" y1="226" y2="226" stroke="var(--c-P)" stroke-width="1.5" opacity=".6"/>`;
    s += `<path d="${flask}" fill="none" stroke="var(--ink-2)" stroke-width="2"/><text x="58" y="286" font-size="10" text-anchor="middle" fill="var(--ink-2)">${M.flask} 25.0 mL</text>`;
    svg.innerHTML = s;
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.m)));
    el.querySelectorAll('[data-i]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.i === st.ind)));
    rng.value = st.v; rng.nextElementSibling.textContent = st.v.toFixed(2) + ' mL';
    const n0 = C * VA / 1000, nt = (C * st.v) / 1000, mm = (x) => (x * 1000).toFixed(3) + ' mmol';
    f('ph').textContent = p.toFixed(2);
    f('col').textContent = `${I.n}：${cn}`;
    const acidFlask = st.m !== 'sb';
    f('l1').textContent = st.m === 'wa' ? '醋酸 HA 原有' : acidFlask ? 'H⁺ 原有（HCl）' : 'OH⁻ 原有（NaOH）';
    f('l2').textContent = acidFlask ? 'OH⁻ 加入（NaOH）' : 'H⁺ 加入（HCl）';
    f('n1').textContent = mm(n0); f('n2').textContent = mm(nt);
    const diff = n0 - nt, V = VA + st.v;
    f('stt').textContent = Math.abs(diff) < 1e-9 ? '當量點：恰好完全中和' : diff > 0
      ? (st.m === 'wa' ? `當量點前：剩 HA ${mm(diff)}，生成 A⁻ ${mm(nt)}` : `當量點前：剩 ${acidFlask ? 'H⁺' : 'OH⁻'} ${mm(diff)}，濃度 ${sci(diff / (V / 1000))}`)
      : `當量點後：${acidFlask ? 'OH⁻' : 'H⁺'} 過量 ${mm(-diff)}，濃度 ${sci(-diff / (V / 1000))}`;
    const lo = pH(st.m, 24.5), hi = pH(st.m, 25.5), a = Math.min(lo, hi), b = Math.max(lo, hi);
    const ok = I.lo >= a - 0.05 && I.hi <= b + 0.05;
    f('note').textContent = `${M.s}。24.5→25.5 mL 間 pH 由 ${lo.toFixed(1)} 變到 ${hi.toFixed(1)}；${I.n}（${I.lo.toFixed(1)}–${I.hi.toFixed(1)}）${ok ? '落在陡升段內，可用' : '不在陡升段內，不適用'}。` + (st.m === 'wa' ? `半當量點（12.5 mL）pH ≈ pKa = ${pH('wa', 12.5).toFixed(2)}；當量點溶液為 CH₃COONa，pH > 7。` : '強酸強鹼的當量點 pH = 7.00。');
  }
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; st.ind = st.m === 'wa' ? 'php' : st.ind; draw(); }));
  el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { st.ind = b.dataset.i; draw(); }));
  rng.addEventListener('input', () => { st.v = Number(rng.value); draw(); });
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { st.v = Math.min(50, Math.max(0, Math.round((st.v + Number(b.dataset.d)) * 100) / 100)); draw(); }));
  draw();
};
