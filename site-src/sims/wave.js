(window.SIMS = window.SIMS || {}).wave = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>繩波的振幅、波長與頻率</b><span>拖動 A、λ、f，看波形如何前進，以及紅色質點如何只上下振動。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 290" role="img" aria-label="繩上行進橫波與質點振動圖"></svg></div>
<div class="sim-ctl">
${sl('A', 'A', 1, 10, 0.5, 5)}${sl('L', 'λ', 0.4, 2, 0.1, 1.2)}${sl('f', 'f', 0.5, 3, 0.1, 1)}
<div class="ops"><button type="button" data-b="play">播放</button></div>
<div class="facts">${fact('v', '波速 v = fλ')}${fact('T', '週期 T = 1/f')}${fact('y', '紅色質點此刻位移 y')}${fact('E', '振幅 A（能量 ∝ A²）')}</div>
<p class="sim-note">波形（波峰▼）以波速 v 向右移動，每經一個週期 T 前進一個波長；質點只在原位置上下振動，不隨波前進。f 改變時 λ 不變，v 跟著變──真實同一條繩上 v 固定，f 加倍則 λ 減半。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { A: 5, L: 1.2, f: 1, t: 0, t0: 0 };
  const XP = 1.0, W = 4, WIN = 3; // marked particle at 1.0 m; rope 4 m; y–t window 3 s
  const yAt = (x, t) => P.A * Math.sin(2 * Math.PI * (x / P.L - P.f * t));
  const SX = (x) => 20 + x * 80, SY = (y) => 86 - y * 5;
  function draw() {
    const t = P.t, v = P.f * P.L;
    let s = '';
    s += `<line x1="20" x2="340" y1="86" y2="86" style="stroke:var(--line)" stroke-dasharray="3 3"/>`;
    for (let k = 0; k <= W; k++) s += `<text x="${SX(k)}" y="152" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="340" y="164" text-anchor="end" font-size="10" style="fill:var(--mute)">x (m)　位移縱向放大</text>`;
    let d = '';
    for (let i = 0; i <= 200; i++) { const x = (i / 200) * W; d += (i ? 'L' : 'M') + SX(x).toFixed(1) + ' ' + SY(yAt(x, t)).toFixed(1); }
    s += `<path d="${d}" fill="none" style="stroke:var(--teal)" stroke-width="2.5"/>`;
    for (let x = 0.2; x < W; x += 0.2) s += `<circle cx="${SX(x).toFixed(1)}" cy="${SY(yAt(x, t)).toFixed(1)}" r="2.2" style="fill:var(--ink-2)"/>`;
    // crest marker moving at v
    const N = Math.max(1, Math.floor(W / P.L));
    const xc = (((P.L / 4 + v * t) % (N * P.L)) + N * P.L) % (N * P.L);
    s += `<path d="M${SX(xc)} ${SY(P.A) - 6} l-6 -9 h12z" style="fill:var(--c-C)"/>`;
    const xa = xc + P.L <= W ? xc : xc - P.L;
    if (xa >= 0) s += `<line x1="${SX(xa)}" x2="${SX(xa + P.L)}" y1="${SY(-P.A) + 14}" y2="${SY(-P.A) + 14}" style="stroke:var(--c-C)" stroke-width="1.5"/><line x1="${SX(xa)}" x2="${SX(xa)}" y1="${SY(-P.A) + 9}" y2="${SY(-P.A) + 19}" style="stroke:var(--c-C)"/><line x1="${SX(xa + P.L)}" x2="${SX(xa + P.L)}" y1="${SY(-P.A) + 9}" y2="${SY(-P.A) + 19}" style="stroke:var(--c-C)"/><text x="${SX(xa + P.L / 2)}" y="${SY(-P.A) + 28}" text-anchor="middle" font-size="11" style="fill:var(--c-C)">λ = ${f(P.L, 1)} m</text>`;
    // marked particle
    const yp = yAt(XP, t);
    s += `<line x1="${SX(XP)}" x2="${SX(XP)}" y1="${SY(P.A)}" y2="${SY(-P.A)}" style="stroke:var(--red)" stroke-width="1" stroke-dasharray="2 2"/>`;
    s += `<circle cx="${SX(XP)}" cy="${SY(yp)}" r="5.5" style="fill:var(--red);stroke:#fff" stroke-width="1.5"/>`;
    s += `<text x="20" y="18" font-size="11" style="fill:var(--ink-2)">波向右傳播 →　v = ${f(v, 2)} m/s</text>`;
    // y–t graph of the red particle (extends to the right)
    const GX = (tt) => 46 + ((tt - P.t0) / WIN) * 300, GY = (y) => 232 - y * 4.5;
    s += `<rect x="46" y="182" width="300" height="100" style="fill:var(--card);stroke:var(--line)"/><line x1="46" x2="346" y1="232" y2="232" style="stroke:var(--line)"/>`;
    s += `<text x="46" y="176" font-size="10" style="fill:var(--red)">紅色質點的振動圖（y–t 圖）</text><text x="346" y="176" text-anchor="end" font-size="10" style="fill:var(--mute)">橫軸 ${WIN} s</text>`;
    s += `<text x="42" y="${GY(P.A) + 4}" text-anchor="end" font-size="10" style="fill:var(--mute)">${f(P.A, 1)}</text><text x="42" y="${GY(-P.A) + 4}" text-anchor="end" font-size="10" style="fill:var(--mute)">${f(-P.A, 1)}</text><text x="4" y="236" font-size="10" style="fill:var(--mute)">y(cm)</text>`;
    d = '';
    const n = 160;
    for (let i = 0; i <= n; i++) { const tt = P.t0 + ((t - P.t0) * i) / n; d += (i ? 'L' : 'M') + GX(tt).toFixed(1) + ' ' + GY(yAt(XP, tt)).toFixed(1); }
    s += `<path d="${d}" fill="none" style="stroke:var(--red)" stroke-width="2"/>`;
    const T = 1 / P.f;
    if (T <= WIN) s += `<line x1="${GX(P.t0)}" x2="${GX(P.t0 + T)}" y1="276" y2="276" style="stroke:var(--c-X)" stroke-width="1.5"/><text x="${GX(P.t0 + T / 2)}" y="272" text-anchor="middle" font-size="10" style="fill:var(--c-X)">T</text>`;
    svg.innerHTML = s;
    $('[data-f=v]').textContent = `${f(P.f, 1)} × ${f(P.L, 1)} = ${f(v, 2)} m/s`;
    $('[data-f=T]').textContent = `${f(T, 2)} s`;
    $('[data-f=y]').textContent = `${f(yp, 1)} cm`;
    $('[data-f=E]').textContent = `${f(P.A, 1)} cm`;
    $('[data-o=A]').textContent = `${f(P.A, 1)} cm`;
    $('[data-o=L]').textContent = `${f(P.L, 1)} m`;
    $('[data-o=f]').textContent = `${f(P.f, 1)} Hz`;
  }
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    P.t += dt;
    if (P.t - P.t0 > WIN) P.t0 = P.t;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => play(!playing));
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => {
    P[k] = parseFloat(inp[k].value);
    P.t0 = RM ? 0 : P.t; if (RM) P.t = WIN * 0.8;
    draw();
  }));
  P.t = RM ? WIN * 0.8 : 0;
  draw();
  play(!RM);
};
