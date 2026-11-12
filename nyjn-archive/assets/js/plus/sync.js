'use strict';
/* ---------- 雲端同步：用一組同步碼，把手提箱帶到另一台裝置 ----------
   手提箱在瀏覽器裡先加密（AES-GCM，金鑰由同步碼導出），後端只收到密文和一個查找用的代號，
   看不到手記的內容。同步碼就是鑰匙：弄丟了，雲端那一份就再也打不開。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, toast, Board, Api } = A;
  const sy = () => K.bag('sy', { code: '', rev: 0, t: 0 });
  const ok = () => Board.mode === 'api' && Board.has('case') && !!(window.crypto && crypto.subtle && window.TextEncoder);
  const ABC = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // 去掉容易看錯的 0 O 1 I
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const norm = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const pretty = c => c.replace(/(.{4})(?=.)/g, '$1-');
  function newCode() { const r = crypto.getRandomValues(new Uint8Array(16)); let s = ''; r.forEach(b => { s += ABC[b & 31]; }); return s; }
  const valid = c => /^[2-9A-HJ-NP-Z]{16}$/.test(c);
  async function keys(code) {
    const id = hex(await crypto.subtle.digest('SHA-256', enc.encode('nyjn.case.id|' + code)));
    const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('nyjn.case.v1'), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { id, key };
  }
  async function seal(key) {
    const d = JSON.parse(JSON.stringify(Case.d)); if (d.x) delete d.x.sy; d.admin = '';
    const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(d))));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return 'v1.' + b64(out);
  }
  async function open(key, data) {
    if (String(data).slice(0, 3) !== 'v1.') throw new Error('格式不對'); const u = unb64(String(data).slice(3));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, key, u.subarray(12)); return JSON.parse(dec.decode(pt));
  }

  let busy = false, msg = '';
  async function upload(force) {
    const s = sy(); if (!valid(s.code)) return; busy = true; paint();
    try {
      const { id, key } = await keys(s.code), data = await seal(key), body = { id, data }; if (s.rev) body.rev = s.rev; if (force) body.force = true;
      const out = await Api.call('/api/case', { method: 'PUT', body, timeout: 20000 }); s.rev = out.rev | 0; s.t = +out.t || Date.now(); Case.flush(); msg = '已上傳。'; toast('手提箱已上傳');
    } catch (e) {
      if (e.code === 'conflict') { msg = 'conflict'; s.remoteT = 0; conflictT = e.data && e.data.t; }
      else msg = e.message || '上傳失敗';
    }
    busy = false; paint();
  }
  let conflictT = 0;
  async function download(code) {
    code = code || sy().code; if (!valid(code)) { msg = '同步碼是十六個字，例如 ABCD-EFGH-JKLM-NPQR。'; paint(); return; }
    busy = true; paint();
    try {
      const { id, key } = await keys(code); let out;
      try { out = await Api.call('/api/case?id=' + id, { timeout: 20000 }); } catch (e) { if (e.status === 404) throw new Error('雲端沒有這組同步碼的存檔。'); throw e; }
      let obj; try { obj = await open(key, out.data); } catch (e) { throw new Error('解不開這份存檔，同步碼可能打錯了。'); }
      const keep = { admin: Case.d.admin }; Case.d = Case.clean(obj); Case.d.admin = keep.admin;
      const s = sy(); s.code = code; s.rev = out.rev | 0; s.t = +out.t || Date.now(); Case.flush();
      msg = '已換成雲端的手提箱。'; A.emit('import'); A.badge(); A.casePaint(); A.veil(true); toast('已下載雲端的手提箱');
    } catch (e) { msg = e.message || '下載失敗'; }
    busy = false; paint();
  }
  async function forget(alsoCloud) {
    const s = sy(); busy = true; paint();
    if (alsoCloud && valid(s.code)) { try { const { id } = await keys(s.code); await Api.call('/api/case?id=' + id, { method: 'DELETE' }); } catch (e) { /* 雲端刪不掉就算了，本機照樣忘掉 */ } }
    s.code = ''; s.rev = 0; s.t = 0; Case.flush(); msg = alsoCloud ? '雲端的存檔已刪除，這台裝置也忘了同步碼。' : '這台裝置已經忘了同步碼。'; busy = false; paint();
  }

  function paint() {
    const sec = $('sync-sec'), box = $('sync-box'); if (!sec) return; sec.hidden = !ok(); if (!ok()) return;
    const s = sy(); box.textContent = ''; const g = K.h('div.sync-grid');
    if (!valid(s.code)) {
      g.append(K.h('p.hint', { text: '一組同步碼，就是一把鑰匙。箱子先上鎖，再寄去雲端；到了另一台裝置，用同一組碼開箱。' }));
      const mk = K.h('button.btn', { type: 'button', text: '建立同步碼並上傳', disabled: busy });
      mk.onclick = () => { sy().code = newCode(); sy().rev = 0; Case.flush(); upload(); };
      const inp = K.h('input.inp', { type: 'text', id: 'sync-in', placeholder: 'ABCD-EFGH-JKLM-NPQR', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '24', 'aria-label': '同步碼' });
      const go = K.h('button.btn', { type: 'button', text: '用同步碼取回', disabled: busy }); go.onclick = () => download(norm(inp.value));
      g.append(K.h('div.save-row', mk), K.h('label.lab', { for: 'sync-in', text: '已經有同步碼' }), inp, K.h('div.save-row', go));
      g.append(K.h('p.hint', { text: '取回之後，這台裝置上的箱子會換成雲端那一只。' }));
    } else {
      g.append(K.h('span.lab', { text: '你的同步碼' }), K.h('code.sync-code', { text: pretty(s.code) }),
        K.h('p.hint', { text: (s.t ? '上次同步　' + K.ago(s.t) + '。' : '') + '同步碼就是鑰匙，請自己記下來。後端只存加密過的內容，沒有同步碼就打不開。' }));
      const up = K.h('button.btn.pri', { type: 'button', text: '上傳這台的手提箱', disabled: busy, onclick: () => upload(false) });
      const dn = K.h('button.btn', { type: 'button', text: '換成雲端的那一份', disabled: busy, onclick: () => download() });
      const cp = K.h('button.btn', { type: 'button', text: '複製同步碼', onclick: () => A.copyText(pretty(s.code)) });
      g.append(K.h('div.save-row', up, dn, cp));
      if (msg === 'conflict') {
        g.append(K.h('p.note-ok', { role: 'status', text: '雲端那一份比較新' + (conflictT ? '（' + K.ago(conflictT) + '上傳）' : '') + '，可能是另一台裝置傳的。' }),
          K.h('div.save-row', K.h('button.btn', { type: 'button', text: '用這台的蓋過去', onclick: () => upload(true) }), K.h('button.btn', { type: 'button', text: '先換成雲端的', onclick: () => download() })));
      }
      const fg = K.h('button.tiny', { type: 'button', text: '停用同步' });
      fg.onclick = () => { if (fg.dataset.sure !== '1') { fg.dataset.sure = '1'; fg.textContent = '確定停用，並刪除雲端的存檔'; return; } forget(true); };
      g.append(K.h('div.save-row', fg));
    }
    if (msg && msg !== 'conflict') g.append(K.h('p.note-ok', { role: 'status', text: msg }));
    if (busy) g.append(K.h('p.hint', { text: '處理中…' }));
    box.append(g);
  }
  A.on('case', () => { msg = msg === 'conflict' ? msg : ''; paint(); });
  A.on('board', () => { if (A.cur === 'case') paint(); });
  A.on('wipe', ({ keep, old }) => { if (old.x && old.x.sy) keep.x.sy = old.x.sy; });
  A.Sync = { upload, download };
})();
