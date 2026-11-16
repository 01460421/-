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
