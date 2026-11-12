'use strict';
/* ---------- 值勤：遊戲層的核心 ----------
   館裡原本只有「讀」。這一層把讀過、做過的事變成資源：
     顯影劑（◈）　委託、遊藝室、升級給的，拿去暗房沖洗底片
     碎片（◆）　　重複的底片折成的，拿去交換所，或指定顯影缺的那一張
     資歷　　　　　做事就會累積，滿了升一級
   全部存在手提箱的 x.gm，不經過後端，離線也能玩；雲端同步會一起帶走。
   其他模組（委託、暗房、底片冊、遊藝室、交換所、檔案）都透過 A.Game 動這些數字。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, toast, Plates, pad } = A;
  const DEV = '◈', SHD = '◆', MAXLV = 50, LVUP = 80, GIFT = 1200, SOFTCAP = 120;
  const gm = () => K.bag('gm', { dev: 0, shard: 0, xp: 0, gift: 0, stat: {}, day: '', dstat: {}, wk: '', wstat: {}, dxp: 0, once: {} });
  const fmt = n => Math.round(+n || 0).toLocaleString('en-US');
  /* 每週從星期一起算 */
  const weekId = d => { d = d ? new Date(d) : new Date(); return K.day(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))); };
  function roll() { const g = gm(), t = K.day(), w = weekId(); if (g.day !== t) { g.day = t; g.dstat = {}; g.dxp = 0; } if (g.wk !== w) { g.wk = w; g.wstat = {}; } return g; }
  const saveSoon = K.debounce(() => Case.save(), 500);

  /* 等級：每一級要的資歷比上一級多一點 */
  const need = lv => 80 + 40 * lv;
  function level(xp) { xp = xp == null ? gm().xp : xp; let lv = 1, left = xp; while (lv < MAXLV && left >= need(lv)) { left -= need(lv); lv++; } const max = lv >= MAXLV; return { lv, cur: max ? need(lv) : left, need: need(lv), max }; }

  /* 發東西。r = { dev, shard, xp }；why 會出現在提示裡 */
  function give(r, why, quiet) {
    const g = roll(), before = level(g.xp).lv;
    g.dev += Math.max(0, r.dev | 0); g.shard += Math.max(0, r.shard | 0); g.xp += Math.max(0, r.xp | 0);
    const after = level(g.xp).lv, up = after > before, bonus = up ? (after - before) * LVUP : 0;
    g.dev += bonus; Case.save();
    const parts = []; if (r.dev) parts.push(DEV + ' ' + fmt(r.dev)); if (r.shard) parts.push(SHD + ' ' + fmt(r.shard)); if (r.xp) parts.push('資歷 +' + r.xp);
    if (!quiet || up) toast([why, parts.join('　'), up ? '升上 Lv.' + after + '（' + DEV + ' ' + bonus + '）' : ''].filter(Boolean).join('　'));
    if (up && A.Snd) A.Snd.cue('chime');
    A.emit('gain', { r, why, lv: after, up }); hud();
    return up;
  }
  function spend(kind, n) { const g = gm(); n = Math.max(0, n | 0); if ((g[kind] | 0) < n) return false; g[kind] -= n; Case.save(); hud(); return true; }
  /* 平常逛展間也有一點資歷，但一天有上限，免得變成刷數字 */
  function soft(n) { const g = roll(); const add = Math.min(n, Math.max(0, SOFTCAP - g.dxp)); if (add <= 0) return; g.dxp += add; give({ xp: add }, '', true); }
  /* 計數：委託靠這些數字判定。同時記終身、今天、這一週 */
  function bump(k, n) { const g = roll(); n = n == null ? 1 : n; g.stat[k] = (g.stat[k] || 0) + n; g.dstat[k] = (g.dstat[k] || 0) + n; g.wstat[k] = (g.wstat[k] || 0) + n; saveSoon(); A.emit('gstat', { k, n }); hudSoon(); }
  /* 只算第一次的事：戳記可以取消再蓋、抉擇可以重選，資歷不能跟著重複拿 */
  const once = k => { const g = gm(); if (g.once[k]) return false; g.once[k] = 1; return true; };
  const stat = (k, scope) => { const g = roll(); return (scope === 'day' ? g.dstat : scope === 'week' ? g.wstat : g.stat)[k] || 0; };

  /* 可以領的東西有幾項：各模組自己回報，選單和右上角的紅點都看這裡 */
  const CLAIMS = {};
  const dots = () => Object.keys(CLAIMS).reduce((n, k) => { try { return n + (CLAIMS[k]() | 0); } catch (e) { return n; } }, 0);

  /* 右上角的狀態：等級、顯影劑、紅點 */
  let hudEl = null;
  function hud() {
    if (!hudEl) return; const g = gm(), n = dots();
    hudEl.textContent = ''; hudEl.append(K.h('b', { text: 'Lv.' + level().lv }), K.h('span', { text: DEV + ' ' + fmt(g.dev) }));
    if (n) hudEl.append(K.h('i.g-dot', { text: String(n) }));
    hudEl.setAttribute('aria-label', '值勤台：等級 ' + level().lv + '，顯影劑 ' + fmt(g.dev) + (n ? '，' + n + ' 件東西等你簽收' : ''));
  }
  const hudSoon = K.debounce(hud, 200);

  /* 玩家那一條：名字、稱號、等級、資歷條、錢包。值勤台和檔案共用 */
  function strip() {
    const g = gm(), L = level(), title = A.Shop && A.Shop.title ? A.Shop.title() : '';
    return K.h('div.g-strip',
      K.h('div.g-lv', K.h('small', { text: 'LV' }), K.h('b', { text: String(L.lv) })),
      K.h('div.g-who', K.h('b', { text: Case.d.name || '無名的記錄員' }), K.h('span.lab', { text: title || (A.Rank ? A.Rank.rank().name : '記錄員') }),
        K.h('div.g-bar', { role: 'img', 'aria-label': L.max ? '已達最高等級' : '資歷 ' + L.cur + ' ／ ' + L.need }, K.h('i', { style: 'width:' + Math.round(L.cur / L.need * 100) + '%' })),
        K.h('span.g-xp', { text: L.max ? '最高等級' : '資歷 ' + L.cur + ' ／ ' + L.need })),
      K.h('dl.g-wallet', K.h('div', K.h('dt', { text: DEV + ' 顯影劑' }), K.h('dd', { text: fmt(g.dev) })), K.h('div', K.h('dt', { text: SHD + ' 碎片' }), K.h('dd', { text: fmt(g.shard) }))));
  }

  /* ---- 值勤台：主選單 ---- */
  const MENU = [];
  const TIPS = ['午夜，委託單換一批。星期一，換一整疊。', '沖到重複的，暗房會裁成碎片還你。缺哪一張，拿碎片去底片冊指名。', '遊藝室的酬勞一天只發到三百。分數倒是沒人攔。', '十張之內必有一張五星。七十張之內，必有一場暴雨。',
    '這張桌上的東西也收在手提箱裡。換了地方，箱子帶著走。', '蓋過的章、看完的片、選過的路，長期委託那一頁都替你記著。', '交換所的顏料只有一個用處：把館裡的藍印換成別的顏色。', '按 G，回到這張桌子。'];
  let box = null, built = false;
  function paint() {
    if (!box) return; const g = gm(); box.textContent = '';
    box.append(strip());
    if (!g.gift) {
      const b = K.h('button.btn.pri', { type: 'button', text: '拆開' });
      b.onclick = () => { if (gm().gift) return; gm().gift = Date.now(); give({ dev: GIFT, xp: 40 }, '到職禮'); if (A.Snd) A.Snd.cue('chime'); paint(); };
      box.append(K.h('div.g-gift', K.h('div', K.h('span.lab', { text: 'WELCOME — 到職禮' }), K.h('b', { text: '桌上有一只沒拆的紙盒，寫著你的名字' }), K.h('p', { text: '裡面是顯影劑，' + DEV + ' ' + fmt(GIFT) + '。夠沖十張。' })), b));
    }
    const grid = K.h('div.g-menu');
    MENU.forEach((m, i) => {
      const cv = document.createElement('canvas'); cv.width = 520; cv.height = 300;
      let st = '', n = 0; try { st = m.status ? m.status() : ''; n = m.dot ? m.dot() | 0 : 0; } catch (e) { /* 模組還沒好 */ }
      const a = K.h('a.g-tile', { href: '#' + m.id }, cv, K.h('span.n', { text: pad(i + 1) }), K.h('span.tx', K.h('span.kick', { text: m.en }), K.h('b', { text: m.name }), K.h('span.d', { text: m.desc }), st ? K.h('span.s', { text: st }) : null), n ? K.h('i.g-dot', { text: String(n) }) : null);
      grid.append(a); setTimeout(() => Plates.still(cv, m.shot), 40 + 50 * i);
    });
    box.append(grid, K.h('p.g-tip', K.h('span.lab', { text: 'TIP' }), K.h('span', { text: TIPS[Math.floor(Math.random() * TIPS.length)] })));
  }
  function build() {
    built = true; box = K.h('div.g-hub', { id: 'play-box' });
    $('main').append(K.h('section.room', { id: 'r-play', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'On Duty', text: '值勤台' }), K.h('p.sub', { text: '鐘敲過了。今天的差事都在這張桌上。' })), K.h('div.no', { text: '12' })), box)));
    hudEl = K.h('a.nav-btn.g-hud', { href: '#play', id: 'b-game' });
    const end = document.querySelector('.bar-end'); if (end) end.prepend(hudEl);
    const nav = $('nav-links'); if (nav) { const x = K.h('a', { href: '#play', text: '值勤' }); x.dataset.k = 'play'; nav.append(x); }
    hud();
  }
  /* 這一層的房間排在手提箱前面；選單、搜尋、分頁標題都從 ROOMS 來 */
  function room(id, name, desc) { const R = A.ROOMS, at = R.findIndex(r => r[0] === 'case'); R.splice(at < 0 ? R.length : at, 0, [id, name, desc]); }
  room('play', '值勤台', '鐘敲過了。今天的差事都在這張桌上。');
  A.addRoom('play', 'r-play', () => { if (!built) build(); paint(); });
  A.on('ready', () => { if (!built) build(); roll(); hud(); });
  A.on('import', () => { hud(); if (A.cur === 'play') paint(); });
  A.on('wipe', () => { hud(); if (A.cur === 'play') paint(); });
  A.on('status', o => { if (o.id === 'play') o.s = 'Lv.' + level().lv; });
  K.key((e, typing) => !typing && (e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !e.altKey && !K.dialogOpen() && A.cur !== 'film' && A.cur !== 'story', () => { location.hash = '#play'; });

  /* 大廳：今日底片下面多一條，告訴人這一層在哪裡 */
  let band = null;
  A.on('hall', () => {
    const t = document.querySelector('#r-hall .today'); if (!t) return;
    if (!band) { band = K.h('a.g-band', { href: '#play' }); t.after(band); }
    const g = gm(), n = dots(); band.textContent = '';
    band.append(K.h('span.kick', { text: 'On Duty — 值勤台' }), K.h('b', { text: 'Lv.' + level().lv + '　' + DEV + ' ' + fmt(g.dev) }), K.h('span.d', { text: n ? '有 ' + n + ' 件東西等你簽收' : '今天的差事在桌上' }), K.h('span.go', { text: '進入 ›' }));
  });

  /* 館裡原本的動作，在這裡換成計數和一點資歷 */
  let lastPlate = '';
  A.on('plate', o => { const k = o.id + '/' + o.at; if (k === lastPlate) return; lastPlate = k; bump('plate'); soft(2); });
  A.on('era', () => bump('era'));
  A.on('stamp', o => { if (o && o.id && once('stamp:' + o.id)) { bump('stamp'); give({ xp: 40 }, '', true); } });
  A.on('choice', o => { if (o && o.s && once('choice:' + o.s.id)) { bump('choice'); give({ xp: 10 }, '', true); } });
  A.on('quizDone', o => { bump('quiz'); if (o && o.score >= 7) bump('quiz7'); give({ xp: 20 + (o ? o.score * 2 : 0) }, '', true); });
  A.on('filmEnd', () => { bump('filmEnd'); give({ xp: 80 }, '', true); });
  setInterval(() => { if (A.Cinema && A.Cinema.playing && !document.hidden) { bump('filmSec', 5); if (stat('filmSec', 'day') % 60 === 0) soft(4); } }, 5000);

  A.Game = {
    DEV, SHD, fmt, gm, give, spend, bump, stat, level, strip, hud, dots, weekId, room,
    wallet: () => { const g = gm(); return { dev: g.dev, shard: g.shard, xp: g.xp }; },
    menu(m) { MENU.push(m); }, claims(k, fn) { CLAIMS[k] = fn; },
    repaint() { hud(); if (A.cur === 'play') paint(); }
  };
})();
