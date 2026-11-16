// 手繪的四幅：一節詩一幅。線稿一筆一筆畫出來，顏色由左而右顯影，字一句一欄。
// 圖層顯影與翻頁捲邊的做法照 story-to-handdrawn-video（它只出 3:4，這裡改成 16:9，圖是自己畫的 SVG）。
import React from 'react';
import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Caption, GOLD, INK, Ink, MONO, ORANGE, COPPER, Rain, STAMP, TEAL, Wash, clamp, reveal } from './lib';

export const P = 255, T = 21;      // 一幅的長度；翻頁的長度
const W = 1920, H = 1080;
const circle = (x: number, y: number, r: number) => `M${x + r} ${y}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0`;
const ell = (x: number, y: number, rx: number, ry: number) => `M${x + rx} ${y}a${rx} ${ry} 0 1 0 ${-2 * rx} 0a${rx} ${ry} 0 1 0 ${2 * rx} 0`;

// 一組筆畫：照順序，一筆接一筆
const Strokes: React.FC<{ d: string[]; t0: number; step?: number; dur?: number; w?: number; color?: string; opacity?: number }> = ({ d, t0, step = 3, dur = 16, w, color, opacity }) => (
  <>{d.map((x, i) => <Ink key={i} d={x} t0={t0 + i * step} dur={dur} w={w} color={color} opacity={opacity} />)}</>
);

const Art1: React.FC = () => (
  <>
    <Wash t0={96} dur={34} x={150} y={150} w={1100} h={680}>
      <rect x={170} y={170} width={1060} height={390} rx={70} fill="#9db8b4" opacity={0.3} />
      <path d="M184 646L280 562L376 646zM370 606L452 522L534 606zM566 436L631 330L696 436zM706 656L811 574L916 656zM918 616L996 540L1074 616z" fill="#2f5a5c" opacity={0.55} />
      <path d="M236 690h36v40h-36zM412 650h30v36h-30zM462 650h30v36h-30zM615 600h32v54h-32zM760 700h34v38h-34zM830 700h34v38h-34z" fill="#e3b55a" opacity={0.85} />
      <path d={circle(631, 500, 34)} fill="#f7f0dc" />
      <path d="M1122 640h36l-8-34h-20z" fill="#e3b55a" opacity={0.85} />
    </Wash>
    <Strokes t0={26} step={3} d={[
      'M150 822C400 818 800 826 1240 820',
      'M200 820V642H360V820', 'M184 646L280 562L376 646', 'M236 690h36v40h-36z', 'M300 820v-70h34v70',
      'M384 820V602H520V820', 'M370 606L452 522L534 606', 'M490 560v-44h24v66', 'M412 650h30v36h-30z', 'M462 650h30v36h-30z',
      'M582 820V432H680V820', 'M566 436L631 330L696 436', circle(631, 500, 34), 'M631 500V476', 'M631 500L650 510', 'M615 600h32v54h-32z',
      'M722 820V652H900V820', 'M706 656L811 574L916 656', 'M760 700h34v38h-34z', 'M830 700h34v38h-34z',
      'M932 820V612H1060V820', 'M918 616L996 540L1074 616', 'M980 820v-64h32v64',
      'M1140 820V640', 'M1122 640h36l-8-34h-20z',
    ]} />
    <Rain x0={170} x1={1230} ground={520} maxLen={330} n={22} seed={87} t0={70} span={80} drift={0.16} />
    <Rain x0={160} x1={1240} ground={815} maxLen={520} n={7} seed={19} t0={84} span={70} drift={0.12} w={2} />
  </>
);

const Art2: React.FC = () => (
  <>
    <Wash t0={104} dur={32} x={150} y={200} w={1100} h={660}>
      <path d="M352 520H768a22 22 0 0 1 22 22V808a22 22 0 0 1-22 22H352a22 22 0 0 1-22-22V542a22 22 0 0 1 22-22z" fill="#27494c" opacity={0.66} />
      <path d="M430 588h46v36h-46zM644 588h46v36h-46zM330 566L376 520H352a22 22 0 0 0-22 22zM790 566L744 520h24a22 22 0 0 1 22 22zM330 784L376 830H352a22 22 0 0 1-22-22zM790 784L744 830h24a22 22 0 0 0 22-22z" fill="#c79a45" opacity={0.9} />
      <path d={circle(898, 330, 72)} fill="#2a2a2e" opacity={0.6} />
      <path d={circle(898, 330, 22)} fill={ORANGE} opacity={0.85} />
      <path d="M690 250L800 232L814 318L704 338z" fill="#fbf3d6" />
      <path d="M1088 262L1040 380L1066 392z" fill="#2b2f36" opacity={0.6} />
      <path d="M1128 670H1172L1190 792H1110z" fill="#8fa0ad" opacity={0.55} />
    </Wash>
    <Strokes t0={26} step={3} d={[
      'M150 832C420 828 900 836 1240 830',
      'M352 520H768a22 22 0 0 1 22 22V808a22 22 0 0 1-22 22H352a22 22 0 0 1-22-22V542a22 22 0 0 1 22-22z',
      'M330 604H790', 'M494 520C494 450 626 450 626 520', 'M520 520C520 478 600 478 600 520',
      'M430 588h46v36h-46z', 'M644 588h46v36h-46z', 'M410 520V830', 'M440 520V830', 'M680 520V830', 'M710 520V830',
      'M330 566L376 520', 'M790 566L744 520', 'M330 784L376 830', 'M790 784L744 830',
      circle(898, 330, 72), circle(898, 330, 22), 'M690 250L800 232L814 318L704 338z', 'M712 272L792 258', 'M716 296L796 282',
      'M1010 480L1088 262', 'M1010 480c-10 26-44 22-40-6', 'M1088 262L1040 380L1066 392z',
      circle(726, 410, 14), 'M740 410H800v14M784 410v12',
    ]} />
    <Strokes t0={110} step={4} w={2.8} opacity={0.8} d={[circle(1150, 640, 22), 'M1128 670H1172L1190 792H1110z', 'M1136 792V826', 'M1164 792V826']} />
    <Rain x0={1070} x1={1236} ground={826} maxLen={520} n={9} seed={41} t0={124} span={50} drift={0.14} />
  </>
);

const oranges: [number, number][] = [[254, 664], [330, 664], [406, 664], [292, 598], [368, 598], [330, 532]];
const Art3: React.FC = () => (
  <>
    <Wash t0={104} dur={34} x={150} y={420} w={1100} h={420}>
      <path d="M232 704H428V812H232z" fill="#b98d4f" opacity={0.5} />
      <path d={oranges.map(([x, y]) => circle(x, y, 38)).join('')} fill="#e08a2c" opacity={0.86} />
      <path d="M330 494c18-22 40-18 46-4c-18 14-34 12-46 4" fill="#4f7a4a" opacity={0.8} />
      <path d="M602 478L792 466L804 800L614 812z" fill="#fbf5e2" />
      <path d="M806 690V800a46 16 0 0 0 92 0V690z" fill="#3d6a6c" opacity={0.62} />
      <path d={ell(852, 690, 46, 16)} fill="#5f8c8c" opacity={0.6} />
      <path d={ell(1090, 742, 50, 34) + circle(1148, 706, 22)} fill="#93a4b1" opacity={0.6} />
      <path d="M1168 700l26 6l-24 10z" fill={ORANGE} opacity={0.9} />
    </Wash>
    <Strokes t0={26} step={3} d={[
      'M232 704H428V812H232z', 'M232 740H428', 'M232 776H428', 'M296 704V812', 'M364 704V812',
      ...oranges.map(([x, y]) => circle(x, y, 38)), 'M330 494c18-22 40-18 46-4c-18 14-34 12-46 4',
      'M602 478L792 466L804 800L614 812z', ...[0, 1, 2, 3, 4, 5].map(i => `M632 ${520 + i * 34}L770 ${512 + i * 34}`), 'M640 770L764 762',
      ell(852, 690, 46, 16), 'M806 690V800', 'M898 690V800', 'M806 800a46 16 0 0 0 92 0', 'M806 730a46 16 0 0 0 92 0',
      'M980 470V560', 'M980 470H1040', 'M1216 660V570', 'M1216 660H1156', ...[0, 1, 2, 3, 4, 5, 6].map(i => `M${1012 + i * 26} 566h12`),
      ell(1090, 742, 50, 34), circle(1148, 706, 22), 'M1168 700l26 6l-24 10', circle(1151, 702, 3), 'M1042 736l-44-18', 'M1042 748l-46 6', 'M1080 776v26', 'M1104 776v26', 'M980 804H1220',
    ]} />
  </>
);

const Art4: React.FC = () => (
  <>
    <Wash t0={100} dur={32} x={150} y={400} w={1100} h={460}>
      <path d="M310 742C330 850 630 850 650 742z" fill={COPPER} opacity={0.62} />
      <path d={ell(480, 742, 170, 44)} fill="#d59a62" opacity={0.6} />
      <path d="M468 742V470h26V742z" fill="#f4e7c0" />
      <path d="M704 432L688 612L742 604z" fill="#2b2f36" opacity={0.6} />
      <path d="M944 600H1176a14 14 0 0 1 14 14V790a14 14 0 0 1-14 14H944a14 14 0 0 1-14-14V614a14 14 0 0 1 14-14z" fill="#27494c" opacity={0.66} />
      <path d="M990 640h30v24h-30zM1100 640h30v24h-30z" fill="#c79a45" opacity={0.9} />
    </Wash>
    <Strokes t0={26} step={3} d={[
      'M150 826C420 822 900 830 1240 824',
      ell(480, 742, 170, 44), 'M310 742C330 850 630 850 650 742', 'M420 826H540',
      'M468 742V470h26V742', ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `M468 ${500 + i * 30}h${i % 2 ? 10 : 16}`),
      'M770 822L706 430', 'M704 432L688 612L742 604z', 'M770 822c6 26 40 22 38-6',
      'M944 600H1176a14 14 0 0 1 14 14V790a14 14 0 0 1-14 14H944a14 14 0 0 1-14-14V614a14 14 0 0 1 14-14z',
      'M1010 600C1010 548 1110 548 1110 600', 'M930 652H1190', 'M990 640h30v24h-30z', 'M1100 640h30v24h-30z',
    ]} />
    <Strokes t0={150} step={6} dur={10} w={3} color={GOLD} d={['M1040 566l10-14', 'M1060 558l8-16', 'M1082 560l-4-18']} />
    <Rain x0={340} x1={620} ground={730} maxLen={480} n={11} seed={63} t0={78} span={70} drift={0.16} />
  </>
);

const PANELS: { art: React.FC; lines: string[]; plate: string }[] = [
  { art: Art1, plate: 'PLATE I — RAIN, RISING', lines: ['雨是往上落的。', '每落一場，', '帶走一個年代。'] },
  { art: Art2, plate: 'PLATE II — THE SUITCASE', lines: ['有一只手提箱，', '盛得下一整個年代的零碎，', '卻護不了一個尋常人。'] },
  { art: Art3, plate: 'PLATE III — WHAT IT KEEPS', lines: ['它記得街角賣柑橘的女孩，', '記得押後一班的管家，', '記得一句始終沒有寫下的話。'] },
  { art: Art4, plate: 'PLATE IV — THE ONE WHO MEASURES', lines: ['提著它的人，只量雨，不淋雨。', '只有箱子知道：', '那隻手，握緊過。'] },
];

const Page: React.FC<{ i: number }> = ({ i }) => {
  const f = useCurrentFrame();
  const { art: Art, lines, plate } = PANELS[i];
  return (
    <AbsoluteFill style={{ backgroundImage: `url(${staticFile('tex/paper.jpg')})`, backgroundSize: 'cover' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id={`wob${i}`} filterUnits="userSpaceOnUse" x={120} y={100} width={1180} height={800}>
            <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves={2} seed={11 + i} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={7} xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="wsh" filterUnits="userSpaceOnUse" x={100} y={80} width={1220} height={860}>
            <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves={3} seed={5} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={34} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <g filter={`url(#wob${i})`}><Art /></g>
        <path d="M96 96H1824V984H96z" fill="none" stroke={INK} strokeWidth={1.2} strokeOpacity={0.5} />
        <path d="M108 108H1812V972H108z" fill="none" stroke={INK} strokeWidth={0.6} strokeOpacity={0.4} />
        <path d="M1420 150V930" stroke={INK} strokeWidth={0.6} strokeOpacity={0.3} />
      </svg>
      <Caption lines={lines} at={[34, 96, 158]} x={1690} y={176} />
      <div style={{ position: 'absolute', left: 150, bottom: 126, fontFamily: MONO, fontSize: 28, letterSpacing: '0.2em', color: STAMP, opacity: 0.85 * reveal(f, 30, 24) }}>{plate}</div>
    </AbsoluteFill>
  );
};

// 翻過去：這一頁從左緣掀起、往右捲走，露出底下那一頁（直排的書是往右翻的）
const Peel: React.FC<{ id: string; q: number; children: React.ReactNode }> = ({ id, q, children }) => {
  if (q <= 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  const bottom = Math.min(1, q / 0.78), top = Math.max(0, (q - 0.28) / 0.72);
  const xTop = W * top, xBottom = W * bottom, curl = Math.sin(q * Math.PI), bow = W * 0.19 * curl;
  const cTop = Math.max(0, xTop - bow), cBottom = Math.max(0, xBottom - bow * 0.78), fold = 24 + W * 0.2 * curl;
  const oTop = Math.max(0, xTop - fold), oBottom = Math.max(0, xBottom - fold * 0.72), ocTop = Math.max(0, cTop - fold * 0.78), ocBottom = Math.max(0, cBottom - fold * 0.58);
  const edge = `M${xTop} 0C${cTop} ${H * 0.31} ${cBottom} ${H * 0.7} ${xBottom} ${H}`;
  const front = `${edge}H${W}V0Z`;
  const foldPath = `${edge}L${oBottom} ${H}C${ocBottom} ${H * 0.7} ${ocTop} ${H * 0.31} ${oTop} 0Z`;
  return (
    <AbsoluteFill>
      <svg width={0} height={0} style={{ position: 'absolute' }}><defs><clipPath id={id} clipPathUnits="userSpaceOnUse"><path d={front} /></clipPath></defs></svg>
      <AbsoluteFill style={{ clipPath: `url(#${id})` }}>{children}</AbsoluteFill>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id={`${id}g`} x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#d5cfc4" stopOpacity={0.94} /><stop offset="28%" stopColor="#f3efe7" /><stop offset="62%" stopColor="#fffef9" /><stop offset="100%" stopColor="#d8d0c3" stopOpacity={0.9} />
          </linearGradient>
        </defs>
        <path d={edge} fill="none" stroke="#302b25" strokeWidth={30 + curl * 60} opacity={0.05 + curl * 0.09} />
        <path d={foldPath} fill={`url(#${id}g)`} opacity={0.82 + curl * 0.16} />
        <path d={edge} fill="none" stroke="#b7ada0" strokeWidth={2 + curl * 2.5} opacity={0.6 + curl * 0.3} />
      </svg>
    </AbsoluteFill>
  );
};

const Panel: React.FC<{ i: number }> = ({ i }) => {
  const f = useCurrentFrame();
  const last = i === PANELS.length - 1;
  const q = last ? 0 : reveal(f, P, T);
  const out = last ? interpolate(f, [P - 16, P - 1], [0, 1], clamp) : 0;
  return (
    <>
      <Peel id={`peel${i}`} q={q}><Page i={i} /></Peel>
      {out > 0 ? <AbsoluteFill style={{ backgroundColor: '#0b1415', opacity: out }} /> : null}
    </>
  );
};

export const Handdrawn: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: TEAL }}>
    {PANELS.map((_, k) => PANELS.length - 1 - k).map(i => (
      <Sequence key={i} from={i * P} durationInFrames={i === PANELS.length - 1 ? P : P + T}><Panel i={i} /></Sequence>
    ))}
  </AbsoluteFill>
);
