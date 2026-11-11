'use strict';
/* ---------- 閱讀：展間的自動翻頁與手勢、看過的底片、大廳的傘、今日底片、年表連播 ---------- */
(function () {
  const A = window.__A, K = A.K, { $, el, Case, CH, chOf, pad, toast, Plates } = A;
  const rd = () => K.bag('rd', { seen: {}, umb: 0 });
  const st = () => K.bag('st', { n: 0, best: 0, day: '', night: 0 });
  const cueSec = t => K.clamp(2.6 + String(t || '').length * 0.17, 4.5, 12);
  const plates = c => c.shots.filter(s => s.cues && s.cues.length);
  const seenN = id => { let m = rd().seen[id] | 0, n = 0; while (m) { n += m & 1; m >>>= 1; } return n; };

  /* 來訪：連續天數 */
  A.on('ready', () => {
    const s = st(), today = K.day(), y = new Date(); y.setDate(y.getDate() - 1);
    if (s.day !== today) { s.n = s.day === K.day(y) ? s.n + 1 : 1; s.best = Math.max(s.best, s.n); s.day = today; Case.save(); }
    const h = new Date().getHours(); if (h < 4 && !s.night) { s.night = 1; Case.save(); }
  });

  /* ---- 展間 ---- */
  let auto = null;   // {id, t0, dur, raf, btn, bar}
  function autoStop() { if (!auto) return; cancelAnimationFrame(auto.raf); if (auto.btn) { auto.btn.setAttribute('aria-pressed', 'false'); auto.btn.textContent = '自動翻頁'; } if (auto.bar) auto.bar.style.transform = 'scaleX(0)'; auto = null; }
  function autoArm(shot) {
    if (!auto) return;
    auto.t0 = performance.now(); auto.dur = (shot.cues || []).reduce((n, t) => n + cueSec(t), 0) * 1000;
    cancelAnimationFrame(auto.raf);
    const step = now => {
      if (!auto) return;
      if (document.hidden) { auto.t0 += 16; auto.raf = requestAnimationFrame(step); return; }
      const p = (now - auto.t0) / auto.dur; auto.bar.style.transform = 'scaleX(' + K.clamp(p, 0, 1) + ')';
      if (p >= 1) { const r = A.room; if (!r || r.at >= r.n - 1) { autoStop(); toast('這一章的底片放完了'); return; } r.go(1); return; }
      auto.raf = requestAnimationFrame(step);
    };
    auto.raf = requestAnimationFrame(step);
  }
  A.on('viewer', ({ id, fig, cv, vctl, room }) => {
    autoStop();
    const bar = K.h('i.autobar', { 'aria-hidden': 'true' }); fig.append(bar);
    const row = K.h('div.vtools');
    const ab = K.h('button.tiny', { type: 'button', text: '自動翻頁', 'aria-pressed': 'false', 'aria-keyshortcuts': 'A' });
    ab.onclick = () => { if (auto) { autoStop(); return; } auto = { id, btn: ab, bar, raf: 0 }; ab.setAttribute('aria-pressed', 'true'); ab.textContent = '停止自動翻頁'; autoArm(A.room ? plates(chOf(id))[A.room.at] : {}); };
    const fb = K.h('a.tiny', { href: '#film/' + id, text: '放映這一章' });
    const lb = K.h('button.tiny', { type: 'button', text: '複製這張的連結' });
    lb.onclick = () => A.copyText(location.href.split('#')[0] + '#' + id + '/' + (A.room.at + 1));
    row.append(ab, fb, lb); vctl.after(row);
    /* 點底片的左右兩側翻頁；手機左右滑 */
    fig.classList.add('tap');
    cv.addEventListener('click', e => { const r = cv.getBoundingClientRect(); room.go((e.clientX - r.left) / r.width < 0.34 ? -1 : 1); });
    K.swipe(fig, d => room.go(d));
  });
  A.on('plate', ({ id, at, shot, shots }) => {
    const s = rd().seen, before = s[id] | 0; s[id] = before | (1 << at);
    if (s[id] !== before) Case.save();
    if (A.Snd) A.Snd.cue('page');
    if (shot.storm && !K.rm()) A.veil(true);
    if (auto) autoArm(shot);
    const rec = document.querySelector('#ch-room .record');
    if (rec) rec.classList.toggle('nudge', seenN(id) >= shots.length && !Case.d.read[id]);
  });
  A.on('leave', autoStop);
  K.key((e, typing) => !typing && (e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey && /^c\d+$/.test(A.cur), () => { const b = document.querySelector('#ch-room .vtools button'); if (b) b.click(); });

  /* 章節卡片：看過幾張 */
  A.on('looks', root => root.querySelectorAll('.look[data-id]').forEach(a => {
    const c = chOf(a.dataset.id); if (!c) return;
    const n = seenN(c.id), all = plates(c).length; let p = a.querySelector('.prog');
    if (!n) { if (p) p.remove(); return; }
    if (!p) { p = K.h('span.prog', K.h('i')); a.querySelector('.ph').append(p); }
    p.firstChild.style.width = Math.round(n / all * 100) + '%'; p.title = '看過 ' + n + ' ／ ' + all + ' 張底片';
  }));

  /* ---- 大廳：傘 ----
     疊在主視覺上的一層畫布。游標（或手指）所在的地方撐開一把傘，傘下的雨停了。 */
  const umb = { on: false, x: 0, y: 0, tx: 0, ty: 0, a: 0, last: 0, raf: 0, drops: [] };
  function umbStart() {
    const hero = document.querySelector('.hero2'), fx = $('hero-fx'); if (!hero || !fx || K.rm() || umb.on) return;
    umb.on = true;
    const c = fx.getContext('2d');
    for (let i = 0; i < 70; i++) umb.drops.push({ x: Math.random(), y: Math.random(), v: 0.35 + Math.random() * 0.5, l: 0.02 + Math.random() * 0.05 });
    const move = (x, y) => { const r = fx.getBoundingClientRect(); umb.tx = x - r.left; umb.ty = y - r.top; if (!umb.a) { umb.x = umb.tx; umb.y = umb.ty; } umb.last = performance.now(); if (!rd().umb) { rd().umb = 1; Case.save(); } const h = $('hero-hint'); if (h) h.hidden = true; };
    hero.addEventListener('pointermove', e => move(e.clientX, e.clientY));
    hero.addEventListener('pointerdown', e => move(e.clientX, e.clientY));
    const hint = $('hero-hint'); if (hint && !rd().umb) hint.hidden = false;
    let prev = performance.now();
    const tick = now => {
      umb.raf = requestAnimationFrame(tick);
      if (A.cur !== 'hall' || document.hidden) { prev = now; return; }
      const r = fx.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) { prev = now; return; }
      const d = Math.min(devicePixelRatio || 1, 1.5), W = Math.round(r.width * d), H = Math.round(r.height * d);
      if (fx.width !== W || fx.height !== H) { fx.width = W; fx.height = H; }
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      const idle = now - umb.last > 2600; umb.a += ((idle ? 0 : 1) - umb.a) * Math.min(1, dt * (idle ? 1.6 : 6));
      umb.x += (umb.tx - umb.x) * Math.min(1, dt * 9); umb.y += (umb.ty - umb.y) * Math.min(1, dt * 9);
      c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, r.width, r.height);
      if (umb.a < 0.01) return;
      const R = K.clamp(r.width * 0.085, 54, 120), ux = umb.x, uy = umb.y - R * 0.55;
      /* 傘下：把底下的雨壓暗 */
      const g = c.createRadialGradient(ux, uy + R * 0.7, R * 0.1, ux, uy + R * 0.7, R * 1.5);
      g.addColorStop(0, 'rgba(4,6,8,' + (0.72 * umb.a) + ')'); g.addColorStop(1, 'rgba(4,6,8,0)');
      c.fillStyle = g; c.fillRect(ux - R * 1.6, uy - R * 0.4, R * 3.2, r.height);
      /* 從下面升上來的雨，碰到傘緣就散開 */
      c.lineCap = 'round';
      umb.drops.forEach(p => {
        p.y -= p.v * dt; if (p.y < -0.1) { p.y = 1.05; p.x = Math.random(); }
        const x = p.x * r.width, y = p.y * r.height, dx = x - ux, under = Math.abs(dx) < R && y > uy && y < uy + R * 2.6;
        if (under) { const k = dx >= 0 ? 1 : -1; p.x += k * dt * 0.09; return; }
        const near = Math.abs(dx) < R * 2.2 ? 1 : 0.35;
        c.strokeStyle = 'rgba(191,230,238,' + (0.3 * near * umb.a) + ')'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - p.l * r.height); c.stroke();
      });
      /* 傘：一道弧、傘骨、傘柄 */
      c.strokeStyle = 'rgba(243,241,234,' + (0.9 * umb.a) + ')'; c.lineWidth = 1.25;
      c.beginPath(); c.arc(ux, uy + R * 0.05, R, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
      c.beginPath(); for (let i = 0; i <= 4; i++) { const a0 = Math.PI * (1.08 + 0.84 * i / 4), px = ux + Math.cos(a0) * R, py = uy + R * 0.05 + Math.sin(a0) * R; if (i < 4) { const a1 = Math.PI * (1.08 + 0.84 * (i + 1) / 4), qx = ux + Math.cos(a1) * R, qy = uy + R * 0.05 + Math.sin(a1) * R; c.moveTo(px, py); c.quadraticCurveTo((px + qx) / 2, Math.min(py, qy) + R * 0.16, qx, qy); } } c.stroke();
      c.beginPath(); c.moveTo(ux, uy - R * 0.95); c.lineTo(ux, uy + R * 0.86); c.arc(ux - R * 0.1, uy + R * 0.86, R * 0.1, 0, Math.PI); c.stroke();
      c.fillStyle = 'rgba(243,241,234,' + (0.9 * umb.a) + ')'; c.beginPath(); c.arc(ux, uy - R * 0.95, 1.6, 0, 6.3); c.fill();
    };
    umb.raf = requestAnimationFrame(tick);
  }

  /* ---- 大廳：今日底片 ---- */
  function todayPaint() {
    const box = $('today'); if (!box) return;
    const all = []; CH.forEach(c => plates(c).forEach((s, i) => all.push([c, s, i])));
    const now = new Date(), key = K.day(now), pick = all[A.hashStr('nyjn|' + key) % all.length], c = pick[0], s = pick[1], i = pick[2], v = st();
    box.textContent = ''; box.hidden = false;
    const cv = el('canvas'); cv.width = 560; cv.height = 350; cv.setAttribute('aria-hidden', 'true');
    const a = K.h('a.today-ph', { href: '#' + c.id + '/' + (i + 1), 'aria-label': '今日底片：' + c.no + ' ' + c.zh }, cv);
    const tx = K.h('div.today-tx',
      K.h('span.kick', { text: "Today's Plate — 今日底片　" + now.getFullYear() + '.' + (now.getMonth() + 1) + '.' + now.getDate() }),
      K.h('p.tq', { text: s.cues[0] }),
      K.h('span.src', { text: c.no + '〈' + c.zh + '〉PL.' + pad(i + 1) + ([s.loc, s.date].filter(Boolean).length ? '　' + [s.loc, s.date].filter(Boolean).join(' · ') : '') }),
      K.h('div.today-ft', K.h('a.more', { href: '#' + c.id + '/' + (i + 1), text: '看這張底片' }), K.h('span.lab', { text: '第 ' + Case.d.visits + ' 天來訪' + (v.n > 1 ? '　連續 ' + v.n + ' 天' : '') })));
    box.append(a, tx); Plates.mount(cv, s);
  }

  /* ---- 大廳：放映廳的橫幅 ---- */
  function bandPaint() {
    const cv = $('filmband-cv'); if (!cv) return;
    const fm = K.bag('fm', { pos: 0, fin: 0, done: {} }), info = A.Cinema ? A.Cinema.where(fm.pos) : null;
    Plates.mount(cv, info && info.shot ? info.shot : { p: 'broadcast', a: {}, cues: [] }, 14);
    const go = $('filmband-go'), stl = $('filmband-st');
    if (info && fm.pos > 0 && info.label) { go.textContent = '繼續放映'; stl.textContent = '上次停在　' + info.label; } else { go.textContent = '開始放映'; stl.textContent = A.Cinema ? '全長約 ' + Math.round(A.Cinema.total / 60) + ' 分鐘' : ''; }
  }

  /* ---- 大廳：各段捲到才浮現 ---- */
  function revealStart() {
    if (K.rm() || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    document.querySelectorAll('#r-hall .sect, #r-hall .split, #r-hall .filmband, #r-hall .band').forEach(n => { if (n.getBoundingClientRect().top > innerHeight * 0.9) { n.classList.add('rv'); io.observe(n); } });
  }

  let hallOnce = false;
  A.on('hall', () => { todayPaint(); bandPaint(); if (!hallOnce) { hallOnce = true; umbStart(); revealStart(); } });

  /* ---- 年表：連播、拖曳、方向鍵 ---- */
  let chronT = 0, chronBuilt = false;
  function chronStop() { clearInterval(chronT); chronT = 0; const b = $('chron-play'); if (b) { b.textContent = '依序播放十一場雨'; b.setAttribute('aria-pressed', 'false'); } }
  A.on('chronicle', () => {
    if (chronBuilt) return; chronBuilt = true;
    const b = K.h('button.btn.sm', { id: 'chron-play', type: 'button', text: '依序播放十一場雨', 'aria-pressed': 'false' });
    b.onclick = () => {
      if (chronT) { chronStop(); return; }
      if (Case.d.era >= SD.length - 1) A.setEra(0);
      b.textContent = '停止播放'; b.setAttribute('aria-pressed', 'true');
      chronT = setInterval(() => { if (A.cur !== 'chronicle' || Case.d.era >= SD.length - 1) { chronStop(); return; } A.setEra(Case.d.era + 1); A.veil(true); }, 3400);
    };
    const tools = K.h('div.chron-tools', b, K.h('span.hint', { text: '在圖上按住拖曳，或用 ← → 鍵，可以一場一場看。' }));
    document.querySelector('#r-chronicle .chart-legend').after(tools, K.h('div.census', { id: 'storm-census', hidden: true }));
    const svg = $('chart'); let drag = false;
    const at = e => { const g = document.elementFromPoint(e.clientX, e.clientY); const s = g && g.closest && g.closest('.st'); if (s) A.setEra(+s.dataset.i); };
    svg.addEventListener('pointerdown', e => { drag = true; chronStop(); at(e); });
    svg.addEventListener('pointermove', e => { if (drag && (e.buttons || e.pointerType === 'touch')) at(e); });
    window.addEventListener('pointerup', () => { drag = false; });
  });
  A.on('leave', n => { if (n === 'chronicle') chronStop(); });
  K.key((e, typing) => !typing && A.cur === 'chronicle' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'), e => { chronStop(); A.setEra(Case.d.era + (e.key === 'ArrowRight' ? 1 : -1)); });

  A.Reader = { seenN, plates, cueSec, streak: () => st(), seenAll: () => CH.every(c => seenN(c.id) >= plates(c).length), seenTotal: () => CH.reduce((n, c) => n + seenN(c.id), 0), plateTotal: () => CH.reduce((n, c) => n + plates(c).length, 0), umb: () => !!rd().umb, bandPaint };
})();
