// 拼點教室：照遊戲的規則（見 data/combat.js）算兩個技能拼點的勝率，也可以一枚一枚擲給你看。
(function () {
  const LB = window.LB, { esc, $, store: st } = LB;
  const K = () => LB.combat;

  /* ── 計算 ── */
  const binom = (n, p) => {               // n 枚硬幣擲出 k 個正面的機率
    const out = [];
    for (let k = 0; k <= n; k++) {
      let c = 1; for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
      out.push(c * Math.pow(p, k) * Math.pow(1 - p, n - k));
    }
    return out;
  };
  const power = (s, coins, heads) => K().power(s.base, s.coin, heads, coins);
  const headsP = s => K().heads(s.sp);
  const bonus = (a, b) => K().clashBonus ? K().clashBonus(a, b) : 0;

  // 一回合：a 還剩 ca 枚、b 還剩 cb 枚時，a 贏、b 贏、平手的機率
  const round = (A, B, ca, cb) => {
    const da = binom(ca, headsP(A)), db = binom(cb, headsP(B));
    const ba = bonus(A, B), bb = bonus(B, A);
    let pa = 0, pb = 0, pt = 0;
    da.forEach((x, i) => db.forEach((y, j) => {
      const fa = power(A, ca, i) + ba, fb = power(B, cb, j) + bb;
      if (fa > fb) pa += x * y; else if (fb > fa) pb += x * y; else pt += x * y;
    }));
    return [pa, pb, pt];
  };
  // 整場：從 (ca, cb) 開始，最後 a 贏、剩幾枚的分布。平手照規則重擲，所以把平手的機率分給兩邊。
  const solve = (A, B) => {
    const memo = {};
    const f = (ca, cb) => {
      const key = ca + ',' + cb;
      if (memo[key]) return memo[key];
      let res;
      if (cb === 0) res = { a: 1, left: { [ca]: 1 }, rounds: 0 };
      else if (ca === 0) res = { a: 0, left: { ['b' + cb]: 1 }, rounds: 0 };
      else {
        const [pa, pb, pt] = round(A, B, ca, cb), d = pa + pb;
        if (d < 1e-12) res = { a: 0.5, left: {}, rounds: Infinity, stuck: true };
        else {
          const wa = pa / d, wb = pb / d, ea = f(ca, cb - 1), eb = f(ca - 1, cb), left = {};
          for (const k in ea.left) left[k] = (left[k] || 0) + wa * ea.left[k];
          for (const k in eb.left) left[k] = (left[k] || 0) + wb * eb.left[k];
          res = { a: wa * ea.a + wb * eb.a, left, rounds: 1 / d + wa * ea.rounds + wb * eb.rounds, stuck: ea.stuck || eb.stuck };
        }
      }
      return (memo[key] = res);
    };
    return f(A.coins, B.coins);
  };

  /* ── 預設的技能（教學用的數字，不是哪一個人格的技能） ── */
  const PRESETS = [
    { name: '三枚中規中矩', base: 4, coin: 3, coins: 3 },
    { name: '一枚定勝負', base: 12, coin: 8, coins: 1 },
    { name: '四枚小碎步', base: 3, coin: 2, coins: 4 },
    { name: '高基礎威力', base: 9, coin: 2, coins: 2 },
    { name: '負硬幣', base: 18, coin: -4, coins: 3 },
  ];
  let A = st.get('clashA', { base: 4, coin: 3, coins: 3, sp: 0, lv: 0 });
  let B = st.get('clashB', { base: 9, coin: 2, coins: 2, sp: 0, lv: 0 });

  const field = (side, k, label, min, max, step = 1) => {
    const s = side === 'a' ? A : B;
    return `<label class="fld"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-side="${side}" data-k="${k}" aria-label="${side === 'a' ? '我方' : '對手'}的${label}">
      <output id="o-${side}-${k}">${s[k]}</output></label>`;
  };
  const panel = (side, title) => `<article class="skill ${side}">
    <div class="skill-head"><h2>${title}</h2>
      <select data-preset="${side}" aria-label="${title}的預設技能"><option value="">套用預設……</option>${PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)}（${p.base}${p.coin >= 0 ? '+' : ''}${p.coin} × ${p.coins}）</option>`).join('')}</select></div>
    ${field(side, 'base', '基礎威力', 0, 30)}
    ${field(side, 'coin', '硬幣威力', -10, 15)}
    ${field(side, 'coins', '硬幣數', 1, 6)}
    ${field(side, 'sp', '理智值', K().spMin, K().spMax)}
    ${K().clashBonus ? field(side, 'lv', '攻擊等級（相對）', -15, 15) : ''}
    <div class="skill-sum" id="sum-${side}"></div>
    <div class="coins" id="coins-${side}" aria-hidden="true"></div>
  </article>`;

  LB.room('clash', {
    render() {
      LB.visit('clash');
      const C = K();
      return {
        title: '拼點教室',
        html: `<section class="wrap page">
          ${LB.pageHead(LB.roomNo('clash'), LB.roomColor('clash'), '拼點教室', '兩邊的技能對上時，會一回合一回合地擲硬幣比威力。這裡照遊戲的規則，把兩個技能拼點的勝率精確算出來；也可以按「擲一次」，一枚一枚看它怎麼分出勝負。')}
          <div class="rules card">${LB.prose(C.rulesText)}</div>
          <div class="clash">
            ${panel('a', '我方')}
            <div class="versus">
              <div class="odds" id="odds" aria-live="polite"></div>
              <div class="vs-btns">
                <button type="button" class="btn" id="roll">擲一次</button>
                <button type="button" class="btn ghost small" id="swap">交換兩邊</button>
              </div>
              <ol class="log" id="log" aria-live="polite"></ol>
            </div>
            ${panel('b', '對手')}
          </div>
          <h2 class="h2">幾個常用的數字</h2>
          <div class="table-wrap"><table class="list"><tbody>${(C.facts || []).map(([k, d]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>
          <h2 class="h2">抗性</h2>
          <p class="muted">每一種物理傷害（斬擊、突刺、打擊）和每一種罪，對手都有各自的抗性；兩種抗性的增減是相加的。例如對斬擊脆弱（+50%）、對暴怒耐性（−12.5%），合起來是 +37.5%。</p>
          <div class="table-wrap"><table class="list"><thead><tr><th scope="col">抗性</th><th scope="col">英文</th><th scope="col">倍率</th></tr></thead><tbody>${(C.resist || []).map(([a, b, c]) => `<tr><td><b>${esc(a)}</b></td><td><span class="en">${esc(b)}</span></td><td>${esc(c)}</td></tr>`).join('')}</tbody></table></div>
          <p class="note">${esc(C.note || '')}</p>
        </section>`,
        after: v => {
          const upd = () => {
            st.set('clashA', A); st.set('clashB', B);
            [['a', A], ['b', B]].forEach(([side, s]) => {
              ['base', 'coin', 'coins', 'sp', 'lv'].forEach(k => { const o = $(`#o-${side}-${k}`, v); if (o) o.textContent = s[k]; const i = v.querySelector(`input[data-side="${side}"][data-k="${k}"]`); if (i) i.value = s[k]; });
              const p = headsP(s), lo = Math.min(power(s, s.coins, 0), power(s, s.coins, s.coins)), hi = Math.max(power(s, s.coins, 0), power(s, s.coins, s.coins));
              $(`#sum-${side}`, v).innerHTML = `每枚擲出正面的機率 <b>${Math.round(p * 100)}%</b>，第一回合的威力在 <b>${lo}</b> 到 <b>${hi}</b> 之間。`;
              $(`#coins-${side}`, v).innerHTML = Array.from({ length: s.coins }, () => `<i class="coin"></i>`).join('');
            });
            const r = solve(A, B);
            const pa = Math.round(r.a * 1000) / 10;
            const leftA = Object.entries(r.left).filter(([k]) => !k.startsWith('b')).sort((x, y) => y[1] - x[1])[0];
            $('#odds', v).innerHTML = r.stuck ? `<p>兩邊的威力永遠一樣，會一直平手下去。調整一下數字吧。</p>` : `
              <div class="odds-bar" role="img" aria-label="我方勝率 ${pa}%"><span style="width:${pa}%"></span></div>
              <div class="odds-num"><b>${pa}%</b><span>我方勝率</span><b>${Math.round((100 - pa) * 10) / 10}%</b><span>對手勝率</span></div>
              <p>平均要擲 ${r.rounds.toFixed(1)} 回合（拼點次數）才分出勝負${leftA ? `；我方贏的時候，最常見的是剩 ${leftA[0]} 枚硬幣去攻擊` : ''}。照這個次數，贏的一方理智值大約加 ${K().spGain(Math.max(1, Math.round(r.rounds)))}，攻擊的傷害多 ${Math.round(r.rounds * 3)}%。</p>`;
          };
          v.addEventListener('input', e => {
            const i = e.target.closest('input[type=range]'); if (!i) return;
            (i.dataset.side === 'a' ? A : B)[i.dataset.k] = Number(i.value); upd();
          });
          v.addEventListener('change', e => {
            const sel = e.target.closest('[data-preset]'); if (!sel || sel.value === '') return;
            const p = PRESETS[Number(sel.value)], s = sel.dataset.preset === 'a' ? A : B;
            Object.assign(s, { base: p.base, coin: p.coin, coins: p.coins }); sel.value = ''; upd();
          });
          $('#swap', v).addEventListener('click', () => { [A, B] = [B, A]; upd(); });
          $('#roll', v).addEventListener('click', () => {
            const log = $('#log', v); log.innerHTML = '';
            let ca = A.coins, cb = B.coins, n = 0;
            const lines = [];
            while (ca > 0 && cb > 0 && n < 60) {
              n++;
              const fa = Array.from({ length: ca }, () => Math.random() < headsP(A)), fb = Array.from({ length: cb }, () => Math.random() < headsP(B));
              const pa = power(A, ca, fa.filter(Boolean).length) + bonus(A, B), pb = power(B, cb, fb.filter(Boolean).length) + bonus(B, A);
              const coinStr = f => f.map(x => x ? '●' : '○').join('');
              let res;
              if (pa > pb) { cb--; res = '我方贏這一回合，對手少一枚硬幣'; }
              else if (pb > pa) { ca--; res = '對手贏這一回合，我方少一枚硬幣'; }
              else res = '平手，重擲';
              lines.push(`<li><span class="rn">第 ${n} 回</span><span class="cf">${coinStr(fa)} <b>${pa}</b> 對 <b>${pb}</b> ${coinStr(fb)}</span><span>${res}</span></li>`);
            }
            lines.push(`<li class="end">${ca > 0 ? `我方贏了拼點，帶著 ${ca} 枚硬幣攻擊` : `對手贏了拼點，帶著 ${cb} 枚硬幣攻擊`}。拼點次數 ${n}，贏的一方理智值 +${K().spGain(n)}。</li>`);
            if (LB.reduce()) log.innerHTML = lines.join('');
            else lines.forEach((l, i) => setTimeout(() => { if (log.isConnected) log.insertAdjacentHTML('beforeend', l); }, i * 260));
            const n2 = st.get('clashCount', 0) + 1; st.set('clashCount', n2);
            if (n2 >= 10) LB.stamp('clash-10');
          });
          upd();
        },
      };
    },
  });

  LB.clashSolve = solve;     // 遊戲車廂的拼點對決也用這一套
  LB.clashRound = round;
})();
