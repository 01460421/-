'use strict';
/* ---------- 遊藝室：排年代 ----------
   三輪，每輪五張卡，最早的排最上面：兩輪排章節，一輪排暴雨。
   卡上只放館內現成的字；會洩題的「第幾章」「第幾次」先收著，確認之後才翻出來。 */
(function () {
  const A = window.__A, K = A.K, { CH, yr } = A;
  const N = 5, ZH = ['一', '二', '三'];
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  /* 暴雨卡的說明取 note 的第一句。第一場的第一句就是「第一場暴雨」，等於把答案印在卡上，所以跳過報出場次的句子。 */
  const line = s => { const x = s.note.split('。').find(t => t && !/第.{1,3}場暴雨/.test(t)); return x ? x + '。' : ''; };
  const chCard = c => ({ k: A.chIx(c.id), t: '〈' + c.zh + '〉', s: c.en, tag: c.no });
  const stCard = i => ({ k: i, t: yr(SD[i].f) + ' → ' + yr(SD[i].t), s: line(SD[i]), tag: ORD[i] + '暴雨', st: true });
  /* 發牌時剛好排對的不算題目，重洗。 */
  const deal = cards => { let o; do { o = shuffle(cards); } while (o.every((c, i) => !i || o[i - 1].k < c.k)); return o; };

  function mount(root, api) {
    const ten = shuffle(CH).slice(0, N * 2);   // 兩輪章節從同一疊發，不會抽到同一章
    const rounds = [
      { lab: '章節', ask: '把這五章排回故事的順序。', cards: ten.slice(0, N).map(chCard) },
      { lab: '暴雨', ask: '把這五場暴雨排回落下的順序。', cards: shuffle(SD.map((s, i) => i)).slice(0, N).map(stCard) },
      { lab: '章節', ask: '把這五章排回故事的順序。', cards: ten.slice(N).map(chCard) }
    ];
    const got = [], of = new Map(), say = K.h('p.o-say', { 'aria-live': 'polite' });
    let at = 0, list = null, foot = null, drag = null, locked = false, tm = 0;
    root.classList.toggle('still', !!api.rm);
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    const focusSoon = el => { clearTimeout(tm); tm = setTimeout(() => el.focus({ preventScroll: true }), 40); };
    const sync = () => [...list.children].forEach((li, i) => { const o = of.get(li); o.up.disabled = i === 0; o.dn.disabled = i === N - 1; });
    /* 進場時框架把頁面捲回最上面，可是房間的大標題就佔掉半個畫面。五張卡和確認鈕要能一次看全，
       所以頁面在最上面時裝不下的話，改把遊戲這一列捲到頂列正下方。位置用整頁的座標算：框架那一下捲動可能還在半路。 */
    function settle() {
      const bar = document.querySelector('.bar'), y = window.scrollY, top = (root.previousElementSibling || root).getBoundingClientRect().top + y - (bar ? bar.offsetHeight : 0) - 10;
      if (root.getBoundingClientRect().bottom + y > window.innerHeight) window.scrollTo(0, Math.max(0, top));
    }

    /* 往上或往下挪一格。搬的是隔壁那張，不是自己：自己一離開文件，鍵盤焦點和拖曳中的指標捕捉都會掉。
       其他卡片用「先記位置、搬完再補位移」的方式滑過去；拖在手上的那張由指標決定位置，不參與。 */
    function step(li, d) {
      const mv = api.rm ? [] : [...list.children].filter(c => !drag || c !== drag.li), was = mv.map(c => c.getBoundingClientRect().top);
      if (d > 0) list.insertBefore(li.nextElementSibling, li); else list.insertBefore(li.previousElementSibling, li.nextSibling);
      sync();
      mv.forEach(c => { c.style.transition = 'none'; c.style.transform = ''; });
      mv.forEach((c, i) => { const dy = was[i] - c.getBoundingClientRect().top; if (dy) c.style.transform = 'translateY(' + dy + 'px)'; });
      void list.offsetHeight;
      mv.forEach(c => { c.style.transition = ''; c.style.transform = ''; });
    }
    const told = li => { say.textContent = of.get(li).c.t + ' 移到第 ' + ([...list.children].indexOf(li) + 1) + ' 位。'; };
    function nudge(li, d, btn) {
      if (locked || btn.disabled) return;
      step(li, d); told(li); api.sfx('page');
      const o = of.get(li); (btn.disabled ? (btn === o.up ? o.dn : o.up) : btn).focus({ preventScroll: true });   // 到頂或到底時按鈕會停用，焦點換到另一顆
    }

    /* 拖曳：滑鼠可以抓整張卡；觸控只認左邊的把手（那一格設了 touch-action:none），卡片其餘的地方留給捲動頁面。 */
    function down(e) {
      if (drag || locked || e.button || e.target.closest('button')) return;
      const li = e.target.closest('.oc'); if (!li || (e.pointerType !== 'mouse' && !e.target.closest('.grip'))) return;
      drag = { li, id: e.pointerId, off: e.clientY - li.getBoundingClientRect().top };
      try { list.setPointerCapture(e.pointerId); } catch (x) { /* 沒捕捉到也能拖，只是游標不能離開清單 */ }
      li.classList.add('drag'); e.preventDefault();
    }
    function track(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const li = drag.li, h = li.offsetHeight, top = K.clamp(e.clientY - drag.off - list.getBoundingClientRect().top, 0, list.offsetHeight - h);
      let n;   // 手上這張的邊緣越過隔壁的中線就換位。卡片被限制在清單裡，用邊緣比才到得了頭尾兩格
      while ((n = li.nextElementSibling) && top + h > n.offsetTop + n.offsetHeight / 2) step(li, 1);
      while ((n = li.previousElementSibling) && top < n.offsetTop + n.offsetHeight / 2) step(li, -1);
      li.style.transform = 'translateY(' + (top - li.offsetTop) + 'px)';
    }
    function drop(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const { li, id } = drag; drag = null;
      try { list.releasePointerCapture(id); } catch (x) { /* 已經放開了 */ }
      li.classList.remove('drag'); li.style.transform = ''; told(li); api.sfx('page');
    }

    function round() {
      const r = rounds[at]; locked = false; drag = null; of.clear(); root.textContent = '';
      list = K.h('ol.o-list', { 'aria-label': '由早到晚' });
      deal(r.cards).forEach(c => {
        const up = K.h('button', { type: 'button', text: '上移', 'aria-label': '上移 ' + c.t, onclick: () => nudge(li, -1, up) });
        const dn = K.h('button', { type: 'button', text: '下移', 'aria-label': '下移 ' + c.t, onclick: () => nudge(li, 1, dn) });
        const li = K.h('li.oc' + (c.st ? '.st' : ''), K.h('span.grip', { 'aria-hidden': 'true' }), K.h('div.tx', K.h('b', { text: c.t }), K.h('span.s', { text: c.s })), K.h('div.mv', up, dn));
        of.set(li, { c, up, dn }); list.append(li);
      });
      list.addEventListener('pointerdown', down); list.addEventListener('pointermove', track);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => list.addEventListener(n, drop));
      foot = K.h('div.save-row', K.h('button.btn.pri', { type: 'button', text: '確認', onclick: check }), K.h('span.o-hint', { text: (coarse ? '拖左邊的把手' : '拖曳卡片') + '，或按上移、下移。' }));
      root.append(K.h('div.o-head', K.h('span.lab', { text: '第' + ZH[at] + '輪 ／ 共三輪　' + r.lab }), K.h('h3', { text: r.ask }), K.h('p', { text: '最早的排最上面，排好按確認。' })), list, foot, say);
      sync(); settle();
      focusSoon(of.get(list.firstElementChild).dn);
    }
    function check() {
      if (locked) return; locked = true; drop();
      const lis = [...list.children], right = lis.map(li => of.get(li).c).sort((a, b) => a.k - b.k);
      let n = 0;
      lis.forEach((li, i) => {
        const c = of.get(li).c, ok = c === right[i]; if (ok) n++;
        li.classList.add(ok ? 'ok' : 'no'); li.style.transform = '';
        /* 藏著的章次放在原本按鈕的那一格，卡片不會變高，下面的按鈕也就不會跳走 */
        li.querySelector('.mv').replaceWith(K.h('div.vd', K.h('b', { text: c.tag }), K.h('span', { text: ok ? '位置正確' : '應排第 ' + (right.indexOf(c) + 1) + ' 位' })));
      });
      list.classList.add('done'); got[at] = n; api.sfx(n >= 3 ? 'right' : 'wrong');
      const last = at === rounds.length - 1, sum = '這一輪排對 ' + n + ' ／ ' + N + '。';
      const nx = K.h('button.btn.pri', { type: 'button', text: last ? '看成績' : '下一輪 ›', onclick: () => { if (last) end(); else { at++; round(); } } });
      foot.textContent = ''; foot.append(nx, K.h('span.o-hint', { text: sum })); say.textContent = sum;
      focusSoon(nx);
    }
    function end() {
      api.finish({ score: Math.round(100 * got.reduce((a, b) => a + b, 0) / (N * rounds.length)), detail: rounds.map((r, i) => ['第' + ZH[i] + '輪　' + r.lab, got[i] + ' ／ ' + N]) });
    }

    round();
    return { stop() { clearTimeout(tm); drag = null; locked = true; } };
  }

  A.Arcade.add({
    id: 'order', name: '排年代', en: 'In Order', desc: '把章節和暴雨排回原本的先後。',
    how: ['共三輪，每輪五張卡：兩輪排章節，一輪排暴雨。', '最早的排最上面。可以拖曳，也可以按卡片上的上移、下移。', '按確認後揭曉。十五個位置排對越多，分數越高。'],
    shot: { p: 'pages', a: {}, cues: [] }, mount
  });
})();
