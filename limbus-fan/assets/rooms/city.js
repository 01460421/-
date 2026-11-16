// 都市：結構、翼（區的看板）、五指、收尾人與協會。
(function () {
  const LB = window.LB, { esc, $ } = LB;

  LB.room('city', {
    render() {
      LB.visit('city');
      const C = LB.city || {};
      const wings = C.wings || [], byD = {};
      wings.forEach(w => { if (w.district) byD[w.district] = w; });
      const N = C.districts || 25;
      const cells = Array.from({ length: N }, (_, i) => {
        const d = i + 1, w = byD[d];
        return `<button type="button" class="dist${w ? ' has' : ''}${w && w.fallen ? ' fallen' : ''}" data-d="${d}" ${w ? '' : 'disabled'} aria-label="第 ${d} 區${w ? '，' + esc(w.name) : '，資料不明'}">
          <span class="dn">${d}</span>${w ? `<b>${esc(w.letter || '')}</b>` : ''}</button>`;
      }).join('');
      const fingers = C.fingers || [];
      const heights = { thumb: 58, index: 82, middle: 100, ring: 88, little: 66 };
      return {
        title: '都市',
        html: `<section class="wrap page">
          ${LB.pageHead(LB.roomNo('city'), LB.roomColor('city'), '都市', 'Project Moon 的三部遊戲都發生在同一座「都市」。這一站整理它的結構：誰管理、誰作亂、靠什麼過活。名詞用 LLC 的譯名，點底線的詞可以看解釋。')}

          ${(C.structure || []).length ? `<h2 class="h2">都市的結構</h2><div class="grid3">${C.structure.map(x => `<article class="card"><h3>${esc(x.t)}</h3>${x.en ? `<div class="en">${esc(x.en)}</div>` : ''}${LB.prose(x.d)}</article>`).join('')}</div>` : ''}

          <h2 class="h2">翼</h2>
          <p class="muted">${esc(C.wingsIntro || '都市最大的企業叫作「翼」，各自管轄一區的巢，手上握有違反物理法則的技術「奇點」。')}下面的看板照區的號碼排，只是示意，不是實際的地理位置；有寫字母的格子點下去看是哪一家。</p>
          <div class="city-board">
            <div class="dists" id="dists">${cells}</div>
            <article class="card wing-card" id="wingCard" aria-live="polite"><p class="muted">點左邊有字母的格子。</p></article>
          </div>
          ${wings.length ? `<details class="more-table"><summary>看全部的翼（表格）</summary><div class="table-wrap"><table class="list">
            <thead><tr><th scope="col">翼</th><th scope="col">區</th><th scope="col">奇點</th><th scope="col">現況</th></tr></thead>
            <tbody>${wings.map(w => `<tr><td><b>${esc(w.name)}</b> <span class="en">${esc(w.en || '')}</span></td><td>${w.district ? w.district + ' 區' : '不明'}</td><td>${esc(w.singularity || '')}</td><td>${esc(w.status || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}

          ${fingers.length ? `<h2 class="h2">五指</h2><p class="muted">${esc(C.fingersIntro || '控制後巷的五個犯罪組織，合稱五指。')}</p>
          <div class="hand">${fingers.map(f => `<article class="finger" style="--h:${heights[f.key] || 80}%">
            <div class="bar" aria-hidden="true"></div><h3>${esc(f.name)}</h3><div class="en">${esc(f.en)}</div><p>${esc(f.d)}</p></article>`).join('')}</div>` : ''}

          ${(C.grades || []).length ? `<h2 class="h2">收尾人的等級</h2><p class="muted">${esc(C.gradesIntro || '')}</p>
          <ol class="ladder">${C.grades.map((g, i) => `<li style="--i:${i}"><b>${esc(g.g)}</b><span>${esc(g.d)}</span></li>`).join('')}</ol>` : ''}

          ${(C.associations || []).length ? `<h2 class="h2">協會</h2><p class="muted">${esc(C.assocIntro || '')}</p>
          <div class="table-wrap"><table class="list">
            <thead><tr><th scope="col">協會</th><th scope="col">號</th><th scope="col">專長</th></tr></thead>
            <tbody>${C.associations.map(a => `<tr><td><b>${esc(a.name)}</b> <span class="en">${esc(a.en || '')}</span></td><td>${esc(a.no || '')}</td><td>${esc(a.spec || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}

          ${(C.more || []).length ? `<h2 class="h2">其他常聽到的</h2><div class="grid3">${C.more.map(x => `<article class="card"><h3>${esc(x.t)}</h3>${x.en ? `<div class="en">${esc(x.en)}</div>` : ''}${LB.prose(x.d)}</article>`).join('')}</div>` : ''}
          ${C.sourceNote ? `<p class="note">${esc(C.sourceNote)}</p>` : ''}
        </section>`,
        after: v => {
          const card = $('#wingCard', v);
          const show = d => {
            const w = byD[d];
            v.querySelectorAll('.dist').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.d) === d)));
            card.innerHTML = `<div class="eyebrow">第 ${d} 區</div><h3>${esc(w.name)} <span class="en">${esc(w.en || '')}</span></h3>
              <dl class="mini">${w.singularity ? `<dt>奇點</dt><dd>${esc(w.singularity)}</dd>` : ''}${w.status ? `<dt>現況</dt><dd>${esc(w.status)}</dd>` : ''}${w.limbus ? `<dt>在本作</dt><dd>${esc(w.limbus)}</dd>` : ''}</dl>
              ${w.d ? `<p>${esc(w.d)}</p>` : ''}`;
          };
          $('#dists', v).addEventListener('click', e => { const b = e.target.closest('.dist.has'); if (b) show(Number(b.dataset.d)); });
          const first = wings.find(w => w.district);
          if (first) show(first.district);
        },
      };
    },
  });
})();
