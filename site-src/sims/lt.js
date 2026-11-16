(window.SIMS = window.SIMS || {}).lt = function (el, opt) {
  const r3 = (x) => Math.round(x * 1000) / 1000, c30 = r3(Math.cos(Math.PI / 6)), s30 = 0.5;
  const PRE = { rot: ['旋轉 30°', [c30, -s30, s30, c30]], refx: ['對 x 軸鏡射', [1, 0, 0, -1]], refyx: ['對 y=x 鏡射', [0, 1, 1, 0]],
    shear: ['推移', [1, 1.5, 0, 1]], scale: ['伸縮', [2, 0, 0, 0.5]], proj: ['投影到 x 軸', [1, 0, 0, 0]], id: ['單位方陣', [1, 0, 0, 1]] };
  const keys = opt.presets || Object.keys(PRE);
  const M = { a: 1, b: 0, c: 0, d: 1 };
  [M.a, M.b, M.c, M.d] = (PRE[opt.preset || keys[0]] || PRE.id)[1];
  const S = 52, uid = 'lt' + Math.random().toString(36).slice(2, 7);
  el.innerHTML = `<div class="sim-head"><b>${opt.title || '線性變換：單位正方形變成什麼'}</b><span>拖動 a、b、c、d 或按預設，看藍色單位正方形與字母 F 被矩陣變成什麼形狀。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="-200 -200 400 400" role="img" aria-label="線性變換示意"></svg></div><div class="sim-ctl">
  ${['a', 'b', 'c', 'd'].map((k) => `<label class="sl"><span>${k}</span><input type="range" min="-3" max="3" step="0.1" data-k="${k}"><output></output></label>`).join('')}
  <label class="sl"><span>過程</span><input type="range" min="0" max="1" step="0.01" value="1" data-t><output>100%</output></label>
  <div class="ops">${keys.map((k) => `<button type="button" data-p="${k}">${PRE[k][0]}</button>`).join('')}</div>
  <div class="facts" data-f></div><p class="sim-note">矩陣的第 1 行是 (1,0) 的像、第 2 行是 (0,1) 的像；|det| 是面積倍率，det &lt; 0 時 F 翻面。</p></div></div>`;
  const q = (s) => el.querySelector(s), qa = (s) => [...el.querySelectorAll(s)];
  const fmt = (x) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(2));
  function draw() {
    const t = +q('[data-t]').value;
    const a = 1 + (M.a - 1) * t, b = M.b * t, c = M.c * t, d = 1 + (M.d - 1) * t;
    const T = (x, y) => [(a * x + b * y) * S, -(c * x + d * y) * S];
    let g = '';
    for (let k = -3; k <= 3; k++) g += `<line x1="${-3.6 * S}" y1="${-k * S}" x2="${3.6 * S}" y2="${-k * S}" stroke="var(--line)"/><line x1="${k * S}" y1="${-3.6 * S}" x2="${k * S}" y2="${3.6 * S}" stroke="var(--line)"/>`;
    g += `<line x1="${-3.7 * S}" y1="0" x2="${3.7 * S}" y2="0" stroke="var(--mute)" stroke-width="1.4"/><line x1="0" y1="${3.7 * S}" x2="0" y2="${-3.7 * S}" stroke="var(--mute)" stroke-width="1.4"/>`;
    for (let k = -4; k <= 4; k++) { const p1 = T(-4, k), p2 = T(4, k), p3 = T(k, -4), p4 = T(k, 4); g += `<line x1="${p1}" x2="${p2}" stroke="var(--sun)" opacity=".8"/><line x1="${p3}" x2="${p4}" stroke="var(--sun)" opacity=".8"/>`.replace(/x1="([^,"]+),([^"]+)"/g, 'x1="$1" y1="$2"').replace(/x2="([^,"]+),([^"]+)"/g, 'x2="$1" y2="$2"'); }
    g += `<polygon points="0,0 ${S},0 ${S},${-S} 0,${-S}" fill="var(--c-P)" fill-opacity=".16" stroke="var(--c-P)" stroke-width="2"/>`;
    g += `<polygon points="${[T(0, 0), T(1, 0), T(1, 1), T(0, 1)].map((p) => p.join(',')).join(' ')}" fill="var(--c-C)" fill-opacity=".25" stroke="var(--c-C)" stroke-width="2.5"/>`;
    const F = [[.25, .2], [.25, .85], [.75, .85], [.75, .72], [.4, .72], [.4, .58], [.65, .58], [.65, .45], [.4, .45], [.4, .2]];
    g += `<polygon points="${F.map(([x, y]) => [x * S, -y * S].join(',')).join(' ')}" fill="var(--c-P)" fill-opacity=".5"/>`;
    g += `<polygon points="${F.map(([x, y]) => T(x, y).join(',')).join(' ')}" fill="var(--red)" fill-opacity=".75"/>`;
    const e1 = T(1, 0), e2 = T(0, 1);
    g += `<defs><marker id="${uid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink)"/></marker></defs>`;
    g += `<line x1="0" y1="0" x2="${e1[0]}" y2="${e1[1]}" stroke="var(--ink)" stroke-width="2.4" marker-end="url(#${uid})"/><line x1="0" y1="0" x2="${e2[0]}" y2="${e2[1]}" stroke="var(--ink)" stroke-width="2.4" marker-end="url(#${uid})"/>`;
    q('svg').innerHTML = g;
    q('[data-t]').nextElementSibling.textContent = Math.round(t * 100) + '%';
    const D = M.a * M.d - M.b * M.c;
    q('[data-f]').innerHTML = [['矩陣 [a b; c d]', `[${fmt(M.a)} ${fmt(M.b)}; ${fmt(M.c)} ${fmt(M.d)}]`], ['det = ad − bc', fmt(D)], ['面積倍率 |det|', fmt(Math.abs(D))],
      ['方向', Math.abs(D) < 1e-9 ? '壓扁成線或點' : D > 0 ? '保持' : '翻轉'], ['(1,0) 的像', `(${fmt(M.a)}, ${fmt(M.c)})`], ['(0,1) 的像', `(${fmt(M.b)}, ${fmt(M.d)})`]]
      .map(([k, v]) => `<div class="fact"><span>${k}</span><b>${v}</b></div>`).join('');
  }
  const sync = () => { qa('[data-k]').forEach((i) => { i.value = M[i.dataset.k]; i.nextElementSibling.textContent = fmt(M[i.dataset.k]); }); draw(); };
  qa('[data-k]').forEach((i) => i.addEventListener('input', () => { M[i.dataset.k] = +(+i.value).toFixed(2); i.nextElementSibling.textContent = fmt(M[i.dataset.k]); qa('[data-p]').forEach((b) => b.setAttribute('aria-pressed', 'false')); draw(); }));
  q('[data-t]').addEventListener('input', draw);
  qa('[data-p]').forEach((b) => b.addEventListener('click', () => { [M.a, M.b, M.c, M.d] = PRE[b.dataset.p][1]; qa('[data-p]').forEach((x) => x.setAttribute('aria-pressed', x === b)); q('[data-t]').value = 0; sync();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { q('[data-t]').value = 1; draw(); return; }
    const t0 = performance.now(); const step = (now) => { if (!el.isConnected) return; const t = Math.min(1, (now - t0) / 900); q('[data-t]').value = t; draw(); if (t < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }));
  const first = qa('[data-p]').find((b) => b.dataset.p === (opt.preset || keys[0])); if (first) first.setAttribute('aria-pressed', 'true');
  sync();
};
