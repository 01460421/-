(window.SIMS = window.SIMS || {}).friction = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  el.innerHTML = `<div class="sim-head"><b>靜摩擦力與動摩擦力</b><span>由靜止開始以水平力 F 推木箱，拖動 F、m、μs、μk，看摩擦力 f 如何決定。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 290" role="img" aria-label="水平面上的木箱與 f–F 圖"></svg></div>
<div class="sim-ctl">
${sl('F', '推力 F', 0, 60, 1, 20)}${sl('m', 'm', 1, 10, 0.5, 5)}${sl('us', 'μs', 0.05, 1, 0.05, 0.5)}${sl('uk', 'μk', 0.05, 1, 0.05, 0.4)}
<div class="ops"><button type="button" data-g="10" aria-pressed="true">g = 10 m/s²</button><button type="button" data-g="9.8" aria-pressed="false">g = 9.8 m/s²</button></div>
<div class="facts">${fact('N', '正向力 N = mg')}${fact('fs', '最大靜摩擦力 μsN')}${fact('fk', '動摩擦力 μkN')}${fact('f', '摩擦力 f')}${fact('a', '加速度 a = (F − f)/m')}</div>
<p class="sim-note">未滑動時 f 由力平衡決定，等於推力（不是 μsN）；F 超過 μsN 才滑動，此後 f = μkN 固定。μs 只決定滑動的門檻。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { F: 20, m: 5, us: 0.5, uk: 0.4, g: 10 };
  let off = 0;
  function state() {
    const N = P.m * P.g, fs = P.us * N, fk = P.uk * N;
    const slide = P.F > fs + 1e-9;
    const fr = slide ? fk : P.F;
    return { N, fs, fk, slide, fr, a: slide ? (P.F - fk) / P.m : 0 };
  }
  function arrow(x1, y1, x2, y2, col, w) {
    const ang = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(ang), s = Math.sin(ang);
    return `<line x1="${x1}" y1="${y1}" x2="${x2 - 6 * c}" y2="${y2 - 6 * s}" style="stroke:${col}" stroke-width="${w}"/><path d="M${x2} ${y2} L${x2 - 9 * c + 4 * s} ${y2 - 9 * s - 4 * c} L${x2 - 9 * c - 4 * s} ${y2 - 9 * s + 4 * c}Z" style="fill:${col}"/>`;
  }
  function draw() {
    const S = state();
    let s = '';
    // floor
    s += `<rect x="0" y="104" width="360" height="14" style="fill:var(--c-E);opacity:.18"/><line x1="0" x2="360" y1="104" y2="104" style="stroke:var(--c-E)" stroke-width="2"/>`;
    for (let k = 0; k < 360; k += 16) s += `<line x1="${k}" y1="118" x2="${k + 10}" y2="106" style="stroke:var(--c-E);opacity:.4"/>`;
    const bw = 56 + P.m * 2, bh = 40 + P.m, bx = 150 + off, by = 104 - bh;
    s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" style="fill:var(--c-C);opacity:.85"/><text x="${bx + bw / 2}" y="${by + bh / 2 + 4}" text-anchor="middle" font-size="11" style="fill:#fff">${f(P.m, 1)} kg</text>`;
    const pf = P.F * 1.6;
    if (pf > 1) s += arrow(bx - pf - 2, by + bh / 2, bx - 2, by + bh / 2, 'var(--red)', 3) + `<text x="${bx - pf / 2 - 2}" y="${by + bh / 2 - 8}" text-anchor="middle" font-size="11" style="fill:var(--red)">F</text>`;
    const ff = S.fr * 1.6, fx = bx + bw / 2;
    if (ff > 1) s += arrow(fx, 111, fx - ff, 111, 'var(--c-P)', 3) + `<text x="${fx - ff / 2}" y="132" text-anchor="middle" font-size="11" style="fill:var(--c-P)">f = ${f(S.fr, 1)} N</text>`;
    s += `<text x="10" y="20" font-size="12" style="fill:${S.slide ? 'var(--red)' : 'var(--green)'}">${S.slide ? '滑動中：動摩擦力 f = μkN' : (Math.abs(P.F - S.fs) < 1e-9 ? '臨界（即將滑動）：f = μsN' : '靜止：靜摩擦力 f = F')}</text>`;
    // f-F graph
    const GX = (F) => 46 + (F / 60) * 300, GY = (v) => 274 - (v / 60) * 120;
    s += `<rect x="46" y="154" width="300" height="120" style="fill:var(--card);stroke:var(--line)"/>`;
    for (let k = 20; k < 60; k += 20) s += `<line x1="${GX(k)}" x2="${GX(k)}" y1="154" y2="274" style="stroke:var(--line)" stroke-dasharray="2 3"/><line x1="46" x2="346" y1="${GY(k)}" y2="${GY(k)}" style="stroke:var(--line)" stroke-dasharray="2 3"/>`;
    for (let k = 0; k <= 60; k += 20) s += `<text x="${GX(k)}" y="287" text-anchor="middle" font-size="10" style="fill:var(--mute)">${k}</text><text x="42" y="${GY(k) + 4}" text-anchor="end" font-size="10" style="fill:var(--mute)">${k}</text>`;
    s += `<text x="8" y="150" font-size="10" style="fill:var(--mute)">f (N)</text><text x="296" y="287" text-anchor="middle" font-size="10" style="fill:var(--mute)">F (N)</text>`;
    const fsC = Math.min(S.fs, 60);
    let d = `M${GX(0)} ${GY(0)} L${GX(fsC)} ${GY(fsC)}`;
    if (S.fs < 60) d += ` L${GX(S.fs)} ${GY(S.fk)} L${GX(60)} ${GY(S.fk)}`;
    if (S.fs < 60) s += `<line x1="46" x2="346" y1="${GY(S.fs)}" y2="${GY(S.fs)}" style="stroke:var(--sun)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="50" y="${GY(S.fs) - 4}" font-size="10" style="fill:var(--ink-2)">μsN = ${f(S.fs, 1)}</text>`;
    if (S.fk <= 60) s += `<text x="342" y="${GY(S.fk) + 13 > 270 ? GY(S.fk) - 4 : GY(S.fk) + 13}" text-anchor="end" font-size="10" style="fill:var(--c-P)">μkN = ${f(S.fk, 1)}</text>`;
    s += `<path d="${d}" fill="none" style="stroke:var(--c-P)" stroke-width="2.2"/>`;
    s += `<circle cx="${GX(P.F)}" cy="${GY(Math.min(S.fr, 60))}" r="5.5" style="fill:var(--red);stroke:#fff" stroke-width="1.5"/>`;
    svg.innerHTML = s;
    $('[data-f=N]').textContent = `${f(S.N, 1)} N`;
    $('[data-f=fs]').textContent = `${f(S.fs, 1)} N`;
    $('[data-f=fk]').textContent = `${f(S.fk, 1)} N`;
    $('[data-f=f]').textContent = `${f(S.fr, 1)} N（${S.slide ? '動' : '靜'}摩擦）`;
    $('[data-f=a]').textContent = S.slide ? `(${f(P.F, 0)} − ${f(S.fk, 1)}) / ${f(P.m, 1)} = ${f(S.a, 2)} m/s²` : '0（不動）';
    $('[data-o=F]').textContent = `${f(P.F, 0)} N`;
    $('[data-o=m]').textContent = `${f(P.m, 1)} kg`;
    $('[data-o=us]').textContent = f(P.us, 2);
    $('[data-o=uk]').textContent = f(P.uk, 2);
  }
  let raf = 0, last = 0;
  function frame(ts) {
    if (!el.isConnected) { raf = 0; return; }
    const S = state();
    if (!S.slide) { raf = 0; off = 0; draw(); return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    off += (25 + S.a * 12) * dt;
    if (off > 150) off = -40;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function update() {
    off = state().slide ? off : 0;
    draw();
    if (!RM && state().slide && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => {
    P[k] = parseFloat(inp[k].value);
    if (k === 'uk' && P.uk > P.us) { P.uk = P.us; inp.uk.value = P.uk; }
    if (k === 'us' && P.uk > P.us) { P.uk = P.us; inp.uk.value = P.uk; }
    update();
  }));
  el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
    P.g = +b.dataset.g;
    el.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    update();
  }));
  if (opt.F != null) { P.F = +opt.F; inp.F.value = P.F; }
  update();
};
