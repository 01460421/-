(window.SIMS = window.SIMS || {}).celldiv = function (el, opt) {
  const P = 'var(--c-P)', M = 'var(--c-C)';
  // [代號, 名稱, 染色體數, 染色分體數, DNA 起, DNA 迄, 同源染色體, 套數, 說明]
  const IP = [['G1', 'G1 期', 4, 0, 2, 2, '2 對', '2n', 'G1 期：細胞生長、合成蛋白質與胞器；染色體以細長的染色質存在。'],
    ['S', 'S 期', 4, '0→8', 2, 4, '2 對', '2n', 'S 期：DNA 複製，DNA 含量 2C→4C；著絲點數不變，染色體數仍為 4。'],
    ['G2', 'G2 期', 4, 8, 4, 4, '2 對', '2n', 'G2 期：繼續生長、合成分裂所需蛋白質；中心體已複製為兩組。']];
  const ST = {
    mitosis: IP.concat([['前', '前期', 4, 8, 4, 4, '2 對', '2n', '前期：染色質濃縮成染色體（各含兩條姊妹染色分體）；核膜、核仁消失，紡錘體形成。'],
      ['中', '中期', 4, 8, 4, 4, '2 對', '2n', '中期：著絲點排列在赤道板上，染色體最濃縮，最適合計數與製作核型。'],
      ['後', '後期', 8, 0, 4, 4, '4 對', '4n', '後期：著絲點分開，姊妹染色分體分離移向兩極，染色體數暫時加倍（8 條），DNA 仍為 4C。'],
      ['末', '末期', 4, 0, 2, 2, '2 對', '2n', '末期＋胞質分裂：核膜、核仁重現，形成兩個子細胞，各 4 條染色體、2C，與母細胞相同。']]),
    meiosis: IP.concat([['前I', '前期 I', 4, 8, 4, 4, '2 對（聯會）', '2n', '前期 I：同源染色體配對（聯會）成 2 個四分體；非姊妹染色分體可互換（末端換色處）。'],
      ['中I', '中期 I', 4, 8, 4, 4, '2 對（成對排列）', '2n', '中期 I：四分體排在赤道板兩側；每對同源染色體朝向哪一極彼此獨立（按「另一種排列」）。'],
      ['後I', '後期 I', 4, 8, 4, 4, '正在分離', '2n', '後期 I：同源染色體分離移向兩極；著絲點不分開，每條仍含兩條染色分體。'],
      ['末I', '末期 I', 2, 4, 2, 2, '無', 'n', '末期 I：形成 2 個子細胞，各 2 條染色體（每條含兩條染色分體），染色體數已減半。'],
      ['前II', '前期 II', 2, 4, 2, 2, '無', 'n', '前期 II：染色體再度濃縮，紡錘體形成；細胞內已無同源染色體。兩次分裂之間不再複製 DNA。'],
      ['中II', '中期 II', 2, 4, 2, 2, '無', 'n', '中期 II：2 條染色體的著絲點排成單列於赤道板上。'],
      ['後II', '後期 II', 4, 0, 2, 2, '無', 'n（兩極各一套）', '後期 II：著絲點分開、姊妹染色分體分離，染色體數暫為 4 條，但沒有同源染色體，不是二倍體。'],
      ['末II', '末期 II', 2, 0, 1, 1, '無', 'n', '末期 II：共得 4 個子細胞，各 2 條染色體、1C；因互換與獨立分配，4 個細胞的組成各不相同。']])
  };
  let mode = opt.mode === 'meiosis' ? 'meiosis' : 'mitosis', i = 0, flip = false;
  el.innerHTML = `<style>.sim[data-sim="celldiv"] .chips button{padding:2px 9px;font-size:.8rem}</style>
  <div class="sim-head"><b>細胞分裂各期的染色體變化</b><span>按「下一期」逐步觀察 2n = 4 的細胞（藍：父方；橙：母方），對照下方數量圖。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg data-c viewBox="0 0 360 170" role="img" aria-label="細胞圖"></svg><svg data-g viewBox="0 0 360 150" role="img" aria-label="DNA 含量與染色體數"></svg></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-m="mitosis">有絲分裂</button><button type="button" data-m="meiosis">減數分裂</button></div>
    <div class="ops"><button type="button" data-step="-1">◀ 上一期</button><button type="button" data-step="1">下一期 ▶</button><button type="button" data-flip>另一種排列</button></div>
    <div class="ops chips" data-chips></div>
    <div class="facts">${['時期', '染色體數', '染色分體數', 'DNA 含量（每個細胞）', '同源染色體', '染色體套數'].map((t, k) => `<div class="fact"><span>${t}</span><b data-f="${k}"></b></div>`).join('')}</div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), cs = q('[data-c]'), gs = q('[data-g]');
  const chrs = () => {
    const x = mode === 'meiosis' && i >= 3;
    return [{ L: 24, ct: [{ c: P }, { c: P, t: x && M }] }, { L: 24, ct: [{ c: M, t: x && P }, { c: M }] }, { L: 14, ct: [{ c: P }, { c: P }] }, { L: 14, ct: [{ c: M }, { c: M }] }];
  };
  function ctd(x, y, L, o, w = 4.5) {
    let h = `<line x1="${x}" y1="${y - L / 2}" x2="${x}" y2="${y + L / 2}" stroke="${o.c}" stroke-width="${w}" stroke-linecap="round"/>`;
    if (o.t) h += `<line x1="${x}" y1="${y + L * 0.2}" x2="${x}" y2="${y + L / 2}" stroke="${o.t}" stroke-width="${w}" stroke-linecap="round"/>`;
    return h;
  }
  const chr = (x, y, c, which) => (which == null ? ctd(x - 2.8, y, c.L, c.ct[0]) + ctd(x + 2.8, y, c.L, c.ct[1]) : ctd(x, y, c.L, c.ct[which])) + `<circle cx="${x}" cy="${y}" r="2.4" fill="var(--ink)"/>`;
  const cell = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="var(--card)" stroke="var(--ink-2)" stroke-width="1.5"/>`;
  const cen = (x, y) => `<path d="M${x - 4},${y}h8M${x},${y - 4}v8" stroke="var(--c-X)" stroke-width="2.4"/>`;
  const spin = (px, y, pts) => cen(px, y) + pts.map(([x, yy]) => `<line x1="${px}" y1="${y}" x2="${x}" y2="${yy}" stroke="var(--mute)" stroke-width="0.9"/>`).join('');
  const nuc = (x, y, r, dash) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="var(--mute)" stroke-width="1.2" ${dash ? 'stroke-dasharray="4 4"' : ''}/>`;
  const stack = (x, cy, list, gap = 7) => { const tot = list.reduce((s, c) => s + c.L, 0) + gap * (list.length - 1); let y = cy - tot / 2; return list.map((c) => { const yy = y + c.L / 2; y += c.L + gap; return [x, yy, c]; }); };
  function squig(x, y, c, n) { let d = `M${x},${y}`; for (let k = 0; k < n; k++) d += ` q4,-6 8,0 t8,0`; return `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.6"/>`; }
  function drawCell() {
    const C = chrs(), cy = 85, code = ST[mode][i][0];
    let h = '';
    if (['G1', 'S', 'G2'].includes(code)) {
      h += cell(180, cy, 110, 70) + `<circle cx="180" cy="${cy}" r="42" fill="var(--bg)" stroke="var(--mute)" stroke-width="1.2"/>`;
      [[P, 2], [M, 2], [P, 1], [M, 1]].forEach(([c, n], k) => {
        const x = 152 + (k % 2) * 8, y = cy - 22 + k * 13;
        h += squig(x, y, c, n + 1);
        if (code === 'G2' || (code === 'S' && k < 2)) h += `<g opacity="${code === 'S' ? 0.55 : 1}">${squig(x + 4, y + 5, c, n + 1)}</g>`;
      });
      h += code === 'G1' ? cen(180, cy - 54) : cen(170, cy - 54) + cen(190, cy - 54);
      if (code === 'S') h += `<text x="180" y="${cy + 62}" font-size="11.5" text-anchor="middle" fill="var(--ink-2)">DNA 複製中</text>`;
    } else if (code === '前') {
      h += cell(180, cy, 110, 70) + nuc(180, cy, 46, true) + cen(105, cy - 30) + cen(255, cy - 30);
      [[160, cy - 16, 0], [196, cy - 18, 1], [168, cy + 22, 2], [202, cy + 18, 3]].forEach(([x, y, k]) => { h += chr(x, y, C[k]); });
    } else if (code === '中') {
      const pts = stack(180, cy, [C[0], C[2], C[1], C[3]]);
      h += cell(180, cy, 110, 70) + spin(80, cy, pts.map((p) => [p[0] - 3, p[1]])) + spin(280, cy, pts.map((p) => [p[0] + 3, p[1]]));
      h += `<line x1="180" y1="${cy - 66}" x2="180" y2="${cy + 66}" stroke="var(--sun)" stroke-width="2" stroke-dasharray="4 4"/>`;
      pts.forEach(([x, y, c]) => { h += chr(x, y, c); });
    } else if (code === '後') {
      const L = stack(130, cy, [C[0], C[2], C[1], C[3]], 8), R = stack(230, cy, [C[0], C[2], C[1], C[3]], 8);
      h += `<ellipse cx="180" cy="${cy}" rx="128" ry="62" fill="var(--card)" stroke="var(--ink-2)" stroke-width="1.5"/>` + spin(62, cy, L) + spin(298, cy, R);
      L.forEach(([x, y, c]) => { h += chr(x, y, c, 0); }); R.forEach(([x, y, c]) => { h += chr(x, y, c, 1); });
    } else if (code === '末') {
      [95, 265].forEach((x, s) => { h += cell(x, cy, 78, 62) + nuc(x, cy, 34); stack(x - 12, cy, [C[0], C[1]], 6).concat(stack(x + 12, cy, [C[2], C[3]], 6)).forEach(([xx, y, c]) => { h += chr(xx, y, c, s); }); });
    } else {
      const left = flip ? [C[0], C[3]] : [C[0], C[2]], right = flip ? [C[1], C[2]] : [C[1], C[3]];
      if (code === '前I') {
        h += cell(180, cy, 110, 70) + nuc(180, cy, 46, true) + cen(105, cy - 30) + cen(255, cy - 30);
        h += chr(156, cy, C[0]) + chr(168, cy, C[1]) + chr(194, cy + 2, C[2]) + chr(206, cy + 2, C[3]);
      } else if (code === '中I' || code === '後I') {
        const dx = code === '中I' ? 7 : 52, Lp = stack(180 - dx, cy, left, 22), Rp = stack(180 + dx, cy, right, 22);
        h += cell(180, cy, code === '中I' ? 110 : 128, code === '中I' ? 70 : 62) + spin(code === '中I' ? 80 : 62, cy, Lp) + spin(code === '中I' ? 280 : 298, cy, Rp);
        if (code === '中I') h += `<line x1="180" y1="${cy - 66}" x2="180" y2="${cy + 66}" stroke="var(--sun)" stroke-width="2" stroke-dasharray="4 4"/>`;
        Lp.concat(Rp).forEach(([x, y, c]) => { h += chr(x, y, c); });
      } else if (code === '末II') {
        [left, right].forEach((set, s) => [0, 1].forEach((w) => { const x = 47 + (s * 2 + w) * 89; h += cell(x, cy, 40, 52); stack(x, cy, set, 8).forEach(([xx, y, c]) => { h += chr(xx, y, c, w); }); }));
      } else {
        [left, right].forEach((set, s) => {
          const x = s ? 265 : 95;
          if (code === '後II') {
            h += `<ellipse cx="${x}" cy="${cy}" rx="82" ry="56" fill="var(--card)" stroke="var(--ink-2)" stroke-width="1.5"/>`;
            const A = stack(x - 34, cy, set, 8), B = stack(x + 34, cy, set, 8);
            h += spin(x - 72, cy, A) + spin(x + 72, cy, B); A.forEach(([xx, y, c]) => { h += chr(xx, y, c, 0); }); B.forEach(([xx, y, c]) => { h += chr(xx, y, c, 1); });
          } else {
            h += cell(x, cy, 78, 62);
            if (code === '末I') { h += nuc(x, cy, 32, true); stack(x, cy, set, 10).forEach(([xx, y, c]) => { h += chr(xx, y, c); }); }
            if (code === '前II') { h += cen(x - 30, cy - 40) + cen(x + 30, cy - 40); h += chr(x - 14, cy - 6, set[0]) + chr(x + 16, cy + 8, set[1]); }
            if (code === '中II') { const pts = stack(x, cy, set, 10); h += spin(x - 70, cy, pts) + spin(x + 70, cy, pts); pts.forEach(([xx, y, c]) => { h += chr(xx, y, c); }); }
          }
        });
      }
    }
    cs.innerHTML = h;
  }
  function drawGraph() {
    const S = ST[mode], n = S.length, X0 = 38, X1 = 352, Y0 = 118, Y1 = 22, w = (X1 - X0) / n, sy = (v) => Y0 - v / 8 * (Y0 - Y1);
    let h = `<rect x="${X0 + i * w}" y="${Y1 - 8}" width="${w}" height="${Y0 - Y1 + 8}" fill="var(--sun)" opacity=".4"/>`;
    [0, 2, 4, 6, 8].forEach((v) => { h += `<line x1="${X0}" x2="${X1}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)"/><text x="${X0 - 4}" y="${sy(v) + 4}" font-size="12" text-anchor="end" fill="var(--mute)">${v}</text>`; });
    let dD = '', dC = '';
    S.forEach((s, k) => {
      const x = X0 + k * w, c = s[2] + 0;
      dD += `${k ? 'L' : 'M'}${x},${sy(s[4])}L${x + w},${sy(s[5])}`;
      dC += `${k ? 'L' : 'M'}${x},${sy(c) - 3}L${x + w},${sy(c) - 3}`;
      h += `<text x="${x + w / 2}" y="${Y0 + 14}" font-size="${n > 8 ? 11 : 13}" text-anchor="middle" fill="${k === i ? 'var(--ink)' : 'var(--ink-2)'}" font-weight="${k === i ? 700 : 400}">${s[0]}</text>`;
    });
    h += `<path d="${dD}" fill="none" stroke="var(--teal)" stroke-width="2.6"/><path d="${dC}" fill="none" stroke="var(--c-X)" stroke-width="2" stroke-dasharray="5 3"/>`;
    h += `<line x1="${X0}" x2="${X0 + 18}" y1="8" y2="8" stroke="var(--teal)" stroke-width="2.6"/><text x="${X0 + 22}" y="12" font-size="12.5" fill="var(--ink)">DNA 含量（C）</text>`;
    h += `<line x1="${X0 + 130}" x2="${X0 + 148}" y1="8" y2="8" stroke="var(--c-X)" stroke-width="2" stroke-dasharray="5 3"/><text x="${X0 + 152}" y="12" font-size="12.5" fill="var(--ink)">染色體數（條）</text>`;
    h += `<text x="${X1}" y="${Y0 + 30}" font-size="11" text-anchor="end" fill="var(--mute)">每個細胞；末期以胞質分裂後計</text>`;
    gs.innerHTML = h;
  }
  function render() {
    const s = ST[mode][i];
    drawCell(); drawGraph();
    [s[1], `${s[2]} 條`, `${s[3]} 條`, s[4] === s[5] ? `${s[4]}C` : `${s[4]}C → ${s[5]}C`, s[6], s[7]].forEach((v, k) => { q(`[data-f="${k}"]`).textContent = v; });
    q('[data-note]').textContent = s[8];
    q('[data-chips]').innerHTML = ST[mode].map((t, k) => `<button type="button" data-i="${k}" aria-pressed="${k === i}">${t[1]}</button>`).join('');
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === mode));
    q('[data-flip]').style.display = mode === 'meiosis' ? '' : 'none';
    q('[data-step="-1"]').disabled = i === 0; q('[data-step="1"]').disabled = i === ST[mode].length - 1;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) { mode = b.dataset.m; i = 0; }
    if (b.dataset.step) i = Math.max(0, Math.min(ST[mode].length - 1, i + +b.dataset.step));
    if (b.dataset.i) i = +b.dataset.i;
    if (b.hasAttribute('data-flip')) { flip = !flip; if (i < 4) i = 4; }
    render();
  });
  render();
};
