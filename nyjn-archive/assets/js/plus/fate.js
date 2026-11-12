'use strict';
/* ---------- 抉擇之後：理由、你走的那條路、我的紀年 ----------
   原本的八個抉擇選完就結束了。這裡補上三件事：
     理由　　每一題揭曉之後，可以寫一句「為什麼這樣選」，只存在這台裝置
     那條路　八題選完，把你和她的路畫在同一條線上，哪幾步岔開一眼看得出來
     我的紀年（#journal）　照章節把你留下的東西排成一份紀錄：戳記、親歷、抉擇與理由、手記
   解讀的文字是本館寫的，不是遊戲設定；頁面上有註明。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, CH, chOf, pad, fmtDate } = A;
  const fa = () => K.bag('fa', { why: {} });
  const canon = SC.filter(s => s.canon);
  const pickOf = s => Case.d.choices[s.id];
  const text = (s, p) => p === 'a' ? s.a : s.b;
  const sameN = () => canon.filter(s => pickOf(s) === s.canon).length;
  const plateNo = s => (A.Story ? A.Story.at(s.id) : 0) + 1;
  const saveSoon = K.debounce(() => Case.save(), 600);
  /* 和她重疊幾次，換成一句話。門檻：至少這麼多次 */
  const KIND = [[7, '同一把傘', '七次，同一條路。換你站在那裡，你也會這麼做。'], [5, '並肩的人', '大多數時候你們並肩。岔開的那一兩步，是你自己的。'], [3, '另一位司辰', '一半的路和她重疊，一半沒有。同一把傘底下，站得下不同的人。'],
    [1, '走另一邊的人', '你多半走了另一條路。主線只寫了其中一種走法，另一種在你這裡。'], [0, '相反的紀錄', '七次，沒有一次相同。兩份紀錄擺在一起，才是一整張底片。']];
  const kind = () => KIND.find(k => sameN() >= k[0]);

  /* 揭曉之後：寫一句理由；回到故事裡那一刻 */
  A.on('reveal', ({ s, rv }) => {
    const inp = K.h('input.inp', { type: 'text', maxlength: '60', placeholder: '不寫也行', value: fa().why[s.id] || '', autocomplete: 'off', id: 'why-' + s.id });
    inp.addEventListener('input', () => { const v = inp.value.trim().slice(0, 60); if (v) fa().why[s.id] = v; else delete fa().why[s.id]; saveSoon(); });
    rv.append(K.h('label.fa-why', { for: 'why-' + s.id }, K.h('span.lab', { text: '為什麼。只留在這台裝置上' }), inp), K.h('a.tiny', { href: '#story/' + s.ch + '/' + plateNo(s), text: '回到故事裡的這一刻' }));
  });

  /* 八題選完：你和她的路 */
  function path() {
    const ol = K.h('ol.fa-path', { 'aria-label': '八個時刻裡，你和她的路' });
    SC.forEach((s, i) => { const p = pickOf(s), st = !s.canon ? 'open' : p === s.canon ? 'same' : 'diff';
      ol.append(K.h('li.' + st, K.h('i.drop'), K.h('i.me'), K.h('span.n', { text: String(i + 1) }), K.h('span.d', { text: st === 'open' ? '你的' : st === 'same' ? '同路' : '岔開' }))); });
    return ol;
  }
  A.on('tally', ({ tl }) => {
    if (tl.querySelector('.fa-res')) return; const k = kind(), last = SC.find(s => !s.canon), head = tl.querySelector('b');
    const res = K.h('div.fa-res', K.h('div.fa-kind', K.h('span.lab', { text: '你走的那條路' }), K.h('b', { text: k[1] }), K.h('p', { text: k[2] + (last && pickOf(last) ? '沒有答案的那一題，你選了：' + text(last, pickOf(last)) + '。' : '') })),
      path(), K.h('p.fa-legend', { text: '橫線是她走的路。往下岔開的，是你走開的那幾步。第八個時刻沒有答案可對。以上是本館的讀法，不是遊戲設定。' }),
      K.h('div.save-row', K.h('a.btn.pri', { href: '#journal', text: '看我的紀年' }), K.h('a.btn', { href: '#story/' + SC[0].ch + '/' + plateNo(SC[0]), text: '從第一個時刻走一遍' })));
    if (head) head.after(res); else tl.prepend(res);
  });

  /* ---- 我的紀年 ---- */
  function entries() {
    const d = Case.d;
    return CH.map(c => {
      const picks = SC.filter(s => s.ch === c.id).map(s => {
        const p = pickOf(s); if (!p) return { s, t: s.when + '。這裡有一個時刻，你還沒有選。', none: true };
        const cmp = !s.canon ? '這一題沒有可以對照的答案。' : p === s.canon ? '主線裡，她也是。' : '主線裡，她選的是：' + text(s, s.canon) + '。';
        return { s, t: s.when + '。你選了：' + text(s, p) + '。' + cmp, why: fa().why[s.id] || '' };
      });
      const st = [], seen = A.Reader ? A.Reader.seenN(c.id) : 0, all = A.Reader ? A.Reader.plates(c).length : 0;
      if (d.read[c.id]) st.push('蓋章　' + fmtDate(d.read[c.id]));
      if (A.Story && A.Story.doneAt(c.id)) st.push('親歷　' + fmtDate(A.Story.doneAt(c.id)));
      if (seen) st.push('底片　' + seen + ' ／ ' + all);
      const note = d.notes[c.id] || '';
      return { c, picks, st, note, blank: !st.length && !note && picks.every(p => p.none) };
    });
  }
  function summary() {
    const d = Case.d, n = Object.keys(d.read).length, done = SC.every(pickOf), parts = [];
    parts.push((d.name || '無名的記錄員') + '，' + fmtDate(d.since) + ' 到任。');
    parts.push('十四章裡蓋了 ' + n + ' 枚戳記' + (A.Story ? '，親歷過 ' + A.Story.done() + ' 章' : '') + '。');
    if (done) parts.push('八個時刻都選了。能對照的七次裡，' + sameN() + ' 次和她同路（' + kind()[1] + '）。');
    else parts.push('八個時刻選了 ' + SC.filter(pickOf).length + ' 個。');
    if (d.mine) parts.push('你的暴雨是' + ORD[d.mine.storm] + '暴雨（' + SD[d.mine.storm].f + ' → ' + SD[d.mine.storm].t + '）。');
    return parts;
  }
  function asText() {
    const out = ['逆雨檔案館｜我的紀年', '', summary().join(''), ''];
    entries().forEach(e => { if (e.blank) return; out.push('■ ' + e.c.no + '〈' + e.c.zh + '〉　' + e.c.meta); if (e.st.length) out.push(e.st.join('　')); e.picks.forEach(p => { out.push(p.t); if (p.why) out.push('　理由：' + p.why); }); if (e.note) out.push('手記：' + e.note); out.push(''); });
    return out.join('\n');
  }
  let box = null, built = false;
  function paint() {
    if (!box) return; box.textContent = ''; const es = entries(), blankAll = es.every(e => e.blank);
    box.append(K.h('div.jr-top', K.h('p', { text: summary().join('') }),
      K.h('div.save-row', K.h('button.btn.pri', { type: 'button', text: '複製全文', onclick: () => A.copyText(asText()) }), K.h('button.btn', { type: 'button', text: '下載文字檔', onclick: () => K.download('nyjn-journal.txt', new Blob([asText()], { type: 'text/plain;charset=utf-8' })) }),
        A.Share ? K.h('button.btn', { type: 'button', text: '下載圖卡', onclick: () => A.Share.card({ kicker: 'MY CHRONICLE — 我的紀年', title: Case.d.name || '無名的記錄員', lead: true, lines: summary().slice(1), shot: Case.d.mine ? A.stormShot(Case.d.mine.storm) : { p: 'umbrella', a: {}, cues: [] }, name: 'nyjn-journal' }) }) : null,
        K.h('a.btn', { href: '#choices', text: '司辰的抉擇' }))));
    if (blankAll) box.append(K.h('p.empty', { text: '這一頁還是白的。讀一章，蓋一枚戳記，選一次，寫一行。它們會自己排到這裡來。' }));
    const list = K.h('div.jr-list');
    es.forEach(e => {
      const body = K.h('div.jr-body');
      if (e.st.length) body.append(K.h('div.jr-st', e.st.map(t => K.h('span', { text: t }))));
      e.picks.forEach(p => { body.append(K.h('div.jr-pick' + (p.none ? '.none' : ''), K.h('p', { text: p.t }), p.why ? K.h('p.jr-why', { text: '理由：' + p.why }) : null, K.h('a.tiny', { href: '#story/' + p.s.ch + '/' + plateNo(p.s), text: p.none ? '到那一刻去選' : '回到這一刻' }))); });
      if (e.note) body.append(K.h('p.jr-note', { text: e.note }));
      if (e.blank) body.append(K.h('p.jr-none', { text: '這一章，你還沒留下什麼。' }));
      body.append(K.h('div.save-row', K.h('a.tiny', { href: '#story/' + e.c.id, text: '親歷這一章' }), K.h('a.tiny', { href: '#' + e.c.id, text: '到展間' })));
      list.append(K.h('article.jr-ch' + (e.blank ? '.blank' : ''), K.h('div.jr-h', K.h('span.lab', { text: e.c.no }), K.h('b', { text: e.c.zh }), K.h('span.jr-m', { text: e.c.meta })), body));
    });
    box.append(list);
  }
  function build() {
    built = true; box = K.h('div.jr', { id: 'journal-box' });
    $('main').append(K.h('section.room', { id: 'r-journal', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'My Chronicle', text: '我的紀年' }), K.h('p.sub', { text: '她的那一份在放映廳。這一份是你的，只留在這台裝置上。' })), K.h('div.no', { text: '19' })), box)));
  }
  if (A.Game) A.Game.room('journal', '我的紀年', '她的那一份在放映廳。這一份是你的。');
  else A.ROOMS.splice(Math.max(0, A.ROOMS.length - 1), 0, ['journal', '我的紀年', '她的那一份在放映廳。這一份是你的。']);
  A.addRoom('journal', 'r-journal', () => { if (!built) build(); paint(); });
  A.on('ready', () => { if (!built) build(); });
  A.on('import', () => { if (A.cur === 'journal') paint(); });
  A.on('status', o => { if (o.id === 'journal') { const n = entries().filter(e => !e.blank).length; o.s = n ? n + ' 章有紀錄' : ''; } });

  A.Fate = { kind, sameN, asText };
})();
