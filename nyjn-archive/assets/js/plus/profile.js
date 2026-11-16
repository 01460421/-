'use strict';
/* ---------- 記錄員檔案：這一位記錄員做過什麼 ----------
   把散在各處的數字收成一頁：等級、稱號、底片冊、委託、遊藝室的最高分。
   封面是底片冊裡挑的一張（在底片冊點開底片，按「設為檔案封面」）。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, CH, Plates, pad, fmtDate } = A, G = A.Game, D = A.Dark;
  const cnt = o => Object.keys(o || {}).length;
  const cover = () => { const p = D.BY[D.bag().fav]; return p && D.own(p.key) ? p : null; };
  const coverShot = () => { const p = cover(); return p ? p.shot : { p: 'umbrella', a: {}, cues: [] }; };
  function stats() {
    const d = Case.d, s = A.Reader ? A.Reader.streak() : { n: 0, best: 0 };
    return [['到任', fmtDate(d.since)], ['來訪', d.visits + ' 天'], ['連續來訪最長', (s.best || 0) + ' 天'], ['章節戳記', cnt(d.read) + ' ／ ' + CH.length], ['徽記', A.Rank ? A.Rank.count() + ' ／ ' + A.Rank.total : '—'],
      ['底片冊', D.count() + ' ／ ' + D.total], ['沖洗', D.bag().n + ' 張'], ['完成委託', (A.Quests ? A.Quests.done() : 0) + ' 項'], ['簽到', (A.Quests ? A.Quests.signN() : 0) + ' 天'],
      ['遊藝室', G.stat('arcade') + ' 場'], ['入館考核最高', A.Quiz && A.Quiz.stats().plays ? A.Quiz.stats().best + ' ／ 10' : '還沒考過'], ['看過的底片', (A.Reader ? A.Reader.seenTotal() : 0) + ' ／ ' + (A.Reader ? A.Reader.plateTotal() : D.total)]];
  }
  function download() {
    if (!A.Share) return; const L = G.level(), t = A.Shop ? A.Shop.title() : '', r = A.Rank ? A.Rank.rank().name : '記錄員';
    A.Share.card({ kicker: 'PERSONNEL FILE — 記錄員檔案　LV ' + L.lv, title: Case.d.name || '無名的記錄員', lead: true,
      lines: [(t ? t + '　' : '') + r, '底片冊 ' + D.count() + ' ／ ' + D.total + '　徽記 ' + (A.Rank ? A.Rank.count() : 0) + ' ／ ' + (A.Rank ? A.Rank.total : 23) + '　章節戳記 ' + cnt(Case.d.read) + ' ／ ' + CH.length, '到任 ' + fmtDate(Case.d.since) + '　來訪 ' + Case.d.visits + ' 天　完成委託 ' + (A.Quests ? A.Quests.done() : 0) + ' 項'],
      shot: coverShot(), name: 'nyjn-profile' });
  }

  let box = null, built = false;
  function paint() {
    if (!box) return; const d = Case.d, c = cover(), L = G.level(), title = A.Shop ? A.Shop.title() : ''; box.textContent = '';
    const fig = K.h('figure.plate.pf-cover'), cv = document.createElement('canvas'); cv.width = 960; cv.height = 600;
    fig.append(cv, K.h('figcaption', K.h('span.kick', { text: 'PERSONNEL FILE　NO. ' + String(d.since).slice(-6) }), K.h('b', { text: d.name || '無名的記錄員' }), K.h('span', { text: [title, A.Rank ? A.Rank.rank().name : '', 'Lv.' + L.lv].filter(Boolean).join('　') })));
    const name = K.h('input.inp', { id: 'pf-name', type: 'text', maxlength: '16', placeholder: '記錄員的名字', autocomplete: 'off', value: d.name });
    name.addEventListener('input', () => { Case.d.name = name.value.trim().slice(0, 16); Case.save(); fig.querySelector('figcaption b').textContent = Case.d.name || '無名的記錄員'; });
    const side = K.h('div.pf-side', G.strip(),
      K.h('label.pf-name', { for: 'pf-name' }, K.h('span.lab', { text: '姓名（和手提箱的記錄員證是同一個）' }), name),
      K.h('p.pf-cv', { text: c ? '封面：' + D.label(c) + '〈' + c.c.zh + '〉' : '封面還是預設的那一張。在底片冊點開任何一張持有的底片，可以設為封面。' }),
      K.h('div.save-row', K.h('button.btn.pri', { type: 'button', text: '下載檔案圖卡', onclick: download }), K.h('a.btn', { href: '#album', text: '換封面' }), K.h('a.btn', { href: '#shop', text: '換稱號' }), K.h('a.btn', { href: '#case', text: '手提箱' })));
    box.append(K.h('div.pf-top', fig, side));
    box.append(K.h('section.pf-sec', K.h('div.q-h', K.h('h3', { text: '紀錄' }), K.h('span.lab', { text: '都存在這台裝置的手提箱裡' })), K.h('dl.pf-stats', stats().map(s => K.h('div', K.h('dt', { text: s[0] }), K.h('dd', { text: s[1] }))))));
    if (A.Arcade) {
      const rows = A.Arcade.games().map(g => { const b = A.Arcade.best(g.id); return K.h('tr', K.h('th', { scope: 'row' }, K.h('a.lnk', { href: '#arcade/' + g.id, text: g.name })), K.h('td', { text: b == null ? '—' : String(b) }), K.h('td', { text: b == null ? '還沒玩過' : A.Arcade.grade(b)[1] }), K.h('td', { text: G.stat('arc_' + g.id) + ' 場' })); });
      box.append(K.h('section.pf-sec', K.h('div.q-h', K.h('h3', { text: '遊藝室' }), K.h('span.lab', { text: '最高分' })), K.h('div.pf-scroll', K.h('table.pf-arc', K.h('thead', K.h('tr', K.h('th', { text: '遊戲' }), K.h('th', { text: '最高分' }), K.h('th', { text: '評等' }), K.h('th', { text: '場次' }))), K.h('tbody', rows)))));
    }
    Plates.mount(cv, coverShot(), 16);
  }
  function build() {
    built = true; box = K.h('div.pf', { id: 'profile-box' });
    $('main').append(K.h('section.room', { id: 'r-profile', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'Personnel File', text: '記錄員檔案' }), K.h('p.sub', { text: '等級、稱號，和這位記錄員到任以來做過的事。' })), K.h('div.no', { text: '18' })), box)));
  }
  G.room('profile', '記錄員檔案', '等級、稱號，和到任以來的紀錄。');
  A.addRoom('profile', 'r-profile', () => { if (!built) build(); paint(); });
  A.on('ready', () => { if (!built) build(); });
  A.on('import', () => { if (A.cur === 'profile') paint(); });
  A.on('status', o => { if (o.id === 'profile') o.s = 'Lv.' + G.level().lv; });
  G.menu({ id: 'profile', name: '記錄員檔案', en: 'Personnel File', desc: '等級、稱號，和到任以來做過的事。', shot: { p: 'school', a: {}, cues: [] }, status: () => 'Lv.' + G.level().lv + (A.Shop && A.Shop.title() ? '　' + A.Shop.title() : '') });
})();
