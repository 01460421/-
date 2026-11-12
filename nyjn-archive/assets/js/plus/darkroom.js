'use strict';
/* ---------- 暗房：把顯影劑換成底片 ----------
   館裡的七十八張底片在這裡變成可以收集的東西。沖洗是隨機的，所以規則全部攤開：
     星等　暴雨那一張是六星；每一章的第一張是五星；其餘照底片的編號固定分成四星和三星
     機率　六星 2%、五星 8.5%、四星 40%、三星 49.5%
     保底　連續九張沒有五星以上，第十張一定是；連續六十九張沒有六星，第七十張一定是
     特寫　每週輪一章，那一章的底片在同星等裡出現的機會是三倍
     重複　折成碎片（三星 5、四星 15、五星 50、六星 150），可以到底片冊指定顯影缺的那一張
   顯影劑只能在館裡做事拿到，沒有任何付費的入口。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, CH, Plates, pad, toast, fmtDate } = A, G = A.Game;
  const ONE = 120, TEN = 1080, P6 = 0.02, P5 = 0.085, P4 = 0.40, HARD5 = 10, HARD6 = 70;
  const DUPE = { 3: 5, 4: 15, 5: 50, 6: 150 }, CRAFT = { 3: 40, 4: 120, 5: 400, 6: 1200 }, NAME = { 6: '暴雨', 5: '定格', 4: '清晰', 3: '樣片' };
  const dk = () => K.bag('dk', { own: {}, at: {}, pity5: 0, pity6: 0, n: 0, log: [], fav: '' });

  /* 底片池：每一張的星等是固定的，不會因為誰來沖而不同 */
  const POOL = [], BY = {};
  CH.forEach((c, ci) => c.shots.filter(s => s.cues && s.cues.length).forEach((s, i) => {
    const key = c.id + ':' + i, star = s.p === 'storm' ? 6 : i === 0 ? 5 : Math.abs(A.hashStr(key)) % 100 < 40 ? 4 : 3;
    const o = { key, c, ci, i, shot: s, star }; POOL.push(o); BY[key] = o;
  }));
  const stars = n => '★'.repeat(n);
  const label = p => p.c.no + '　PL.' + pad(p.i + 1);
  const feat = () => CH[Math.floor(new Date(G.weekId()).getTime() / 6048e5) % CH.length];
  const count = () => { const o = dk().own; return POOL.filter(p => o[p.key] > 0).length; };

  function one(b, f) {
    b.pity5++; b.pity6++;
    const r = Math.random();
    const star = b.pity6 >= HARD6 || r < P6 ? 6 : b.pity5 >= HARD5 || r < P6 + P5 ? 5 : r < P6 + P5 + P4 ? 4 : 3;
    if (star >= 5) b.pity5 = 0; if (star === 6) b.pity6 = 0;
    const tier = POOL.filter(p => p.star === star), w = tier.map(p => p.c.id === f.id ? 3 : 1);
    let t = Math.random() * w.reduce((a, x) => a + x, 0), k = 0;
    for (; k < tier.length - 1; k++) { t -= w[k]; if (t <= 0) break; }
    return tier[k];
  }
  function add(b, p) {
    const isNew = !(b.own[p.key] > 0); b.own[p.key] = (b.own[p.key] || 0) + 1;
    if (isNew) b.at[p.key] = Date.now();
    return isNew;
  }
  function pull(n) {
    const cost = n >= 10 ? TEN : ONE * n;
    if (!G.spend('dev', cost)) { toast('顯影劑不夠。這一盤要 ' + G.DEV + ' ' + G.fmt(cost) + '。'); return null; }
    const b = dk(), f = feat(), out = []; let shard = 0;
    for (let i = 0; i < n; i++) { const p = one(b, f), isNew = add(b, p), s = isNew ? 0 : DUPE[p.star]; shard += s; out.push({ p, isNew, shard: s }); b.log.unshift([p.key, Date.now()]); }
    b.log.length = Math.min(b.log.length, 60); b.n += n; Case.save();
    G.bump('pull', n); G.give({ shard, xp: 5 * n }, '', true);
    A.emit('pulled', { out });
    return out;
  }
  /* 指定顯影：用碎片換一張還沒有的 */
  function craft(key) {
    const p = BY[key], b = dk(); if (!p || b.own[key] > 0) return false;
    if (!G.spend('shard', CRAFT[p.star])) { toast('碎片不夠。這一張要 ' + G.SHD + ' ' + CRAFT[p.star] + '。'); return false; }
    add(b, p); Case.save(); G.bump('craft'); A.emit('pulled', { out: [{ p, isNew: true, shard: 0 }] });
    toast('顯影完成：' + label(p)); if (A.Snd) A.Snd.cue('chime');
    return true;
  }

  /* ---- 畫面 ---- */
  let box = null, built = false, busy = false;
  function card(r, i) {
    const p = r.p, cv = document.createElement('canvas'); cv.width = 480; cv.height = 300;
    const b = K.h('button.dk-card.s' + p.star + (r.isNew ? '.new' : ''), { type: 'button', 'aria-label': label(p) + '，' + p.star + ' 星' + (r.isNew ? '，新的底片' : '，重複') },
      K.h('span.dk-fig', cv), K.h('span.dk-st', { text: stars(p.star) }), K.h('span.dk-t', { text: label(p) }),
      K.h('span.dk-tag', { text: r.isNew ? 'NEW' : G.SHD + ' +' + r.shard }));
    b.onclick = () => { if (A.Album) A.Album.open(p.key); };
    setTimeout(() => Plates.still(cv, p.shot), 30 + 40 * i);
    return b;
  }
  function run(n) {
    if (busy) return; const out = pull(n); if (!out) return;
    busy = true; paint(true);
    const stage = $('dk-stage'); stage.textContent = '';
    const grid = K.h('div.dk-out' + (n === 1 ? '.one' : '')), cards = out.map(card), rm = K.rm();
    cards.forEach(c => grid.append(c));
    const fresh = out.filter(r => r.isNew).length, shard = out.reduce((s, r) => s + r.shard, 0), top = out.reduce((m, r) => Math.max(m, r.p.star), 0);
    const sum = K.h('p.dk-sum', { hidden: true, 'aria-live': 'polite', text: '新到 ' + fresh + ' 張。' + (out.length - fresh ? '重複 ' + (out.length - fresh) + ' 張，裁成 ' + G.SHD + ' ' + shard + '。' : '') });
    const skip = K.h('button.btn.sm', { type: 'button', text: '全部顯影' });
    stage.append(grid, K.h('div.save-row', skip), sum);
    let shown = 0, timer = 0;
    const end = () => { clearInterval(timer); cards.forEach(c => c.classList.add('on')); skip.hidden = true; sum.hidden = false; busy = false; paint(true); if (A.Snd) A.Snd.cue(top >= 5 ? 'chime' : 'page'); if (cards[0]) cards[0].focus({ preventScroll: true }); };
    skip.onclick = end;
    if (rm) { end(); return; }
    const step = () => { if (shown >= cards.length) { end(); return; } const c = cards[shown++]; c.classList.add('on'); if (A.Snd) A.Snd.cue(c.classList.contains('s6') || c.classList.contains('s5') ? 'right' : 'page'); };
    step(); timer = setInterval(step, n === 1 ? 900 : 380);
  }
  function rates() {
    K.dialog({ title: '機率與規則', cls: 'dlg-rates', build(body) {
      const n = s => POOL.filter(p => p.star === s).length;
      body.append(K.h('div.pf-scroll', K.h('table.dk-rates', K.h('thead', K.h('tr', K.h('th', { text: '星等' }), K.h('th', { text: '機率' }), K.h('th', { text: '張數' }), K.h('th', { text: '重複折成' }), K.h('th', { text: '指定顯影' }))),
        K.h('tbody', [[6, P6], [5, P5], [4, P4], [3, 1 - P6 - P5 - P4]].map(x => K.h('tr', K.h('td', { text: stars(x[0]) + '　' + NAME[x[0]] }), K.h('td', { text: (x[1] * 100).toFixed(1) + '%' }), K.h('td', { text: String(n(x[0])) }), K.h('td', { text: G.SHD + ' ' + DUPE[x[0]] }), K.h('td', { text: G.SHD + ' ' + CRAFT[x[0]] })))))),
        K.h('ul.dk-rules',
          K.h('li', { text: '六星，是暴雨落下的那一張。五星，是每一章的第一張。其餘的，四星三星各有定數。' }),
          K.h('li', { text: '連續 ' + (HARD5 - 1) + ' 張不見五星，下一張必是五星以上。' }),
          K.h('li', { text: '連續 ' + (HARD6 - 1) + ' 張不見六星，下一張必是六星。' }),
          K.h('li', { text: '本週特寫的那一章：同一個星等裡，它的底片出現的機會是別章的三倍。' }),
          K.h('li', { text: '同一個星等裡，其餘每一張機會均等。' }),
          K.h('li', { text: '顯影劑只在館裡掙得到。這裡不收錢，以後也不收。' })));
    } });
  }
  function history() {
    K.dialog({ title: '沖洗紀錄', cls: 'dlg-set', build(body) {
      const b = dk(); if (!b.log.length) { body.append(K.h('p.empty', { text: '盤子還是乾的。' })); return; }
      body.append(K.h('p.lab', { text: '最近 ' + b.log.length + ' 張，共沖洗 ' + b.n + ' 張' }), K.h('ol.dk-log', b.log.map(x => { const p = BY[x[0]]; return p ? K.h('li.s' + p.star, K.h('span', { text: stars(p.star) }), K.h('span', { text: label(p) + '　〈' + p.c.zh + '〉' }), K.h('time', { text: K.ago(x[1]) })) : null; })));
    } });
  }
  function paint(keep) {
    if (!box) return; const b = dk(), g = G.gm(), f = feat();
    const stage = keep ? $('dk-stage') : null; box.textContent = '';
    const b1 = K.h('button.btn.pri', { type: 'button', disabled: busy, onclick: () => run(1) }, '沖洗一張　', K.h('small', { text: G.DEV + ' ' + ONE }));
    const b10 = K.h('button.btn', { type: 'button', disabled: busy, onclick: () => run(10) }, '沖洗十張　', K.h('small', { text: G.DEV + ' ' + G.fmt(TEN) }));
    box.append(K.h('div.dk-top',
      K.h('div.dk-feat', K.h('span.lab', { text: 'THIS WEEK — 本週特寫' }), K.h('b', { text: f.no + '〈' + f.zh + '〉' }), K.h('span', { text: '這一週，這一章的底片浮得快些。星期一換。' })),
      K.h('dl.g-wallet', K.h('div', K.h('dt', { text: G.DEV + ' 顯影劑' }), K.h('dd', { text: G.fmt(g.dev) })), K.h('div', K.h('dt', { text: G.SHD + ' 碎片' }), K.h('dd', { text: G.fmt(g.shard) })), K.h('div', K.h('dt', { text: '底片冊' }), K.h('dd', { text: count() + '／' + POOL.length })))));
    if (stage) box.append(stage);
    else {
      const cv = document.createElement('canvas'); cv.width = 960; cv.height = 600;
      box.append(K.h('div.dk-stage', { id: 'dk-stage' }, K.h('div.dk-idle', K.h('figure.plate', cv), K.h('p', { text: '相紙放進顯影盤，影像會自己浮上來。重複的，裁成碎片還你。' }))));
      Plates.mount(cv, { p: f.bg[0], a: f.bg[1] || {}, cues: [] }, 14);
    }
    box.append(K.h('div.save-row.dk-act', b1, b10, K.h('button.tiny', { type: 'button', text: '機率與規則', onclick: rates }), K.h('button.tiny', { type: 'button', text: '沖洗紀錄', onclick: history }), K.h('a.tiny', { href: '#album', text: '打開底片冊' })),
      K.h('p.dk-pity', { text: '五星以上：' + (HARD5 - b.pity5) + ' 張之內必有。六星：' + (HARD6 - b.pity6) + ' 張之內必有。' }));
  }
  function build() {
    built = true; box = K.h('div.dk', { id: 'dark-box' });
    $('main').append(K.h('section.room', { id: 'r-darkroom', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'The Darkroom', text: '暗房' }), K.h('p.sub', { text: '紅燈亮著。沖出哪一張，由不得你；規矩都貼在牆上。' })), K.h('div.no', { text: '14' })), box)));
  }
  G.room('darkroom', '暗房', '相紙下水，影像自己浮上來。');
  A.addRoom('darkroom', 'r-darkroom', () => { if (!built) build(); busy = false; paint(); });
  A.on('ready', () => { if (!built) build(); });
  A.on('gain', () => { if (A.cur === 'darkroom' && !busy) paint(true); });
  A.on('status', o => { if (o.id === 'darkroom') o.s = dk().n ? '沖洗過 ' + dk().n + ' 張' : ''; });
  G.menu({ id: 'darkroom', name: '暗房', en: 'The Darkroom', desc: '相紙下水，影像自己浮上來。', shot: { p: 'gallery', a: {}, cues: [] }, status: () => '可以沖 ' + Math.floor(G.gm().dev / ONE) + ' 張' });

  A.Dark = { POOL, BY, NAME, DUPE, CRAFT, ONE, stars, label, feat, count, total: POOL.length, own: k => dk().own[k] || 0, at: k => dk().at[k] || 0, bag: dk, pull, craft };
})();
