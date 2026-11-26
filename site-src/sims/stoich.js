(window.SIMS = window.SIMS || {}).stoich = function (el, opt) {
  // atoms: [dx, dy, element]; glyph about 20 px wide centred at 0,0
  const AT = { H: ['var(--card)', 3.6], O: ['var(--red)', 5.5], N: ['var(--c-P)', 5.5], C: ['var(--ink-2)', 5.5] };
  const SP = {
    H2: { f: 'H₂', M: 2.0, a: [[-3.5, 0, 'H'], [3.5, 0, 'H']] },
    O2: { f: 'O₂', M: 32.0, a: [[-5, 0, 'O'], [5, 0, 'O']] },
    N2: { f: 'N₂', M: 28.0, a: [[-5, 0, 'N'], [5, 0, 'N']] },
    H2O: { f: 'H₂O', M: 18.0, a: [[-6, 4, 'H'], [6, 4, 'H'], [0, -1, 'O']] },
    NH3: { f: 'NH₃', M: 17.0, a: [[-7, 3, 'H'], [7, 3, 'H'], [0, 6, 'H'], [0, -1, 'N']] },
    CH4: { f: 'CH₄', M: 16.0, a: [[-7, 0, 'H'], [7, 0, 'H'], [0, -7, 'H'], [0, 7, 'H'], [0, 0, 'C']] },
    CO2: { f: 'CO₂', M: 44.0, a: [[-6.5, 0, 'O'], [6.5, 0, 'O'], [0, 0, 'C']] },
  };
  const RX = {
    h2o: { eq: '2H₂ + O₂ → 2H₂O', r: [['H2', 2], ['O2', 1]], p: [['H2O', 2]], init: [5, 2] },
    nh3: { eq: 'N₂ + 3H₂ → 2NH₃', r: [['N2', 1], ['H2', 3]], p: [['NH3', 2]], init: [3, 6] },
    ch4: { eq: 'CH₄ + 2O₂ → CO₂ + 2H₂O', r: [['CH4', 1], ['O2', 2]], p: [['CO2', 1], ['H2O', 2]], init: [2, 3] },
  };
  const st = { k: RX[opt.mode] ? opt.mode : 'h2o', n: [0, 0] };
  st.n = RX[st.k].init.slice();
  el.innerHTML = `<div class="sim-head"><b>限量試劑與化學計量</b><span>選反應、拖動兩種反應物的莫耳數，比較「莫耳數 ÷ 係數」，看誰先用完。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 300" role="img" aria-label="反應前後的粒子與莫耳數"></svg></div>
  <div class="sim-ctl">
    <div class="ops">${Object.keys(RX).map((k) => `<button type="button" data-k="${k}">${RX[k].eq}</button>`).join('')}</div>
    <label class="sl"><span data-l="0"></span><input type="range" data-i="0" min="0" max="8" step="0.5"><output></output></label>
    <label class="sl"><span data-l="1"></span><input type="range" data-i="1" min="0" max="8" step="0.5"><output></output></label>
    <div class="facts">
      <div class="fact" style="grid-column:1/-1"><span>莫耳數 ÷ 係數（商最小者為限量試劑）</span><b data-f="q"></b></div>
      <div class="fact"><span>限量試劑</span><b data-f="lim"></b></div><div class="fact"><span>過量試劑剩餘</span><b data-f="ex"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>生成物（理論產量）</span><b data-f="pr"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>實際反應的莫耳比（＝係數比）</span><b data-f="ratio"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), f = (k) => el.querySelector(`[data-f="${k}"]`), ins = el.querySelectorAll('[data-i]');
  const CELL = 36, X0 = 92, RH = 38;
  const glyph = (sp, cx, cy) => `<g transform="translate(${cx} ${cy}) scale(1.45)">` + SP[sp].a.map(([dx, dy, e]) => `<circle cx="${dx}" cy="${dy}" r="${AT[e][1]}" fill="${AT[e][0]}" stroke="var(--ink)" stroke-width=".6"/>`).join('') + '</g>';
  const fmt = (x) => String(Number((x + 1e-12).toFixed(2)));
  function row(sp, n, y, faded) {
    let s = `<text x="10" y="${y + 5}" font-size="15" font-weight="700" fill="var(--ink)">${SP[sp].f}</text><text x="${X0 - 6}" y="${y + 5}" font-size="13" text-anchor="end" fill="var(--ink-2)">${fmt(n)}</text>`;
    const full = Math.floor(n + 1e-9), part = n - full;
    for (let i = 0; i < full; i++) s += glyph(sp, X0 + CELL / 2 + i * CELL, y);
    if (part > 1e-6) s += `<svg x="${X0 + full * CELL}" y="${y - 18}" width="${(part * CELL).toFixed(1)}" height="36" overflow="hidden">${glyph(sp, CELL / 2, 18)}</svg><line x1="${X0 + (full + part) * CELL}" x2="${X0 + (full + part) * CELL}" y1="${y - 16}" y2="${y + 16}" stroke="var(--mute)" stroke-dasharray="2 2"/>`;
    if (n < 1e-9) s += `<text x="${X0 + 4}" y="${y + 4}" font-size="11" fill="var(--mute)">${faded ? '用完' : '0'}</text>`;
    return s;
  }
  function draw() {
    const R = RX[st.k];
    const q = R.r.map(([sp, c], i) => st.n[i] / c);
    const ext = Math.min(...q);
    const li = q[0] === q[1] ? -1 : q[0] < q[1] ? 0 : 1;
    const left = R.r.map(([sp, c], i) => st.n[i] - c * ext);
    const prod = R.p.map(([sp, c]) => c * ext);
    let s = `<text x="10" y="17" font-size="14" font-weight="700" fill="var(--teal)">反應前</text><text x="410" y="16" font-size="11" text-anchor="end" fill="var(--mute)">每個圖示代表 1 mol（不足 1 個按比例裁切）</text>`;
    let y = 42;
    R.r.forEach(([sp], i) => { s += row(sp, st.n[i], y); y += RH; });
    s += `<line x1="10" x2="410" y1="${y - 12}" y2="${y - 12}" stroke="var(--line)"/><text x="10" y="${y + 12}" font-size="14" font-weight="700" fill="var(--teal)">反應後（反應進度 ${fmt(ext)}）</text>`;
    y += 34;
    R.r.forEach(([sp], i) => { s += row(sp, left[i], y, true); y += RH; });
    R.p.forEach(([sp], i) => { s += row(sp, prod[i], y); y += RH; });
    s += `<text x="10" y="${y + 2}" font-size="12" fill="var(--mute)"><tspan fill="var(--red)">●</tspan> O　<tspan fill="var(--c-P)">●</tspan> N　<tspan fill="var(--ink-2)">●</tspan> C　○ H</text>`;
    svg.setAttribute('viewBox', `0 0 420 ${y + 12}`);
    svg.innerHTML = s;
    el.querySelectorAll('[data-k]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === st.k)));
    ins.forEach((inp, i) => { inp.value = st.n[i]; inp.nextElementSibling.textContent = st.n[i].toFixed(1) + ' mol'; el.querySelector(`[data-l="${i}"]`).textContent = SP[R.r[i][0]].f; });
    const nm = (i) => SP[R.r[i][0]].f;
    f('q').textContent = R.r.map(([sp, c], i) => `${SP[sp].f}：${st.n[i].toFixed(1)} ÷ ${c} = ${fmt(q[i])}`).join('　');
    f('lim').textContent = ext === 0 ? (st.n[0] === 0 && st.n[1] === 0 ? '—' : nm(q[0] === 0 ? 0 : 1) + '（為 0）') : li < 0 ? '恰好完全反應' : nm(li);
    f('ex').textContent = li < 0 ? '無' : `${nm(1 - li)} ${fmt(left[1 - li])} mol（${(left[1 - li] * SP[R.r[1 - li][0]].M).toFixed(1)} g）`;
    f('pr').textContent = R.p.map(([sp], i) => `${SP[sp].f} ${fmt(prod[i])} mol ＝ ${(prod[i] * SP[sp].M).toFixed(1)} g`).join('；');
    f('ratio').textContent = `${R.r.map(([sp]) => SP[sp].f).join(' : ')} : ${R.p.map(([sp]) => SP[sp].f).join(' : ')} ＝ ${R.r.map(([, c]) => fmt(c * ext)).join(' : ')} : ${prod.map(fmt).join(' : ')} ＝ ${R.r.map(([, c]) => c).join(' : ')} : ${R.p.map(([, c]) => c).join(' : ')}`;
    const moreMol = st.n[0] > st.n[1] ? 0 : 1;
    f('note').textContent = li >= 0 && li === moreMol && st.n[0] !== st.n[1]
      ? `${nm(li)} 的莫耳數雖然較多，但除以係數後商較小，仍是限量試劑：判斷要看「莫耳數 ÷ 係數」，不是莫耳數或質量大小。`
      : '所有生成量與消耗量都依限量試劑計算；過量試劑剩餘量 ＝ 原有量 − 消耗量。總質量守恆：反應前後各原子數不變。';
  }
  el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { st.k = b.dataset.k; st.n = RX[st.k].init.slice(); draw(); }));
  ins.forEach((inp, i) => inp.addEventListener('input', () => { st.n[i] = Number(inp.value); draw(); }));
  draw();
};
