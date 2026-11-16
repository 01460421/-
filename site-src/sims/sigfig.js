(window.SIMS = window.SIMS || {}).sigfig = function (el, opt) {
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');
  const UNS = { '⁻': '-', '⁰': 0, '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9 };
  const PRE = ['0.00520', '1.008', '3.60', '1500', '2.0×10³', '0.0360', '12.30'];
  el.innerHTML = `<style>.sim[data-sim="sigfig"] .dg{font-family:var(--f-mono);font-size:1.9rem;letter-spacing:.06em;text-align:center;padding:8px 4px 2px;overflow-wrap:anywhere}
  .sim[data-sim="sigfig"] .dg i{font-style:normal}.sim[data-sim="sigfig"] .dg .s{color:var(--teal);font-weight:700}.sim[data-sim="sigfig"] .dg .z{color:var(--mute)}.sim[data-sim="sigfig"] .dg .q{background:var(--sun);border-radius:4px}
  .sim[data-sim="sigfig"] .lg{font-size:.78rem;color:var(--ink-2);text-align:center;margin-bottom:6px}.sim[data-sim="sigfig"] h4{margin:6px 0 0;font-size:.92rem;color:var(--teal-2)}</style>
  <div class="sim-head"><b>有效數字與刻度讀數</b><span>輸入或點選一個測量值，看哪些位數算有效數字；再移動物體，比較兩把尺的讀數。</span></div>
  <div class="sim-body"><div class="sim-viz"><div class="dg"></div>
    <div class="lg"><span style="color:var(--teal);font-weight:700">■ 有效數字</span>　<span style="color:var(--mute)">■ 只表示小數點位置</span>　<span style="background:var(--sun)">■ 無法判斷</span></div>
    <svg viewBox="0 0 420 130" role="img" aria-label="刻度尺讀數"></svg></div>
  <div class="sim-ctl">
    <label class="sl" style="grid-template-columns:auto minmax(0,1fr)"><span>測量值</span><input type="text" value="0.00520" inputmode="decimal" aria-label="測量值"></label>
    <div class="ops" data-g="pre">${PRE.map((p) => `<button type="button" data-v="${p}">${p}</button>`).join('')}</div>
    <div class="facts"><div class="fact"><span>有效數字位數</span><b data-f="n"></b></div><div class="fact"><span>科學記號</span><b data-f="sci"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>判斷依據</span><b data-f="why" style="font-family:inherit;font-size:.86rem;font-weight:400"></b></div></div>
    <h4>刻度尺讀數：讀到最小刻度，再估計一位</h4>
    <div class="ops" data-g="ruler"><button type="button" data-r="cm" aria-pressed="true">甲尺：最小刻度 1 cm</button><button type="button" data-r="mm" aria-pressed="false">乙尺：最小刻度 1 mm</button></div>
    <label class="sl"><span>物體長</span><input type="range" min="0.5" max="4.9" step="0.001" value="3.637"><output></output></label>
    <h4>練習：乘除的有效數字</h4>
    <div data-f="q" style="font-family:var(--f-mono);font-size:1rem"></div>
    <div class="ops" data-g="ans"></div>
    <div class="facts"><div class="fact" style="grid-column:1/-1"><span>結果</span><b data-f="fb" style="font-family:inherit;font-size:.88rem;font-weight:400">選一個答案。</b></div></div>
    <div class="ops"><button type="button" data-next>下一題</button></div>
    <p class="sim-note">記錄值＝準確值＋一位估計值；乘除結果的位數與「位數最少」的數相同，計算機顯示的一長串數字不能照抄。</p>
  </div></div>`;
  const $ = (s) => el.querySelector(s);
  function parse(raw) {
    let s = raw.trim().replace(/\s+/g, '').replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => UNS[c]);
    const m = s.match(/^[+-]?(\d*)(\.?)(\d*)(?:(?:e|[×xX*]10\^?)([+-]?\d+))?$/);
    if (!m || (m[1] + m[3]) === '') return null;
    return { int: m[1], dot: m[2] === '.', frac: m[3], exp: Number(m[4] || 0), sci: m[4] !== undefined };
  }
  function analyze() {
    const p = parse($('input[type=text]').value), dg = $('.dg');
    if (!p) { dg.textContent = '？'; $('[data-f="n"]').textContent = '—'; $('[data-f="sci"]').textContent = '—'; $('[data-f="why"]').textContent = '請輸入數字，例如 0.0520 或 2.0×10^3。'; return; }
    const all = p.int + p.frac, first = all.search(/[1-9]/);
    if (first < 0) { dg.textContent = all; $('[data-f="n"]').textContent = '—'; $('[data-f="sci"]').textContent = '0'; $('[data-f="why"]').textContent = '測量值為 0，無法以此判斷位數。'; return; }
    const lastNZ = all.length - 1 - all.split('').reverse().join('').search(/[1-9]/);
    const amb = !p.dot && !p.sci && lastNZ < all.length - 1;
    const endSig = p.dot || p.sci ? all.length - 1 : lastNZ;
    let html = '';
    all.split('').forEach((c, i) => {
      if (i === p.int.length && p.dot) html += '<i>.</i>';
      const cls = i < first ? 'z' : i <= endSig ? 's' : 'q';
      html += `<i class="${cls}">${c}</i>`;
    });
    if (p.dot && p.frac === '') html += '<i>.</i>';
    if (p.sci) html += `<i>×10${sup(p.exp)}</i>`;
    dg.innerHTML = html;
    const e = p.int.length - 1 - first + p.exp, nmin = endSig - first + 1, nmax = all.length - first;
    const mant = (k) => { const d = all.slice(first, first + k); return d[0] + (k > 1 ? '.' + d.slice(1) : '') + '×10' + sup(e); };
    $('[data-f="n"]').textContent = amb ? `${nmin}～${nmax} 位（無法判斷）` : `${nmin} 位`;
    $('[data-f="sci"]').textContent = amb ? `${mant(nmin)} 或 ${mant(nmax)}` : mant(nmin);
    const why = [];
    if (first > 0) why.push('首位非零數字前的 0 只表示小數點位置，不算');
    if (/0/.test(all.slice(first, lastNZ + 1))) why.push('非零數字之間的 0 要算');
    if (lastNZ < all.length - 1) why.push(p.dot || p.sci ? '小數點後（或科學記號中）末尾的 0 是估計值，要算' : '整數末尾的 0 無法判斷，宜改用科學記號');
    if (!why.length) why.push('非零數字皆算');
    $('[data-f="why"]').textContent = why.join('；') + '。';
  }
  // ruler
  const svg = $('svg'); let unit = 'cm';
  function ruler() {
    const L = Number($('input[type=range]').value), X = (v) => 30 + v * 72;
    let s = `<rect x="${X(0)}" y="18" width="${L * 72}" height="26" rx="3" fill="var(--c-C)" fill-opacity=".75"/>`;
    s += `<rect x="20" y="50" width="380" height="62" rx="4" fill="var(--card)" stroke="var(--line)"/>`;
    for (let i = 0; i <= 50; i++) {
      const big = i % 10 === 0, half = i % 5 === 0;
      if (!big && unit === 'cm') continue;
      s += `<line x1="${X(i / 10)}" y1="50" x2="${X(i / 10)}" y2="${50 + (big ? 22 : half ? 15 : 10)}" stroke="var(--ink)" stroke-width="${big ? 1.4 : .8}"/>`;
      if (big) s += `<text x="${X(i / 10)}" y="90" font-size="15" text-anchor="middle" fill="var(--ink)">${i / 10}</text>`;
    }
    s += `<text x="395" y="106" font-size="12" text-anchor="end" fill="var(--ink-2)">cm</text><line x1="${X(L)}" y1="12" x2="${X(L)}" y2="74" stroke="var(--red)" stroke-dasharray="3 2"/>`;
    svg.innerHTML = s;
    const d = unit === 'cm' ? 1 : 2, r = L.toFixed(d), acc = unit === 'cm' ? Math.floor(Number(r)).toString() : (Math.floor(Number(r) * 10) / 10).toFixed(1);
    const est = (Number(r) - Number(acc)).toFixed(d);
    $('output').textContent = `讀作 ${r} cm`;
    $('output').title = `準確值 ${acc}、估計值 ${est}`;
    svg.setAttribute('aria-label', `讀作 ${r} cm：${acc} 為準確值，${est} 為估計值（${d + 1} 位有效數字）`);
    svg.insertAdjacentHTML('beforeend', `<text data-t x="210" y="127" font-size="14" text-anchor="middle" fill="var(--teal-2)">${r} cm ＝ 準確值 ${acc} ＋ 估計值 ${est}（${r.replace('.', '').replace(/^0+/, '').length} 位有效數字）</text>`);
  }
  // practice
  const fmt = (x, k) => { const r = Number(x.toPrecision(k)); const e2 = Math.floor(Math.log10(Math.abs(r)));
    if (e2 > k - 1 || e2 < -3) { const m = (r / 10 ** e2).toFixed(k - 1); return m + '×10' + sup(e2); } return r.toFixed(Math.max(0, k - 1 - e2)); };
  let Q = { a: 4.20, ka: 3, b: 2.6, kb: 2, op: '×' };
  function rnd(k) { const e = Math.floor(Math.random() * (k + 1)) - 1; const m = 1 + Math.random() * 9; return Number((m * 10 ** e).toPrecision(k)); }
  function newQ() { const ka = 2 + Math.floor(Math.random() * 3); let kb = 2 + Math.floor(Math.random() * 3); if (kb === ka) kb = ka === 2 ? 3 : ka - 1; Q = { a: rnd(ka), ka, b: rnd(kb), kb, op: Math.random() < 0.5 ? '×' : '÷' }; showQ(); }
  function showQ() {
    const raw = Q.op === '×' ? Q.a * Q.b : Q.a / Q.b, k = Math.min(Q.ka, Q.kb);
    $('[data-f="q"]').textContent = `${fmt(Q.a, Q.ka)} ${Q.op} ${fmt(Q.b, Q.kb)} = ？`;
    const right = fmt(raw, k), calc = String(Number(raw.toPrecision(7)));
    const opts = [...new Set([right, fmt(raw, Math.max(Q.ka, Q.kb)), calc, fmt(raw, k > 1 ? k - 1 : k + 2)])].sort(() => Math.random() - 0.5);
    $('[data-g="ans"]').innerHTML = opts.map((o) => `<button type="button" aria-pressed="false" data-a="${o}">${o}</button>`).join('');
    $('[data-f="fb"]').textContent = '選一個答案。';
    $('[data-g="ans"]').onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      el.querySelectorAll('[data-g="ans"] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const ok = b.dataset.a === right;
      $('[data-f="fb"]').innerHTML = `${ok ? '<b style="color:var(--green)">正確！</b>' : '<b style="color:var(--red)">再想想。</b>'} 計算機顯示 ${calc}；兩數分別為 ${Q.ka} 位與 ${Q.kb} 位，結果取 ${k} 位：<b>${right}</b>`;
    };
  }
  $('input[type=text]').addEventListener('input', analyze);
  $('[data-g="pre"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $('input[type=text]').value = b.dataset.v; analyze(); });
  $('[data-g="ruler"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; unit = b.dataset.r; el.querySelectorAll('[data-g="ruler"] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); ruler(); });
  $('input[type=range]').addEventListener('input', ruler);
  $('[data-next]').addEventListener('click', newQ);
  analyze(); ruler(); showQ();
};
