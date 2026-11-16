/* calc */
(window.SIMS = window.SIMS || {}).calc = function (el, opt) {
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  class Fr {
    constructor(n, d = 1) { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); this.n = n / g; this.d = d / g; }
    static parse(s) {
      s = String(s).trim(); if (!s) return new Fr(0);
      if (/^-?\d+\/-?\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); if (b === 0) throw new Error('分母不可為 0'); return new Fr(a, b); }
      if (/^-?\d*\.?\d+$/.test(s)) { const k = (s.split('.')[1] || '').length; return new Fr(Math.round(Number(s) * 10 ** k), 10 ** k); }
      throw new Error(`看不懂「${s}」`);
    }
    add(o) { return new Fr(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { return new Fr(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { return new Fr(this.n * o.n, this.d * o.d); }
    div(o) { return new Fr(this.n * o.d, this.d * o.n); }
    get zero() { return this.n === 0; }
    toString() { return this.d === 1 ? String(this.n) : `${this.n}/${this.d}`; }
  }
  const OPS = { add: 'A + B', sub: 'A − B', ab: 'AB', ba: 'BA', det: 'det A', inv: 'A⁻¹', pow: 'Aⁿ' };
  const focus = opt.ops || Object.keys(OPS);
  let size = opt.size || 2;
  const defA = { 2: [['2', '1'], ['1', '1']], 3: [['1', '2', '0'], ['0', '1', '1'], ['1', '0', '1']] };
  const defB = { 2: [['1', '-1'], ['0', '2']], 3: [['1', '0', '0'], ['0', '2', '0'], ['0', '0', '3']] };
  if (opt.A) defA[2] = opt.A; if (opt.B) defB[2] = opt.B;
  el.innerHTML = `<style>.sim[data-sim="calc"] .mi{display:inline-grid;gap:4px;padding:4px 8px;border-left:2px solid var(--ink);border-right:2px solid var(--ink);border-radius:6px}
  .sim[data-sim="calc"] .mi input{width:52px;font-family:var(--f-mono);text-align:center;padding:4px 2px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
  .sim[data-sim="calc"] .mo{display:inline-grid;gap:2px 14px;padding:3px 10px;border-left:2px solid var(--ink);border-right:2px solid var(--ink);border-radius:6px;font-family:var(--f-mono);text-align:center;vertical-align:middle;margin:4px 0}
  .sim[data-sim="calc"] .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:4px 0}.sim[data-sim="calc"] .row b{font-family:var(--f-head);font-size:1.2rem}</style>
  <div class="sim-head"><b>${opt.title || '矩陣計算器'}</b><span>改變 A、B 的元素（可輸入分數，如 2/3），按運算看結果與驗算。</span></div>
  <div class="sim-body"><div class="sim-viz" style="padding:12px">
    <div class="ops" data-size>${[2, 3].map((n) => `<button type="button" data-n="${n}" aria-pressed="${n === size}">${n} × ${n}</button>`).join('')}</div>
    <div class="row"><b>A =</b><div class="mi" data-m="A"></div></div><div class="row"><b>B =</b><div class="mi" data-m="B"></div></div>
  </div><div class="sim-ctl"><div class="ops" data-ops>${focus.map((k) => `<button type="button" data-op="${k}">${OPS[k]}</button>`).join('')}</div>
    <label class="sl" ${focus.includes('pow') ? '' : 'hidden'}><span>n</span><input type="range" min="0" max="12" value="4" data-pow><output>4</output></label>
    <div class="fact" data-out style="min-height:110px;overflow-x:auto"></div><p class="sim-note" data-note></p></div></div>`;
  const q = (s) => el.querySelector(s), qa = (s) => [...el.querySelectorAll(s)];
  const draw = () => {
    [['A', defA], ['B', defB]].forEach(([k, def]) => {
      const m = q(`[data-m="${k}"]`); m.style.gridTemplateColumns = `repeat(${size}, auto)`;
      m.innerHTML = def[size].flat().map((v, i) => `<input inputmode="decimal" value="${v}" aria-label="${k} 第 ${Math.floor(i / size) + 1} 列第 ${i % size + 1} 行">`).join('');
      qa(`[data-m="${k}"] input`).forEach((x) => x.addEventListener('input', () => run(cur)));
    });
    qa('[data-size] button').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.n === size));
  };
  const readM = (k) => { const v = qa(`[data-m="${k}"] input`).map((i) => Fr.parse(i.value)); return Array.from({ length: size }, (_, r) => v.slice(r * size, r * size + size)); };
  const mmul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s.add(a.mul(B[k][j])), new Fr(0))));
  const ident = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => new Fr(i === j ? 1 : 0)));
  const det = (M) => { if (M.length === 2) return M[0][0].mul(M[1][1]).sub(M[0][1].mul(M[1][0])); let s = new Fr(0); for (let j = 0; j < 3; j++) { const mi = [1, 2].map((r) => [0, 1, 2].filter((c) => c !== j).map((c) => M[r][c])); const t = M[0][j].mul(det(mi)); s = j % 2 ? s.sub(t) : s.add(t); } return s; };
  const inv = (M) => { const d = det(M); if (d.zero) return null; const n = M.length; if (n === 2) return [[M[1][1].div(d), new Fr(0).sub(M[0][1]).div(d)], [new Fr(0).sub(M[1][0]).div(d), M[0][0].div(d)]];
    const C = M.map((row, i) => row.map((_, j) => { const mi = [0, 1, 2].filter((r) => r !== i).map((r) => [0, 1, 2].filter((c) => c !== j).map((c) => M[r][c])); const v = det(mi); return (i + j) % 2 ? new Fr(0).sub(v) : v; })); return C[0].map((_, i) => C.map((row) => row[i].div(d))); };
  const show = (M) => `<span class="mo" style="grid-template-columns:repeat(${M[0].length},auto)">${M.flat().map((x) => `<span>${x}</span>`).join('')}</span>`;
  let cur = opt.op || focus[0];
  function run(op) {
    cur = op; qa('[data-ops] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.op === op));
    const out = q('[data-out]'), note = q('[data-note]');
    try {
      const A = readM('A'), B = readM('B'); let h = '', n = '';
      if (op === 'add' || op === 'sub') { h = `<span>${OPS[op]}（對應元素${op === 'add' ? '相加' : '相減'}）</span>${show(A.map((r, i) => r.map((x, j) => op === 'add' ? x.add(B[i][j]) : x.sub(B[i][j]))))}`; n = '只有同階矩陣才能相加減，結果仍是同階矩陣。'; }
      if (op === 'ab' || op === 'ba') { const P = op === 'ab' ? mmul(A, B) : mmul(B, A), Q = op === 'ab' ? mmul(B, A) : mmul(A, B); const same = P.every((r, i) => r.every((x, j) => x.toString() === Q[i][j].toString()));
        h = `<span>${OPS[op]}（第 i 列與第 j 行對應相乘再相加）</span>${show(P)}`; n = same ? '這組 A、B 剛好 AB = BA，是可交換的特例。' : '比較 AB 與 BA：一般 AB ≠ BA，矩陣乘法不具交換律。'; }
      if (op === 'det') { const d = det(A); h = `<span>det A</span><b style="font-size:1.4rem">${d}</b>`; n = d.zero ? 'det A = 0：A 沒有反方陣。' : `det A ≠ 0，A 有反方陣${size === 2 ? `；把 A 當成平面線性變換，面積放大 |det A| 倍` : ''}。`; }
      if (op === 'inv') { const I = inv(A); h = I ? `<span>A⁻¹</span>${show(I)}<span>驗算 A·A⁻¹ =</span>${show(mmul(A, I))}` : '<span>A⁻¹</span><b>不存在</b>'; n = I ? (size === 2 ? '二階公式：A⁻¹ = (1/det A)·[d −b; −c a]，主對角線互換、副對角線變號。' : '三階反方陣只需知道存在條件 det A ≠ 0。') : 'det A = 0 時不可逆。'; }
      if (op === 'pow') { const k = +q('[data-pow]').value; q('[data-pow]').nextElementSibling.textContent = k; let P = ident(size); for (let i = 0; i < k; i++) P = mmul(P, A); h = `<span>A<sup>${k}</sup>（A⁰ = I）</span>${show(P)}`; n = '拖動 n 找規律：有些方陣的乘冪會循環或呈等差變化。'; }
      out.innerHTML = h; note.textContent = n;
    } catch (e) { out.innerHTML = `<b style="color:var(--red)">${e.message}，請檢查輸入。</b>`; note.textContent = ''; }
  }
  qa('[data-size] button').forEach((b) => b.addEventListener('click', () => { size = +b.dataset.n; draw(); run(cur); }));
  qa('[data-ops] button').forEach((b) => b.addEventListener('click', () => run(b.dataset.op)));
  q('[data-pow]').addEventListener('input', () => run('pow'));
  draw(); run(cur);
};

/* lt */
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

/* markov */
(window.SIMS = window.SIMS || {}).markov = function (el, opt) {
  el.innerHTML = `<div class="sim-head"><b>${opt.title || '轉移矩陣：兩狀態的長期變化'}</b><span>調整轉移機率與起始比例，看每一期如何趨近穩定狀態。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 440 240" role="img" aria-label="甲所占比例隨期數變化"></svg></div><div class="sim-ctl">
  <label class="sl"><span>p 甲→甲</span><input type="range" min="0" max="1" step="0.01" value="${opt.p ?? 0.8}" data-p><output></output></label>
  <label class="sl"><span>q 乙→乙</span><input type="range" min="0" max="1" step="0.01" value="${opt.q ?? 0.6}" data-q><output></output></label>
  <label class="sl"><span>x₀ 甲</span><input type="range" min="0" max="1" step="0.01" value="${opt.x0 ?? 0.3}" data-x><output></output></label>
  <div class="facts" data-f></div><p class="sim-note">轉移矩陣每一行和為 1，下一期 = A × 本期。不論起始比例為何，只要 |p + q − 1| &lt; 1，最後都趨近同一個穩定狀態。</p></div></div>`;
  const q = (s) => el.querySelector(s);
  function draw() {
    const p = +q('[data-p]').value, qq = +q('[data-q]').value, x0 = +q('[data-x]').value;
    [['[data-p]', p], ['[data-q]', qq], ['[data-x]', x0]].forEach(([s, v]) => { q(s).nextElementSibling.textContent = v.toFixed(2); });
    const N = 12, xs = [[x0, 1 - x0]];
    for (let n = 1; n <= N; n++) { const [u, v] = xs[n - 1]; xs.push([p * u + (1 - qq) * v, (1 - p) * u + qq * v]); }
    const den = 2 - p - qq, lam = p + qq - 1, st = den > 1e-9 ? [(1 - qq) / den, (1 - p) / den] : null;
    const W = 440, H = 240, L = 40, R = 12, T = 14, B = 34, X = (n) => L + (W - L - R) * n / N, Y = (v) => T + (H - T - B) * (1 - v);
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = k / 4; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="var(--mute)">${v.toFixed(2)}</text>`; }
    for (let n = 0; n <= N; n += 2) g += `<text x="${X(n)}" y="${H - 16}" font-size="11" text-anchor="middle" fill="var(--mute)">${n}</text>`;
    g += `<text x="${(L + W - R) / 2}" y="${H - 2}" font-size="11" text-anchor="middle" fill="var(--mute)">期數 n</text>`;
    if (st) g += `<line x1="${L}" x2="${W - R}" y1="${Y(st[0])}" y2="${Y(st[0])}" stroke="var(--green)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - R}" y="${Y(st[0]) - 6}" font-size="11" text-anchor="end" fill="var(--green)">穩定狀態 ${st[0].toFixed(3)}</text>`;
    g += `<polyline fill="none" stroke="var(--teal)" stroke-width="2.2" points="${xs.map(([u], n) => `${X(n)},${Y(u)}`).join(' ')}"/>` + xs.map(([u], n) => `<circle cx="${X(n)}" cy="${Y(u)}" r="3" fill="var(--teal)"/>`).join('');
    q('svg').innerHTML = g;
    q('[data-f]').innerHTML = [['A = [p 1−q; 1−p q]', `[${p.toFixed(2)} ${(1 - qq).toFixed(2)}; ${(1 - p).toFixed(2)} ${qq.toFixed(2)}]`], ['x₁ = A·x₀', `(${xs[1][0].toFixed(3)}, ${xs[1][1].toFixed(3)})`],
      ['穩定狀態', st ? `(${st[0].toFixed(3)}, ${st[1].toFixed(3)})` : '不唯一（A = I）'], ['收斂', Math.abs(lam) < 1 ? '會收斂' : lam === 1 ? '每期不變' : '來回擺盪']]
      .map(([k, v]) => `<div class="fact"><span>${k}</span><b>${v}</b></div>`).join('');
  }
  el.querySelectorAll('input').forEach((i) => i.addEventListener('input', draw)); draw();
};
