// 書房：十三部作品排成一排書背；每本書有自己的頁面與「想讀／讀過」。
(function () {
  const LB = window.LB, { esc, $, store: st } = LB, E = window.emblem;
  const shelf = () => st.get('shelf', {});
  const setShelf = (id, v) => {
    const s = shelf(); if (v) s[id] = v; else delete s[id]; st.set('shelf', s);
    if (Object.values(s).filter(x => x === 'read').length >= 5) LB.stamp('library-5');
  };
  const person = w => LB.people[w.sinner];

  LB.room('library', {
    render(id) {
      LB.visit('library');
      const W = LB.works || [];
      if (id) return detail(W.find(w => w.id === id));
      const s = shelf(), read = W.filter(w => s[w.id] === 'read').length, want = W.filter(w => s[w.id] === 'want').length;
      return {
        title: '書房',
        html: `<section class="wrap page">
          ${LB.pageHead(LB.roomNo('library'), LB.roomColor('library'), '書房', '十三位乘客的名字各自出自一部作品，從古希臘史詩到二十世紀的小說。抽一本書出來，看它講什麼、遊戲借了它的哪一部分；也可以把它加進自己的書單。')}
          <div class="shelf" role="list">${W.map(w => { const p = person(w); return `<a role="listitem" class="spine${s[w.id] ? ' ' + s[w.id] : ''}" href="#/library/${w.id}" style="--pc:${p ? p.c : 'var(--amber)'};--h:${w.h || 86}%">
            <span class="spine-t">${esc(w.title)}</span><span class="spine-a">${esc(w.author)}</span>${p ? `<span class="spine-e">${E(p.emblem)}</span>` : ''}</a>`; }).join('')}</div>
          <p class="note">書單：讀過 ${read} 本、想讀 ${want} 本。書背上亮起的是讀過的，掛著書籤的是想讀的。紀錄只存在這台裝置。</p>
          <div class="table-wrap"><table class="list">
            <thead><tr><th scope="col">書名</th><th scope="col">作者</th><th scope="col">年代</th><th scope="col">原文</th><th scope="col">乘客</th></tr></thead>
            <tbody>${W.map(w => { const p = person(w); return `<tr><td><a href="#/library/${w.id}">《${esc(w.title)}》</a></td><td>${esc(w.author)}</td><td>${esc(w.year)}</td><td><span class="en">${esc(w.orig || '')}</span></td><td>${p ? `<a href="#/sinner/${p.id}">${esc(p.zh)}</a>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
          <h2 class="h2">車上的名字從哪裡來</h2>
          <p class="muted">除了十三位乘客，車本身、司機、嚮導，連章節的名稱，也都是從古典文學裡借來的。</p>
          <div class="names">${LB.names.map(n => `<article class="card"><div class="from">${esc(n.from)}</div><h3>${esc(n.title)}</h3>${LB.prose(n.text)}</article>`).join('')}</div>
        </section>`,
      };
    },
  });

  function detail(w) {
    if (!w) return { title: '找不到這本書', html: `<section class="wrap page"><p>書架上沒有這本書。<a href="#/library">回到書房</a></p></section>` };
    const p = person(w), c = p && LB.cantoOf(p.id), s = shelf();
    const game = w.game || (p && (LB.profiles || {})[p.id] && LB.profiles[p.id].reinterp);
    const W = LB.works, i = W.indexOf(w), prev = W[(i - 1 + W.length) % W.length], next = W[(i + 1) % W.length];
    return {
      title: `《${w.title}》`,
      html: `<section class="wrap page person" style="--pc:${p ? p.c : 'var(--amber)'}">
        <nav class="crumbs" aria-label="位置"><a href="#/">總站</a><a href="#/library">書房</a><span>《${esc(w.title)}》</span></nav>
        <header class="person-head">
          <div class="person-emb book">${p ? E(p.emblem) : ''}</div>
          <div><div class="d-no">${esc(w.year)} · ${esc(w.lang || '')}</div><h1>《${esc(w.title)}》</h1><div class="d-en">${esc(w.author)}${w.orig ? `｜${esc(w.orig)}` : ''}</div></div>
        </header>
        <div class="person-grid">
          <aside class="person-facts">
            <dl>
              <dt>作者</dt><dd>${esc(w.author)}${w.life ? `（${esc(w.life)}）` : ''}</dd>
              <dt>年代</dt><dd>${esc(w.year)}</dd>
              ${w.form ? `<dt>體裁</dt><dd>${esc(w.form)}</dd>` : ''}
              ${w.orig ? `<dt>原文書名</dt><dd>${esc(w.orig)}</dd>` : ''}
              ${p ? `<dt>乘客</dt><dd><a href="#/sinner/${p.id}">${esc(p.zh)}</a></dd>` : ''}
              ${c ? `<dt>章節</dt><dd><a href="#/canto/${c.no}">${esc(c.lab)}〈${esc(c.title)}〉</a></dd>` : ''}
            </dl>
            <div class="shelf-btns" role="group" aria-label="加進書單">
              <button type="button" class="chip" data-shelf="want" aria-pressed="${s[w.id] === 'want'}">想讀</button>
              <button type="button" class="chip" data-shelf="read" aria-pressed="${s[w.id] === 'read'}">讀過</button>
            </div>
          </aside>
          <div class="person-body">
            ${w.opening ? `<blockquote class="opening"><p>${esc(w.opening)}</p><footer>${esc(w.openingNote || '開頭的一句，手冊自己的譯文')}</footer></blockquote>` : ''}
            <section><h2>這本書在講什麼</h2>${LB.prose(w.summary || '')}</section>
            ${w.themes ? `<section><h2>常被討論的主題</h2><ul class="tags">${w.themes.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
            ${game ? `<section><h2>遊戲借了什麼</h2>${c ? LB.spoil(c.no, LB.prose(game), 'wg-' + w.id) : LB.spoil(99, LB.prose(game), 'wg-' + w.id)}</section>` : ''}
            ${w.read ? `<section><h2>想讀的話</h2>${LB.prose(w.read)}</section>` : ''}
          </div>
        </div>
        <nav class="pager" aria-label="上一本與下一本"><a href="#/library/${prev.id}">← 《${esc(prev.title)}》</a><a href="#/library">回到書房</a><a href="#/library/${next.id}">《${esc(next.title)}》 →</a></nav>
      </section>`,
      after: v => {
        v.querySelectorAll('[data-shelf]').forEach(b => b.addEventListener('click', () => {
          const cur = shelf()[w.id], val = b.dataset.shelf === cur ? null : b.dataset.shelf;
          setShelf(w.id, val);
          v.querySelectorAll('[data-shelf]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.shelf === val)));
          LB.toast(val ? `《${w.title}》加進「${val === 'read' ? '讀過' : '想讀'}」。` : `《${w.title}》從書單拿掉了。`);
        }));
      },
    };
  }
})();
