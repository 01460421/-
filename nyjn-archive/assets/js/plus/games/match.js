'use strict';
/* ---------- 遊藝室：翻底片 ----------
   十六張蓋著的底片，八對，一次翻兩張。
   八張底片各用不同的畫家，兩對才不會長得像；暴雨、雨、靜物這三種畫面在很多章重複，認不出是哪一張，所以不用。 */
(function () {
  const A = window.__A, K = A.K, { CH, Plates, pad } = A;
  const PAIRS = 8, COLS = 4, SKIP = ['storm', 'rain', 'still'], SIGN = '甲乙丙丁戊己庚辛';
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const clock = s => Math.floor(s / 60) + ':' + pad(Math.floor(s % 60));
  /* 計分：十步以內滿分，之後每多一步扣 3.75（十二步 92、二十步 62）。
     時間只輕輕算：超過一分鐘後每二十秒扣一分，最多扣六分。再慢也有二十分。 */
  const score = (moves, sec) => K.clamp(Math.round(100 - 3.75 * Math.max(0, moves - 10) - K.clamp((sec - 60) / 20, 0, 6)), 20, 100);
  function pick() {
    const by = {};
    CH.forEach(c => c.shots.forEach(s => { if (s.cues && s.cues.length && SKIP.indexOf(s.p) < 0) (by[s.p] = by[s.p] || []).push(s); }));
    return shuffle(Object.keys(by)).slice(0, PAIRS).map(p => by[p][rnd(by[p].length)]);
  }

  function mount(root, api) {
    const shots = pick(), tms = new Set(), painted = [];
    const later = (f, ms) => { const t = setTimeout(() => { tms.delete(t); f(); }, ms); tms.add(t); return t; };
    let open = [], found = 0, moves = 0, t0 = 0, tick = 0, back = 0, over = false;
    root.classList.toggle('still', !!api.rm);

    const cards = shuffle(shots.concat(shots).map((s, i) => i % PAIRS)).map((k, i) => {
      const cv = document.createElement('canvas'); cv.width = 240; cv.height = 150;
      const c = { k, i, cv, up: false, ok: false, b: K.h('button.mc', { type: 'button', 'data-pair': k, onclick: () => flip(c) }, K.h('span.in', K.h('span.bk', { text: pad(i + 1) }), cv)) };
      return c;
    });
    const face = c => {
      c.b.classList.toggle('up', c.up); c.b.classList.toggle('ok', c.ok);
      c.b.setAttribute('aria-label', '第 ' + (c.i + 1) + ' 張，' + (c.up ? '底片' + SIGN[c.k] + (c.ok ? '，已配對' : '') : '蓋著'));
      if (c.ok) c.b.setAttribute('aria-disabled', 'true');   // 不用 disabled：焦點正停在這張上，停用會把焦點弄丟
    };
    const nMoves = K.h('dd', { text: '0' }), nTime = K.h('dd', { text: '0:00' }), nFound = K.h('dd', { text: '0 ／ ' + PAIRS });
    const say = K.h('p.m-say', { 'aria-live': 'polite', text: '翻開兩張一樣的底片。' });
    const grid = K.h('div.m-grid', { role: 'group', 'aria-label': '十六張底片' }, cards.map(c => c.b));
    root.append(K.h('dl.m-hud', K.h('div', K.h('dt', { text: '步數' }), nMoves), K.h('div', K.h('dt', { text: '時間' }), nTime), K.h('div', K.h('dt', { text: '配對' }), nFound)), grid, say);
    cards.forEach(face);
    /* 進場時框架把頁面捲回最上面，可是房間的大標題就佔掉半個畫面。十六張要一次看全，
       所以頁面在最上面時裝不下的話，改把遊戲這一列捲到頂列正下方。位置用整頁的座標算：框架那一下捲動可能還在半路。 */
    const bar = document.querySelector('.bar'), y = window.scrollY, top = (root.previousElementSibling || root).getBoundingClientRect().top + y - (bar ? bar.offsetHeight : 0) - 10;
    if (root.getBoundingClientRect().bottom + y > window.innerHeight) window.scrollTo(0, Math.max(0, top));

    /* 畫布照卡片實際的大小開（手機是方的，桌機是 16:10），底片才不會糊。每一對只畫一次，另一張直接複製。 */
    const r = cards[0].b.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    if (r.width > 2) cards.forEach(c => { c.cv.width = Math.round(r.width * d); c.cv.height = Math.round(r.height * d); });
    const paint = k => {
      if (painted[k]) return; painted[k] = true;
      const two = cards.filter(c => c.k === k), g = two[1].cv.getContext('2d');
      Plates.still(two[0].cv, shots[k]); if (g) g.drawImage(two[0].cv, 0, 0);
    };
    shots.forEach((s, k) => later(() => paint(k), 60 + 50 * k));

    function shut() { clearTimeout(back); tms.delete(back); open.forEach(c => { c.up = false; face(c); }); open = []; }
    function flip(c) {
      if (over || c.ok) return;
      if (open.length === 2) shut();   // 上一組還沒蓋回去就翻下一張：直接蓋，不讓人乾等（點的是那兩張之一也一樣，它會留著當下一步的第一張）
      if (c.up) return;
      if (!t0) { t0 = Date.now(); tick = setInterval(() => { nTime.textContent = clock((Date.now() - t0) / 1000); }, 500); }   // 翻第一張才開始計時
      paint(c.k); c.up = true; face(c); open.push(c);
      if (open.length < 2) { api.sfx('page'); return; }
      const [a, b] = open; moves++; nMoves.textContent = String(moves);
      if (a.k !== b.k) { api.sfx('wrong'); say.textContent = '不是一對。'; back = later(shut, 900); return; }
      a.ok = b.ok = true; open = []; found++; face(a); face(b); api.sfx('right');
      nFound.textContent = found + ' ／ ' + PAIRS; say.textContent = found < PAIRS ? '配成一對。' : '全部找到了。';
      if (found === PAIRS) {
        over = true; clearInterval(tick); const sec = (Date.now() - t0) / 1000; nTime.textContent = clock(sec);
        later(() => api.finish({ score: score(moves, sec), detail: [['步數', moves], ['時間', clock(sec)]] }), 900);   // 讓最後一對亮一下再換頁
      }
    }
    /* 方向鍵在格子裡移動焦點，到邊緣就停，不繞到下一列 */
    grid.addEventListener('keydown', e => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[e.key], i = cards.findIndex(c => c.b === document.activeElement);
      if (!step || i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault(); const j = i + step;
      if (j >= 0 && j < cards.length && (Math.abs(step) > 1 || Math.floor(j / COLS) === Math.floor(i / COLS))) cards[j].b.focus();
    });
    later(() => cards[0].b.focus({ preventScroll: true }), 40);

    return { stop() { over = true; clearInterval(tick); tms.forEach(clearTimeout); tms.clear(); } };
  }

  A.Arcade.add({
    id: 'match', name: '翻底片', en: 'Pairs', desc: '十六張蓋著的底片，兩兩成對，把八對都找出來。',
    how: ['一次翻兩張。一樣就留著，不一樣會蓋回去。', '步數越少分數越高，時間只算一點點。', '鍵盤可以用方向鍵移動，Enter 翻開。'],
    shot: { p: 'gallery', a: {}, cues: [] }, mount
  });
})();
