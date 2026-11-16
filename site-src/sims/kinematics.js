(window.SIMS = window.SIMS || {}).kinematics = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TMAX = 8;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>等加速度運動的三種圖形</b><span>拖動 v₀、a 與時間 t，看小球位置與 x–t、v–t、a–t 圖如何同步變化。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 440" role="img" aria-label="直線運動與運動圖形"></svg></div>
<div class="sim-ctl">
${sl('v0', 'v₀', -10, 10, 0.5, 4)}${sl('a', 'a', -4, 4, 0.5, -1)}${sl('t', 't', 0, TMAX, 0.05, 3)}
<div class="ops"><button type="button" data-b="play">播放</button><button type="button" data-p="4,1">加速</button><button type="button" data-p="6,-2">減速後折返</button><button type="button" data-p="3,0">等速度</button></div>
<div class="facts">${fact('x', '位置 x = v₀t + ½at²')}${fact('v', '速度 v = v₀ + at')}${fact('a', 'v–t 斜率 = a')}${fact('A', 'v–t 下面積（位移 Δx）')}${fact('s', '路徑長')}</div>
<p class="sim-note">x–t 圖切線斜率是 v，v–t 圖斜率是 a、面積是位移（橫軸下方為負）；v 變號處才是折返點，此時 x–t 圖斜率為零。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { v0: 4, a: -1, t: 3 };
  const xAt = (t) => P.v0 * t + 0.5 * P.a * t * t;
  const vAt = (t) => P.v0 + P.a * t;
  function range(fn) {
    let lo = 0, hi = 0;
    for (let i = 0; i <= 80; i++) { const y = fn((i / 80) * TMAX); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (hi - lo < 2) { hi += 1; lo -= 1; }
    const pad = 0.08 * (hi - lo);
    return [lo - pad, hi + pad];
  }
  const L = 46, R = 346, H = 92;
  function panel(y0, lo, hi, name, unit, col, fn, shade) {
    const X = (t) => L + ((R - L) * t) / TMAX;
    const Y = (v) => y0 + H - ((v - lo) / (hi - lo)) * H;
    let s = `<rect x="${L}" y="${y0}" width="${R - L}" height="${H}" style="fill:var(--card);stroke:var(--line)"/>`;
    s += `<line x1="${L}" x2="${R}" y1="${Y(0)}" y2="${Y(0)}" style="stroke:var(--ink-2)" stroke-width="1"/>`;
    for (let k = 2; k < TMAX; k += 2) s += `<line x1="${X(k)}" x2="${X(k)}" y1="${y0}" y2="${y0 + H}" style="stroke:var(--line)" stroke-dasharray="2 3"/>`;
    s += `<text x="${L - 4}" y="${y0 + 10}" text-anchor="end" font-size="11" style="fill:var(--mute)">${f(hi, 0)}</text><text x="${L - 4}" y="${y0 + H}" text-anchor="end" font-size="11" style="fill:var(--mute)">${f(lo, 0)}</text>`;
    s += `<text x="4" y="${y0 + H / 2 + 4}" font-size="13" font-style="italic" style="fill:${col}">${name}</text><text x="4" y="${y0 + H / 2 + 18}" font-size="10" style="fill:var(--mute)">${unit}</text>`;
    s += shade(X, Y);
    let d = '';
    for (let i = 0; i <= 120; i++) { const t = (i / 120) * TMAX; d += (i ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(fn(t)).toFixed(1); }
    s += `<path d="${d}" fill="none" style="stroke:${col}" stroke-width="2.2"/>`;
    s += `<line x1="${X(P.t)}" x2="${X(P.t)}" y1="${y0}" y2="${y0 + H}" style="stroke:var(--sun)" stroke-width="2"/>`;
    s += `<circle cx="${X(P.t)}" cy="${Y(fn(P.t))}" r="4.5" style="fill:${col};stroke:#fff" stroke-width="1.5"/>`;
    return { s, X, Y };
  }
  function draw() {
    const t = P.t, x = xAt(t), v = vAt(t);
    const xr = range(xAt), vr = range(vAt);
    let s = '';
    // track
    const TX = (p) => 30 + ((p - xr[0]) / (xr[1] - xr[0])) * 300;
    s += `<line x1="30" x2="330" y1="34" y2="34" style="stroke:var(--ink-2)" stroke-width="2"/>`;
    s += `<line x1="${TX(0)}" x2="${TX(0)}" y1="28" y2="40" style="stroke:var(--ink-2)"/><text x="${TX(0)}" y="52" text-anchor="middle" font-size="10" style="fill:var(--mute)">x = 0</text>`;
    s += `<text x="30" y="14" font-size="11" style="fill:var(--mute)">直線軌道（向右為正）</text>`;
    const vx = Math.max(-60, Math.min(60, v * 4));
    if (Math.abs(vx) > 2) s += `<line x1="${TX(x)}" x2="${TX(x) + vx}" y1="20" y2="20" style="stroke:var(--c-P)" stroke-width="2.5"/><path d="M${TX(x) + vx} 20 l${vx > 0 ? -6 : 6} -4 v8z" style="fill:var(--c-P)"/><text x="${TX(x) + vx / 2}" y="16" text-anchor="middle" font-size="10" font-style="italic" style="fill:var(--c-P)">v</text>`;
    s += `<circle cx="${TX(x)}" cy="34" r="8" style="fill:var(--teal);stroke:#fff" stroke-width="2"/>`;
    // x-t with tangent
    const px = panel(64, xr[0], xr[1], 'x', '(m)', 'var(--teal)', xAt, (X, Y) => {
      const dt = 1.3;
      return `<line x1="${X(t - dt)}" y1="${Y(x - v * dt)}" x2="${X(t + dt)}" y2="${Y(x + v * dt)}" style="stroke:var(--c-C)" stroke-width="1.5" stroke-dasharray="5 3"/>`;
    });
    s += px.s + `<text x="${R - 4}" y="76" text-anchor="end" font-size="10" style="fill:var(--c-C)">切線斜率 = v = ${f(v, 1)}</text>`;
    // v-t with signed area
    const pv = panel(184, vr[0], vr[1], 'v', '(m/s)', 'var(--c-P)', vAt, (X, Y) => {
      let pos = `M${X(0)} ${Y(0)}`, neg = pos;
      for (let i = 0; i <= 60; i++) { const tt = (i / 60) * t, vv = vAt(tt); pos += `L${X(tt).toFixed(1)} ${Y(Math.max(vv, 0)).toFixed(1)}`; neg += `L${X(tt).toFixed(1)} ${Y(Math.min(vv, 0)).toFixed(1)}`; }
      pos += `L${X(t)} ${Y(0)}Z`; neg += `L${X(t)} ${Y(0)}Z`;
      return `<path d="${pos}" style="fill:var(--teal);opacity:.25"/><path d="${neg}" style="fill:var(--red);opacity:.25"/>`;
    });
    s += pv.s + `<text x="${R - 4}" y="196" text-anchor="end" font-size="10" style="fill:var(--ink-2)">面積 = Δx（綠正、紅負）</text>`;
    // a-t
    const pa = panel(304, -4.6, 4.6, 'a', '(m/s²)', 'var(--c-X)', () => P.a, (X, Y) => `<rect x="${X(0)}" y="${Math.min(Y(0), Y(P.a))}" width="${X(t) - X(0)}" height="${Math.abs(Y(P.a) - Y(0))}" style="fill:var(--c-X);opacity:.2"/>`);
    s += pa.s + `<text x="${R - 4}" y="316" text-anchor="end" font-size="10" style="fill:var(--ink-2)">面積 = Δv = ${f(P.a * t, 1)} m/s</text>`;
    for (let k = 0; k <= TMAX; k += 2) s += `<text x="${pa.X(k)}" y="410" text-anchor="middle" font-size="11" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="${R}" y="428" text-anchor="end" font-size="11" style="fill:var(--mute)">t (s)</text>`;
    svg.innerHTML = s;
    // readouts
    let path;
    const tr = P.a !== 0 ? -P.v0 / P.a : -1;
    if (tr > 0 && tr < t) { const xt = xAt(tr); path = Math.abs(xt) + Math.abs(x - xt); } else path = Math.abs(x);
    $('[data-f=x]').textContent = `${f(x, 2)} m`;
    $('[data-f=v]').textContent = `${f(v, 2)} m/s`;
    $('[data-f=a]').textContent = `${f(P.a, 1)} m/s²`;
    $('[data-f=A]').textContent = `${f(x, 2)} m`;
    $('[data-f=s]').textContent = `${f(path, 2)} m` + (tr > 0 && tr < t ? `（t = ${f(tr, 2)} s 折返）` : '');
    $('[data-o=v0]').textContent = `${f(P.v0, 1)} m/s`;
    $('[data-o=a]').textContent = `${f(P.a, 1)} m/s²`;
    $('[data-o=t]').textContent = `${f(P.t, 2)} s`;
  }
  // animation
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0, hold = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    if (P.t >= TMAX) { hold += dt; if (hold > 0.8) { hold = 0; P.t = 0; } } else P.t = Math.min(TMAX, P.t + dt);
    inp.t.value = P.t; draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; if (P.t >= TMAX) P.t = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => play(!playing));
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => {
    P[k] = parseFloat(inp[k].value);
    if (k === 't') play(false);
    draw();
  }));
  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    const [v0, a] = b.dataset.p.split(',').map(Number);
    P.v0 = v0; P.a = a; inp.v0.value = v0; inp.a.value = a; P.t = 0; inp.t.value = 0;
    draw(); if (!RM) play(true);
  }));
  if (opt.v0 != null) { P.v0 = +opt.v0; inp.v0.value = P.v0; }
  if (opt.a != null) { P.a = +opt.a; inp.a.value = P.a; }
  draw();
  play(false);
};
