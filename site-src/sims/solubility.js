(window.SIMS = window.SIMS || {}).solubility = function (el, opt) {
  // g / 100 g 水，0–80 °C 每 10 °C（表 C6-1 與文獻值）
  const D = {
    KNO3: { f: 'KNO₃', c: 'var(--red)', s: [13.3, 20.9, 31.6, 45.8, 63.9, 85.5, 110, 138, 169] },
    NaNO3: { f: 'NaNO₃', c: 'var(--c-X)', s: [73, 80.8, 87.6, 94.9, 102, 114, 122, 134, 148] },
    KCl: { f: 'KCl', c: 'var(--c-B)', s: [28.0, 31.2, 34.2, 37.2, 40.1, 42.6, 45.8, 48.8, 51.3] },
    NaCl: { f: 'NaCl', c: 'var(--c-P)', s: [35.7, 35.8, 35.9, 36.1, 36.4, 36.7, 37.0, 37.5, 37.9] },
  };
  const st = { k: D[opt.mode] ? opt.mode : 'KNO3', m: 50, T: 20 };
  const S = (k, T) => { const a = D[k].s, i = Math.min(7, Math.floor(T / 10)); return a[i] + ((a[i + 1] - a[i]) * (T - 10 * i)) / 10; };
  const Tsat = (k, m) => { const a = D[k].s; if (m < a[0]) return null; for (let i = 0; i < 8; i++) if (m <= a[i + 1]) return 10 * i + (10 * (m - a[i])) / (a[i + 1] - a[i]); return null; };
  el.innerHTML = `<div class="sim-head"><b>溶解度曲線與冷卻析晶</b><span>選溶質，設定 100 g 水中溶入的質量與溫度（或直接點圖），看溶液是否飽和、析出多少晶體。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="溶解度曲線"></svg></div>
  <div class="sim-ctl">
    <div class="ops">${Object.keys(D).map((k) => `<button type="button" data-k="${k}">${D[k].f}</button>`).join('')}</div>
    <label class="sl"><span>溶入質量</span><input type="range" data-i="m" min="0" step="0.1"><output></output></label>
    <label class="sl"><span>溫度</span><input type="range" data-i="T" min="0" max="80" step="0.5"><output></output></label>
    <div class="facts">
      <div class="fact"><span>此溫度溶解度 S</span><b data-f="S"></b></div><div class="fact"><span>狀態</span><b data-f="st"></b></div>
      <div class="fact"><span>析出晶體（每 100 g 水）</span><b data-f="x"></b></div><div class="fact"><span>開始析出的溫度</span><b data-f="q"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>溶液的重量百分率濃度</span><b data-f="p"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), f = (k) => el.querySelector(`[data-f="${k}"]`), im = el.querySelector('[data-i="m"]'), iT = el.querySelector('[data-i="T"]');
  const L = 46, R = 408, T0 = 14, B = 256, YM = 180;
  const X = (t) => L + (t / 80) * (R - L), Y = (v) => B - (v / YM) * (B - T0);
  function draw() {
    const k = st.k, s = S(k, st.T), m = st.m, q = Tsat(k, m), over = m > s + 0.05, sat = Math.abs(m - s) <= 0.05;
    const dis = Math.min(m, s);
    let g = `<rect x="${L}" y="${T0}" width="${R - L}" height="${B - T0}" fill="var(--card)" stroke="var(--line)"/>`;
    for (let t = 0; t <= 80; t += 10) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${T0}" y2="${B}" stroke="var(--line)" stroke-width=".6"/><text x="${X(t)}" y="${B + 14}" font-size="11" text-anchor="middle" fill="var(--mute)">${t}</text>`;
    for (let v = 0; v <= YM; v += 20) g += `<line x1="${L}" x2="${R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width=".6"/><text x="${L - 4}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="var(--mute)">${v}</text>`;
    g += `<text x="${(L + R) / 2}" y="${B + 30}" font-size="12" text-anchor="middle" fill="var(--ink-2)">溫度（°C）</text><text x="12" y="${(T0 + B) / 2}" font-size="12" text-anchor="middle" fill="var(--ink-2)" transform="rotate(-90 12 ${(T0 + B) / 2})">溶解度（g／100 g 水）</text>`;
    Object.keys(D).forEach((j) => {
      const on = j === k, d = D[j].s.map((v, i) => (i ? 'L' : 'M') + X(10 * i) + ' ' + Y(v).toFixed(1)).join('');
      g += `<path d="${d}" fill="none" stroke="${D[j].c}" stroke-width="${on ? 3 : 1.5}" opacity="${on ? 1 : 0.35}"/><text x="${X(80) - 3}" y="${Y(D[j].s[8]) + (j === 'NaCl' ? 14 : j === 'KCl' ? -4 : -5)}" font-size="11" text-anchor="end" fill="${D[j].c}" opacity="${on ? 1 : 0.6}" font-weight="${on ? 700 : 400}">${D[j].f}</text>`;
    });
    if (q != null && q > st.T + 0.05) {
      g += `<line x1="${X(80)}" x2="${X(q)}" y1="${Y(m)}" y2="${Y(m)}" stroke="var(--ink-2)" stroke-dasharray="4 3"/>`;
      let d = ''; for (let t = q; t >= st.T - 1e-9; t -= 0.5) d += (d ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(S(k, t)).toFixed(1);
      d += 'L' + X(st.T).toFixed(1) + ' ' + Y(s).toFixed(1);
      g += `<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-dasharray="6 3"/>`;
      g += `<circle cx="${X(q)}" cy="${Y(m)}" r="4.5" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/><text x="${X(q) + 6}" y="${Y(m) - 7}" font-size="11" fill="var(--ink)" stroke="var(--card)" stroke-width="3" paint-order="stroke">開始析出 ${q.toFixed(1)} °C</text>`;
      g += `<line x1="${X(st.T)}" x2="${X(st.T)}" y1="${Y(m)}" y2="${Y(s)}" stroke="var(--c-C)" stroke-width="3"/><text x="${X(st.T) + (st.T < 16 ? 8 : -8)}" y="${(Y(m) + Y(s)) / 2 + 4}" text-anchor="${st.T < 16 ? 'start' : 'end'}" font-size="12" fill="var(--c-C)" font-weight="700" stroke="var(--card)" stroke-width="3" paint-order="stroke">析出 ${(m - s).toFixed(1)} g</text>`;
      g += `<circle cx="${X(st.T)}" cy="${Y(m)}" r="4" fill="none" stroke="var(--c-C)" stroke-width="2"/>`;
    }
    g += `<circle data-pt="1" cx="${X(st.T)}" cy="${Y(dis)}" r="7" fill="var(--sun)" stroke="var(--ink)" stroke-width="2"/>`;
    svg.innerHTML = g;
    el.querySelectorAll('[data-k]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    im.max = D[k].s[8]; im.value = m; iT.value = st.T;
    im.nextElementSibling.textContent = m.toFixed(1) + ' g'; iT.nextElementSibling.textContent = st.T.toFixed(1) + ' °C';
    f('S').textContent = s.toFixed(1) + ' g';
    f('st').textContent = sat ? '飽和' : over ? '飽和＋析出晶體' : '未飽和';
    f('x').textContent = over ? `${m.toFixed(1)} − ${s.toFixed(1)} = ${(m - s).toFixed(1)} g` : '0 g';
    f('q').textContent = q == null ? '0 °C 以上皆不析出' : q.toFixed(1) + ' °C';
    f('p').textContent = `${dis.toFixed(1)} ÷ (100 + ${dis.toFixed(1)}) × 100% = ${((dis / (100 + dis)) * 100).toFixed(1)}%`;
    f('note').textContent = over
      ? `溶質超過此溫度的溶解度：降溫時先沿水平線（組成不變）到曲線，再沿曲線析出晶體；溶液保持飽和，濃度由溶解度決定。（若未析出則為過飽和溶液，不穩定）`
      : k === 'NaCl' ? 'NaCl 的溶解度幾乎不隨溫度改變，冷卻析出的量很少，宜以蒸發結晶回收（海水曬鹽）。'
        : '曲線下方為未飽和溶液：降溫時組成不變，點水平向左移動，碰到曲線才開始析出。KNO₃ 斜率大，宜以冷卻結晶回收。';
  }
  el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { st.k = b.dataset.k; st.m = { KNO3: 50, NaNO3: 110, KCl: 40, NaCl: 37 }[st.k]; draw(); }));
  im.addEventListener('input', () => { st.m = Number(im.value); draw(); });
  iT.addEventListener('input', () => { st.T = Number(iT.value); draw(); });
  let drag = false;
  const pick = (e) => { const r = svg.getBoundingClientRect(), vx = ((e.clientX - r.left) / r.width) * 420, vy = ((e.clientY - r.top) / r.height) * 300; st.T = Math.round(Math.min(80, Math.max(0, ((vx - L) / (R - L)) * 80)) * 2) / 2; st.m = Math.round(Math.min(D[st.k].s[8], Math.max(0, ((B - vy) / (B - T0)) * YM)) * 10) / 10; draw(); };
  svg.addEventListener('pointerdown', (e) => { drag = true; svg.setPointerCapture(e.pointerId); pick(e); });
  svg.addEventListener('pointermove', (e) => { if (drag) pick(e); });
  svg.addEventListener('pointerup', () => { drag = false; });
  draw();
};
