(window.SIMS = window.SIMS || {}).superpose = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>波的疊加與駐波</b><span data-h></span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 230" role="img" aria-label="波的疊加"></svg></div>
<div class="sim-ctl">
<div class="ops"><button type="button" data-m="pulse">脈波相遇</button><button type="button" data-m="standing">兩端固定弦的駐波</button></div>
<div data-g="pulse" style="display:grid;gap:8px">
${sl('t', 't', 0, 6, 0.02, 2.4)}
<div class="ops"><button type="button" data-s="1" aria-pressed="true">同側脈波</button><button type="button" data-s="-1" aria-pressed="false">反側脈波</button><button type="button" data-b="play">播放</button></div>
<div class="facts">${fact('mid', 'x = 5.0 m 處 y₁ + y₂')}${fact('max', '繩上最大位移')}</div>
<p class="sim-note">相遇時各點位移等於兩脈波位移相加；同側相加變大，反側完全重疊時繩瞬間變直。分開後兩脈波保持原形狀、各自前進。</p>
</div>
<div data-g="standing" style="display:grid;gap:8px">
${sl('n', 'n', 1, 8, 1, 3)}${sl('L', 'L', 0.5, 2, 0.05, 1.5)}${sl('v', 'v', 50, 400, 10, 200)}
<div class="ops"><button type="button" data-b="play">播放</button></div>
<div class="facts">${fact('lam', 'λₙ = 2L/n')}${fact('fn', 'fₙ = nv/2L')}${fact('nod', '節點數／腹點數')}${fact('f1', '基頻 f₁ = v/2L')}</div>
<p class="sim-note">兩端必為節點，弦長須是半波長的整數倍；腹點數就是 n。相鄰節點相距 λ/2，fₙ 是基頻的 n 倍（動畫已放慢）。</p>
</div>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { mode: opt.mode === 'standing' ? 'standing' : 'pulse', t: 2.4, sign: 1, n: 3, L: 1.5, v: 200, ph: 0.3 };
  const A = 2, Wd = 0.55; // pulse amplitude (cm), width (m)
  const p1 = (x, t) => A * Math.exp(-Math.pow((x - (2 + t)) / Wd, 2));
  const p2 = (x, t) => P.sign * A * Math.exp(-Math.pow((x - (8 - t)) / Wd, 2));
  const SX = (x) => 20 + x * 32, SY = (y) => 125 - y * 24;
  function path(fn, x0, x1, X, Y) {
    let d = '';
    for (let i = 0; i <= 240; i++) { const x = x0 + ((x1 - x0) * i) / 240; d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(fn(x)).toFixed(1); }
    return d;
  }
  function drawPulse() {
    const t = P.t;
    let s = `<line x1="20" x2="340" y1="125" y2="125" style="stroke:var(--line)" stroke-dasharray="3 3"/>`;
    for (let k = 0; k <= 10; k += 2) s += `<text x="${SX(k)}" y="${k ? 222 : 222}" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="340" y="208" text-anchor="end" font-size="10" style="fill:var(--mute)">x (m)</text>`;
    s += `<path d="${path((x) => p1(x, t), 0, 10, SX, SY)}" fill="none" style="stroke:var(--c-P)" stroke-width="1.5" stroke-dasharray="5 3"/>`;
    s += `<path d="${path((x) => p2(x, t), 0, 10, SX, SY)}" fill="none" style="stroke:var(--c-C)" stroke-width="1.5" stroke-dasharray="5 3"/>`;
    s += `<path d="${path((x) => p1(x, t) + p2(x, t), 0, 10, SX, SY)}" fill="none" style="stroke:var(--teal)" stroke-width="3"/>`;
    const a1 = SX(2 + t), a2 = SX(8 - t);
    s += `<path d="M${a1 - 14} 20 h22 l-6 -4 m6 4 l-6 4" fill="none" style="stroke:var(--c-P)" stroke-width="2"/><text x="${a1 - 3}" y="12" text-anchor="middle" font-size="10" style="fill:var(--c-P)">脈波 1</text>`;
    s += `<path d="M${a2 + 14} 20 h-22 l6 -4 m-6 4 l6 4" fill="none" style="stroke:var(--c-C)" stroke-width="2"/><text x="${a2 + 3}" y="12" text-anchor="middle" font-size="10" style="fill:var(--c-C)">脈波 2</text>`;
    s += `<line x1="${SX(5)}" x2="${SX(5)}" y1="30" y2="210" style="stroke:var(--sun)" stroke-width="1.5"/>`;
    s += `<text x="20" y="208" font-size="10" style="fill:var(--ink-2)">虛線：各脈波單獨存在　粗線：合成</text>`;
    svg.innerHTML = s;
    let mx = 0;
    for (let i = 0; i <= 400; i++) { const x = (i / 400) * 10, y = p1(x, t) + p2(x, t); if (Math.abs(y) > Math.abs(mx)) mx = y; }
    $('[data-f=mid]').textContent = `${f(p1(5, t), 2)} + ${f(p2(5, t), 2)} = ${f(p1(5, t) + p2(5, t), 2)} cm`;
    $('[data-f=max]').textContent = `${f(mx, 2)} cm`;
    $('[data-o=t]').textContent = `${f(t, 2)} s`;
  }
  function drawStanding() {
    const n = P.n, X = (x) => 30 + x * 150, Y = (y) => 115 - y * 26;
    const k = (n * Math.PI) / P.L, c = Math.cos(P.ph);
    let s = `<line x1="30" x2="${X(P.L)}" y1="115" y2="115" style="stroke:var(--line)" stroke-dasharray="3 3"/>`;
    s += `<rect x="18" y="70" width="12" height="90" style="fill:var(--ink-2)"/><rect x="${X(P.L)}" y="70" width="12" height="90" style="fill:var(--ink-2)"/>`;
    s += `<path d="${path((x) => A * Math.sin(k * x), 0, P.L, X, Y)}" fill="none" style="stroke:var(--mute)" stroke-dasharray="3 3"/>`;
    s += `<path d="${path((x) => -A * Math.sin(k * x), 0, P.L, X, Y)}" fill="none" style="stroke:var(--mute)" stroke-dasharray="3 3"/>`;
    s += `<path d="${path((x) => A * Math.sin(k * x) * c, 0, P.L, X, Y)}" fill="none" style="stroke:var(--teal)" stroke-width="3"/>`;
    for (let j = 0; j <= n; j++) { const x = X((j * P.L) / n); s += `<circle cx="${x}" cy="115" r="4.5" style="fill:var(--red)"/><text x="${x}" y="182" text-anchor="middle" font-size="11" style="fill:var(--red)">N</text>`; }
    for (let j = 0; j < n; j++) { const x = X(((j + 0.5) * P.L) / n); s += `<text x="${x}" y="${Y(A) - 8}" text-anchor="middle" font-size="11" style="fill:var(--c-P)">A</text>`; }
    if (n >= 1) { const x0 = X(0), x1 = X(P.L / n); s += `<line x1="${x0}" x2="${x1}" y1="198" y2="198" style="stroke:var(--c-C)" stroke-width="1.5"/><line x1="${x0}" x2="${x0}" y1="193" y2="203" style="stroke:var(--c-C)"/><line x1="${x1}" x2="${x1}" y1="193" y2="203" style="stroke:var(--c-C)"/><text x="${(x0 + x1) / 2}" y="214" text-anchor="middle" font-size="11" style="fill:var(--c-C)">λ/2</text>`; }
    s += `<text x="342" y="226" text-anchor="end" font-size="10" style="fill:var(--mute)">L = ${f(P.L, 2)} m　N 節點　A 腹點</text>`;
    svg.innerHTML = s;
    const lam = (2 * P.L) / n, fn = (n * P.v) / (2 * P.L);
    $('[data-f=lam]').textContent = `2 × ${f(P.L, 2)} / ${n} = ${f(lam, 3)} m`;
    $('[data-f=fn]').textContent = `${f(fn, 1)} Hz`;
    $('[data-f=nod]').textContent = `${n + 1}／${n}`;
    $('[data-f=f1]').textContent = `${f(P.v / (2 * P.L), 1)} Hz（fₙ = ${n} f₁）`;
    $('[data-o=n]').textContent = `${n}`;
    $('[data-o=L]').textContent = `${f(P.L, 2)} m`;
    $('[data-o=v]').textContent = `${f(P.v, 0)} m/s`;
  }
  const draw = () => (P.mode === 'pulse' ? drawPulse() : drawStanding());
  const btns = el.querySelectorAll('[data-b=play]');
  let playing = false, raf = 0, last = 0, hold = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    if (P.mode === 'pulse') {
      if (P.t >= 6) { hold += dt; if (hold > 0.6) { hold = 0; P.t = 0; } } else P.t = Math.min(6, P.t + dt * 0.8);
      inp.t.value = P.t;
    } else P.ph += dt * 2 * Math.PI * (0.35 + 0.08 * P.n);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btns.forEach((b) => { b.textContent = on ? '暫停' : '播放'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  function setMode(m) {
    P.mode = m;
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false'));
    el.querySelectorAll('[data-g]').forEach((g) => (g.style.display = g.dataset.g === m ? 'grid' : 'none'));
    $('[data-h]').textContent = m === 'pulse' ? '拖動時間 t 或按播放，看兩個脈波相遇時位移如何相加、分開後是否恢復原狀。' : '選擇諧音數 n，調整弦長 L 與波速 v，看節點、腹點與頻率的關係。';
    svg.setAttribute('aria-label', m === 'pulse' ? '兩脈波相遇的疊加' : '兩端固定弦的駐波');
    if (m === 'standing') { P.ph = 0.3; play(!RM); } else play(false);
    draw();
  }
  btns.forEach((b) => b.addEventListener('click', () => { if (!playing && P.mode === 'pulse' && P.t >= 6) P.t = 0; play(!playing); }));
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));
  el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
    P.sign = +b.dataset.s;
    el.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    draw();
  }));
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => {
    P[k] = parseFloat(inp[k].value);
    if (k === 't') play(false);
    draw();
  }));
  setMode(P.mode);
};
