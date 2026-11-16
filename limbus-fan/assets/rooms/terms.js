// 車上用語：照類別篩、可以搜尋；#/terms/<id> 會捲到那個詞並標出來。
(function () {
  const LB = window.LB, { esc, $ } = LB;
  const hl = (s, k) => { const t = esc(s); if (!k) return t; const kk = esc(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return t.replace(new RegExp(kk, 'gi'), m => `<mark>${m}</mark>`); };
  let kind = '全部', query = '';

  LB.room('terms', {
    render(id) {
      LB.visit('terms');
      const kinds = ['全部', ...[...new Set(LB.glossary.map(t => t.kind))]];
      if (id) { kind = '全部'; query = ''; LB.stamp('term-' + id, true); }
      return {
        title: '車上用語',
        html: `<section class="wrap page">
          ${LB.pageHead(LB.roomNo('terms'), LB.roomColor('terms'), '車上用語', `遊戲裡和玩家之間常聽到的 ${LB.glossary.length} 個詞。中文名稱照台灣玩家常用的說法，括號裡是英文，方便對照攻略。手冊其他頁面裡畫底線的詞，點一下也會跳出這裡的解釋。`)}
          <label class="search inline"><span class="sr">搜尋用語</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
            <input id="q" type="search" placeholder="例如：拼點、金枝、Rupture" autocomplete="off" value="${esc(query)}"><span class="count" id="qCount"></span>
          </label>
          <div class="filter-row" id="kinds" role="group" aria-label="類別">${kinds.map(k => `<button type="button" class="chip" data-k="${esc(k)}" aria-pressed="${k === kind}">${esc(k)}</button>`).join('')}</div>
          <div class="gloss" id="gloss"></div>
        </section>`,
        after: v => {
          const g = $('#gloss', v), q = $('#q', v), count = $('#qCount', v);
          const draw = () => {
            const k = query.trim().toLowerCase();
            const list = LB.glossary.filter(t => (kind === '全部' || t.kind === kind) && (!k || [t.t, t.en, t.d, t.kind, (t.alias || []).join(' ')].join(' ').toLowerCase().includes(k)));
            count.textContent = `${list.length} / ${LB.glossary.length}`;
            g.innerHTML = list.length ? list.map(t => `<article class="term" id="t-${t.id}"><h3>${hl(t.t, query.trim())}<span>${hl(t.en, query.trim())}</span></h3><p>${hl(t.d, query.trim())}</p>
              <div class="term-foot">${t.kind ? `<span class="kind">${esc(t.kind)}</span>` : ''}${(t.see || []).map(s => { const x = LB.glossary.find(y => y.id === s); return x ? `<a href="#/terms/${x.id}">→ ${esc(x.t)}</a>` : ''; }).join('')}</div></article>`).join('')
              : `<p class="empty">沒有找到「${esc(query.trim())}」。換個說法試試看，例如中文、英文或縮寫。</p>`;
          };
          q.addEventListener('input', () => { query = q.value; draw(); });
          $('#kinds', v).addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; kind = b.dataset.k; v.querySelectorAll('#kinds .chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
          draw();
          if (id) { const el = document.getElementById('t-' + id); if (el) { el.classList.add('focus'); setTimeout(() => el.scrollIntoView({ block: 'center', behavior: LB.reduce() ? 'auto' : 'smooth' }), 60); } }
        },
      };
    },
  });
})();
