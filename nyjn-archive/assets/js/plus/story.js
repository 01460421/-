'use strict';
/* ---------- 親歷：把一章當成現場走一遍 ----------
   展間是「看底片、讀說明」。親歷把同一份內容換一種走法：底片鋪滿整個畫面，
   旁白一句一句出來，由你決定什麼時候往下；走到八個時刻落在的那一張底片時，故事會停下來等你選。
   選項要按住才算數——那不是一個可以隨手點掉的按鈕。選完才揭曉主線裡發生的事，然後故事繼續。
   內容全部來自 film.js 的旁白和 data.js 的抉擇，沒有另外寫劇情。
   網址是 #story/c3 或 #story/c3/2（從第二張底片開始），所以可以分享，也能用上一頁離開。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, CH, chOf, chIx, Plates, pad, toast, fmtDate } = A;
  const sy = () => K.bag('sy', { at: {}, done: {}, auto: false });
  const why = () => K.bag('fa', { why: {} }).why;
  const platesOf = c => c.shots.filter(s => s.cues && s.cues.length);
  /* 八個時刻各自落在哪一章的第幾張底片（資料裡記的是原始鏡頭的編號，要換成底片的編號） */
  const MOMENT = {}, AT = {};
  SC.forEach(s => { const c = chOf(s.ch); if (!c) return; const i = Math.max(0, c.shots.slice(0, s.shot + 1).filter(x => x.cues && x.cues.length).length - 1); MOMENT[s.ch + ':' + i] = s; AT[s.id] = i; });
  const HOLD = 750;
  /* 原生的 append 不會攤平陣列，也會把 null 印成字；這裡統一處理 */
  const put = (box, ...kids) => { kids.flat().forEach(k => { if (k) box.append(k); }); };

  let E = null, S = null;   // S：{ c, P, pi, li, phase, asked, type, autoT }
  const total = () => S.P.reduce((n, p) => n + p.cues.length, 0);
  const passed = () => S.P.slice(0, S.pi).reduce((n, p) => n + p.cues.length, 0) + Math.max(0, S.li + 1);
  const save = () => { if (S) { sy().at[S.c.id] = [S.pi, S.li]; saveSoon(); } };
  const saveSoon = K.debounce(() => Case.save(), 600);
  const hint = t => { if (E) E.hint.textContent = t; };
  const stopType = () => { if (S && S.type) { clearInterval(S.type.t); S.type = null; } };
  const stopAuto = () => { if (S) { clearTimeout(S.autoT); S.autoT = 0; } };

  /* 一句旁白：一個字一個字出來。打到一半再按一次，就整句出現 */
  function line(text) {
    stopType(); stopAuto();
    [...E.lines.children].forEach(p => p.classList.add('old'));
    const p = K.h('p'); E.lines.append(p);
    const done = () => { stopType(); p.textContent = text; if (A.Gloss) A.Gloss.linkAll([p]); hint(S.phase === 'lines' ? '點一下，或按空白鍵' : ''); if (sy().auto && S.phase === 'lines') S.autoT = setTimeout(next, (A.Reader ? A.Reader.cueSec(text) : 5) * 520 + 500); };
    if (K.rm()) { done(); return; }
    let i = 0; hint('');
    S.type = { done, t: setInterval(() => { i += 1; p.textContent = text.slice(0, i); if (i >= text.length) done(); }, 30) };
  }
  function plate(quiet) {
    const s = S.P[S.pi]; stopType(); stopAuto();
    Plates.mount(E.cv, s); E.lines.textContent = ''; E.act.textContent = ''; E.act.hidden = true;
    E.where.textContent = [s.loc, s.date].filter(Boolean).join('　');
    E.pos.textContent = 'PL. ' + pad(S.pi + 1) + ' ／ ' + pad(S.P.length);
    const rd = K.bag('rd', { seen: {}, umb: 0 }).seen; rd[S.c.id] = (rd[S.c.id] | 0) | (1 << S.pi);
    if (A.Game) A.Game.bump('plate');
    const stormy = s.p === 'storm' || !!s.storm;
    if (A.Snd) { A.Snd.setMood(stormy ? 1.9 : 1); if (!quiet) A.Snd.cue(stormy ? 'swell' : 'page'); }
    if (stormy && !quiet) A.veil(true);
    bar();
  }
  function bar() { E.fill.style.transform = 'scaleX(' + (S.phase === 'end' ? 1 : passed() / total()) + ')'; }

  function next() {
    if (!S) return;
    if (S.type) { S.type.done(); return; }
    stopAuto();
    if (S.phase === 'choice' || S.phase === 'end') return;                 // 這兩個地方要你自己動手
    if (S.phase === 'reveal') { S.phase = 'lines'; after(); return; }
    const s = S.P[S.pi];
    if (S.li < s.cues.length - 1) { S.li++; line(s.cues[S.li]); save(); bar(); return; }
    const m = MOMENT[S.c.id + ':' + S.pi];
    if (m && !S.asked[S.pi]) { S.asked[S.pi] = 1; ask(m); return; }
    after();
  }
  function after() { if (S.pi < S.P.length - 1) { S.pi++; S.li = -1; plate(); next(); } else finish(); }
  function prev() {
    if (!S || S.phase === 'choice') return; stopType(); stopAuto();
    S.phase = 'lines';
    if (S.li > 0) S.li--;
    else if (S.pi > 0) { S.pi--; S.asked[S.pi] = 1; S.li = S.P[S.pi].cues.length - 1; }   // 往回走不再問一次
    else return;
    plate(true);
    S.P[S.pi].cues.slice(0, S.li + 1).forEach(t => E.lines.append(K.h('p.old', { text: t })));
    if (A.Gloss) A.Gloss.linkAll([...E.lines.children]);
    const last = E.lines.lastElementChild; if (last) last.classList.remove('old');
    hint('點一下，或按空白鍵'); save(); bar();
  }

  /* 按住才算數的選項。鍵盤沒辦法「按住」得很自然，所以改成按兩次 */
  function holdBtn(tag, text, onDone) {
    const b = K.h('button.sty-opt', { type: 'button' }, K.h('i', { text: tag }), K.h('span', { text }), K.h('em.sty-fill', { 'aria-hidden': 'true' }));
    let t0 = 0, raf = 0, armed = false; const born = performance.now();
    const arm = () => { armed = true; b.classList.add('armed'); hint('再按一次 Enter，就定了。'); };
    const stop = () => { cancelAnimationFrame(raf); t0 = 0; b.style.setProperty('--p', '0'); b.classList.remove('holding'); };
    const tick = () => { const p = Math.min(1, (performance.now() - t0) / HOLD); b.style.setProperty('--p', String(p)); if (p >= 1) { stop(); onDone(); } else raf = requestAnimationFrame(tick); };
    b.addEventListener('pointerdown', e => { if (e.button || t0) return; t0 = performance.now(); b.classList.add('holding'); raf = requestAnimationFrame(tick); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(n => b.addEventListener(n, () => { if (!t0) return; stop(); hint('按住，別鬆手。'); }));
    b.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); e.stopPropagation(); if (e.repeat || performance.now() - born < 450) return; if (armed) onDone(); else arm(); });
    b.addEventListener('blur', () => { armed = false; b.classList.remove('armed'); });
    b.addEventListener('contextmenu', e => e.preventDefault());
    b._stop = stop; b._arm = arm;
    return b;
  }
  function ask(m) {
    S.phase = 'choice'; stopType(); stopAuto(); const had = Case.d.choices[m.id];
    [...E.lines.children].forEach(p => p.classList.add('old'));
    E.act.textContent = ''; E.act.hidden = false;
    const a = holdBtn('甲', m.a, () => decide(m, 'a')), b = holdBtn('乙', m.b, () => decide(m, 'b'));
    if (had) (had === 'a' ? a : b).classList.add('was');
    put(E.act, K.h('span.lab', { text: '這一刻，換你　' + m.when }), m.setup.map(t => K.h('p.sty-setup', { text: t })), K.h('div.sty-opts', a, b),
      had ? K.h('p.sty-note', { text: '上一次，你選了' + (had === 'a' ? '甲' : '乙') + '。這一次不必一樣。' }) : null);
    /* 不把焦點放到選項上：一路按空白鍵過來的人，會不小心替自己選了甲 */
    S.opts = [a, b]; hint('按住，直到它記下。鍵盤：1 或 2，再 Enter'); bar();
    E.stage.focus({ preventScroll: true }); E.stage.scrollTop = E.stage.scrollHeight;
  }
  function decide(m, pick) {
    if (!S || S.phase !== 'choice') return;
    [...E.act.querySelectorAll('.sty-opt')].forEach(b => b._stop && b._stop());
    Case.d.choices[m.id] = pick; Case.save(); A.emit('choice', { s: m, pick });
    S.phase = 'reveal'; if (A.Snd) A.Snd.cue('stamp'); if (m.canon && pick === m.canon) { /* 同一條路：不多做什麼 */ } else if (!K.rm()) A.veil();
    E.act.textContent = '';
    const same = m.canon ? (pick === m.canon ? '這一次，你和她走了同一條路。' : '這一次，你走了另一條路。') : '';
    const rv = K.h('p.sty-reveal', { text: m.reveal });
    const inp = K.h('input.inp', { type: 'text', maxlength: '60', placeholder: '為什麼。寫給自己看的，不寫也行', value: why()[m.id] || '', 'aria-label': '為什麼這樣選', autocomplete: 'off' });
    inp.addEventListener('input', () => { const v = inp.value.trim().slice(0, 60); if (v) why()[m.id] = v; else delete why()[m.id]; saveSoon(); });
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { inp.blur(); next(); } });
    const go = K.h('button.btn.sm', { type: 'button', text: '繼續 ›', onclick: e => { e.stopPropagation(); next(); } });
    put(E.act, K.h('span.lab', { text: '你選了' + (pick === 'a' ? '甲' : '乙') + '：' + (pick === 'a' ? m.a : m.b) }), K.h('span.lab', { text: m.canon ? '主線裡' : '沒有答案的一題' }), rv, same ? K.h('p.sty-same', { text: same }) : null, inp, K.h('div.save-row', go));
    if (A.Gloss) A.Gloss.linkAll([rv]);
    hint(''); setTimeout(() => go.focus({ preventScroll: true }), 60);
  }

  function finish() {
    S.phase = 'end'; stopType(); stopAuto(); const c = S.c, ix = chIx(c.id), b = sy(), first = !b.done[c.id];
    b.done[c.id] = b.done[c.id] || Date.now(); delete b.at[c.id]; Case.save();
    if (A.Game) { A.Game.bump('story'); if (first) A.Game.give({ xp: 50, dev: 60 }, '親歷　' + c.no); }
    A.emit('storyDone', { id: c.id, first });
    E.lines.textContent = ''; E.where.textContent = ''; E.act.textContent = ''; E.act.hidden = false; hint(''); bar();
    const mine = SC.filter(s => s.ch === c.id), rec = K.h('div.sty-rec');
    const paintRec = () => {
      rec.textContent = ''; const ts = Case.d.read[c.id];
      if (ts) rec.append(K.h('span.sty-stamp', { text: '已記錄　' + fmtDate(ts) }));
      else rec.append(K.h('button.btn.pri', { type: 'button', text: '蓋章：我走完了', onclick: () => { Case.d.read[c.id] = Date.now(); Case.save(); toast('戳記已收進手提箱'); A.emit('stamp', { id: c.id }); paintRec(); } }));
    };
    paintRec();
    const ta = K.h('textarea.field', { rows: '3', maxlength: '2000', placeholder: '這一章讓你想到什麼？寫在這裡，會收進手提箱。', 'aria-label': '你的手記', value: Case.d.notes[c.id] || '' });
    ta.addEventListener('input', () => { const v = ta.value.trim(); if (v) Case.d.notes[c.id] = ta.value.slice(0, 2000); else delete Case.d.notes[c.id]; saveSoon(); });
    ta.addEventListener('keydown', e => e.stopPropagation());
    const nav = K.h('div.save-row');
    if (ix < CH.length - 1) nav.append(K.h('a.btn.pri', { href: '#story/' + CH[ix + 1].id, text: '走下一章：' + CH[ix + 1].no + '〈' + CH[ix + 1].zh + '〉 ›' }));
    nav.append(K.h('a.btn', { href: '#' + c.id, text: '回展間' }), K.h('a.btn', { href: '#journal', text: '我的紀年' }), K.h('button.btn', { type: 'button', text: '從頭再走一次', onclick: () => open(c.id, 1) }));
    put(E.act, K.h('span.lab', { text: '這一章，走到底了' }), K.h('h3', { text: c.no + '〈' + c.zh + '〉' }), K.h('p.sty-setup', { text: c.epi }),
      K.h('dl.sty-sum', K.h('div', K.h('dt', { text: '舞台' }), K.h('dd', { text: c.meta })), K.h('div', K.h('dt', { text: '底片' }), K.h('dd', { text: S.P.length + ' 張' })),
        mine.map(s => { const p = Case.d.choices[s.id]; return K.h('div', K.h('dt', { text: '你的抉擇' }), K.h('dd', { text: p ? (p === 'a' ? s.a : s.b) + (s.canon ? (p === s.canon ? '（同一條路）' : '（另一條路）') : '') : '這一次沒有選' })); })),
      rec, ta, nav);
  }

  function backlog() {
    if (!S) return; stopAuto();
    K.dialog({ title: '回想　' + S.c.no + '〈' + S.c.zh + '〉', build(body) {
      const box = K.h('div.sty-log');
      S.P.slice(0, S.pi + 1).forEach((s, i) => {
        box.append(K.h('span.lab', { text: 'PL. ' + pad(i + 1) + '　' + [s.loc, s.date].filter(Boolean).join('　') }));
        s.cues.slice(0, i < S.pi || S.phase === 'end' ? s.cues.length : S.li + 1).forEach(t => box.append(K.h('p', { text: t })));
      });
      body.append(box); setTimeout(() => { body.parentNode.parentNode.scrollTop = 1e6; }, 40);
    } });
  }
  function setAuto(on) { sy().auto = !!on; saveSoon(); E.auto.setAttribute('aria-pressed', on ? 'true' : 'false'); E.auto.textContent = on ? '自動 開' : '自動'; stopAuto(); if (on && S && S.phase === 'lines' && !S.type) S.autoT = setTimeout(next, 900); }
  function close() { const id = S ? S.c.id : '', at = S ? S.pi + 1 : 1; location.hash = id ? '#' + id + '/' + at : '#chapters'; }

  function open(id, plateNo) {
    const c = chOf(id); if (!c) { location.replace('#chapters'); return; }
    const P = platesOf(c), b = sy(), saved = b.at[id];
    S = { c, P, pi: 0, li: -1, phase: 'lines', asked: {}, type: null, autoT: 0 };
    if (plateNo) S.pi = K.clamp(plateNo - 1, 0, P.length - 1);
    else if (saved && saved[0] < P.length) { S.pi = saved[0] | 0; S.li = K.clamp((saved[1] | 0) - 1, -1, P[S.pi].cues.length - 2); }
    E.ch.textContent = c.no + '　' + c.zh; E.auto.setAttribute('aria-pressed', b.auto ? 'true' : 'false'); E.auto.textContent = b.auto ? '自動 開' : '自動';
    document.documentElement.classList.add('sty-on');
    plate(true);
    if (S.li >= 0) { P[S.pi].cues.slice(0, S.li + 1).forEach(t => E.lines.append(K.h('p.old', { text: t }))); if (A.Gloss) A.Gloss.linkAll([...E.lines.children]); }
    next();
    setTimeout(() => { if (E.stage) E.stage.focus({ preventScroll: true }); }, 60);
  }
  function teardown() { stopType(); stopAuto(); S = null; document.documentElement.classList.remove('sty-on'); if (A.Snd) A.Snd.setMood(1); }

  function build() {
    E = {};
    E.cv = document.createElement('canvas'); E.cv.width = 960; E.cv.height = 600; E.cv.className = 'sty-cv'; E.cv.setAttribute('aria-hidden', 'true');
    E.ch = K.h('b'); E.pos = K.h('span.lab');
    E.auto = K.h('button.sty-b', { type: 'button', text: '自動', 'aria-pressed': 'false', onclick: e => { e.stopPropagation(); setAuto(!sy().auto); } });
    const top = K.h('header.sty-top', K.h('div', E.ch, E.pos), K.h('div.sty-tools', E.auto,
      K.h('button.sty-b', { type: 'button', text: '上一句', onclick: e => { e.stopPropagation(); prev(); } }),
      K.h('button.sty-b', { type: 'button', text: '回想', onclick: e => { e.stopPropagation(); backlog(); } }),
      K.h('button.sty-b', { type: 'button', text: '離開', 'aria-label': '離開親歷，回到展間', onclick: e => { e.stopPropagation(); close(); } })));
    E.where = K.h('div.sty-where'); E.lines = K.h('div.sty-lines', { 'aria-live': 'polite' }); E.act = K.h('div.sty-act', { hidden: true });
    E.stage = K.h('div.sty-stage', { tabindex: '-1' }, K.h('div.sty-text', E.where, E.lines, E.act));
    E.hint = K.h('span.sty-hint'); E.fill = K.h('i');
    const foot = K.h('footer.sty-foot', E.hint, K.h('div.sty-prog', { 'aria-hidden': 'true' }, E.fill));
    /* 點畫面任何地方都是「繼續」，但點到按鈕、輸入框、名詞就不算 */
    E.stage.addEventListener('click', e => { if (e.target.closest('button,a,input,textarea,.sty-act')) return; next(); });
    $('main').append(K.h('section.room.sty-room', { id: 'r-story', hidden: true, 'aria-label': '親歷模式' }, K.h('div.sty', E.cv, K.h('div.sty-shade', { 'aria-hidden': 'true' }), top, E.stage, foot)));
  }
  A.addRoom('story', 'r-story', arg => {
    if (!E) build();
    const m = /^(c\d+)(?:\/(\d+))?$/.exec(arg || ''); if (!m || !chOf(m[1])) { teardown(); location.replace('#chapters'); return; }
    open(m[1], m[2] ? +m[2] : 0);
  });
  A.on('ready', () => { if (!E) build(); });
  A.on('leave', n => { if (n === 'story') teardown(); });
  const on = (e, typing) => A.cur === 'story' && S && !typing && !K.dialogOpen() && !e.ctrlKey && !e.metaKey && !e.altKey;
  K.key((e, t) => on(e, t) && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') && !/^(BUTTON|A)$/.test(e.target.tagName), e => { e.preventDefault(); next(); });
  K.key((e, t) => on(e, t) && e.key === 'ArrowLeft', e => { e.preventDefault(); prev(); });
  K.key((e, t) => on(e, t) && S.phase === 'choice' && (e.key === '1' || e.key === '2') && S.opts, e => { const b = S.opts[+e.key - 1]; S.opts.forEach(x => { if (x !== b) x.blur(); }); b.focus({ preventScroll: true }); b._arm(); });
  K.key((e, t) => on(e, t) && (e.key === 'a' || e.key === 'A'), () => setAuto(!sy().auto));
  K.key((e, t) => on(e, t) && (e.key === 'l' || e.key === 'L'), () => backlog());
  K.key((e, t) => A.cur === 'story' && S && e.key === 'Escape' && !K.dialogOpen(), e => { e.preventDefault(); close(); });

  /* 展間：多一個入口；落著抉擇的那一張底片下面，提醒這裡可以親歷 */
  A.on('chapter', ({ id, c, box }) => {
    const head = box.querySelector('.ch-head'); if (!head || box.querySelector('.sty-enter')) return;
    const b = sy(), at = b.at[id], done = b.done[id];
    head.after(K.h('div.sty-enter', K.h('div', K.h('span.lab', { text: 'IN HER PLACE — 親歷' }), K.h('p', { text: '站到她站過的地方去。走到該選的那一刻，沒有人替你開口。' })),
      K.h('div.save-row', K.h('a.btn.pri', { href: '#story/' + id, text: at ? '從上次的地方繼續' : done ? '再走一次' : '親歷這一章' }), done ? K.h('span.lab', { text: '走過　' + fmtDate(done) }) : null)));
  });
  A.on('plate', ({ id, at, narr }) => {
    const m = MOMENT[id + ':' + at]; if (!m) return; const p = Case.d.choices[m.id];
    narr.append(K.h('div.sty-moment', K.h('span.lab', { text: '八個時刻之一　' + m.when }), K.h('p', { text: p ? '你在這裡選了：' + (p === 'a' ? m.a : m.b) + '。' : '這張底片上有一個時刻。還沒有人替你選。' }),
      K.h('a.lnk', { href: '#story/' + id + '/' + (at + 1), text: p ? '回到這一刻' : '站到這一刻去' })));
  });

  A.Story = { open, at: id => AT[id], moments: MOMENT, done: () => Object.keys(sy().done).length, doneAt: id => sy().done[id] || 0, why: id => why()[id] || '' };
})();
