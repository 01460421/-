'use strict';
/* ---------- 遊藝室：收進手提箱 ----------
   雨往上落，東西也跟著從底下飄上來。手提箱掛在上面那條線上，接住留得住的，避開症候。
   場上的位置都用 0–1 的比例記，速度用「每秒幾個畫面高」算：畫布換大小（轉手機、拉視窗）時東西不會跑掉，
   難度也不跟著螢幕大小變。 */
(function () {
  const A = window.__A, K = A.K, PI = Math.PI, rnd = Math.random, mix = (a, b, p) => a + (b - a) * p;
  /* TARGET 是「淨得幾個算滿分」。用模擬的玩家試出來的：仔細玩的淨得 40 上下，隨手玩的 25 上下。 */
  const SEC = 45, TARGET = 44, LINE = .2, STUN = .5, VMAX = 2.4, VKEY = 1.3;

  /* 留得住的東西：畫在 ±1 的方格裡，亮色實心，bg 拿來挖洞 */
  const GOOD = [
    (c, bg) => { c.beginPath(); c.moveTo(-.72, -1); c.lineTo(.26, -1); c.lineTo(.72, -.54); c.lineTo(.72, 1); c.lineTo(-.72, 1); c.fill(); c.fillStyle = bg; [-.3, .1, .5].forEach(y => c.fillRect(-.42, y, .84, .14)); },                         // 紙
    c => { c.lineWidth = .28; c.beginPath(); c.arc(0, -.56, .36, 0, PI * 2); c.moveTo(0, -.2); c.lineTo(0, 1); c.moveTo(0, .5); c.lineTo(.46, .5); c.moveTo(0, .86); c.lineTo(.46, .86); c.stroke(); },                                    // 鑰匙
    (c, bg) => { c.fillRect(-1, -.74, 2, 1.48); c.fillStyle = bg; c.fillRect(-.62, -.36, 1.24, .72); for (let i = 0; i < 4; i++) { c.fillRect(-.8 + i * .46, -.64, .22, .15); c.fillRect(-.8 + i * .46, .49, .22, .15); } },                // 底片格
    c => { c.beginPath(); c.arc(0, -.05, .98, PI, 0); c.quadraticCurveTo(.65, -.36, .33, -.05); c.quadraticCurveTo(0, -.36, -.33, -.05); c.quadraticCurveTo(-.65, -.36, -.98, -.05); c.fill(); c.lineWidth = .15; c.beginPath(); c.moveTo(0, -.2); c.lineTo(0, .78); c.arc(.2, .78, .2, PI, 0, true); c.stroke(); }   // 傘
  ];

  function mount(root, api) {
    const cv = K.h('canvas', { role: 'img', 'aria-label': '遊戲畫面：手提箱在上方的線上，東西從底下往上飄。' }), c = cv.getContext('2d'), field = K.h('div.ct-field.plate', cv);
    const tEl = K.h('dd', { text: String(SEC) }), nEl = K.h('dd', { text: '0' }), xEl = K.h('dd', { text: '0' }), bar = K.h('i');
    root.append(K.h('dl.ct-hud', K.h('div', K.h('dt', { text: '剩下幾秒' }), tEl), K.h('div', { 'aria-live': 'polite', 'aria-atomic': 'true' }, K.h('dt', { text: '收進' }), nEl), K.h('div', K.h('dt', { text: '症候' }), xEl)),
      K.h('div.ct-time', bar), field, K.h('p.ct-tip', { text: '滑鼠或手指左右移動，也可以按 ← →。' }));

    const S = { t: 0, x: .5, to: .5, got: 0, hit: 0, miss: 0, stun: 0, next: .5, items: [], pops: [] }, held = {};
    const rain = Array.from({ length: 44 }, () => [rnd(), rnd() * 1.2, .2 + rnd() * .5]);
    let W = 0, H = 0, r = 16, hw = 40, col = {}, raf = 0, last = 0, dir = 0, over = false, shown = SEC;

    /* 顏色從樣式表讀，不寫死在這裡；每秒重讀一次，玩到一半換主題也跟得上 */
    const tint = () => { const s = getComputedStyle(cv), v = n => s.getPropertyValue(n).trim(); col = { on: v('--on'), mark: v('--mark'), bg: v('--plate') }; };
    function size() {
      const d = Math.min(2, window.devicePixelRatio || 1), w = field.clientWidth, h = field.clientHeight; if (!w || !h) return;
      W = w; H = h; cv.width = Math.round(W * d); cv.height = Math.round(H * d); c.setTransform(d, 0, 0, d, 0, 0);
      r = K.clamp(Math.min(W, H) * .042, 13, 26); hw = Math.max(34, W * .07); tint(); draw();
    }

    function spawn() {
      const p = S.t / SEC, m = hw / W, bad = rnd() < mix(.16, .34, p);
      S.items.push({ x: mix(m, 1 - m, rnd()), y: 1 + 2 * r / H, v: mix(.3, .6, p) * (.85 + rnd() * .3), bad, k: Math.floor(rnd() * GOOD.length), a: (rnd() - .5) * .5, w: (rnd() - .5) * 3,
        j: bad ? Array.from({ length: 14 }, (_, i) => i % 2 ? .36 + rnd() * .2 : .85 + rnd() * .35) : null });
      S.next = S.t + mix(.9, .42, p) * (.8 + rnd() * .4);
    }
    function take(o) {
      if (o.bad) { S.hit++; S.stun = STUN; xEl.textContent = S.hit; } else { S.got++; nEl.textContent = S.got; }
      S.pops.push({ x: o.x, s: o.bad ? '−2' : '+1', t: S.t }); api.sfx(o.bad ? 'wrong' : 'right');
    }
    function step(dt) {
      S.t += dt; const m = hw / W, band = r / H;
      if (dir) S.to = S.x + dir * VKEY * dt;
      S.to = K.clamp(S.to, m, 1 - m);
      if (S.stun > 0) S.stun -= dt; else S.x += K.clamp(S.to - S.x, -VMAX * dt, VMAX * dt);   // 手提箱有最高速度：滑鼠、手指、鍵盤才比得起來
      if (S.t >= S.next) spawn();
      S.items = S.items.filter(o => {
        o.y -= o.v * dt;
        if (!o.past && o.y <= LINE) {
          /* 箱口往上一個半徑都算數，掉幀時東西不會直接穿過去。好東西放寬一點，症候要真的進到箱子裡才算。 */
          if (Math.abs(o.x - S.x) * W <= hw + (o.bad ? -.3 : .4) * r) { take(o); return false; }
          if (o.y < LINE - band) o.past = true;
        }
        if (o.y > -2 * r / H) return true;
        if (!o.bad) S.miss++; return false;
      });
      S.pops = S.pops.filter(q => S.t - q.t < .7);
      const left = Math.max(0, Math.ceil(SEC - S.t));
      if (left !== shown) { shown = left; tEl.textContent = left; bar.style.width = left / SEC * 100 + '%'; tint(); }
      if (S.t >= SEC) { over = true; const net = Math.max(0, S.got - 2 * S.hit); api.finish({ score: K.clamp(Math.round(100 * net / TARGET), 0, 100), detail: [['收進手提箱', S.got], ['碰到症候', S.hit], ['沒接到', S.miss]] }); }
    }

    function thing(o) {
      c.save(); c.translate(o.x * W, o.y * H); c.rotate(o.a + (o.bad && !api.rm ? S.t * o.w : 0)); c.scale(r, r); c.fillStyle = c.strokeStyle = col.on;
      if (!o.bad) GOOD[o.k](c, col.bg);
      else {   // 症候：帶刺、暗的，只有邊是亮的
        c.beginPath(); o.j.forEach((q, i) => c.lineTo(Math.cos(i * PI / 7) * q, Math.sin(i * PI / 7) * q)); c.closePath();
        c.fillStyle = col.bg; c.fill(); c.fillStyle = col.mark; c.globalAlpha = .5; c.fill(); c.globalAlpha = 1; c.lineWidth = 1.4 / r; c.stroke();
      }
      c.restore();
    }
    function draw() {
      const stun = S.stun > 0, py = LINE * H, px = S.x * W + (stun && !api.rm ? Math.sin(S.t * 70) * 5 * S.stun / STUN : 0), bh = hw * .62;
      c.globalAlpha = 1; c.fillStyle = col.bg; c.fillRect(0, 0, W, H);
      c.strokeStyle = c.fillStyle = col.on; c.lineWidth = 1; c.globalAlpha = .16; c.beginPath();
      rain.forEach(d => { const x = Math.round(d[0] * W) + .5, y = (1.1 - (d[1] + (api.rm ? 0 : S.t * d[2])) % 1.2) * H; c.moveTo(x, y); c.lineTo(x, y + 10 + d[2] * 28); });   // 往上落的雨；減少動態時停在原地
      c.stroke(); c.globalAlpha = .34; c.beginPath(); c.moveTo(0, Math.round(py) + .5); c.lineTo(W, Math.round(py) + .5); c.stroke();
      c.globalAlpha = 1; S.items.forEach(thing);
      /* 手提箱：箱口朝下，兩片蓋子往外翻。被症候碰到的那半秒畫淡，動不了。 */
      c.strokeStyle = c.fillStyle = col.on; c.globalAlpha = .12; c.fillRect(px - hw, py - bh, hw * 2, bh);
      c.globalAlpha = stun ? .45 : 1; c.lineWidth = 2; c.beginPath();
      c.moveTo(px - hw - bh * .34, py + bh * .26); c.lineTo(px - hw, py); c.lineTo(px - hw, py - bh); c.lineTo(px + hw, py - bh); c.lineTo(px + hw, py); c.lineTo(px + hw + bh * .34, py + bh * .26);
      c.moveTo(px - hw * .3, py - bh); c.lineTo(px - hw * .3, py - bh - hw * .2); c.lineTo(px + hw * .3, py - bh - hw * .2); c.lineTo(px + hw * .3, py - bh);
      c.moveTo(px - hw * .58, py - bh); c.lineTo(px - hw * .58, py); c.moveTo(px + hw * .58, py - bh); c.lineTo(px + hw * .58, py); c.stroke();
      c.font = '600 ' + Math.round(r * 1.15) + 'px ' + K.fonts.lat; c.textAlign = 'center';
      S.pops.forEach(q => { const g = (S.t - q.t) / .7; c.globalAlpha = 1 - g; c.fillText(q.s, q.x * W, py - bh - hw * .2 - 8 - (api.rm ? 0 : g * 16)); });
      c.globalAlpha = 1;
    }
    function frame(now) {
      raf = 0; if (!last) last = now;
      const dt = K.dialogOpen() ? 0 : Math.min(.05, (now - last) / 1000); last = now;   // 開著設定之類的對話框時，場上先停住
      if (W) step(dt); if (over) return;
      draw(); raf = requestAnimationFrame(frame);
    }

    const aim = e => { const b = cv.getBoundingClientRect(); if (b.width) S.to = (e.clientX - b.left) / b.width; };
    const key = e => {
      const d = /^(ArrowLeft|a|A)$/.test(e.key) ? -1 : /^(ArrowRight|d|D)$/.test(e.key) ? 1 : 0; if (!d) return;
      if (e.type === 'keyup') held[d] = 0;
      else if (!(e.ctrlKey || e.metaKey || e.altKey || K.typing(e) || K.dialogOpen())) { e.preventDefault(); held[d] = 1; }
      dir = (held[1] || 0) - (held[-1] || 0);
    };
    const calm = () => { held[1] = held[-1] = dir = 0; };   // 視窗失焦時收不到放開按鍵，不清掉會一直往旁邊跑
    const vis = () => { calm(); if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf && !over) { last = 0; raf = requestAnimationFrame(frame); } };
    /* 滑鼠聽整個視窗：玩到一半游標滑出畫布，手提箱還是跟得上 */
    const on = [[window, 'pointermove', aim], [cv, 'pointerdown', aim], [window, 'blur', calm], [document, 'keydown', key], [document, 'keyup', key], [document, 'visibilitychange', vis]];
    on.forEach(([t, n, f]) => t.addEventListener(n, f));
    const ro = new ResizeObserver(size); ro.observe(field);
    size(); root.peek = () => ({ t: S.t, x: S.x, half: hw / W, line: LINE, items: S.items });   // 給測試看場上的位置
    if (root.getBoundingClientRect().bottom > innerHeight) root.scrollIntoView({ block: 'start', behavior: 'instant' });   // 整塊畫布要一次看得到
    if (!document.hidden) raf = requestAnimationFrame(frame);
    return { stop() { over = true; cancelAnimationFrame(raf); raf = 0; ro.disconnect(); on.forEach(([t, n, f]) => t.removeEventListener(n, f)); } };
  }

  A.Arcade.add({
    id: 'catch', name: '收進手提箱', en: 'Into the Suitcase', desc: '雨往上落的四十五秒。把留得住的東西接進手提箱，避開症候。',
    how: ['東西從底下往上飄。左右移動上面的手提箱，把它們接住。', '紙、鑰匙、底片、傘：接到一個加 1。', '帶刺的暗影是症候：碰到一次扣 2，手提箱會停住半秒。', '滑鼠、手指拖曳，或鍵盤 ← →（A、D）。越到後面越快、越密。'],
    shot: { p: 'umbrella', a: {}, cues: [] }, mount
  });
})();
