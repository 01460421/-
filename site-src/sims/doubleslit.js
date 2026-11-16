(window.SIMS = window.SIMS || {}).doubleslit = function (el, opt) {
  opt = opt || {};
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  const YW = 15; // half-width of screen window (mm)
  el.innerHTML = `<div class="sim-head"><b>楊氏雙狹縫干涉</b><span>改變波長 λ、狹縫間距 d 與屏距 L，看屏上亮紋間距如何改變。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 290" role="img" aria-label="雙狹縫干涉條紋與光強度分布"></svg></div>
<div class="sim-ctl">
${sl('lam', 'λ', 380, 750, 5, 600)}${sl('d', 'd', 0.1, 0.5, 0.01, 0.25)}${sl('L', 'L', 0.5, 3, 0.1, 1.5)}
<div class="ops"><button type="button" data-p="650">紅光</button><button type="button" data-p="530">綠光</button><button type="button" data-p="450">藍光</button></div>
<div class="facts">${fact('dy', '亮紋間距 Δy = Lλ/d')}${fact('dark', '第 1 暗紋位置 ½Δy')}${fact('sin', '第 1 亮紋 sin θ = λ/d')}${fact('col', '光的顏色')}</div>
<p class="sim-note">Δy 與 L、λ 成正比，與 d 成反比：屏移遠或換紅光條紋變疏，狹縫間距加大條紋變密。中央 m = 0 為亮紋，暗紋在相鄰亮紋正中間。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { lam: 600, d: 0.25, L: 1.5 };
  function rgb(w) {
    let r = 0, g = 0, b = 0;
    if (w < 440) { r = (440 - w) / 60; b = 1; } else if (w < 490) { g = (w - 440) / 50; b = 1; } else if (w < 510) { g = 1; b = (510 - w) / 20; } else if (w < 580) { r = (w - 510) / 70; g = 1; } else if (w < 645) { r = 1; g = (645 - w) / 65; } else r = 1;
    const k = w < 420 ? 0.4 + (0.6 * (w - 380)) / 40 : w > 700 ? 0.4 + (0.6 * (750 - w)) / 50 : 1;
    return `rgb(${[r, g, b].map((c) => Math.round(255 * Math.pow(c * k, 0.8))).join(',')})`;
  }
  const cname = (w) => (w < 450 ? '紫' : w < 495 ? '藍' : w < 570 ? '綠' : w < 590 ? '黃' : w < 620 ? '橙' : '紅');
  function draw() {
    const lam = P.lam * 1e-9, d = P.d * 1e-3, L = P.L;
    const dy = (L * lam) / d * 1000; // mm
    const I = (y) => Math.pow(Math.cos((Math.PI * y) / dy), 2);
    const col = rgb(P.lam);
    const X = (y) => 20 + ((y + YW) / (2 * YW)) * 320;
    let s = '';
    // schematic
    const sx = 330, bx = sx - (40 + P.L * 80), gap = 6 + P.d * 40;
    s += `<rect x="${sx}" y="10" width="6" height="64" style="fill:var(--ink-2)"/><text x="${sx - 4}" y="22" text-anchor="end" font-size="10" style="fill:var(--mute)">屏</text>`;
    s += `<rect x="${bx - 3}" y="10" width="6" height="${42 - gap / 2 - 2}" style="fill:var(--ink)"/><rect x="${bx - 3}" y="${42 - gap / 2 + 2}" width="6" height="${gap - 4}" style="fill:var(--ink)"/><rect x="${bx - 3}" y="${42 + gap / 2 + 2}" width="6" height="${32 - gap / 2 - 2}" style="fill:var(--ink)"/>`;
    s += `<line x1="8" x2="${bx - 6}" y1="42" y2="42" style="stroke:${col}" stroke-width="3"/><path d="M${bx - 6} 42 l-8 -4 v8z" style="fill:${col}"/>`;
    [-1, 1].forEach((sg) => { s += `<path d="M${bx + 3} ${42 + sg * gap / 2} L${sx} ${42 - 26} M${bx + 3} ${42 + sg * gap / 2} L${sx} ${42 + 26}" style="stroke:${col};opacity:.45" stroke-width="1"/>`; });
    s += `<text x="${bx - 8}" y="${42 + gap / 2 + 14}" text-anchor="end" font-size="10" style="fill:var(--ink-2)">d</text>`;
    s += `<line x1="${bx}" x2="${sx}" y1="84" y2="84" style="stroke:var(--ink-2)"/><text x="${(bx + sx) / 2}" y="80" text-anchor="middle" font-size="10" style="fill:var(--ink-2)">L = ${f(P.L, 1)} m（示意，未依比例）</text>`;
    // fringe strip
    s += `<rect x="20" y="98" width="320" height="38" style="fill:#000"/>`;
    for (let i = 0; i < 320; i++) { const y = -YW + ((i + 0.5) / 320) * 2 * YW; s += `<rect x="${20 + i}" y="98" width="1.2" height="38" style="fill:${col};opacity:${I(y).toFixed(2)}"/>`; }
    s += `<text x="20" y="94" font-size="10" style="fill:var(--mute)">屏上條紋（理想情形）</text>`;
    // intensity curve
    const GY = (v) => 240 - v * 82;
    s += `<rect x="20" y="152" width="320" height="94" style="fill:var(--card);stroke:var(--line)"/>`;
    let p = '';
    for (let i = 0; i <= 640; i++) { const y = -YW + (i / 640) * 2 * YW; p += (i ? 'L' : 'M') + X(y).toFixed(2) + ' ' + GY(I(y)).toFixed(1); }
    s += `<path d="${p}" fill="none" style="stroke:var(--teal)" stroke-width="1.6"/>`;
    for (let m = -3; m <= 3; m++) { const y = m * dy; if (Math.abs(y) <= YW && (dy > 2.2 || m === 0)) s += `<text x="${X(y)}" y="149" text-anchor="middle" font-size="9" style="fill:var(--ink-2)">${m === 0 ? 'm = 0' : f(m, 0)}</text>`; }
    if (dy <= YW) s += `<line x1="${X(0)}" x2="${X(dy)}" y1="244" y2="244" style="stroke:var(--c-C)" stroke-width="2"/><line x1="${X(dy)}" x2="${X(dy)}" y1="152" y2="246" style="stroke:var(--c-C)" stroke-dasharray="2 2"/><line x1="${X(0)}" x2="${X(0)}" y1="152" y2="246" style="stroke:var(--c-C)" stroke-dasharray="2 2"/><text x="${X(dy) + 3}" y="238" font-size="11" style="fill:var(--c-C)">Δy</text>`;
    for (let y = -YW; y <= YW; y += 5) s += `<line x1="${X(y)}" x2="${X(y)}" y1="246" y2="251" style="stroke:var(--ink-2)"/><text x="${X(y)}" y="263" text-anchor="middle" font-size="10" style="fill:var(--mute)">${f(y, 0)}</text>`;
    s += `<text x="340" y="280" text-anchor="end" font-size="10" style="fill:var(--mute)">屏上位置 y (mm)</text><text x="20" y="280" font-size="10" style="fill:var(--mute)">光強度 I</text>`;
    svg.innerHTML = s;
    $('[data-f=dy]').textContent = `${f(P.L, 1)}×${P.lam}×10⁻⁹ / ${f(P.d, 2)}×10⁻³ = ${f(dy, 2)} mm`;
    $('[data-f=dark]').textContent = `${f(dy / 2, 2)} mm`;
    $('[data-f=sin]').textContent = `${f(lam / d, 5)}`;
    $('[data-f=col]').innerHTML = `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;background:${col}"></span> ${cname(P.lam)}光 ${P.lam} nm`;
    $('[data-o=lam]').textContent = `${P.lam} nm`;
    $('[data-o=d]').textContent = `${f(P.d, 2)} mm`;
    $('[data-o=L]').textContent = `${f(P.L, 1)} m`;
  }
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => { P[k] = parseFloat(inp[k].value); draw(); }));
  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { P.lam = +b.dataset.p; inp.lam.value = P.lam; draw(); }));
  draw();
};
