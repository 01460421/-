// 乘車測驗：十道題，每次從手冊的資料重新出題，所以答案一定和手冊寫的一致。
(function () {
  const LB = window.LB, { esc, $, store: st } = LB;
  const pick = (a, n) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b.slice(0, n); };
  const one = a => a[(Math.random() * a.length) | 0];
  const opts = (right, pool, key) => { const o = pick(pool.filter(x => key(x) !== key(right)), 3).concat([right]); return pick(o, o.length); };
  const mains = () => LB.cantos.filter(c => !c.side);

  const GEN = [
    () => { const p = one(LB.sinners), o = opts(p, LB.sinners, x => x.src.work);
      return { q: `${p.zh}的名字出自哪一部作品？`, o: o.map(x => `《${x.src.work}》`), a: o.indexOf(p), why: `${p.zh}出自${p.src.author}《${p.src.work}》。`, link: `#/sinner/${p.id}` }; },
    () => { const p = one(LB.sinners), o = opts(p, LB.sinners, x => x.id);
      return { q: `《${p.src.work}》對應的是哪一位乘客？`, o: o.map(x => x.zh), a: o.indexOf(p), why: `《${p.src.work}》的${p.zh}是 ${p.no} 號。`, link: `#/sinner/${p.id}` }; },
    () => { const c = one(mains().filter(x => x.who && x.who.length)), p = LB.people[c.who[0]], o = opts(p, LB.sinners, x => x.id);
      return { q: `${c.lab}〈${c.title}〉的主角是誰？`, o: o.map(x => x.zh), a: o.indexOf(p), why: `${c.lab}以${p.zh}為主角，${c.when.replace('.', ' 年 ')} 月上線。`, link: `#/canto/${c.no}` }; },
    () => { const s = one(LB.sins), names = { wrath: '紅色', lust: '橙色', sloth: '黃色', gluttony: '綠色', gloom: '藍色', pride: '靛色', envy: '紫色' }, o = opts(s, LB.sins, x => x.id);
      return { q: `七宗罪裡，哪一種是${names[s.id]}？`, o: o.map(x => x.zh), a: o.indexOf(s), why: `${s.zh}（${s.en}）是${names[s.id]}。`, link: '#/terms' }; },
    () => { const t = one(LB.glossary.filter(x => x.d.length > 12)), pool = LB.glossary.filter(x => x.kind === t.kind), o = opts(t, pool.length >= 4 ? pool : LB.glossary, x => x.id);
      return { q: `「${t.d.replace(new RegExp(t.t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '＿＿')}」說的是哪一個詞？`, o: o.map(x => x.t), a: o.indexOf(t), why: `這是「${t.t}」（${t.en}）。`, link: `#/terms/${t.id}` }; },
    () => { const p = one(LB.sinners), o = opts(p, LB.sinners, x => x.no);
      return { q: `${p.zh}坐幾號？`, o: o.map(x => `${x.no} 號`), a: o.indexOf(p), why: `${p.zh}是 ${p.no} 號。但丁是 10 號，所以辛克萊之後的號碼都往後推一號。`, link: `#/sinner/${p.id}` }; },
    () => { const p = one(LB.sinners), o = opts(p, LB.sinners, x => x.src.author);
      return { q: `《${p.src.work}》的作者是誰？`, o: o.map(x => x.src.author), a: o.indexOf(p), why: `《${p.src.work}》是${p.src.author}寫的（${p.src.year}）。`, link: (LB.works || []).find(w => w.sinner === p.id) ? `#/library/${(LB.works || []).find(w => w.sinner === p.id).id}` : `#/sinner/${p.id}` }; },
    () => { const cs = pick(mains().filter(c => c.no >= 3), 4), first = cs.slice().sort((a, b) => a.no - b.no)[0];
      return { q: '這四章裡，哪一章最早上線？', o: cs.map(c => `〈${c.title}〉`), a: cs.indexOf(first), why: `〈${first.title}〉是${first.lab}，${first.when.replace('.', ' 年 ')} 月上線。`, link: `#/canto/${first.no}` }; },
    () => { const n = one(LB.names), o = opts(n, LB.names, x => x.title);
      let t = n.text.split('。')[0] + '。';
      n.title.split(/\s+/).forEach(w => { t = t.split(w).join('＿＿'); });
      return { q: `「${t}」這段說的是哪一個名字？`, o: o.map(x => x.title), a: o.indexOf(n), why: `這是「${n.title}」，出自${n.from}。`, link: '#/library' }; },
    () => { const ws = (LB.city && LB.city.wings || []).filter(w => w.district); if (ws.length < 4) return null; const w = one(ws), o = opts(w, ws, x => x.name);
      return { q: `哪一家翼管轄第 ${w.district} 區？`, o: o.map(x => x.name), a: o.indexOf(w), why: `第 ${w.district} 區由${w.name}管轄。`, link: '#/city' }; },
  ];

  let Q = [], i = 0, score = 0, answered = false;
  const newRound = () => {
    Q = []; i = 0; score = 0; answered = false;
    const used = {};
    let guard = 0;
    while (Q.length < 10 && guard++ < 200) {
      const g = (Math.random() * GEN.length) | 0;
      if ((used[g] || 0) >= 2) continue;
      const q = GEN[g]();
      if (!q || Q.some(x => x.q === q.q)) continue;
      used[g] = (used[g] || 0) + 1; Q.push(q);
    }
  };

  LB.room('quiz', {
    render() {
      LB.visit('quiz');
      if (!Q.length || i >= Q.length && !answered) newRound();
      return {
        title: '乘車測驗',
        html: `<section class="wrap page narrow">
          ${LB.pageHead(LB.roomNo('quiz'), LB.roomColor('quiz'), '乘車測驗', '十道題，每一次都從手冊裡的資料重新出題。答對七題以上可以蓋「順利上車」，十題全對可以蓋「滿分乘客」。')}
          <div class="quiz card" id="quiz"></div>
        </section>`,
        after: v => {
          const box = $('#quiz', v);
          const best = () => st.get('quizBest', 0);
          const draw = () => {
            if (i >= Q.length) {
              const b = Math.max(best(), score); st.set('quizBest', b);
              if (score >= 7) LB.stamp('quiz-pass');
              if (score === 10) LB.stamp('quiz-perfect');
              box.innerHTML = `<div class="quiz-end"><div class="big-score">${score}<small> / 10</small></div>
                <p>${score === 10 ? '全部答對了。這張車票可以收好。' : score >= 7 ? '順利上車。錯的那幾題，下面的連結可以回去看。' : '還差一點。手冊裡都有答案，逛一圈再回來試試。'}</p>
                <p class="muted">這台裝置上的最佳成績：${b} 題。</p>
                <button type="button" class="btn" id="again">再考一次</button></div>`;
              $('#again', box).addEventListener('click', () => { newRound(); draw(); });
              return;
            }
            const q = Q[i]; answered = false;
            box.innerHTML = `<div class="quiz-top"><span>第 ${i + 1} 題 / 10</span><span>答對 ${score} 題</span></div>
              <div class="quiz-bar"><span style="width:${i * 10}%"></span></div>
              <h2 class="quiz-q">${esc(q.q)}</h2>
              <div class="quiz-opts">${q.o.map((o, k) => `<button type="button" class="opt" data-k="${k}"><span class="key">${'ABCD'[k]}</span>${esc(o)}</button>`).join('')}</div>
              <div class="quiz-why" id="why" aria-live="polite"></div>`;
            box.querySelector('.opt').focus({ preventScroll: true });
          };
          box.addEventListener('click', e => {
            const b = e.target.closest('.opt'); if (!b || answered) return;
            answered = true;
            const q = Q[i], k = Number(b.dataset.k), ok = k === q.a;
            if (ok) score++;
            box.querySelectorAll('.opt').forEach((x, j) => { x.disabled = true; if (j === q.a) x.classList.add('right'); else if (j === k) x.classList.add('wrong'); });
            $('#why', box).innerHTML = `<p><b>${ok ? '答對了。' : '答錯了。'}</b>${esc(q.why)} <a href="${q.link}">去看看 →</a></p><button type="button" class="btn small" id="next">${i === 9 ? '看成績' : '下一題'}</button>`;
            $('#next', box).addEventListener('click', () => { i++; draw(); });
            $('#next', box).focus({ preventScroll: true });
          });
          v.addEventListener('keydown', e => { const k = 'abcd'.indexOf(e.key.toLowerCase()); if (k >= 0 && !answered) box.querySelectorAll('.opt')[k]?.click(); });
          draw();
        },
      };
    },
  });
})();
