'use strict';
/* ---------- 徽記、階級、圖卡、存檔檔案 ---------- */
(function () {
  const A = window.__A, K = A.K, { $, Case, CH, toast, fmtDate, pad } = A;
  const ac = () => K.bag('ac', { got: {}, init: 0 });
  const socN = () => K.bag('soc', { n: { relay: 0, works: 0, theory: 0 } }).n;
  const cnt = o => Object.keys(o || {}).length;
  const relayLocal = d => RELAYS.reduce((n, r) => n + (d.relay[r.k] || []).length, 0);
  const sameRoad = d => SC.filter(s => s.canon && d.choices[s.id] === s.canon).length;
  const allPicked = d => SC.every(s => d.choices[s.id]);

  /* 每一枚：id、名稱、怎麼拿、判定 */
  const ACH = [
    ['stamp1', '第一枚戳記', '在任何一間展間蓋下「我讀完了」。', d => cnt(d.read) >= 1],
    ['act1', '生者與餘眾', '蓋滿第一幕：序幕至第七章。', d => CH.slice(0, 8).every(c => d.read[c.id])],
    ['stamp14', '十四間展間', '十四章全部蓋章。', d => CH.every(c => d.read[c.id])],
    ['plates', '顯影完畢', '看過每一張底片。', () => A.Reader.seenAll()],
    ['film', '散場', '在放映廳把紀錄片放到尾聲。', () => !!K.bag('fm', { fin: 0 }).fin],
    ['choices', '八個時刻', '做完司辰的八個抉擇。', d => allPicked(d)],
    ['same', '同一條路', '七次可對照的抉擇，全部和她相同。', d => allPicked(d) && sameRoad(d) === 7],
    ['other', '另一條路', '八個時刻選完，其中至少四次走了另一條路。', d => allPicked(d) && sameRoad(d) <= 3],
    ['storm', '走過自己的雨', '完成「你的暴雨」。', d => !!d.mine],
    ['umbrella', '第一把傘', '在大廳替那座城市撐過傘。', () => A.Reader.umb()],
    ['relay', '接上一段', '在接龍寫下第一段。', d => relayLocal(d) + (socN().relay | 0) >= 1],
    ['work', '第一件作品', '創作本收進第一件作品。', d => d.works.length >= 1],
    ['wall', '展出', '把一件作品展出到展牆。', () => (socN().works | 0) >= 1],
    ['terms30', '識字', '在旁白裡遇見三十個索引裡的詞。', () => A.Gloss.count() >= 30],
    ['termsAll', '活字典', '遇見索引裡大部分的詞（七十個以上）。', () => A.Gloss.count() >= 70],
    ['pins', '懸而未決', '收藏六個未解之謎。', d => cnt(d.pins) >= 6],
    ['theory', '一家之言', '寫下三則自己的推測。', d => cnt(d.theories) >= 3],
    ['notes', '手記五篇', '在五間展間留下手記。', d => cnt(d.notes) >= 5],
    ['quiz8', '合格', '入館考核拿到八分以上。', () => A.Quiz.stats().best >= 8],
    ['quiz10', '滿分', '入館考核十題全對。', () => A.Quiz.stats().best >= 10],
    ['streak3', '連續三天', '連續三天來訪。', () => A.Reader.streak().best >= 3],
    ['streak7', '連續七天', '連續七天來訪。', () => A.Reader.streak().best >= 7],
    ['night', '夜班', '在午夜到凌晨四點之間來訪。', () => !!A.Reader.streak().night]
  ];
  const RANKS = [[0, '見習記錄員'], [3, '記錄員'], [7, '資深記錄員'], [12, '首席記錄員'], [17, '司辰']];
  const gotN = () => ACH.filter(a => ac().got[a[0]]).length;
  const rankOf = n => { let i = 0; RANKS.forEach((r, j) => { if (n >= r[0]) i = j; }); return { i, name: RANKS[i][1], next: RANKS[i + 1] || null, from: RANKS[i][0] }; };

  let fresh = {};
  function check(silent) {
    const b = ac(), d = Case.d, news = [];
    ACH.forEach(a => { if (b.got[a[0]]) return; let ok = false; try { ok = !!a[3](d); } catch (e) { ok = false; } if (ok) { b.got[a[0]] = Date.now(); news.push(a); } });
    if (!news.length) return;
    const before = rankOf(gotN() - news.length), after = rankOf(gotN());
    Case.flush();
    if (silent) return;
    news.forEach(a => { fresh[a[0]] = 1; });
    toast(after.i > before.i ? '升為「' + after.name + '」　徽記：' + news.map(a => a[1]).join('、') : '取得徽記：' + news.map(a => a[1]).join('、'));
    if (A.Snd) A.Snd.cue('chime');
    A.badge(); if (A.cur === 'case') paint();
  }
  const later = K.debounce(() => check(false), 500);
  A.on('ready', () => { const b = ac(); if (!b.init) { b.init = 1; check(true); } else check(true); });
  A.on('save', later); A.on('filmEnd', later); A.on('quizDone', later);
  A.on('import', () => check(true));

  function paint() {
    const n = gotN(), r = rankOf(n), box = $('rank'); if (!box) return;
    box.textContent = '';
    const p = r.next ? (n - r.from) / (r.next[0] - r.from) : 1;
    box.append(K.h('div.top', K.h('b', { text: r.name }), K.h('span.lab', { text: '徽記 ' + n + ' ／ ' + ACH.length })),
      K.h('div.meter', K.h('i', { style: 'width:' + Math.round(p * 100) + '%' })),
      K.h('span.lab', { text: r.next ? '再 ' + (r.next[0] - n) + ' 枚升為「' + r.next[1] + '」' : '最高階級。時間交給你來記。' }),
      K.h('div.save-row', K.h('button.tiny', { type: 'button', text: '下載記錄員證', onclick: idCard })));
    const grid = $('achs'); grid.textContent = ''; const got = ac().got;
    $('ach-note').textContent = '做到了，就蓋上一枚。點任何一格，看它怎麼來的。';
    ACH.forEach(a => {
      const ts = got[a[0]], b = K.h('button' + (ts ? '.got' : '') + (fresh[a[0]] ? '.new' : ''), { type: 'button', 'aria-label': a[1] + (ts ? '，已取得' : '，尚未取得') }, a[1], K.h('small', { text: ts ? fmtDate(ts) : '未取得' }));
      b.onclick = () => K.pop(b, K.h('div.gl-card', K.h('div.th', K.h('b', { text: a[1] }), K.h('span.g', { text: ts ? '取得於 ' + fmtDate(ts) : '尚未取得' })), K.h('p', { text: a[2] })));
      grid.append(b);
    });
    fresh = {};
  }
  A.on('case', paint);

  /* ---- 圖卡：上半是底片，下半是文字，可以存成 PNG ---- */
  const F = K.fonts;
  async function ensureFonts(texts) {
    if (!document.fonts || !document.fonts.load) return;
    const all = texts.filter(Boolean).join('');
    const jobs = [document.fonts.load('900 60px "Noto Serif TC"', all), document.fonts.load('400 30px "Noto Serif TC"', all), document.fonts.load('500 22px "Jost"', all), document.fonts.load('italic 400 40px "Bodoni Moda"', all)];
    await Promise.race([Promise.all(jobs).catch(() => {}), new Promise(r => setTimeout(r, 2500))]);
  }
  async function card(o) {
    const W = 1080, H = 1350, PH = 700, M = 72;
    await ensureFonts([o.kicker, o.title, '逆雨檔案館'].concat(o.lines || []));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    c.fillStyle = '#f4f4f1'; c.fillRect(0, 0, W, H);
    K.plateInto(c, o.shot || { p: 'rain', a: { peel: 1, big: '1999' }, cues: [] }, o.t == null ? 6 : o.t, 0, 0, W, PH);
    const g = c.createLinearGradient(0, PH - 220, 0, PH); g.addColorStop(0, 'rgba(7,9,12,0)'); g.addColorStop(1, 'rgba(7,9,12,.7)'); c.fillStyle = g; c.fillRect(0, PH - 220, W, 220);
    c.textBaseline = 'alphabetic'; c.fillStyle = '#f3f1ea'; c.font = '500 22px ' + F.ui;
    try { c.letterSpacing = '7px'; } catch (e) { /* 舊瀏覽器沒有字距 */ }
    c.fillText(String(o.kicker || '').toUpperCase(), M, PH - 44);
    let y = PH + 110;
    try { c.letterSpacing = '4px'; } catch (e) { /* 忽略 */ }
    c.fillStyle = '#0b0d10'; c.font = '900 ' + (String(o.title || '').length > 14 ? 54 : 66) + 'px ' + F.serif;
    y = K.wrap(c, o.title || '', M, y, W - M * 2, 84, 3) + 6;
    try { c.letterSpacing = '1px'; } catch (e) { /* 忽略 */ }
    c.strokeStyle = '#0b0d10'; c.lineWidth = 2; c.beginPath(); c.moveTo(M, y - 34); c.lineTo(W - M, y - 34); c.stroke();
    y += 24; c.font = '400 31px ' + F.serif;
    (o.lines || []).forEach((t, i) => { if (y > H - 190) return; c.fillStyle = i === 0 && o.lead !== false ? '#1f3fa6' : '#3c4248'; y = K.wrap(c, t, M, y, W - M * 2, 52, 4) + 10; });
    /* 頁尾 */
    c.strokeStyle = 'rgba(11,13,16,.2)'; c.lineWidth = 1; c.beginPath(); c.moveTo(M, H - 122); c.lineTo(W - M, H - 122); c.stroke();
    try { c.letterSpacing = '14px'; } catch (e) { /* 忽略 */ }
    c.fillStyle = '#0b0d10'; c.font = '900 30px ' + F.serif; c.fillText('逆雨檔案館', M, H - 70);
    try { c.letterSpacing = '4px'; } catch (e) { /* 忽略 */ }
    c.fillStyle = '#5f656b'; c.font = '500 18px ' + F.ui; c.textAlign = 'right';
    const now = new Date(); c.fillText((location.host || 'An Archive Against the Rain') + '　' + now.getFullYear() + '.' + (now.getMonth() + 1) + '.' + now.getDate(), W - M, H - 72);
    c.textAlign = 'left'; try { c.letterSpacing = '0px'; } catch (e) { /* 忽略 */ }
    /* 角標 */
    c.strokeStyle = '#0b0d10'; c.lineWidth = 2; c.beginPath(); c.moveTo(W - 28, H - 64); c.lineTo(W - 28, H - 28); c.lineTo(W - 64, H - 28); c.stroke();
    const ok = await K.savePng(cv, (o.name || 'nyjn-card') + '.png');
    toast(ok ? '圖卡已下載' : '這個瀏覽器沒辦法存圖');
    return cv;
  }
  function idCard() {
    const d = Case.d, n = gotN(), r = rankOf(n);
    card({ kicker: 'RECORDER ID — 記錄員證　NO. ' + String(d.since).slice(-6), title: d.name || '無名的記錄員', lead: true,
      lines: [r.name + '　徽記 ' + n + ' ／ ' + ACH.length, '到任 ' + fmtDate(d.since) + '　來訪 ' + d.visits + ' 天　章節戳記 ' + cnt(d.read) + ' ／ 14', d.mine ? '所屬雨次：' + ORD[d.mine.storm] + '暴雨（' + SD[d.mine.storm].f + ' → ' + SD[d.mine.storm].t + '）' : '所屬雨次：尚未測定'],
      shot: d.mine ? A.stormShot(d.mine.storm) : { p: 'umbrella', a: {}, cues: [] }, t: d.mine ? 3.2 : 6, name: 'nyjn-id' });
  }
  A.Share = { card };

  A.on('mineCard', ({ r, s, row }) => {
    row.append(K.h('button.btn', { type: 'button', text: '下載圖卡', onclick: () => card({ kicker: 'YOUR STORM — 暴雨紀錄', title: (r.name || '無名的記錄員') + ' 的' + ORD[r.storm] + '暴雨', lines: [s.f + ' → ' + s.t, '症候：' + SYM[r.sym] + '。', '放進手提箱：' + r.item, '症候由本館編寫，是同好的遊戲。'], shot: A.stormShot(r.storm), t: 3.2, name: 'nyjn-storm' }) }));
  });
  A.on('work', ({ w, ops }) => {
    const b = K.h('button.tiny', { type: 'button', text: '下載圖卡' });
    b.onclick = () => {
      const sh = w.kind === 'card' ? A.shotsOf(w.ch) : w.ref && w.ref.type === 'plate' ? A.shotsOf(w.ref.ch) : null, i = w.kind === 'card' ? w.shot : w.ref && w.ref.shot;
      const shot = sh ? sh[Math.min(sh.length - 1, i | 0)] : { p: 'pages', a: { lines: ['', ''], book: 1 }, cues: [] };
      if (w.kind === 'card') card({ kicker: 'CHARACTER FILE — 人物檔案　' + (w.era || ''), title: (w.name || '未命名') + (w.alias ? '（' + w.alias + '）' : ''), lines: [[w.kind2, w.from && '來自 ' + w.from, w.item && '隨身物：' + w.item].filter(Boolean).join('　'), w.say || '', '自創人物，不屬於遊戲設定。'], shot, name: 'nyjn-character' });
      else card({ kicker: 'ATELIER — 創作坊', title: w.title || '無題', lead: false, lines: [w.text], shot, name: 'nyjn-piece' });
    };
    ops.prepend(b);
  });

  /* ---- 抉擇的側寫（本館編寫） ---- */
  const PROFILE = [
    [6, '不肯只做記錄的人', '規定要你只記錄，不投入感情。你幾乎每一次都伸了手。主線裡的那個人也是。'],
    [3, '在規定與伸手之間', '有時你照規定記下時間，有時你闖了進去。兩種選擇，你都知道代價。'],
    [0, '守時的司辰', '你把紀錄留得很完整。主線走的是另一條路。沒有誰錯，故事只是在別的地方轉了彎。']
  ];
  A.on('tally', ({ tl, sr, same }) => {
    const p = PROFILE.find(x => same >= x[0]);
    const box = K.h('div.profile', K.h('span.lab', { text: '司辰側寫' }), K.h('b', { text: p[1] }), K.h('p', { text: p[2] }), K.h('p.hint', { text: '側寫由本館編寫，是同好的遊戲，不是遊戲設定。' }));
    sr.before(box);
    sr.append(K.h('button.btn', { type: 'button', text: '下載圖卡', onclick: () => card({ kicker: 'DECISIONS — 司辰的抉擇', title: p[1], lines: ['七次可以對照的抉擇裡，' + same + ' 次和她走了同一條路。', p[2]], shot: { p: 'umbrella', a: {}, cues: [] }, name: 'nyjn-decisions' }) }));
  });

  /* ---- 存檔：下載成檔案、從檔案匯入 ---- */
  A.on('ready', () => {
    const out = $('file-out'), inn = $('file-in'), pick = $('file-pick'); if (!out) return;
    out.onclick = () => { Case.flush(); K.download('nyjn-archive-' + K.day() + '.txt', new Blob([Case.code()], { type: 'text/plain' })); toast('存檔已下載'); };
    inn.onclick = () => pick.click();
    pick.onchange = () => {
      const f = pick.files && pick.files[0]; if (!f) return;
      if (f.size > 2e6) { toast('這個檔案太大，不像是存檔'); pick.value = ''; return; }
      const rd = new FileReader();
      rd.onload = () => { const ok = Case.read(String(rd.result || '')); $('imp-msg').textContent = ok ? '匯入完成。' : '這不是有效的存檔。'; if (ok) { A.badge(); A.casePaint(); A.veil(true); } pick.value = ''; };
      rd.readAsText(f);
    };
  });

  A.Rank = { count: gotN, total: ACH.length, rank: () => rankOf(gotN()), check };
})();
