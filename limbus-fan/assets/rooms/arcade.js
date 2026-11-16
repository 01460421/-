// 遊戲車廂：出處配對、章節排序、拼點對決。
(function () {
  const LB = window.LB, { esc, $, store: st } = LB, E = window.emblem;
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const GAMES = [
    { id: 'match', name: '出處配對', desc: '翻開兩張牌，把乘客和他名字出處的書配成一對。六對全部配完就過關。', emb: 'quill' },
    { id: 'order', name: '章節排序', desc: '五章被打亂了。照上線的先後排回去，看你記不記得路線。', emb: 'clock' },
    { id: 'duel', name: '拼點對決', desc: '每一回合從三個技能裡挑一個和對手拼點，先贏三次的人獲勝。規則和拼點教室一樣。', emb: 'wheel' },
  ];
  const head = (title, lede) => `<nav class="crumbs" aria-label="位置"><a href="#/">總站</a><a href="#/arcade">遊戲車廂</a><span>${esc(title)}</span></nav>
    <header class="sec-head" style="--c:${LB.roomColor('arcade')}"><div class="sec-no" aria-hidden="true">${LB.roomNo('arcade')}</div><h1>${esc(title)}</h1><p>${lede}</p></header>`;

  LB.room('arcade', {
    render(game) {
      LB.visit('arcade');
      if (game === 'match') return match();
      if (game === 'order') return order();
      if (game === 'duel') return duel();
      const best = st.get('arcade', {});
      return {
        title: '遊戲車廂',
        html: `<section class="wrap page">
          ${LB.pageHead(LB.roomNo('arcade'), LB.roomColor('arcade'), '遊戲車廂', '坐車坐悶了，玩一局。三個小遊戲都用手冊裡的資料，過關的時候會在車票簿上蓋章。')}
          <div class="grid3">${GAMES.map(g => `<a class="card game-card" href="#/arcade/${g.id}">${E(g.emb)}<h2>${esc(g.name)}</h2><p>${esc(g.desc)}</p>
            <span class="muted">${best[g.id] ? esc(best[g.id]) : '還沒玩過'}</span></a>`).join('')}</div>
        </section>`,
      };
    },
  });
  const record = (id, text) => { const b = st.get('arcade', {}); b[id] = text; st.set('arcade', b); };

  /* ── 出處配對 ── */
  function match() {
    const ps = shuffle(LB.sinners).slice(0, 6);
    const cards = shuffle(ps.flatMap(p => [{ id: p.id, kind: 'p', p }, { id: p.id, kind: 'w', p }]));
    return {
      title: '出處配對',
      html: `<section class="wrap page">${head('出處配對', '翻開兩張牌：一張是乘客，一張是書。配對成功的會留在桌上。')}
        <div class="game-top"><span id="mMoves">翻了 0 次</span><span id="mPairs">配好 0 / 6 對</span><button type="button" class="chip" id="mNew">重新洗牌</button></div>
        <div class="memory" id="mem">${cards.map((c, i) => `<button type="button" class="mcard" data-i="${i}" aria-label="第 ${i + 1} 張牌，還沒翻開"><span class="back" aria-hidden="true">LCB</span><span class="front"></span></button>`).join('')}</div>
        <p class="game-msg" id="mMsg" aria-live="polite"></p></section>`,
      after: v => {
        let open = [], moves = 0, pairs = 0, lock = false;
        const face = c => c.kind === 'p' ? `${E(c.p.emblem)}<b>${esc(c.p.zh)}</b>` : `<i>《${esc(c.p.src.work)}》</i><small>${esc(c.p.src.author)}</small>`;
        const label = c => c.kind === 'p' ? c.p.zh : `《${c.p.src.work}》`;
        $('#mNew', v).addEventListener('click', () => LB.rerender());
        $('#mem', v).addEventListener('click', e => {
          const b = e.target.closest('.mcard'); if (!b || lock || b.classList.contains('up')) return;
          const c = cards[Number(b.dataset.i)];
          b.classList.add('up'); b.querySelector('.front').innerHTML = face(c); b.setAttribute('aria-label', label(c));
          open.push([b, c]);
          if (open.length < 2) return;
          moves++; $('#mMoves', v).textContent = `翻了 ${moves} 次`;
          const [[b1, c1], [b2, c2]] = open; open = [];
          if (c1.id === c2.id && c1.kind !== c2.kind) {
            b1.classList.add('done'); b2.classList.add('done'); pairs++;
            $('#mPairs', v).textContent = `配好 ${pairs} / 6 對`;
            $('#mMsg', v).textContent = `${c1.p.zh}出自${c1.p.src.author}《${c1.p.src.work}》。`;
            if (pairs === 6) { $('#mMsg', v).textContent = `全部配完了，一共翻了 ${moves} 次。`; record('match', `最近一次：翻 ${moves} 次過關`); LB.stamp('arcade-match'); }
          } else {
            lock = true;
            setTimeout(() => { [b1, b2].forEach(x => { x.classList.remove('up'); x.querySelector('.front').innerHTML = ''; x.setAttribute('aria-label', '還沒翻開的牌'); }); lock = false; }, 900);
          }
        });
      },
    };
  }

  /* ── 章節排序 ── */
  function order() {
    const pick = shuffle(LB.cantos.filter(c => !c.side && c.no > 0)).slice(0, 5);
    let cur = shuffle(pick);
    return {
      title: '章節排序',
      html: `<section class="wrap page narrow">${head('章節排序', '照上線的先後，把這五章由上往下排好。點一張卡片，再點另一張，兩張就會交換位置；也可以用每張卡片旁邊的箭頭。')}
        <ol class="sorter" id="sorter"></ol>
        <div class="game-top"><button type="button" class="btn" id="oCheck">對答案</button><button type="button" class="chip" id="oNew">換一組</button></div>
        <p class="game-msg" id="oMsg" aria-live="polite"></p></section>`,
      after: v => {
        let sel = null, tries = 0;
        const draw = () => {
          $('#sorter', v).innerHTML = cur.map((c, i) => { const p = LB.people[c.who[0]]; return `<li><button type="button" class="sort-card${sel === i ? ' sel' : ''}" data-i="${i}" aria-pressed="${sel === i}">${p ? E(p.emblem) : ''}<span><b>〈${esc(c.title)}〉</b><small>主角：${p ? esc(p.zh) : '—'}</small></span></button>
            <span class="arrows"><button type="button" class="icon-btn" data-up="${i}" aria-label="往上移" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="icon-btn" data-down="${i}" aria-label="往下移" ${i === cur.length - 1 ? 'disabled' : ''}>↓</button></span></li>`; }).join('');
        };
        const swap = (a, b) => { [cur[a], cur[b]] = [cur[b], cur[a]]; sel = null; draw(); };
        $('#sorter', v).addEventListener('click', e => {
          const up = e.target.closest('[data-up]'), dn = e.target.closest('[data-down]'), c = e.target.closest('.sort-card');
          if (up) return swap(Number(up.dataset.up), Number(up.dataset.up) - 1);
          if (dn) return swap(Number(dn.dataset.down), Number(dn.dataset.down) + 1);
          if (c) { const i = Number(c.dataset.i); if (sel === null) { sel = i; draw(); } else if (sel === i) { sel = null; draw(); } else swap(sel, i); }
        });
        $('#oCheck', v).addEventListener('click', () => {
          tries++;
          const ok = cur.every((c, i) => i === 0 || cur[i - 1].no < c.no);
          const right = cur.filter((c, i) => c === pick.slice().sort((a, b) => a.no - b.no)[i]).length;
          if (ok) { $('#oMsg', v).innerHTML = `排對了。順序是：${cur.map(c => `${esc(c.lab)}〈${esc(c.title)}〉（${esc(c.when)}）`).join('、')}。`; record('order', `最近一次：第 ${tries} 次就排對`); LB.stamp('arcade-order'); }
          else $('#oMsg', v).textContent = `有 ${right} 張在正確的位置上，再調整看看。`;
        });
        $('#oNew', v).addEventListener('click', () => LB.rerender());
        draw();
      },
    };
  }

  /* ── 拼點對決 ── */
  function duel() {
    const C = LB.combat;
    const pool = [
      { name: '穩紮穩打', base: 5, coin: 3, coins: 3 }, { name: '孤注一擲', base: 10, coin: 9, coins: 1 }, { name: '碎步連擊', base: 3, coin: 2, coins: 4 },
      { name: '厚實一擊', base: 9, coin: 3, coins: 2 }, { name: '逆勢硬幣', base: 17, coin: -4, coins: 3 }, { name: '雙枚快攻', base: 6, coin: 5, coins: 2 },
      { name: '拖長戰線', base: 2, coin: 3, coins: 5 }, { name: '平均分配', base: 7, coin: 4, coins: 2 },
    ];
    const S = { me: 0, foe: 0, spMe: 0, spFoe: 0, hand: [], round: 1, over: false };
    const deal = () => { S.hand = shuffle(pool).slice(0, 3); };
    deal();
    return {
      title: '拼點對決',
      html: `<section class="wrap page">${head('拼點對決', '每一回合，從手上的三個技能挑一個和對手拼點。贏的一方照拼點次數增加理智值，理智值越高越容易擲出正面；輸了不扣理智值。先贏三次的人獲勝。')}
        <div class="duel">
          <div class="duel-score"><div><span>你</span><b id="dMe">0</b><small id="dSpMe">理智 0</small></div><div class="vs">對</div><div><span>對手</span><b id="dFoe">0</b><small id="dSpFoe">理智 0</small></div></div>
          <label class="switch"><input type="checkbox" id="dOdds"> <span>顯示每個技能對上對手的勝率（對手出什麼是隨機的）</span></label>
          <div class="dhand" id="dHand"></div>
          <ol class="log" id="dLog" aria-live="polite"></ol>
          <div class="game-top"><button type="button" class="chip" id="dNew">重新開始</button></div>
        </div></section>`,
      after: v => {
        const showOdds = () => $('#dOdds', v).checked;
        const foeSkill = () => pool[(Math.random() * pool.length) | 0];
        const avgOdds = sk => { const me = { ...sk, sp: S.spMe, lv: 0 }; let t = 0; pool.forEach(f => { t += LB.clashSolve(me, { ...f, sp: S.spFoe, lv: 0 }).a; }); return t / pool.length; };
        const draw = () => {
          $('#dMe', v).textContent = S.me; $('#dFoe', v).textContent = S.foe;
          $('#dSpMe', v).textContent = `理智 ${S.spMe}`; $('#dSpFoe', v).textContent = `理智 ${S.spFoe}`;
          $('#dHand', v).innerHTML = S.over ? '' : S.hand.map((sk, i) => `<button type="button" class="skill-card" data-i="${i}"><b>${esc(sk.name)}</b><span>基礎 ${sk.base}・硬幣 ${sk.coin >= 0 ? '+' : ''}${sk.coin} × ${sk.coins}</span>${showOdds() ? `<em>平均勝率 ${Math.round(avgOdds(sk) * 100)}%</em>` : ''}</button>`).join('');
        };
        const clamp = x => Math.max(C.spMin, Math.min(C.spMax, x));
        const play = sk => {
          const fs = foeSkill(), A = { ...sk, sp: S.spMe, lv: 0 }, B = { ...fs, sp: S.spFoe, lv: 0 };
          let ca = A.coins, cb = B.coins, n = 0;
          while (ca > 0 && cb > 0 && n < 60) {
            n++;
            const ha = Array.from({ length: ca }, () => Math.random() < C.heads(A.sp)).filter(Boolean).length;
            const hb = Array.from({ length: cb }, () => Math.random() < C.heads(B.sp)).filter(Boolean).length;
            const pa = C.power(A.base, A.coin, ha, ca), pb = C.power(B.base, B.coin, hb, cb);
            if (pa > pb) cb--; else if (pb > pa) ca--;
          }
          const win = ca > 0;
          if (win) S.me++; else S.foe++;
          const g = C.spGain(n);                 // 贏的一方照拼點次數加理智值；輸的一方沒有預設的扣減
          if (win) S.spMe = clamp(S.spMe + g); else S.spFoe = clamp(S.spFoe + g);
          $('#dLog', v).insertAdjacentHTML('afterbegin', `<li><span class="rn">第 ${S.round} 回合</span><span>你用「${esc(sk.name)}」，對手用「${esc(fs.name)}」，擲了 ${n} 回合。</span><span>${win ? `你贏了，剩 ${ca} 枚硬幣，理智值 +${g}。` : `對手贏了，剩 ${cb} 枚硬幣，對手的理智值 +${g}。`}</span></li>`);
          S.round++;
          if (S.me >= 3 || S.foe >= 3) {
            S.over = true;
            $('#dLog', v).insertAdjacentHTML('afterbegin', `<li class="end">${S.me >= 3 ? `你以 ${S.me} 比 ${S.foe} 贏下對決。` : `對手以 ${S.foe} 比 ${S.me} 贏了。再來一局吧。`}</li>`);
            if (S.me >= 3) { LB.stamp('arcade-duel'); record('duel', `最近一次：${S.me} 比 ${S.foe} 獲勝`); } else record('duel', `最近一次：${S.me} 比 ${S.foe} 落敗`);
          } else deal();
          draw();
        };
        $('#dHand', v).addEventListener('click', e => { const b = e.target.closest('.skill-card'); if (b && !S.over) play(S.hand[Number(b.dataset.i)]); });
        $('#dOdds', v).addEventListener('change', draw);
        $('#dNew', v).addEventListener('click', () => LB.rerender());
        draw();
      },
    };
  }
})();
