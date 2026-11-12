'use strict';
/* ---------- 委託：每天、每週、長期，加上簽到 ----------
   委託不另外記進度：全部從 A.Game 的計數和手提箱裡原本就有的紀錄算出來，
   所以舊訪客一進來，長期委託就已經照他做過的事打好勾，只差按領取。
   每日的四項從題庫裡照日期抽（同一天每個人抽到的一樣）；每週的固定。
   刻意不放「發文」「按共鳴」這類委託：有報酬的話，接龍和展牆會被灌水。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, CH, pad } = A, G = A.Game;
  const qs = () => K.bag('qs', { day: '', dc: {}, dall: 0, wk: '', wc: {}, mc: {}, sign: { last: '', n: 0 }, done: 0 });
  const cnt = o => Object.keys(o || {}).length;

  /* [id, 說明, 計數, 目標, 顯影劑, 去哪裡做] */
  const DAILY = [
    ['d_plate', '在展間看 6 張底片', 'plate', 6, 60, 'chapters'], ['d_film', '在放映廳看 3 分鐘', 'filmSec', 180, 70, 'film'], ['d_quiz', '完成一輪入館考核', 'quiz', 1, 70, 'quiz'],
    ['d_arc', '在遊藝室玩 2 場', 'arcade', 2, 60, 'arcade'], ['d_pull', '在暗房沖洗 1 張底片', 'pull', 1, 50, 'darkroom'], ['d_era', '在暴雨年表走過 4 場雨', 'era', 4, 50, 'chronicle'],
    ['d_arcA', '在遊藝室拿到一次「優」', 'arcadeA', 1, 80, 'arcade'], ['d_quiz7', '入館考核拿到 7 分以上', 'quiz7', 1, 80, 'quiz']];
  const WEEKLY = [
    ['w_plate', '看 40 張底片', 'plate', 40, 200, 'chapters'], ['w_pull', '沖洗 10 張底片', 'pull', 10, 250, 'darkroom'], ['w_arc', '在遊藝室玩 10 場', 'arcade', 10, 250, 'arcade'],
    ['w_quiz', '完成 3 輪入館考核', 'quiz', 3, 200, 'quiz'], ['w_film', '在放映廳看 15 分鐘', 'filmSec', 900, 250, 'film']];
  const DBONUS = { dev: 100, shard: 10, xp: 30 }, SIGN = [100, 100, 150, 100, 150, 100, 300];
  const unit = (k, n) => k === 'filmSec' ? Math.floor(n / 60) + ' 分' : String(n);

  /* 長期：[id, 說明, () => [現在, 目標], 報酬, 去哪裡] */
  const d = () => Case.d;
  const arcGot = min => A.Arcade ? A.Arcade.games().filter(g => { const b = A.Arcade.best(g.id); return b != null && b >= min; }).length : 0;
  const arcN = () => A.Arcade ? A.Arcade.games().length : 4;
  const MAIN = [
    ['m_stamp1', '蓋下第一枚戳記', () => [cnt(d().read), 1], { dev: 150 }, 'chapters'], ['m_stamp7', '蓋滿七章', () => [cnt(d().read), 7], { dev: 300 }, 'chapters'], ['m_stamp14', '十四章全部蓋章', () => [cnt(d().read), 14], { dev: 600, shard: 60 }, 'chapters'],
    ['m_film', '把紀錄片放到尾聲', () => [K.bag('fm', { fin: 0 }).fin ? 1 : 0, 1], { dev: 400 }, 'film'],
    ['m_choices', '做完司辰的八個抉擇', () => [SC.filter(s => d().choices[s.id]).length, SC.length], { dev: 300 }, 'choices'], ['m_mine', '走過自己的雨', () => [d().mine ? 1 : 0, 1], { dev: 200 }, 'rain'],
    ['m_quiz8', '入館考核拿到 8 分', () => [A.Quiz ? A.Quiz.stats().best : 0, 8], { dev: 300 }, 'quiz'],
    ['m_badge5', '取得 5 枚徽記', () => [A.Rank ? A.Rank.count() : 0, 5], { dev: 200 }, 'case'], ['m_badge12', '取得 12 枚徽記', () => [A.Rank ? A.Rank.count() : 0, 12], { dev: 400, shard: 40 }, 'case'], ['m_badge23', '取得全部 23 枚徽記', () => [A.Rank ? A.Rank.count() : 0, 23], { dev: 1000, shard: 150 }, 'case'],
    ['m_alb20', '底片冊收到 20 張', () => [A.Dark.count(), 20], { dev: 200 }, 'album'], ['m_alb40', '底片冊收到 40 張', () => [A.Dark.count(), 40], { dev: 300, shard: 30 }, 'album'], ['m_alb60', '底片冊收到 60 張', () => [A.Dark.count(), 60], { dev: 400, shard: 60 }, 'album'], ['m_albAll', '底片冊全部收齊', () => [A.Dark.count(), A.Dark.total], { dev: 1000, shard: 200 }, 'album'],
    ['m_lv5', '升到 Lv.5', () => [G.level().lv, 5], { dev: 200 }, 'profile'], ['m_lv15', '升到 Lv.15', () => [G.level().lv, 15], { dev: 500 }, 'profile'], ['m_lv30', '升到 Lv.30', () => [G.level().lv, 30], { dev: 1000, shard: 100 }, 'profile'],
    ['m_arc4', '遊藝室的每個遊戲各玩一場', () => [arcGot(0), arcN()], { dev: 200 }, 'arcade'], ['m_arcA', '遊藝室的每個遊戲都拿過「優」', () => [arcGot(85), arcN()], { dev: 500, shard: 50 }, 'arcade']];

  /* 今天抽到哪四項：用日期當種子洗牌 */
  function todays() { let s = Math.abs(A.hashStr(K.day())) || 1; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, a = DAILY.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, 4); }
  function roll() { const b = qs(), t = K.day(), w = G.weekId(); if (b.day !== t) { b.day = t; b.dc = {}; b.dall = 0; } if (b.wk !== w) { b.wk = w; b.wc = {}; } return b; }
  const prog = (q, scope) => Math.min(q[3], G.stat(q[2], scope));
  const mprog = m => { let v = [0, 1]; try { v = m[2](); } catch (e) { /* 那個模組還沒好 */ } return [Math.min(v[0], v[1]), v[1]]; };
  const signable = () => roll().sign.last !== K.day();
  function open() {
    const b = roll(), day = todays();
    const dOpen = day.filter(q => !b.dc[q[0]] && prog(q, 'day') >= q[3]), wOpen = WEEKLY.filter(q => !b.wc[q[0]] && prog(q, 'week') >= q[3]), mOpen = MAIN.filter(m => { if (b.mc[m[0]]) return false; const v = mprog(m); return v[0] >= v[1]; });
    const bonus = !b.dall && day.every(q => b.dc[q[0]]);
    return { b, day, dOpen, wOpen, mOpen, bonus, n: dOpen.length + wOpen.length + mOpen.length + (bonus ? 1 : 0) + (signable() ? 1 : 0) };
  }
  const tick = n => { qs().done += n; };
  function claimQ(kind, q) { const b = roll(), bag = kind === 'd' ? b.dc : b.wc; if (bag[q[0]] || prog(q, kind === 'd' ? 'day' : 'week') < q[3]) return; bag[q[0]] = 1; tick(1); G.give({ dev: q[4], xp: kind === 'd' ? 20 : 40 }, '委託完成'); }
  function claimM(m) { const b = roll(), v = mprog(m); if (b.mc[m[0]] || v[0] < v[1]) return; b.mc[m[0]] = Date.now(); tick(1); G.give(Object.assign({ xp: 60 }, m[3]), '長期委託'); }
  function claimBonus() { const o = open(); if (!o.bonus) return; o.b.dall = 1; G.give(DBONUS, '今日委託全部完成'); }
  function sign() { const b = roll(); if (!signable()) return; const i = b.sign.n % 7; b.sign.last = K.day(); b.sign.n++; G.give({ dev: SIGN[i], shard: i === 6 ? 30 : 0, xp: 15 }, '簽到第 ' + (i + 1) + ' 天'); if (A.Snd) A.Snd.cue('chime'); }
  function claimAll() { const o = open(); if (signable()) sign(); o.dOpen.forEach(q => claimQ('d', q)); o.wOpen.forEach(q => claimQ('w', q)); o.mOpen.forEach(claimM); claimBonus(); after(); }
  function after() { Case.save(); paint(); G.repaint(); }

  /* ---- 畫面 ---- */
  let box = null, built = false;
  const pay = r => [r.dev ? G.DEV + ' ' + G.fmt(r.dev) : '', r.shard ? G.SHD + ' ' + r.shard : ''].filter(Boolean).join('　');
  function row(text, cur, max, reward, state, onClaim, to, curText) {
    const btn = state === 'open' ? K.h('button.btn.sm.pri', { type: 'button', text: '領取', onclick: onClaim }) : state === 'done' ? K.h('span.q-done', { text: '已領取' }) : K.h('a.btn.sm', { href: '#' + to, text: '前往' });
    return K.h('li.q-row.' + state, K.h('div.q-main', K.h('b', { text }), K.h('div.g-bar', { role: 'img', 'aria-label': '進度 ' + cur + ' ／ ' + max }, K.h('i', { style: 'width:' + Math.round(cur / max * 100) + '%' })), K.h('span.q-n', { text: curText || cur + ' ／ ' + max })), K.h('span.q-pay', { text: reward }), btn);
  }
  function until(ms) { const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4); return h >= 24 ? Math.floor(h / 24) + ' 天 ' + (h % 24) + ' 小時' : h + ' 小時 ' + m + ' 分'; }
  function paint() {
    if (!box) return; const o = open(), b = o.b, now = new Date(); box.textContent = '';
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now, monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (8 - (now.getDay() || 7))) - now;
    /* 簽到：七天一輪，漏了不會歸零 */
    const can = signable(), at = can ? b.sign.n % 7 : ((b.sign.n - 1) % 7 + 7) % 7, filled = can ? at : at + 1;
    box.append(K.h('div.q-sign', K.h('div.q-h', K.h('h3', { text: '簽到' }), K.h('span.lab', { text: '累計 ' + b.sign.n + ' 天　七天一輪，漏了不會歸零' })),
      K.h('ol.q-days', SIGN.map((v, i) => K.h('li' + (i < filled ? '.got' : '') + (can && i === at ? '.now' : ''), K.h('small', K.h('i', { text: '第 ' }), String(i + 1), K.h('i', { text: ' 天' })), K.h('b', K.h('i', { text: G.DEV + ' ' }), String(v)), i === 6 ? K.h('small', { text: G.SHD + ' 30' }) : null))),
      K.h('div.save-row', can ? K.h('button.btn.pri', { type: 'button', text: '今天簽到', onclick: () => { sign(); after(); } }) : K.h('span.q-done', { text: '今天簽過了' }), o.n > (can ? 1 : 0) ? K.h('button.btn', { type: 'button', text: '全部領取（' + o.n + '）', onclick: claimAll }) : null)));
    const dl = K.h('ul.q-list'); o.day.forEach(q => { const c = prog(q, 'day'); dl.append(row(q[1], c, q[3], G.DEV + ' ' + q[4], b.dc[q[0]] ? 'done' : c >= q[3] ? 'open' : 'todo', () => { claimQ('d', q); after(); }, q[5], unit(q[2], c) + ' ／ ' + unit(q[2], q[3]))); });
    const nd = o.day.filter(q => b.dc[q[0]]).length;
    dl.append(row('今天的四項全部完成', nd, 4, pay(DBONUS), b.dall ? 'done' : o.bonus ? 'open' : 'todo', () => { claimBonus(); after(); }, 'quests'));
    box.append(K.h('section.q-sec', K.h('div.q-h', K.h('h3', { text: '每日委託' }), K.h('span.lab', { text: until(midnight) + '後換新' })), dl));
    const wl = K.h('ul.q-list'); WEEKLY.forEach(q => { const c = prog(q, 'week'); wl.append(row(q[1], c, q[3], G.DEV + ' ' + q[4], b.wc[q[0]] ? 'done' : c >= q[3] ? 'open' : 'todo', () => { claimQ('w', q); after(); }, q[5], unit(q[2], c) + ' ／ ' + unit(q[2], q[3]))); });
    box.append(K.h('section.q-sec', K.h('div.q-h', K.h('h3', { text: '每週委託' }), K.h('span.lab', { text: until(monday) + '後換新' })), wl));
    const ml = K.h('ul.q-list'), rows = MAIN.map(m => ({ m, v: mprog(m), got: !!b.mc[m[0]] })), rank = r => r.got ? 2 : r.v[0] >= r.v[1] ? 0 : 1;
    rows.sort((x, y) => rank(x) - rank(y)).forEach(r => ml.append(row(r.m[1], r.v[0], r.v[1], pay(r.m[3]), r.got ? 'done' : r.v[0] >= r.v[1] ? 'open' : 'todo', () => { claimM(r.m); after(); }, r.m[4])));
    box.append(K.h('section.q-sec', K.h('div.q-h', K.h('h3', { text: '長期委託' }), K.h('span.lab', { text: '完成 ' + rows.filter(r => r.got).length + ' ／ ' + MAIN.length + '　以前做過的事也算' })), ml));
  }
  function build() {
    built = true; box = K.h('div.qst', { id: 'quests-box' });
    $('main').append(K.h('section.room', { id: 'r-quests', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'Commissions', text: '委託' }), K.h('p.sub', { text: '每天四項、每週五項，還有一張長期的清單。報酬是顯影劑，拿去暗房沖洗底片。' })), K.h('div.no', { text: '13' })), box)));
  }
  G.room('quests', '委託', '每日、每週、長期的委託，還有簽到。');
  A.addRoom('quests', 'r-quests', () => { if (!built) build(); paint(); });
  A.on('ready', () => { if (!built) build(); });
  A.on('gstat', K.debounce(() => { if (A.cur === 'quests') paint(); }, 300));
  A.on('import', () => { if (A.cur === 'quests') paint(); });
  A.on('status', o => { if (o.id === 'quests') { const n = open().n; o.s = n ? n + ' 項可領' : ''; } });
  G.menu({ id: 'quests', name: '委託', en: 'Commissions', desc: '每日、每週、長期的委託，還有簽到。', shot: { p: 'ticker', a: {}, cues: [] }, status: () => { const o = open(); return '今日 ' + o.day.filter(q => o.b.dc[q[0]]).length + ' ／ 4'; }, dot: () => open().n });
  G.claims('quests', () => open().n);

  A.Quests = { open, done: () => qs().done, signN: () => qs().sign.n };
})();
