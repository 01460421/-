'use strict';
/* ---------- 聲音：全部即時合成，沒有音檔 ----------
   底層是一層濾過的雜訊（雨），加上偶爾往上滑的水滴聲（雨是向上落的）。
   其他模組用 A.Snd.cue('stamp') 之類的名字觸發短音效；聲音關著的時候什麼都不做。 */
(function () {
  const A = window.__A, K = A.K;
  let ctx = null, master = null, rainGain = null, noiseBuf = null, dropT = 0, armed = false, mood = 1;
  const want = () => !!A.Settings.get().snd;
  const vol = () => K.clamp(+A.Settings.get().vol || 0, 0, 1);

  function noise() {
    if (noiseBuf) return noiseBuf;
    const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (noiseBuf = b);
  }
  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    rainGain = ctx.createGain(); rainGain.gain.value = 1; rainGain.connect(master);
    const mk = (type, freq, q, gain) => {
      const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(rainGain); src.start();
    };
    mk('bandpass', 2400, 0.5, 0.16);   // 雨絲
    mk('highpass', 6000, 0.3, 0.05);   // 細碎的高頻
    mk('lowpass', 260, 0.4, 0.22);     // 遠處的低鳴
    return true;
  }
  function fade(to, sec) {
    if (!ctx) return;
    const t = ctx.currentTime; master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(to, t + sec);
  }
  function drop() {
    if (!ctx || ctx.state !== 'running' || !want()) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    const f0 = 500 + Math.random() * 900;
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + 0.12);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.028 * mood, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
  }
  function loopDrops() { clearTimeout(dropT); dropT = setTimeout(() => { drop(); loopDrops(); }, 500 + Math.random() * 2600); }

  function start() {
    if (!want()) return;
    if (!ctx && !build()) return;
    const go = () => { fade(vol() * 0.9, 1.6); loopDrops(); };
    if (ctx.state === 'suspended') ctx.resume().then(go).catch(() => {}); else go();
  }
  function stop() { clearTimeout(dropT); if (ctx) { fade(0, 0.5); } }

  /* 短音效 */
  function tone(f0, f1, dur, gain, type, delay) {
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(dur, f0, f1, gain) {
    const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.05);
  }
  const CUES = {
    stamp() { tone(150, 46, 0.2, 0.5, 'sine'); burst(0.06, 900, 300, 0.12); },
    page() { burst(0.09, 1800, 3600, 0.035); },
    swell() { burst(1.0, 300, 5200, 0.2); },           // 雨幕：往上掃的一陣雨
    veil() { burst(0.4, 700, 3200, 0.07); },
    chime() { tone(660, 660, 0.5, 0.09, 'sine'); tone(990, 990, 0.7, 0.07, 'sine', 0.13); },
    right() { tone(784, 784, 0.16, 0.07, 'triangle'); tone(1175, 1175, 0.3, 0.06, 'triangle', 0.09); },
    wrong() { tone(196, 150, 0.28, 0.09, 'triangle'); },
    tick() { tone(1400, 1400, 0.03, 0.03, 'square'); }
  };
  function cue(name) {
    if (!want() || !ctx || ctx.state !== 'running' || !CUES[name]) return;
    try { CUES[name](); } catch (e) { /* 聲音出錯不影響其他功能 */ }
  }
  /* 雨勢：放映廳遇到暴雨的鏡頭時加大。 */
  function setMood(m) {
    mood = K.clamp(m, 0.3, 2.2);
    if (!ctx || !rainGain) return;
    const t = ctx.currentTime; rainGain.gain.cancelScheduledValues(t);
    rainGain.gain.setValueAtTime(rainGain.gain.value, t); rainGain.gain.linearRampToValueAtTime(mood, t + 1.2);
  }

  /* 瀏覽器規定要有使用者的操作才能出聲：上次開著的話，等第一次點擊或按鍵。 */
  function arm() {
    if (armed) return; armed = true;
    const first = () => { document.removeEventListener('pointerdown', first); document.removeEventListener('keydown', first); if (want()) start(); };
    document.addEventListener('pointerdown', first); document.addEventListener('keydown', first);
  }
  A.on('ready', () => { if (want()) arm(); });
  A.on('setting', ({ k, v }) => {
    if (k === 'snd') { if (v) start(); else stop(); }
    if (k === 'vol' && ctx && want()) fade(vol() * 0.9, 0.15);
  });
  A.on('import', () => { if (want()) arm(); else stop(); });
  A.on('veil', long => cue(long ? 'swell' : 'veil'));
  A.on('stamp', () => cue('stamp'));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else if (want()) ctx.resume().catch(() => {});
  });

  A.Snd = { cue, setMood, get on() { return want() && !!ctx && ctx.state === 'running'; } };
})();
