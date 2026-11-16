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
    { id: 'c0', to: 'story/c0', rooms: ['story', 'c0'], t: '序幕', line: '先從序幕讀起。故事從一九六六年、英格蘭外海的一艘船開始。', tip: '點一下畫面或按空白鍵，旁白會一句一句往下走。到第三張底片時，故事會停下來讓你做一次選擇。',
      done: () => !!(A.Story && A.Story.doneAt('c0')) || !!Case.d.read.c0 || !!(A.Reader && A.Reader.seenN('c0') >= 4) },
    { id: 'stamp', to: 'c0', rooms: ['c0', 'story'], t: '第一枚戳記', line: '讀完一章，可以替它蓋一枚戳記。手提箱會記下你讀過哪些章節。', tip: '捲到這一章的最下面，按「蓋章：我讀完了」。', done: () => cnt(Case.d.read) >= 1 },
    { id: 'storm', to: 'chronicle', rooms: ['chronicle'], t: '暴雨年表', line: '十一場雨排成一條線，看日曆怎麼折返。', tip: '按「下一場雨」或左右鍵，可以一場一場看。看過兩場就算到站。', done: () => G.stat('era') >= 2 },
    { id: 'choice', to: 'choices', rooms: ['choices'], t: '司辰的抉擇', line: '八個時刻，換你站在她的位置。選完會揭曉主線裡發生的事。', tip: '選一個選項，就會揭曉主線裡發生的事。選過兩個時刻就算到站，其餘的可以之後再回來。', done: () => cnt(Case.d.choices) >= 2 },
    { id: 'film', to: 'film', rooms: ['film'], t: '放映廳', line: '紀錄片《逆雨紀年》，全長二十七分鐘。可以隨時暫停，不必一次看完。', tip: '按「開始放映」，看滿半分鐘就算到站。', done: () => G.stat('filmSec') >= 30 || !!K.bag('fm', { fin: 0 }).fin },
    { id: 'rain', to: 'rain', rooms: ['rain'], t: '你的暴雨', line: '寫下名字和生日，選一樣想留下的東西，走一遍屬於你的那場雨。', tip: '填好名字和生日，選一樣想留下的東西，再按「讓雨落下」。', done: () => !!Case.d.mine },
    { id: 'duty', to: 'play', rooms: ['play', 'darkroom'], t: '值勤台', line: '值勤台有一份到職禮可以領。領了之後，到暗房沖洗第一張底片。', tip: () => !G.gm().gift ? '先按「領取到職禮」。' : '接著從值勤台進暗房，沖洗一張底片就算到站。', done: () => !!G.gm().gift && !!A.Dark && A.Dark.bag().n >= 1 },
    { id: 'case', to: 'case', rooms: ['case'], t: '手提箱', line: '最後看看手提箱。你留下的戳記、手記和抉擇都收在這裡。', tip: '戳記、抉擇、徽記都在這一頁。要換裝置時，可以用雲端同步把手提箱帶過去。', done: () => !!gd().seen._case }
  ];
  /* 平面圖：照「來這裡做什麼」分區 */
  const MAP = [
    ['讀', 'Read', [['chronicle', '暴雨年表', '十一場雨排成一條線，看日曆怎麼折返'], ['chapters', '章節檔案', '序幕至第十三章，十四間展間的底片與說明'], ['film', '放映廳', '紀錄片《逆雨紀年》，從片頭放到尾聲'], ['index', '名詞索引', '八十五個詞：術語、組織、人物、地點'], ['questions', '未解之謎', '十二個主線還沒回答的問題']]],
    ['選', 'Choose', [['story/c0', '親歷', '用第一人稱把章節走一遍，到了抉擇的時刻由你來選'], ['choices', '司辰的抉擇', '八個時刻，換你站在她的位置'], ['rain', '你的暴雨', '寫下名字和生日，走一遍屬於你的那場雨'], ['quiz', '入館考核', '十道題，考你還記得多少']]],
    ['寫', 'Write', [['relay', '接龍', '接著上一位司辰的段落往下寫'], ['studio', '創作坊', '題寫底片，為自創的人物立檔案卡']]],
    ['值勤', 'On Duty', [['play', '值勤台', '委託、暗房、底片冊、遊藝室的入口'], ['quests', '委託', '每日、每週、長期的委託，還有簽到'], ['darkroom', '暗房', '用顯影劑沖洗底片，收進底片冊'], ['album', '底片冊', '沖洗出來的底片收在這裡，照章節排'], ['arcade', '遊藝室', '四個小遊戲：排年代、翻底片、收進手提箱、數字之島'], ['shop', '交換所', '用碎片換主題色和稱號']]],
    ['你的', 'Yours', [['case', '手提箱', '你留下的戳記、手記、抉擇與作品'], ['profile', '記錄員檔案', '等級、稱號，和到任以來的紀錄'], ['journal', '我的紀年', '你留下的戳記、抉擇與手記，照章節排成一份紀錄']]]
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
      if (!quiet && b.on && b.opt) { G.give({ dev: STOP_PAY, xp: 15 }, '導覽　第 ' + (i + 1) + ' 站完成'); if (A.Snd) A.Snd.cue('stamp'); }
    });
    if (at() < 0 && !b.fin) {
      b.fin = Date.now(); changed = true;
      if (!quiet && b.on && b.opt) { G.give({ dev: FIN_PAY, xp: 60 }, '導覽的八站都走完了'); if (A.Snd) A.Snd.cue('chime'); }
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
      bar.append(K.h('span.gd-n', { text: '導覽' }), K.h('div.gd-tx', K.h('b', { text: '八站都走完了' }), K.h('span', { text: '其他房間可以自由參觀。導覽頁有全館的平面圖。' })), K.h('a.btn.sm.pri', { href: '#guide', text: '看平面圖' }), fold);
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
      if (!follow) toast('導覽收在左下角，需要的時候可以再點開。');
      sync(true); paintBar(); if (A.cur === 'hall') hall(); if (prev && prev.focus) try { prev.focus(); } catch (e) { /* 忽略 */ }
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
    const show = (kids, focusSel) => { card.textContent = ''; kids.flat().forEach(k => { if (k) card.append(k); }); const f = card.querySelector(focusSel || 'button'); setTimeout(() => { if (f) f.focus({ preventScroll: true }); }, 60); };
    const skip = () => K.h('button.tiny.gd-skip', { type: 'button', text: '略過', onclick: () => close(false) });
    const three = () => show([K.h('span.lab', { text: '入館　3／3' }), K.h('h2', { text: '要不要跟著導覽走？' }), K.h('p', { text: '館裡有二十個房間。第一次來，可以跟著導覽走八站，大約十五分鐘；也可以自己逛，之後隨時能再打開導覽。' }),
      K.h('div.save-row', K.h('button.btn.pri', { type: 'button', text: '跟著導覽走', onclick: () => close(true) }), K.h('button.btn', { type: 'button', text: '我自己逛', onclick: () => close(false) }))]);
    const two = () => {
      const inp = K.h('input.inp', { type: 'text', maxlength: '16', placeholder: '記錄員的名字', autocomplete: 'off', value: Case.d.name || '', 'aria-label': '你的名字' });
      const go = () => { Case.d.name = inp.value.trim().slice(0, 16); Case.save(); three(); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      show([K.h('span.lab', { text: '入館　2／3' }), K.h('h2', { text: '先留一個名字' }), K.h('p', { text: '這個名字會寫在你的手提箱上；在接龍或展牆發表時，也會用它署名。之後可以在手提箱裡修改。' }), inp,
        K.h('div.save-row', K.h('button.btn.pri', { type: 'button', text: '確定', onclick: go }), K.h('button.btn', { type: 'button', text: '先不填', onclick: three })), skip()], 'input');
    };
    show([K.h('span.lab', { text: '入館　1／3' }), K.h('h2', { text: '逆雨檔案館' }), K.h('p', { text: '雨從地面升起，日曆往回翻。這裡收著十一場雨、十四章故事，和每一次折返裡被留在另一邊的人。' }),
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
    if (b.on) ctl.append(K.h('button.btn', { type: 'button', text: '關閉導覽', onclick: () => { gd().on = false; Case.save(); paint(); paintBar(); } }));
    else ctl.append(K.h('button.btn.pri', { type: 'button', text: '開啟導覽', onclick: () => { const x = gd(); x.on = true; x.fold = false; x.opt = true; Case.save(); paint(); paintBar(); } }));
    ctl.append(K.h('button.btn', { type: 'button', text: '從第一站重新開始', onclick: () => { const x = gd(); x.got = {}; x.skip = {}; x.fin = 0; x.seen._case = 0; x.on = true; x.fold = false; x.opt = true; Case.save(); sync(true); paint(); } }));
    box.append(K.h('div.gd-top', K.h('p', { text: i < 0 ? '八站都到過了。下面的平面圖照「來這裡想做什麼」分區，可以直接點進任何一個房間。' : '還有 ' + left() + ' 站。不必照順序走；在別處做過的事，也會自動記上。' }), ctl));
    const ol = K.h('ol.gd-route');
    STOPS.forEach((s, k) => { const st = state(s), cur = k === i;
      ol.append(K.h('li.is-' + st + (cur ? '.cur' : ''), K.h('span.n', { text: pad(k + 1) }), K.h('div', K.h('b', { text: s.t }), K.h('p', { text: s.line })),
        st === 'got' ? K.h('span.gd-st', { text: '到過' }) : K.h('a.btn.sm' + (cur ? '.pri' : ''), { href: '#' + s.to, text: st === 'skip' ? '補走' : '前往' }))); });
    box.append(K.h('section.gd-sec', K.h('div.q-h', K.h('h3', { text: '路線' }), K.h('span.lab', { text: '八站，大約十五分鐘' })), ol));
    const map = K.h('div.gd-map');
    MAP.forEach(g => map.append(K.h('div.gd-zone', K.h('div.gd-zh', K.h('b', { text: g[0] }), K.h('span.lab', { text: g[1] })), K.h('ul', g[2].map(r => { const key = r[0].split('/')[0]; return K.h('li' + (b.seen[key] ? '.seen' : ''), K.h('a', { href: '#' + r[0] }, K.h('b', { text: r[1] }), K.h('span', { text: r[2] })), b.seen[key] ? K.h('i', { text: '到過', 'aria-label': '到過' }) : null); })))));
    box.append(K.h('section.gd-sec', K.h('div.q-h', K.h('h3', { text: '平面圖' }), K.h('span.lab', { text: '照你來這裡想做的事分區' })), map));
  }
  function build() {
    built = true; box = K.h('div.gdp', { id: 'guide-box' });
    $('main').append(K.h('section.room', { id: 'r-guide', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'The Tour', text: '導覽' }), K.h('p.sub', { text: '第一次來，可以跟著路線走八站；來過的人，這裡有全館的平面圖。' })), K.h('div.no', { text: '00' })), box)));
    bar = K.h('div.gd-bar', { hidden: true, role: 'region', 'aria-label': '導覽' });
    fab = K.h('button.gd-fab', { type: 'button', hidden: true, onclick: () => { const x = gd(); x.fold = false; x.opt = true; Case.save(); paintBar(); } });
    document.body.append(bar, fab);
  }
  A.ROOMS.unshift(['guide', '導覽', '八站的參觀路線，和全館的平面圖。']);
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
