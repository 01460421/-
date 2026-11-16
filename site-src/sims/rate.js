(window.SIMS = window.SIMS || {}).rate = function (el, opt) {
  const RG = 8.31e-3, T1 = 300; // kJ/(mol·K)
  const st = { exo: opt.mode !== 'endo', cat: false, Ea: 60, dH: 40, T2: 320 };
  const uid = 'r' + Math.random().toString(36).slice(2, 8);
  el.innerHTML = `<div class="sim-head"><b>活化能與有效碰撞</b><span>調整活化能、反應熱與溫度，切換催化劑，看能越過 Ea 的分子比例與反應速率如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 380" role="img" aria-label="位能圖與動能分布"></svg></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-m="exo">放熱反應</button><button type="button" data-m="endo">吸熱反應</button><button type="button" data-c="1">加入催化劑</button></div>
    <label class="sl"><span>Ea（正）</span><input type="range" data-k="Ea" min="20" max="120" step="1"><output></output></label>
    <label class="sl"><span>|ΔH|</span><input type="range" data-k="dH" min="5" max="80" step="1"><output></output></label>
    <label class="sl"><span>T₂</span><input type="range" data-k="T2" min="300" max="400" step="5"><output></output></label>
    <div class="facts">
      <div class="fact"><span>有效 Ea（正／逆）</span><b data-f="ea"></b></div><div class="fact"><span>ΔH = Ea(正) − Ea(逆)</span><b data-f="dh"></b></div>
      <div class="fact"><span>動能 ≥ Ea 的比例 ≈ e^(−Ea/RT)</span><b data-f="fr"></b></div><div class="fact"><span>相對速率（以 T₁、無催化劑為 1）</span><b data-f="k"></b></div>
    </div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), f = (k) => el.querySelector(`[data-f="${k}"]`), sl = {};
  el.querySelectorAll('[data-k]').forEach((i) => { sl[i.dataset.k] = i; });
  const sci = (x) => { const e = Math.floor(Math.log10(x) + 1e-9); const m = x / 10 ** e; return e >= -2 && e < 3 ? String(Number(x.toPrecision(2))) : m.toFixed(1) + '×10' + String(e).split('').map((c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])).join(''); };
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  const effEa = () => { const top = st.exo ? 0 : st.dH; return st.cat ? Math.round(top + 0.5 * (st.Ea - top)) : st.Ea; };
  function energy() {
    const dH = st.exo ? -st.dH : st.dH, Ea = st.Ea, Ec = effEa();
    const lo = Math.min(0, dH) - 8, hi = Ea + 10, Y0 = 26, Y1 = 160, ey = (E) => Y1 - ((E - lo) / (hi - lo)) * (Y1 - Y0);
    const xa = 60, x1 = 110, xp = 220, x2 = 330, xb = 400;
    const path = (pk) => `M${xa} ${ey(0)} H${x1} C${x1 + 50} ${ey(0)} ${xp - 45} ${ey(pk)} ${xp} ${ey(pk)} C${xp + 45} ${ey(pk)} ${x2 - 50} ${ey(dH)} ${x2} ${ey(dH)} H${xb}`;
    let s = `<text x="10" y="16" font-size="12" font-weight="700" fill="var(--teal)">位能圖</text>`;
    s += `<line x1="${xa - 6}" x2="${xa - 6}" y1="${Y0 - 8}" y2="${Y1 + 6}" stroke="var(--ink-2)"/><text x="${xa - 12}" y="${(Y0 + Y1) / 2}" font-size="11" text-anchor="middle" fill="var(--ink-2)" transform="rotate(-90 ${xa - 12} ${(Y0 + Y1) / 2})">位能</text><text x="${xb}" y="${Y1 + 18}" font-size="11" text-anchor="end" fill="var(--ink-2)">反應進行 →</text>`;
    s += `<path d="${path(Ea)}" fill="none" stroke="var(--ink)" stroke-width="2.5"/>`;
    if (st.cat) s += `<path d="${path(Ec)}" fill="none" stroke="var(--c-B)" stroke-width="2.5" stroke-dasharray="6 4"/><text x="${xp}" y="${ey(Ec) - 5}" font-size="11" text-anchor="middle" fill="var(--c-B)">有催化劑</text>`;
    s += `<line x1="${x1}" x2="${xp + 60}" y1="${ey(0)}" y2="${ey(0)}" stroke="var(--mute)" stroke-dasharray="3 3"/><line x1="${xp - 60}" x2="${x2}" y1="${ey(dH)}" y2="${ey(dH)}" stroke="var(--mute)" stroke-dasharray="3 3"/>`;
    const arr = (x, a, b, c, t, side) => Math.abs(a - b) < 1e-9 ? '' : `<line x1="${x}" x2="${x}" y1="${ey(a)}" y2="${ey(b)}" stroke="${c}" stroke-width="2" marker-end="url(#${uid}${c === 'var(--red)' ? 'r' : c === 'var(--c-P)' ? 'p' : 'g'})"/><text x="${x + (side ? 5 : -5)}" y="${(ey(a) + ey(b)) / 2 + 4}" font-size="11" text-anchor="${side ? 'start' : 'end'}" fill="${c}" font-weight="700" stroke="var(--bg)" stroke-width="3" paint-order="stroke">${t}</text>`;
    s += arr(xp - 32, 0, Ea, 'var(--red)', `Ea ${Ea}`, false);
    s += arr(xp + 34, dH, Ea, 'var(--c-P)', `Ea(逆) ${Ea - dH}`, true);
    s += arr(x2 + 8, 0, dH, 'var(--c-C)', `ΔH ${sg(dH)}`, true);
    s += `<text x="${xa + 4}" y="${ey(0) - 5}" font-size="11" fill="var(--ink-2)">反應物</text><text x="${xb - 2}" y="${ey(dH) - 5}" font-size="11" text-anchor="end" fill="var(--ink-2)">生成物</text>`;
    return s;
  }
  function dist() {
    const X0 = 50, X1 = 405, Y0 = 210, Y1 = 345, EM = 130, ex = (E) => X0 + (E / EM) * (X1 - X0);
    const th = (T) => 20 * (T / T1); // 示意尺度
    const fE = (E, T) => Math.sqrt(E) * Math.exp(-E / th(T)) / th(T) ** 1.5;
    const ymax = fE(th(T1) / 2, T1) * 1.1, fy = (v) => Y1 - (v / ymax) * (Y1 - Y0);
    const Ea = effEa();
    let s = `<text x="10" y="${Y0 - 12}" font-size="12" font-weight="700" fill="var(--teal)">分子動能分布（示意，橫軸已壓縮）</text>`;
    s += `<line x1="${X0}" x2="${X1}" y1="${Y1}" y2="${Y1}" stroke="var(--ink-2)"/><line x1="${X0}" x2="${X0}" y1="${Y0 - 4}" y2="${Y1}" stroke="var(--ink-2)"/><text x="${X1}" y="${Y1 + 15}" font-size="11" text-anchor="end" fill="var(--ink-2)">動能 →</text><text x="${X0 - 6}" y="${(Y0 + Y1) / 2}" font-size="11" text-anchor="middle" fill="var(--ink-2)" transform="rotate(-90 ${X0 - 6} ${(Y0 + Y1) / 2})">分子數</text>`;
    [[T1, 'var(--c-P)'], [st.T2, 'var(--red)']].forEach(([T, c], j) => {
      let d = '', sh = `M${ex(Ea)} ${Y1}`;
      for (let E = 0; E <= EM; E += 0.5) { const p = ex(E).toFixed(1) + ' ' + fy(fE(E, T)).toFixed(1); d += (E ? 'L' : 'M') + p; if (E >= Ea) sh += 'L' + p; }
      sh += `L${ex(EM)} ${Y1}Z`;
      s += `<path d="${sh}" fill="${c}" opacity="${j ? 0.28 : 0.22}"/><path d="${d}" fill="none" stroke="${c}" stroke-width="2"/>`;
    });
    s += `<line x1="${ex(Ea)}" x2="${ex(Ea)}" y1="${Y0 - 2}" y2="${Y1}" stroke="${st.cat ? 'var(--c-B)' : 'var(--ink)'}" stroke-width="2" stroke-dasharray="5 3"/><text x="${ex(Ea) + 4}" y="${Y0 + 8}" font-size="11" fill="${st.cat ? 'var(--c-B)' : 'var(--ink)'}">Ea${st.cat ? '（催化）' : ''}</text>`;
    if (st.cat) s += `<line x1="${ex(st.Ea)}" x2="${ex(st.Ea)}" y1="${Y0 + 14}" y2="${Y1}" stroke="var(--mute)" stroke-dasharray="2 3"/>`;
    s += `<text x="${X1}" y="${Y0 + 8}" font-size="11" text-anchor="end"><tspan fill="var(--c-P)">— T₁ = ${T1} K</tspan>　<tspan fill="var(--red)">— T₂ = ${st.T2} K</tspan></text><text x="${X1}" y="${Y0 + 24}" font-size="10" text-anchor="end" fill="var(--mute)">陰影：動能 ≥ Ea 的分子</text>`;
    return s;
  }
  function draw() {
    if (!st.exo && st.Ea < st.dH + 2) st.Ea = st.dH + 2;
    const Ea = effEa(), dH = st.exo ? -st.dH : st.dH;
    const mk = (id, c) => `<marker id="${uid}${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`;
    svg.innerHTML = `<defs>${mk('r', 'var(--red)')}${mk('p', 'var(--c-P)')}${mk('g', 'var(--c-C)')}</defs>` + energy() + dist();
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.m === 'exo') === st.exo)));
    el.querySelector('[data-c]').setAttribute('aria-pressed', String(st.cat));
    for (const k of ['Ea', 'dH', 'T2']) { sl[k].value = st[k]; sl[k].nextElementSibling.textContent = st[k] + (k === 'T2' ? ' K' : ' kJ/mol'); }
    const fr = (E, T) => Math.exp(-E / (RG * T));
    const f1 = fr(Ea, T1), f2 = fr(Ea, st.T2), base = fr(st.Ea, T1);
    f('ea').textContent = `${Ea.toFixed(0)}／${(Ea - dH).toFixed(0)} kJ/mol`;
    f('dh').textContent = `${sg(dH)} kJ/mol（${st.exo ? '放熱' : '吸熱'}）`;
    f('fr').textContent = `T₁：${sci(f1)}；T₂：${sci(f2)}`;
    f('k').textContent = `T₁：${sci(f1 / base)} 倍；T₂：${sci(f2 / base)} 倍`;
    f('note').textContent = st.cat
      ? '催化劑提供活化能較低的新途徑（正、逆反應的 Ea 降低相同的量），ΔH 不變；能越過障礙的分子比例大增，速率加快。'
      : `升溫主要是使動能 ≥ Ea 的分子比例增加（陰影變大），碰撞頻率只略增；Ea 愈大，速率對溫度愈敏感。ΔH 只說明放熱或吸熱，不說明快慢。`;
  }
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.exo = b.dataset.m === 'exo'; draw(); }));
  el.querySelector('[data-c]').addEventListener('click', () => { st.cat = !st.cat; draw(); });
  Object.values(sl).forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = Number(i.value); if (!st.exo && i.dataset.k === 'Ea' && st.Ea < st.dH + 2) st.dH = st.Ea - 2; draw(); }));
  draw();
};
