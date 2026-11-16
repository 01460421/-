// 年表：Project Moon 的三部遊戲、《邊獄巴士》的每一季與每一章。
(function () {
  const LB = window.LB, { esc, $ } = LB;
  const KINDS = { studio: '工作室', game: '遊戲', season: '季', canto: '章節', collab: '聯動', other: '其他' };
  let only = 'all';
  LB.room('timeline', {
    render() {
      LB.visit('timeline');
      const T = (LB.timeline || []).slice().sort((a, b) => a.when.localeCompare(b.when));
      const kinds = ['all', ...Object.keys(KINDS).filter(k => T.some(t => t.kind === k))];
      let year = '';
      const items = T.filter(t => only === 'all' || t.kind === only).map(t => {
        const y = t.when.slice(0, 4), head = y !== year ? `<li class="year"><span>${y}</span></li>` : '';
        year = y;
        return head + `<li class="ev ${t.kind}"><time>${esc(t.when.replace(/-/g, '.'))}</time><div><span class="kind">${esc(KINDS[t.kind] || '')}</span><b>${t.href ? `<a href="${t.href}">${esc(t.t)}</a>` : esc(t.t)}</b>${t.d ? `<p>${esc(t.d)}</p>` : ''}</div></li>`;
      }).join('');
      return {
        title: '年表',
        html: `<section class="wrap page">
          ${LB.pageHead(LB.roomNo('timeline'), LB.roomColor('timeline'), '年表', 'Project Moon 從第一部遊戲到現在的時間軸。《腦葉公司》《廢墟圖書館》《邊獄巴士》發生在同一座都市，照順序玩或看，背景會更好懂。')}
          <div class="filter-row" id="tlKinds" role="group" aria-label="篩選">${kinds.map(k => `<button type="button" class="chip" data-k="${k}" aria-pressed="${k === only}">${k === 'all' ? '全部' : KINDS[k]}</button>`).join('')}</div>
          <ol class="tl">${items}</ol>
          ${LB.timelineNote ? `<p class="note">${esc(LB.timelineNote)}</p>` : ''}
        </section>`,
        after: v => { $('#tlKinds', v).addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { only = b.dataset.k; LB.rerender(); } }); },
      };
    },
  });
})();
