'use strict';
/* ---------- 放映廳：把整部紀錄片在館內放出來 ----------
   片子不是影片檔，是一份腳本（FILM）加上即時繪製的底片。這裡把腳本攤成一條時間軸：
   幕卡、章名卡、片名卡，以及一句一句的旁白。每句旁白的長度依字數估算。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, Plates, pad, toast } = A;
  const fm = () => K.bag('fm', { pos: 0, fin: 0, done: {} });
  const cueSec = A.Reader.cueSec;

  /* ---- 時間軸 ---- */
  const SEG = [], ENT = [];
  FILM.forEach((e, ei) => {
    const ent = { ei, seg0: SEG.length };
    if (e.act) {
      ent.kind = 'act'; ent.id = 'act' + ei; ent.label = e.act.n; ent.zh = e.act.zh;
      SEG.push({ type: 'act', act: e.act, shot: { p: e.bg[0], a: e.bg[1] || {}, cues: [] }, dur: 7, ent });
    } else {
      ent.kind = /^c\d+$/.test(e.id) ? 'ch' : 'part'; ent.id = e.id; ent.label = e.no || ''; ent.zh = e.zh; ent.meta = e.meta || '';
      if (ent.kind === 'ch') SEG.push({ type: 'title', ch: e, shot: { p: e.bg[0], a: e.bg[1] || {}, cues: [] }, dur: 6.5, ent });
      e.shots.forEach((s, si) => {
        if (s.card || !s.cues.length) { SEG.push({ type: 'card', card: s.card || null, shot: s, dur: s.dur || 6, ent, si }); return; }
        const head = SEG.length; let sum = 0;
        s.cues.forEach((text, ci) => { const d = cueSec(text); sum += d; SEG.push({ type: 'cue', shot: s, ci, n: s.cues.length, text, dur: d, ent, si, head }); });
        if (s.min && sum < s.min) SEG[SEG.length - 1].dur += s.min - sum;
      });
    }
    ent.seg1 = SEG.length - 1; ENT.push(ent);
  });
  let TOTAL = 0;
  SEG.forEach((s, i) => { s.i = i; s.t0 = TOTAL; TOTAL += s.dur; });
  ENT.forEach(e => { e.t0 = SEG[e.seg0].t0; e.dur = SEG[e.seg1].t0 + SEG[e.seg1].dur - e.t0; });
  const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const entLabel = e => (e.label ? e.label + '　' : '') + e.zh;
  const segAt = t => { let lo = 0, hi = SEG.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (SEG[m].t0 <= t) lo = m; else hi = m - 1; } return lo; };

  /* ---- 狀態 ---- */
  let built = false, pos = 0, u = 0, playing = false, raf = 0, last = 0, shotNow = null, entNow = null, ended = false;
  let wake = null, idleT = 0, speaking = false, voice = null, saveT = 0;
  const E = {};
  const set = () => A.Settings.get();
  const synth = window.speechSynthesis || null;

  function paint() {
    const s = SEG[pos], cv = E.cv; if (!Plates.fit(cv)) return;
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, U = Math.sqrt(W * H) / 100;
    const t = s.type === 'cue' ? (s.t0 - SEG[s.head].t0) + u : u;
    const k = s.type === 'cue' ? Math.min(s.n - 0.001, s.ci + K.clamp(u / s.dur, 0, 0.999)) : 0;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.shadowBlur = 0; c.setLineDash([]);
    c.fillStyle = '#090d12'; c.fillRect(0, 0, W, H); c.save();
    try { (P[s.shot.p] || P.rain)(c, K.rm() ? 5 : t, W, H, U, s.shot.a || {}, k); } catch (e) { /* 單一畫面出錯不中斷放映 */ }
    c.restore(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.shadowBlur = 0; c.shadowColor = 'transparent'; c.setLineDash([]);
  }
  function crossfade() {
    const p = E.prev, cv = E.cv; if (K.rm() || !cv.width) return;
    try { p.width = cv.width; p.height = cv.height; p.getContext('2d').drawImage(cv, 0, 0); } catch (e) { return; }
    p.style.transition = 'none'; p.style.opacity = '1'; void p.offsetWidth; p.style.transition = 'opacity .9s ease'; p.style.opacity = '0';
  }

  function cardFill(s) {
    const box = E.card; box.textContent = ''; box.className = 'film-card ' + s.type;
    if (s.type === 'act') box.append(K.h('span.big', { text: s.act.n }), K.h('b', { text: s.act.zh }), K.h('span.en', { text: s.act.en }), K.h('p', { text: s.act.sub }));
    else if (s.type === 'title') box.append(K.h('span.kick', { text: s.ch.no + ' · ' + s.ch.meta }), K.h('b', { text: s.ch.zh }), K.h('span.en', { text: s.ch.en }), K.h('p', { text: s.ch.epi }));
    else if (s.card) box.append(K.h('span.kick', { text: s.card.no }), K.h('b', { text: s.card.zh }), K.h('span.en', { text: s.card.en }), K.h('p', { text: s.card.meta }), K.h('p.fine', { text: s.card.epi }));
    box.hidden = s.type === 'cue' || (s.type === 'card' && !s.card);
  }
  function overlays(s, quiet) {
    cardFill(s);
    const isCue = s.type === 'cue';
    E.sub.hidden = !isCue || !set().sub;
    if (isCue) { E.sub.textContent = ''; E.sub.append(K.h('span', { text: s.text })); }
    const sh = s.shot, where = isCue ? [sh.loc, sh.date].filter(Boolean).join('　') : '';
    E.loc.textContent = where; E.ch.textContent = s.ent.kind === 'act' ? '' : entLabel(s.ent);
    E.storm.hidden = !(isCue && sh.storm);
    if (isCue && sh.storm) { E.storm.textContent = sh.storm.n; E.storm.append(K.h('span', { text: sh.storm.span[0] + ' → ' + sh.storm.span[1] })); }
    if (s.ent !== entNow) { entNow = s.ent; listPaint(); scriptPaint(); }
    E.script.querySelectorAll('li').forEach(li => { const on = +li.dataset.i === s.i; li.setAttribute('aria-current', on ? 'true' : 'false'); if (on && playing && !quiet && !document.fullscreenElement) { const r = li.getBoundingClientRect(), b = E.script.getBoundingClientRect(); if (r.top < b.top || r.bottom > b.bottom) E.script.scrollTop += r.top - b.top - 40; } });
  }
  function go(i, uu, o) {
    o = o || {}; ended = false; E.end.hidden = true;
    const from = SEG[pos]; pos = K.clamp(i, 0, SEG.length - 1); u = uu || 0;
    const s = SEG[pos];
    if (s.shot !== shotNow) {
      if (shotNow && !o.cut) crossfade(); shotNow = s.shot;
      const stormy = s.shot.p === 'storm' || !!s.shot.storm;
      if (A.Snd) { A.Snd.setMood(stormy ? 1.9 : 1); if (stormy && playing) A.Snd.cue('swell'); }
    }
    if (o.natural && from && from.ent !== s.ent && from.ent.kind === 'ch') { fm().done[from.ent.id] = 1; }
    overlays(s); paint(); barPaint();
    if (playing) speak(s);
    clearTimeout(saveT); saveT = setTimeout(() => { fm().pos = pos; Case.save(); }, 600);
  }
  function finish() {
    const s = SEG[pos]; if (s.ent.kind === 'ch') fm().done[s.ent.id] = 1;
    pause(); ended = true; fm().fin = Date.now(); fm().pos = 0; Case.save();
    E.end.hidden = false; E.big.hidden = true; listPaint();
    A.emit('filmEnd');
  }

  /* ---- 播放 ---- */
  function frame(now) {
    if (!playing) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    u += dt * (+set().rate || 1);
    const s = SEG[pos], hold = speaking && u < s.dur * 2.4;
    if (u >= s.dur && !hold) { if (pos >= SEG.length - 1) { finish(); return; } go(pos + 1, 0, { natural: true }); return; }
    paint(); barPaint();
  }
  function play() {
    if (playing) return; if (ended) { go(0, 0, { cut: true }); }
    playing = true; last = performance.now(); E.big.hidden = true; E.stage.classList.add('playing'); E.pp.textContent = '暫停'; E.pp.setAttribute('aria-label', '暫停');
    speak(SEG[pos]); raf = requestAnimationFrame(frame); poke(); frameStage();
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { wake = w; }).catch(() => {}); } catch (e) { /* 沒有也沒關係 */ }
  }
  function pause() {
    if (!playing) return; playing = false; cancelAnimationFrame(raf); E.stage.classList.remove('playing', 'idle'); E.pp.textContent = '播放'; E.pp.setAttribute('aria-label', '播放');
    if (synth) { synth.cancel(); speaking = false; }
    if (wake) { try { wake.release(); } catch (e) { /* 忽略 */ } wake = null; }
    fm().pos = pos; Case.save(); bigPaint();
  }
  /* 開始放映時把銀幕和控制列一起捲進畫面 */
  function frameStage() {
    if (isFs()) return; const r = E.stage.getBoundingClientRect(), bar = document.querySelector('.bar'), top = bar ? bar.offsetHeight : 0;
    if (r.top >= top - 4 && r.bottom <= innerHeight + 4) return;
    window.scrollTo({ top: Math.max(0, scrollY + r.top - top), behavior: K.rm() ? 'auto' : 'smooth' });
  }
  const toggle = () => { if (playing) pause(); else play(); };
  function step(d) { const p = pos + d; if (p < 0 || p >= SEG.length) return; go(p, 0); if (!playing) bigPaint(); }
  function stepEnt(d) {
    const cur = SEG[pos].ent, i = ENT.indexOf(cur);
    if (d < 0 && (pos > cur.seg0 || u > 2)) { go(cur.seg0, 0, { cut: true }); return; }
    const n = ENT[K.clamp(i + d, 0, ENT.length - 1)]; go(n.seg0, 0, { cut: true });
  }
  function jump(id, autoplay) { const e = ENT.find(x => x.id === id); if (!e) return false; go(e.seg0, 0, { cut: true }); if (autoplay) play(); else bigPaint(); return true; }

  /* ---- 旁白朗讀（瀏覽器內建的語音；沒有中文語音就不顯示） ---- */
  function pickVoice() {
    if (!synth) return; const vs = synth.getVoices() || [];
    voice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh[-_]HK/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
    if (E.voice) E.voice.hidden = !voice;
  }
  function speak(s) {
    if (!synth || !voice || !set().voice || s.type !== 'cue') return;
    try { synth.cancel(); const ut = new SpeechSynthesisUtterance(s.text); ut.voice = voice; ut.lang = voice.lang; ut.rate = K.clamp((+set().rate || 1) * 0.98, 0.6, 1.8); speaking = true; ut.onend = ut.onerror = () => { speaking = false; }; synth.speak(ut); } catch (e) { speaking = false; }
  }

  /* ---- 介面 ---- */
  function barPaint() {
    const s = SEG[pos], t = s.t0 + Math.min(u, s.dur), p = t / TOTAL;
    E.fill.style.transform = 'scaleX(' + p + ')'; E.time.textContent = mmss(t) + ' ／ ' + mmss(TOTAL);
    E.bar.setAttribute('aria-valuenow', String(Math.round(t))); E.bar.setAttribute('aria-valuetext', mmss(t) + '，' + entLabel(s.ent));
  }
  function bigPaint() {
    if (playing || ended) { E.big.hidden = true; return; }
    E.big.hidden = false; const s = SEG[pos], started = pos > 0 || u > 0;
    E.big.textContent = ''; E.big.append(K.h('b', { text: started ? '繼續放映' : '開始放映' }), K.h('span', { text: started ? entLabel(s.ent) + '　' + mmss(s.t0) : '全長約 ' + Math.round(TOTAL / 60) + ' 分鐘' }));
  }
  function listPaint() {
    const done = fm().done; E.list.textContent = '';
    ENT.forEach(e => {
      if (e.kind === 'act') { E.list.append(K.h('li.act', K.h('span', { text: e.label }), K.h('b', { text: e.zh }))); return; }
      const on = e === entNow, b = K.h('button', { type: 'button', 'aria-current': on ? 'true' : 'false' });
      b.append(K.h('span.n', { text: e.label || '—' }), K.h('b', { text: e.zh }), K.h('span.s', { text: on ? '放映中' : done[e.id] ? '已放映' : '' }), K.h('span.t', { text: mmss(e.dur) }));
      b.onclick = () => { go(e.seg0, 0, { cut: true }); play(); E.stage.scrollIntoView({ block: 'nearest', behavior: K.rm() ? 'auto' : 'smooth' }); };
      E.list.append(K.h('li', b));
    });
  }
  function scriptPaint() {
    const e = entNow; E.script.textContent = ''; E.scriptH.textContent = e ? entLabel(e) : '';
    if (!e) return;
    for (let i = e.seg0; i <= e.seg1; i++) {
      const s = SEG[i]; if (s.type !== 'cue') continue;
      const li = K.h('li', { 'data-i': i, tabindex: '0', role: 'button', 'aria-current': 'false' }, K.h('span.t', { text: mmss(s.t0) }), K.h('p', { text: s.text }));
      const hit = () => { go(i, 0); if (!playing) bigPaint(); };
      li.onclick = hit; li.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); hit(); } };
      E.script.append(li);
    }
    if (!E.script.children.length) E.script.append(K.h('li.empty', { text: '這一段沒有旁白。' }));
  }
  function poke() { E.stage.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => { if (playing) E.stage.classList.add('idle'); }, 2600); }
  const isFs = () => document.fullscreenElement === E.stage || E.stage.classList.contains('fs');
  function fullscreen() {
    const st = E.stage;
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (st.classList.contains('fs')) { st.classList.remove('fs'); document.documentElement.classList.remove('film-fs'); return; }
    if (st.requestFullscreen) st.requestFullscreen().catch(() => { st.classList.add('fs'); document.documentElement.classList.add('film-fs'); });
    else { st.classList.add('fs'); document.documentElement.classList.add('film-fs'); }
  }
  function tog(btn, key, label) {
    const paintB = () => { btn.setAttribute('aria-pressed', set()[key] ? 'true' : 'false'); btn.textContent = label + (set()[key] ? ' 開' : ' 關'); };
    btn.onclick = () => { A.Settings.set(key, !set()[key]); paintB(); if (key === 'sub') overlays(SEG[pos], true); if (key === 'voice') { if (set().voice && playing) speak(SEG[pos]); else if (synth) { synth.cancel(); speaking = false; } } };
    paintB();
  }

  function build() {
    built = true;
    const sec = K.h('section.room.film', { id: 'r-film', hidden: true });
    const head = K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'Screening Room', text: '放映廳' }), K.h('p.sub', { text: '紀錄片《逆雨紀年》。畫面是即時繪製的底片，旁白一句一句浮現。可以暫停、跳到任何一章，或點逐字稿裡的一句話直接放到那裡。' })), K.h('div.no', { text: '10' })));
    E.cv = K.h('canvas', { id: 'film-cv', width: '1280', height: '720', 'aria-label': '放映中的底片' });
    E.prev = K.h('canvas.prev', { 'aria-hidden': 'true' });
    E.loc = K.h('span'); E.ch = K.h('span');
    E.card = K.h('div.film-card', { hidden: true });
    E.storm = K.h('div.film-storm', { hidden: true });
    E.sub = K.h('p.film-sub', { 'aria-live': 'polite', hidden: true });
    E.big = K.h('button.film-big', { type: 'button' });
    E.end = K.h('div.film-end', { hidden: true }, K.h('span.kick', { text: 'Fin' }), K.h('b', { text: '放映結束' }), K.h('p', { text: '雨還在往上落。有人撐著傘，繼續往回走。' }),
      K.h('div.cta', K.h('button.btn.inv.solid', { type: 'button', text: '從頭再放一次', onclick: () => { go(0, 0, { cut: true }); play(); } }), K.h('a.btn.inv', { href: '#chapters', text: '回章節檔案' }), K.h('a.btn.inv', { href: '#quiz', text: '去入館考核' })));
    const screen = K.h('div.film-screen', E.cv, E.prev, K.h('div.film-top', E.loc, E.ch), E.card, E.storm, E.sub, E.big, E.end);
    E.fill = K.h('i.fill');
    E.bar = K.h('div.film-bar', { role: 'slider', tabindex: '0', 'aria-label': '放映進度', 'aria-valuemin': '0', 'aria-valuemax': String(Math.round(TOTAL)), 'aria-valuenow': '0' }, E.fill);
    ENT.forEach(e => { if (e.t0 > 0) { const m = K.h('i.tk' + (e.kind === 'act' ? '.act' : '')); m.style.left = (e.t0 / TOTAL * 100) + '%'; E.bar.append(m); } });
    const B = (t, f, lab) => K.h('button.fbtn', { type: 'button', text: t, onclick: f, 'aria-label': lab || t });
    E.pp = B('播放', toggle); E.pp.classList.add('pp');
    E.time = K.h('span.time', { text: '0:00 ／ ' + mmss(TOTAL) });
    E.rate = B('1×', () => { const R = [0.75, 1, 1.25, 1.5], i = (R.indexOf(+set().rate || 1) + 1) % R.length; A.Settings.set('rate', R[i]); E.rate.textContent = R[i] + '×'; }, '播放速度');
    E.rate.textContent = (+set().rate || 1) + '×';
    E.subB = B('字幕', null); tog(E.subB, 'sub', '字幕');
    E.voice = B('朗讀', null); tog(E.voice, 'voice', '朗讀'); E.voice.hidden = true;
    E.fs = B('全螢幕', fullscreen);
    const row = K.h('div.film-row', B('上一段', () => stepEnt(-1)), B('上一句', () => step(-1)), E.pp, B('下一句', () => step(1)), B('下一段', () => stepEnt(1)), E.time, K.h('span.sp'), E.rate, E.subB, E.voice, E.fs);
    E.stage = K.h('div.film-stage', { id: 'film-stage' }, screen, K.h('div.film-ctl', E.bar, row));
    E.list = K.h('ol.film-list'); E.script = K.h('ol.film-script'); E.scriptH = K.h('b');
    const below = K.h('div.wrap.film-below',
      K.h('div', K.h('div.film-h', K.h('h3', { text: '場次' }), K.h('span.lab', { text: '全長 ' + mmss(TOTAL) })), E.list),
      K.h('div', K.h('div.film-h', K.h('h3', { text: '逐字稿' }), E.scriptH), E.script,
        K.h('p.hint', { text: '點任何一句，就從那裡放起。' + (typeof FILM_URL === 'string' && FILM_URL ? '　' : '') }, typeof FILM_URL === 'string' && FILM_URL ? K.h('a.lnk', { href: FILM_URL, target: '_blank', rel: 'noopener', text: '另開原版紀錄片' }) : null)));
    sec.append(head, E.stage, below); $('main').append(sec);

    /* 操作 */
    E.big.onclick = play;
    E.cv.addEventListener('click', () => { if (isFs() && E.stage.classList.contains('idle')) { poke(); return; } toggle(); });
    K.swipe(screen, d => step(d));
    const seek = e => { const r = E.bar.getBoundingClientRect(), t = K.clamp((e.clientX - r.left) / r.width, 0, 0.9999) * TOTAL, i = segAt(t); go(i, t - SEG[i].t0, { cut: true }); if (!playing) bigPaint(); };
    let drag = false;
    E.bar.addEventListener('pointerdown', e => { drag = true; try { E.bar.setPointerCapture(e.pointerId); } catch (x) { /* 忽略 */ } seek(e); });
    E.bar.addEventListener('pointermove', e => { if (drag) seek(e); });
    E.bar.addEventListener('pointerup', () => { drag = false; }); E.bar.addEventListener('pointercancel', () => { drag = false; });
    E.bar.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); step(-1); } });
    E.stage.addEventListener('pointermove', poke); E.stage.addEventListener('pointerdown', poke);
    document.addEventListener('fullscreenchange', () => { E.fs.textContent = document.fullscreenElement ? '離開全螢幕' : '全螢幕'; requestAnimationFrame(paint); });
    window.addEventListener('resize', () => { if (A.cur === 'film') requestAnimationFrame(paint); });
    if (synth) { pickVoice(); try { synth.addEventListener('voiceschanged', pickVoice); } catch (e) { /* 舊瀏覽器 */ } }
  }

  A.addRoom('film', 'r-film', function (arg) {
    const first = !built; if (first) build();
    document.getElementById('r-film').hidden = false;
    pos = K.clamp(fm().pos | 0, 0, SEG.length - 1); u = 0; shotNow = null; entNow = null;
    if (arg && jump(arg, true)) return;
    go(pos, 0, { cut: true }); bigPaint();
  });
  /* 第一次進來時房間還沒建好：路由要先找得到 section。 */
  A.on('ready', () => { if (!built) build(); });
  A.on('leave', n => { if (n === 'film') { pause(); if (A.Snd) A.Snd.setMood(1); if (E.stage) { E.stage.classList.remove('fs'); document.documentElement.classList.remove('film-fs'); } if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing && synth) { synth.cancel(); speaking = false; } });
  A.on('status', o => { if (o.id === 'film') { const f = fm(); o.s = f.fin ? '已看完' : f.pos > 0 ? '放映到 ' + mmss(SEG[K.clamp(f.pos, 0, SEG.length - 1)].t0) : ''; } });

  const inFilm = (e, typing) => !typing && A.cur === 'film' && !e.ctrlKey && !e.metaKey && !e.altKey && !K.dialogOpen();
  K.key((e, t) => inFilm(e, t) && (e.key === ' ' || e.key === 'k' || e.key === 'K') && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A', e => { e.preventDefault(); toggle(); });
  K.key((e, t) => inFilm(e, t) && e.key === 'ArrowRight', e => { e.preventDefault(); step(1); });
  K.key((e, t) => inFilm(e, t) && e.key === 'ArrowLeft', e => { e.preventDefault(); step(-1); });
  K.key((e, t) => inFilm(e, t) && e.key === ']', () => stepEnt(1));
  K.key((e, t) => inFilm(e, t) && e.key === '[', () => stepEnt(-1));
  K.key((e, t) => inFilm(e, t) && (e.key === 'f' || e.key === 'F'), () => fullscreen());

  A.Cinema = {
    total: TOTAL, segs: SEG.length,
    where(p) { const s = SEG[K.clamp(p | 0, 0, SEG.length - 1)]; return { label: entLabel(s.ent) + '　' + mmss(s.t0), shot: s.shot }; },
    get playing() { return playing; }, play, pause
  };
})();
