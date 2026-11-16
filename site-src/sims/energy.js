(window.SIMS = window.SIMS || {}).energy = function (el, opt) {
  const g = 9.8, m = 1.0, MU = 0.08, L = 1.5, W0 = 0.6, AK = 0.5, HMAX = 1.4;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { mode: opt.mode === 'track' ? 'track' : 'pendulum', h0: 1.0, fric: false, play: !reduce, q: 0, qd: 0, Q: 0, vmaxBottom: 0 };
  el.innerHTML = `<div class="sim-head"><b>力學能守恆：單擺與曲面軌道</b><span>選擇單擺或軌道、設定釋放高度，看動能 K 與位能 U 如何互換；加入摩擦後，少掉的力學能變成熱。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 440 280" role="img" aria-label="單擺或軌道動畫與能量長條圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="mode"><button type="button" data-m="pendulum">單擺</button><button type="button" data-m="track">曲面軌道</button></div>
    <label class="sl"><span>釋放高度 h</span><input type="range" min="0.2" max="${HMAX}" step="0.05" value="1"><output></output></label>
    <div class="ops"><button type="button" data-fric>加入摩擦</button><button type="button" data-play>暫停</button><button type="button" data-reset>重新釋放</button></div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>最低點速率（無摩擦）v = √(2gh)</span><b data-f="vb"></b></div>
      <div class="fact"><span>目前高度、速率</span><b data-f="now"></b></div><div class="fact"><span>通過最低點的速率</span><b data-f="vm"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>K + U + 熱 = 總能量（m = 1.0 kg，g = 9.8 m/s²）</span><b data-f="E"></b></div></div>
    <p class="sim-note" data-f="note"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), $ = (s) => el.querySelector(s);
  const f = (x) => (Math.abs(x) > W0 ? AK * (Math.abs(x) - W0) ** 2 : 0);
  const fp = (x) => (Math.abs(x) > W0 ? 2 * AK * (Math.abs(x) - W0) * Math.sign(x) : 0);
  const fpp = (x) => (Math.abs(x) > W0 ? 2 * AK : 0);
  const height = (q) => (st.mode === 'pendulum' ? L * (1 - Math.cos(q)) : f(q));
  const speed = (q, qd) => (st.mode === 'pendulum' ? L * Math.abs(qd) : Math.abs(qd) * Math.sqrt(1 + fp(q) ** 2));
  const sinphi = (q) => (st.mode === 'pendulum' ? Math.sin(q) : fp(q) / Math.sqrt(1 + fp(q) ** 2));
  function acc(q, qd) {
    const fr = st.fric && qd !== 0 ? MU * g * Math.sign(qd) : 0;
    if (st.mode === 'pendulum') return (-g * Math.sin(q) - fr) / L;
    const k = Math.sqrt(1 + fp(q) ** 2), sdd = -g * fp(q) / k - fr;
    return (sdd - qd * qd * fp(q) * fpp(q) / k) / k;
  }
  function reset() {
    st.q = st.mode === 'pendulum' ? -Math.acos(1 - st.h0 / L) : -(W0 + Math.sqrt(st.h0 / AK));
    st.qd = 0; st.Q = 0; st.vmaxBottom = 0; st.stopped = false;
  }
  function step(dt) {
    const n = 40, h = dt / n;
    for (let i = 0; i < n && !st.stopped; i++) {
      const q0 = st.q, v0 = st.qd, s0 = speed(q0, v0);
      const k1 = acc(q0, v0), k2 = acc(q0 + v0 * h / 2, v0 + k1 * h / 2), k3 = acc(q0 + (v0 + k1 * h / 2) * h / 2, v0 + k2 * h / 2), k4 = acc(q0 + (v0 + k2 * h / 2) * h, v0 + k3 * h);
      let q1 = q0 + h * (v0 + h * (k1 + k2 + k3) / 6), v1 = v0 + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
      if (st.fric && v0 !== 0 && Math.sign(v1) !== Math.sign(v0)) v1 = 0; // friction cannot reverse motion by itself
      st.q = q1; st.qd = v1;
      if (st.fric) st.Q += m * MU * g * (s0 + speed(q1, v1)) / 2 * h;
      if (Math.sign(q1) !== Math.sign(q0)) st.vmaxBottom = speed(q1, v1);
      if (st.fric && v1 === 0 && Math.abs(sinphi(q1)) <= MU) st.stopped = true;
    }
  }
  function draw() {
    const pend = st.mode === 'pendulum', hc = height(st.q), v = speed(st.q, st.qd);
    const U = m * g * hc, K = 0.5 * m * v * v, E0 = m * g * st.h0, Qh = st.fric ? Math.max(0, st.Q) : 0;
    let s = '', bx, by;
    const SC = pend ? 85 : 62, OX = 150, GY = 230;
    const Y = (hm) => GY - hm * SC;
    if (pend) {
      const px = OX, py = GY - L * SC; bx = px + L * SC * Math.sin(st.q); by = py + L * SC * Math.cos(st.q);
      const a0 = Math.acos(1 - st.h0 / L);
      s += `<path d="M${px + L * SC * Math.sin(-a0)} ${py + L * SC * Math.cos(a0)} A${L * SC} ${L * SC} 0 0 0 ${px + L * SC * Math.sin(a0)} ${py + L * SC * Math.cos(a0)}" fill="none" stroke="var(--line)" stroke-dasharray="4 4"/>`;
      s += `<rect x="${px - 40}" y="${py - 6}" width="80" height="6" fill="var(--ink-2)"/><line x1="${px}" y1="${py}" x2="${bx}" y2="${by}" stroke="var(--ink)" stroke-width="1.5"/>`;
    } else {
      const pts = []; for (let x = -2.2; x <= 2.201; x += 0.05) pts.push(`${(OX + x * SC).toFixed(1)},${Y(f(x)).toFixed(1)}`);
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--ink-2)" stroke-width="4" stroke-linecap="round"/>`;
      const nx = -fp(st.q), ny = 1, nn = Math.hypot(nx, ny);
      bx = OX + st.q * SC + (nx / nn) * 11; by = Y(hc) - (ny / nn) * 11;
    }
    s += `<line x1="10" y1="${Y(st.h0)}" x2="290" y2="${Y(st.h0)}" stroke="var(--c-C)" stroke-dasharray="5 4"/><text x="12" y="${Y(st.h0) - 5}" font-size="13" fill="var(--c-C)">釋放高度 h = ${st.h0.toFixed(2)} m</text>`;
    s += `<line x1="10" y1="${GY + (pend ? 11 : 0)}" x2="290" y2="${GY + (pend ? 11 : 0)}" stroke="var(--mute)"/><text x="12" y="${GY + 26}" font-size="12" fill="var(--mute)">最低點：U = 0</text>`;
    s += `<circle cx="${bx}" cy="${by}" r="11" fill="var(--c-P)" stroke="var(--card)" stroke-width="2"/>`;
    // bars
    const BM = m * g * HMAX, BH = 190, B0 = 240, bars = [['K', K, 'var(--c-P)'], ['U', U, 'var(--c-C)'], ['熱', Qh, 'var(--red)'], ['E', K + U + Qh, 'var(--teal)']];
    s += `<line x1="300" y1="${B0}" x2="436" y2="${B0}" stroke="var(--ink-2)"/><line x1="300" y1="${B0 - (E0 / BM) * BH}" x2="436" y2="${B0 - (E0 / BM) * BH}" stroke="var(--teal)" stroke-dasharray="3 3"/>`;
    bars.forEach(([n, val, c], i) => {
      const x = 306 + i * 33, hh = Math.max(0, (val / BM) * BH);
      s += `<rect x="${x}" y="${B0 - hh}" width="26" height="${hh}" fill="${c}" rx="2"/><text x="${x + 13}" y="${B0 + 16}" font-size="13" text-anchor="middle" fill="${c}" font-weight="700">${n}</text><text x="${x + 13}" y="${B0 - hh - 4}" font-size="13" text-anchor="middle" fill="var(--ink-2)">${val.toFixed(1)}</text>`;
    });
    s += `<text x="436" y="${B0 + 32}" font-size="11" text-anchor="end" fill="var(--mute)">單位：J</text>`;
    svg.innerHTML = s;
    $('input[type=range] + output').textContent = st.h0.toFixed(2) + ' m';
    $('[data-f="vb"]').textContent = `√(2 × 9.8 × ${st.h0.toFixed(2)}) = ${Math.sqrt(2 * g * st.h0).toFixed(2)} m/s`;
    $('[data-f="now"]').textContent = `${hc.toFixed(2)} m，${v.toFixed(2)} m/s`;
    $('[data-f="vm"]').textContent = st.vmaxBottom ? st.vmaxBottom.toFixed(2) + ' m/s' : '—';
    $('[data-f="E"]').textContent = `${K.toFixed(2)} + ${U.toFixed(2)}${st.fric ? ' + ' + Qh.toFixed(2) : ''} = ${(K + U + Qh).toFixed(2)} J（初始 mgh = ${E0.toFixed(2)} J）`;
    $('[data-f="note"]').textContent = st.fric ? '有摩擦時力學能 K + U 逐漸減少，減少量等於摩擦生熱；但 K + U + 熱 仍等於初始的 mgh，能量守恆。'
      : (pend ? '張力恆與速度垂直不作功，只有重力作功，力學能守恆：最低點速率只由高度差決定，與擺長、質量無關。' : '光滑軌道的正向力不作功，力學能守恆：不論軌道形狀，同一高度速率相同；回到另一側的同一高度才停下。');
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
    $('[data-fric]').setAttribute('aria-pressed', String(st.fric));
    $('[data-play]').textContent = st.play ? '暫停' : '播放';
  }
  let last = 0, running = false;
  function frame(t) {
    if (!el.isConnected || !st.play) { running = false; return; }
    const dt = last ? Math.min(0.04, (t - last) / 1000) : 1 / 60; last = t; step(dt); draw(); requestAnimationFrame(frame);
  }
  function go() { if (st.play && !running) { running = true; last = 0; requestAnimationFrame(frame); } }
  $('input[type=range]').addEventListener('input', (e) => { st.h0 = Number(e.target.value); reset(); draw(); });
  $('[data-g="mode"]').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; st.mode = b.dataset.m; reset(); draw(); });
  $('[data-fric]').addEventListener('click', () => { st.fric = !st.fric; reset(); draw(); });
  $('[data-play]').addEventListener('click', () => { st.play = !st.play; draw(); go(); });
  $('[data-reset]').addEventListener('click', () => { reset(); draw(); go(); });
  reset();
  if (reduce) { // static: show the state passing the lowest point
    const keep = st.q; st.q = 0; st.qd = (st.mode === 'pendulum' ? 1 / L : 1) * Math.sqrt(2 * g * st.h0); st.vmaxBottom = Math.sqrt(2 * g * st.h0); draw(); st.q = keep; st.qd = 0; st.vmaxBottom = 0;
  } else { draw(); go(); }
};
