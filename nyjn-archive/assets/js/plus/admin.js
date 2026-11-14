'use strict';
/* ---------- 館主：處理回報、選件、停權、備份 ----------
   需要後端設定 ADMIN_KEY。鑰匙只存在這台裝置的手提箱，不會跟著雲端同步出去。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, toast, Board, Api } = A;
  const on = () => Board.mode === 'api' && Api.v >= 2 && Board.has('admin');
  let open = false, queue = null, err = '', busy = false;
  const chName = k => { const R = RELAYS.find(r => r.k === k); return R ? '接龍〈' + R.t + '〉' : k === 'gallery' ? '展牆' : k === 'theory' ? '推測' : k; };

  async function load() { busy = true; paint(); try { queue = await Api.admin('queue'); err = ''; } catch (e) { queue = null; err = e.status === 403 ? '鑰匙不對。' : e.status === 404 ? '後端沒有設定館主鑰匙（ADMIN_KEY）。' : (e.message || '讀不到'); if (e.status === 403 || e.status === 404) { Case.d.admin = ''; Case.save(); } } busy = false; paint(); }
  async function act(body, done) { try { await Api.adminAct(body); toast(done || '已處理'); if (body.k) await Board.load(body.k, 'a' + Date.now()); await load(); } catch (e) { toast(e.message || '沒有成功'); } }

  function paint() {
    const sec = $('admin-sec'), box = $('admin-box'); if (!sec) return; sec.hidden = !(on() && (open || Case.d.admin)); if (sec.hidden) return;
    box.textContent = '';
    if (!Case.d.admin) {
      const inp = K.h('input.inp', { type: 'password', id: 'admin-in', autocomplete: 'off', placeholder: '館主鑰匙', 'aria-label': '館主鑰匙' });
      const go = K.h('button.btn', { type: 'button', text: '進入' }); go.onclick = async () => { const v = inp.value.trim().slice(0, 80); if (!v) return; Case.d.admin = v; try { await Api.admin('ping'); Case.save(); toast('館主模式已開啟'); load(); } catch (e) { Case.d.admin = ''; err = e.status === 404 ? '後端沒有設定館主鑰匙（ADMIN_KEY）。' : '鑰匙不對。'; paint(); } };
      box.append(K.h('p.hint', { text: '輸入後端環境變數 ADMIN_KEY 的值。鑰匙只留在這台裝置。' }), inp, K.h('div.save-row', go));
      if (err) box.append(K.h('p.note-ok', { role: 'status', text: err }));
      return;
    }
    const tools = K.h('div.save-row',
      K.h('button.btn.sm', { type: 'button', text: '重新整理', onclick: load }),
      K.h('button.btn.sm', { type: 'button', text: '下載備份', onclick: async () => { try { const j = await Api.admin('export'); K.download('nyjn-backup-' + K.day() + '.json', new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' })); } catch (e) { toast(e.message || '備份失敗'); } } }),
      K.h('button.btn.sm', { type: 'button', text: '重算計數', onclick: () => act({ act: 'recount' }, '已重算') }),
      K.h('button.btn.sm', { type: 'button', text: '登出', onclick: () => { Case.d.admin = ''; Case.save(); queue = null; open = false; paint(); Board.changed(); } }));
    box.append(K.h('p.hint', { text: '館主模式：接龍、展牆、推測的每一則都會多出刪除鍵；展牆的作品可以設為選件。' }), tools);
    if (busy) { box.append(K.h('p.hint', { text: '讀取中…' })); return; }
    if (err) { box.append(K.h('p.note-ok', { role: 'status', text: err })); return; }
    if (!queue) return;
    const items = queue.items || [];
    box.append(K.h('span.lab', { text: '待處理　' + items.length + ' 則（被回報或已隱藏）' }));
    const ul = K.h('ul.admin-list');
    items.forEach(it => {
      const text = it.x || (it.w ? (it.w.kind === 'card' ? '人物檔案：' + (it.w.name || '') + '　' + (it.w.say || '') : '《' + (it.w.title || '無題') + '》' + String(it.w.text || '').slice(0, 300)) : '');
      const B = (t, body, done) => K.h('button.tiny', { type: 'button', text: t, onclick: () => act(Object.assign({ k: it.k, id: it.id }, body), done) });
      ul.append(K.h('li',
        K.h('div.who', K.h('span', { text: chName(it.k) }), K.h('span', { text: (it.name || '無名的司辰') + '　' + A.fmtDate(it.t) }), K.h('span.tagx' + (it.fl ? '.hot' : ''), { text: '回報 ' + (it.fl | 0) }), it.hid ? K.h('span.tagx.hot', { text: '已隱藏' }) : null, K.h('span.tagx', { text: '作者 ' + String(it.oh12 || '匿名').slice(0, 6) })),
        K.h('p', { text }),
        K.h('div.ops', B('放行', { act: 'show' }, '已放行'), it.fl ? B('清掉回報', { act: 'clear' }) : null, it.hid ? null : B('隱藏', { act: 'hide' }, '已隱藏'), B('刪除', { act: 'del' }, '已刪除'), B('停權這位作者', { act: 'ban' }, '已停權'))));
    });
    if (!items.length) ul.append(K.h('li.empty', { text: '沒有待處理的內容。' }));
    box.append(ul);
    const bans = queue.bans || {}, all = (bans.o || []).concat(bans.ip || []);
    if (all.length) {
      box.append(K.h('span.lab', { text: '停權名單　' + all.length }));
      const bl = K.h('ul.admin-list'); all.forEach(t => bl.append(K.h('li', K.h('div.who', K.h('span', { text: String(t).slice(0, 12) })), K.h('div.ops', K.h('button.tiny', { type: 'button', text: '解除', onclick: () => act({ act: 'unban', target: t }, '已解除') }))))); box.append(bl);
    }
  }
  A.on('case', () => {
    const sec = document.querySelector('#r-case .case-sec');   // 存檔那一格
    if (on() && !$('admin-open')) { const b = K.h('button.tiny', { type: 'button', id: 'admin-open', text: '館主入口' }); b.onclick = () => { open = true; paint(); $('admin-sec').scrollIntoView({ block: 'nearest' }); }; const host = $('wipe-btn') && $('wipe-btn').parentNode; if (host) host.after(K.h('div.save-row', b)); }
    paint(); if (on() && Case.d.admin && !queue && !busy) load();
  });
  A.on('board', () => { if (A.cur === 'case') A.casePaint(); });
  /* 展牆：館主可以設為選件 */
  A.on('item', ({ it, ops, kind }) => {
    if (kind !== 'wall' || !on() || !Case.d.admin || it.src !== 'api') return;
    ops.append(K.h('button.tiny', { type: 'button', text: it.pin ? '取消選件' : '設為選件', onclick: () => act({ act: it.pin ? 'unpin' : 'pin', k: it.k, id: it.id }, it.pin ? '已取消' : '已設為選件') }));
  });
})();
