(window.SIMS = window.SIMS || {}).photosyn = function (el, opt) {
  const CO2 = { low: ['0.03%（大氣）', 9], high: ['0.1%（提高）', 18] };
  const TEMP = { 15: [0.6, 1.2], 25: [1, 2.4], 35: [1.15, 4.2] }; // [碳反應酵素的倍率, 呼吸速率]
  const A = 0.4, X0 = 46, X1 = 346, Y0 = 196, Y1 = 18, YMAX = 22, YMIN = -6;
  let I = opt.light != null ? +opt.light : 50, co2 = 'low', tc = 25, others = true;
  el.innerHTML = `<div class="sim-head"><b>光照強度與光合作用速率</b><span>拖動光照強度，切換 CO₂ 濃度與溫度，看哪一個因子限制速率。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 236" role="img" aria-label="光合作用速率曲線"></svg></div>
  <div class="sim-ctl">
    <label class="sl"><span>光照強度</span><input type="range" min="0" max="100" step="1" value="${I}"><output></output></label>
    <div class="ops">${Object.entries(CO2).map(([k, v]) => `<button type="button" data-co2="${k}">CO₂ ${v[0]}</button>`).join('')}</div>
    <div class="ops">${Object.keys(TEMP).map((k) => `<button type="button" data-t="${k}">${k} °C</button>`).join('')}<button type="button" data-oth aria-pressed="true">比較其他條件</button></div>
    <div class="facts">
      <div class="fact"><span>總光合速率（產生 O₂）</span><b data-f="g"></b></div>
      <div class="fact"><span>呼吸速率（消耗 O₂）</span><b data-f="r"></b></div>
      <div class="fact"><span>淨光合速率 ＝ 總 − 呼吸</span><b data-f="n"></b></div>
      <div class="fact"><span>光補償點／光飽和點</span><b data-f="c"></b></div>
      <div class="fact"><span>目前的限制因子</span><b data-f="l"></b></div>
    </div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg'), rng = q('input');
  const pmax = (c, t) => CO2[c][1] * TEMP[t][0];
  const gross = (i, c, t) => pmax(c, t) * Math.tanh(A * i / pmax(c, t));
  const comp = (c, t) => pmax(c, t) / A * Math.atanh(TEMP[t][1] / pmax(c, t));
  const sat = (c, t) => pmax(c, t) / A * Math.atanh(0.95);
  const sx = (i) => X0 + i / 100 * (X1 - X0), sy = (v) => Y0 - (v - YMIN) / (YMAX - YMIN) * (Y0 - Y1);
  const path = (f) => { let d = ''; for (let i = 0; i <= 100; i += 1) d += (i ? 'L' : 'M') + sx(i).toFixed(1) + ',' + sy(f(i)).toFixed(1); return d; };
  function render() {
    const R = TEMP[tc][1], P = gross(I, co2, tc), N = P - R, Ic = comp(co2, tc), Is = sat(co2, tc);
    let h = `<line x1="${X0}" x2="${X1}" y1="${sy(0)}" y2="${sy(0)}" stroke="var(--ink-2)"/><line x1="${X0}" x2="${X0}" y1="${Y0}" y2="${Y1 - 4}" stroke="var(--ink-2)"/>`;
    h += `<rect x="${X0}" y="${sy(0)}" width="${X1 - X0}" height="${Y0 - sy(0)}" fill="var(--red)" opacity=".06"/>`;
    [-5, 0, 5, 10, 15, 20].filter((v) => Math.abs(v + TEMP[tc][1]) > 1.6).forEach((v) => { h += `<text x="${X0 - 4}" y="${sy(v) + 4}" font-size="11.5" text-anchor="end" fill="var(--mute)">${v}</text>`; });
    [0, 25, 50, 75, 100].forEach((v) => { h += `<text x="${sx(v)}" y="${Y0 + 14}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">${v}</text>`; });
    h += `<text x="${X1}" y="${Y0 + 30}" font-size="12.5" text-anchor="end" fill="var(--ink)">光照強度（相對值）</text>`;
    h += `<text x="12" y="${(Y0 + Y1) / 2}" font-size="12.5" text-anchor="middle" fill="var(--ink)" transform="rotate(-90 12 ${(Y0 + Y1) / 2})">O₂ 淨釋放速率（相對值）</text>`;
    h += `<text x="${X1 - 4}" y="${sy(-4)}" font-size="11.5" text-anchor="end" fill="var(--red)">淨釋放為負：植物淨吸收 O₂</text>`;
    if (others) for (const c in CO2) for (const t in TEMP) if (!(c === co2 && +t === tc)) {
      const sameT = +t === tc, sameC = c === co2;
      if (!sameT && !sameC) continue;
      h += `<path d="${path((i) => gross(i, c, t) - TEMP[t][1])}" fill="none" stroke="${sameT ? 'var(--c-P)' : 'var(--c-C)'}" stroke-width="1.4" opacity=".55" stroke-dasharray="5 4"/>`;
    }
    h += `<path d="${path((i) => gross(i, co2, tc))}" fill="none" stroke="var(--green)" stroke-width="1.6" stroke-dasharray="2 3"/>`;
    const lg = [['var(--teal)', '', '淨光合速率（目前條件）'], ['var(--green)', '2 3', '總光合速率＝淨＋呼吸']];
    if (others) lg.push(['var(--c-P)', '5 4', `淨：CO₂ ${co2 === 'low' ? '0.1%' : '0.03%'}、${tc} °C`], ['var(--c-C)', '5 4', `淨：其他溫度、同 CO₂`]);
    lg.forEach(([c, da, t], k) => { const y = Y1 + 4 + k * 15; h += `<line x1="${X0 + 8}" x2="${X0 + 30}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="2.4" stroke-dasharray="${da}"/><text x="${X0 + 35}" y="${y + 4}" font-size="11" fill="var(--ink-2)">${t}</text>`; });
    h += `<path d="${path((i) => gross(i, co2, tc) - R)}" fill="none" stroke="var(--teal)" stroke-width="3.2"/>`;
    h += `<circle cx="${sx(Ic)}" cy="${sy(0)}" r="4.5" fill="var(--card)" stroke="var(--ink)" stroke-width="1.6"/><text x="${sx(Ic) + 4}" y="${sy(0) + 15}" font-size="11.5" fill="var(--ink)">光補償點</text>`;
    if (Is <= 100) h += `<line x1="${sx(Is)}" x2="${sx(Is)}" y1="${sy(pmax(co2, tc) - R) - 8}" y2="${sy(pmax(co2, tc) - R) + 8}" stroke="var(--ink)" stroke-width="1.6"/><text x="${sx(Is)}" y="${sy(pmax(co2, tc) - R) + 20}" font-size="11.5" text-anchor="middle" fill="var(--ink)">光飽和點</text>`;
    h += `<line x1="${sx(I)}" x2="${sx(I)}" y1="${sy(P)}" y2="${sy(N)}" stroke="var(--green)" stroke-width="2.5"/><circle cx="${sx(I)}" cy="${sy(P)}" r="3.5" fill="var(--green)"/><text x="${sx(I) + 5}" y="${sy((P + N) / 2) + 4}" font-size="11" fill="var(--green)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">呼吸 R＝${R}</text><circle cx="${sx(I)}" cy="${sy(N)}" r="6" fill="var(--red)" stroke="var(--card)" stroke-width="2"/>`;
    h += `<line x1="${X0}" x2="${X0 + 10}" y1="${sy(-R)}" y2="${sy(-R)}" stroke="var(--red)" stroke-width="2"/><text x="${X0 - 4}" y="${sy(-R) + 4}" font-size="10.5" text-anchor="end" fill="var(--red)" font-weight="700">−R</text>`;
    svg.innerHTML = h;
    q('output').textContent = I;
    q('[data-f="g"]').textContent = P.toFixed(1);
    q('[data-f="r"]').textContent = R.toFixed(1);
    q('[data-f="n"]').textContent = `${P.toFixed(1)} − ${R.toFixed(1)} = ${N.toFixed(1)}`;
    q('[data-f="c"]').textContent = `${Ic.toFixed(1)}／${Is <= 100 ? Is.toFixed(0) : '＞100'}`;
    const lim = I < Is * 0.6 ? '光照強度' : co2 === 'low' ? (tc === 15 ? 'CO₂ 濃度與溫度' : 'CO₂ 濃度') : tc === 15 ? '溫度（酵素）' : 'CO₂ 濃度或溫度';
    q('[data-f="l"]').textContent = lim;
    q('[data-note]').textContent = Math.abs(N) < 0.15 ? '在光補償點，光合作用產生的 O₂ 恰等於呼吸消耗的 O₂，淨氣體交換為零。'
      : N < 0 ? '光照低於補償點：仍有光合作用，但總光合速率小於呼吸速率，淨光合速率為負，有機物淨減少。'
      : lim === '光照強度' ? '光弱時速率受光照限制：各條件的曲線在弱光處幾乎重疊，提高 CO₂ 或溫度幫助不大。'
      : `已接近光飽和，再增加光照速率不再上升；此時限制因子變為${lim}，${co2 === 'low' ? '提高 CO₂ 可使曲線上移' : '曲線高度由碳反應的酵素速率決定'}。`;
    el.querySelectorAll('[data-co2]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.co2 === co2));
    el.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.t === tc));
  }
  rng.addEventListener('input', () => { I = +rng.value; render(); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.co2) co2 = b.dataset.co2;
    if (b.dataset.t) tc = +b.dataset.t;
    if (b.hasAttribute('data-oth')) { others = !others; b.setAttribute('aria-pressed', others); }
    render();
  });
  render();
};
