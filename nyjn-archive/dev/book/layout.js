/* 分頁：把 window.BOOK 排成一頁一頁，再兩頁併成一張。
   直排（vertical-rl）下，一頁的「寬」就是欄數；量 .flow 的實際寬度，超過就換頁。 */
(async function () {
  const B = window.BOOK;
  const stage = document.getElementById('stage');
  const warn = [];
  const pages = [];
  const $ = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  /* 數字 */
  const D = '〇一二三四五六七八九';
  const digits = n => String(n).split('').map(c => D[+c]).join('');
  const cn = n => {
    if (n < 10) return D[n];
    if (n < 20) return '十' + (n % 10 ? D[n % 10] : '');
    if (n < 100) return D[Math.floor(n / 10)] + '十' + (n % 10 ? D[n % 10] : '');
    const h = Math.floor(n / 100), r = n % 100;
    return D[h] + '百' + (r === 0 ? '' : r < 10 ? '零' + D[r] : (r < 20 ? '一' : '') + cn(r));
  };

  /* 先把字型叫齊，量出來的欄數才是真的 */
  const all = JSON.stringify(B);
  await Promise.all([
    document.fonts.load('400 12pt "Iansui"', all),
    document.fonts.load('400 12pt "LXGW WenKai TC"', '蟪胔'),
    document.fonts.load('12pt "NiYu"', all),
    document.fonts.load('italic 12pt "IM Fell English"', 'The One Who Measures the Rain'),
    document.fonts.load('12pt "IM Fell English"', '1999'),
    document.fonts.load('12pt "Courier Prime"', 'A REVERSE: 1999 FAN NOVEL')
  ]).catch(e => warn.push('font: ' + e.message));
  await document.fonts.ready;

  function mkPage(label, cls, noFlow) {
    const el = $('div', 'pg' + (cls ? ' ' + cls : ''));
    const o = { el, label, no: pages.length + 1 };
    if (!noFlow) { o.flow = $('div', 'flow'); el.appendChild(o.flow); }
    stage.appendChild(el); pages.push(o); return o;
  }
  let AVAIL = 0;
  function avail(pg) {
    if (AVAIL) return AVAIL;
    const cs = getComputedStyle(pg.el);
    AVAIL = pg.el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return AVAIL;
  }
  const fits = pg => pg.flow.getBoundingClientRect().width <= avail(pg) + 0.6;

  let cur = null, label = '卷首', lab = null;
  const newPage = () => { cur = mkPage(label); if (lab) cur.el.style.setProperty('--lab', lab); return cur; };

  function make(b) {
    let d;
    switch (b.t) {
      case 'p': d = $('div', 'p', b.x); break;
      case 'p0': d = $('div', 'p p0', b.x); break;
      case 'dl': d = $('div', 'dl'); if (!b.tail) d.appendChild($('span', 'who', b.who)); d.appendChild(document.createTextNode(b.x)); break;
      case 'stage': d = $('div', 'stage', b.x); break;
      case 'kn': d = $('div', 'kn'); if (!b.tail) d.appendChild($('span', 'tag', '〔' + b.tag + '〕')); d.appendChild(document.createTextNode(b.x)); break;
      case 'pl': d = $('div', 'pl', b.x); break;
      case 'sub': d = $('div', 'sub', b.x); break;
      case 'num': d = $('div', 'num', b.x); break;
      case 'note': d = $('div', 'note', b.x); break;
      case 'sig': d = $('div', 'sig', b.x); break;
      case 'br': d = $('div', 'br'); d.innerHTML = '<i></i><i></i><i></i>'; break;
      case 'gap': d = $('div', b.h ? 'gap h' : 'gap'); break;
      case 'ttl': d = $('div', 'ttl' + (b.x.length > 8 ? ' long' : ''), b.x); break;
      case 'pst': d = $('div', 'pst', b.x); break;
      default: throw new Error('unknown block ' + b.t);
    }
    if (b.tail) d.classList.add('tail');
    return d;
  }
  const SPLIT = { p: 1, p0: 1, dl: 1, stage: 1, kn: 1, note: 1 };
  const NS = '，。、；：？！」』）》〉〕…—．', NE = '「『（《〈〔';

  function splitFit(pg, d) {
    const tn = d.lastChild; if (!tn || tn.nodeType !== 3) return null;
    const full = tn.data; let lo = 0, hi = full.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; tn.data = full.slice(0, mid); if (fits(pg)) lo = mid; else hi = mid - 1; }
    let n = lo;
    while (n > 0 && NS.includes(full[n])) n--;
    while (n > 0 && NE.includes(full[n - 1])) n--;
    if (n <= 0) { tn.data = full; return null; }
    tn.data = full.slice(0, n); d.classList.add('cut');
    return full.slice(n);
  }
  const lastIs = cls => cur.flow.lastElementChild && cur.flow.lastElementChild.classList.contains(cls);
  const trimGap = () => { while (lastIs('gap')) cur.flow.lastElementChild.remove(); };
  /* 後面至少還要留 n 欄，不然這一塊就該到下一頁去 */
  function roomAfter(n) { const s = $('div'); s.style.blockSize = 'calc(var(--L) * ' + n + ')'; cur.flow.appendChild(s); const ok = fits(cur); s.remove(); return ok; }

  function place(b, depth) {
    if (b.t === 'gap' && (cur.flow.childElementCount === 0 || lastIs('gap'))) return;
    const d = make(b); cur.flow.appendChild(d);
    if (fits(cur)) {
      if ((b.t === 'sub' || b.t === 'num' || b.t === 'br') && !roomAfter(2)) { d.remove(); trimGap(); newPage(); cur.flow.appendChild(make(b)); }
      return;
    }
    if (SPLIT[b.t]) {
      const rest = splitFit(cur, d);
      if (rest != null) { newPage(); place(Object.assign({}, b, { x: rest, tail: true }), 0); return; }
    }
    d.remove(); trimGap();
    if (cur.flow.childElementCount === 0) { cur.flow.appendChild(make(b)); warn.push('一頁放不下：' + (b.x || b.t).slice(0, 12)); return; }
    newPage(); if (b.t === 'gap') return;
    place(b, (depth || 0) + 1);
  }
  /* 詩的一節：不留孤行 */
  function placeStanza(lines) {
    const els = []; let k = 0;
    for (; k < lines.length; k++) { const d = make(lines[k]); cur.flow.appendChild(d); if (!fits(cur)) { d.remove(); break; } els.push(d); }
    if (k === lines.length) return;
    if (k < 2 && lines.length >= 2 && cur.flow.childElementCount > k) { els.forEach(e => e.remove()); k = 0; }
    else if (lines.length - k === 1 && k >= 3) { els.pop().remove(); k--; }
    if (k === 0) trimGap();
    if (k === 0 && cur.flow.childElementCount === 0) { warn.push('詩節過長：' + lines[0].x); lines.forEach(l => cur.flow.appendChild(make(l))); return; }
    newPage(); placeStanza(lines.slice(k));
  }
  function run(blocks) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.t === 'pl') { let j = i; while (j < blocks.length && blocks[j].t === 'pl') j++; placeStanza(blocks.slice(i, j)); i = j - 1; }
      else place(b);
    }
    trimGap();
  }
  function head(title, sub, tight) { place({ t: 'ttl', x: title }); if (sub) place({ t: 'pst', x: sub }); else if (!tight) cur.flow.appendChild($('div', 'gap')); }
  /* 收緊：一篇只多出一兩欄、為此另起一頁的時候，拿掉題後的空欄、詩節之間改半欄、附註不另空欄，看能不能收回來 */
  function tighten(blocks, kind) {
    const out = [];
    blocks.forEach((b, i) => {
      if (b.t === 'gap') {
        const nx = blocks[i + 1];
        if (nx && nx.t === 'note') return;
        if (kind === 'poem') { out.push({ t: 'gap', h: 1 }); return; }
      }
      out.push(b);
    });
    return out;
  }
  const colPx = () => parseFloat(getComputedStyle(cur.el).lineHeight);
  function lay(title, sub, blocks, kind) {
    const start = pages.length;
    const go = tight => { newPage(); head(title, sub, tight); run(tight ? tighten(blocks, kind) : blocks); return { n: pages.length - start, last: cur.flow.getBoundingClientRect().width / colPx() }; };
    const undo = () => { while (pages.length > start) pages.pop().el.remove(); };
    const a = go(false);
    if (a.n > 1 && a.last <= 2.2) { undo(); const b = go(true); if (b.n >= a.n) { undo(); go(false); } }
    return pages[start].no;
  }

  /* ── 卷首 ── */
  const toc = [];
  const cover = mkPage('卷首', 'cover', true);
  cover.el.innerHTML = '<div class="cs"></div><div class="ct"></div><div class="ca"></div><div class="cd"></div>';
  cover.el.querySelector('.cs').textContent = B.meta.series;
  cover.el.querySelector('.ct').textContent = B.meta.title;
  cover.el.querySelector('.ca').innerHTML = '<span class="lat"></span>　著';
  cover.el.querySelector('.ca .lat').textContent = B.meta.author;
  cover.el.querySelector('.cd').textContent = B.meta.date;
  cover.el.appendChild($('div', 'len')).innerHTML = '<i></i><em></em><span></span>';
  cover.el.querySelector('.len em').textContent = B.meta.en;
  cover.el.querySelector('.len span').textContent = B.meta.enSub;
  const colo = mkPage('卷首', 'colo', true);
  const epi = mkPage('卷首', 'epi', true);
  epi.el.appendChild($('div', 'e')).innerHTML = B.meta.epigraph.map(l => l.replace(/</g, '&lt;')).join('<br>');
  const tocPages = [mkPage('卷首', 'toc', true), mkPage('卷首', 'toc', true)];

  /* ── 序 ── */
  label = '卷首'; lab = null;
  toc.push({ t: B.front.title, p: lay(B.front.title, B.front.sub, B.front.blocks, 'prose') });

  /* ── 八卷 ── */
  for (const v of B.vols) {
    label = v.no;
    const vp = mkPage(label, 'vol', true);
    vp.el.appendChild($('div', 'vno', v.no));
    vp.el.appendChild($('div', 'vt' + (v.title.length > 7 ? ' long' : ''), v.title));
    vp.el.appendChild($('div', 'vg', v.genre));
    vp.el.appendChild($('div', 've')).innerHTML = v.epi.map(l => l.replace(/</g, '&lt;')).join('<br>');
    const ve = B.meta.volsEn[B.vols.indexOf(v)];
    if (ve) { vp.el.appendChild($('div', 'len')).innerHTML = '<i></i><em></em><span></span>'; vp.el.querySelector('.len em').textContent = ve[1]; vp.el.querySelector('.len span').textContent = ve[0]; }
    toc.push({ v: v.no + '　' + v.title });
    for (const pc of v.pieces) {
      lab = pc.lab || null;
      toc.push({ t: pc.title, p: lay(pc.title, pc.sub, pc.blocks, pc.kind) });
    }
  }
  /* ── 後記 ── */
  label = '跋'; lab = null;
  toc.push({ gap: 1 }); toc.push({ t: B.back.title, p: lay(B.back.title, null, B.back.blocks, 'prose') });

  /* ── 末頁 ── */
  const fin = mkPage('跋', 'fin', true);
  const N = pages.length, M = Math.ceil(N / 2);
  const fb = $('div', 'fbox'); fb.innerHTML = B.meta.binding.map(l => l.replace('{N}', cn(N)).replace('{M}', cn(M))).join('<br>'); fin.el.appendChild(fb);
  const f1 = $('div', 'fl'); f1.innerHTML = '訂書者<u></u>　時在<u class="s"></u>年<u class="s"></u>月'; fin.el.appendChild(f1);
  const f2 = $('div', 'fl'); f2.innerHTML = '是日天氣<u></u>'; fin.el.appendChild(f2);
  const f3 = $('div', 'fl'); f3.innerHTML = '此為第<u class="s"></u>冊'; fin.el.appendChild(f3);

  /* ── 版權頁 ── */
  const cb = $('div', 'box');
  cb.innerHTML = '<h1></h1><dl></dl>' + B.meta.notes.map(() => '<p></p>').join('');
  cb.querySelector('h1').textContent = B.meta.title;
  const dl = cb.querySelector('dl');
  B.meta.colophon.forEach(([k, v]) => { dl.appendChild($('dt', '', k)); dl.appendChild($('dd', '', v.replace('{N}', cn(N)))); });
  cb.querySelectorAll('p').forEach((p, i) => { p.textContent = B.meta.notes[i]; });
  colo.el.appendChild(cb);

  /* ── 目錄：四層，由右而左、先上後下 ── */
  const tiers = [];
  tocPages.forEach(tp => { for (let i = 0; i < 2; i++) { const t = $('div', 'tier'); const f = $('div', 'tf'); t.appendChild(f); tp.el.appendChild(t); tiers.push({ t, f }); } });
  let ti = 0;
  const tAvail = () => tiers[ti].t.clientWidth;
  const tFits = () => tiers[ti].f.getBoundingClientRect().width <= tAvail() + 0.6;
  function tPut(mk, isGap) {
    if (isGap && tiers[ti].f.childElementCount === 0) return;
    let d = mk(); tiers[ti].f.appendChild(d);
    if (tFits()) return;
    d.remove();
    while (tiers[ti].f.lastElementChild && /tgap/.test(tiers[ti].f.lastElementChild.className)) tiers[ti].f.lastElementChild.remove();
    if (ti + 1 >= tiers.length) { warn.push('目錄放不下'); return; }
    ti++; if (isGap) return; tiers[ti].f.appendChild(mk());
  }
  tPut(() => $('div', 'ttl', '目錄')); tPut(() => $('div', 'tgap2'), true);
  toc.forEach((e, i) => {
    if (e.gap) { tPut(() => $('div', 'tgap'), true); return; }
    if (e.v) {
      tPut(() => $('div', 'tgap'), true);
      /* 卷名不落在一層的最後一欄 */
      const probe = $('div'); probe.style.blockSize = '12.4mm'; tiers[ti].f.appendChild(probe); const ok = tFits(); probe.remove();
      if (!ok && ti + 1 < tiers.length) { while (tiers[ti].f.lastElementChild && /tgap/.test(tiers[ti].f.lastElementChild.className)) tiers[ti].f.lastElementChild.remove(); ti++; }
      tPut(() => $('div', 'tv', e.v)); return;
    }
    tPut(() => { const d = $('div', 'te'); d.appendChild($('span', 'tn', e.t)); d.appendChild($('span', 'dots')); d.appendChild($('span', 'tp', digits(e.p))); return d; });
  });

  /* ── 成冊 ──
     leaves：兩頁併一張，就是付印的散葉。
     bound ：線裝本。每一葉對摺之後，前半（原紙右半）在翻開時落在左頁，後半落在下一個對開的右頁；
             版心正好被摺線分成兩半，露在書口。
     kit   ：書衣兩張與裝訂說明，動手訂的時候用。 */
  const mode = B.meta.mode || 'leaves';
  const out = document.getElementById('book');
  const mkCore = (lab2, n) => { const core = $('div', 'core'); ['tl', 'tr', 'bl', 'br'].forEach(c => core.appendChild($('span', 'cn ' + c))); core.appendChild($('div', 'bk', B.meta.short)); core.appendChild($('div', 'fish')); core.appendChild($('div', 'vl', lab2)); core.appendChild($('div', 'lf', cn(n))); return core; };
  const HOLES = [16, 75.33, 134.67, 194];           /* 四眼離書頭的距離（mm）；離書脊 11mm */
  const svgEl = html => { const t = $('div'); t.innerHTML = html; return t.firstChild; };
  /* 固定種子的亂數：雨線每次排出來都一樣 */
  const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  /* 倒著落的雨：線由下往上，水滴在上頭，尖端朝下 */
  const drop = (x, y, r) => 'M' + x + ' ' + (y + r * 1.9) + 'C' + (x - r * 1.15) + ' ' + (y + r * .5) + ' ' + (x - r) + ' ' + (y - r) + ' ' + x + ' ' + (y - r) + 'C' + (x + r) + ' ' + (y - r) + ' ' + (x + r * 1.15) + ' ' + (y + r * .5) + ' ' + x + ' ' + (y + r * 1.9) + 'Z';
  function rain(x0, x1, ground, maxLen, n, seed, color, id) {
    const R = rng(seed); let lines = '', drops = '';
    for (let k = 0; k < n; k++) {
      const x = +(x0 + (x1 - x0) * ((k + .15 + R() * .7) / n)).toFixed(2), len = 10 + Math.pow(R(), 1.8) * maxLen, top = +(ground - len).toFixed(2), r = +(.42 + R() * .5).toFixed(2), w = +(.12 + R() * .14).toFixed(2);
      lines += '<line x1="' + x + '" y1="' + ground + '" x2="' + x + '" y2="' + (top + r * 2.2).toFixed(2) + '" stroke-width="' + w + '"/>';
      drops += drop(x, top + r, r);
    }
    return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="' + color + '" stop-opacity=".95"/><stop offset="1" stop-color="' + color + '" stop-opacity=".12"/></linearGradient></defs>' +
      '<g stroke="' + color + '" stroke-opacity=".55" stroke-linecap="round">' + lines + '</g><path d="' + drops + '" fill="' + color + '"/>';
  }
  /* 階梯角的框：一九二〇年代的樣子 */
  const stepFrame = (x0, y0, x1, y1, n) => 'M' + (x0 + n) + ' ' + y0 + 'H' + (x1 - n) + 'V' + (y0 + n) + 'H' + x1 + 'V' + (y1 - n) + 'H' + (x1 - n) + 'V' + y1 + 'H' + (x0 + n) + 'V' + (y1 - n) + 'H' + x0 + 'V' + (y0 + n) + 'H' + (x0 + n) + 'Z';
  /* 藍印：檔案館的郵戳，日期是第一場雨 */
  let pmN = 0;
  function postmark(cls) {
    const id = 'pm' + (++pmN);
    return svgEl('<svg class="pm ' + cls + '" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor">' +
      '<defs><path id="' + id + '" d="M50 50m-38.5 0a38.5 38.5 0 1 1 77 0a38.5 38.5 0 1 1 -77 0"/></defs>' +
      '<circle cx="50" cy="50" r="47.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="50" cy="50" r="30.5" fill="none" stroke="currentColor" stroke-width=".9"/>' +
      '<text font-family="\'Courier Prime\',\'NiYu\',monospace" font-size="8.4"><textPath href="#' + id + '" textLength="236" lengthAdjust="spacing">NIYU ARCHIVE ＊ 逆雨檔案館 ＊ UNOFFICIAL ＊</textPath></text>' +
      '<text x="50" y="47.5" text-anchor="middle" font-family="\'IM Fell English\',serif" font-size="21">1999</text>' +
      '<path d="M27 53.5H73" stroke="currentColor" stroke-width=".8"/>' +
      '<text x="50" y="63.5" text-anchor="middle" font-family="\'Courier Prime\',monospace" font-size="8.2" letter-spacing="1.2">XII · 31</text></svg>');
  }

  if (mode === 'leaves') {
    for (let i = 0; i < M; i++) {
      const r = pages[2 * i], l = pages[2 * i + 1];
      const sh = $('div', 'sheet'), fr = $('div', 'frame'), inn = $('div', 'inner');
      const L = $('div', 'half'), R = $('div', 'half');
      if (l) L.appendChild(l.el); R.appendChild(r.el);
      inn.appendChild(L); inn.appendChild(mkCore(r.label, i + 1)); inn.appendChild(R); fr.appendChild(inn); sh.appendChild(fr); out.appendChild(sh);
    }
  }

  /* 書衣。front 的書脊在右，back 在左；print 是印在紙上的版本，只有線，沒有底色 */
  function coverArt(kind, print) {
    const front = kind === 'front', gold = print ? '#2a2a2a' : 'url(#foil)', line = print ? '#555' : '#d6bd84';
    const hx = front ? 137.5 : 11, ex = front ? 148.5 : 0;
    const fx0 = front ? 9 : 26, fx1 = front ? 122.5 : 139.5;         /* 框讓開縫線那一側 */
    let g = '<svg class="art" viewBox="0 0 148.5 210" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6d19c"/><stop offset=".45" stop-color="#c2a063"/><stop offset=".75" stop-color="#dcc48c"/><stop offset="1" stop-color="#a98649"/></linearGradient>' +
      '<linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9d6a0"/><stop offset=".5" stop-color="#b08f4f"/><stop offset="1" stop-color="#7c6130"/></linearGradient></defs>';
    g += '<path d="' + stepFrame(fx0, 9, fx1, 201, 4.2) + '" fill="none" stroke="' + gold + '" stroke-width=".55"/>' +
         '<path d="' + stepFrame(fx0 + 1.7, 10.7, fx1 - 1.7, 199.3, 4.2) + '" fill="none" stroke="' + gold + '" stroke-width=".18"/>';
    if (front) {
      g += rain(fx0 + 7, fx1 - 7, 170, 128, 44, 1999, line, 'rg') +
        '<path d="M' + (fx0 + 6) + ' 170H' + (fx1 - 6) + '" stroke="' + gold + '" stroke-width=".3"/>' +
        '<text x="' + ((fx0 + fx1) / 2) + '" y="181.5" text-anchor="middle" font-family="\'IM Fell English\',serif" font-style="italic" font-size="6.1" fill="' + gold + '">The One Who Measures the Rain</text>' +
        '<text x="' + ((fx0 + fx1) / 2) + '" y="189.6" text-anchor="middle" font-family="\'Courier Prime\',monospace" font-size="2.35" letter-spacing=".95" fill="' + gold + '" fill-opacity=".85">A REVERSE: 1999 FAN NOVEL　·　OMEGA</text>';
    } else {
      /* 封底：一只箱子 */
      const cx = (fx0 + fx1) / 2, cy = 158;
      g += '<g fill="none" stroke="' + gold + '" stroke-width=".4" stroke-linejoin="round">' +
        '<rect x="' + (cx - 17) + '" y="' + (cy - 10) + '" width="34" height="22" rx="1.6"/>' +
        '<path d="M' + (cx - 6) + ' ' + (cy - 10) + 'v-3.6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3.6"/>' +
        '<path d="M' + (cx - 17) + ' ' + (cy - 2.5) + 'H' + (cx + 17) + '" stroke-width=".25"/>' +
        '<rect x="' + (cx - 9.4) + '" y="' + (cy - 4.2) + '" width="3.2" height="3.4"/><rect x="' + (cx + 6.2) + '" y="' + (cy - 4.2) + '" width="3.2" height="3.4"/>' +
        '<path d="M' + (cx - 17) + ' ' + (cy - 5.4) + 'h4.6v-4.6M' + (cx + 17) + ' ' + (cy - 5.4) + 'h-4.6v-4.6M' + (cx - 17) + ' ' + (cy + 7.4) + 'h4.6v4.6M' + (cx + 17) + ' ' + (cy + 7.4) + 'h-4.6v4.6" stroke-width=".25"/></g>' +
        '<text x="' + cx + '" y="' + (cy + 22) + '" text-anchor="middle" font-family="\'Courier Prime\',monospace" font-size="2.3" letter-spacing="1.1" fill="' + gold + '" fill-opacity=".85">NIYU ARCHIVE　·　MCMXCIX</text>';
    }
    if (!print) {
      /* 包了銅的角：書口兩個三角，書脊兩個方的 */
      const fo = front ? 0 : 148.5, d = front ? 1 : -1;
      [[0, 1], [210, -1]].forEach(([y, v]) => {
        g += '<path d="M' + fo + ' ' + y + 'h' + (14 * d) + 'l' + (-14 * d) + ' ' + (14 * v) + 'z" fill="url(#brass)"/><path d="M' + (fo + 12.2 * d) + ' ' + (y + .9 * v) + 'L' + (fo + .9 * d) + ' ' + (y + 12.2 * v) + '" stroke="#5d4821" stroke-width=".22" fill="none"/>' +
          '<circle cx="' + (fo + 3.4 * d) + '" cy="' + (y + 3.4 * v) + '" r=".75" fill="#6e5527"/><circle cx="' + (fo + 3.25 * d) + '" cy="' + (y + 3.25 * v) + '" r=".4" fill="#ecdcae"/>';
        g += '<rect x="' + Math.min(hx, ex) + '" y="' + (v > 0 ? 0 : 194) + '" width="11" height="16" fill="url(#brass)"/><rect x="' + (Math.min(hx, ex) + .8) + '" y="' + ((v > 0 ? 0 : 194) + .8) + '" width="9.4" height="14.4" fill="none" stroke="#5d4821" stroke-width=".2"/>';
      });
      /* 線：一條貫穿書頭到書根，每一眼各有一道繞過書脊 */
      const d2 = 'M' + hx + ' 0V210' + HOLES.map(y => 'M' + hx + ' ' + y + 'H' + ex).join('');
      g += '<path d="' + d2 + '" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="1" transform="translate(.22 .28)"/><path d="' + d2 + '" fill="none" stroke="#dcc694" stroke-width=".66"/><path d="' + d2 + '" fill="none" stroke="#a88b52" stroke-width=".66" stroke-dasharray=".28 .62"/>' +
        HOLES.map(y => '<circle cx="' + hx + '" cy="' + y + '" r=".62" fill="#06100f"/>').join('');
      if (front) g += '<path d="M29.5 16.4C47 3 104 27 137.5 16" fill="none" stroke="rgba(0,0,0,.45)" stroke-width=".7" transform="translate(.25 .35)"/><path d="M29.5 16.4C47 3 104 27 137.5 16" fill="none" stroke="#c9b27c" stroke-width=".42"/>';
    } else if (front) {
      g += HOLES.map(y => '<path d="M' + (hx - 1.6) + ' ' + y + 'h3.2M' + hx + ' ' + (y - 1.6) + 'v3.2" stroke="#888" stroke-width=".12"/>').join('');
    }
    return svgEl(g + '</svg>');
  }
  /* 行李牌：題簽 */
  function tag() {
    const t = $('div', 'ltag');
    t.innerHTML = '<div class="card"></div><div class="eye"></div><div class="in"><div class="st"></div><div class="tl"><b>FILE</b>No. 1999<br><b>VOL.</b>I – VIII</div></div>';
    t.querySelector('.st').textContent = B.meta.title;
    t.appendChild(postmark('ontag'));
    return t;
  }
  /* 封底的短文：直排，一句一欄，節與節之間空半欄 */
  function blurb(print) {
    const d = $('div', 'blurb' + (print ? ' print' : ''));
    B.meta.blurb.forEach(l => d.appendChild(l ? $('p', '', l) : $('p', 'sp')));
    return d;
  }
  function closedBook(kind) {
    const b = $('div', 'closed ' + kind);
    b.appendChild(coverArt(kind, false));
    if (kind === 'front') b.appendChild(tag());
    else b.appendChild(blurb(false));
    return b;
  }
  /* 襯頁：書布的反面，滿版的倒雨 */
  function endpaper(win, seed) {
    win.classList.add('blank');
    win.appendChild(svgEl('<svg class="art" viewBox="0 0 148.5 210" xmlns="http://www.w3.org/2000/svg">' + rain(6, 142.5, 204, 190, 62, seed, '#c9b27c', 'eg' + seed) + '</svg>'));
    return win;
  }

  if (mode === 'bound') {
    document.body.classList.add('bound');
    pages[0].el.appendChild(postmark('ontitle'));
    const half = (pg, side, i) => {
      const win = $('div', 'bp ' + side + (side === 'a' ? ' l' : ' r'));
      if (!pg) return endpaper(win, side === 'a' ? 31 : 12);
      const vs = $('div', 'vsheet'), fr = $('div', 'frame'), inn = $('div', 'inner'), L = $('div', 'half'), R = $('div', 'half');
      (side === 'a' ? R : L).appendChild(pg.el);
      inn.appendChild(L); inn.appendChild(mkCore(pages[2 * i].label, i + 1)); inn.appendChild(R); fr.appendChild(inn); vs.appendChild(fr); win.appendChild(vs);
      return win;
    };
    const plate = cls => { const p = $('div', 'plate ' + cls); out.appendChild(p); return p; };
    plate('pc').appendChild(closedBook('front'));
    for (let k = 0; k <= M; k++) {
      const op = $('div', 'opening');
      const tl = 0.5 + 2.4 * (M - k) / M, tr = 0.5 + 2.4 * k / M;      /* 左邊是還沒讀的，右邊是讀過的 */
      const board = $('div', 'board'); board.style.left = (-tl - 1.5) + 'mm'; board.style.right = (-tr - 1.5) + 'mm'; op.appendChild(board);
      const sl = $('div', 'stack l'); sl.style.width = tl + 'mm'; sl.style.left = (-tl) + 'mm'; op.appendChild(sl);
      const sr = $('div', 'stack r'); sr.style.width = tr + 'mm'; sr.style.right = (-tr) + 'mm'; op.appendChild(sr);
      op.appendChild(half(k < M ? pages[2 * k] : null, 'a', k));
      op.appendChild(half(k > 0 ? pages[2 * k - 1] : null, 'b', k - 1));
      plate('po').appendChild(op);
    }
    plate('pc').appendChild(closedBook('back'));
  }

  if (mode === 'kit') {
    document.body.classList.add('kit');
    const sheet = () => { const sh = $('div', 'sheet ks'); out.appendChild(sh); return sh; };
    /* 前書衣：對摺後右半朝外。行李牌在左上（靠書口），四眼的記號在右緣（書脊） */
    const c1 = sheet(); const a1 = $('div', 'kart r'); a1.appendChild(coverArt('front', true)); a1.appendChild(tag()); c1.appendChild(a1);
    /* 後書衣：對摺後左半朝外 */
    const c2 = sheet(); const a2 = $('div', 'kart l'); a2.appendChild(coverArt('back', true)); a2.appendChild(blurb(true)); c2.appendChild(a2);
    /* 說明 */
    const g = sheet(); g.classList.add('guide');
    const fig = '<svg viewBox="-16 -8 92 96" xmlns="http://www.w3.org/2000/svg" font-family="Iansui, serif" font-size="3.1" fill="#333">' +
      '<rect x="0" y="0" width="54" height="76.4" fill="#fff" stroke="#222" stroke-width=".35"/>' +
      '<path d="M5.4 5.6h9.4l1.5 1.5v38.4H3.9V7.1z" fill="none" stroke="#222" stroke-width=".25"/>' +
      '<path d="M50 0V76.4' + HOLES.map(y => 'M50 ' + (y * 0.3638).toFixed(2) + 'H54').join('') + '" fill="none" stroke="#9c6b22" stroke-width=".5"/>' +
      HOLES.map((y, i) => '<circle cx="50" cy="' + (y * 0.3638).toFixed(2) + '" r=".9" fill="#222"/><text x="45.6" y="' + (y * 0.3638 + 1.1).toFixed(2) + '" text-anchor="end">' + '一二三四'[i] + '</text>').join('') +
      '<text x="27" y="-2.6" text-anchor="middle">書頭</text><text x="27" y="81.6" text-anchor="middle">書根</text>' +
      '<text x="-2.4" y="39" text-anchor="end">書口</text><text x="-2.4" y="43.2" text-anchor="end" font-size="2.5" fill="#777">（摺口）</text>' +
      '<text x="56.6" y="39">書脊</text><text x="56.6" y="43.2" font-size="2.5" fill="#777">（開口）</text>' +
      '<text x="10.2" y="51" text-anchor="middle" font-size="2.5" fill="#777">行李牌</text></svg>';
    g.innerHTML = '<div class="gh"><h1>裝訂說明</h1><p class="gs">《' + B.meta.title + '》｜四眼線裝｜書葉' + cn(M) + '張，訂成一冊，約 A5 大小</p></div>' +
      '<div class="gb"><ol>' + B.meta.guide.map(([h, x]) => '<li><b>' + h + '</b>' + x.replace('{M}', cn(M)) + '</li>').join('') + '</ol>' +
      '<div class="gf">' + fig + '<p>前書衣朝上的樣子。金線是訂好以後正面看得見的線。</p></div></div>';
  }
  stage.remove();
  await document.fonts.ready;

  /* 檢查：有沒有哪一頁溢出、哪個字沒有字型 */
  pages.forEach(p => { if (p.flow && p.flow.getBoundingClientRect().width > p.el.clientWidth) warn.push('第 ' + p.no + ' 頁溢出'); });
  const colW = parseFloat(getComputedStyle(pages[5].el).lineHeight);
  const cols = pages.map(p => p.flow ? Math.round(p.flow.getBoundingClientRect().width / colW) : -1);
  window.DONE = { pages: N, sheets: M, toc, warn, tiersUsed: ti + 1, cols };
})().catch(e => { window.DONE = { error: String(e && e.stack || e) }; });
