(window.SIMS = window.SIMS || {}).freefall = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>鉛直上拋與落體</b><span>調整初速 v₀（向上為正）與拋出高度，看球的高度–時間圖與最高點、落地時間。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 300" role="img" aria-label="鉛直拋體動畫與高度時間圖"></svg></div>
<div class="sim-ctl">
${sl('v0', 'v₀', -20, 20, 1, 15)}${sl('h0', '拋出高度', 0, 40, 1, 20)}
<div class="ops"><button type="button" data-b="play">播放</button><button type="button" data-p="15">上拋</button><button type="button" data-p="0">自由落體</button><button type="button" data-p="-10">下拋</button></div>
<div class="ops"><button type="button" data-g="9.8" aria-pressed="true">g = 9.8 m/s²</button><button type="button" data-g="10" aria-pressed="false">g = 10 m/s²</button></div>
<div class="facts">${fact('H', '最大高度（離地）h₀ + v₀²/2g')}${fact('tt', '到最高點時間 v₀/g')}${fact('tl', '落地時間')}${fact('vl', '落地速率 √(v₀² + 2gh₀)')}${fact('now', '此刻 t、高度、速度 v')}</div>
<p class="sim-note">加速度全程為 −g：最高點時 v = 0，但 a 仍向下；上升與下降經過同一高度時速率相同、方向相反。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { v0: 15, h0: 20, g: 9.8, t: 0 };
  const yAt = (t) => P.h0 + P.v0 * t - 0.5 * P.g * t * t;
  const vAt = (t) => P.v0 - P.g * t;
  const tLand = () => (P.v0 + Math.sqrt(P.v0 * P.v0 + 2 * P.g * P.h0)) / P.g;
  const Hmax = () => P.h0 + (P.v0 > 0 ? (P.v0 * P.v0) / (2 * P.g) : 0);
  function draw() {
    const tl = tLand(), H = Hmax(), t = Math.min(P.t, tl);
    const top = Math.max(H, 5) * 1.12, T = Math.max(tl, 0.5) * 1.05;
    const Y = (h) => 270 - (h / top) * 245;
    const GX = (tt) => 150 + (tt / T) * 196;
    let s = '';
    // ground + platform
    s += `<rect x="0" y="270" width="360" height="30" style="fill:var(--c-E);opacity:.18"/><line x1="0" x2="360" y1="270" y2="270" style="stroke:var(--c-E)" stroke-width="2"/>`;
    if (P.h0 > 0) s += `<rect x="34" y="${Y(P.h0)}" width="52" height="${270 - Y(P.h0)}" style="fill:var(--line)"/><line x1="30" x2="88" y1="${Y(P.h0)}" y2="${Y(P.h0)}" style="stroke:var(--ink-2)" stroke-width="2"/>`;
    s += `<line x1="0" x2="350" y1="${Y(H)}" y2="${Y(H)}" style="stroke:var(--sun)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="4" y="${Y(H) - 4}" font-size="11" style="fill:var(--ink-2)">最高 ${f(H, 1)} m</text>`;
    // axes
    s += `<line x1="150" x2="150" y1="20" y2="270" style="stroke:var(--ink-2)"/>`;
    for (let k = 1; k <= 4; k++) { const h = (top / 1.12) * k / 4; s += `<text x="146" y="${Y(h) + 4}" text-anchor="end" font-size="10" style="fill:var(--mute)">${f(h, 0)}</text>`; }
    s += `<text x="154" y="16" font-size="11" style="fill:var(--mute)">高度 (m)</text><text x="352" y="296" text-anchor="end" font-size="10" style="fill:var(--mute)">t (s)</text>`;
    const step = T > 4 ? 1 : 0.5;
    for (let k = step; k < T; k += step) s += `<line x1="${GX(k)}" x2="${GX(k)}" y1="270" y2="275" style="stroke:var(--ink-2)"/><text x="${GX(k)}" y="284" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text>`;
    let d = '';
    for (let i = 0; i <= 100; i++) { const tt = (i / 100) * tl; d += (i ? 'L' : 'M') + GX(tt).toFixed(1) + ' ' + Y(yAt(tt)).toFixed(1); }
    s += `<path d="${d}" fill="none" style="stroke:var(--teal)" stroke-width="2.2"/>`;
    if (P.v0 > 0) s += `<line x1="${GX(P.v0 / P.g)}" x2="${GX(P.v0 / P.g)}" y1="${Y(H)}" y2="270" style="stroke:var(--sun)" stroke-dasharray="3 3"/>`;
    s += `<circle cx="${GX(t)}" cy="${Y(yAt(t))}" r="4.5" style="fill:var(--teal);stroke:#fff" stroke-width="1.5"/>`;
    // ball + velocity / acceleration arrows
    const by = Y(yAt(t)) - 8, v = vAt(t);
    s += `<line x1="96" x2="96" y1="20" y2="270" style="stroke:var(--line)" stroke-dasharray="2 3"/>`;
    const vl = Math.max(-60, Math.min(60, -v * 2.5));
    if (Math.abs(vl) > 3) s += `<line x1="114" x2="114" y1="${by}" y2="${by + vl}" style="stroke:var(--c-P)" stroke-width="2.5"/><path d="M114 ${by + vl} l-4 ${vl > 0 ? -7 : 7} h8z" style="fill:var(--c-P)"/><text x="120" y="${by + vl / 2 + 4}" font-size="11" font-style="italic" style="fill:var(--c-P)">v</text>`;
    s += `<line x1="134" x2="134" y1="${by}" y2="${by + 22}" style="stroke:var(--red)" stroke-width="2"/><path d="M134 ${by + 24} l-4 -7 h8z" style="fill:var(--red)"/><text x="139" y="${by + 18}" font-size="11" style="fill:var(--red)">g</text>`;
    s += `<circle cx="96" cy="${by}" r="8" style="fill:var(--c-C);stroke:#fff" stroke-width="2"/>`;
    svg.innerHTML = s;
    $('[data-f=H]').textContent = `${f(H, 2)} m`;
    $('[data-f=tt]').textContent = P.v0 > 0 ? `${f(P.v0 / P.g, 2)} s` : '—（不上升）';
    $('[data-f=tl]').textContent = tl > 0 ? `${f(tl, 2)} s` : '0 s（已在地面）';
    $('[data-f=vl]').textContent = `${f(Math.sqrt(P.v0 * P.v0 + 2 * P.g * P.h0), 2)} m/s`;
    $('[data-f=now]').textContent = `${f(t, 2)} s，${f(yAt(t), 1)} m，${f(v, 1)} m/s`;
    $('[data-o=v0]').textContent = `${f(P.v0, 0)} m/s`;
    $('[data-o=h0]').textContent = `${f(P.h0, 0)} m`;
  }
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0, hold = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    const tl = tLand();
    if (P.t >= tl) { hold += dt; if (hold > 1) { hold = 0; P.t = 0; } } else P.t = Math.min(tl, P.t + dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => { if (!playing && P.t >= tLand()) P.t = 0; play(!playing); });
  const restart = () => { P.t = RM ? Math.max(0, P.v0 / P.g) : 0; hold = 0; draw(); };
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => { P[k] = parseFloat(inp[k].value); restart(); }));
  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    P.v0 = +b.dataset.p; inp.v0.value = P.v0; restart(); if (!RM) play(true);
  }));
  el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
    P.g = +b.dataset.g;
    el.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    restart();
  }));
  if (opt.g === 10) $('[data-g="10"]').click();
  restart();
  play(!RM);
};
