'use strict';
/* ---------- 全館搜尋：房間、章節、每一句旁白、名詞、謎題、暴雨 ---------- */
(function () {
  const A = window.__A, K = A.K, { $, CH, pad } = A;
  let IDX = null;
  function build() {
    const out = [];
    const add = (kind, title, text, go, w) => out.push({ kind, title, text: text || '', go, w: w || 0, hay: (title + ' ' + (text || '')).toLowerCase() });
    add('房間', '大廳', '首頁', '#hall', 3);
    A.ROOMS.forEach(r => add('房間', r[1], r[2], '#' + r[0], 3));
    add('房間', '關於本館', '資料來源、權利聲明', '#about', 1);
    CH.forEach(c => {
      add('章節', c.no + '　' + c.zh, c.en + ' · ' + c.meta + ' · ' + c.epi, '#' + c.id, 2);
      c.shots.filter(s => s.cues && s.cues.length).forEach((s, i) => s.cues.forEach(t => add('底片', c.no + ' PL.' + pad(i + 1), t, '#' + c.id + '/' + (i + 1))));
    });
    TERMS.forEach(t => add('名詞', t.t, t.d, '#index/' + encodeURIComponent(t.t), 2));
    QS.forEach((q, i) => add('謎題', 'Q.' + pad(i + 1) + '　' + q.q, q.cl.join(' '), '#questions', 1));
    SD.forEach((s, i) => add('暴雨', ORD[i] + '暴雨　' + s.f + ' → ' + s.t, s.note, () => { A.setEra(i, true); location.hash = 'chronicle'; if (A.cur === 'chronicle') A.stormPaint(); }, 1));
    add('動作', '館內設定', '外觀 字級 動態 雨聲', () => A.Settings.open());
    add('動作', '鍵盤快捷鍵', '', () => A.Settings.shortcuts());
    add('動作', '原創字體頁：逆雨 NiYu', '字型 字體 樣張 下載 font', () => window.open(FONT_PAGE, '_blank', 'noopener'));
    add('動作', '館刊：量雨的人（閱讀與下載）', '小說 書 線裝本 PDF Word 下載 book', () => { location.href = BOOK_PAGE; });
    add('動作', '雨聲：開／關', '環境音', () => A.Settings.set('snd', !A.Settings.get().snd));
    add('動作', '館內配樂：開／關', '音樂 主題 變奏', () => A.Music.toggle());
    add('動作', '外觀：白晝', '淺色', () => A.Settings.set('theme', 'light'));
    add('動作', '外觀：暗房', '深色', () => A.Settings.set('theme', 'dark'));
    add('動作', '從頭放映紀錄片', '放映廳', '#film/open');
    return out;
  }
  function search(q) {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return IDX.filter(x => x.kind === '房間').slice(0, 14);
    const res = [];
    for (const it of IDX) {
      let ok = true, score = it.w;
      for (const t of toks) { const i = it.hay.indexOf(t); if (i < 0) { ok = false; break; } if (it.title.toLowerCase().indexOf(t) >= 0) score += 5; }
      if (ok) res.push([score, it]);
    }
    res.sort((a, b) => b[0] - a[0]);
    return res.slice(0, 40).map(x => x[1]);
  }
  /* 把命中的字標出來；長的內文只留命中附近的一段。 */
  function mark(text, toks, max) {
    const low = text.toLowerCase(); let at = -1;
    for (const t of toks) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
    let start = 0;
    if (max && text.length > max) { start = Math.max(0, Math.min(text.length - max, (at < 0 ? 0 : at) - 14)); text = (start ? '…' : '') + text.slice(start, start + max) + (start + max < text.length + (start ? 1 : 0) ? '…' : ''); }
    const span = document.createElement('span'), l2 = text.toLowerCase(); let i = 0;
    while (i < text.length) {
      let best = -1, len = 0;
      for (const t of toks) { const j = l2.indexOf(t, i); if (j >= 0 && (best < 0 || j < best)) { best = j; len = t.length; } }
      if (best < 0) { span.append(text.slice(i)); break; }
      if (best > i) span.append(text.slice(i, best));
      const m = document.createElement('mark'); m.textContent = text.slice(best, best + len); span.append(m); i = best + len;
    }
    return span;
  }
  function open() {
    if (!IDX) IDX = build();
    $('toc').hidden = true;
    K.dialog({
      title: '搜尋全館', cls: 'dlg-find', build(body, dlg) {
        const inp = K.h('input.field', { type: 'search', placeholder: '章節、旁白裡的一句話、名詞、年份…', 'aria-label': '搜尋全館', autocomplete: 'off', 'data-auto': '1', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'find-list' });
        const list = K.h('ol.find-list', { id: 'find-list', role: 'listbox' }), note = K.h('p.count');
        let rows = [], sel = 0;
        const pick = (it) => { dlg.close(); if (typeof it.go === 'function') it.go(); else if (location.hash === it.go) A.route(); else location.hash = it.go.slice(1); };
        const paint = () => {
          const q = inp.value.trim(), toks = q.toLowerCase().split(/\s+/).filter(Boolean);
          rows = search(q); sel = 0; list.textContent = '';
          rows.forEach((it, i) => {
            const li = K.h('li', { role: 'option', id: 'find-' + i, 'aria-selected': i === 0 ? 'true' : 'false' });
            li.append(K.h('span.k', { text: it.kind }));
            const b = K.h('div'); const t = K.h('b'); t.append(mark(it.title, toks)); b.append(t);
            if (it.text) { const d = K.h('span.d'); d.append(mark(it.text, toks, 64)); b.append(d); }
            li.append(b); li.onclick = () => pick(it); li.onmousemove = () => choose(i, true);
            list.append(li);
          });
          note.textContent = q ? (rows.length ? '找到 ' + rows.length + (rows.length >= 40 ? '+' : '') + ' 筆　↑↓ 選擇　Enter 前往' : '沒有符合的內容，換個字試試。') : '輸入關鍵字；也可以直接選一個房間。';
          inp.setAttribute('aria-activedescendant', rows.length ? 'find-0' : '');
        };
        const choose = (i, quiet) => {
          if (!rows.length) return; sel = (i + rows.length) % rows.length;
          [...list.children].forEach((li, j) => li.setAttribute('aria-selected', j === sel ? 'true' : 'false'));
          inp.setAttribute('aria-activedescendant', 'find-' + sel);
          if (!quiet) list.children[sel].scrollIntoView({ block: 'nearest' });
        };
        inp.addEventListener('input', paint);
        inp.addEventListener('keydown', e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); choose(sel + 1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); choose(sel - 1); }
          else if (e.key === 'Enter' && rows[sel]) { e.preventDefault(); pick(rows[sel]); }
        });
        body.append(inp, note, list); paint();
      }
    });
  }
  A.on('ready', () => ['b-find', 'toc-find', 'foot-find'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', open); }));
  K.key((e, typing) => (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey), e => { e.preventDefault(); open(); });
  K.key((e, typing) => !typing && e.key === '/' && !e.ctrlKey && !e.metaKey, e => { e.preventDefault(); open(); });
  A.Find = { open };
})();
