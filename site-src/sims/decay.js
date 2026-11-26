(window.SIMS = window.SIMS || {}).decay = function (el, opt) {
  const dating = opt.mode === 'dating';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SYS = [['碳-14 → 氮-14', 5730, '年'], ['鈾-235 → 鉛-207', 7.04e8, '年'], ['鈾-238 → 鉛-206', 4.47e9, '年'], ['銣-87 → 鍶-87', 4.96e10, '年']];
  const st = { N0: 400, T: 2, t: 0, play: false, hist: [], dp: 3, sys: 0 };
  let order = [], dec = [];
  const rng = () => Math.random();
  const head = dating ? `<b>放射性同位素定年</b><span>設定樣品中子元素與母元素的比值 D/P，選定年系統，讀出經過幾個半衰期與岩石年代。</span>`
    : `<b>半衰期與隨機衰變</b><span>按「播放」看原子核隨機衰變，比較實際剩餘數與 N₀(1/2)^(t/T) 曲線；改用少量原子核看看差異。</span>`;
  const ctl = dating ? `<div class="ops" data-g="sys">${SYS.map((s, i) => `<button type="button" data-s="${i}">${s[0]}</button>`).join('')}</div>
    <label class="sl"><span>D/P</span><input type="range" min="0" max="15" step="0.1" value="3"><output></output></label>
    <div class="ops" data-g="pre">${[1, 3, 7, 15].map((v) => `<button type="button" data-v="${v}">D/P = ${v}</button>`).join('')}</div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>半衰期數 n = log₂(1 + D/P)</span><b data-f="n"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>年代 t = T₁/₂ × log₂(1 + D/P)</span><b data-f="age"></b></div>
      <div class="fact"><span>剩餘母元素 P/P₀</span><b data-f="pp"></b></div><div class="fact"><span>半衰期 T₁/₂</span><b data-f="T"></b></div></div>
    <p class="sim-note">D/P 與時間不成正比：D/P 由 1 變 3、由 3 變 7，都只多經過 1 個半衰期。半衰期越長的系統，同一 D/P 代表越老的年代。</p>`
    : `<label class="sl"><span>半衰期 T</span><input type="range" min="1" max="8" step="0.5" value="2"><output></output></label>
    <div class="ops" data-g="n0">${[400, 100, 16].map((v) => `<button type="button" data-v="${v}">N₀ = ${v}</button>`).join('')}</div>
    <div class="ops"><button type="button" data-play>播放</button><button type="button" data-reset>重設</button></div>
    <div class="facts"><div class="fact"><span>經過時間 t</span><b data-f="t"></b></div><div class="fact"><span>實際剩餘 N</span><b data-f="N"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>理論 N₀(1/2)^(t/T)</span><b data-f="th"></b></div><div class="fact" style="grid-column:1/-1"><span>已衰變</span><b data-f="d"></b></div></div>
    <p class="sim-note">無法預測哪一個原子核何時衰變；但大量原子核每經一個半衰期約剩一半。原子核少（N₀ = 16）時，實際剩餘數明顯偏離公式。</p>`;
  el.innerHTML = `<div class="sim-head">${head}</div><div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 440 250" role="img" aria-label="原子核格點與衰變曲線"></svg></div><div class="sim-ctl">${ctl}</div></div>`;
  const svg = el.querySelector('svg'), $ = (s) => el.querySelector(s);
  const GX0 = 238, GX1 = 430, GY0 = 30, GY1 = 205;
  function shuffle(n) { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function grid(isParent, n) {
    const side = Math.ceil(Math.sqrt(n)), cs = 200 / side; let s = '';
    for (let i = 0; i < n; i++) { const r = Math.floor(i / side), c = i % side, p = isParent(i);
      s += `<circle cx="${10 + c * cs + cs / 2}" cy="${15 + r * cs + cs / 2}" r="${cs * 0.38}" fill="${p ? 'var(--c-C)' : 'var(--mute)'}" fill-opacity="${p ? 1 : 0.45}"/>`; }
    return s + `<circle cx="16" cy="234" r="5" fill="var(--c-C)"/><text x="25" y="238" font-size="12.5" fill="var(--ink-2)">${dating ? '母元素 P' : '未衰變'}</text><circle cx="110" cy="234" r="5" fill="var(--mute)" fill-opacity=".45"/><text x="119" y="238" font-size="12.5" fill="var(--ink-2)">${dating ? '子元素 D' : '已衰變'}</text>`;
  }
  function axes(xmax, xlab) {
    let s = `<line x1="${GX0}" y1="${GY1}" x2="${GX1}" y2="${GY1}" stroke="var(--ink-2)"/><line x1="${GX0}" y1="${GY0}" x2="${GX0}" y2="${GY1}" stroke="var(--ink-2)"/>`;
    [1, 0.5, 0.25, 0.125].forEach((f) => { const y = GY1 - f * (GY1 - GY0); s += `<line x1="${GX0}" y1="${y}" x2="${GX1}" y2="${y}" stroke="var(--line)"/><text x="${GX0 - 3}" y="${y + 4}" font-size="11" text-anchor="end" fill="var(--mute)">${['1', '1/2', '1/4', '1/8'][[1, 0.5, 0.25, 0.125].indexOf(f)]}</text>`; });
    for (let k = 0; k <= xmax; k++) { const x = GX0 + (k / xmax) * (GX1 - GX0); s += `<text x="${x}" y="${GY1 + 15}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">${k === 0 ? 0 : k + xlab}</text>`; }
    return s;
  }
  function theory(xmax, fn, col, dash) { const p = []; for (let u = 0; u <= xmax + 1e-9; u += xmax / 100) p.push(`${(GX0 + (u / xmax) * (GX1 - GX0)).toFixed(1)},${(GY1 - fn(u) * (GY1 - GY0)).toFixed(1)}`); return `<polyline points="${p.join(' ')}" fill="none" stroke="${col}" stroke-width="2" ${dash ? 'stroke-dasharray="5 4"' : ''}/>`; }
  // ---------- dating mode ----------
  function drawDating() {
    const n = Math.log2(1 + st.dp), frac = 1 / (1 + st.dp), T = SYS[st.sys][1], nP = Math.round(400 * frac);
    let s = grid((i) => order[i] < nP, 400) + axes(4, 'T');
    s += theory(4, (u) => 0.5 ** u, 'var(--c-C)') + theory(4, (u) => 1 - 0.5 ** u, 'var(--mute)');
    const x = GX0 + (Math.min(n, 4) / 4) * (GX1 - GX0);
    if (n <= 4) s += `<line x1="${x}" y1="${GY0}" x2="${x}" y2="${GY1}" stroke="var(--teal)" stroke-width="1.5"/><circle cx="${x}" cy="${GY1 - frac * (GY1 - GY0)}" r="4.5" fill="var(--c-C)"/><circle cx="${x}" cy="${GY1 - (1 - frac) * (GY1 - GY0)}" r="4.5" fill="var(--ink-2)"/>`;
    s += `<text x="${GX1}" y="14" font-size="12" text-anchor="end" fill="var(--ink-2)">占原有母元素的比例（橫軸：半衰期數）</text>`;
    svg.innerHTML = s;
    const age = T * n, fy = (y) => (y >= 1e8 ? Number((y / 1e8).toPrecision(3)) + ' 億年' : y >= 1e4 ? Number((y / 1e4).toPrecision(3)) + ' 萬年' : Math.round(y) + ' 年');
    $('input[type=range] + output').textContent = 'D/P = ' + st.dp.toFixed(1);
    $('[data-f="n"]').textContent = `log₂(1 + ${st.dp.toFixed(1)}) = ${n.toFixed(2)}`;
    $('[data-f="age"]').textContent = `${fy(T)} × ${n.toFixed(2)} = ${fy(age)}`;
    $('[data-f="pp"]').textContent = `1/(1 + D/P) = ${frac.toFixed(3)}`;
    $('[data-f="T"]').textContent = fy(T);
    el.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.s) === st.sys)));
  }
  // ---------- half-life mode ----------
  function resetRun() { st.t = 0; dec = new Array(st.N0).fill(false); st.hist = [[0, st.N0]]; }
  const remain = () => dec.reduce((a, d) => a + (d ? 0 : 1), 0);
  function step(dt) {
    const p = 1 - 0.5 ** (dt / st.T);
    for (let i = 0; i < st.N0; i++) if (!dec[i] && rng() < p) dec[i] = true;
    st.t += dt; st.hist.push([st.t, remain()]);
  }
  function drawHalf() {
    const N = remain(), xm = 5; let s = grid((i) => !dec[i], st.N0) + axes(xm, 'T');
    s += theory(xm, (u) => 0.5 ** u, 'var(--teal)', true);
    s += `<polyline points="${st.hist.map(([t, n]) => `${(GX0 + (t / st.T / xm) * (GX1 - GX0)).toFixed(1)},${(GY1 - (n / st.N0) * (GY1 - GY0)).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--c-C)" stroke-width="2.2"/>`;
    s += `<text x="${GX1}" y="14" font-size="12" text-anchor="end" fill="var(--ink-2)"><tspan fill="var(--c-C)">— 實際</tspan>　<tspan fill="var(--teal)">- - 理論</tspan>（N/N₀）</text>`;
    svg.innerHTML = s;
    const th = st.N0 * 0.5 ** (st.t / st.T);
    $('input[type=range] + output').textContent = st.T.toFixed(1) + ' s';
    $('[data-f="t"]').textContent = `${st.t.toFixed(1)} s = ${(st.t / st.T).toFixed(2)} T`;
    $('[data-f="N"]').textContent = `${N} 個`;
    $('[data-f="th"]').textContent = `${st.N0} × (1/2)^${(st.t / st.T).toFixed(2)} = ${th.toFixed(1)} 個`;
    $('[data-f="d"]').textContent = `${st.N0 - N} 個（${(((st.N0 - N) / st.N0) * 100).toFixed(0)}%）`;
    $('[data-play]').textContent = st.play ? '暫停' : '播放';
    el.querySelectorAll('[data-g="n0"] button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === st.N0)));
  }
  let last = 0, running = false;
  function frame(ts) {
    if (!el.isConnected || !st.play) { running = false; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60; last = ts; step(Math.min(dt, Math.max(1e-6, 5 * st.T - st.t)));
    if (st.t >= 5 * st.T - 1e-6) st.play = false;
    drawHalf(); if (st.play) requestAnimationFrame(frame); else running = false;
  }
  function play(p) { st.play = p; if (p && st.t >= 5 * st.T - 1e-6) resetRun(); if (p && !running) { running = true; last = 0; requestAnimationFrame(frame); } drawHalf(); }
  function staticRun() { resetRun(); while (st.t < 5 * st.T - 1e-9) step(Math.min(1 / 30, 5 * st.T - st.t)); drawHalf(); }
  if (dating) {
    order = shuffle(400);
    $('input[type=range]').addEventListener('input', (e) => { st.dp = Number(e.target.value); drawDating(); });
    $('[data-g="pre"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.dp = Number(b.dataset.v); $('input[type=range]').value = st.dp; drawDating(); });
    $('[data-g="sys"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.sys = Number(b.dataset.s); drawDating(); });
    drawDating();
  } else {
    $('input[type=range]').addEventListener('input', (e) => { st.T = Number(e.target.value); st.play = false; staticRun(); });
    $('[data-g="n0"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.N0 = Number(b.dataset.v); st.play = false; staticRun(); });
    $('[data-play]').addEventListener('click', () => play(!st.play));
    $('[data-reset]').addEventListener('click', () => { st.play = false; resetRun(); drawHalf(); });
    if (reduce) staticRun(); else { resetRun(); play(true); }
  }
};
