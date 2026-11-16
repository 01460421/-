/* 在畫面出現之前套用外觀設定，避免閃一下。設定存在手提箱的 x.set。 */
(function () {
  try {
    var raw = localStorage.getItem('nyjn.archive.v1');
    var s = raw ? (JSON.parse(raw).x || {}).set : null;
    if (!s || typeof s !== 'object') return;
    var r = document.documentElement;
    if (s.theme === 'light' || s.theme === 'dark') r.dataset.theme = s.theme;
    if (s.size === 'l') r.dataset.size = 'l';
    if (s.motion === 'less') r.dataset.motion = 'less';
  } catch (e) { /* 讀不到就用預設 */ }
})();
