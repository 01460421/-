(window.SIMS = window.SIMS || {}).punnett = function (el, opt) {
  const GENES = { R: ['種子形狀', '圓形', '皺形', '圓', '皺'], Y: ['子葉顏色', '黃色', '綠色', '黃', '綠'] };
  let mode = opt.mode === 'di' ? 'di' : 'mono', sim = null;
  const par = [{ R: 'Rr', Y: 'Yy' }, { R: 'Rr', Y: 'Yy' }];
  const sex = ['♀ 母本（卵）', '♂ 父本（精細胞）'];
  el.innerHTML = `<style>.sim[data-sim="punnett"] .pg{display:grid;gap:4px}.sim[data-sim="punnett"] .pg small{color:var(--mute);font-size:.8rem}
  .sim[data-sim="punnett"] .ops button{padding:3px 10px}.sim[data-sim="punnett"] table{border-collapse:collapse;width:100%;font-size:.86rem}
  .sim[data-sim="punnett"] td,.sim[data-sim="punnett"] th{border-bottom:1px solid var(--line);padding:3px 6px;text-align:right}.sim[data-sim="punnett"] td:first-child,.sim[data-sim="punnett"] th:first-child{text-align:left}
  .sim[data-sim="punnett"] td{font-family:var(--f-mono)}</style>
  <div class="sim-head"><b>棋盤方格與遺傳比例</b><span>選擇親代基因型，看配子組合、子代比例，再模擬 400 個子代比較觀察值與預期值。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 340 300" role="img" aria-label="棋盤方格"></svg></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-mode="mono">一對性狀（R/r）</button><button type="button" data-mode="di">兩對性狀（R/r、Y/y）</button></div>
    <div data-par></div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>子代基因型比例</span><b data-f="g"></b></div><div class="fact" style="grid-column:1/-1"><span>子代表現型比例</span><b data-f="p"></b></div></div>
    <div class="ops"><button type="button" data-sim>模擬 400 個子代</button></div>
    <div data-tab></div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), svg = q('svg');
  const genes = () => (mode === 'mono' ? ['R'] : ['R', 'Y']);
  const gametes = (p) => genes().reduce((acc, g) => acc.flatMap((a) => [a + p[g][0], a + p[g][1]]), ['']);
  const norm = (a, b) => genes().map((g, k) => [a[k], b[k]].sort((x, y) => (x === g ? -1 : y === g ? 1 : 0)).join('')).join('');
  const phen = (gt) => genes().map((g, k) => (gt.slice(2 * k, 2 * k + 2).includes(g) ? 1 : 0));
  const phName = (ph, short) => ph.map((v, k) => GENES[genes()[k]][short ? (v ? 3 : 4) : (v ? 1 : 2)]).join(short ? '' : '');
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function stats() {
    const G1 = gametes(par[0]), G2 = gametes(par[1]), gt = {}, ph = {};
    G1.forEach((a) => G2.forEach((b) => { const g = norm(a, b), k = phen(g).join(''); gt[g] = (gt[g] || 0) + 1; ph[k] = (ph[k] || 0) + 1; }));
    return { G1, G2, gt, ph, n: G1.length * G2.length };
  }
  const order = (keys) => keys.sort((a, b) => { for (let k = 0; k < a.length; k++) { const s = (c) => (c === c.toUpperCase() ? 0 : 1); if (a[k] !== b[k]) return s(a[k]) - s(b[k]); } return 0; });
  const ratio = (ent, lab) => { const d = ent.reduce((g, e) => gcd(g, e[1]), 0); return ent.map(([k, v]) => `${v / d} ${lab(k)}`).join(' : '); };
  function pea(x, y, ph) {
    const col = mode === 'di' && !ph[1] ? 'var(--c-B)' : 'var(--sun)';
    if (ph[0]) return `<circle cx="${x}" cy="${y}" r="9" fill="${col}" stroke="var(--ink-2)" stroke-width="1"/>`;
    let d = ''; for (let k = 0; k <= 24; k++) { const t = k / 24 * 6.283, r = 8.5 + 1.6 * Math.cos(t * 7); d += (k ? 'L' : 'M') + (x + r * Math.cos(t)).toFixed(1) + ',' + (y + r * Math.sin(t)).toFixed(1); }
    return `<path d="${d}Z" fill="${col}" stroke="var(--ink-2)" stroke-width="1"/>`;
  }
  function drawSquare(S) {
    const n = S.G1.length, hd = 44, cs = (330 - hd) / n, ch = Math.min(cs, (292 - hd) / n);
    svg.setAttribute('viewBox', `0 0 340 ${hd + ch * n + 8}`);
    let h = `<text x="${hd + cs * n / 2 + 4}" y="12" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">${sex[1].slice(0, 4)}的配子</text>`;
    h += `<text x="10" y="${hd + ch * n / 2 + 4}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)" transform="rotate(-90 10 ${hd + ch * n / 2 + 4})">${sex[0].slice(0, 4)}的配子</text>`;
    S.G2.forEach((g, k) => { h += `<text x="${hd + cs * k + cs / 2 + 4}" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="var(--c-P)">${g}</text>`; });
    S.G1.forEach((g, r) => {
      h += `<text x="${hd - 6}" y="${hd + ch * r + ch / 2 + 5}" font-size="14" font-weight="700" text-anchor="end" fill="var(--red)">${g}</text>`;
      S.G2.forEach((b, k) => {
        const gt = norm(g, b), ph = phen(gt), x = hd + cs * k + 4, y = hd + ch * r;
        h += `<rect x="${x}" y="${y}" width="${cs}" height="${ch}" fill="var(--card)" stroke="var(--line)"/>`;
        h += pea(x + cs / 2, y + ch * 0.36, ph) + `<text x="${x + cs / 2}" y="${y + ch * 0.36 + (n > 2 ? 24 : 30)}" font-size="${n > 2 ? 12.5 : 15}" text-anchor="middle" fill="var(--ink)" font-family="var(--f-mono)">${gt}</text>`;
      });
    });
    svg.innerHTML = h;
  }
  function render() {
    const S = stats();
    drawSquare(S);
    const gtO = order(Object.keys(S.gt)).map((k) => [k, S.gt[k]]);
    const phK = Object.keys(S.ph).sort().reverse(), phO = phK.map((k) => [k, S.ph[k]]);
    q('[data-f="g"]').textContent = ratio(gtO, (k) => k);
    q('[data-f="p"]').textContent = ratio(phO, (k) => phName(k.split('').map(Number), mode === 'di'));
    q('[data-par]').innerHTML = par.map((p, i) => `<div class="pg"><small>${sex[i]}：${genes().map((g) => p[g]).join('')}（${phName(phen(genes().map((g) => p[g]).join('')), false)}）</small>${genes().map((g) => `<div class="ops">${[g + g, g + g.toLowerCase(), (g + g).toLowerCase()].map((v) => `<button type="button" data-p="${i}" data-g="${g}" data-v="${v}" aria-pressed="${p[g] === v}">${v}</button>`).join('')}</div>`).join('')}</div>`).join('');
    el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    let tab = '';
    if (sim) {
      tab = `<table><tr><th>表現型</th><th>預期</th><th>觀察</th></tr>${phK.map((k) => `<tr><td style="font-family:inherit">${phName(k.split('').map(Number), false)}</td><td>${(400 * S.ph[k] / S.n).toFixed(0)}</td><td>${sim[k] || 0}</td></tr>`).join('')}</table>`;
    }
    q('[data-tab]').innerHTML = tab;
    const het = mode === 'mono' ? par.every((p) => p.R === 'Rr') : par.every((p) => p.R === 'Rr' && p.Y === 'Yy');
    const test = par.some((p) => genes().every((g) => p[g] === g.toLowerCase().repeat(2)));
    q('[data-note]').textContent = sim ? '觀察值隨機偏離預期值，樣本愈大偏離比例愈小；孟德爾因此大量計數再化為比例。再按一次可重新抽樣。'
      : het ? (mode === 'mono' ? 'Rr 自交：配子 R、r 各 1/2，子代基因型 1：2：1、表現型 3：1（分離律）。' : 'RrYy 自交：每個親代產生 RY、Ry、rY、ry 四種等量配子，16 格得 9：3：3：1＝(3：1)×(3：1)（獨立分配律）。')
      : test ? '與隱性同型合子交配（試交）：子代表現型比例直接反映另一親代產生的配子種類與比例。'
      : '每一格的機率＝兩配子機率的乘積；同型合子只產生一種配子，方格中會出現重複的組合。';
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) { mode = b.dataset.mode; sim = null; }
    if (b.dataset.p) { par[+b.dataset.p][b.dataset.g] = b.dataset.v; sim = null; }
    if (b.hasAttribute('data-sim')) {
      const S = stats(); sim = {};
      for (let k = 0; k < 400; k++) { const a = S.G1[Math.floor(Math.random() * S.G1.length)], c = S.G2[Math.floor(Math.random() * S.G2.length)], p = phen(norm(a, c)).join(''); sim[p] = (sim[p] || 0) + 1; }
    }
    render();
  });
  render();
};
