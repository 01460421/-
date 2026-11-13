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
    document.fonts.load('400 12pt "Noto Serif TC"', all),
    document.fonts.load('700 12pt "Noto Serif TC"', all),
    document.fonts.load('12pt "NiYu"', all)
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
  cover.el.querySelector('.ca').innerHTML = '<span class="lat">Claude</span>　著';
  cover.el.querySelector('.cd').textContent = B.meta.date;
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

  /* ── 兩頁併一張 ── */
  const out = document.getElementById('book');
  for (let i = 0; i < M; i++) {
    const r = pages[2 * i], l = pages[2 * i + 1];
    const sh = $('div', 'sheet'), fr = $('div', 'frame'), inn = $('div', 'inner');
    const L = $('div', 'half'), core = $('div', 'core'), R = $('div', 'half');
    core.appendChild($('div', 'bk', B.meta.short)); core.appendChild($('div', 'fish'));
    core.appendChild($('div', 'vl', r.label)); core.appendChild($('div', 'lf', cn(i + 1)));
    if (l) L.appendChild(l.el); R.appendChild(r.el);
    inn.appendChild(L); inn.appendChild(core); inn.appendChild(R); fr.appendChild(inn); sh.appendChild(fr); out.appendChild(sh);
  }
  stage.remove();
  await document.fonts.ready;

  /* 檢查：有沒有哪一頁溢出、哪個字沒有字型 */
  pages.forEach(p => { if (p.flow && p.flow.getBoundingClientRect().width > p.el.clientWidth) warn.push('第 ' + p.no + ' 頁溢出'); });
  const colW = parseFloat(getComputedStyle(pages[5].el).lineHeight);
  const cols = pages.map(p => p.flow ? Math.round(p.flow.getBoundingClientRect().width / colW) : -1);
  window.DONE = { pages: N, sheets: M, toc, warn, tiersUsed: ti + 1, cols };
})().catch(e => { window.DONE = { error: String(e && e.stack || e) }; });
