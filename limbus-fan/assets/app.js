// 把 data.js 的內容排上頁面：發車看板、座位表、七宗罪、路線圖、名字的來歷、辭典、上車須知。
(function () {
  const D = window.LB, E = window.emblem;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const byId = Object.fromEntries([...D.sinners, ...D.crew].map(p => [p.id, p]));
  const sinById = Object.fromEntries(D.sins.map(s => [s.id, s]));

  /* ── 開頭的路線：七種罪的顏色接成一條線 ── */
  (function routeLine() {
    const svg = $('#routeLine');
    if (!svg) return;
    const W = 1000, y = 32, n = D.sins.length, step = W / n;
    let out = '';
    D.sins.forEach((s, i) => {
      const x0 = i * step + 8, x1 = (i + 1) * step - 8;
      out += `<path class="seg" pathLength="1" d="M${x0} ${y}H${x1}" stroke="${s.c}" style="animation-delay:${i * 0.12}s"/>`;
    });
    D.sins.forEach((s, i) => {
      const x = i * step + (i ? 0 : 8);
      out += `<circle class="stop" cx="${Math.max(10, x)}" cy="${y}" r="9" stroke="${s.c}" style="animation-delay:${0.2 + i * 0.12}s"><title>${esc(s.zh)}</title></circle>`;
    });
    out += `<circle class="stop" cx="${W - 10}" cy="${y}" r="9" stroke="${D.sins[n - 1].c}" style="animation-delay:${0.2 + n * 0.12}s"/>`;
    svg.innerHTML = out;
  })();

  /* ── 發車看板：最近幾章，字一格一格翻到位 ── */
  (function board() {
    const tb = $('#boardRows');
    if (!tb) return;
    const main = D.cantos.filter(c => !c.side);
    const rows = main.slice(-5).reverse();
    tb.innerHTML = rows.map((c, i) => `<tr>
      <td><span class="flap" data-t="${esc(c.code)}">${esc(c.code)}</span></td>
      <td class="dest">${esc(c.title)}</td>
      <td><span class="flap" data-t="${esc(c.when)}">${esc(c.when)}</span></td>
      <td class="st">${i === 0 ? '<span class="tag now">最新</span>' : '<span class="tag">已到站</span>'}</td>
    </tr>`).join('');
    $('#boardStamp').textContent = D.updated;
    if (reduce) return;
    const chars = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ.-';
    tb.querySelectorAll('.flap').forEach((el, k) => {
      const t = el.dataset.t;
      let f = 0;
      const tick = () => {
        f++;
        el.textContent = [...t].map((ch, j) => (f > 6 + j * 2 + k ? ch : (ch === ' ' ? ' ' : chars[(Math.random() * chars.length) | 0]))).join('');
        if (f < 8 + t.length * 2 + k) setTimeout(tick, 45);
        else el.textContent = t;
      };
      setTimeout(tick, 300 + k * 60);
    });
  })();

  /* ── 座位表 ── */
  (function roster() {
    const seats = $('#seats'), cab = $('#cab'), panel = $('#detail');
    if (!seats) return;
    const seat = p => `<button type="button" class="seat${p.crew ? ' crew' : ''}" data-id="${p.id}" aria-pressed="false" aria-controls="detail">
        ${E(p.emblem)}<span class="no">${p.crew ? esc(p.role) : 'No.' + String(p.no).padStart(2, '0')}</span><span class="nm">${esc(p.zh)}</span></button>`;
    // 上排 1–6、下排 7–12；手機上變成兩欄，順序照號碼
    const top = D.sinners.slice(0, 6), bot = D.sinners.slice(6);
    const wide = () => matchMedia('(min-width: 641px)').matches;
    const lay = () => {
      if (wide()) seats.innerHTML = top.map(seat).join('') + '<div class="aisle">走 道</div>' + bot.map(seat).join('');
      else {
        let h = '';
        for (let i = 0; i < 6; i++) h += seat(D.sinners[i * 2]) + (i === 0 ? '<div class="aisle">走 道</div>' : '') + seat(D.sinners[i * 2 + 1]);
        seats.innerHTML = h;
      }
      cab.innerHTML = D.crew.filter(p => p.seat).map(seat).join('');
      mark(current);
    };
    let current = D.sinners[0].id;
    const order = [...D.sinners.map(p => p.id), ...D.crew.filter(p => p.seat).map(p => p.id)];
    const mark = id => document.querySelectorAll('.seat').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    const show = (id, focus) => {
      current = id;
      const p = byId[id];
      mark(id);
      const src = p.src ? `<dt>出處</dt><dd>${esc(p.src.author)}${p.src.work ? `《${esc(p.src.work)}》` : ''}${p.src.year ? `（${esc(p.src.year)}）` : ''}</dd>` : '';
      const sin = p.sin ? `<dt>常見印象</dt><dd>${esc(p.sin)}</dd>` : '';
      const role = p.crew ? `<dt>身分</dt><dd>${esc(p.roleLong || p.role)}</dd>` : `<dt>座號</dt><dd>${p.no} 號</dd>`;
      panel.innerHTML = `${E(p.emblem, 'class="d-emb"')}
        <div class="d-no">${p.crew ? esc(p.role).toUpperCase() : 'SINNER No.' + String(p.no).padStart(2, '0')}</div>
        <h3>${esc(p.zh)}</h3><div class="d-en">${esc(p.en)}${p.cn && p.cn !== p.zh ? `｜陸服：${esc(p.cn)}` : ''}</div>
        <dl>${role}${src}${sin}</dl>
        ${p.note ? `<p>${esc(p.note)}</p>` : ''}
        <div class="d-nav"><button type="button" data-go="-1">← 上一位</button><button type="button" data-go="1">下一位 →</button></div>`;
      panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap');
      if (focus) panel.focus({ preventScroll: true });
    };
    document.addEventListener('click', e => {
      const b = e.target.closest('.seat');
      if (b) { show(b.dataset.id); if (!wide()) panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }); return; }
      const g = e.target.closest('[data-go]');
      if (g) { const i = order.indexOf(current); show(order[(i + Number(g.dataset.go) + order.length) % order.length]); }
    });
    $('#randomSeat')?.addEventListener('click', () => {
      const pool = D.sinners.filter(p => p.id !== current);
      show(pool[(Math.random() * pool.length) | 0].id);
      $('#roster').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    });
    let w = wide();
    addEventListener('resize', () => { if (wide() !== w) { w = wide(); lay(); } });
    lay();
    show(current);
  })();

  /* ── 七宗罪 ── */
  (function sins() {
    const g = $('#sinGrid');
    if (!g) return;
    g.innerHTML = D.sins.map(s => `<article class="sin" style="--c:${s.c}">
      <div class="dot" aria-hidden="true">${esc(s.zh[1])}</div>
      <h3>${esc(s.zh)}</h3><div class="en">${esc(s.en)}</div>
      ${s.note ? `<p>${esc(s.note)}</p>` : ''}</article>`).join('');
    // 小試驗：排五格技能，看同色連在一起的長度
    const row = $('#chainBtns'), slots = $('#slots'), outEl = $('#chainOut');
    if (!row) return;
    const chain = [];
    row.innerHTML = D.sins.map(s => `<button type="button" style="--c:${s.c}" data-s="${s.id}" aria-label="放一張${esc(s.zh)}技能"></button>`).join('');
    const draw = () => {
      // 共鳴：同一種罪用了兩張以上。完全共鳴：同一種罪三張以上連在一起。
      const count = {};
      chain.forEach(s => { count[s] = (count[s] || 0) + 1; });
      let top = null;
      for (const k in count) if (!top || count[k] > count[top]) top = k;
      let best = 0, run = 0, end = -1;
      chain.forEach((s, i) => { run = i && chain[i - 1] === s ? run + 1 : 1; if (run > best) { best = run; end = i; } });
      const hit = new Set();
      if (best >= 3) for (let i = end - best + 1; i <= end; i++) hit.add(i);
      slots.innerHTML = Array.from({ length: 5 }, (_, i) => {
        const s = chain[i] ? sinById[chain[i]] : null;
        const cls = hit.has(i) ? ' hit' : (s && count[chain[i]] >= 2 ? ' res' : '');
        return `<div class="slot${cls}" style="${s ? `--c:${s.c}` : ''}" title="${s ? esc(s.zh) : '空格'}"></div>`;
      }).join('');
      if (!chain.length) outEl.textContent = '點上面的顏色，把技能一張一張排進來。';
      else if (best >= 3) { const s = sinById[chain[end]]; outEl.textContent = `${s.zh}有 ${best} 張連在一起：完全共鳴，這一串技能一起變強。`; }
      else if (top && count[top] >= 2) { const s = sinById[top]; outEl.textContent = `${s.zh}一共 ${count[top]} 張：產生共鳴。再讓三張連在一起，就是完全共鳴。`; }
      else outEl.textContent = '每一種罪都只有一張，所以沒有共鳴。';
    };
    row.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (chain.length >= 5) chain.shift(); chain.push(b.dataset.s); draw(); });
    $('#chainClear').addEventListener('click', () => { chain.length = 0; draw(); });
    draw();
  })();

  /* ── 路線圖 ── */
  (function route() {
    const ol = $('#lineMap'), chips = $('#routeChips');
    if (!ol) return;
    const lastMain = D.cantos.filter(c => !c.side).slice(-1)[0];
    const who = c => (c.who || []).map(id => byId[id]).filter(Boolean).map(p => `${E(p.emblem)}<span>${esc(p.zh)}</span>`).join('');
    const render = mode => {
      const list = D.cantos.filter(c => mode === 'all' || (mode === 'main' ? !c.side : c.side));
      ol.innerHTML = list.map(c => {
        const col = c.who && c.who[0] && byId[c.who[0]] && byId[c.who[0]].c;
        return `<li class="${c.side ? 'side' : ''}${c === lastMain ? ' latest' : ''}" style="${col ? `--c:${col}` : ''}">
          <div class="when">${esc(c.when)}</div><div class="pin" aria-hidden="true"></div>
          <div class="card"><div class="lab">${esc(c.lab)}</div><h3>${esc(c.title)}</h3>${c.en ? `<div class="en">${esc(c.en)}</div>` : ''}
          ${c.who && c.who.length ? `<div class="who">主角　${who(c)}</div>` : ''}</div></li>`;
      }).join('');
    };
    chips.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      chips.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      render(b.dataset.mode);
    });
    render('main');
  })();

  /* ── 名字的來歷 ── */
  (function names() {
    const g = $('#nameGrid');
    if (!g) return;
    g.innerHTML = D.names.map(n => `<article class="name-card"><div class="from">${esc(n.from)}</div><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></article>`).join('');
  })();

  /* ── 辭典 ── */
  (function glossary() {
    const g = $('#gloss'), q = $('#q'), count = $('#qCount');
    if (!g) return;
    const hl = (s, k) => { const t = esc(s); if (!k) return t; const kk = esc(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return t.replace(new RegExp(kk, 'gi'), m => `<mark>${m}</mark>`); };
    const render = () => {
      const k = q.value.trim();
      const list = D.glossary.filter(t => !k || [t.t, t.en, t.d, t.kind].join(' ').toLowerCase().includes(k.toLowerCase()));
      count.textContent = `${list.length} / ${D.glossary.length}`;
      g.innerHTML = list.length ? list.map(t => `<article class="term"><h3>${hl(t.t, k)}<span>${hl(t.en, k)}</span></h3><p>${hl(t.d, k)}</p>${t.kind ? `<span class="kind">${esc(t.kind)}</span>` : ''}</article>`).join('')
        : `<p class="empty">沒有找到「${esc(k)}」。換個說法試試看，例如中文、英文或縮寫。</p>`;
    };
    q.addEventListener('input', render);
    render();
  })();

  /* ── 上車須知 ── */
  (function steps() {
    const ol = $('#steps');
    if (ol) ol.innerHTML = D.steps.map(s => `<li><h3>${esc(s.h)}</h3><p>${esc(s.p)}</p></li>`).join('');
  })();

  /* ── 頂欄：目前看到哪一段 ── */
  (function nav() {
    const links = [...document.querySelectorAll('.nav a')];
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.setAttribute('aria-current', String(a === map.get(e.target.id))));
    }), { rootMargin: '-40% 0px -55% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    const tt = $('.to-top');
    addEventListener('scroll', () => tt.classList.toggle('on', scrollY > 900), { passive: true });
  })();
})();
