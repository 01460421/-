'use strict';
/* ---------- 導覽：第一次來的人，跟著走八站 ----------
   館裡有二十個房間，第一次進來的人不知道從哪裡看起。這裡做三件事：
     入館　　全新的訪客在大廳會先看到三張卡：開場、留名字、要不要人帶路
     導覽條　畫面底下一條，寫著下一站在哪裡、到了要做什麼；做到了自己會往下一站
     導覽頁（#guide）　整條路線，加上一張照用途分區的平面圖
   每一站「到了沒」都是看手提箱裡現有的紀錄，所以順序可以亂走，舊訪客進來也不會被要求重做。
   導覽可以收起、可以略過某一站、可以整個關掉；它不擋任何房間。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, Plates, pad, toast } = A, G = A.Game;
  const gd = () => K.bag('gd', { intro: 0, on: true, fold: false, opt: false, skip: {}, got: {}, fin: 0, seen: {} });
  const cnt = o => Object.keys(o || {}).length;
  const STOP_PAY = 30, FIN_PAY = 300;

  /* 八站。done 看的是紀錄，不是「有沒有照導覽走」 */
  const STOPS = [
    { id: 'c0', to: 'story/c0', rooms: ['story', 'c0'], t: '序幕', line: '從序幕讀起。一九六六年，英格蘭外海，一艘不該播音的船。', tip: '點畫面，一句一句往下。走到第三張底片，故事會停下來等你。',
      done: () => !!(A.Story && A.Story.doneAt('c0')) || !!Case.d.read.c0 || !!(A.Reader && A.Reader.seenN('c0') >= 4) },
    { id: 'stamp', to: 'c0', rooms: ['c0', 'story'], t: '第一枚戳記', line: '讀完的章節，蓋一枚戳記。箱子會替你記得。', tip: '往下找「蓋章：我讀完了」。', done: () => cnt(Case.d.read) >= 1 },
    { id: 'storm', to: 'chronicle', rooms: ['chronicle'], t: '暴雨年表', line: '十一場雨。看日曆是怎麼一次一次被帶回去的。', tip: '按「下一場雨」，或左右鍵。走過兩場就夠。', done: () => G.stat('era') >= 2 },
    { id: 'choice', to: 'choices', rooms: ['choices'], t: '司辰的抉擇', line: '八個時刻。她選過了，現在換你。', tip: '選一個，看主線裡發生了什麼。選滿兩個就夠，其餘隨你。', done: () => cnt(Case.d.choices) >= 2 },
    { id: 'film', to: 'film', rooms: ['film'], t: '放映廳', line: '燈暗之後是二十七分鐘。不必一次看完。', tip: '按「開始放映」，坐上半分鐘。', done: () => G.stat('filmSec') >= 30 || !!K.bag('fm', { fin: 0 }).fin },
    { id: 'rain', to: 'rain', rooms: ['rain'], t: '你的暴雨', line: '寫下生日。雨在某一年等你。', tip: '名字、生日，和一樣想留下的東西。然後讓雨落下。', done: () => !!Case.d.mine },
    { id: 'duty', to: 'play', rooms: ['play', 'darkroom'], t: '值勤台', line: '桌上有一只寫著你名字的紙盒。拆了，去暗房沖第一張底片。', tip: () => !G.gm().gift ? '先拆開那只紙盒。' : '暗房在第二格。沖一張就好。', done: () => !!G.gm().gift && !!A.Dark && A.Dark.bag().n >= 1 },
    { id: 'case', to: 'case', rooms: ['case'], t: '手提箱', line: '最後看一眼箱子。你留下的都在裡面，雨帶不走。', tip: '戳記、抉擇、徽記都在這一頁。換裝置的時候，用雲端同步把箱子帶走。', done: () => !!gd().seen._case }
  ];
  /* 平面圖：照「來這裡做什麼」分區 */
  const MAP = [
    ['讀', 'Read', [['chronicle', '暴雨年表', '十一場雨，排在同一條線上'], ['chapters', '章節檔案', '十四間展間，從序幕到第十三章'], ['film', '放映廳', '二十七分鐘。燈暗了就開始'], ['index', '名詞索引', '看不懂的詞，先來這裡查'], ['questions', '未解之謎', '主線沒有回答的，館裡也不替它答']]],
    ['選', 'Choose', [['story/c0', '親歷', '站到她站過的地方去'], ['choices', '司辰的抉擇', '八個時刻。她選過了，換你'], ['rain', '你的暴雨', '寫下生日，雨在某一年等你'], ['quiz', '入館考核', '十題。答錯的，底片都還在']]],
    ['寫', 'Write', [['relay', '接龍', '前一個人停在哪裡，你就從哪裡接'], ['studio', '創作坊', '挑一張底片，替它寫一行字']]],
    ['值勤', 'On Duty', [['play', '值勤台', '今天的差事都在這張桌上'], ['quests', '委託', '單子釘在板上'], ['darkroom', '暗房', '相紙下水，影像自己浮上來'], ['album', '底片冊', '七十八格，空著的還沒還回來'], ['arcade', '遊藝室', '值勤的空檔，四張桌子'], ['shop', '交換所', '碎片換顏料，也換頭銜']]],
    ['你的', 'Yours', [['case', '手提箱', '你留下的都在裡面，雨帶不走'], ['profile', '記錄員檔案', '館方替你建的那一份'], ['journal', '我的紀年', '她的那一份在放映廳，這一份是你的']]]
  ];
  const isDone = s => { try { return !!s.done(); } catch (e) { return false; } };
  const state = s => gd().got[s.id] ? 'got' : gd().skip[s.id] ? 'skip' : 'todo';
  const at = () => STOPS.findIndex(s => state(s) === 'todo');
  const left = () => STOPS.filter(s => state(s) === 'todo').length;
  const tipOf = s => typeof s.tip === 'function' ? s.tip() : s.tip;
  const inRoom = s => s.rooms.indexOf(A.cur) >= 0;

  /* 對一次帳。quiet：開機時把以前就做過的記上，不發東西、不出聲 */
  function sync(quiet) {
    const b = gd(); let changed = false;
    STOPS.forEach((s, i) => {
      if (b.got[s.id] || !isDone(s)) return;
      b.got[s.id] = Date.now(); delete b.skip[s.id]; changed = true;
      /* 只有說過「帶路」的人才發東西、才出聲；沒叫導覽的人，默默記上就好 */
      if (!quiet && b.on && b.opt) { G.give({ dev: STOP_PAY, xp: 15 }, '導覽　第 ' + (i + 1) + ' 站，記下了'); if (A.Snd) A.Snd.cue('stamp'); }
    });
    if (at() < 0 && !b.fin) {
      b.fin = Date.now(); changed = true;
      if (!quiet && b.on && b.opt) { G.give({ dev: FIN_PAY, xp: 60 }, '八站走完了'); if (A.Snd) A.Snd.cue('chime'); }
      if (quiet || !b.opt) b.fold = true;
    }
    if (changed) Case.save();
    paintBar(); if (A.cur === 'guide') paint(); if (A.cur === 'hall') hall();
    return changed;
  }
  /* 存檔的事件很密，用「每次都往後延」的方式會一直等不到；改成最多隔一下就對一次 */
  let pend = 0;
  const syncSoon = () => { if (pend) return; pend = setTimeout(() => { pend = 0; sync(false); }, 350); };

  /* ---- 導覽條 ---- */
  let bar = null, fab = null;
  function paintBar() {
    if (!bar) return; const b = gd(), i = at(), hide = !b.on || A.cur === 'story' || A.cur === 'guide' || (A.cur === 'arcade' && !!arg) || introOpen;
    const open = !hide && !b.fold;
    bar.hidden = !open; fab.hidden = hide || !b.fold || (b.fin && i < 0);
    document.documentElement.classList.toggle('gd-open', open);
    if (hide) return;
    fab.textContent = i < 0 ? '導覽' : '導覽　' + (STOPS.length - left()) + '／' + STOPS.length;
    if (!open) return;
    bar.textContent = '';
    const fold = K.h('button.gd-x', { type: 'button', text: '收起', 'aria-label': '收起導覽', onclick: () => { gd().fold = true; Case.save(); paintBar(); } });
    if (i < 0) {
      bar.append(K.h('span.gd-n', { text: '導覽' }), K.h('div.gd-tx', K.h('b', { text: '八站走完了' }), K.h('span', { text: '剩下的房間，自便。平面圖留在導覽頁。' })), K.h('a.btn.sm.pri', { href: '#guide', text: '看平面圖' }), fold);
      return;
    }
    const s = STOPS[i], here = inRoom(s);
    bar.append(K.h('span.gd-n', { text: '第 ' + (i + 1) + ' 站／' + STOPS.length }), K.h('div.gd-tx', K.h('b', { text: s.t }), K.h('span', { text: here ? tipOf(s) : s.line })));
    if (!here) bar.append(K.h('a.btn.sm.pri', { href: '#' + s.to, text: '前往 ›' }));
    bar.append(K.h('button.tiny', { type: 'button', text: '略過', onclick: () => { gd().skip[s.id] = 1; Case.save(); sync(false); } }), fold);
  }

  /* ---- 入館：全新的訪客在大廳看到的三張卡 ---- */
  let introOpen = false;
  function intro() {
    if (introOpen) return; introOpen = true; paintBar();
    const cv = document.createElement('canvas'); cv.width = 960; cv.height = 600; cv.setAttribute('aria-hidden', 'true');
    const card = K.h('div.gd-card', { 'aria-live': 'polite' }), root = K.h('div.gd-intro', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '入館' }, cv, K.h('div.gd-shade', { 'aria-hidden': 'true' }), card);
    const prev = document.activeElement;
    const close = follow => {
      if (!introOpen) return; introOpen = false; const b = gd(); b.intro = Date.now(); b.on = true; b.fold = !follow; if (follow) b.opt = true; Case.save();
      root.remove(); document.documentElement.classList.remove('gd-intro-on'); document.removeEventListener('keydown', onKey, true);
      if (!follow) toast('導覽收在左下角。想走的時候再叫它。');
      sync(true); paintBar(); if (A.cur === 'hall') hall(); if (prev && prev.focus) try { prev.focus(); } catch (e) { /* 忽略 */ }
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
    const show = (kids, focusSel) => { card.textContent = ''; kids.flat().forEach(k => { if (k) card.append(k); }); const f = card.querySelector(focusSel || 'button'); setTimeout(() => { if (f) f.focus({ preventScroll: true }); }, 60); };
    const skip = () => K.h('button.tiny.gd-skip', { type: 'button', text: '略過', onclick: () => close(false) });
    const three = () => show([K.h('span.lab', { text: '入館　三之三' }), K.h('h2', { text: '館很大。' }), K.h('p', { text: '第一次來，跟著走八站，約莫一刻鐘。來過的，自便。' }),
      K.h('div.save-row', K.h('button.btn.pri', { type: 'button', text: '帶路', onclick: () => close(true) }), K.h('button.btn', { type: 'button', text: '我自己逛', onclick: () => close(false) }))]);
    const two = () => {
      const inp = K.h('input.inp', { type: 'text', maxlength: '16', placeholder: '記錄員的名字', autocomplete: 'off', value: Case.d.name || '', 'aria-label': '你的名字' });
      const go = () => { Case.d.name = inp.value.trim().slice(0, 16); Case.save(); three(); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      show([K.h('span.lab', { text: '入館　三之二' }), K.h('h2', { text: '新到任的記錄員，先留個名字。' }), K.h('p', { text: '館方只把它寫在你的箱子上。' }), inp,
        K.h('div.save-row', K.h('button.btn.pri', { type: 'button', text: '就這個名字', onclick: go }), K.h('button.btn', { type: 'button', text: '先不留', onclick: three })), skip()], 'input');
    };
    show([K.h('span.lab', { text: '一九九九・十二・三十一' }), K.h('h2', { text: '雨從地面升起。' }), K.h('p', { text: '日曆往回翻。被帶走的東西，有一部分收在這裡。' }),
      K.h('div.save-row', K.h('button.btn.pri', { type: 'button', text: '進館', onclick: two })), skip()]);
    document.body.append(root); document.documentElement.classList.add('gd-intro-on'); document.addEventListener('keydown', onKey, true);
    Plates.mount(cv, { p: 'rain', a: { big: '1999', peel: 1 }, cues: [] }, 40);
  }
  const fresh = () => { const d = Case.d, b = gd(); return !b.intro && d.visits <= 1 && !cnt(d.read) && !cnt(d.choices) && !d.mine && !G.gm().gift; };

  /* ---- 大廳：還沒走完的人，今日底片上面多一塊「下一站」 ---- */
  let hallEl = null;
  function hall() {
    const t = document.querySelector('#r-hall .today'); if (!t) return; const b = gd(), i = at();
    if (!b.on || i < 0) { if (hallEl) { hallEl.remove(); hallEl = null; } return; }
    if (!hallEl) { hallEl = K.h('div.gd-hall'); t.before(hallEl); }
    const s = STOPS[i]; hallEl.textContent = '';
    hallEl.append(K.h('div', K.h('span.lab', { text: '導覽　第 ' + (i + 1) + ' 站／' + STOPS.length }), K.h('b', { text: s.t }), K.h('p', { text: s.line })),
      K.h('div.save-row', K.h('a.btn.pri', { href: '#' + s.to, text: '前往 ›' }), K.h('a.tiny', { href: '#guide', text: '看整條路線' })));
  }

  /* ---- 導覽頁 ---- */
  let box = null, built = false;
  function paint() {
    if (!box) return; const b = gd(), i = at(); box.textContent = '';
    const ctl = K.h('div.save-row');
    if (b.on) ctl.append(K.h('button.btn', { type: 'button', text: '把導覽關掉', onclick: () => { gd().on = false; Case.save(); paint(); paintBar(); } }));
    else ctl.append(K.h('button.btn.pri', { type: 'button', text: '把導覽打開', onclick: () => { const x = gd(); x.on = true; x.fold = false; x.opt = true; Case.save(); paint(); paintBar(); } }));
    ctl.append(K.h('button.btn', { type: 'button', text: '從第一站重走', onclick: () => { const x = gd(); x.got = {}; x.skip = {}; x.fin = 0; x.seen._case = 0; x.on = true; x.fold = false; x.opt = true; Case.save(); sync(true); paint(); } }));
    box.append(K.h('div.gd-top', K.h('p', { text: i < 0 ? '八站都到過了。底下的平面圖，照你來這裡想做的事分了區。' : '還有 ' + left() + ' 站。順序不拘；到過的，館方自己會記上。' }), ctl));
    const ol = K.h('ol.gd-route');
    STOPS.forEach((s, k) => { const st = state(s), cur = k === i;
      ol.append(K.h('li.is-' + st + (cur ? '.cur' : ''), K.h('span.n', { text: pad(k + 1) }), K.h('div', K.h('b', { text: s.t }), K.h('p', { text: s.line })),
        st === 'got' ? K.h('span.gd-st', { text: '到過' }) : K.h('a.btn.sm' + (cur ? '.pri' : ''), { href: '#' + s.to, text: st === 'skip' ? '補走' : '前往' }))); });
    box.append(K.h('section.gd-sec', K.h('div.q-h', K.h('h3', { text: '路線' }), K.h('span.lab', { text: '八站，約莫一刻鐘' })), ol));
    const map = K.h('div.gd-map');
    MAP.forEach(g => map.append(K.h('div.gd-zone', K.h('div.gd-zh', K.h('b', { text: g[0] }), K.h('span.lab', { text: g[1] })), K.h('ul', g[2].map(r => { const key = r[0].split('/')[0]; return K.h('li' + (b.seen[key] ? '.seen' : ''), K.h('a', { href: '#' + r[0] }, K.h('b', { text: r[1] }), K.h('span', { text: r[2] })), b.seen[key] ? K.h('i', { text: '到過', 'aria-label': '到過' }) : null); })))));
    box.append(K.h('section.gd-sec', K.h('div.q-h', K.h('h3', { text: '平面圖' }), K.h('span.lab', { text: '照你來這裡想做的事分區' })), map));
  }
  function build() {
    built = true; box = K.h('div.gdp', { id: 'guide-box' });
    $('main').append(K.h('section.room', { id: 'r-guide', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'The Tour', text: '導覽' }), K.h('p.sub', { text: '第一次來，跟著走。來過的，這裡有平面圖。' })), K.h('div.no', { text: '00' })), box)));
    bar = K.h('div.gd-bar', { hidden: true, role: 'region', 'aria-label': '導覽' });
    fab = K.h('button.gd-fab', { type: 'button', hidden: true, onclick: () => { const x = gd(); x.fold = false; x.opt = true; Case.save(); paintBar(); } });
    document.body.append(bar, fab);
  }
  A.ROOMS.unshift(['guide', '導覽', '第一次來，跟著走八站。來過的，這裡有平面圖。']);
  A.addRoom('guide', 'r-guide', () => { if (!built) build(); sync(true); paint(); });
  A.on('ready', () => { if (!built) build(); sync(true); });
  let first = true, arg = '';
  A.on('route', ({ name, arg: a }) => {
    arg = a || '';
    /* 開機後的第一個房間決定要不要演入館：全新的訪客、而且是從大廳進來的才演。
       拿著別人給的連結直接進某個房間的人，不擋他，導覽先收在角落 */
    if (first) { first = false; if (!gd().intro) { if (fresh() && name === 'hall') intro(); else { gd().intro = Date.now(); gd().fold = true; } } }
    const b = gd(), key = /^c\d+$/.test(name) ? 'chapters' : name; if (!b.seen[key]) { b.seen[key] = 1; }
    if (name === 'case' && at() >= 0 && STOPS[at()].id === 'case') b.seen._case = 1;
    if (introOpen && name !== 'hall') { const el = document.querySelector('.gd-intro .gd-skip'); if (el) el.click(); }
    syncSoon(); paintBar();
  });
  A.on('hall', hall);
  ['save', 'gstat', 'gain', 'stamp', 'choice', 'storyDone', 'pulled', 'mine', 'filmEnd', 'import', 'wipe'].forEach(e => A.on(e, syncSoon));
  A.on('status', o => { if (o.id === 'guide') { const n = left(); o.s = gd().fin ? '走完了' : n < STOPS.length ? '還有 ' + n + ' 站' : ''; } });

  A.Guide = { at, left, sync, intro, stops: STOPS.length };
})();
