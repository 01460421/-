'use strict';
/* ---------- 入館考核：十道題，全部從館內的資料出題 ----------
   題目是即時從年表、章節、名詞索引和抉擇裡抽出來的，所以答案一定和館內寫的一致。 */
(function () {
  const A = window.__A, K = A.K, { $, el, Case, CH, chOf, pad, toast, Plates } = A;
  const qz = () => K.bag('qz', { best: 0, plays: 0, last: 0, perfect: 0, sum: 0 });
  const yr = A.yr, plates = c => c.shots.filter(s => s.cues && s.cues.length);
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sample = (a, n, not) => shuffle(a.filter(x => !not || !not(x))).slice(0, n);
  const pack = (q, opts, right, more) => { const o = shuffle(opts.map((t, i) => ({ t, ok: i === right }))); return Object.assign({ q, opts: o.map(x => x.t), ans: o.findIndex(x => x.ok) }, more || {}); };

  /* 哪些畫面只在一章出現（才能公平地問「這是哪一章」） */
  const byPainter = {};
  CH.forEach(c => plates(c).forEach((s, i) => { (byPainter[s.p] = byPainter[s.p] || []).push([c, s, i]); }));
  const uniquePlates = Object.keys(byPainter).filter(p => new Set(byPainter[p].map(x => x[0].id)).size === 1 && ['storm', 'rain', 'still', 'chart'].indexOf(p) < 0).map(p => byPainter[p][0]);
  const maskTerm = (t) => { let d = t.d; const names = [t.t, t.t.replace(/[「」《》]/g, '')].filter((x, i, a) => x && a.indexOf(x) === i); names.forEach(n => { d = d.split(n).join('＿＿'); }); return d; };

  const GEN = {
    plate() {
      const [c, s, i] = uniquePlates[rnd(uniquePlates.length)], others = sample(CH, 3, x => x.id === c.id);
      return pack('這張底片出自哪一章？', [c].concat(others).map(x => x.no + '　' + x.zh), 0, { shot: s, why: c.no + '〈' + c.zh + '〉的第 ' + (i + 1) + ' 張底片。', link: ['#' + c.id + '/' + (i + 1), '看這張底片'] });
    },
    stormTo() {
      const i = rnd(SD.length), right = String(yr(SD[i].t)), pool = [...new Set(SD.map(s => String(yr(s.t))).concat(SD.map(s => String(yr(s.f)))))].filter(y => y !== right);
      return pack(ORD[i] + '暴雨從 ' + yr(SD[i].f) + ' 年落下，把日曆帶到了哪一年？', [right].concat(sample(pool, 3)), 0, { why: SD[i].note, link: ['#chronicle', '看暴雨年表'], era: i });
    },
    stormWhich() {
      const ok = SD.map((s, i) => i).filter(i => SD[i].ch), i = ok[rnd(ok.length)];
      return pack('「' + SD[i].note.split('。')[0] + '。」這是第幾次暴雨？', [ORD[i]].concat(sample(ORD, 3, x => x === ORD[i])), 0, { why: ORD[i] + '暴雨：' + SD[i].f + ' → ' + SD[i].t + '。', link: ['#chronicle', '看暴雨年表'], era: i });
    },
    term() {
      let t, d, tries = 0;
      do { t = TERMS[rnd(TERMS.length)]; d = maskTerm(t); tries++; } while ((d.length < 18 || t.t.length < 2) && tries < 30);
      const same = TERMS.filter(x => x.g === t.g && x.t !== t.t && d.indexOf(x.t) < 0);
      return pack('名詞索引裡，這段說明寫的是哪一個' + (t.g === '人物' ? '人' : t.g === '地點' ? '地方' : t.g === '組織' ? '組織' : '詞') + '？', [t.t].concat(sample(same, 3).map(x => x.t)), 0, { ctx: d, why: t.t + '：' + t.d, link: ['#index/' + encodeURIComponent(t.t), '在索引裡看'] });
    },
    meta() {
      const c = CH[rnd(CH.length)], others = sample(CH, 3, x => x.id === c.id || x.meta === c.meta);
      return pack(c.no + '〈' + c.zh + '〉的舞台是？', [c.meta].concat(others.map(x => x.meta)), 0, { why: c.epi, link: ['#' + c.id, '讀' + c.no] });
    },
    en() {
      const c = CH[rnd(CH.length)], others = sample(CH, 3, x => x.id === c.id);
      return pack('哪一章的英文標題是 ' + c.en + '？', [c].concat(others).map(x => x.no + '　' + x.zh), 0, { why: c.no + '〈' + c.zh + '〉，' + c.meta + '。', link: ['#' + c.id, '讀' + c.no] });
    },
    order() {
      const four = sample(CH, 4), first = four.slice().sort((a, b) => A.chIx(a.id) - A.chIx(b.id))[0];
      return pack('這四章裡，哪一章排在最前面？', four.map(x => '〈' + x.zh + '〉'), four.indexOf(first), { why: four.slice().sort((a, b) => A.chIx(a.id) - A.chIx(b.id)).map(x => x.no + '〈' + x.zh + '〉').join(' → '), link: ['#chapters', '看章節檔案'] });
    },
    canon() {
      const ok = SC.filter(s => s.canon), s = ok[rnd(ok.length)];
      return pack('主線裡，維爾汀怎麼做？', [s.a, s.b], s.canon === 'a' ? 0 : 1, { ctx: s.when + '　' + s.setup.join(''), why: s.reveal, link: ['#' + s.ch, '讀' + chOf(s.ch).no] });
    }
  };
  const PLAN = ['plate', 'stormTo', 'term', 'canon', 'meta', 'plate', 'stormWhich', 'term', 'en', 'order'];
  function makeRound() { const seen = new Set(), out = []; PLAN.forEach(k => { let q, n = 0; do { q = GEN[k](); n++; } while (seen.has(q.q + '|' + q.opts[q.ans] + '|' + (q.ctx || '')) && n < 12); seen.add(q.q + '|' + q.opts[q.ans] + '|' + (q.ctx || '')); out.push(q); }); return out; }
  const GRADE = [[10, '司辰', '十題全對。時間交給你來記。'], [8, '資深記錄員', '只差一點。漏掉的那幾題，底下有連結可以回去看。'], [5, '記錄員', '大方向都記得。細節還可以再翻一次底片。'], [0, '見習生', '雨帶走了不少東西。從章節檔案或放映廳重新走一遍吧。']];

  let R = null, box = null;   // R: {qs, at, picks[]}
  function intro() {
    R = null; box.textContent = ''; const b = qz();
    const fig = K.h('figure.plate'), cv = el('canvas'); cv.width = 960; cv.height = 600; fig.append(cv);
    const right = K.h('div',
      K.h('h3', { text: '十道題，考你還記得多少' }),
      K.h('ul', K.h('li', { text: '題目從年表、章節、底片、名詞索引和抉擇裡即時抽出，每一輪都不一樣。' }), K.h('li', { text: '答完會立刻揭曉，並附上可以回去查證的連結。' }), K.h('li', { text: '可以用鍵盤 1–4 作答，Enter 到下一題。' })),
      b.plays ? K.h('dl.quiz-best', K.h('div', K.h('dt', { text: '最高分' }), K.h('dd', { text: b.best + ' ／ 10' })), K.h('div', K.h('dt', { text: '考過' }), K.h('dd', { text: b.plays + ' 輪' })), K.h('div', K.h('dt', { text: '平均' }), K.h('dd', { text: (b.sum / b.plays).toFixed(1) }))) : null,
      K.h('div.save-row', K.h('button.btn.pri', { type: 'button', text: b.plays ? '再考一輪' : '開始考核', onclick: start, 'data-auto': '1' })));
    box.append(K.h('div.quiz-intro', fig, right));
    Plates.mount(cv, { p: 'school', a: {}, cues: [] }, 12);
  }
  function start() { R = { qs: makeRound(), at: 0, picks: [] }; ask(); window.scrollTo(0, 0); }
  function dots() { const d = K.h('div.quiz-dots', { 'aria-hidden': 'true' }); R.qs.forEach((q, i) => d.append(K.h('i' + (R.picks[i] == null ? '' : R.picks[i] === q.ans ? '.ok' : '.no') + (i === R.at ? '.at' : '')))); return d; }
  function ask() {
    const q = R.qs[R.at], done = R.picks[R.at] != null; box.textContent = '';
    box.append(K.h('div.quiz-top', K.h('span.lab', { text: '第 ' + pad(R.at + 1) + ' 題 ／ ' + pad(R.qs.length) }), dots()));
    const wrap = K.h('div.quiz-q' + (q.shot ? '.has-plate' : '')), body = K.h('div');
    if (q.shot) { const fig = K.h('figure.plate'), cv = el('canvas'); cv.width = 960; cv.height = 600; cv.setAttribute('aria-label', '題目的底片'); fig.append(cv); wrap.append(fig); setTimeout(() => Plates.mount(cv, q.shot), 0); }
    body.append(K.h('h3', { text: q.q })); if (q.ctx) body.append(K.h('p.ctx', { text: q.ctx }));
    const opts = K.h('div.opts');
    q.opts.forEach((t, i) => {
      const b = K.h('button.opt', { type: 'button' }, K.h('i', { text: String(i + 1) }), K.h('span', { text: t }));
      if (done) { b.disabled = true; if (i === q.ans) b.classList.add('right'); else if (i === R.picks[R.at]) b.classList.add('wrong'); }
      else b.onclick = () => answer(i);
      opts.append(b);
    });
    body.append(opts);
    if (done) {
      const ok = R.picks[R.at] === q.ans, rv = K.h('div.reveal', K.h('span.lab', { text: ok ? '答對了' : '答案是：' + q.opts[q.ans] }), K.h('p', { text: q.why }));
      const nav = K.h('div.scene-nav'), last = R.at >= R.qs.length - 1;
      const nx = K.h('button.btn.pri', { type: 'button', text: last ? '看成績' : '下一題 ›', id: 'quiz-next' }); nx.onclick = () => { if (last) result(); else { R.at++; ask(); window.scrollTo(0, 0); } };
      nav.append(nx); if (q.link) nav.append(K.h('a.lnk', { href: q.link[0], text: q.link[1], target: '_blank', rel: 'noopener' }));
      body.append(rv, nav); setTimeout(() => nx.focus({ preventScroll: true }), 30);
    }
    wrap.append(body); box.append(wrap);
  }
  function answer(i) {
    if (!R || R.picks[R.at] != null) return; const q = R.qs[R.at]; R.picks[R.at] = i;
    if (A.Snd) A.Snd.cue(i === q.ans ? 'right' : 'wrong');
    ask();
  }
  function result() {
    const score = R.qs.filter((q, i) => R.picks[i] === q.ans).length, b = qz(), isBest = score > b.best;
    b.plays++; b.sum += score; b.last = score; b.best = Math.max(b.best, score); if (score === 10) b.perfect++; Case.save();
    const g = GRADE.find(x => score >= x[0]); box.textContent = '';
    const res = K.h('div.quiz-res');
    res.append(K.h('span.lab', { text: '考核結果' + (isBest && b.plays > 1 ? '　新的最高分' : '') }), K.h('div.quiz-score', { text: String(score) }, K.h('small', { text: ' ／ 10' })), K.h('h3', { text: g[1] }), K.h('p', { text: g[2] }));
    const ol = K.h('ol');
    R.qs.forEach((q, i) => { const ok = R.picks[i] === q.ans; ol.append(K.h('li' + (ok ? '' : '.no'), K.h('span', { text: pad(i + 1) }), K.h('span', { text: q.q + (ok ? '' : '　→ ' + q.opts[q.ans]) }), K.h('span', { text: ok ? '答對' : '答錯' }))); });
    const txt = '【逆雨檔案館｜入館考核】\n' + (Case.d.name || '無名的記錄員') + '：' + score + ' ／ 10，' + g[1] + '。';
    const row = K.h('div.save-row', K.h('button.btn.pri', { type: 'button', text: '再考一輪', onclick: start }), K.h('button.btn', { type: 'button', text: '複製成績', onclick: () => A.copyText(txt) }),
      K.h('button.btn', { type: 'button', text: '下載成績圖卡', onclick: () => A.Share && A.Share.card({ kicker: 'EXAMINATION — 入館考核', title: score + ' ／ 10　' + g[1], lines: [(Case.d.name || '無名的記錄員') + ' 的考核結果', g[2]], shot: { p: 'school', a: {}, cues: [] }, name: 'nyjn-quiz' }) }),
      K.h('a.btn', { href: '#case', text: '回手提箱' }));
    res.append(ol, row); box.append(res);
    if (A.Snd) A.Snd.cue(score >= 8 ? 'chime' : 'page');
    A.emit('quizDone', { score }); R = null;
  }

  let built = false;
  function build() {
    built = true;
    box = K.h('div.quiz', { id: 'quiz-box' });
    const sec = K.h('section.room', { id: 'r-quiz', hidden: true }, K.h('div.wrap', K.h('div.room-head', K.h('div', K.h('h2', { 'data-en': 'Examination', text: '入館考核' }), K.h('p.sub', { text: '第一防線學校的規矩：先考試，再發證。十道題，全部出自館內的年表、底片、索引和抉擇。' })), K.h('div.no', { text: '11' })), box));
    $('main').append(sec);
  }
  A.on('ready', () => { if (!built) build(); });
  A.addRoom('quiz', 'r-quiz', function () { if (!built) build(); if (!R) intro(); });
  A.on('status', o => { if (o.id === 'quiz') { const b = qz(); o.s = b.plays ? '最高 ' + b.best + '／10' : ''; } });
  K.key((e, typing) => !typing && A.cur === 'quiz' && R && /^[1-4]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !K.dialogOpen(), e => { const q = R.qs[R.at]; if (+e.key <= q.opts.length) answer(+e.key - 1); });
  A.Quiz = { stats: qz };
})();
