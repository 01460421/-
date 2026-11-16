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
