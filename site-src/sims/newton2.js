(window.SIMS = window.SIMS || {}).newton2 = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uid = 'x' + Math.random().toString(36).slice(2, 8);
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>合力、質量與加速度</b><span>拖動合力 F 與質量 m，看光滑軌道上台車的加速度如何改變。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 270" role="img" aria-label="光滑軌道上的台車與 a–F 圖"></svg></div>
<div class="sim-ctl">
${sl('F', 'F', 0, 20, 0.5, 6)}${sl('m', 'm', 0.5, 10, 0.5, 2)}
<div class="ops"><button type="button" data-b="play">播放</button><button type="button" data-b="reset">從靜止重來</button></div>
<div class="facts">${fact('a', '加速度 a = F / m')}${fact('v2', '2 s 後速度 v = at')}${fact('x2', '2 s 內位移 ½at²')}${fact('now', '此刻 t、v')}</div>
<p class="sim-note">m 固定時 a ∝ F（a–F 圖為過原點直線，斜率 = 1/m）；F 固定時 m 加倍，a 減半。加速度方向與合力相同。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { F: 6, m: 2, t: 0 };
  const LEN = 10, X0 = 40, PXM = 20;
  const acc = () => P.F / P.m;
  function draw() {
    const a = acc(), t = P.t, x = 0.5 * a * t * t, v = a * t;
    let s = `<defs><clipPath id="${uid}c"><rect x="50" y="146" width="296" height="98"/></clipPath></defs>`;
    // track
    s += `<line x1="8" x2="350" y1="104" y2="104" style="stroke:var(--ink-2)" stroke-width="3"/>`;
    for (let k = 0; k <= LEN; k += 2) s += `<line x1="${X0 + k * PXM}" x2="${X0 + k * PXM}" y1="104" y2="111" style="stroke:var(--ink-2)"/><text x="${X0 + k * PXM}" y="123" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="346" y="136" text-anchor="end" font-size="10" style="fill:var(--mute)">位置 (m)，光滑軌道</text>`;
    const x2 = 0.5 * a * 4;
    if (x2 <= LEN) s += `<line x1="${X0 + x2 * PXM}" x2="${X0 + x2 * PXM}" y1="58" y2="104" style="stroke:var(--sun)" stroke-width="2" stroke-dasharray="4 3"/><text x="${X0 + x2 * PXM}" y="54" text-anchor="middle" font-size="10" style="fill:var(--ink-2)">t = 2 s</text>`;
    // cart
    const w = 30 + 3 * P.m, cx = X0 + Math.min(x, LEN) * PXM + w / 2;
    s += `<rect x="${cx - w}" y="76" width="${w}" height="20" rx="4" style="fill:var(--teal)"/><circle cx="${cx - w + 7}" cy="98" r="5" style="fill:var(--ink)"/><circle cx="${cx - 7}" cy="98" r="5" style="fill:var(--ink)"/>`;
    s += `<text x="${cx - w / 2}" y="90" text-anchor="middle" font-size="10" style="fill:#fff">${f(P.m, 1)} kg</text>`;
    const fl = P.F * 4;
    if (fl > 1) s += `<line x1="${cx}" x2="${cx + fl}" y1="86" y2="86" style="stroke:var(--red)" stroke-width="3"/><path d="M${cx + fl + 4} 86 l-9 -5 v10z" style="fill:var(--red)"/><text x="${cx + 4}" y="78" font-size="11" style="fill:var(--red)">F = ${f(P.F, 1)} N</text>`;
    const al = Math.min(90, a * 6);
    if (al > 1) s += `<line x1="${cx - w}" x2="${cx - w + al}" y1="66" y2="66" style="stroke:var(--c-X)" stroke-width="2"/><path d="M${cx - w + al + 3} 66 l-7 -4 v8z" style="fill:var(--c-X)"/><text x="${cx - w}" y="60" font-size="11" style="fill:var(--c-X)">a</text>`;
    s += `<text x="10" y="20" font-size="11" style="fill:var(--ink-2)">t = ${f(t, 2)} s　v = ${f(v, 1)} m/s</text>`;
    // a-F graph
    const GX = (F) => 50 + (F / 20) * 296, GY = (aa) => 244 - (aa / 20) * 98;
    s += `<rect x="50" y="146" width="296" height="98" style="fill:var(--card);stroke:var(--line)"/>`;
    for (let k = 5; k < 20; k += 5) s += `<line x1="${GX(k)}" x2="${GX(k)}" y1="146" y2="244" style="stroke:var(--line)" stroke-dasharray="2 3"/><line x1="50" x2="346" y1="${GY(k)}" y2="${GY(k)}" style="stroke:var(--line)" stroke-dasharray="2 3"/>`;
    s += `<g clip-path="url(#${uid}c)"><line x1="${GX(0)}" y1="${GY(0)}" x2="${GX(20)}" y2="${GY(20 / P.m)}" style="stroke:var(--c-X)" stroke-width="2.2"/>`;
    s += `<circle cx="${GX(P.F)}" cy="${GY(Math.min(a, 19.7))}" r="5" style="fill:var(--red);stroke:#fff" stroke-width="1.5"/></g>`;
    s += `<text x="46" y="${GY(20) + 9}" text-anchor="end" font-size="10" style="fill:var(--mute)">20</text><text x="46" y="${GY(10) + 4}" text-anchor="end" font-size="10" style="fill:var(--mute)">10</text><text x="46" y="246" text-anchor="end" font-size="10" style="fill:var(--mute)">0</text>`;
    s += `<text x="12" y="200" font-size="11" style="fill:var(--c-X)">a</text><text x="4" y="214" font-size="9" style="fill:var(--mute)">(m/s²)</text>`;
    for (let k = 5; k <= 20; k += 5) s += `<text x="${GX(k)}" y="257" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="346" y="268" text-anchor="end" font-size="10" style="fill:var(--mute)">F (N)</text><text x="56" y="160" font-size="10" style="fill:var(--c-X)">斜率 = 1/m = ${f(1 / P.m, 2)} kg⁻¹</text>`;
    svg.innerHTML = s;
    $('[data-f=a]').textContent = `${f(P.F, 1)} / ${f(P.m, 1)} = ${f(a, 2)} m/s²`;
    $('[data-f=v2]').textContent = `${f(a * 2, 2)} m/s`;
    $('[data-f=x2]').textContent = `${f(x2, 2)} m`;
    $('[data-f=now]').textContent = `${f(t, 2)} s，${f(v, 2)} m/s`;
    $('[data-o=F]').textContent = `${f(P.F, 1)} N`;
    $('[data-o=m]').textContent = `${f(P.m, 1)} kg`;
  }
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0, hold = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    const a = acc(), end = 0.5 * a * P.t * P.t >= LEN || P.t >= 4;
    if (end) { hold += dt; if (hold > 0.7) { hold = 0; P.t = 0; } } else P.t = Math.min(a > 0 ? Math.sqrt(2 * LEN / a) : 4, 4, P.t + dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => play(!playing));
  $('[data-b=reset]').addEventListener('click', () => { P.t = 0; hold = 0; draw(); if (!RM) play(true); });
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => {
    P[k] = parseFloat(inp[k].value);
    P.t = RM ? Math.min(2, Math.sqrt(2 * LEN / Math.max(acc(), 1e-9))) : 0; hold = 0; draw();
  }));
  if (RM) P.t = Math.min(2, Math.sqrt(2 * LEN / acc()));
  draw();
  play(!RM);
};
