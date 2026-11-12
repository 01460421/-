'use strict';
/* ---------- 館內設定：外觀、字級、動態、聲音 ---------- */
(function () {
  const A = window.__A, K = A.K, { $, Case, toast } = A;
  const DEF = { theme: 'auto', size: 'm', motion: 'auto', snd: false, mus: true, vol: 0.5, voice: false, sub: true, rate: 1 };
  const S = { get v() { return K.bag('set', DEF); } };

  function apply() {
    const s = S.v, r = document.documentElement;
    if (s.theme === 'light' || s.theme === 'dark') r.dataset.theme = s.theme; else delete r.dataset.theme;
    if (s.size === 'l') r.dataset.size = 'l'; else delete r.dataset.size;
    const b = $('b-snd');
    if (b) { b.setAttribute('aria-pressed', s.snd ? 'true' : 'false'); $('snd-st').textContent = s.snd ? '開' : '關'; }
  }
  function set(k, v) { S.v[k] = v; Case.save(); apply(); A.emit('setting', { k, v }); }

  function seg(label, key, opts, after) {
    const row = K.h('div.set-row'), tabs = K.h('div.tabs', { role: 'group', 'aria-label': label });
    opts.forEach(o => {
      const b = K.h('button', { type: 'button', text: o[1], 'aria-pressed': S.v[key] === o[0] ? 'true' : 'false' });
      b.onclick = () => { set(key, o[0]); tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); if (after) after(o[0]); };
      tabs.append(b);
    });
    row.append(K.h('span.lab', { text: label }), tabs);
    return row;
  }

  function open() {
    K.dialog({
      title: '館內設定', cls: 'dlg-set', build(body) {
        body.append(
          seg('外觀', 'theme', [['auto', '跟隨系統'], ['light', '白晝'], ['dark', '暗房']]),
          seg('字級', 'size', [['m', '標準'], ['l', '放大']]),
          seg('動態', 'motion', [['auto', '跟隨系統'], ['less', '減少']], () => { Case.flush(); toast('重新整理後生效'); }),
          seg('雨聲', 'snd', [[false, '關'], [true, '開']]),
          seg('配樂', 'mus', [[true, '開'], [false, '關']])
        );
        const vol = K.h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(S.v.vol * 100)), 'aria-label': '音量' });
        vol.oninput = () => set('vol', K.clamp(+vol.value / 100, 0, 1));
        body.append(K.h('div.set-row', K.h('span.lab', { text: '音量' }), vol));
        body.append(K.h('p.hint', { text: '雨聲是程式即時合成的。配樂只在放映廳響，是原版紀錄片的音軌，開始放映時才會下載（約 19 MB）。設定存在這台裝置的手提箱裡。' }));
        const keys = K.h('button.tiny', { type: 'button', text: '鍵盤快捷鍵' }); keys.onclick = shortcuts;
        body.append(keys);
      }
    });
  }

  const KEYS = [
    ['/　或　Ctrl／⌘ + K', '搜尋全館'],
    ['?', '這張快捷鍵表'],
    ['←　→', '展間：上一張／下一張底片'],
    ['A', '展間：自動翻頁'],
    ['空白鍵', '放映廳：播放／暫停'],
    ['←　→', '放映廳：上一句／下一句'],
    ['[　]', '放映廳：上一段／下一段'],
    ['F', '放映廳：全螢幕'],
    ['M', '雨聲開關'],
    ['B', '放映廳：配樂開關'],
    ['G', '值勤台'],
    ['空白鍵', '親歷：下一句'],
    ['L', '親歷：回想'],
    ['1 – 4', '入館考核：選答案'],
    ['Esc', '關閉視窗']
  ];
  function shortcuts() {
    K.dialog({
      title: '鍵盤快捷鍵', cls: 'dlg-set', build(body) {
        const dl = K.h('dl.keys');
        KEYS.forEach(k => dl.append(K.h('dt', { text: k[0] }), K.h('dd', { text: k[1] })));
        body.append(dl);
      }
    });
  }

  A.on('ready', () => {
    apply();
    ['b-set', 'toc-set', 'foot-set'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', () => { $('toc').hidden = true; open(); }); });
    const fk = $('foot-keys'); if (fk) fk.addEventListener('click', shortcuts);
    $('b-snd').addEventListener('click', () => set('snd', !S.v.snd));
  });
  A.on('import', apply);
  A.on('wipe', ({ keep, old }) => { if (old.x && old.x.set) keep.x.set = old.x.set; });
  K.key((e, typing) => !typing && e.key === '?' && !e.ctrlKey && !e.metaKey, e => { e.preventDefault(); shortcuts(); });
  K.key((e, typing) => !typing && (e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey, () => set('snd', !S.v.snd));

  A.Settings = { get: () => S.v, set, open, shortcuts };
})();
