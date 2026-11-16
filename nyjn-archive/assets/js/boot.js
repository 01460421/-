'use strict';
/* 最後一個檔案：所有模組都掛好之後才開機。 */
(function () {
  const A = window.__A;
  if (!A) return;
  A.start();
  /* 離線快取：只在 https 或本機啟用；檔案改版時靠 SITE_VERSION 換新。 */
  try {
    const okHost = location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if ('serviceWorker' in navigator && okHost && !(window.claude && window.claude.use)) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(typeof SITE_VERSION === 'string' ? SITE_VERSION : '0')).catch(() => {});
      });
    }
  } catch (e) { /* 沒有也沒關係 */ }
})();
