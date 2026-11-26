(window.SIMS = window.SIMS || {}).doppler = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uid = 'x' + Math.random().toString(36).slice(2, 8);
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span data-l="${k}">${lab}</span><b data-f="${k}"></b></div>`;
  const V = 340, CV = 40, TE = 0.45, D = 7; // sound speed; visual wave speed px/s; emission interval s; loop s
  el.innerHTML = `<div class="sim-head"><b>運動波源的都卜勒效應</b><span>拖動波源速率 vs，比較波源前方與後方的波前疏密，以及觀察者測得的頻率。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 230" role="img" aria-label="向右運動的聲源發出的圓形波前"></svg></div>
<div class="sim-ctl">
${sl('vs', 'vs', 0, 300, 1, 85)}${sl('f', 'f', 200, 1000, 10, 600)}
<div class="ops"><button type="button" data-o2="1" aria-pressed="true">前方觀察者</button><button type="button" data-o2="-1" aria-pressed="false">後方觀察者</button><button type="button" data-b="play">播放</button></div>
<div class="facts">${fact('main', '')}${fact('lam', '')}${fact('other', '')}${fact('v', '聲速 v（靜止空氣）')}</div>
<p class="sim-note">波源運動使前方波長變短、後方變長；聲速仍是 v，所以前方頻率升高、後方降低。波源本身的頻率 f 沒有改變。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { vs: 85, f: 600, side: 1, t: 3.6 };
  const srcX = (t) => 180 + CV * (P.vs / V) * (t - D / 2);
  function draw() {
    const t = P.t;
    let s = `<defs><clipPath id="${uid}"><rect x="0" y="0" width="360" height="230"/></clipPath></defs><g clip-path="url(#${uid})">`;
    s += `<line x1="0" x2="360" y1="112" y2="112" style="stroke:var(--line)" stroke-dasharray="3 4"/>`;
    for (let k = 0; k * TE <= t; k++) {
      const te = k * TE, r = CV * (t - te), op = Math.max(0.15, 1 - r / 300);
      s += `<circle cx="${srcX(te).toFixed(1)}" cy="112" r="${r.toFixed(1)}" fill="none" style="stroke:var(--c-P);opacity:${op.toFixed(2)}" stroke-width="1.5"/>`;
    }
    s += '</g>';
    const sx = srcX(t);
    s += `<circle cx="${sx}" cy="112" r="8" style="fill:var(--red);stroke:#fff" stroke-width="2"/>`;
    if (P.vs > 0) s += `<path d="M${sx + 12} 112 h${10 + P.vs / 10} l-6 -4 m6 4 l-6 4" fill="none" style="stroke:var(--red)" stroke-width="2"/>`;
    s += `<text x="${sx}" y="136" text-anchor="middle" font-size="11" style="fill:var(--red)">波源</text>`;
    [[344, 1, '前方'], [16, -1, '後方']].forEach(([x, sd, lab]) => {
      const on = P.side === sd;
      s += `<rect x="${x - 12}" y="${on ? 150 : 154}" width="24" height="${on ? 30 : 22}" rx="5" style="fill:${on ? 'var(--sun)' : 'var(--card)'};stroke:var(--ink-2)"/>`;
      s += `<text x="${x}" y="${on ? 170 : 169}" text-anchor="middle" font-size="12" style="fill:var(--ink)">耳</text><text x="${x}" y="198" text-anchor="middle" font-size="11" style="fill:var(--ink-2)">${lab}</text>`;
    });
    s += `<rect x="62" y="211" width="236" height="15" rx="4" style="fill:var(--bg);opacity:.9"/>`;
    s += `<text x="180" y="222" text-anchor="middle" font-size="10" style="fill:var(--mute)">波前間隔為示意（未依實際頻率）；vs/v = ${f(P.vs / V, 2)}</text>`;
    svg.innerHTML = s;
    const fa = (P.f * V) / (V - P.vs), fb = (P.f * V) / (V + P.vs);
    const main = P.side > 0, sg = main ? '−' : '+';
    $('[data-l=main]').textContent = `${main ? '前方' : '後方'}觀察者 f′ = f·v/(v ${sg} vs)`;
    $('[data-f=main]').textContent = `${f(P.f, 0)}×${V}/(${V} ${sg} ${f(P.vs, 0)}) = ${f(main ? fa : fb, 0)} Hz`;
    $('[data-l=lam]').textContent = `${main ? '前方' : '後方'}波長 λ′ = (v ${sg} vs)/f`;
    $('[data-f=lam]').textContent = `${f((main ? V - P.vs : V + P.vs) / P.f, 3)} m（靜止時 ${f(V / P.f, 3)} m）`;
    $('[data-l=other]').textContent = `${main ? '後方' : '前方'}觀察者 f′`;
    $('[data-f=other]').textContent = `${f(main ? fb : fa, 0)} Hz`;
    $('[data-f=v]').textContent = `${V} m/s`;
    $('[data-o=vs]').textContent = `${f(P.vs, 0)} m/s`;
    $('[data-o=f]').textContent = `${f(P.f, 0)} Hz`;
  }
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    P.t += dt;
    if (P.t > D) P.t = 0;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => play(!playing));
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => { P[k] = parseFloat(inp[k].value); if (k === 'vs' && playing) P.t = 0; draw(); }));
  el.querySelectorAll('[data-o2]').forEach((b) => b.addEventListener('click', () => {
    P.side = +b.dataset.o2;
    el.querySelectorAll('[data-o2]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    draw();
  }));
  draw();
  play(!RM);
};
