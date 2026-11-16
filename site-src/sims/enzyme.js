(window.SIMS = window.SIMS || {}).enzyme = function (el, opt) {
  const MODES = { temp: '溫度', ph: 'pH', sub: '受質濃度' };
  const ENZ = [['pepsin', '胃蛋白酶', 2, 'var(--c-X)'], ['amylase', '唾液澱粉酶', 6.8, 'var(--c-P)'], ['trypsin', '胰蛋白酶', 8, 'var(--c-C)']];
  let mode = MODES[opt.mode] ? opt.mode : 'temp', T = 37, maxT = 37, pH = 6.8, enz = 1, S = 4, E2 = false;
  const KM = 2, X0 = 46, X1 = 346, Y0 = 200, Y1 = 22;
  const kT = (t) => Math.pow(2, (t - 37) / 10), nat = (t) => 1 / (1 + Math.exp((t - 41) / 2.5));
  let PEAK = 0; for (let t = 0; t <= 80; t += 0.1) PEAK = Math.max(PEAK, kT(t) * nat(t));
  const rT = (t, hist) => kT(t) * nat(Math.max(t, hist)) / PEAK;
  const rP = (p, o) => Math.exp(-Math.pow((p - o) / 1.3, 2));
  const rS = (s, e) => e * s / (KM + s);
  el.innerHTML = `<div class="sim-head"><b>影響酵素活性的因素</b><span>選擇變因並拖動滑桿，看反應速率在曲線上的位置。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 240" role="img" aria-label="反應速率曲線"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="mode">${Object.entries(MODES).map(([k, v]) => `<button type="button" data-mode="${k}">${v}</button>`).join('')}</div>
    <label class="sl"><span data-lab></span><input type="range"><output></output></label>
    <div class="ops" data-x="ph">${ENZ.map((e, i) => `<button type="button" data-enz="${i}">${e[1]}</button>`).join('')}</div>
    <div class="ops" data-x="temp"><button type="button" data-new>換一管新酵素</button></div>
    <div class="ops" data-x="sub"><button type="button" data-e2 aria-pressed="false">酵素量加倍</button></div>
    <div class="facts"><div class="fact"><span data-f="rl">相對反應速率</span><b data-f="r"></b></div><div class="fact"><span data-f="k2"></span><b data-f="v2"></b></div></div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg'), rng = q('input');
  const SET = { temp: [0, 80, 1, ' °C', '溫度'], ph: [0, 14, 0.1, '', 'pH'], sub: [0, 20, 0.2, '', '[S]'] };
  const val = () => (mode === 'temp' ? T : mode === 'ph' ? pH : S);
  function setMode(m) {
    mode = m; const [a, b, st, , lab] = SET[m];
    Object.assign(rng, { min: a, max: b, step: st }); rng.value = val(); q('[data-lab]').textContent = lab;
    el.querySelectorAll('[data-x]').forEach((x) => { x.style.display = x.dataset.x === m ? '' : 'none'; });
    render();
  }
  const sx = (x, a, b) => X0 + (x - a) / (b - a) * (X1 - X0), sy = (y, m) => Y0 - y / m * (Y0 - Y1);
  function path(f, a, b, ym, n = 160) { let d = ''; for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; d += (i ? 'L' : 'M') + sx(x, a, b).toFixed(1) + ',' + sy(f(x), ym).toFixed(1); } return d; }
  function axes(a, b, ticks, xl, ym) {
    let h = `<line x1="${X0}" y1="${Y0}" x2="${X1}" y2="${Y0}" stroke="var(--ink-2)"/><line x1="${X0}" y1="${Y0}" x2="${X0}" y2="${Y1 - 6}" stroke="var(--ink-2)"/>`;
    ticks.forEach((t) => { h += `<text x="${sx(t, a, b)}" y="${Y0 + 14}" font-size="12.5" text-anchor="middle" fill="var(--ink-2)">${t}</text>`; });
    h += `<text x="${X1}" y="${Y0 + 30}" font-size="12.5" text-anchor="end" fill="var(--ink)">${xl}</text>`;
    h += `<text x="12" y="${(Y0 + Y1) / 2}" font-size="12.5" fill="var(--ink)" transform="rotate(-90 12 ${(Y0 + Y1) / 2})" text-anchor="middle">反應速率（相對值）</text>`;
    [0, 0.5, 1].forEach((v) => { if (v * 1 <= ym) h += `<text x="${X0 - 4}" y="${sy(v, ym) + 4}" font-size="11.5" text-anchor="end" fill="var(--mute)">${v}</text>`; });
    return h;
  }
  const dot = (x, y, ym, a, b) => `<line x1="${sx(x, a, b)}" y1="${Y0}" x2="${sx(x, a, b)}" y2="${sy(y, ym)}" stroke="var(--red)" stroke-dasharray="3 3"/><circle cx="${sx(x, a, b)}" cy="${sy(y, ym)}" r="6" fill="var(--red)" stroke="var(--card)" stroke-width="2"/>`;
  function render() {
    let h = '', r, k2, v2, note;
    if (mode === 'temp') {
      h = axes(0, 80, [0, 20, 37, 60, 80], '溫度（°C）', 1.15);
      h += `<path d="${path((t) => rT(t, 0), 0, 80, 1.15)}" fill="none" stroke="var(--teal)" stroke-width="3"/>`;
      const denat = nat(maxT) / nat(T) < 0.97;
      if (denat) h += `<path d="${path((t) => rT(t, maxT), 0, maxT, 1.15, 120)}" fill="none" stroke="var(--red)" stroke-width="2" stroke-dasharray="6 4"/><text x="${sx(Math.min(maxT, 70), 0, 80)}" y="${Y1 + 4}" font-size="12.5" text-anchor="end" fill="var(--red)">曾加熱至 ${maxT} °C 後的活性</text>`;
      r = rT(T, maxT); h += dot(T, r, 1.15, 0, 80);
      k2 = '酵素狀態'; const dp = Math.round((1 - nat(maxT) / nat(T)) * 100); v2 = denat ? `${dp > 97 ? '已變性' : '已部分變性'}（${dp}%）` : T < 30 ? '低溫，活性低（可恢復）' : T <= 42 ? '接近最適溫度' : '高溫，開始變性';
      note = denat ? '先經高溫處理的酵素再降溫，活性回不來：高溫使蛋白質立體構造破壞（變性），通常不可逆。按「換一管新酵素」重來。' : '低溫只是分子動能小、碰撞少，回溫可恢復；超過最適溫度（人體酵素約 37 °C）後構造被破壞，活性急降。';
    } else if (mode === 'ph') {
      h = axes(0, 14, [0, 2, 4, 6, 8, 10, 12, 14], 'pH', 1.15);
      ENZ.forEach((e, i) => { h += `<path d="${path((p) => rP(p, e[2]), 0, 14, 1.15)}" fill="none" stroke="${e[3]}" stroke-width="${i === enz ? 3.2 : 1.4}" opacity="${i === enz ? 1 : 0.45}"/><text x="${sx(e[2], 0, 14) + (i === 2 ? 12 : i === 1 ? -12 : 0)}" y="${sy(1, 1.15) - 6}" font-size="12.5" text-anchor="middle" fill="${e[3]}" font-weight="${i === enz ? 700 : 400}">${e[1]}</text>`; });
      r = rP(pH, ENZ[enz][2]); h += dot(pH, r, 1.15, 0, 14);
      k2 = '最適 pH'; v2 = `${ENZ[enz][1]} 約 ${ENZ[enz][2]}`;
      note = ['胃液 pH 約 2，胃蛋白酶在此最活潑；進入小腸（偏鹼）就失去活性。', '唾液澱粉酶最適 pH 約 6.8；食團到胃中遇強酸即失去活性。', '胰蛋白酶在小腸偏鹼環境（pH 約 8）作用最佳。'][enz] + '偏離最適 pH 過多會使酵素變性。';
    } else {
      const ym = 2.15, e = E2 ? 2 : 1;
      h = axes(0, 20, [0, 2, 5, 10, 15, 20], '受質濃度 [S]（相對值）', ym);
      [1, 2].forEach((v) => { h += `<line x1="${X0}" x2="${X1}" y1="${sy(v, ym)}" y2="${sy(v, ym)}" stroke="var(--mute)" stroke-dasharray="4 4" opacity="${v === e ? 0.9 : 0.35}"/><text x="${X1}" y="${sy(v, ym) - 4}" font-size="11.5" text-anchor="end" fill="var(--mute)">V<tspan font-size="8" dy="2">max</tspan><tspan dy="-2">（酵素 ×${v}）</tspan></text>`; });
      if (E2) h += `<path d="${path((s) => rS(s, 1), 0, 20, ym)}" fill="none" stroke="var(--teal)" stroke-width="1.4" opacity=".45"/>`;
      h += `<path d="${path((s) => rS(s, e), 0, 20, ym)}" fill="none" stroke="var(--teal)" stroke-width="3"/>`;
      r = rS(S, e); h += dot(S, r, ym, 0, 20);
      k2 = 'v ＝ V<sub>max</sub>[S]/(K<sub>m</sub>＋[S])'; v2 = `${e}×${S.toFixed(1)}/(${KM}+${S.toFixed(1)}) = ${r.toFixed(2)}`;
      note = S < KM ? '受質少時，速率約與受質濃度成正比。' : S > 8 ? `活化位幾乎都被占用（飽和），再加受質速率增加有限；${E2 ? '酵素量加倍使最大速率加倍。' : '增加酵素量才能提高最大速率。'}` : '受質增加，速率上升但漸趨平緩。';
    }
    svg.innerHTML = h;
    q('output').textContent = (mode === 'ph' ? pH.toFixed(1) : mode === 'sub' ? S.toFixed(1) : T) + SET[mode][3];
    q('[data-f="rl"]').textContent = mode === 'sub' ? '反應速率（酵素 ×1 的 Vmax＝1）' : '相對反應速率（最大值＝100%）';
    q('[data-f="r"]').textContent = mode === 'sub' ? r.toFixed(2) : `${Math.round(r * 100)} %`;
    q('[data-f="k2"]').innerHTML = k2; q('[data-f="v2"]').textContent = v2; q('[data-note]').textContent = note;
    el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    el.querySelectorAll('[data-enz]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.enz === enz));
  }
  rng.addEventListener('input', () => {
    const v = +rng.value;
    if (mode === 'temp') { T = v; maxT = Math.max(maxT, T); } else if (mode === 'ph') pH = v; else S = v;
    render();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) return setMode(b.dataset.mode);
    if (b.dataset.enz) { enz = +b.dataset.enz; pH = ENZ[enz][2]; rng.value = pH; }
    if (b.hasAttribute('data-new')) maxT = T;
    if (b.hasAttribute('data-e2')) { E2 = !E2; b.setAttribute('aria-pressed', E2); }
    render();
  });
  setMode(mode);
};
