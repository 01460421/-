'use strict';
/* ---------- 交換所：碎片換來的東西 ----------
   只賣看得見、不影響進度的東西：全館的主題色、掛在名字底下的稱號，還有把碎片換回顯影劑。
   有些稱號不賣，要做到某件事才會解鎖。 */
(function () {
  const A = window.__A, K = A.K, { $, Case } = A, G = A.Game;
  const sp = () => K.bag('sp', { own: {}, title: '', accent: '' });
  /* 主題色：換掉藍印（--mark）。實際的顏色寫在 game.css，亮暗各一組 */
  const ACCENT = [['', '藍印', '館裡原本的顏色', 0], ['amber', '琥珀', '舊相紙放久了的顏色', 120], ['moss', '苔綠', '雨停之後牆角的顏色', 120], ['crimson', '緋紅', '暗房安全燈的顏色', 120], ['ink', '純墨', '不要顏色，只留黑白', 80]];
  /* 稱號：[id, 名稱, 怎麼來, 價錢或 0, 解鎖條件] */
  const TITLE = [
    ['t_umb', '撐傘的人', '', 40], ['t_dark', '暗房常客', '', 60], ['t_rain', '追雨的人', '', 80], ['t_page', '翻底片的人', '', 80],
    ['t_night', '夜班記錄員', '在午夜到凌晨四點之間來訪', 0, () => !!(A.Reader && A.Reader.streak().night)],
    ['t_arc', '遊藝室的熟客', '在遊藝室玩滿 20 場', 0, () => G.stat('arcade') >= 20],
    ['t_full', '把底片冊填滿的人', '底片冊全部收齊', 0, () => A.Dark && A.Dark.count() >= A.Dark.total],
    ['t_keeper', '代理司辰', '升到 Lv.20', 0, () => G.level().lv >= 20]];
  const SUPPLY = { cost: 30, dev: 120 };
  const has = id => id === '' || !!sp().own[id];
  const unlocked = t => !t[4] || (() => { try { return !!t[4](); } catch (e) { return false; } })();
  function applyAccent() { const a = sp().accent, r = document.documentElement; if (a && has(a)) r.dataset.accent = a; else delete r.dataset.accent; }
  function buy(id, cost, name) {
    if (has(id)) return true;
    if (!G.spend('shard', cost)) { A.toast('碎片不夠。「' + name + '」要 ' + G.SHD + ' ' + cost + '。'); return false; }
    sp().own[id] = Date.now(); Case.save(); G.bump('buy'); if (A.Snd) A.Snd.cue('chime'); A.toast('換到了「' + name + '」。');
    return true;
  }

  let box = null, built = false;
  function paint() {
    if (!box) return; const b = sp(), g = G.gm(); box.textContent = '';
    box.append(K.h('div.sp-top', K.h('p', { text: '這裡只收碎片。重複沖到的底片會折成碎片；收齊一章、完成長期委託也會給。' }), K.h('dl.g-wallet', K.h('div', K.h('dt', { text: G.SHD + ' 碎片' }), K.h('dd', { text: G.fmt(g.shard) })), K.h('div', K.h('dt', { text: G.DEV + ' 顯影劑' }), K.h('dd', { text: G.fmt(g.dev) })))));
    /* 主題色 */
    const ag = K.h('div.sp-grid');
    ACCENT.forEach(a => {
      const own = has(a[0]), on = (b.accent || '') === a[0];
      const btn = on ? K.h('span.q-done', { text: '使用中' }) : own ? K.h('button.btn.sm', { type: 'button', text: '換上', onclick: () => { sp().accent = a[0]; Case.save(); applyAccent(); paint(); } })
        : K.h('button.btn.sm.pri', { type: 'button', text: G.SHD + ' ' + a[3], disabled: g.shard < a[3], onclick: () => { if (buy(a[0], a[3], a[1])) { sp().accent = a[0]; Case.save(); applyAccent(); paint(); G.repaint(); } } });
      ag.append(K.h('div.sp-item' + (on ? '.on' : ''), K.h('i.sp-sw', { 'data-accent': a[0] || 'blue', 'aria-hidden': 'true' }), K.h('div', K.h('b', { text: a[1] }), K.h('span', { text: a[2] })), btn));
    });
    box.append(K.h('section.sp-sec', K.h('div.q-h', K.h('h3', { text: '主題色' }), K.h('span.lab', { text: '換掉全館的強調色，亮暗兩種外觀都有' })), ag));
    /* 稱號 */
    const tg = K.h('div.sp-grid');
    TITLE.forEach(t => {
      const free = !t[3], ok = unlocked(t), own = free ? ok : has(t[0]), on = b.title === t[0];
      const btn = on ? K.h('button.btn.sm', { type: 'button', text: '卸下', onclick: () => { sp().title = ''; Case.save(); paint(); G.repaint(); } })
        : own ? K.h('button.btn.sm', { type: 'button', text: '掛上', onclick: () => { sp().title = t[0]; Case.save(); paint(); G.repaint(); } })
          : free ? K.h('span.lab', { text: '未解鎖' }) : K.h('button.btn.sm.pri', { type: 'button', text: G.SHD + ' ' + t[3], disabled: g.shard < t[3], onclick: () => { if (buy(t[0], t[3], t[1])) { sp().title = t[0]; Case.save(); paint(); G.repaint(); } } });
      tg.append(K.h('div.sp-item' + (on ? '.on' : '') + (own ? '' : '.lock'), K.h('div', K.h('b', { text: t[1] }), K.h('span', { text: free ? t[2] : '掛在名字底下' })), btn));
    });
    box.append(K.h('section.sp-sec', K.h('div.q-h', K.h('h3', { text: '稱號' }), K.h('span.lab', { text: '掛上之後出現在值勤台和檔案；有些要做到某件事才有' })), tg));
    /* 補給 */
    const sb = K.h('button.btn.sm.pri', { type: 'button', text: G.SHD + ' ' + SUPPLY.cost, disabled: g.shard < SUPPLY.cost, onclick: () => { if (!G.spend('shard', SUPPLY.cost)) return; G.give({ dev: SUPPLY.dev }, '補給'); paint(); } });
    box.append(K.h('section.sp-sec', K.h('div.q-h', K.h('h3', { text: '補給' }), K.h('span.lab', { text: '可以一直換' })), K.h('div.sp-grid', K.h('div.sp-item', K.h('div', K.h('b', { text: '顯影劑 ' + G.DEV + ' ' + SUPPLY.dev }), K.h('span', { text: '剛好沖洗一張' })), sb))));
  }
  function build() {
    built = true; box = K.h('div.sp', { id: 'shop-box' });
    $('main').append(K.h('section.room', { id: 'r-shop', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'The Exchange', text: '交換所' }), K.h('p.sub', { text: '用碎片換主題色和稱號。這裡賣的東西都只影響外觀。' })), K.h('div.no', { text: '17' })), box)));
  }
  G.room('shop', '交換所', '用碎片換主題色和稱號。');
  A.addRoom('shop', 'r-shop', () => { if (!built) build(); paint(); });
  A.on('ready', () => { if (!built) build(); applyAccent(); });
  A.on('import', applyAccent); A.on('wipe', applyAccent);
  A.on('gain', () => { if (A.cur === 'shop') paint(); });
  G.menu({ id: 'shop', name: '交換所', en: 'The Exchange', desc: '用碎片換主題色和稱號。', shot: { p: 'amber', a: {}, cues: [] }, status: () => G.SHD + ' ' + G.fmt(G.gm().shard) });

  A.Shop = { title: () => { const t = TITLE.find(x => x[0] === sp().title); return t && (t[3] ? has(t[0]) : unlocked(t)) ? t[1] : ''; }, accent: () => sp().accent || '', applyAccent };
})();
