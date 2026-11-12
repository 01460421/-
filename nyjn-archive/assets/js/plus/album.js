'use strict';
/* ---------- 底片冊：沖洗出來的底片收在這裡 ----------
   照章節排。還沒有的那幾格看得到星等，看不到畫面；
   點任何一格看它的來歷，缺的可以用碎片指定顯影。一章收齊有一份獎勵。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, CH, Plates, pad, fmtDate } = A, G = A.Game, D = A.Dark;
  const SET = { dev: 150, shard: 20 };
  const al = () => K.bag('al', { set: {}, show: 'all' });
  const ofCh = c => D.POOL.filter(p => p.c.id === c.id);
  const done = c => ofCh(c).every(p => D.own(p.key) > 0);
  const claimable = () => CH.filter(c => done(c) && !al().set[c.id]).length;

  function open(key) {
    const p = D.BY[key]; if (!p) return;
    const dlg = K.dialog({ title: D.label(p), cls: 'dlg-plate', build(body, api) {
      const have = D.own(key), fig = K.h('figure.plate' + (have ? '' : '.al-lock')), cv = document.createElement('canvas'); cv.width = 960; cv.height = 600; fig.append(cv);
      if (!have) fig.append(K.h('span.al-q', { text: '？' }));
      const rows = K.h('dl.al-meta',
        K.h('div', K.h('dt', { text: '星等' }), K.h('dd', { text: D.stars(p.star) + '　' + D.NAME[p.star] })),
        K.h('div', K.h('dt', { text: '章節' }), K.h('dd', { text: p.c.no + '〈' + p.c.zh + '〉' })),
        have ? K.h('div', K.h('dt', { text: '地點' }), K.h('dd', { text: [p.shot.loc, p.shot.date].filter(Boolean).join('　') || '—' })) : null,
        K.h('div', K.h('dt', { text: '持有' }), K.h('dd', { text: have ? have + ' 張' + (D.at(key) ? '，第一張沖於 ' + fmtDate(D.at(key)) : '') : '還沒有' })));
      const act = K.h('div.save-row');
      if (have) {
        const fav = K.h('button.btn', { type: 'button', text: D.bag().fav === key ? '已經是檔案封面' : '設為檔案封面', disabled: D.bag().fav === key });
        fav.onclick = () => { D.bag().fav = key; Case.save(); fav.textContent = '已經是檔案封面'; fav.disabled = true; A.toast('檔案的封面，換上這一張了。'); };
        act.append(K.h('a.btn.pri', { href: '#' + p.c.id + '/' + (p.i + 1), text: '到展間看這一張', onclick: () => api.close() }), fav);
      } else {
        const cost = D.CRAFT[p.star], b = K.h('button.btn.pri', { type: 'button', text: '指定顯影　' + G.SHD + ' ' + cost, disabled: G.gm().shard < cost });
        b.onclick = () => { if (D.craft(key)) { api.close(); paint(); open(key); } };
        act.append(b, K.h('a.btn', { href: '#darkroom', text: '去暗房碰運氣', onclick: () => api.close() }));
        if (G.gm().shard < cost) act.append(K.h('span.lab', { text: '碎片還差 ' + (cost - G.gm().shard) }));
      }
      body.append(K.h('div.al-detail', fig, K.h('div', rows, have && p.shot.cues[0] ? K.h('p.al-cue', { text: p.shot.cues[0] }) : K.h('p.al-cue.dim', { text: '還沒沖出來。拍的是什麼，沒有人知道。' }), act)));
      if (have) Plates.mount(cv, p.shot); else Plates.still(cv, { p: 'rain', a: {}, cues: [] });
    } });
    return dlg;
  }

  let box = null, built = false;
  function paint() {
    if (!box) return; const b = al(), n = D.count(); box.textContent = '';
    const by = s => D.POOL.filter(p => p.star === s), got = s => by(s).filter(p => D.own(p.key) > 0).length;
    const tab = (id, text) => K.h('button' + (b.show === id ? '.on' : ''), { type: 'button', text, 'aria-pressed': b.show === id ? 'true' : 'false', onclick: () => { b.show = id; Case.save(); paint(); } });
    box.append(K.h('div.al-top',
      K.h('div.al-prog', K.h('span.lab', { text: 'COLLECTED — 已收' }), K.h('b', { text: n + ' ／ ' + D.total }), K.h('div.g-bar', { role: 'img', 'aria-label': '已收 ' + n + ' 張，共 ' + D.total + ' 張' }, K.h('i', { style: 'width:' + (n / D.total * 100).toFixed(1) + '%' }))),
      K.h('dl.al-tiers', [6, 5, 4, 3].map(s => K.h('div', K.h('dt', { text: D.stars(s) }), K.h('dd', { text: got(s) + '／' + by(s).length })))),
      K.h('div.tabs.al-tabs', { role: 'group', 'aria-label': '顯示' }, tab('all', '全部'), tab('have', '已收'), tab('miss', '還缺'))));
    let drawn = 0;
    CH.forEach(c => {
      const all = ofCh(c), list = all.filter(p => b.show === 'all' || (b.show === 'have') === (D.own(p.key) > 0)); if (!list.length) return;
      const have = all.filter(p => D.own(p.key) > 0).length, full = have === all.length, claimed = !!b.set[c.id];
      const head = K.h('div.al-h', K.h('h3', { text: c.no + '　' + c.zh }), K.h('span.lab', { text: have + ' ／ ' + all.length }));
      if (full && !claimed) head.append(K.h('button.btn.sm.pri', { type: 'button', text: '這一章齊了，簽收', onclick: () => { if (al().set[c.id]) return; al().set[c.id] = Date.now(); G.give(SET, c.no + '收齊'); paint(); G.repaint(); } }));
      else if (claimed) head.append(K.h('span.al-done', { text: '已收齊' }));
      const grid = K.h('div.al-grid');
      list.forEach(p => {
        const own = D.own(p.key), cv = document.createElement('canvas'); cv.width = 320; cv.height = 200;
        const cell = K.h('button.al-cell.s' + p.star + (own ? '' : '.miss'), { type: 'button', 'aria-label': D.label(p) + '，' + p.star + ' 星，' + (own ? '持有 ' + own + ' 張' : '還沒有'), onclick: () => open(p.key) },
          K.h('span.al-fig', cv, own ? null : K.h('span.al-q', { text: '？' })), K.h('span.al-st', { text: D.stars(p.star) }), K.h('span.al-n', { text: 'PL.' + pad(p.i + 1) + (own > 1 ? '　×' + own : '') }));
        if (own) setTimeout(() => { if (cv.isConnected) Plates.still(cv, p.shot); }, 30 + 22 * drawn++);
        grid.append(cell);
      });
      box.append(K.h('section.al-ch', head, grid));
    });
    if (!box.querySelector('.al-ch')) box.append(K.h('p.empty', { text: b.show === 'have' ? '冊子還是空的。暗房在隔壁。' : '一張都不缺了。' }));
  }
  function build() {
    built = true; box = K.h('div.al', { id: 'album-box' });
    $('main').append(K.h('section.room', { id: 'r-album', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'The Album', text: '底片冊' }), K.h('p.sub', { text: '七十八格，照章節排。空著的那幾格，雨還沒還回來。' })), K.h('div.no', { text: '15' })), box)));
  }
  G.room('album', '底片冊', '七十八格。空著的那幾格，雨還沒還回來。');
  A.addRoom('album', 'r-album', arg => { if (!built) build(); paint(); if (arg && D.BY[arg]) open(arg); });
  A.on('ready', () => { if (!built) build(); });
  A.on('pulled', () => { if (A.cur === 'album') paint(); });
  A.on('import', () => { if (A.cur === 'album') paint(); });
  A.on('status', o => { if (o.id === 'album') o.s = D.count() ? D.count() + '／' + D.total : ''; });
  G.menu({ id: 'album', name: '底片冊', en: 'The Album', desc: '七十八格。空著的那幾格，雨還沒還回來。', shot: { p: 'pages', a: {}, cues: [] }, status: () => '已收 ' + D.count() + ' ／ ' + D.total, dot: claimable });
  G.claims('album', claimable);

  A.Album = { open, claimable, done };
})();
