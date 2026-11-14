// 產生 index.html 與兩個場景檔。雨線的座標在這裡用固定種子算好，直接寫進 HTML（HyperFrames 要求畫面只由時間軸決定）。
// 片頭的做法照 pixel2motion 的規矩：每一筆 pathLength=1、平頭虛線 1 1、照書寫方向畫；印章只誇張落下的那一拍，不擠壓。
// 時間與緩動：進場 expo/power4.out，在畫面上移動 power2.inOut，退場比進場短（HyperFrames motion.md、LottieFiles motion-design）。
const fs = require('fs');
const path = require('path');
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const drop = (x, y, r) => `M${x} ${(y + r * 1.9).toFixed(1)}C${(x - r * 1.15).toFixed(1)} ${(y + r * 0.5).toFixed(1)} ${(x - r).toFixed(1)} ${(y - r).toFixed(1)} ${x} ${(y - r).toFixed(1)}C${(x + r).toFixed(1)} ${(y - r).toFixed(1)} ${(x + r * 1.15).toFixed(1)} ${(y + r * 0.5).toFixed(1)} ${x} ${(y + r * 1.9).toFixed(1)}Z`;
function rain(pre, x0, x1, ground, maxLen, n, seed) {
  const R = rng(seed); let s = '';
  for (let k = 0; k < n; k++) {
    const x = +(x0 + (x1 - x0) * ((k + 0.15 + R() * 0.7) / n)).toFixed(1), len = Math.round(70 + Math.pow(R(), 1.7) * maxLen), r = +(3 + R() * 3.6).toFixed(1), w = +(1.2 + R() * 1.4).toFixed(1), top = ground - len;
    s += `<g id="${pre}g${k}"><path id="${pre}l${k}" class="${pre}line" data-len="${len}" d="M${x} ${ground}V${(top + r * 2.2).toFixed(1)}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" stroke-width="${w}"/><path id="${pre}d${k}" class="${pre}drop" d="${drop(x, top + r, r)}"/></g>`;
  }
  return s;
}
const FONTS = `
    @font-face { font-family: "NiYu"; src: url("assets/fonts/NiYu-film.woff2") format("woff2"); }
    @font-face { font-family: "Iansui"; src: url("assets/fonts/Iansui-film.woff2") format("woff2"); }
    @font-face { font-family: "IM Fell English"; font-style: italic; src: url("assets/fonts/IMFellEnglishital1.woff2") format("woff2"); }
    @font-face { font-family: "IM Fell English"; font-style: normal; src: url("assets/fonts/IMFellEnglish.woff2") format("woff2"); }
    @font-face { font-family: "Courier Prime"; src: url("assets/fonts/CourierPrime.woff2") format("woff2"); }`;
const stamp = id => `<svg id="${id}" viewBox="0 0 100 100" width="230" height="230" fill="#8ea6f0" style="overflow:visible">
        <defs><path id="${id}-ring" d="M50 50m-38.5 0a38.5 38.5 0 1 1 77 0a38.5 38.5 0 1 1 -77 0"/></defs>
        <circle cx="50" cy="50" r="47.5" fill="none" stroke="#8ea6f0" stroke-width="2"/><circle cx="50" cy="50" r="30.5" fill="none" stroke="#8ea6f0" stroke-width=".9"/>
        <text font-family="'Courier Prime','NiYu',monospace" font-size="8.4"><textPath href="#${id}-ring" textLength="236" lengthAdjust="spacing">NIYU ARCHIVE ＊ 逆雨檔案館 ＊ UNOFFICIAL ＊</textPath></text>
        <text x="50" y="47.5" text-anchor="middle" font-family="'IM Fell English',serif" font-size="21">1999</text>
        <path d="M27 53.5H73" stroke="#8ea6f0" stroke-width=".8"/>
        <text x="50" y="63.5" text-anchor="middle" font-family="'Courier Prime',monospace" font-size="8.2" letter-spacing="1.2">XII · 31</text></svg>`;

/* ── 片頭 ── */
const ident = `<template>
  <style>${FONTS}
    #root { position: absolute; inset: 0; background: #0b1415; overflow: hidden; }
    #id-bg { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }
    #id-vig { position: absolute; inset: 0; background: radial-gradient(ellipse 95% 90% at 50% 46%, rgba(6,10,10,0) 0%, rgba(6,10,10,.12) 40%, rgba(6,10,10,.42) 72%, rgba(6,10,10,.8) 100%); }
    #id-art { position: absolute; left: 0; top: 0; }
    .id-line { fill: none; stroke: #d6bd84; stroke-opacity: .6; stroke-linecap: butt; }
    .id-drop { fill: #d6bd84; }
    #id-title { position: absolute; left: 430px; top: 104px; }
    #id-title-w { writing-mode: vertical-rl; font-family: "NiYu", serif; font-size: 122px; line-height: 150px; letter-spacing: .12em; color: #e2cb96; white-space: nowrap; }
    #id-en { position: absolute; left: 300px; top: 838px; }
    #id-en-w { font-family: "IM Fell English", serif; font-style: italic; font-size: 60px; color: #d6bd84; white-space: nowrap; }
    #id-sub { position: absolute; left: 304px; top: 930px; }
    #id-sub-w { font-family: "Courier Prime", monospace; font-size: 28px; letter-spacing: .34em; color: #cdd6d2; white-space: nowrap; }
    #id-stamp { position: absolute; left: 1420px; top: 690px; width: 230px; height: 230px; }
    #id-paper { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
    #id-paper-img { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
  </style>
  <div id="root" data-composition-id="ident" data-width="1920" data-height="1080">
    <img id="id-bg" class="clip" data-start="0" data-duration="6" src="assets/cloth.jpg" alt="" style="z-index:1" />
    <div id="id-vig" class="clip" data-start="0" data-duration="6" style="z-index:2"></div>
    <svg id="id-art" class="clip" data-start="0" data-duration="6" width="1920" height="1080" viewBox="0 0 1920 1080" style="z-index:3" data-layout-allow-overlap>
      <g id="id-rain">${rain('id-', 760, 1640, 800, 560, 38, 1999)}</g>
      <path id="id-ground" d="M260 800H1660" fill="none" stroke="#d6bd84" stroke-width="2.2" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>
    </svg>
    <div id="id-title" class="clip" data-start="0" data-duration="6" style="z-index:4" data-layout-allow-overlap><div id="id-title-w">量雨的人</div></div>
    <div id="id-en" class="clip" data-start="0" data-duration="6" style="z-index:5"><div id="id-en-w">The One Who Measures the Rain</div></div>
    <div id="id-sub" class="clip" data-start="0" data-duration="6" style="z-index:6"><div id="id-sub-w">A REVERSE: 1999 FAN NOVEL　·　OMEGA</div></div>
    <div id="id-stamp" class="clip" data-start="0" data-duration="6" style="z-index:7" data-layout-allow-overlap>${stamp('id-pm')}</div>
    <div id="id-paper" class="clip" data-start="0" data-duration="6" style="z-index:8" data-layout-allow-overlap data-layout-allow-occlusion><img id="id-paper-img" src="assets/paper.jpg" alt="" /></div>
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo('#id-bg', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0);
      tl.fromTo('#id-ground', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut' }, 0.25);
      document.querySelectorAll('.id-line').forEach(function (el, i) {
        const len = +el.getAttribute('data-len'), t = 0.6 + i * 0.045, d = 0.45 + len / 700;
        tl.fromTo(el, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: d, ease: 'power3.out' }, t);
        tl.fromTo('#id-d' + i, { opacity: 0, scale: 0.5, transformOrigin: '50% 30%' }, { opacity: 1, scale: 1, duration: 0.2, ease: 'power4.out' }, t + d * 0.72);
      });
      tl.fromTo('#id-rain', { y: 0 }, { y: -16, duration: 3.4, ease: 'sine.inOut' }, 2.5);
      tl.fromTo('#id-title-w', { clipPath: 'inset(0% 0% 100% 0%)', opacity: 0.4 }, { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, duration: 1.3, ease: 'power2.inOut' }, 1.5);
      tl.fromTo('#id-en-w', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power4.out' }, 2.9);
      tl.fromTo('#id-sub-w', { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 3.3);
      tl.fromTo('#id-pm', { opacity: 0, scale: 1.55, rotation: -3, transformOrigin: '50% 50%' }, { opacity: 0.92, scale: 0.97, rotation: -9, duration: 0.15, ease: 'power3.in' }, 3.7);
      tl.to('#id-pm', { scale: 1.02, duration: 0.08, ease: 'power2.out' }, 3.85);
      tl.to('#id-pm', { scale: 1, duration: 0.3, ease: 'power2.inOut' }, 3.93);
      tl.fromTo('#id-paper-img', { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.62, ease: 'power2.inOut' }, 5.34);
      tl.set({}, {}, 6);
      window.__timelines = window.__timelines || {};
      window.__timelines['ident'] = tl;
    })();
  </script>
</template>
`;

/* ── 片尾 ── */
const end = `<template>
  <style>${FONTS}
    #root { position: absolute; inset: 0; background: #050808; overflow: hidden; }
    #ec-bg { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }
    #ec-vig { position: absolute; inset: 0; background: radial-gradient(ellipse 95% 90% at 50% 46%, rgba(6,10,10,0) 0%, rgba(6,10,10,.14) 40%, rgba(6,10,10,.46) 72%, rgba(6,10,10,.84) 100%); }
    #ec-art { position: absolute; left: 0; top: 0; }
    .ec-line { fill: none; stroke: #d6bd84; stroke-opacity: .34; stroke-linecap: butt; }
    .ec-drop { fill: #d6bd84; fill-opacity: .6; }
    #ec-title { position: absolute; left: 330px; top: 170px; }
    #ec-title-w { writing-mode: vertical-rl; font-family: "NiYu", serif; font-size: 116px; line-height: 140px; letter-spacing: .12em; color: #e2cb96; white-space: nowrap; }
    #ec-block { position: absolute; left: 620px; top: 232px; width: 1000px; }
    #ec-en { font-family: "IM Fell English", serif; font-style: italic; font-size: 64px; line-height: 76px; color: #d6bd84; white-space: nowrap; }
    #ec-rule { width: 760px; height: 2px; background: #d6bd84; margin: 26px 0 30px; }
    #ec-by { font-family: "Iansui", serif; font-size: 46px; line-height: 64px; letter-spacing: .16em; color: #f2ebdb; white-space: nowrap; }
    #ec-spec { font-family: "Iansui", serif; font-size: 36px; line-height: 58px; letter-spacing: .16em; color: #cdd6d2; white-space: nowrap; }
    #ec-lab { font-family: "Courier Prime", monospace; font-size: 28px; letter-spacing: .3em; color: #d6bd84; margin-top: 66px; white-space: nowrap; }
    #ec-url { font-family: "Courier Prime", monospace; font-size: 46px; line-height: 64px; color: #f2ebdb; white-space: nowrap; }
    #ec-note { position: absolute; left: 0; top: 968px; width: 1920px; text-align: center; }
    #ec-note-w { font-family: "Iansui", serif; font-size: 28px; letter-spacing: .1em; color: #b9c4c0; white-space: nowrap; }
    #ec-stamp { position: absolute; left: 1560px; top: 300px; width: 230px; height: 230px; }
    #ec-black { position: absolute; inset: 0; }
    #ec-black-w { position: absolute; inset: 0; background: #050808; }
  </style>
  <div id="root" data-composition-id="endcard" data-width="1920" data-height="1080">
    <img id="ec-bg" class="clip" data-start="0" data-duration="9" src="assets/cloth.jpg" alt="" style="z-index:1" />
    <div id="ec-vig" class="clip" data-start="0" data-duration="9" style="z-index:2"></div>
    <svg id="ec-art" class="clip" data-start="0" data-duration="9" width="1920" height="1080" viewBox="0 0 1920 1080" style="z-index:3" data-layout-allow-overlap>
      <g id="ec-rain">${rain('ec-', 120, 1800, 1010, 760, 30, 314)}</g>
    </svg>
    <div id="ec-title" class="clip" data-start="0" data-duration="9" style="z-index:4" data-layout-allow-overlap><div id="ec-title-w">量雨的人</div></div>
    <div id="ec-block" class="clip" data-start="0" data-duration="9" style="z-index:5" data-layout-allow-overlap>
      <div id="ec-en">The One Who Measures the Rain</div>
      <div id="ec-rule"></div>
      <div id="ec-by">Omega　著</div>
      <div id="ec-spec">八卷　·　九十八頁　·　直排線裝本</div>
      <div id="ec-lab">READ &amp; DOWNLOAD</div>
      <div id="ec-url">reverse-1999-art.vercel.app/book</div>
    </div>
    <div id="ec-stamp" class="clip" data-start="0" data-duration="9" style="z-index:6" data-layout-allow-overlap>${stamp('ec-pm')}</div>
    <div id="ec-note" class="clip" data-start="0" data-duration="9" style="z-index:7"><div id="ec-note-w">非官方、非營利的二次創作。《重返未來：1999》的權利屬於深藍互動（Bluepoch）。</div></div>
    <div id="ec-black" class="clip" data-start="0" data-duration="9" style="z-index:8" data-layout-allow-overlap data-layout-allow-occlusion><div id="ec-black-w"></div></div>
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo('#ec-black-w', { opacity: 1 }, { opacity: 0, duration: 0.7, ease: 'power2.out' }, 0);
      document.querySelectorAll('.ec-line').forEach(function (el, i) {
        const len = +el.getAttribute('data-len'), t = 0.2 + i * 0.05, d = 0.6 + len / 620;
        tl.fromTo(el, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: d, ease: 'power3.out' }, t);
        tl.fromTo('#ec-d' + i, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' }, t + d * 0.72);
      });
      tl.fromTo('#ec-rain', { y: 0 }, { y: -34, duration: 7, ease: 'sine.inOut' }, 1.6);
      tl.fromTo('#ec-title-w', { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'power2.inOut' }, 0.5);
      tl.fromTo('#ec-en', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power4.out' }, 1.3);
      tl.fromTo('#ec-rule', { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.6, ease: 'power2.inOut' }, 1.5);
      tl.fromTo('#ec-by', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power4.out' }, 1.9);
      tl.fromTo('#ec-spec', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power4.out' }, 2.1);
      tl.fromTo('#ec-lab', { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 2.9);
      tl.fromTo('#ec-url', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power4.out' }, 3.0);
      tl.fromTo('#ec-pm', { opacity: 0, scale: 1.55, rotation: 4, transformOrigin: '50% 50%' }, { opacity: 0.9, scale: 0.97, rotation: 11, duration: 0.15, ease: 'power3.in' }, 3.7);
      tl.to('#ec-pm', { scale: 1.02, duration: 0.08, ease: 'power2.out' }, 3.85);
      tl.to('#ec-pm', { scale: 1, duration: 0.3, ease: 'power2.inOut' }, 3.93);
      tl.fromTo('#ec-note-w', { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 4.3);
      tl.to('#ec-black-w', { opacity: 1, duration: 0.8, ease: 'power2.in' }, 8.15);
      tl.set({}, {}, 9);
      window.__timelines = window.__timelines || {};
      window.__timelines['endcard'] = tl;
    })();
  </script>
</template>
`;

/* ── 總時間軸：片頭 6 秒 → 手繪四幅 34 秒（Remotion）→ 書 25 秒（Remotion）→ 片尾 9 秒 ── */
const T = { ident: 6, hand: 34, book: 25, end: 9 };
const total = T.ident + T.hand + T.book + T.end;
const index = `<!doctype html>
<html lang="zh-Hant" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #050808; }
      #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
      #root > div, #root > video { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920" data-height="1080" data-fps="30">
      <div id="ident" data-composition-id="ident" data-composition-src="compositions/ident.html" data-start="0" data-duration="${T.ident}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:1"></div>
      <video id="hand" class="clip" src="assets/handdrawn.mp4" data-start="${T.ident}" data-duration="${T.hand}" data-track-index="1" muted playsinline style="z-index:2"></video>
      <video id="book" class="clip" src="assets/book.mp4" data-start="${T.ident + T.hand}" data-duration="${T.book}" data-track-index="1" muted playsinline style="z-index:3"></video>
      <div id="endcard" data-composition-id="endcard" data-composition-src="compositions/endcard.html" data-start="${T.ident + T.hand + T.book}" data-duration="${T.end}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:4"></div>
      <audio id="music" src="assets/music.m4a" data-start="0" data-duration="${total}" data-track-index="2" data-volume="0.9" data-fade-in="0.4" data-fade-out="2.6"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
      window.__timelines["main"].set({}, {}, ${total});
    </script>
  </body>
</html>
`;
fs.mkdirSync(path.join(__dirname, 'compositions'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'compositions/ident.html'), ident);
fs.writeFileSync(path.join(__dirname, 'compositions/endcard.html'), end);
fs.writeFileSync(path.join(__dirname, 'index.html'), index);
console.log('index.html、compositions/ident.html、compositions/endcard.html｜全長', total, '秒');
