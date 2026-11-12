'use strict';
/* ---------- 遊藝室：小遊戲的框架 ----------
   每個遊戲是 games/ 底下的一個檔案，用 A.Arcade.add 登記自己：
     A.Arcade.add({
       id: 'order', name: '排年代', en: 'In Order', desc: '入口卡上的一句話',
       how: ['規則一', '規則二'],                 // 開始前的說明
       shot: { p: 'chart', a: {}, cues: [] },     // 入口卡的底片
       mount(root, api) { …; return { stop() {} } }
     });
   遊戲只管玩法：把畫面蓋在 root 裡，結束時叫 api.finish({ score, detail })。
   score 一律是 0–100 的整數；detail 是結果頁要多列的 [標籤, 值]。
   計分以外的事（最高分、評等、報酬、每日上限、委託的計數）都在這個檔案。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, Plates, pad } = A, G = A.Game;
  const ar = () => K.bag('ar', { best: {}, plays: {}, day: '', earned: 0 });
  const GAMES = [], CAP = 300, PAY = { a: 60, b: 40, c: 20 };
  const grade = s => s >= 85 ? ['a', '優'] : s >= 60 ? ['b', '良'] : ['c', '可'];
  const today = () => { const b = ar(), t = K.day(); if (b.day !== t) { b.day = t; b.earned = 0; } return b; };
  let box = null, built = false, live = null;
  function stop() { if (live && live.stop) { try { live.stop(); } catch (e) { /* 遊戲自己的收尾出錯，不影響換頁 */ } } live = null; }

  function hub() {
    stop(); const b = today(); box.textContent = '';
    box.append(K.h('p.arc-note', K.h('span.lab', { text: '今日報酬' }), K.h('span', { text: G.DEV + ' ' + b.earned + ' ／ ' + CAP + '。每場依評等給 ' + PAY.a + '、' + PAY.b + '、' + PAY.c + '；到了上限還是可以玩，最高分照樣記。' })));
    const grid = K.h('div.arc-grid');
    GAMES.forEach((g, i) => {
      const cv = document.createElement('canvas'); cv.width = 520; cv.height = 320; const best = b.best[g.id];
      grid.append(K.h('a.arc-card', { href: '#arcade/' + g.id }, cv, K.h('span.n', { text: pad(i + 1) }),
        K.h('span.tx', K.h('span.kick', { text: g.en }), K.h('b', { text: g.name }), K.h('span.d', { text: g.desc }), K.h('span.s', { text: best == null ? '還沒玩過' : '最高 ' + best + '　' + grade(best)[1] + '　玩過 ' + (b.plays[g.id] || 0) + ' 場' }))));
      setTimeout(() => Plates.still(cv, g.shot), 40 + 60 * i);
    });
    box.append(grid);
  }
  function intro(g) {
    stop(); const b = today(), best = b.best[g.id]; box.textContent = '';
    const fig = K.h('figure.plate'), cv = document.createElement('canvas'); cv.width = 960; cv.height = 600; fig.append(cv);
    const go = K.h('button.btn.pri', { type: 'button', text: best == null ? '開始' : '再玩一場', 'data-auto': '1', onclick: () => play(g) });
    box.append(K.h('div.arc-intro', fig, K.h('div',
      K.h('a.lnk', { href: '#arcade', text: '‹ 遊藝室' }), K.h('span.lab', { text: g.en }), K.h('h3', { text: g.name }), K.h('p', { text: g.desc }),
      K.h('ul', g.how.map(t => K.h('li', { text: t }))),
      best == null ? null : K.h('dl.quiz-best', K.h('div', K.h('dt', { text: '最高分' }), K.h('dd', { text: best + ' ／ 100' })), K.h('div', K.h('dt', { text: '評等' }), K.h('dd', { text: grade(best)[1] })), K.h('div', K.h('dt', { text: '玩過' }), K.h('dd', { text: (b.plays[g.id] || 0) + ' 場' }))),
      K.h('div.save-row', go))));
    Plates.mount(cv, g.shot, 14); setTimeout(() => go.focus({ preventScroll: true }), 40);
  }
  function play(g) {
    stop(); box.textContent = '';
    const root = K.h('div.arc-stage.g-' + g.id), quit = K.h('button.btn.sm', { type: 'button', text: '離開', onclick: () => intro(g) });
    box.append(K.h('div.arc-top', K.h('b', { text: g.name }), K.h('span.lab', { text: '最高 ' + (today().best[g.id] == null ? '—' : today().best[g.id]) }), quit), root);
    window.scrollTo(0, 0);
    let ended = false;
    const api = { best: today().best[g.id] || 0, rm: K.rm(), sfx: n => { if (A.Snd) A.Snd.cue(n); }, finish: r => { if (ended) return; ended = true; done(g, r || {}); } };
    try { live = g.mount(root, api) || {}; } catch (e) { live = null; root.append(K.h('p.empty', { text: '這個遊戲現在開不起來。' })); }
  }
  function done(g, r) {
    stop(); const b = today(), score = K.clamp(Math.round(+r.score || 0), 0, 100), gr = grade(score), old = b.best[g.id], isBest = old == null || score > old;
    b.plays[g.id] = (b.plays[g.id] || 0) + 1; if (isBest) b.best[g.id] = score;
    const pay = Math.min(PAY[gr[0]], Math.max(0, CAP - b.earned)); b.earned += pay; Case.save();
    G.bump('arcade'); if (gr[0] === 'a') G.bump('arcadeA'); G.bump('arc_' + g.id);
    G.give({ dev: pay, xp: 15 }, g.name + '　' + gr[1]);
    box.textContent = '';
    const res = K.h('div.arc-res', K.h('span.lab', { text: g.name + (isBest && old != null ? '　新的最高分' : '') }), K.h('div.quiz-score', { text: String(score) }, K.h('small', { text: ' ／ 100' })), K.h('h3', { text: '評等　' + gr[1] }),
      K.h('p', { text: pay ? '報酬 ' + G.DEV + ' ' + pay + '　資歷 +15' : '今天的報酬已經到上限（' + CAP + '），這一場只記分數。資歷 +15' }));
    if (r.detail && r.detail.length) res.append(K.h('dl.arc-detail', r.detail.map(d => K.h('div', K.h('dt', { text: d[0] }), K.h('dd', { text: String(d[1]) })))));
    const again = K.h('button.btn.pri', { type: 'button', text: '再玩一場', onclick: () => play(g) });
    res.append(K.h('div.save-row', again, K.h('a.btn', { href: '#arcade', text: '回遊藝室' }), K.h('a.btn', { href: '#play', text: '回值勤台' })));
    box.append(res); if (A.Snd) A.Snd.cue(score >= 85 ? 'chime' : 'page'); setTimeout(() => again.focus({ preventScroll: true }), 40);
    A.emit('arcadeDone', { id: g.id, score });
  }

  function build() {
    built = true; box = K.h('div.arc', { id: 'arcade-box' });
    $('main').append(K.h('section.room', { id: 'r-arcade', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'The Arcade', text: '遊藝室' }), K.h('p.sub', { text: '值勤空檔的小遊戲。題目都從館裡的年表、章節和底片來。' })), K.h('div.no', { text: '16' })), box)));
  }
  G.room('arcade', '遊藝室', '四個小遊戲：排年代、翻底片、收進手提箱、數字之島。');
  A.addRoom('arcade', 'r-arcade', arg => { if (!built) build(); const g = GAMES.find(x => x.id === arg); if (g) intro(g); else hub(); });
  A.on('ready', () => { if (!built) build(); });
  A.on('leave', n => { if (n === 'arcade') stop(); });
  A.on('status', o => { if (o.id === 'arcade') { const n = Object.keys(ar().best).length; o.s = n ? '玩過 ' + n + ' ／ ' + GAMES.length : ''; } });
  G.menu({ id: 'arcade', name: '遊藝室', en: 'The Arcade', desc: '排年代、翻底片、收進手提箱、數字之島。', shot: { p: 'wheel', a: {}, cues: [] }, status: () => { const b = today(); return '今日 ' + G.DEV + ' ' + b.earned + ' ／ ' + CAP; } });

  A.Arcade = { add(g) { if (g && g.id && typeof g.mount === 'function' && !GAMES.some(x => x.id === g.id)) GAMES.push(g); }, games: () => GAMES.slice(), best: id => ar().best[id], grade, playing: () => !!live };
})();
