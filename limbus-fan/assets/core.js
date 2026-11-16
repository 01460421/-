// 手冊的骨架：路由、存檔、劇透閘門、名詞連結、印章、搜尋、設定。
// 每個房間在 rooms/*.js 裡用 LB.room(名字, { title, render }) 登記。
(function () {
  const LB = window.LB;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = () => document.documentElement.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  LB.$ = $; LB.$$ = $$; LB.esc = esc; LB.reduce = reduce;

  /* ── 存檔：全部放在這台裝置的瀏覽器裡 ── */
  const KEY = 'lb-handbook-v1';
  let S = {};
  try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { S = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 私密模式等存不了的情況 */ } };
  LB.store = {
    get: (k, d) => (k in S ? S[k] : d),
    set: (k, v) => { S[k] = v; save(); },
    all: () => S,
    reset: () => { S = {}; save(); },
  };
  const st = LB.store;

  /* ── 人物、章節的索引 ── */
  LB.people = Object.fromEntries([...LB.sinners, ...LB.crew].map(p => [p.id, p]));
  LB.cantoByNo = Object.fromEntries(LB.cantos.filter(c => !c.side).map(c => [c.no, c]));
  LB.cantoOf = id => LB.cantos.find(c => !c.side && (c.who || []).includes(id));
  LB.sinById = Object.fromEntries(LB.sins.map(s => [s.id, s]));

  /* ── 劇透閘門：讀到第幾章 ── */
  // progress：-1 還沒開始、0 序章、1–10 第幾章、99 全部看完。沒設定時當作 -1。
  LB.progress = () => st.get('progress', -1);
  LB.progressLabel = p => p < 0 ? '還沒開始' : p === 0 ? '看完序章' : p >= 99 ? '全部看完' : `看完第${LB.num(p)}章`;
  LB.num = n => '〇一二三四五六七八九十'[n] || String(n);
  const opened = new Set();                               // 這次逛的時候按過「仍要顯示」的段落
  LB.spoil = (ch, html, key) => {
    const k = key || ('s' + ch + ':' + html.length);
    if (ch <= LB.progress() || opened.has(k)) return `<div class="spoil open">${html}</div>`;
    return `<div class="spoil" data-k="${esc(k)}"><div class="spoil-body" aria-hidden="true">${html}</div>
      <div class="spoil-cover"><b>${ch >= 99 ? '這段有較後面章節的劇透' : `這段有${ch === 0 ? '序章' : '第' + LB.num(ch) + '章'}的劇透`}</b><span>你目前的進度是「${LB.progressLabel(LB.progress())}」。</span>
      <button type="button" class="btn small" data-reveal="${esc(k)}">仍要顯示</button></div></div>`;
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-reveal]');
    if (!b) return;
    opened.add(b.dataset.reveal);
    const box = b.closest('.spoil');
    box.classList.add('open'); box.querySelector('.spoil-body').removeAttribute('aria-hidden'); b.parentElement.remove();
  });

  /* ── 名詞連結：長的說明文字裡出現辭典的詞，點一下看解釋 ── */
  let termRe = null;
  const termMap = {};
  const buildTerms = () => {
    const list = LB.glossary.filter(t => t.auto !== false && t.t.length >= 2);
    list.forEach(t => { termMap[t.t] = t; (t.alias || []).forEach(a => { termMap[a] = t; }); });
    const keys = Object.keys(termMap).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    termRe = new RegExp(keys.join('|'), 'g');
  };
  LB.linkTerms = (text, skip) => {
    if (!termRe) buildTerms();
    const seen = new Set(skip || []);
    return esc(text).replace(termRe, m => {
      const t = termMap[m];
      if (!t || seen.has(t.id)) return m;
      seen.add(t.id);
      return `<button type="button" class="term-link" data-term="${t.id}">${m}</button>`;
    });
  };
  LB.prose = (text, skip) => String(text).split(/\n\n+/).map(p => `<p>${LB.linkTerms(p, skip)}</p>`).join('');
  const pop = document.createElement('div');
  pop.className = 'term-pop'; pop.setAttribute('role', 'dialog'); pop.hidden = true;
  document.body.appendChild(pop);
  document.addEventListener('click', e => {
    const b = e.target.closest('.term-link');
    if (!b) { if (!e.target.closest('.term-pop')) pop.hidden = true; return; }
    const t = LB.glossary.find(x => x.id === b.dataset.term);
    pop.innerHTML = `<b>${esc(t.t)}</b> <span class="en">${esc(t.en)}</span><p>${esc(t.d)}</p><a href="#/terms/${t.id}">在辭典裡看 →</a>`;
    pop.hidden = false;
    const r = b.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + scrollX)) + 'px';
    pop.style.top = (r.bottom + scrollY + 8) + 'px';
    LB.stamp('term-' + t.id, true);
  });
  addEventListener('hashchange', () => { pop.hidden = true; });

  /* ── 印章：逛過的頁面、做過的事 ── */
  LB.stamps = () => st.get('stamps', {});
  LB.stamp = (id, quiet) => {
    const s = LB.stamps();
    if (s[id]) return false;
    s[id] = new Date().toISOString().slice(0, 10);
    st.set('stamps', s);
    const a = LB.achievements.find(x => x.id === id);
    if (a && !quiet) LB.toast(`蓋到一枚章：${a.name}`);
    LB.checkAchievements();
    return true;
  };
  LB.checkAchievements = () => {
    const s = LB.stamps();
    LB.achievements.forEach(a => { if (a.test && !s[a.id] && a.test(s)) { s[a.id] = new Date().toISOString().slice(0, 10); st.set('stamps', s); LB.toast(`蓋到一枚章：${a.name}`); } });
  };

  /* ── 小提示 ── */
  LB.toast = msg => {
    let box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  };

  /* ── 路由：#/房間/參數 ── */
  const rooms = {};
  LB.room = (name, def) => { rooms[name] = def; };
  LB.go = h => { location.hash = h; };
  const view = () => $('#view');
  const render = () => {
    const raw = location.hash.replace(/^#\/?/, '');
    const [name, ...args] = raw.split('/').map(decodeURIComponent);
    const room = rooms[name || 'hall'] || rooms.missing;
    const out = room.render(...args);
    const v = view();
    v.innerHTML = out.html;
    v.dataset.room = name || 'hall';
    document.title = (out.title ? out.title + '｜' : '') + '邊獄巴士乘客手冊';
    $$('.nav a, .menu a').forEach(a => a.setAttribute('aria-current', String(a.dataset.room === (room.group || name || 'hall'))));
    if (out.after) out.after(v);
    if (!LB.skipScroll) scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    LB.skipScroll = false;
    const h1 = v.querySelector('h1');
    if (h1 && LB.navigated) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    LB.navigated = true;
    if (name && name !== 'hall') st.set('last', location.hash);
    closeMenu();
  };
  addEventListener('hashchange', render);
  LB.rerender = () => { LB.skipScroll = true; render(); };

  /* ── 選單（全部的房間） ── */
  const menu = () => $('#menu');
  const closeMenu = () => { const m = menu(); if (m && !m.hidden) { m.hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); } };
  LB.openMenu = () => { const m = menu(); m.hidden = false; $('#menuBtn').setAttribute('aria-expanded', 'true'); m.querySelector('a').focus(); };

  /* ── 對話框 ── */
  LB.dialog = (id, open = true) => {
    const d = document.getElementById(id);
    if (open) { d.showModal ? d.showModal() : d.setAttribute('open', ''); }
    else d.close ? d.close() : d.removeAttribute('open');
  };

  /* ── 搜尋 ── */
  const searchItems = () => {
    const items = [];
    LB.sinners.concat(LB.crew).forEach(p => items.push({ k: '乘客', t: p.zh, s: `${p.en}｜${p.src ? (p.src.author + (p.src.work ? '《' + p.src.work + '》' : '')) : ''}`, h: `#/sinner/${p.id}`, words: [p.zh, p.en, p.src?.work, p.src?.author, p.cn].join(' ') }));
    LB.cantos.forEach(c => items.push({ k: c.side ? '間章' : '章節', t: `${c.lab}〈${c.title}〉`, s: c.en, h: c.side ? `#/route` : `#/canto/${c.no}`, words: [c.lab, c.title, c.en].join(' ') }));
    LB.glossary.forEach(t => items.push({ k: '名詞', t: t.t, s: t.en + '｜' + t.d, h: `#/terms/${t.id}`, words: [t.t, t.en, t.d, (t.alias || []).join(' ')].join(' ') }));
    (LB.works || []).forEach(w => items.push({ k: '書房', t: `《${w.title}》`, s: `${w.author}｜${w.year}`, h: `#/library/${w.id}`, words: [w.title, w.author, w.orig, w.year].join(' ') }));
    (LB.city?.wings || []).forEach(w => items.push({ k: '都市', t: w.name, s: w.what || '', h: `#/city`, words: [w.name, w.en, w.what].join(' ') }));
    LB.rooms.forEach(r => items.push({ k: '房間', t: r.name, s: r.desc, h: '#/' + r.id, words: r.name + ' ' + r.desc }));
    return items;
  };
  let SI = null;
  LB.search = q => {
    if (!SI) SI = searchItems();
    q = q.trim().toLowerCase();
    if (!q) return [];
    const parts = q.split(/\s+/);
    return SI.map(it => {
      const w = it.words.toLowerCase(), t = it.t.toLowerCase();
      if (!parts.every(p => w.includes(p) || t.includes(p))) return null;
      const score = (t.startsWith(q) ? 0 : t.includes(q) ? 1 : 2) + (it.k === '房間' ? -.5 : 0);
      return { ...it, score };
    }).filter(Boolean).sort((a, b) => a.score - b.score).slice(0, 30);
  };

  /* ── 設定 ── */
  LB.applySettings = () => {
    const r = document.documentElement;
    r.classList.toggle('calm', !!st.get('calm', false));
    r.classList.toggle('big', !!st.get('big', false));
  };

  /* ── 每日乘客、連續來訪 ── */
  LB.today = () => new Date().toISOString().slice(0, 10);
  LB.daily = () => {
    const d = LB.today(), n = [...d].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    return LB.sinners[n % LB.sinners.length];
  };
  (function visit() {
    const d = LB.today(), last = st.get('lastVisit');
    if (last === d) return;
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    st.set('streak', last === y ? st.get('streak', 0) + 1 : 1);
    st.set('visits', st.get('visits', 0) + 1);
    st.set('lastVisit', d);
  })();

  LB.start = () => {
    LB.applySettings();
    render();
  };
})();
