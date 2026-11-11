'use strict';
/* ---------- 工具箱：後面每個模組共用 ---------- */
(function () {
  const A = window.__A, { el, Case } = A;
  const K = {};

  /* 模組各自的存檔欄位，放在手提箱的 x 底下。defs 同時是預設值和型別檢查。 */
  K.bag = function (name, defs) {
    const x = Case.d.x || (Case.d.x = {});
    let o = x[name];
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = x[name] = {};
    for (const k in defs) {
      const d = defs[k], v = o[k];
      const bad = v === undefined || v === null || typeof v !== typeof d || Array.isArray(v) !== Array.isArray(d) ||
        (typeof d === 'number' && !isFinite(v));
      if (bad) o[k] = (d && typeof d === 'object') ? JSON.parse(JSON.stringify(d)) : d;
    }
    return o;
  };

  K.rm = () => A.RM || document.documentElement.dataset.motion === 'less';
  K.clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  K.day = (d) => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  K.debounce = (f, ms) => { let t = 0; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => f.apply(null, a), ms); }; };
  K.typing = (e) => { const t = e.target; return !!t && (/^(TEXTAREA|INPUT|SELECT)$/.test(t.tagName) || t.isContentEditable); };
  K.ago = (ts) => {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 90) return '剛剛';
    if (s < 3600) return Math.round(s / 60) + ' 分鐘前';
    if (s < 86400) return Math.round(s / 3600) + ' 小時前';
    if (s < 86400 * 30) return Math.round(s / 86400) + ' 天前';
    return A.fmtDate(ts);
  };

  /* 小型的 DOM 建構：h('div.cls', {屬性}, 子節點…) */
  K.h = function (sel, attrs) {
    const m = String(sel).split('.'), e = document.createElement(m[0] || 'div');
    if (m.length > 1) e.className = m.slice(1).join(' ');
    let i = 1;
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
      i = 2;
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'hidden' || k === 'disabled' || k === 'checked') e[k] = !!v;
        else if (k === 'value') e.value = v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(x => { if (x != null && x !== false) e.append(x); });
      else e.append(c);
    }
    return e;
  };

  /* 對話框：焦點鎖在裡面，Esc 或點背景關閉，關掉後焦點回到原本的地方。 */
  let dlgOpen = null;
  K.dialog = function (o) {
    if (dlgOpen) dlgOpen.close();
    const back = K.h('div.dlg' + (o.cls ? '.' + o.cls : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || '' });
    const box = K.h('div.dlg-box');
    const prev = document.activeElement;
    if (o.title) {
      const x = K.h('button.btn.sm', { type: 'button', text: '關閉', onclick: () => api.close() });
      box.append(K.h('div.dlg-top', K.h('b', { text: o.title }), x));
    }
    const body = K.h('div.dlg-body');
    box.append(body); back.append(box);
    const focusables = () => [...box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"]')].filter(n => n.offsetParent !== null);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    const api = {
      root: back, box, body,
      close() {
        if (dlgOpen !== api) return;
        dlgOpen = null; back.remove(); document.removeEventListener('keydown', onKey, true);
        document.documentElement.classList.remove('dlg-on');
        if (o.onClose) try { o.onClose(); } catch (e) { /* 忽略 */ }
        if (prev && prev.focus && document.contains(prev)) try { prev.focus(); } catch (e) { /* 忽略 */ }
      }
    };
    back.addEventListener('mousedown', e => { if (e.target === back) api.close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(back); document.documentElement.classList.add('dlg-on');
    dlgOpen = api;
    if (o.build) o.build(body, api);
    setTimeout(() => { const f = body.querySelector('[data-auto]') || focusables()[0]; if (f) f.focus(); }, 30);
    return api;
  };
  K.dialogOpen = () => !!dlgOpen;
  K.closeDialog = () => { if (dlgOpen) dlgOpen.close(); };

  /* 浮在旁邊的小卡（名詞說明用）。 */
  let popOpen = null;
  K.pop = function (anchor, node) {
    K.closePop();
    const p = K.h('div.pop', { role: 'dialog' }, node);
    document.body.append(p);
    const r = anchor.getBoundingClientRect(), pw = Math.min(360, innerWidth - 24);
    p.style.width = pw + 'px';
    const ph = p.offsetHeight;
    let left = K.clamp(r.left + r.width / 2 - pw / 2, 12, innerWidth - pw - 12);
    let top = r.bottom + 10;
    if (top + ph > innerHeight - 8 && r.top - ph - 10 > 8) top = r.top - ph - 10;
    p.style.left = (left + scrollX) + 'px'; p.style.top = (top + scrollY) + 'px';
    const off = (e) => { if (e.type === 'keydown') { if (e.key === 'Escape') { K.closePop(); anchor.focus(); } return; } if (!p.contains(e.target) && e.target !== anchor) K.closePop(); };
    setTimeout(() => { document.addEventListener('mousedown', off); document.addEventListener('touchstart', off, { passive: true }); document.addEventListener('keydown', off); }, 0);
    popOpen = { p, off, anchor };
    anchor.setAttribute('aria-expanded', 'true');
    return p;
  };
  K.closePop = function () {
    if (!popOpen) return;
    const { p, off, anchor } = popOpen; popOpen = null;
    p.remove(); document.removeEventListener('mousedown', off); document.removeEventListener('touchstart', off); document.removeEventListener('keydown', off);
    if (anchor) anchor.setAttribute('aria-expanded', 'false');
  };
  A.on('route', K.closePop);

  /* 分頁標題跟著房間走，瀏覽紀錄和書籤才分得出來 */
  const SITE = '逆雨檔案館';
  A.on('route', ({ name }) => {
    const c = /^c\d+$/.test(name) ? A.chOf(name) : null, r = A.ROOMS.find(x => x[0] === name);
    document.title = c ? c.no + '〈' + c.zh + '〉｜' + SITE : r ? r[1] + '｜' + SITE : SITE + '｜重返未來：1999 主線劇情檔案（非官方）';
  });

  /* 左右滑：展間與放映廳共用。 */
  K.swipe = function (node, onDir) {
    let x0 = 0, y0 = 0, t0 = 0, on = false;
    node.addEventListener('touchstart', e => { if (e.touches.length !== 1) { on = false; return; } on = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }, { passive: true });
    node.addEventListener('touchend', e => {
      if (!on) return; on = false;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Date.now() - t0 < 700 && Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.6) onDir(dx < 0 ? 1 : -1);
    }, { passive: true });
  };

  /* 下載：存檔、圖卡。 */
  K.download = function (name, blob) {
    const url = URL.createObjectURL(blob), a = K.h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  K.savePng = function (canvas, name) {
    return new Promise(res => {
      try { canvas.toBlob(b => { if (b) { K.download(name, b); res(true); } else res(false); }, 'image/png'); }
      catch (e) { res(false); }
    });
  };

  /* 在 canvas 上排中文：逐字折行，行首不放句讀。回傳畫到的 y。 */
  K.wrap = function (c, text, x, y, maxW, lineH, maxLines) {
    const noHead = '，。、；：！？）」』》〉…—';
    let line = '', n = 0;
    const out = (s) => { c.fillText(s, x, y); y += lineH; n++; };
    const chars = Array.from(String(text || ''));
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === '\n') { out(line); line = ''; if (maxLines && n >= maxLines) return y; continue; }
      if (c.measureText(line + ch).width > maxW && line && noHead.indexOf(ch) < 0) {
        if (maxLines && n >= maxLines - 1) { out(line.slice(0, -1) + '…'); return y; }
        out(line); line = ch;
      } else line += ch;
    }
    if (line) out(line);
    return y;
  };

  /* 圖卡的共用底：暗房底色、底片、角標、館名。painter 用現成的底片畫家。 */
  K.card = function (w, h, shot, t) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.fillStyle = '#07090c'; c.fillRect(0, 0, w, h);
    return { cv, c, w, h, shot, t };
  };
  K.fonts = { serif: '"Noto Serif TC","Noto Serif CJK TC","Songti TC",serif', ui: '"Jost","Noto Sans TC",sans-serif', lat: '"Bodoni Moda","Didot",Georgia,serif' };

  /* 把一張底片畫進任意大小的離屏畫布（圖卡、縮圖用）。 */
  K.plateInto = function (c, shot, t, x, y, w, h) {
    const off = document.createElement('canvas'); off.width = Math.round(w); off.height = Math.round(h);
    A.Plates.still(off, shot, t == null ? 5 : t);
    c.drawImage(off, x, y, w, h);
  };

  /* 全站鍵盤：模組用 K.key 註冊，打字時不觸發。 */
  const keys = [];
  K.key = (test, fn) => keys.push([test, fn]);
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented) return;
    const typing = K.typing(e);
    for (const [test, fn] of keys) { if (test(e, typing)) { fn(e); return; } }
  });

  A.K = K;
})();
