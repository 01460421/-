// 書的鏡頭。四段：書衣（關燈、聚光、推近、浮起、光束描邊、落回）→ 翻頁 → 近看 → 拉遠。
// 參數照 video-shotcraft 的鏡頭配方：spotlight-hero-card、card-flip-reveal，相機是它的 PageCam 算法。
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { CJK, Cam, CamKey, FOIL, HEAD, MONO, clamp, eInOut, eOut, prog } from './lib';

export const BOOK_FRAMES = 750;
const A_END = 176, B0 = 182, FLIP = 22, HOLD = 28, B_END = B0 + 34 + 5 * (FLIP + HOLD) - HOLD + 24, C0 = B_END, C_END = C0 + 190, D0 = C_END;
const desk = 'radial-gradient(ellipse 70% 62% at 50% 46%, #26302f 0%, #141b1b 55%, #0a0f0f 100%)';
const Label: React.FC<{ zh: string; en: string; t0: number; t1: number; band?: boolean }> = ({ zh, en, t0, t1, band }) => {
  const f = useCurrentFrame();
  const o = Math.min(prog(f, t0, 10, eOut), 1 - prog(f, t1 - 8, 8));
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 250, zIndex: 20, opacity: o, background: band ? 'linear-gradient(to top, rgba(6,10,10,1) 0%, rgba(6,10,10,1) 60%, rgba(6,10,10,0) 100%)' : 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 58, textAlign: 'center', transform: `translateY(${(1 - prog(f, t0, 10, eOut)) * 8}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: 28, letterSpacing: '0.26em', color: FOIL, opacity: 0.85 }}>{en}</div>
        <div style={{ fontFamily: CJK, fontSize: 44, letterSpacing: '0.16em', color: '#f2ebdb', marginTop: 6 }}>{zh}</div>
      </div>
    </div>
  );
};

/* ── 一、書衣 ── */
const CW = 620, CH = 877, CX = 960, CY = 540;
const camA: CamKey[] = [
  { frame: 0, cx: 960, cy: 540, zoom: 0.86, rotX: 0, rotY: 0, persp: 1500 },
  { frame: 40, cx: 960, cy: 540, zoom: 0.86, rotX: 0, rotY: 0, persp: 1500 },
  { frame: 58, cx: 870, cy: 540, zoom: 1.08, rotX: 5, rotY: 18, persp: 1500 },
  { frame: A_END, cx: 870, cy: 540, zoom: 1.08, rotX: 5, rotY: 18, persp: 1500 },
];
const Cover: React.FC = () => {
  const f = useCurrentFrame();
  const rise = interpolate(f, [58, 68], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
  const seat = prog(f, 124, 18);
  const hover = f >= 68 && f < 124 ? Math.sin(((f - 68) / 40) * Math.PI * 2) * 4 : 0;
  const lift = rise * (1 - seat);
  const z = 90 * lift + hover * lift;
  const press = f >= 142 && f < 148 ? 1 - 0.003 * Math.sin(((f - 142) / 6) * Math.PI) : 1;
  // 聚光：三個中間站，然後鎖住書；推近之後跟著書在畫面上的位置
  const st = [[4, 520, 300], [12, 1400, 380], [20, 700, 820], [28, 700, 820], [34, 960, 540], [40, 960, 540], [58, 1057, 540]];
  const sx = interpolate(f, st.map(s => s[0]), st.map(s => s[1]), { ...clamp, easing: eInOut });
  const sy = interpolate(f, st.map(s => s[0]), st.map(s => s[2]), { ...clamp, easing: eInOut });
  const r = interpolate(f, [4, 34, 58], [420, 330, 520], clamp);
  const dark = interpolate(f, [0, 2, 6, 34, 40, 62], [1, 0.3, 0.92, 0.92, 0.9, 0.62], clamp) + (f >= 34 && f < 38 ? -0.06 : 0);
  const lap = (a: number, b: number) => interpolate(f, [a, b], [1, 0], clamp);
  const beam = (a: number, b: number, w: number, o: number) => f < a || f > b ? null : (
    <g opacity={o}>
      <rect x={-3} y={-3} width={CW + 6} height={CH + 6} rx={5} fill="none" stroke={FOIL} strokeWidth={w} pathLength={1} strokeDasharray="0.16 1" strokeDashoffset={lap(a, b)} strokeLinecap="round" />
      <rect x={-3} y={-3} width={CW + 6} height={CH + 6} rx={5} fill="none" stroke="#fffaf0" strokeWidth={w / 2} pathLength={1} strokeDasharray="0.16 1" strokeDashoffset={lap(a, b)} strokeLinecap="round" />
    </g>
  );
  const note = prog(f, 74, 18, eOut);
  return (
    <AbsoluteFill style={{ background: desk }}>
      <Cam keys={camA} w={1920} h={1080}>
        <div style={{ position: 'absolute', left: CX - CW / 2, top: CY - CH / 2, width: CW, height: CH, transform: `translateZ(${2 + z}px) scale(${press})`, boxShadow: `${-16 * lift - 6}px ${22 * lift + 8}px ${46 * lift + 18}px rgba(0,0,0,${0.5 + 0.12 * lift})`, transformStyle: 'preserve-3d' }}>
          <Img src={staticFile('book/cover.jpg')} style={{ position: 'absolute', width: CW, height: CH }} />
          <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} style={{ position: 'absolute', overflow: 'visible' }}>{beam(68, 82, 5, 1)}{beam(88, 108, 3.5, 0.62)}</svg>
          {f >= 142 && f < 156 ? <div style={{ position: 'absolute', inset: -6, border: `2px solid ${FOIL}`, opacity: interpolate(f, [142, 156], [0.7, 0], clamp) }} /> : null}
        </div>
      </Cam>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${sx}px ${sy}px, rgba(8,12,12,0) ${r * 0.55}px, rgba(8,12,12,${dark * 0.6}) ${r}px, rgba(8,12,12,${dark}) ${r + 260}px)` }} />
      <Cam keys={camA} w={1920} h={1080}>
        <div style={{ position: 'absolute', left: 392, top: 150, transform: `translateZ(${8 + 62 * lift}px)`, opacity: note, clipPath: `inset(0 0 ${(1 - note) * 100}% 0)` }}>
          <div style={{ writingMode: 'vertical-rl', fontFamily: HEAD, fontSize: 92, letterSpacing: '0.22em', lineHeight: '110px', color: FOIL, whiteSpace: 'nowrap' }}>量雨的人</div>
        </div>
        <div style={{ position: 'absolute', left: 318, top: 170, transform: `translateZ(${8 + 62 * lift}px)`, opacity: prog(f, 86, 14, eOut) * 0.9 }}>
          <div style={{ writingMode: 'vertical-rl', fontFamily: CJK, fontSize: 30, letterSpacing: '0.3em', lineHeight: '44px', color: '#f2ebdb', whiteSpace: 'nowrap' }}>線裝本　八卷　九十八頁</div>
        </div>
      </Cam>
      {f < 8 ? <AbsoluteFill style={{ backgroundColor: '#050808', opacity: interpolate(f, [0, 8], [1, 0], clamp) }} /> : null}
    </AbsoluteFill>
  );
};

/* ── 二、翻頁 ── */
const PW = 540, PH = 764, BL = 960 - PW, BT = 548 - PH / 2;
const SPREADS = ['02', '04', '06', '17', '28', '39'];
const NAMES: [string, string][] = [['扉頁', 'TITLE PAGE'], ['目錄', 'CONTENTS'], ['卷一　散文', 'VOLUME I — ESSAYS'], ['卷三　問答', 'VOLUME III — DIALOGUES'], ['卷五　新詩', 'VOLUME V — POEMS'], ['卷六　小說', 'VOLUME VI — STORIES']];
const camB: CamKey[] = [{ frame: 0, cx: 960, cy: 606, zoom: 1.04, rotX: 20, persp: 1700 }];
const Pg: React.FC<{ id: string; side: 'L' | 'R'; style?: React.CSSProperties }> = ({ id, side, style }) => (
  <Img src={staticFile(`book/s${id}${side}.jpg`)} style={{ position: 'absolute', left: side === 'L' ? BL : 960, top: BT, width: PW, height: PH, ...style }} />
);
const Board: React.FC = () => <div style={{ position: 'absolute', left: BL - 10, top: BT - 6, width: PW * 2 + 20, height: PH + 12, background: '#0c1c1f', boxShadow: '0 26px 60px rgba(0,0,0,.6)', transform: 'translateZ(-4px)' }} />;
const flipStart = (k: number) => 34 + k * (FLIP + HOLD);
const Flips: React.FC = () => {
  const f = useCurrentFrame() - B0;
  let i = 0, q = 0;
  for (let k = 0; k < SPREADS.length - 1; k++) {
    const s = flipStart(k);
    if (f >= s + FLIP) i = k + 1; else if (f >= s) { i = k; q = prog(f, s, FLIP, Easing.bezier(0.45, 0, 0.25, 1)); break; }
  }
  const cur = SPREADS[i], next = SPREADS[Math.min(i + 1, SPREADS.length - 1)];
  const shade = Math.sin(q * Math.PI);
  return (
    <AbsoluteFill style={{ background: desk }}>
      <Cam keys={camB} w={1920} h={1080} frame={0}>
        <Board />
        {/* 直排的書往右翻：左頁掀起，翻到右邊，背面是下一個對開的右頁 */}
        <Pg id={q > 0 ? next : cur} side="L" />
        <Pg id={cur} side="R" />
        {q > 0 ? (
          <>
            <div style={{ position: 'absolute', left: BL, top: BT, width: PW, height: PH, transform: 'translateZ(0.6px)', background: `linear-gradient(to left, rgba(0,0,0,${0.3 * shade}), rgba(0,0,0,0) 70%)` }} />
            <div style={{ position: 'absolute', left: 960, top: BT, width: PW, height: PH, transform: 'translateZ(0.6px)', background: `linear-gradient(to right, rgba(0,0,0,${0.34 * q}), rgba(0,0,0,${0.1 * q}) 80%)` }} />
            <div style={{ position: 'absolute', left: BL, top: BT, width: PW, height: PH, transformOrigin: '100% 50%', transform: `translateZ(1.2px) rotateY(${q * 180}deg)`, transformStyle: 'preserve-3d' }}>
              <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden' }}>
                <Img src={staticFile(`book/s${cur}L.jpg`)} style={{ width: PW, height: PH }} />
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to right, rgba(0,0,0,${0.05 * shade}), rgba(0,0,0,${0.3 * shade}))` }} />
              </div>
              <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <Img src={staticFile(`book/s${next}R.jpg`)} style={{ width: PW, height: PH }} />
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to left, rgba(255,255,255,${0.1 * shade}), rgba(0,0,0,${0.24 * shade}))` }} />
              </div>
            </div>
          </>
        ) : null}
      </Cam>
    </AbsoluteFill>
  );
};

/* ── 三、近看：一個對開，原寸 ── */
const NW = 2339, NH = 1654;
const camC: CamKey[] = [
  { frame: C0, cx: 1990, cy: 430, zoom: 1.15, rotX: 4, rotY: 0, persp: 1800 },
  { frame: C0 + 50, cx: 1990, cy: 470, zoom: 1.15, rotX: 4, rotY: 0, persp: 1800 },
  { frame: C0 + 68, cx: 2150, cy: 760, zoom: 1.5, rotX: 3, rotY: -12, persp: 1500 },
  { frame: C0 + 118, cx: 2150, cy: 760, zoom: 1.5, rotX: 3, rotY: -12, persp: 1500 },
  { frame: C0 + 136, cx: 900, cy: 420, zoom: 1.5, rotX: 4, rotY: 9, persp: 1600 },
  { frame: C_END, cx: 900, cy: 420, zoom: 1.5, rotX: 4, rotY: 9, persp: 1600 },
];
const Macro: React.FC = () => (
  <AbsoluteFill style={{ background: desk }}>
    <Cam keys={camC} w={NW} h={NH}>
      <div style={{ position: 'absolute', left: -24, top: -14, width: NW + 48, height: NH + 28, background: '#0c1c1f', boxShadow: '0 40px 90px rgba(0,0,0,.6)', transform: 'translateZ(-4px)' }} />
      <Img src={staticFile('book/s17L.jpg')} style={{ position: 'absolute', left: 0, top: 0, width: 1169, height: NH }} />
      <Img src={staticFile('book/s17R.jpg')} style={{ position: 'absolute', left: 1169, top: 0, width: 1170, height: NH }} />
    </Cam>
  </AbsoluteFill>
);

/* ── 四、拉遠 ── */
const camD: CamKey[] = [
  { frame: D0, cx: 960, cy: 600, zoom: 1.5, rotX: 20, persp: 1700 },
  { frame: D0 + 22, cx: 960, cy: 606, zoom: 0.98, rotX: 16, persp: 1700 },
  { frame: BOOK_FRAMES, cx: 960, cy: 606, zoom: 0.98, rotX: 16, persp: 1700 },
];
const Wide: React.FC = () => {
  const f = useCurrentFrame();
  const t = prog(f, D0 + 20, 16, eOut);
  return (
    <AbsoluteFill style={{ background: desk }}>
      <Cam keys={camD} w={1920} h={1080}>
        <Board />
        <Pg id="50" side="L" /><Pg id="50" side="R" />
      </Cam>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 70, textAlign: 'center', opacity: t, transform: `translateY(${(1 - t) * 8}px)`, fontFamily: CJK, fontSize: 46, letterSpacing: '0.34em', color: '#f2ebdb', textShadow: '0 2px 18px rgba(0,0,0,.8)' }}>八卷　·　九十八頁　·　直排</div>
    </AbsoluteFill>
  );
};

export const BookShots: React.FC = () => {
  const f = useCurrentFrame();
  const dip = (a: number, b: number) => Math.max(0, 1 - Math.abs(f - (a + b) / 2) / ((b - a) / 2));
  const black = Math.max(dip(A_END - 4, B0 + 4), interpolate(f, [BOOK_FRAMES - 12, BOOK_FRAMES - 1], [0, 1], clamp));
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0f0f' }}>
      {f < A_END ? <Cover /> : f < B_END ? <Flips /> : f < C_END ? <Macro /> : <Wide />}
      {f >= B0 && f < B_END ? NAMES.map(([zh, en], k) => {
        const a = k === 0 ? B0 + 4 : B0 + flipStart(k - 1) + FLIP - 4, b = k === NAMES.length - 1 ? B_END : B0 + flipStart(k) + 6;
        return <Label key={k} zh={zh} en={en} t0={a} t1={b} />;
      }) : null}
      <Label band zh="〈再短一點〉：一行就好" en="DIALOGUES" t0={C0 + 6} t1={C0 + 50} />
      <Label band zh="版心在書口，一葉對摺，魚尾各半" en="THE FOLD" t0={C0 + 70} t1={C0 + 118} />
      <Label band zh="題上的一滴，是倒著落的雨" en="A DROP, RISING" t0={C0 + 138} t1={C_END} />
      <AbsoluteFill style={{ backgroundImage: `url(${staticFile('tex/grain.png')})`, opacity: 0.07, mixBlendMode: 'overlay', zIndex: 30 }} />
      {black > 0 ? <AbsoluteFill style={{ backgroundColor: '#050808', opacity: black, zIndex: 40 }} /> : null}
    </AbsoluteFill>
  );
};
