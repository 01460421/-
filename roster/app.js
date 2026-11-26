'use strict';
/* ============================================================
   學生聯絡名冊 — 純前端；資料為 AES-GCM 加密檔 data.enc.json
   ============================================================ */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} },
};
const GRADES = ['一年', '二年', '三年', '四年', '五年', '六年', '七年', '八年', '九年'];
const CLS_ORDER = '甲乙丙丁戊己庚辛壬癸';
const collator = new Intl.Collator('zh-Hant-TW-u-co-stroke');
const today = () => { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };

let DATA = [], META = {}, SCHOOLS = [];

/* ---------------- 解密 ---------------- */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decrypt(pw) {
  const enc = await (await fetch('data.enc.json', { cache: 'no-store' })).json();
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(enc.salt), iterations: enc.iter },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct)); // 密碼錯會 throw
  const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

async function unlock(pw, keep) {
  const btn = $('#unlockBtn'); btn.disabled = true; btn.textContent = '解鎖中…'; $('#lockErr').textContent = '';
  try {
    const d = await decrypt(pw);
    ss.set('roster.pw', keep ? pw : null);
    start(d);
  } catch (e) {
    console.error(e);
    ss.set('roster.pw', null);
    $('#lockErr').textContent = e instanceof DOMException && e.name === 'OperationError' ? '密碼不正確' : '無法讀取資料：' + e.message;
  } finally { btn.disabled = false; btn.textContent = '解鎖'; }
}
$('#lockForm').addEventListener('submit', e => { e.preventDefault(); const pw = $('#pw').value; if (pw) unlock(pw, $('#keep').checked); });
$('#lockBtn').onclick = () => { ss.set('roster.pw', null); location.reload(); };
{ const saved = ss.get('roster.pw'); if (saved) unlock(saved, true); }

/* ---------------- 資料準備 ---------------- */
function classRank(c) {
  const g = GRADES.indexOf(c.slice(0, 2));
  const rest = c.slice(2), m = rest.match(/^\d+/);
  let r = m ? +m[0] : CLS_ORDER.indexOf(rest[0]);
  if (r < 0) r = 500 + (rest.codePointAt(0) || 0) % 400;
  return (g < 0 ? 99 : g) * 1000 + r;
}
function start(d) {
  META = d; DATA = d.rows;
  DATA.forEach((r, i) => {
    r.i = i;
    r.cr = classRank(r.c);
    r.txt = [r.name, r.gu, r.fa, r.mo, r.addr, r.s, r.c, r.id, r.raw].join(' ').toLowerCase();
    r.dig = r.ph.map(p => p[1].replace(/\D/g, '')).join(' ');
    if (!SCHOOLS.includes(r.s)) SCHOOLS.push(r.s);
  });
  $('#lock').hidden = true; $('#app').hidden = false;
  $('#info').textContent = `共 ${DATA.length.toLocaleString()} 筆　資料日期 ${d.built || ''}`;
  buildFilters(); buildColMenu(); render();
}

/* ---------------- 篩選狀態 ---------------- */
const F = { q: '', L: '', S: new Set(), G: new Set(), C: '', sex: '', ph: '', mob: false };
const view = { sort: null, dir: 1, page: 0, size: store.get('roster.pageSize', 50), open: new Set() };
const shortName = s => s.replace(/^(縣立|市立|私立|國立)/, '').replace('高中附設', '').replace('高級中學附設', '');

function seg(id, cb, init) {
  const bs = $$(`#${id} button`);
  const set = v => bs.forEach(b => b.classList.toggle('on', b.dataset.v === v));
  bs.forEach(b => b.onclick = () => { set(b.dataset.v); cb(b.dataset.v); });
  if (init !== undefined) set(init);
  return set;
}
const setLevel = seg('fLevel', v => { F.L = v; F.S.clear(); F.G.clear(); F.C = ''; buildFilters(); go(); });
const setSex = seg('fSex', v => { F.sex = v; go(); });
const setPh = seg('fPhone', v => { F.ph = v; go(); });
$('#fMobile').onchange = e => { F.mob = e.target.checked; render(); };
let qt; $('#q').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { F.q = e.target.value.trim(); go(); }, 120); };
$('#fClass').onchange = e => { F.C = e.target.value; go(); };
$('#resetBtn').onclick = () => {
  Object.assign(F, { q: '', L: '', C: '', sex: '', ph: '', mob: false }); F.S.clear(); F.G.clear();
  $('#q').value = ''; $('#fMobile').checked = false; setLevel(''); setSex(''); setPh(''); buildFilters(); go();
};
$('#filterToggle').onclick = () => $('#side').classList.toggle('show');
function go() { view.page = 0; view.open.clear(); render(); }

function inScope(r, skip) {
  return (!F.L || r.L === F.L) && (skip === 'S' || !F.S.size || F.S.has(r.s)) && (skip === 'G' || !F.G.size || F.G.has(r.g));
}
function buildFilters() {
  const pool = DATA.filter(r => !F.L || r.L === F.L);
  const schools = SCHOOLS.filter(s => pool.some(r => r.s === s));
  $('#fSchool').innerHTML = schools.map(s => `<button class="chip ${F.S.has(s) ? 'on' : ''}" data-s="${esc(s)}" title="${esc(s)}">${esc(shortName(s))}</button>`).join('');
  const grades = GRADES.filter(g => DATA.some(r => inScope(r, 'G') && r.g === g));
  $('#fGrade').innerHTML = grades.map(g => `<button class="chip ${F.G.has(g) ? 'on' : ''}" data-g="${g}">${g}</button>`).join('');
  $$('#fSchool .chip').forEach(c => c.onclick = () => { toggle(F.S, c.dataset.s); F.C = ''; buildFilters(); go(); });
  $$('#fGrade .chip').forEach(c => c.onclick = () => { toggle(F.G, c.dataset.g); F.C = ''; buildFilters(); go(); });
  const cls = [...new Set(DATA.filter(r => inScope(r)).map(r => r.c))].sort((a, b) => classRank(a) - classRank(b));
  if (F.C && !cls.includes(F.C)) F.C = '';
  $('#fClass').innerHTML = '<option value="">全部班級</option>' + cls.map(c => `<option ${c === F.C ? 'selected' : ''}>${esc(c)}</option>`).join('');
}
const toggle = (set, v) => set.has(v) ? set.delete(v) : set.add(v);

function filtered() {
  const q = F.q.toLowerCase(), qd = F.q.replace(/\D/g, '');
  const qIsNum = qd.length >= 3 && /^[\d\s\-()]+$/.test(F.q);
  let rows = DATA.filter(r => inScope(r) && (!F.C || r.c === F.C) && (!F.sex || r.sex === F.sex)
    && (!F.ph || (F.ph === 'has' ? r.ph.length : !r.ph.length))
    && (!q || (qIsNum ? r.dig.includes(qd) || r.txt.includes(q) : r.txt.includes(q))));
  if (view.sort) {
    const c = TCOLS.find(c => c.k === view.sort);
    rows = rows.slice().sort((a, b) => (c.cmp(a, b) || a.i - b.i) * view.dir);
  }
  return rows;
}

/* ---------------- 表格 ---------------- */
const sIdx = r => SCHOOLS.indexOf(r.s);
function phoneList(r, mobileOnly) { return mobileOnly ? r.ph.filter(p => p[2] === 'mobile') : r.ph; }
const TCOLS = [
  { k: 'school', t: '學校', on: true, td: r => `<td class="sc">${esc(shortName(r.s))}</td>`, cmp: (a, b) => sIdx(a) - sIdx(b) },
  { k: 'cls', t: '班級', on: true, td: r => `<td class="sc">${esc(r.c)}</td>`, cmp: (a, b) => a.cr - b.cr || sIdx(a) - sIdx(b) },
  { k: 'seat', t: '座號', on: true, m: 1, td: r => `<td>${esc(r.n)}</td>`, cmp: (a, b) => (+a.n || 999) - (+b.n || 999) },
  { k: 'name', t: '姓名', on: true, td: r => `<td class="nm">${esc(r.name)}${r.sex ? `<span class="sub">${esc(r.sex)}</span>` : ''}</td>`, cmp: (a, b) => collator.compare(a.name, b.name) },
  { k: 'gu', t: '監護人', on: true, m: 1, td: r => `<td>${esc(r.gu)}</td>`, cmp: (a, b) => collator.compare(a.gu, b.gu) },
  {
    k: 'phone', t: '電話', on: true, td: r => {
      const ps = phoneList(r, F.mob);
      return `<td>${ps.length ? ps.map(([l, n, t]) => `<span class="ph">${l ? `<em>${esc(l)}</em>` : t === 'land' ? '<em>市話</em>' : ''}<a href="tel:${n.replace(/[^\d#]/g, '')}" onclick="event.stopPropagation()">${esc(n)}</a></span>`).join('') : '<span class="none">未填寫</span>'}</td>`;
    }, cmp: (a, b) => (b.ph.length > 0) - (a.ph.length > 0) || (a.ph[0]?.[1] || '').localeCompare(b.ph[0]?.[1] || '')
  },
  { k: 'bd', t: '生日', on: false, m: 1, td: r => `<td class="sc">${esc(r.bd)}</td>`, cmp: (a, b) => a.bd.localeCompare(b.bd) },
  { k: 'addr', t: '地址', on: false, m: 1, td: r => `<td>${esc(r.addr)}</td>`, cmp: (a, b) => collator.compare(a.addr, b.addr) },
];
const colOn = store.get('roster.cols', null);
if (colOn) TCOLS.forEach(c => c.on = colOn.includes(c.k));

function buildColMenu() {
  $('#colBox').innerHTML = TCOLS.map(c => `<label class="chk"><input type="checkbox" data-k="${c.k}" ${c.on ? 'checked' : ''}> ${c.t}</label>`).join('');
  $$('#colBox input').forEach(i => i.onchange = () => {
    TCOLS.find(c => c.k === i.dataset.k).on = i.checked;
    store.set('roster.cols', TCOLS.filter(c => c.on).map(c => c.k)); render();
  });
}
$('#colBtn').onclick = e => { e.stopPropagation(); $('#colBox').classList.toggle('show'); };
document.addEventListener('click', e => { if (!e.target.closest('.pop')) $('#colBox').classList.remove('show'); });

$('#pageSize').value = String(view.size);
$('#pageSize').onchange = e => { view.size = +e.target.value; store.set('roster.pageSize', view.size); view.page = 0; render(); };
$('#prevPg').onclick = () => { view.page--; render(); };
$('#nextPg').onclick = () => { view.page++; render(); };

let ROWS = [];
function render() {
  ROWS = filtered();
  const cols = TCOLS.filter(c => c.on);
  const n = ROWS.length;
  $('#sN').innerHTML = `${n.toLocaleString()}<small>人</small>`;
  $('#sS').innerHTML = `${new Set(ROWS.map(r => r.s)).size}<small>所</small>`;
  $('#sC').innerHTML = `${new Set(ROWS.map(r => r.s + r.c)).size}<small>班</small>`;
  $('#sP').innerHTML = `${n ? Math.round(ROWS.filter(r => r.ph.length).length / n * 100) : 0}<small>%</small>`;

  const tags = [];
  if (F.q) tags.push(['q', `搜尋「${F.q}」`]);
  if (F.L) tags.push(['L', F.L]);
  F.S.forEach(s => tags.push(['S:' + s, shortName(s)]));
  F.G.forEach(g => tags.push(['G:' + g, g]));
  if (F.C) tags.push(['C', F.C]);
  if (F.sex) tags.push(['sex', F.sex + '生']);
  if (F.ph) tags.push(['ph', F.ph === 'has' ? '有電話' : '沒電話']);
  $('#tags').innerHTML = tags.length ? tags.map(([k, t]) => `<span class="tag" data-k="${esc(k)}">${esc(t)}</span>`).join('') : '<span class="muted">顯示全部資料</span>';
  $$('#tags .tag').forEach(t => t.onclick = () => removeTag(t.dataset.k));

  $('#thead').innerHTML = cols.map(c => `<th data-k="${c.k}" class="${c.m ? 'hide-m' : ''} ${view.sort === c.k ? 'sorted' : ''}">${c.t}<span class="ar">${view.sort === c.k ? (view.dir > 0 ? '▲' : '▼') : '↕'}</span></th>`).join('');
  $$('#thead th').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    if (view.sort !== k) { view.sort = k; view.dir = 1; } else if (view.dir === 1) view.dir = -1; else view.sort = null;
    view.page = 0; render();
  });

  const size = view.size || n || 1, pages = Math.max(1, Math.ceil(n / size));
  view.page = Math.min(Math.max(0, view.page), pages - 1);
  const slice = ROWS.slice(view.page * size, view.page * size + size);
  $('#tbody').innerHTML = slice.length ? slice.map(r => {
    const open = view.open.has(r.i);
    return `<tr class="r ${open ? 'open' : ''}" data-i="${r.i}">${cols.map(c => c.td(r).replace('<td', c.m ? '<td class="hide-m"' : '<td').replace('class="hide-m" class="', 'class="hide-m ')).join('')}</tr>`
      + (open ? `<tr class="detail"><td colspan="${cols.length}">${detail(r)}</td></tr>` : '');
  }).join('') : `<tr><td colspan="${cols.length}" class="empty">沒有符合條件的資料</td></tr>`;
  $$('#tbody tr.r').forEach(tr => tr.onclick = () => { const i = +tr.dataset.i; toggle(view.open, i); render(); });

  $('#pageInfo').textContent = n ? `第 ${(view.page * size + 1).toLocaleString()}–${Math.min(n, (view.page + 1) * size).toLocaleString()} 筆，共 ${n.toLocaleString()} 筆　點一列可展開完整資料` : '';
  $('#pgNo').textContent = `${view.page + 1} / ${pages}`;
  $('#prevPg').disabled = view.page === 0; $('#nextPg').disabled = view.page >= pages - 1;
}
function detail(r) {
  const f = [['學校', r.s], ['班級', r.c + (r.n ? ` ${r.n} 號` : '')], ['學號', r.id], ['性別', r.sex], ['生日', r.bd],
  ['監護人', r.gu], ['父親', r.fa], ['母親', r.mo], ['地址', (r.zip ? r.zip + ' ' : '') + r.addr], ['電話原始填寫', r.raw]];
  return `<div class="dl">${f.filter(x => x[1]).map(([k, v]) => `<div><span>${k}</span>${esc(v)}</div>`).join('')}</div>`;
}
function removeTag(k) {
  if (k === 'q') { F.q = ''; $('#q').value = ''; }
  else if (k === 'L') { F.L = ''; setLevel(''); }
  else if (k.startsWith('S:')) F.S.delete(k.slice(2));
  else if (k.startsWith('G:')) F.G.delete(k.slice(2));
  else if (k === 'C') F.C = '';
  else if (k === 'sex') { F.sex = ''; setSex(''); }
  else if (k === 'ph') { F.ph = ''; setPh(''); }
  buildFilters(); go();
}

/* ============================================================
   匯出
   ============================================================ */
const XCOLS = {
  school: { t: '學校', v: r => shortName(r.s), nw: 1 },
  cls: { t: '班級', v: r => r.c, nw: 1 },
  seat: { t: '座號', v: r => r.n, nw: 1 },
  name: { t: '姓名', v: r => r.name, nw: 1 },
  phone: { t: '電話', nw: 1 },
  gu: { t: '監護人', v: r => r.gu, nw: 1 },
  sid: { t: '學號', v: r => r.id, nw: 1 },
  sex: { t: '性別', v: r => r.sex, nw: 1 },
  bd: { t: '生日', v: r => r.bd, nw: 1 },
  addr: { t: '地址', v: r => (r.zip ? r.zip + ' ' : '') + r.addr },
};
const DEFAULT_X = {
  split: 'class', pack: 'merge', phone: 'all', phoneLine: 'br', ori: 'p', ncol: '1', fs: 'm', sty: 'line',
  title: '{學校}　{班級}　聯絡名冊', foot: true, wm: false, fmt: 'pdf',
  cols: [['school', 1], ['cls', 1], ['seat', 0], ['name', 1], ['phone', 1], ['gu', 0], ['sid', 0], ['sex', 0], ['bd', 0], ['addr', 0]],
};
let X = Object.assign(structuredClone(DEFAULT_X), store.get('roster.export', {}));
const keys = Object.keys(XCOLS);
X.cols = X.cols.filter(c => XCOLS[c[0]]).concat(keys.filter(k => !X.cols.some(c => c[0] === k)).map(k => [k, 0]));
const saveX = () => store.set('roster.export', X);

const xSegs = {};
[['xSplit', 'split'], ['xPack', 'pack'], ['xPhoneLine', 'phoneLine'], ['xOri', 'ori'], ['xNcol', 'ncol'], ['xFs', 'fs'], ['xSty', 'sty'], ['xFmt', 'fmt']]
  .forEach(([id, k]) => xSegs[k] = seg(id, v => { X[k] = v; changed(); }));
$('#xPhone').onchange = e => { X.phone = e.target.value; changed(); };
$('#xTitle').oninput = e => { X.title = e.target.value; changed(); };
$('#xFoot').onchange = e => { X.foot = e.target.checked; changed(); };
$('#xWm').onchange = e => { X.wm = e.target.checked; changed(); };

function syncX() {
  Object.entries(xSegs).forEach(([k, set]) => set(X[k]));
  $('#xPhone').value = X.phone; $('#xTitle').value = X.title; $('#xFoot').checked = X.foot; $('#xWm').checked = X.wm;
  $('#xCols').innerHTML = X.cols.map(([k, on], i) => `<div class="c ${on ? '' : 'off'}"><label class="chk" style="margin:0"><input type="checkbox" data-i="${i}" ${on ? 'checked' : ''}> ${XCOLS[k].t}</label>
    <span class="mv"><button data-up="${i}" title="上移" ${i ? '' : 'disabled'}>▲</button><button data-dn="${i}" title="下移" ${i < X.cols.length - 1 ? '' : 'disabled'}>▼</button></span></div>`).join('');
  $$('#xCols input').forEach(c => c.onchange = () => { X.cols[+c.dataset.i][1] = c.checked ? 1 : 0; changed(true); });
  $$('#xCols [data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [X.cols[i - 1], X.cols[i]] = [X.cols[i], X.cols[i - 1]]; changed(true); });
  $$('#xCols [data-dn]').forEach(b => b.onclick = () => { const i = +b.dataset.dn; [X.cols[i + 1], X.cols[i]] = [X.cols[i], X.cols[i + 1]]; changed(true); });
  $('#xPack').style.display = X.split === 'all' ? 'none' : '';
  $('#xPack button[data-v="merge"]').textContent = X.fmt === 'xlsx' ? '合併成一個檔（每份一個工作表）' : X.fmt === 'png' ? '全部圖片打包 ZIP' : '合併成一個檔（每份換頁）';
  $('#xGo').textContent = X.fmt === 'print' ? '開啟列印' : '下載';
  $('#fmtHint').textContent = {
    pdf: '每頁為高解析度圖片，任何電腦開啟都一致。',
    png: '每頁一張圖片；超過一張時打包為 ZIP。',
    xlsx: '輸出選取的欄位，可再自行編輯。',
    print: '用瀏覽器列印，也可在列印視窗選「另存為 PDF」，文字可複製、檔案較小。',
  }[X.fmt];
  presetList();
}
let pt;
function changed(resync) { saveX(); if (resync !== false) syncX(); clearTimeout(pt); pt = setTimeout(preview, 150); }

/* 範本 */
function presetList() {
  const P = store.get('roster.presets', {});
  const cur = $('#xPreset').value;
  $('#xPreset').innerHTML = '<option value="">— 套用已存的範本 —</option>' + Object.keys(P).map(n => `<option ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
}
$('#xPreset').onchange = e => { const P = store.get('roster.presets', {}); if (P[e.target.value]) { X = structuredClone(P[e.target.value]); changed(); } };
$('#xSave').onclick = () => {
  const n = prompt('範本名稱', $('#xPreset').value || '我的範本'); if (!n) return;
  const P = store.get('roster.presets', {}); P[n] = structuredClone(X); store.set('roster.presets', P); presetList(); $('#xPreset').value = n;
};
$('#xDel').onclick = () => {
  const n = $('#xPreset').value; if (!n || !confirm(`刪除範本「${n}」？`)) return;
  const P = store.get('roster.presets', {}); delete P[n]; store.set('roster.presets', P); $('#xPreset').value = ''; presetList();
};

/* 開關 */
$('#exportBtn').onclick = () => { $('#ov').hidden = false; syncX(); preview(); };
$('#closeEx').onclick = () => { $('#ov').hidden = true; };
$('#ov').onclick = e => { if (e.target.id === 'ov') $('#ov').hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#ov').hidden = true; });
window.addEventListener('resize', () => { if (!$('#ov').hidden) fitPreview(); });

/* 分組 */
function groups() {
  const g = new Map();
  ROWS.forEach(r => {
    const k = X.split === 'all' ? '全部' : X.split === 'school' ? r.s : r.s + '\u0000' + r.c;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r);
  });
  return [...g.values()].map(rows => {
    const sch = [...new Set(rows.map(r => r.s))], cls = [...new Set(rows.map(r => r.c))];
    const school = sch.length === 1 ? sch[0] : '', klass = cls.length === 1 ? cls[0] : '';
    const title = X.title.replace(/\{學校\}/g, school).replace(/\{班級\}/g, klass).replace(/\{人數\}/g, rows.length).replace(/\{日期\}/g, today())
      .replace(/[ 　]{2,}/g, '　').replace(/^[ 　]+|[ 　]+$/g, '') || '聯絡名冊';
    const file = [shortName(school), klass].filter(Boolean).join('_') || '聯絡名冊';
    return { rows, title, file };
  });
}

/* 電話文字 */
function maskNum(n) {
  if (/^09/.test(n)) return n.replace(/^(\d{4}-)\d{3}/, '$1***');
  return n.replace(/^(\d{2,4}-\d)\d{3}/, '$1***');
}
function phoneParts(r) {
  let ps = r.ph;
  if (X.phone === 'mobile') ps = ps.filter(p => p[2] === 'mobile');
  if (X.phone === 'first') ps = ps.slice(0, 1);
  return ps.map(([l, n]) => [l, X.phone === 'mask' ? maskNum(n) : n]);
}
function phoneHTML(r) {
  const ps = phoneParts(r);
  const any = ps.some(p => p[0]);
  return ps.map(([l, n]) => (any ? `<span class="pl">${esc(l)}</span>` : '') + esc(n)).join(X.phoneLine === 'br' ? '<br>' : '　');
}
function phoneText(r) { return phoneParts(r).map(([l, n]) => (l ? l + ' ' : '') + n).join(X.phoneLine === 'br' ? '\n' : '　'); }

/* 依實際高度分頁 */
function newPage(g, cols) {
  const p = document.createElement('div');
  p.className = `page ${X.ori === 'l' ? 'land' : ''} fs-${X.fs} st-${X.sty}`;
  const head = `<thead><tr>${cols.map(k => `<th>${XCOLS[k].t}</th>`).join('')}</tr></thead>`;
  const colw = `<div class="colw"><table>${head}<tbody></tbody></table></div>`;
  p.innerHTML = (X.wm ? '<div class="wm">機密・僅供聯絡使用</div>' : '')
    + `<div class="hd"><div class="tt">${esc(g.title)}</div><p class="mt">共 ${g.rows.length} 人</p></div>`
    + `<div class="body">${colw.repeat(X.ncol === '2' ? 2 : 1)}</div>`
    + (X.foot ? `<div class="ft"><span>列印日期 ${today()}</span><span class="pn"></span></div>` : '');
  return p;
}
function rowHTML(r, cols) {
  return cols.map(k => k === 'phone' ? `<td class="nw">${phoneHTML(r)}</td>` : `<td class="${XCOLS[k].nw ? 'nw' : ''}">${esc(XCOLS[k].v(r))}</td>`).join('');
}
function paginate(g, host = $('#render')) {
  const cols = X.cols.filter(c => c[1]).map(c => c[0]);
  host.innerHTML = '';
  const pages = [];
  let page, colsEls, ci;
  const open = () => { page = newPage(g, cols); host.appendChild(page); pages.push(page); colsEls = [...page.querySelectorAll('.colw')]; ci = 0; };
  open();
  for (const r of g.rows) {
    const tr = document.createElement('tr'); tr.innerHTML = rowHTML(r, cols);
    let tb = colsEls[ci].querySelector('tbody'); tb.appendChild(tr);
    if (colsEls[ci].scrollHeight > colsEls[ci].clientHeight + 1 && tb.children.length > 1) {
      tr.remove();
      if (ci + 1 < colsEls.length) ci++;
      else open();
      colsEls[ci].querySelector('tbody').appendChild(tr);
    }
  }
  // 雙欄時第二欄空白就移除
  pages.forEach(p => p.querySelectorAll('.colw').forEach((c, i) => { if (i && !c.querySelector('tbody').children.length) c.style.visibility = 'hidden'; }));
  pages.forEach((p, i) => { const pn = p.querySelector('.pn'); if (pn) pn.textContent = `第 ${i + 1} 頁 / 共 ${pages.length} 頁`; });
  return pages;
}

/* 預覽 */
let busy = false;
function preview() {
  if ($('#ov').hidden || busy) return;
  const G = groups();
  $('#exN').textContent = ROWS.length.toLocaleString();
  const box = $('#prevPage');
  if (!G.length) { box.innerHTML = '<div class="empty">目前沒有資料可匯出，請先調整篩選條件</div>'; $('#prevCap').textContent = ''; $('#xGo').disabled = true; return; }
  $('#xGo').disabled = false;
  const tmp = $('#prevRender'), pages = paginate(G[0], tmp);
  box.innerHTML = ''; box.appendChild(pages[0]); tmp.innerHTML = '';
  $('#prevCap').textContent = `預覽：第 1 份「${G[0].title}」第 1 頁（此份共 ${pages.length} 頁）｜全部共 ${G.length} 份`;
  fitPreview();
}
function fitPreview() {
  const p = $('#prevPage .page'); if (!p) return;
  const W = p.offsetWidth, H = p.offsetHeight, avail = $('.prevwrap').clientWidth - 40;
  const s = Math.min(1, avail / W);
  const sc = $('#prevScale'); sc.style.transform = `scale(${s})`; sc.style.width = W + 'px'; sc.style.height = H + 'px';
  sc.style.marginBottom = (H * s - H) + 'px'; sc.style.marginLeft = sc.style.marginRight = (W * s - W) / 2 + 'px';
}

/* 下載工具 */
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const safe = s => s.replace(/[\\/:*?"<>|\u0000]/g, '_').slice(0, 80);
function uniq() { const used = new Map(); return n => { const c = used.get(n) || 0; used.set(n, c + 1); return c ? n.replace(/(\.\w+)$/, `(${c + 1})$1`) : n; }; }
function progress(done, total, txt) {
  $('#prog').hidden = false; $('#progBar').style.width = (total ? done / total * 100 : 0) + '%'; $('#progTxt').textContent = txt || `${done} / ${total}`;
}
const tick = () => new Promise(r => setTimeout(r, 0));
async function snap(page) {
  return html2canvas(page, { scale: 2, backgroundColor: '#fff', logging: false, useCORS: true });
}

$('#xGo').onclick = async () => {
  const G = groups(); if (!G.length) return;
  const btn = $('#xGo'); btn.disabled = true; busy = true;
  $$('.opts button, .opts input, .opts select').forEach(e => { e.dataset.dis = e.disabled ? 1 : ''; e.disabled = true; });
  try {
    await document.fonts.ready;
    if (X.fmt === 'print') return doPrint(G);
    if (X.fmt === 'xlsx') return doXlsx(G);
    if (X.fmt === 'pdf') return await doPdf(G);
    if (X.fmt === 'png') return await doPng(G);
  } catch (e) { console.error(e); alert('匯出失敗：' + e.message); }
  finally {
    busy = false; $$('.opts button, .opts input, .opts select').forEach(e => { e.disabled = !!e.dataset.dis; });
    btn.disabled = false; $('#prog').hidden = true; $('#render').innerHTML = '';
  }
};
const stamp = () => today().replace(/\//g, '');
const single = G => G.length === 1;
const baseName = G => single(G) ? G[0].file : `聯絡名冊_${{ all: '全部', school: '各校', class: '各班' }[X.split]}`;

async function doPdf(G) {
  const { jsPDF } = window.jspdf;
  const ori = X.ori === 'l' ? 'l' : 'p', [w, h] = ori === 'l' ? [297, 210] : [210, 297];
  const zip = !single(G) && X.pack === 'zip' ? new JSZip() : null, un = uniq();
  let doc = null, done = 0;
  for (const g of G) {
    if (!doc || zip) doc = new jsPDF({ orientation: ori, unit: 'mm', format: 'a4', compress: true });
    else doc.addPage('a4', ori);
    const pages = paginate(g);
    for (let i = 0; i < pages.length; i++) {
      if (i) doc.addPage('a4', ori);
      const c = await snap(pages[i]);
      doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h, undefined, 'FAST');
      progress(++done, null, `第 ${G.indexOf(g) + 1}/${G.length} 份，第 ${i + 1} 頁`);
      $('#progBar').style.width = ((G.indexOf(g) + (i + 1) / pages.length) / G.length * 100) + '%';
      await tick();
    }
    if (zip) zip.file(un(safe(g.file) + '.pdf'), doc.output('blob'));
  }
  if (zip) saveBlob(await zip.generateAsync({ type: 'blob' }), `${baseName(G)}_${stamp()}.zip`);
  else saveBlob(doc.output('blob'), `${safe(baseName(G))}_${stamp()}.pdf`);
}

async function doPng(G) {
  const files = [], un = uniq();
  for (const [gi, g] of G.entries()) {
    const pages = paginate(g);
    for (let i = 0; i < pages.length; i++) {
      const c = await snap(pages[i]);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      files.push([un(safe(g.file) + (pages.length > 1 ? `_第${i + 1}頁` : '') + '.png'), blob]);
      progress(0, 0, `第 ${gi + 1}/${G.length} 份，第 ${i + 1} 頁`);
      $('#progBar').style.width = ((gi + (i + 1) / pages.length) / G.length * 100) + '%';
      await tick();
    }
  }
  if (files.length === 1) return saveBlob(files[0][1], files[0][0]);
  const zip = new JSZip(); files.forEach(([n, b]) => zip.file(n, b));
  saveBlob(await zip.generateAsync({ type: 'blob' }), `${safe(baseName(G))}_${stamp()}.zip`);
}

function sheetOf(g) {
  const cols = X.cols.filter(c => c[1]).map(c => c[0]);
  const aoa = [[g.title], cols.map(k => XCOLS[k].t), ...g.rows.map(r => cols.map(k => k === 'phone' ? phoneText(r) : XCOLS[k].v(r)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map(k => ({ wch: { school: 14, cls: 10, seat: 5, name: 9, phone: 26, gu: 9, sid: 9, sex: 5, bd: 11, addr: 36 }[k] || 10 }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, cols.length - 1) } }];
  return ws;
}
function doXlsx(G) {
  const sheetName = (() => { const used = new Set(); return n => { let b = n.replace(/[\[\]:*?/\\]/g, '_').slice(0, 28) || '名冊', s = b, i = 2; while (used.has(s)) s = `${b}(${i++})`; used.add(s); return s; }; })();
  if (single(G) || X.pack === 'merge') {
    const wb = XLSX.utils.book_new();
    G.forEach(g => XLSX.utils.book_append_sheet(wb, sheetOf(g), sheetName(single(G) ? '名冊' : g.file)));
    XLSX.writeFile(wb, `${safe(baseName(G))}_${stamp()}.xlsx`);
  } else {
    const zip = new JSZip(), un = uniq();
    G.forEach(g => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheetOf(g), '名冊'); zip.file(un(safe(g.file) + '.xlsx'), XLSX.write(wb, { type: 'array', bookType: 'xlsx' })); });
    zip.generateAsync({ type: 'blob' }).then(b => saveBlob(b, `${safe(baseName(G))}_${stamp()}.zip`));
  }
}

function doPrint(G) {
  const area = $('#printArea'); area.innerHTML = '';
  G.forEach(g => paginate(g).forEach(p => area.appendChild(p)));
  let st = $('#pageRule'); if (!st) { st = document.createElement('style'); st.id = 'pageRule'; document.head.appendChild(st); }
  st.textContent = `@page{size:A4 ${X.ori === 'l' ? 'landscape' : 'portrait'};margin:0}@media print{.printArea .page{width:${X.ori === 'l' ? '297mm' : '210mm'};height:${X.ori === 'l' ? '209.5mm' : '296.5mm'}}}`;
  setTimeout(() => { window.print(); setTimeout(() => { area.innerHTML = ''; }, 500); }, 50);
}
