'use strict';
/* ---------- 館內配樂：〈逆雨〉主題與八段變奏 ----------
   九段同一個主題，每個房間配一段。預設是關的；打開之後才下載，走到哪個房間就換成哪一段，中間淡出淡入。
   同一段在幾個房間之間走動不會重頭播；離開一段再回來，從剛才停下的地方接著。
   放映廳有自己的配樂，進去時這裡讓位。分頁被收到背景時停下，回來再接。 */
(function () {
  const A = window.__A, K = A.K, { $ } = A;
  const DIR = 'assets/audio/theme/', IN = 1.8, OUT = 1.1;
  const TRACKS = {
    theme: ['00-theme', '主題〈逆雨〉'], chronicle: ['01-chronicle', '變奏一〈年表〉'], gallery: ['02-gallery', '變奏二〈展間〉'],
    choice: ['03-choice', '變奏三〈抉擇〉'], storm: ['04-storm', '變奏四〈你的暴雨〉'], duty: ['05-duty', '變奏五〈值勤〉'],
    darkroom: ['06-darkroom', '變奏六〈暗房〉'], arcade: ['07-arcade', '變奏七〈遊藝室〉'], suitcase: ['08-suitcase', '變奏八〈手提箱〉']
  };
  const ROOM = {
    hall: 'theme', guide: 'theme', chronicle: 'chronicle', chapters: 'gallery', index: 'gallery', questions: 'gallery',
    choices: 'choice', story: 'choice', quiz: 'choice', rain: 'storm', play: 'duty', quests: 'duty', shop: 'duty', profile: 'duty',
    darkroom: 'darkroom', album: 'darkroom', arcade: 'arcade', case: 'suitcase', journal: 'suitcase', relay: 'suitcase', studio: 'suitcase'
  };
  const trackFor = name => name === 'film' ? null : /^c\d+$/.test(name || '') ? 'gallery' : (ROOM[name] || 'theme');

  const P = {};            // id → { el, g（現在的音量 0–1）, to（要去的音量） }
  let want = null, raf = 0, last = 0, blocked = false, room = '';
  const on = () => !!A.Settings.get().bgm;
  const master = () => K.clamp(+A.Settings.get().vol || 0, 0, 1);

  function player(id) {
    if (P[id]) return P[id];
    const el = new Audio(DIR + TRACKS[id][0] + '.m4a'); el.loop = true; el.preload = 'auto'; el.volume = 0;
    return (P[id] = { el, g: 0, to: 0 });
  }
  function target() { return on() && !document.hidden ? trackFor(room || A.cur) : null; }
  function sync() {
    want = target();
    Object.keys(P).forEach(id => { P[id].to = id === want ? 1 : 0; });
    if (want) {
      const p = player(want); p.to = 1;
      if (p.el.paused) p.el.play().then(() => { blocked = false; }).catch(() => { blocked = true; });   // 還沒有人碰過頁面時瀏覽器不讓播，等第一次點按再試
    }
    paint(); if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
  }
  function step(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now; let busy = false; const m = master();
    Object.keys(P).forEach(id => {
      const p = P[id];
      if (p.g !== p.to) { p.g = p.to > p.g ? Math.min(p.to, p.g + dt / IN) : Math.max(p.to, p.g - dt / OUT); busy = true; }
      const v = p.g * p.g * m;   // 平方：聽起來比較像等速的淡入淡出
      if (Math.abs(p.el.volume - v) > .001) p.el.volume = v;
      if (p.g === 0 && p.to === 0 && !p.el.paused) p.el.pause();   // 停在原地，回來時接著播
    });
    raf = busy ? requestAnimationFrame(step) : 0;
  }
  function paint() {
    const o = on(), name = want ? TRACKS[want][1] : (o && (room || A.cur) === 'film' ? '放映廳有自己的配樂' : '');
    [['b-mus', 'mus-st'], ['toc-mus', 'toc-mus-st']].forEach(([b, s]) => { const e = $(b); if (!e) return; e.setAttribute('aria-pressed', o ? 'true' : 'false'); e.title = '館內配樂' + (name ? '：' + name : ''); const t = $(s); if (t) t.textContent = o ? '開' : '關'; });
  }
  const toggle = () => A.Settings.set('bgm', !on());

  A.on('ready', () => {
    ['b-mus', 'toc-mus'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', toggle); });
    paint();
  });
  A.on('route', e => { room = (e && e.name) || A.cur; sync(); });
  A.on('setting', ({ k }) => { if (k === 'bgm') { sync(); if (on() && want) A.toast('館內配樂：' + TRACKS[want][1]); } else if (k === 'vol' && !raf) { last = performance.now(); raf = requestAnimationFrame(step); } });
  document.addEventListener('visibilitychange', sync);
  ['pointerdown', 'keydown'].forEach(n => document.addEventListener(n, () => { if (blocked && on()) sync(); }, true));
  K.key((e, typing) => !typing && (e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey, toggle);

  A.Music = { TRACKS, trackFor, toggle, state: () => ({ on: on(), room: room || A.cur, id: want, name: want ? TRACKS[want][1] : '', playing: Object.keys(P).filter(id => !P[id].el.paused), at: want && P[want] ? P[want].el.currentTime : 0, blocked }) };
})();
