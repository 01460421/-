'use strict';
/* ---------- 放映廳的配樂 ----------
   原版紀錄片的配樂是一條音軌：十七段，照章節剪好，長度跟著影片的時間軸走。
   所以這裡只做一件事：讓音軌的時間永遠等於影片的時間（播放、暫停、跳轉、變速都跟著）。
   音檔載不到時，退回即時合成的環境音：雨、一組低鳴的和弦、每句旁白一個單音，做法和原版相同。 */
(function () {
  const A = window.__A, K = A.K;
  const SRC = (typeof SCORE_URL === 'string' && SCORE_URL) || 'assets/audio/score.mp4';
  const set = () => A.Settings.get();
  const wantMus = () => set().mus !== false;
  const vol = () => K.clamp((+set().vol || 0) * 1.7, 0, 1);
  let host = { now: () => 0, playing: () => false, rate: () => 1 }, onState = null, coda = false;
  const state = () => { if (onState) try { onState(); } catch (e) { /* 介面還沒建好 */ } };

  /* ---- 退路：即時合成的環境音 ---- */
  const CH = [[73.42, 110, 146.83, 174.61], [55, 82.41, 130.81, 123.47], [49, 73.42, 116.54, 98], [73.42, 110, 185, 146.83]];
  const SC = [[293.66, 349.23, 392, 440, 523.25, 587.33], [220, 261.63, 293.66, 329.63, 392, 440], [196, 233.08, 261.63, 293.66, 349.23, 392], [293.66, 329.63, 369.99, 440, 493.88, 587.33]];
  const Amb = {
    ac: null, m: 0, nn: 0, on: false,
    start() {
      try {
        if (!this.ac) {
          const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
          const a = this.ac = new AC(); this.out = a.createGain(); this.out.gain.value = 0; this.out.connect(a.destination);
          const len = a.sampleRate * 2, b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0); let l = 0;
          for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; l = (l + 0.02 * w) / 1.02; d[i] = w * 0.22 + l * 3; }
          const n = a.createBufferSource(); n.buffer = b; n.loop = true;                                 // 雨
          this.hp = a.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 1100;
          const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
          this.rg = a.createGain(); this.rg.gain.value = 0.045; n.connect(this.hp); this.hp.connect(lp); lp.connect(this.rg); this.rg.connect(this.out); n.start();
          const n2 = a.createBufferSource(); n2.buffer = b; n2.loop = true; n2.playbackRate.value = 0.35;  // 遠處的低鳴
          const lp2 = a.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 160; const g2 = a.createGain(); g2.gain.value = 0.1; n2.connect(lp2); lp2.connect(g2); g2.connect(this.out); n2.start();
          this.dg = a.createGain(); this.dg.gain.value = 0.085; const dl = a.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 620; this.dg.connect(dl); dl.connect(this.out);
          this.os = [0, 1, 2, 3].map(i => {                                                              // 四個音的和弦，各自緩慢起伏
            const o = a.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = CH[this.m][i];
            const g = a.createGain(); g.gain.value = [0.5, 0.34, 0.24, 0.15][i];
            const lf = a.createOscillator(); lf.frequency.value = 0.05 + 0.03 * i; const lg = a.createGain(); lg.gain.value = g.gain.value * 0.5;
            lf.connect(lg); lg.connect(g.gain); lf.start(); o.connect(g); g.connect(this.dg); o.start(); return o;
          });
          this.dly = a.createDelay(2); this.dly.delayTime.value = 0.47; const fb = a.createGain(); fb.gain.value = 0.4;
          const dlp = a.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 1700;
          this.dly.connect(dlp); dlp.connect(fb); fb.connect(this.dly); dlp.connect(this.out);
          this.dry = a.createGain(); this.dry.gain.value = 0.8; this.dry.connect(this.out); this.dry.connect(this.dly);
        }
        if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
        return true;
      } catch (e) { return false; }
    },
    level(live) {
      if (live && !this.ac && !this.start()) return;
      if (!this.ac) return; this.on = !!live;
      if (live && this.ac.state === 'suspended') this.ac.resume().catch(() => {});
      this.out.gain.setTargetAtTime(live ? 0.85 * vol() : 0, this.ac.currentTime, live ? 0.6 : 0.15);
    },
    mood(si) {
      const m = si <= 9 ? 0 : si <= 13 ? 1 : si <= 16 ? 2 : 3; if (m === this.m) return; this.m = m;
      if (!this.ac) return; const t = this.ac.currentTime; this.os.forEach((o, i) => o.frequency.setTargetAtTime(CH[m][i], t, 2.5));
    },
    pluck() {
      if (!this.ac || !this.on) return;
      try {
        const a = this.ac, t = a.currentTime, sc = SC[this.m], f = sc[(this.nn = (this.nn + 1 + Math.floor(Math.random() * 3)) % sc.length)] * (Math.random() < 0.2 ? 0.5 : 1);
        [1, 2.001].forEach((h, i) => { const o = a.createOscillator(), g = a.createGain(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = f * h; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(i ? 0.02 : 0.07, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0006, t + 3.2); o.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 3.4); });
      } catch (e) { /* 聲音出錯不影響放映 */ }
    },
    swell() {
      if (!this.ac || !this.on) return; const t = this.ac.currentTime;
      this.rg.gain.cancelScheduledValues(t); this.rg.gain.setValueAtTime(0.045, t); this.rg.gain.linearRampToValueAtTime(0.2, t + 2.6); this.rg.gain.linearRampToValueAtTime(0.045, t + 6.5);
      this.hp.frequency.cancelScheduledValues(t); this.hp.frequency.setValueAtTime(1100, t); this.hp.frequency.linearRampToValueAtTime(380, t + 2.6); this.hp.frequency.linearRampToValueAtTime(1100, t + 6.5);
    }
  };

  /* ---- 配樂：一個 audio 元素，時間跟著影片 ---- */
  const Mus = {
    el: null, fail: false, ok: false, need: false, pend: -1, fixT: 0,
    init() {
      if (this.el || this.fail) return;
      try {
        const a = this.el = new Audio(); a.preload = 'auto';
        a.addEventListener('error', () => { this.fail = true; this.ok = false; apply(); });
        a.addEventListener('loadedmetadata', () => { if (this.pend >= 0) { try { a.currentTime = this.pend; } catch (e) { /* 忽略 */ } this.pend = -1; } });
        a.addEventListener('ended', () => { coda = false; apply(); });
        a.addEventListener('playing', () => {
          if (!this.ok) { this.ok = true; this.need = false; state(); }
          const n = performance.now();
          if (!coda && host.playing() && n > this.fixT && Math.abs(a.currentTime - host.now()) > 0.15) { this.fixT = n + 1500; this.seek(host.now()); }
        });
        a.src = SRC;
      } catch (e) { this.fail = true; }
    },
    seek(T) { const a = this.el; if (!a) return; if (a.readyState >= 1) { try { a.currentTime = T; } catch (e) { /* 忽略 */ } } else this.pend = T; }
  };

  /* 影片那邊每次播放、暫停、跳轉、變速都叫一次；hard 代表時間被人動過，要重新對齊 */
  function apply(hard) {
    const play = host.playing(), on = wantMus();
    if (play || hard) coda = false;                      // 重新開始放，或有人動了時間：尾奏結束
    const want = on && (play || coda);
    if (A.Snd && A.Snd.hold) A.Snd.hold(want);          // 配樂在的時候，館內的雨聲先讓開
    if (on && play) Mus.init();                          // 真的要播才建立，這時才開始下載
    const a = Mus.el;
    if (a && !Mus.fail) {
      if (!want) { if (!a.paused) a.pause(); }
      else {
        a.volume = vol();
        if (!coda && (hard || a.paused || Math.abs(a.currentTime - host.now()) > 0.45)) Mus.seek(host.now());
        try { a.playbackRate = coda ? 1 : host.rate(); } catch (e) { /* 忽略 */ }
        if (a.paused) { const p = a.play(); if (p && p.catch) p.catch(e => { if (e && e.name === 'NotAllowedError') { Mus.need = true; state(); } }); }
      }
    }
    Amb.level(on && play && Mus.fail);
    state();
  }
  function tick(now) {
    const a = Mus.el; if (!a || Mus.fail || a.paused || coda || !host.playing() || now < Mus.fixT) return;
    if (!a.seeking && a.readyState >= 3 && Math.abs(a.currentTime - host.now()) > 0.45) { Mus.fixT = now + 1500; Mus.seek(host.now()); }
  }
  /* 影片放完：配樂把最後一段奏完（尾奏） */
  function finish() { coda = wantMus() && !Mus.fail && !!Mus.el && Mus.ok; }
  function leave() { coda = false; if (Mus.el && !Mus.el.paused) Mus.el.pause(); Amb.level(false); if (A.Snd && A.Snd.hold) A.Snd.hold(false); state(); }
  /* 換到新的一段：給退路的環境音用（換和弦、彈一個音、暴雨時雨聲湧上來） */
  function onSeg(seg) {
    if (seg.ent && typeof seg.ent.si === 'number') Amb.mood(seg.ent.si);
    if (!host.playing()) return;
    if (seg.type === 'cue') { Amb.pluck(); if (seg.stormHead) Amb.swell(); }
  }
  function label() {
    if (!wantMus()) return '配樂 關';
    if (Mus.need) return '點此播放配樂';
    if (Mus.fail) return '配樂（環境音）';
    if (Mus.el && !Mus.ok && host.playing()) return '配樂 載入中';
    return '配樂 開';
  }
  /* 瀏覽器擋下自動播放時，按鈕的意思是「現在播」，不是關掉 */
  function toggle() { if (Mus.need && wantMus()) { Mus.need = false; apply(true); return; } Mus.need = false; A.Settings.set('mus', !wantMus()); }

  A.on('setting', ({ k }) => {
    if (k === 'vol') { if (Mus.el) Mus.el.volume = vol(); if (Amb.on) Amb.level(true); }
    if (k === 'mus') { if (!wantMus()) coda = false; apply(true); }
  });
  A.on('import', () => apply(true));
  document.addEventListener('visibilitychange', () => { if (Amb.ac && document.hidden && !host.playing()) Amb.ac.suspend().catch(() => {}); });

  A.Score = {
    attach(h, cb) { host = h; onState = cb; }, apply, tick, finish, leave, onSeg, label, toggle,
    get src() { return SRC; }, get audio() { return Mus.el; }, get failed() { return Mus.fail; }, get coda() { return coda; }
  };
})();
