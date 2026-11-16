// 乘客名冊（座位表）與每一位乘客的個人頁。
(function () {
  const LB = window.LB, { esc, $ } = LB, E = window.emblem;
  const P = () => LB.profiles || {};
  const workOf = id => (LB.works || []).find(w => w.sinner === id);
  const order = () => [...LB.sinners, ...LB.crew].sort((a, b) => (a.no || 99) - (b.no || 99) || 0);

  const seat = p => `<a class="seat${p.crew ? ' crew' : ''}" href="#/sinner/${p.id}" data-id="${p.id}" style="--pc:${p.c || 'var(--amber)'}">
      ${E(p.emblem)}<span class="no">${p.crew ? esc(p.role) : 'No.' + String(p.no).padStart(2, '0')}</span><span class="nm">${esc(p.zh)}</span></a>`;

  LB.room('roster', {
    render() {
      LB.visit('roster');
      const s = LB.stamps();
      const top = LB.sinners.slice(0, 6), bot = LB.sinners.slice(6);
      const mob = [];
      for (let i = 0; i < 6; i++) mob.push(seat(LB.sinners[i * 2]), i === 0 ? '<div class="aisle">走 道</div>' : '', seat(LB.sinners[i * 2 + 1]));
      const rows = order().map(p => {
        const c = LB.cantoOf(p.id), w = workOf(p.id);
        return `<tr><td>${p.no ? p.no : '—'}</td><td><a href="#/sinner/${p.id}">${esc(p.zh)}</a> <span class="en">${esc(p.en)}</span>${s['sinner-' + p.id] ? ' <i class="been">看過</i>' : ''}</td>
          <td>${p.src ? `${esc(p.src.author)}${p.src.work ? `《${w ? `<a href="#/library/${w.id}">${esc(p.src.work)}</a>` : esc(p.src.work)}》` : ''}` : ''}</td>
          <td>${p.src && p.src.year ? esc(p.src.year) : ''}</td>
          <td>${c ? `<a href="#/canto/${c.no}">${esc(c.lab)}</a>` : p.crew ? esc(p.role) : '還沒有'}</td></tr>`;
      }).join('');
      return {
        title: '乘客名冊',
        html: `<section class="wrap page">
          ${LB.pageHead(LB.roomNo('roster'), LB.roomColor('roster'), '乘客名冊', '車上坐著十二位罪人，每一位的名字都取自一部文學作品。點一個座位，就會到那位乘客的個人頁；管理人、嚮導和司機的位子在車頭。')}
          <div class="bus big">
            <div class="seats wide-only">${top.map(seat).join('')}<div class="aisle">走 道</div>${bot.map(seat).join('')}</div>
            <div class="seats narrow-only">${mob.join('')}</div>
            <div class="cab">${LB.crew.map(seat).join('')}</div>
          </div>
          <p class="note">座位的排法是這個網站自己畫的，不是遊戲裡的設定。小圖示照各人名字出處的作品畫成，不是官方圖。</p>
          <h2 class="h2">一覽表</h2>
          <div class="table-wrap"><table class="list">
            <thead><tr><th scope="col">號</th><th scope="col">名字</th><th scope="col">出處</th><th scope="col">成書</th><th scope="col">主角的章節</th></tr></thead>
            <tbody>${rows}</tbody></table></div>
        </section>`,
      };
    },
  });

  LB.room('sinner', {
    group: 'roster',
    render(id) {
      const p = LB.people[id];
      if (!p) return { title: '找不到這位乘客', html: `<section class="wrap page"><p>找不到這位乘客。<a href="#/roster">回到名冊</a></p></section>` };
      LB.stamp('sinner-' + id, true);
      const pr = P()[id] || {}, c = LB.cantoOf(id), w = workOf(id);
      const list = order(), i = list.indexOf(p), prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
      const ch = pr.backstoryCh ?? (c ? c.no : 99);
      const facts = [
        p.crew ? ['身分', esc(p.roleLong || p.role)] : ['座號', `${p.no} 號`],
        p.src ? ['出處', `${esc(p.src.author)}${p.src.work ? `《${w ? `<a href="#/library/${w.id}">${esc(p.src.work)}</a>` : esc(p.src.work)}》` : ''}${p.src.year ? `（${esc(p.src.year)}）` : ''}`] : null,
        c ? ['主角的章節', `<a href="#/canto/${c.no}">${esc(c.lab)}〈${esc(c.title)}〉</a>`] : null,
        pr.ego ? ['基本 E.G.O', `${esc(pr.ego.zh)} <span class="en">${esc(pr.ego.en)}</span>`] : null,
        p.cn && p.cn !== p.zh ? ['簡體譯名', esc(p.cn)] : null,
      ].filter(Boolean);
      const ids = (pr.ids || []).map(x => `<li><b>${esc(x.zh)}</b><span class="en">${esc(x.en)}</span>${x.from ? `<span class="from">${esc(x.from)}</span>` : ''}</li>`).join('');
      return {
        title: p.zh,
        html: `<section class="wrap page person" style="--pc:${p.c || 'var(--amber)'}">
          <nav class="crumbs" aria-label="位置"><a href="#/">總站</a><a href="#/roster">乘客名冊</a><span>${esc(p.zh)}</span></nav>
          <header class="person-head">
            <div class="person-emb">${E(p.emblem)}</div>
            <div>
              <div class="d-no">${p.crew ? esc((p.role || '').toUpperCase()) : 'SINNER No.' + String(p.no).padStart(2, '0')}</div>
              <h1>${esc(p.zh)}</h1>
              <div class="d-en">${esc(p.en)}</div>
            </div>
          </header>
          <div class="person-grid">
            <aside class="person-facts"><dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
              <div class="swatch" title="這位乘客的代表色"><span style="background:${p.c || 'var(--amber)'}"></span>代表色 ${esc(p.c || '')}</div>
            </aside>
            <div class="person-body">
              ${pr.persona ? `<section><h2>在車上</h2>${LB.prose(pr.persona)}</section>` : ''}
              ${p.note || (w && w.summary) ? `<section><h2>原著</h2>${LB.prose(w && w.summary ? w.summary : p.note)}${w ? `<p><a class="more" href="#/library/${w.id}">到書房看《${esc(w.title)}》 →</a></p>` : ''}</section>` : ''}
              ${pr.reinterp ? `<section><h2>遊戲怎麼改寫原著</h2>${LB.spoil(ch, LB.prose(pr.reinterp), 're-' + id)}</section>` : ''}
              ${pr.backstory ? `<section><h2>過去${pr.backstoryNote ? `<small>（${esc(pr.backstoryNote)}）</small>` : ch < 99 ? `<small>（${ch === 0 ? '序章' : '第' + LB.num(ch) + '章'}揭露）</small>` : ''}</h2>${LB.spoil(ch, LB.prose(pr.backstory), 'bs-' + id)}</section>` : ''}
              ${ids ? `<section><h2>幾個常見的人格</h2><p class="muted">人格是透過鏡子技術，把另一個世界裡的${esc(p.zh)}疊到本人身上。這裡只列幾個例子，名稱用 LLC 的譯名。</p><ul class="ids">${ids}</ul></section>` : ''}
            </div>
          </div>
          <nav class="pager" aria-label="上一位與下一位">
            <a href="#/sinner/${prev.id}">← ${esc(prev.zh)}</a>
            <a href="#/roster">回到名冊</a>
            <a href="#/sinner/${next.id}">${esc(next.zh)} →</a>
          </nav>
        </section>`,
      };
    },
  });
})();
