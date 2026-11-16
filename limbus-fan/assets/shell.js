// 頁首、選單、搜尋、設定與第一次來的歡迎卡。
(function () {
  const LB = window.LB, { $, $$, esc, store: st } = LB;

  /* 頁首的快速連結與全線選單 */
  $('#quickNav').innerHTML = LB.rooms.filter(r => r.quick).map(r => `<a href="#/${r.id}" data-room="${r.id}" style="--c:${r.c}">${esc(r.name)}</a>`).join('');
  $('#menuLine').innerHTML = LB.rooms.map((r, i) => `<li style="--c:${r.c}"><a href="#/${r.id === 'hall' ? '' : r.id}" data-room="${r.id}">
      <span class="stop-no">${String(i).padStart(2, '0')}</span><span class="stop-name">${esc(r.name)}</span><span class="stop-desc">${esc(r.desc)}</span></a></li>`).join('');
  $('#menuBtn').addEventListener('click', () => ($('#menu').hidden ? LB.openMenu() : ($('#menu').hidden = true, $('#menuBtn').setAttribute('aria-expanded', 'false'))));
  $('#menuClose').addEventListener('click', () => { $('#menu').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); $('#menuBtn').focus(); });

  /* 搜尋 */
  const dlg = $('#searchDlg'), q = $('#searchQ'), list = $('#searchList'), hint = $('#searchHint');
  let sel = 0, res = [];
  const draw = () => {
    res = LB.search(q.value);
    hint.hidden = !!q.value.trim();
    list.innerHTML = res.length ? res.map((r, i) => `<li role="option" aria-selected="${i === sel}" id="sr${i}"><a href="${r.h}"><span class="k">${esc(r.k)}</span><b>${esc(r.t)}</b><span class="s">${esc(r.s).slice(0, 80)}</span></a></li>`).join('')
      : q.value.trim() ? `<li class="empty">沒有找到「${esc(q.value.trim())}」。可以換成英文，或只打名字的一部分。</li>` : '';
    q.setAttribute('aria-activedescendant', res.length ? 'sr' + sel : '');
  };
  const openSearch = () => { q.value = ''; sel = 0; draw(); LB.dialog('searchDlg'); q.focus(); };
  $('#searchBtn').addEventListener('click', openSearch);
  q.addEventListener('input', () => { sel = 0; draw(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(res.length - 1, sel + 1); draw(); e.preventDefault(); $('#sr' + sel)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); $('#sr' + sel)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (res[sel]) { LB.dialog('searchDlg', false); location.hash = res[sel].h; } }
  });
  list.addEventListener('click', e => { if (e.target.closest('a')) LB.dialog('searchDlg', false); });
  dlg.addEventListener('click', e => { if (e.target === dlg) LB.dialog('searchDlg', false); });
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape' && !$('#menu').hidden) { $('#menu').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); }
  });

  /* 設定 */
  const opts = [-1, 0, ...LB.cantos.filter(c => !c.side && c.no > 0).map(c => c.no), 99];
  const progressOptions = () => opts.map(p => `<option value="${p}"${p === LB.progress() ? ' selected' : ''}>${LB.progressLabel(p)}</option>`).join('');
  $('#settingsBtn').addEventListener('click', () => {
    $('#progressSel').innerHTML = progressOptions();
    $('#calmChk').checked = !!st.get('calm', false);
    $('#bigChk').checked = !!st.get('big', false);
    LB.dialog('settingsDlg');
  });
  $('#progressSel').addEventListener('change', e => { st.set('progress', Number(e.target.value)); LB.stamp('progress-set'); LB.rerender(); });
  $('#calmChk').addEventListener('change', e => { st.set('calm', e.target.checked); LB.applySettings(); });
  $('#bigChk').addEventListener('change', e => { st.set('big', e.target.checked); LB.applySettings(); });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('要清掉這台裝置上的所有紀錄嗎？印章、成績、書單和劇透進度都會不見。')) return;
    LB.store.reset(); LB.applySettings(); LB.dialog('settingsDlg', false); LB.toast('紀錄已經清掉了。'); LB.rerender();
  });

  /* 第一次來：問進度 */
  const wp = $('#welcomeProgress');
  wp.innerHTML = [-1, 0, 3, 5, 7, 9, 99].map(p => `<button class="chip" value="${p}">${LB.progressLabel(p)}</button>`).join('') +
    `<label class="more">或是：<select id="welcomeSel" aria-label="看到第幾章">${opts.map(p => `<option value="${p}">${LB.progressLabel(p)}</option>`).join('')}</select></label>`;
  $('#welcomeDlg').addEventListener('close', () => {
    st.set('welcomed', true);
    const v = $('#welcomeDlg').returnValue;
    if (v && v !== 'skip') { st.set('progress', Number(v)); LB.stamp('progress-set'); LB.toast(`已經記下：${LB.progressLabel(Number(v))}。`); LB.rerender(); }
  });
  $('#welcomeSel').addEventListener('change', e => { $('#welcomeDlg').close(e.target.value); });
  if (!st.get('welcomed')) setTimeout(() => LB.dialog('welcomeDlg'), 400);

  /* 回到頂端 */
  const tt = $('#toTop');
  addEventListener('scroll', () => tt.classList.toggle('on', scrollY > 900), { passive: true });
  tt.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: LB.reduce() ? 'auto' : 'smooth' }); });

  /* 找不到的房間 */
  LB.room('missing', { render: () => ({ title: '這一站不存在', html: `<section class="wrap page"><div class="sign404"><div class="no">404</div><h1>這一站不存在</h1><p>巴士沒有開到這裡。可能是網址打錯了，或是這一頁已經搬走了。</p><a class="btn" href="#/">回到總站</a></div></section>` }) });

  /* 共用的小元件 */
  LB.pageHead = (no, c, title, lede, crumbs) => `
    ${crumbs ? `<nav class="crumbs" aria-label="位置">${crumbs}</nav>` : ''}
    <header class="sec-head" style="--c:${c}">
      <div class="sec-no" aria-hidden="true">${esc(no)}</div>
      <h1>${title}</h1>
      ${lede ? `<p>${lede}</p>` : ''}
    </header>`;
  LB.roomNo = id => String(LB.rooms.findIndex(r => r.id === id)).padStart(2, '0');
  LB.roomColor = id => (LB.rooms.find(r => r.id === id) || {}).c || 'var(--amber)';
  LB.visit = id => LB.stamp('room-' + id, true);
})();
