(window.SIMS = window.SIMS || {}).orbit = function (el, opt) {
  opt = opt || {};
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('-', '−');
  const sl = (k, lab, min, max, step, val) => `<label class="sl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${k}"></output></label>`;
  const fact = (k, lab) => `<div class="fact"><span>${lab}</span><b data-f="${k}"></b></div>`;
  const NS = 12, RATE = 0.4; // 12 equal-time sectors; 0.4 yr per second of animation
  el.innerHTML = `<div class="sim-head"><b>克卜勒行星運動定律</b><span>調整離心率 e 與半長軸 a，看行星近快遠慢、等時間掃過等面積，以及週期如何隨 a 改變。</span></div>
<div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 260" role="img" aria-label="橢圓軌道與等時間掃過面積"></svg></div>
<div class="sim-ctl">
${sl('e', 'e', 0, 0.9, 0.01, 0.5)}${sl('a', 'a', 0.3, 5.2, 0.01, 1)}
<div class="ops"><button type="button" data-b="play">播放</button><button type="button" data-p="1,0.017">地球</button><button type="button" data-p="1.524,0.093">火星</button><button type="button" data-p="0.387,0.206">水星</button><button type="button" data-p="5.2,0.048">木星</button></div>
<div class="facts">${fact('T', '週期 T = a^(3/2)（T² = a³）')}${fact('rr', '近日距 a(1−e)／遠日距 a(1+e)')}${fact('vr', '近日速率／遠日速率 = r遠／r近')}${fact('A', `每塊面積（${NS} 等分週期）`)}${fact('now', '經過時間、此刻 r、速率')}</div>
<p class="sim-note">相鄰色塊是相等時間內掃過的面積，形狀不同但面積相等（第二定律）；近日點速率最大。週期只由半長軸決定，與 e 無關（第三定律）。</p>
</div></div>`;
  const $ = (s) => el.querySelector(s);
  const svg = $('svg');
  const inp = {};
  el.querySelectorAll('input[data-k]').forEach((i) => (inp[i.dataset.k] = i));
  const P = { e: 0.5, a: 1, t: 0 };
  const period = () => Math.pow(P.a, 1.5);
  function kepler(M) {
    let E = P.e > 0.8 ? Math.PI : M;
    for (let i = 0; i < 30; i++) { const d = (E - P.e * Math.sin(E) - M) / (1 - P.e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
    return E;
  }
  const b = () => P.a * Math.sqrt(1 - P.e * P.e);
  const pos = (M) => { const E = kepler(M); return [P.a * (Math.cos(E) - P.e), b() * Math.sin(E)]; };
  function draw() {
    const a = P.a, e = P.e, bb = b(), T = period();
    const xmin = Math.min(-a * (1 + e), -1), xmax = Math.max(a * (1 - e), 1), ym = Math.max(bb, 1);
    const sc = Math.min(336 / (xmax - xmin), 220 / (2 * ym));
    const sx = 180 - ((xmin + xmax) / 2) * sc, sy = 128;
    const X = (x) => (sx + x * sc).toFixed(1), Y = (y) => (sy - y * sc).toFixed(1);
    const M = ((2 * Math.PI * P.t) / T) % (2 * Math.PI), cur = Math.floor(M / (2 * Math.PI / NS));
    let s = '';
    for (let k = 0; k < NS; k++) {
      const m0 = (2 * Math.PI * k) / NS, m1 = m0 + (2 * Math.PI) / NS;
      let d = `M${X(0)} ${Y(0)}`;
      for (let j = 0; j <= 16; j++) { const p = pos(m0 + ((m1 - m0) * j) / 16); d += `L${X(p[0])} ${Y(p[1])}`; }
      s += `<path d="${d}Z" style="fill:${k === cur ? 'var(--sun)' : k % 2 ? 'var(--teal)' : 'var(--c-P)'};opacity:${k === cur ? 0.55 : 0.16}"/>`;
    }
    s += `<circle cx="${X(0)}" cy="${Y(0)}" r="${sc}" fill="none" style="stroke:var(--mute)" stroke-dasharray="3 4"/>`;
    s += `<text x="${X(0)}" y="${(sy - sc - 4).toFixed(1)}" text-anchor="middle" font-size="10" style="fill:var(--mute)">地球軌道 1 AU</text>`;
    s += `<ellipse cx="${X(-a * e)}" cy="${sy}" rx="${(a * sc).toFixed(1)}" ry="${(bb * sc).toFixed(1)}" fill="none" style="stroke:var(--teal)" stroke-width="2"/>`;
    s += `<line x1="${X(-a * (1 + e))}" x2="${X(a * (1 - e))}" y1="${sy}" y2="${sy}" style="stroke:var(--line)"/>`;
    if (e > 0.02) s += `<circle cx="${X(-2 * a * e)}" cy="${sy}" r="2.5" fill="none" style="stroke:var(--mute)"/>`;
    s += `<text x="${X(a * (1 - e) - 5 / sc)}" y="${sy + 14}" text-anchor="end" font-size="10" style="fill:var(--ink-2)">近日點</text><text x="${X(-a * (1 + e) + 5 / sc)}" y="${sy + 14}" font-size="10" style="fill:var(--ink-2)">遠日點</text>`;
    s += `<circle cx="${X(0)}" cy="${sy}" r="7" style="fill:var(--sun);stroke:var(--c-C)" stroke-width="1.5"/>`;
    const p = pos(M);
    s += `<line x1="${X(0)}" y1="${sy}" x2="${X(p[0])}" y2="${Y(p[1])}" style="stroke:var(--ink-2)" stroke-width="1.2"/>`;
    s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="5.5" style="fill:var(--c-P);stroke:#fff" stroke-width="1.5"/>`;
    s += `<text x="8" y="252" font-size="10" style="fill:var(--mute)">${e > 0.02 ? '空心圓：另一焦點（無天體）　' : ''}動畫：1 秒 = ${RATE} 年</text>`;
    svg.innerHTML = s;
    const rp = a * (1 - e), ra = a * (1 + e), r = Math.hypot(p[0], p[1]);
    const v = 29.78 * Math.sqrt(2 / r - 1 / a);
    $('[data-f=T]').textContent = `${f(T, 3)} 年`;
    $('[data-f=rr]').textContent = `${f(rp, 3)}／${f(ra, 3)} AU`;
    $('[data-f=vr]').textContent = e > 0 ? `${f(ra, 3)} / ${f(rp, 3)} = ${f(ra / rp, 2)}` : '1（圓軌道等速率）';
    $('[data-f=A]').textContent = `πab/${NS} = ${f((Math.PI * a * bb) / NS, 3)} AU²`;
    $('[data-f=now]').textContent = `${f(P.t % T, 2)} 年，${f(r, 3)} AU，${f(v, 1)} km/s`;
    $('[data-o=e]').textContent = f(P.e, 2);
    $('[data-o=a]').textContent = `${f(P.a, 2)} AU`;
  }
  const btn = $('[data-b=play]');
  let playing = false, raf = 0, last = 0;
  function frame(ts) {
    if (!el.isConnected || !playing) { raf = 0; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    P.t = (P.t + dt * RATE) % period();
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play(on) {
    playing = on; btn.textContent = on ? '暫停' : '播放'; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', () => play(!playing));
  Object.keys(inp).forEach((k) => inp[k].addEventListener('input', () => { P[k] = parseFloat(inp[k].value); P.t = P.t % period(); draw(); }));
  el.querySelectorAll('[data-p]').forEach((bt) => bt.addEventListener('click', () => {
    const [a, e] = bt.dataset.p.split(',').map(Number);
    P.a = a; P.e = e; inp.a.value = a; inp.e.value = e; P.t = 0; draw();
  }));
  P.t = RM ? period() * 0.3 : 0;
  draw();
  play(!RM);
};
