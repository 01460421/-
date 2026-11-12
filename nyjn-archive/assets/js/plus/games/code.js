'use strict';
/* ---------- 遊藝室：數字之島 ----------
   暗號是四個不重複的數字，八次機會。每猜一次只回兩個數：位置對的有幾個，數字對但位置不對的有幾個。
   紀錄用表格排：八列一開始就在，猜到第幾次、還剩幾次一眼看得出來，版面也不會越猜越長。 */
(function () {
  const A = window.__A, K = A.K, LEN = 4, MAX = 8, SCORE = [100, 100, 100, 100, 90, 80, 70, 60], MISS = 20;

  function mount(root, api) {
    const pool = '1234567890'.split(''), code = []; while (code.length < LEN) code.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    let cur = '', used = 0, over = false;

    const rows = [], body = K.h('tbody'), left = K.h('span.cd-left'), lab = K.h('span.lab'), msg = K.h('p.cd-msg', { role: 'status', text: '輸入四個不重複的數字，再按送出。' });
    for (let i = 0; i < MAX; i++) { const tr = K.h('tr', K.h('th', { scope: 'row', text: A.pad(i + 1) }), K.h('td.g'), K.h('td'), K.h('td')); rows.push(tr); body.append(tr); }
    const slots = Array.from({ length: LEN }, () => K.h('b')), keys = '1234567890'.split('').map(d => K.h('button', { type: 'button', text: d, onclick: () => put(d) }));
    const pad = K.h('div.cd-pad', keys, K.h('button.btn', { type: 'button', text: '刪除', onclick: del }), K.h('button.btn.pri', { type: 'button', text: '送出', onclick: send }));
    pad.addEventListener('mousedown', e => e.preventDefault());   // 滑鼠點過的鍵不留焦點，接著按 Enter 才會是「送出」而不是再點一次那個數字
    const play = K.h('div.cd-play', lab, K.h('div.cd-slots', { 'aria-hidden': 'true' }, slots), msg, pad);
    root.append(K.h('div', K.h('div.cd-head', K.h('span.lab', { text: '紀錄' }), left),
      K.h('table.cd-log', K.h('thead', K.h('tr', K.h('th', { scope: 'col', text: '次' }), K.h('th', { scope: 'col', text: '猜的數字' }), K.h('th', { scope: 'col', text: '位置對' }), K.h('th', { scope: 'col', text: '數字對、位置不對' }))), body)), play);

    const say = (t, bad) => { msg.textContent = t; msg.classList.toggle('bad', !!bad); if (bad) api.sfx('wrong'); };
    function paint() {
      slots.forEach((b, i) => { b.textContent = (over ? code : cur)[i] || ''; b.classList.toggle('at', !over && i === cur.length); });
      keys.forEach(b => b.classList.toggle('in', cur.indexOf(b.textContent) >= 0));
      rows.forEach((tr, i) => tr.classList.toggle('now', !over && i === used));
      lab.textContent = over ? '暗號' : '第 ' + (used + 1) + ' 次'; left.textContent = '還剩 ' + (MAX - used) + ' 次';
    }
    function put(d) { if (!over && cur.length < LEN) { cur += d; paint(); } }
    function del() { if (!over && cur) { cur = cur.slice(0, -1); paint(); } }
    function send() {
      if (over) return;
      if (cur.length < LEN) return say('還差 ' + (LEN - cur.length) + ' 個數字。', 1);
      const dup = cur.split('').find((d, i) => cur.indexOf(d) !== i);
      if (dup) return say('暗號的四個數字都不一樣，這一組的 ' + dup + ' 重複了。', 1);
      let hit = 0, near = 0; for (let i = 0; i < LEN; i++) { if (cur[i] === code[i]) hit++; else if (code.indexOf(cur[i]) >= 0) near++; }
      const tr = rows[used++], ok = hit === LEN; tr.children[1].textContent = cur; tr.children[2].textContent = hit; tr.children[3].textContent = near; tr.classList.toggle('ok', ok);
      cur = '';
      if (!ok && used < MAX) { say('第 ' + used + ' 次：位置對 ' + hit + '，數字對、位置不對 ' + near + '。'); api.sfx('page'); paint(); return; }
      /* 結束：格子裡換成暗號，數字鍵換成一顆「看結果」。不自動跳頁，讓人有時間回頭看自己的紀錄。 */
      over = true; paint(); say(ok ? '猜中了，用了 ' + used + ' 次。' : '八次用完了。暗號是 ' + code.join(' ') + '。'); api.sfx(ok ? 'right' : 'wrong');
      const go = K.h('button.btn.pri', { type: 'button', text: '看結果', onclick: () => api.finish({ score: ok ? SCORE[used - 1] : MISS, detail: [['猜了', used + ' 次' + (ok ? '' : '，沒猜中')], ['暗號', code.join(' ')]] }) });
      play.classList.add('done'); pad.replaceWith(K.h('div.save-row', go)); go.focus({ preventScroll: true });
    }

    const key = e => {
      if (over || e.ctrlKey || e.metaKey || e.altKey || K.typing(e) || K.dialogOpen()) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); put(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); del(); }
      else if (e.key === 'Enter' && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); if (!e.repeat) send(); }   // 焦點在按鈕或連結上時，Enter 還是按那顆按鈕
    };
    document.addEventListener('keydown', key);
    paint();
    if (root.getBoundingClientRect().bottom > innerHeight) root.scrollIntoView({ block: 'start', behavior: 'instant' });   // 手機上紀錄加數字鍵比一個畫面長一點，先捲到剛好放得下
    return { stop() { over = true; document.removeEventListener('keydown', key); } };
  }

  A.Arcade.add({
    id: 'code', name: '數字之島', en: 'The Island of Numbers', desc: '島上的人只用數字說話。八次以內，猜出四位數的暗號。',
    how: ['暗號是四個不重複的數字，0 也可以排在最前面。', '每猜一次會得到兩個數：「位置對」是數字和位置都對的有幾個，「數字對、位置不對」是有這個數字、但放錯了位置的有幾個。', '用畫面上的數字鍵，或鍵盤的數字、Backspace、Enter。', '四次以內猜中 100 分，之後每多一次少 10 分；八次用完沒猜中 20 分。'],
    shot: { p: 'numbers', a: {}, cues: [] }, mount
  });
})();
