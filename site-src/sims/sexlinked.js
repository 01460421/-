(window.SIMS = window.SIMS || {}).sexlinked = function (el, opt) {
  const TR = { cb: ['紅綠色盲', 'B', '色盲'], hemo: ['血友病', 'H', '血友病'] };
  let tr = opt.mode === 'hemo' ? 'hemo' : 'cb', mom = 1, dad = 0; // mom: 0 顯性同型、1 攜帶者、2 隱性同型；dad: 0 正常、1 患者
  el.innerHTML = `<style>.sim[data-sim="sexlinked"] table{border-collapse:separate;border-spacing:4px;width:100%;table-layout:fixed;text-align:center}
  .sim[data-sim="sexlinked"] th{font-weight:700;font-size:1.05rem;padding:4px}.sim[data-sim="sexlinked"] td{background:var(--card);border:1.5px solid var(--line);border-radius:10px;padding:8px 2px}
  .sim[data-sim="sexlinked"] td b{display:block;font-family:var(--f-mono);font-size:1.1rem}.sim[data-sim="sexlinked"] td i{font-style:normal;font-size:.8rem;border-radius:999px;padding:0 8px;display:inline-block;margin-top:3px}
  .sim[data-sim="sexlinked"] .af{background:var(--red);color:#fff}.sim[data-sim="sexlinked"] .ca{background:var(--sun);color:var(--ink)}.sim[data-sim="sexlinked"] .no{background:var(--teal-soft);color:var(--teal-2)}
  .sim[data-sim="sexlinked"] .pg small{color:var(--mute);font-size:.8rem}.sim[data-sim="sexlinked"] .pg{display:grid;gap:4px}</style>
  <div class="sim-head"><b>X 性聯隱性遺傳</b><span>選擇父母的基因型，看兒子與女兒各自的患病機率。</span></div>
  <div class="sim-body"><div class="sim-viz" style="padding:10px"><table></table><p data-leg style="margin:6px 0 0;font-size:.8rem;color:var(--ink-2)"></p></div>
  <div class="sim-ctl">
    <div class="ops">${Object.entries(TR).map(([k, v]) => `<button type="button" data-tr="${k}">${v[0]}</button>`).join('')}</div>
    <div class="pg"><small>母親</small><div class="ops" data-mom></div></div>
    <div class="pg"><small>父親</small><div class="ops" data-dad></div></div>
    <div class="facts">
      <div class="fact"><span>兒子中患病的機率</span><b data-f="s"></b></div>
      <div class="fact"><span>女兒中患病的機率</span><b data-f="d"></b></div>
      <div class="fact"><span>女兒中為攜帶者的機率</span><b data-f="c"></b></div>
      <div class="fact"><span>每胎生出患病兒子的機率</span><b data-f="x"></b></div>
    </div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s);
  const X = (a) => `X<sup>${a}</sup>`;
  const frac = (n, d) => { if (!n) return '0'; if (n === d) return '1（100%）'; const g = n % 2 === 0 && d % 2 === 0 ? (n % 4 === 0 && d % 4 === 0 ? 4 : 2) : 1; return `${n / g}/${d / g}（${Math.round(n / d * 100)}%）`; };
  function render() {
    const A = TR[tr][1], a = A.toLowerCase(), name = TR[tr][2];
    const momG = [[A, A], [A, a], [a, a]][mom], dadG = [[A, 'Y'], [a, 'Y']][dad];
    const kind = (g) => { const xs = g.filter((x) => x !== 'Y'); if (g.includes('Y')) return xs[0] === a ? 2 : 0; return xs.filter((x) => x === a).length === 2 ? 2 : xs.includes(a) ? 1 : 0; };
    const lab = ['<i class="no">正常</i>', '<i class="ca">攜帶者</i>', `<i class="af">${name}</i>`];
    let h = `<tr><th style="width:24%"></th>${momG.map((g) => `<th style="color:var(--red)">${X(g)}<br><small style="font-weight:400;font-size:.75rem;color:var(--mute)">卵</small></th>`).join('')}</tr>`;
    let sA = 0, dA = 0, dC = 0;
    dadG.forEach((s) => {
      h += `<tr><th style="color:var(--c-P)">${s === 'Y' ? 'Y' : X(s)}<br><small style="font-weight:400;font-size:.75rem;color:var(--mute)">精子</small></th>`;
      momG.forEach((e) => {
        const g = s === 'Y' ? [e, 'Y'] : [s, e].sort((p, r) => (p === A ? -1 : r === A ? 1 : 0)), k = kind(g), son = s === 'Y';
        if (son && k === 2) sA++; if (!son && k === 2) dA++; if (!son && k === 1) dC++;
        h += `<td><b>${son ? X(g[0]) + 'Y' : X(g[0]) + X(g[1])}</b>${son ? '♂ 兒子' : '♀ 女兒'}<br>${lab[k]}</td>`;
      });
      h += '</tr>';
    });
    q('table').innerHTML = h;
    q('[data-leg]').innerHTML = `${X(A)}：正常對偶基因（顯性）；${X(a)}：${name}對偶基因（隱性）。每一格機率 1/4。`;
    q('[data-mom]').innerHTML = [[A, A], [A, a], [a, a]].map((g, i) => `<button type="button" data-mo="${i}" aria-pressed="${i === mom}">${X(g[0])}${X(g[1])}</button>`).join('');
    q('[data-dad]').innerHTML = [A, a].map((g, i) => `<button type="button" data-da="${i}" aria-pressed="${i === dad}">${X(g)}Y</button>`).join('');
    el.querySelectorAll('[data-tr]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tr === tr));
    q('[data-f="s"]').textContent = frac(sA, 2); q('[data-f="d"]').textContent = frac(dA, 2);
    q('[data-f="c"]').textContent = frac(dC, 2); q('[data-f="x"]').textContent = frac(sA, 4);
    q('[data-note]').textContent = dad === 1 && mom === 0 ? '父親患病：他的 X 必傳給所有女兒（皆為攜帶者），兒子得到父親的 Y，不會由父親得到致病基因。'
      : mom === 2 ? '母親患病：每個兒子的 X 都來自母親且帶致病基因，所以兒子必患病；女兒是否患病取決於父親。'
      : mom === 1 ? `母親為攜帶者：兒子中患病 1/2；但「每胎生出患病兒子」還要乘上生男的 1/2，得 ${frac(sA, 4).split('（')[0]}。注意分母不同。`
      : '母親不帶致病基因，兒子的 X 來自母親，因此兒子都正常；男性患者的致病基因必來自母親。';
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tr) tr = b.dataset.tr;
    if (b.dataset.mo) mom = +b.dataset.mo;
    if (b.dataset.da) dad = +b.dataset.da;
    render();
  });
  render();
};
