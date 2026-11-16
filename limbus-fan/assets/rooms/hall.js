// 總站：開頭、發車看板、今天的乘客、你的車票、全線路線圖。
(function () {
  const LB = window.LB, { esc } = LB, E = window.emblem;

  const routeLine = () => {
    const W = 1000, y = 32, n = LB.sins.length, step = W / n;
    let out = '';
    LB.sins.forEach((s, i) => { out += `<path class="seg" pathLength="1" d="M${i * step + 8} ${y}H${(i + 1) * step - 8}" stroke="${s.c}" style="animation-delay:${i * 0.12}s"/>`; });
    LB.sins.forEach((s, i) => { out += `<circle class="stop" cx="${Math.max(10, i * step)}" cy="${y}" r="9" stroke="${s.c}" style="animation-delay:${0.2 + i * 0.12}s"/>`; });
    out += `<circle class="stop" cx="${W - 10}" cy="${y}" r="9" stroke="${LB.sins[n - 1].c}" style="animation-delay:${0.2 + n * 0.12}s"/>`;
    return `<svg class="route-line" viewBox="0 0 1000 64" preserveAspectRatio="none" aria-hidden="true">${out}</svg>`;
  };

  const board = () => {
    const rows = LB.cantos.filter(c => !c.side).slice(-5).reverse();
    return `<div class="board" role="region" aria-label="最近的章節">
      <div class="board-head"><span>DEPARTURES · 主線</span><b>更新 ${esc(LB.updated)}</b></div>
      <table><thead><tr><th scope="col">班次</th><th scope="col">目的地</th><th scope="col">發車</th><th scope="col" class="st"><span class="sr">狀態</span></th></tr></thead>
      <tbody>${rows.map((c, i) => `<tr>
        <td><span class="flap" data-t="${esc(c.code)}">${esc(c.code)}</span></td>
        <td class="dest"><a href="#/canto/${c.no}">${esc(c.title)}</a></td>
        <td><span class="flap" data-t="${esc(c.when)}">${esc(c.when)}</span></td>
        <td class="st">${i === 0 ? '<span class="tag now">最新</span>' : '<span class="tag">已到站</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  };

  const flaps = v => {
    if (LB.reduce()) return;
    const chars = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ.-';
    v.querySelectorAll('.flap').forEach((el, k) => {
      const t = el.dataset.t; let f = 0;
      const tick = () => {
        if (!el.isConnected) return;
        f++;
        el.textContent = [...t].map((ch, j) => (f > 6 + j * 2 + k ? ch : chars[(Math.random() * chars.length) | 0])).join('');
        if (f < 8 + t.length * 2 + k) setTimeout(tick, 45); else el.textContent = t;
      };
      setTimeout(tick, 250 + k * 60);
    });
  };

  LB.room('hall', {
    render() {
      LB.visit('hall');
      const d = LB.daily(), canto = LB.cantoOf(d.id), prof = (LB.profiles || {})[d.id] || {};
      const s = LB.stamps(), got = LB.achievements.filter(a => s[a.id]).length;
      const pages = Object.keys(s).filter(k => /^(sinner|canto)-/.test(k)).length;
      const pagesAll = LB.sinners.length + 1 + LB.cantos.filter(c => !c.side).length;
      const last = LB.store.get('last');
      return {
        title: '',
        html: `<section class="hero"><div class="wrap">
          <div class="hero-grid">
            <div>
              <p class="kicker">Limbus Company · 非官方同好站</p>
              <h1>邊獄巴士<span>乘客手冊</span></h1>
              <p class="lede">一輛叫梅菲斯托費勒斯的巴士，載著頭是時鐘的管理人但丁和十二位罪人，穿過「都市」去收集金枝。這本手冊替乘客整理了每個人的個人頁、每一章的路線、都市的地圖和車上常聽到的詞；劇情會照你的進度先遮起來。</p>
              <div class="cta">
                <a class="btn" href="#/roster">看座位表</a>
                <a class="btn ghost" href="#/route">看路線圖</a>
                ${last ? `<a class="btn ghost" href="${esc(last)}">回到上次的地方</a>` : ''}
              </div>
            </div>
            ${board()}
          </div>
          ${routeLine()}
        </div></section>

        <section class="wrap hall-row">
          <article class="card today" style="--c:${d.c}">
            <div class="today-emb">${E(d.emblem)}</div>
            <div>
              <div class="eyebrow">今天的乘客 · ${esc(LB.today())}</div>
              <h2><a href="#/sinner/${d.id}">${esc(d.zh)}</a> <span class="en">${esc(d.en)}</span></h2>
              <p>${d.no} 號，名字出自${esc(d.src.author)}《${esc(d.src.work)}》${canto ? `，是${canto.lab}〈${esc(canto.title)}〉的主角` : ''}。${esc(prof.persona ? prof.persona.split('。')[0] + '。' : '')}</p>
              <a class="more" href="#/sinner/${d.id}">看${esc(d.zh)}的個人頁 →</a>
            </div>
          </article>
          <article class="card mine">
            <div class="eyebrow">你的車票</div>
            <dl class="stats">
              <div><dt>劇透進度</dt><dd>${esc(LB.progressLabel(LB.progress()))}</dd></div>
              <div><dt>看過的個人頁與章節</dt><dd>${pages} / ${pagesAll}</dd></div>
              <div><dt>成就章</dt><dd>${got} / ${LB.achievements.length}</dd></div>
              <div><dt>連續來訪</dt><dd>${LB.store.get('streak', 1)} 天</dd></div>
            </dl>
            <div class="row-btns"><a class="btn small" href="#/tickets">打開車票簿</a><button type="button" class="btn ghost small" data-open-settings>改劇透進度</button></div>
          </article>
        </section>

        <section class="wrap block">
          ${LB.pageHead('全線', 'var(--amber)', '全線路線圖', '每一站是一個房間。照順序走，或直接跳到想去的地方；右上角的放大鏡可以搜尋整本手冊。')}
          <ol class="stations">${LB.rooms.filter(r => r.id !== 'hall').map((r, i) => `<li style="--c:${r.c}">
            <a href="#/${r.id}"><span class="stop-no">${String(i + 1).padStart(2, '0')}</span><b>${esc(r.name)}</b><span>${esc(r.desc)}</span>${s['room-' + r.id] ? '<i class="been" title="去過了">去過</i>' : ''}</a></li>`).join('')}</ol>
        </section>

        <section class="wrap block">
          ${LB.pageHead('上車', 'var(--pride)', '第一次上車', '第一次玩的人，照這幾步走就不會迷路。')}
          <ol class="steps">${LB.steps.map(x => `<li><h3>${esc(x.h)}</h3>${LB.prose(x.p)}</li>`).join('')}</ol>
        </section>`,
        after: v => {
          flaps(v);
          v.querySelector('[data-open-settings]')?.addEventListener('click', () => LB.$('#settingsBtn').click());
          if (LB.store.get('streak', 1) >= 3) LB.stamp('streak-3');
        },
      };
    },
  });
})();
