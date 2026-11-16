(window.SIMS = window.SIMS || {}).hw = function (el, opt) {
  let mode = opt.mode === 'selection' ? 'selection' : 'hw', p = 0.7, q0 = 0.5, w = 0, G = 100, N = 0, runs = [];
  const NS = [0, 500, 50, 10];
  el.innerHTML = `<div class="sim-head"><b>哈溫平衡與天擇</b><span>拖動對偶基因頻率看基因型頻率；切換到天擇，看 a 的頻率逐代如何改變。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 360 250" role="img" aria-label="基因型頻率或對偶基因頻率圖"></svg></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-m="hw">哈溫平衡</button><button type="button" data-m="selection">天擇（aa 受淘汰）</button></div>
    <div data-w="hw" style="display:grid;gap:8px"><label class="sl"><span>p（A）</span><input type="range" data-v="p" min="0" max="1" step="0.01" value="${p}"><output></output></label></div>
    <div data-w="selection" style="display:grid;gap:8px">
      <label class="sl"><span>起始 q₀</span><input type="range" data-v="q0" min="0.02" max="0.98" step="0.01" value="${q0}"><output></output></label>
      <label class="sl"><span>aa 適存度</span><input type="range" data-v="w" min="0" max="1" step="0.05" value="${w}"><output></output></label>
      <label class="sl"><span>代數</span><input type="range" data-v="G" min="10" max="200" step="10" value="${G}"><output></output></label>
      <div class="ops" data-n>${NS.map((n) => `<button type="button" data-ns="${n}">${n ? 'N = ' + n : '族群極大'}</button>`).join('')}<button type="button" data-re>重新模擬漂變</button></div>
    </div>
    <div class="facts" data-facts></div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg');
  const fmt = (x, d = 3) => (Math.abs(x) < 0.001 && x !== 0 ? x.toExponential(1) : x.toFixed(d));
  const fact = (a, b) => `<div class="fact"><span>${a}</span><b>${b}</b></div>`;
  const next = (qq) => { const s = 1 - w; return (qq - s * qq * qq) / (1 - s * qq * qq); }; // q' = (pq + w q²)/(1 − s q²)
  function binom(n, pr) { let k = 0; for (let i = 0; i < n; i++) if (Math.random() < pr) k++; return k; }
  function simulate() {
    runs = [];
    if (!N) return;
    for (let r = 0; r < 6; r++) { let x = q0; const a = [x]; for (let g = 0; g < G; g++) { x = binom(2 * N, next(x)) / (2 * N); a.push(x); } runs.push(a); }
  }
  function drawHW() {
    const Q = 1 - p, S = 170, X = 34, Y = 40, sp = S * p, cols = ['var(--c-P)', 'var(--c-X)', 'var(--c-C)'];
    let h = `<text x="${X}" y="16" font-size="12" fill="var(--ink-2)">卵（上）× 精子（左），面積＝機率</text>`;
    h += `<text x="${X + sp / 2}" y="${Y - 5}" font-size="12" text-anchor="middle" fill="var(--ink)">${sp > 30 ? 'A：p' : ''}</text><text x="${X + sp + (S - sp) / 2}" y="${Y - 5}" font-size="12" text-anchor="middle" fill="var(--ink)">${S - sp > 30 ? 'a：q' : ''}</text>`;
    const cell = (x, y, ww, hh, c, t) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${c}" opacity=".8" stroke="var(--card)" stroke-width="1.5"/>${ww > 26 && hh > 16 ? `<text x="${x + ww / 2}" y="${y + hh / 2 + 4}" font-size="12" text-anchor="middle" fill="#fff" font-weight="700">${t}</text>` : ''}`;
    h += cell(X, Y, sp, sp, cols[0], 'AA') + cell(X + sp, Y, S - sp, sp, cols[1], 'Aa') + cell(X, Y + sp, sp, S - sp, cols[1], 'Aa') + cell(X + sp, Y + sp, S - sp, S - sp, cols[2], 'aa');
    h += `<text x="${X - 5}" y="${Y + sp / 2 + 4}" font-size="12" text-anchor="end" fill="var(--ink)">${sp > 14 ? 'A' : ''}</text><text x="${X - 5}" y="${Y + sp + (S - sp) / 2 + 4}" font-size="12" text-anchor="end" fill="var(--ink)">${S - sp > 14 ? 'a' : ''}</text>`;
    const bx = 230, bw = 32, H = 170, base = Y + S;
    [[p * p, 'AA', 'p²'], [2 * p * Q, 'Aa', '2pq'], [Q * Q, 'aa', 'q²']].forEach(([v, n, f], k) => {
      const x = bx + k * 42;
      h += `<rect x="${x}" y="${base - v * H}" width="${bw}" height="${v * H}" fill="${cols[k]}" opacity=".85"/><text x="${x + bw / 2}" y="${base - v * H - 5}" font-size="11.5" text-anchor="middle" fill="var(--ink)">${v.toFixed(2)}</text>`;
      h += `<text x="${x + bw / 2}" y="${base + 15}" font-size="12" text-anchor="middle" fill="var(--ink)">${n}</text><text x="${x + bw / 2}" y="${base + 30}" font-size="11" text-anchor="middle" fill="var(--mute)">${f}</text>`;
    });
    h += `<line x1="${bx - 6}" x2="${bx + 126}" y1="${base}" y2="${base}" stroke="var(--ink-2)"/>`;
    svg.innerHTML = h;
    const het = 2 * p * Q, aa = Q * Q;
    q('[data-facts]').innerHTML = fact('q（a）＝ 1 − p', Q.toFixed(2)) + fact('AA ＝ p²', `${p.toFixed(2)}² = ${fmt(p * p)}`) + fact('Aa ＝ 2pq', `2×${p.toFixed(2)}×${Q.toFixed(2)} = ${fmt(het)}`) + fact('aa ＝ q²', `${Q.toFixed(2)}² = ${fmt(aa)}`) + fact('p² + 2pq + q²', fmt(p * p + het + aa, 2)) + fact('攜帶者 Aa ÷ 患者 aa', aa > 0 ? `${(het / aa).toFixed(1)} 倍` : '—');
    q('[data-note]').textContent = Q > 0 && Q <= 0.1 ? `a 很少時，隱性對偶基因多藏在異型合子中：攜帶者約為 aa 個體的 ${(het / aa).toFixed(0)} 倍。` : '理想族群隨機交配一代後，基因型頻率即為 p²：2pq：q²，此後世代不變；顯性對偶基因不會自動變多。';
  }
  function drawSel() {
    const X0 = 44, X1 = 346, Y0 = 210, Y1 = 16, sx = (g) => X0 + g / G * (X1 - X0), sy = (v) => Y0 - v * (Y0 - Y1);
    let h = '';
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => { h += `<line x1="${X0}" x2="${X1}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)"/><text x="${X0 - 5}" y="${sy(v) + 4}" font-size="11.5" text-anchor="end" fill="var(--mute)">${v}</text>`; });
    [0, G / 2, G].forEach((g) => { h += `<text x="${sx(g)}" y="${Y0 + 15}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">${g}</text>`; });
    h += `<text x="${X1}" y="${Y0 + 32}" font-size="12.5" text-anchor="end" fill="var(--ink)">世代</text><text x="12" y="${(Y0 + Y1) / 2}" font-size="12.5" text-anchor="middle" fill="var(--ink)" transform="rotate(-90 12 ${(Y0 + Y1) / 2})">a 的頻率 q</text>`;
    runs.forEach((a) => { h += `<path d="${a.map((v, g) => (g ? 'L' : 'M') + sx(g).toFixed(1) + ',' + sy(v).toFixed(1)).join('')}" fill="none" stroke="var(--c-C)" stroke-width="1.2" opacity=".75"/>`; });
    let x = q0, d = `M${sx(0)},${sy(x)}`, half = null;
    for (let g = 1; g <= G; g++) { x = next(x); d += `L${sx(g).toFixed(1)},${sy(x).toFixed(1)}`; if (half == null && x <= q0 / 2) half = g; }
    h += `<path d="${d}" fill="none" stroke="var(--teal)" stroke-width="3"/>`;
    h += `<rect x="${X0 + 144}" y="${Y1 - 6}" width="156" height="${N ? 36 : 20}" rx="4" fill="var(--bg)" opacity=".88"/>`;
    h += `<line x1="${X0 + 150}" x2="${X0 + 170}" y1="${Y1 + 4}" y2="${Y1 + 4}" stroke="var(--teal)" stroke-width="3"/><text x="${X0 + 174}" y="${Y1 + 8}" font-size="11.5" fill="var(--ink-2)">族群極大（理論）</text>`;
    if (N) h += `<line x1="${X0 + 150}" x2="${X0 + 170}" y1="${Y1 + 20}" y2="${Y1 + 20}" stroke="var(--c-C)" stroke-width="1.5"/><text x="${X0 + 174}" y="${Y1 + 24}" font-size="11.5" fill="var(--ink-2)">N = ${N}（6 次模擬）</text>`;
    svg.innerHTML = h;
    const fix = runs.filter((a) => a[G] >= 1).length, lost = runs.filter((a) => a[G] <= 0).length;
    let f = fact(`第 ${G} 代的 q（理論）`, fmt(x)) + fact(`第 ${G} 代 aa 頻率 q²`, fmt(x * x, 4));
    f += w === 0 ? fact('公式 q₀ ÷ (1 + n q₀)', fmt(q0 / (1 + G * q0))) : fact('每代 aa 的淘汰係數 s ＝ 1 − w', (1 - w).toFixed(2));
    f += fact('q 降為一半所需代數', half ? `${half} 代` : `超過 ${G} 代`);
    if (N) f += fact('漂變模擬：a 消失／固定', `${lost} 次／${fix} 次（共 6 次）`);
    q('[data-facts]').innerHTML = f;
    q('[data-note]').textContent = N && N <= 50 ? '小族群中頻率隨機起伏（遺傳漂變），各次結果不同，a 甚至可能因機率而固定或消失；族群愈大，愈接近理論曲線。'
      : w === 1 ? '各基因型適存度相同（無天擇），大族群中 q 維持不變，符合哈溫平衡。'
      : 'q 愈小，a 愈集中在不受淘汰的異型合子 Aa 中，天擇效率愈低，q 下降愈來愈慢；有害隱性對偶基因因此能長期以低頻率存在。';
  }
  function render() {
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === mode));
    el.querySelectorAll('[data-w]').forEach((d) => { d.style.display = d.dataset.w === mode ? 'grid' : 'none'; });
    el.querySelectorAll('[data-ns]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.ns === N));
    q('[data-re]').style.display = N ? '' : 'none';
    el.querySelectorAll('input[type=range]').forEach((r) => { const v = +r.value; r.nextElementSibling.textContent = r.dataset.v === 'G' ? v + ' 代' : v.toFixed(2); });
    mode === 'hw' ? drawHW() : drawSel();
  }
  el.addEventListener('input', (e) => {
    const r = e.target; if (!r.dataset.v) return;
    const v = +r.value;
    if (r.dataset.v === 'p') p = v; if (r.dataset.v === 'q0') q0 = v; if (r.dataset.v === 'w') w = v; if (r.dataset.v === 'G') G = v;
    if (r.dataset.v !== 'p') simulate();
    render();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) mode = b.dataset.m;
    if (b.dataset.ns) { N = +b.dataset.ns; simulate(); }
    if (b.hasAttribute('data-re')) simulate();
    render();
  });
  render();
};
