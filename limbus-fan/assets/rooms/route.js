// 路線圖（照季分段）與每一章的頁面。
(function () {
  const LB = window.LB, { esc } = LB, E = window.emblem;
  const story = no => (LB.stories || {})[no] || {};
  const seasonOf = no => (LB.seasons || []).find(s => s.cantos.includes(no));

  const stop = (c, s, latest) => {
    const p = c.who && c.who[0] && LB.people[c.who[0]];
    const col = p ? p.c : null;
    const st = story(c.no);
    const href = c.side ? null : `#/canto/${c.no}`;
    return `<li class="${c.side ? 'side' : ''}${latest ? ' latest' : ''}" style="${col ? `--c:${col}` : ''}">
      <div class="when">${esc(c.when)}</div><div class="pin" aria-hidden="true"></div>
      <div class="card">${href ? `<a class="cover-link" href="${href}" aria-label="${esc(c.lab)}〈${esc(c.title)}〉"></a>` : ''}
        <div class="lab">${esc(c.lab)}${s['canto-' + c.no] && !c.side ? ' <i class="been">看過</i>' : ''}</div>
        <h3>${esc(c.title)}</h3>${c.en ? `<div class="en">${esc(c.en)}</div>` : ''}
        ${p ? `<div class="who">主角　${E(p.emblem)}<span>${esc(p.zh)}</span></div>` : ''}
        ${st.teaser ? `<p class="teaser">${esc(st.teaser)}</p>` : c.note ? `<p class="teaser">${esc(c.note)}</p>` : ''}
      </div></li>`;
  };

  LB.room('route', {
    render(mode) {
      LB.visit('route');
      mode = mode || 'main';
      const s = LB.stamps(), lastMain = LB.cantos.filter(c => !c.side).slice(-1)[0];
      const list = LB.cantos.filter(c => mode === 'all' || (mode === 'main' ? !c.side : c.side));
      let html = '', cur = null;
      list.forEach(c => {
        const se = seasonOf(c.side ? Math.floor(parseFloat(c.when)) : c.no);
        if (se && se !== cur && mode !== 'side') { cur = se; html += `<li class="season"><span>第 ${se.no} 季</span><b>${esc(se.name)}</b>${se.zh ? `<em>${esc(se.zh)}</em>` : ''}<small>${esc(se.from || '')}</small></li>`; }
        html += stop(c, s, c === lastMain);
      });
      return {
        title: '路線圖',
        html: `<section class="wrap page">
          ${LB.pageHead(LB.roomNo('route'), LB.roomColor('route'), '路線圖', '主線的一章叫一個 Canto，間章叫 Intervallo。每一章以一位罪人為主角，這位罪人的過去，就藏在名字出處的那本書裡。點一站，看那一章的地點、人物與劇情；劇情照你的進度遮起來。')}
          <div class="filter-row" role="group" aria-label="篩選">
            ${[['main', '主線'], ['side', '間章'], ['all', '全部']].map(([m, t]) => `<a class="chip" href="#/route/${m}" aria-pressed="${m === mode}">${t}</a>`).join('')}
          </div>
          <ol class="line-map">${html}</ol>
        </section>`,
      };
    },
  });

  LB.room('canto', {
    group: 'route',
    render(no) {
      no = Number(no);
      const c = LB.cantoByNo[no];
      if (!c) return { title: '找不到這一章', html: `<section class="wrap page"><p>找不到這一章。<a href="#/route">回到路線圖</a></p></section>` };
      LB.stamp('canto-' + no, true);
      const st = story(no), se = seasonOf(no), p = c.who && c.who[0] && LB.people[c.who[0]];
      const mains = LB.cantos.filter(x => !x.side), i = mains.indexOf(c), prev = mains[i - 1], next = mains[i + 1];
      const people = (st.people || []).map(x => `<li><b>${esc(x.zh || x.en)}</b>${x.zh && x.en ? `<span class="en">${esc(x.en)}</span>` : ''}${x.d ? `<span class="d">${esc(x.d)}</span>` : ''}</li>`).join('');
      return {
        title: `${c.lab}〈${c.title}〉`,
        html: `<section class="wrap page canto" style="--pc:${p ? p.c : 'var(--amber)'}">
          <nav class="crumbs" aria-label="位置"><a href="#/">總站</a><a href="#/route">路線圖</a><span>${esc(c.lab)}</span></nav>
          <header class="canto-head">
            <div class="d-no">${esc(c.code)} · ${esc(c.when)}${se ? ` · 第 ${se.no} 季 ${esc(se.name)}` : ''}</div>
            <h1><small>${esc(c.lab)}</small>${esc(c.title)}</h1>
            <div class="d-en">${esc(c.en)}</div>
            ${st.teaser ? `<p class="lede">${esc(st.teaser)}</p>` : ''}
          </header>
          <div class="person-grid">
            <aside class="person-facts">
              <dl>
                ${p ? `<dt>主角</dt><dd><a href="#/sinner/${p.id}" class="who-link">${E(p.emblem)}${esc(p.zh)}</a></dd>` : ''}
                ${p && p.src ? `<dt>對應的作品</dt><dd>${esc(p.src.author)}《${esc(p.src.work)}》</dd>` : ''}
                ${st.place ? `<dt>地點</dt><dd>${esc(st.place)}</dd>` : ''}
                <dt>上線</dt><dd>${esc(c.when.replace('.', ' 年 '))} 月</dd>
                ${se ? `<dt>所屬的季</dt><dd>第 ${se.no} 季〈${esc(se.name)}〉</dd>` : ''}
              </dl>
            </aside>
            <div class="person-body">
              ${st.synopsis ? `<section><h2>劇情</h2>${LB.spoil(no, LB.prose(st.synopsis), 'syn-' + no)}</section>` : `<section><h2>劇情</h2><p class="muted">這一章的劇情摘要還沒有寫好。</p></section>`}
              ${st.allusion ? `<section><h2>和原著的關係</h2>${LB.spoil(no, LB.prose(st.allusion), 'al-' + no)}</section>` : ''}
              ${people ? `<section><h2>登場的人與勢力</h2>${LB.spoil(no, `<ul class="ids">${people}</ul>`, 'pp-' + no)}</section>` : ''}
            </div>
          </div>
          <nav class="pager" aria-label="上一章與下一章">
            ${prev ? `<a href="#/canto/${prev.no}">← ${esc(prev.lab)}</a>` : '<span></span>'}
            <a href="#/route">回到路線圖</a>
            ${next ? `<a href="#/canto/${next.no}">${esc(next.lab)} →</a>` : '<span></span>'}
          </nav>
        </section>`,
      };
    },
  });
})();
