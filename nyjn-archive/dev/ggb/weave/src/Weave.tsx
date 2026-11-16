// 《交織》：6 與 37 各在一座金色拱門裡，由 GeoGebra 的方程式一筆一筆畫出來；
// 金、藍兩條緞帶在兩座拱門之間編織，一上一下；中段兩座拱門繞行換位，鏡頭推近兩人的臉；
// 上色之後拉遠，兩座拱門靠攏，金環與藍環在背後扣在一起。背景是深青色的地、金色的放射線、往上落的雨，
// 和 GeoGebra 排出來的方程式（淡淡的金色）。
import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, getInputProps, interpolate, staticFile, useCurrentFrame } from 'remotion';
// 量速度用：--props='{"off":"backdrop,shadow"}' 可以關掉某幾層
const OFF = new Set(String((getInputProps() as { off?: string }).off ?? '').split(','));

export const FPS = 30;
export const T = 2843;                         // 94.76 秒，配樂的長度
const F0 = 150, F1 = 2250, NREC = 1330;        // 畫的那一段：第 F0 到 F1 格，對到錄影的 0–1330 步
const GOLD = '#d9bd7c', GOLD2 = '#a97d36', BLUE = '#86bde8', BLUE2 = '#3d77ae', IVORY = '#f4ecd8';
const C = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
const io = Easing.bezier(0.45, 0, 0.2, 1), out = Easing.bezier(0.1, 0.7, 0.2, 1);
const ip = (f: number, a: number[], b: number[], e = io) => interpolate(f, a, b, { ...C, easing: e });
const rng = (s: number) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const pad = (n: number) => String(n).padStart(4, '0');

/* ── 拱門 ── */
const CW = 520, CH = 880, R = CW / 2;          // 內框
const archPath = (w: number, h: number, o: number) => {
  const x0 = -o, x1 = w + o, y1 = h + o, r = w / 2 + o;
  return `M${x0} ${y1}V${r - o}A${r} ${r} 0 0 1 ${x1} ${r - o}V${y1}Z`;
};
const Arch: React.FC<{ f: number; src: string; fw: number; num: string; cx: number; cy: number; s: number; dim: number; draw: number; hue: string; shine: number }> = ({ f, src, fw, num, cx, cy, s, dim, draw, hue, shine }) => {
  const sweep = ((f * 9) % 2400) - 600;
  const fh = 840, w = (fw / 1012) * fh;
  return (
    <div style={{ position: 'absolute', left: cx - CW / 2, top: cy - CH / 2, width: CW, height: CH, transform: `scale(${s})`, transformOrigin: '50% 50%', }}>
      {/* 卡片 */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: `${R}px ${R}px 6px 6px`, overflow: 'hidden', background: '#fff', opacity: ip(draw, [0.35, 0.9], [0, 1]), boxShadow: OFF.has('shadow') ? undefined : '0 30px 80px rgba(0,0,0,.55)' }}>
        <Img src={src} style={{ position: 'absolute', left: (CW - w) / 2, bottom: 16, height: fh, width: w }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: `${R}px ${R}px 6px 6px`, boxShadow: OFF.has('shadow') ? undefined : 'inset 0 0 60px rgba(120,90,40,.18)' }} />
        {/* 上色完成時，一道光斜斜掃過 */}
        {OFF.has('shine') ? null : <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(115deg, rgba(255,250,230,0) ${shine - 14}%, rgba(255,246,214,.55) ${shine}%, rgba(255,250,230,0) ${shine + 14}%)`, mixBlendMode: 'screen' }} />}
        {dim > 0.01 ? <div style={{ position: 'absolute', inset: 0, background: '#0d2a2e', opacity: dim * 0.24 }} /> : null}
      </div>
      {/* 金框：一圈粗、一圈細，畫出來；光沿著框走 */}
      <svg width={CW + 80} height={CH + 80} viewBox={`-40 -40 ${CW + 80} ${CH + 80}`} style={{ position: 'absolute', left: -40, top: -40, overflow: 'visible' }}>
        <defs>
          <linearGradient id={`g${num}`} gradientUnits="userSpaceOnUse" x1={sweep} y1={0} x2={sweep + 520} y2={CH}>
            <stop offset="0" stopColor={GOLD2} /><stop offset="0.45" stopColor={GOLD} /><stop offset="0.5" stopColor="#fff6dc" /><stop offset="0.55" stopColor={GOLD} /><stop offset="1" stopColor={GOLD2} />
          </linearGradient>
        </defs>
        <path d={archPath(CW, CH, 14)} fill="none" stroke={`url(#g${num})`} strokeWidth={4} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
        <path d={archPath(CW, CH, 24)} fill="none" stroke={GOLD} strokeOpacity={0.55} strokeWidth={1.4} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ip(draw, [0.15, 1], [0, 1])} />
        <path d={archPath(CW, CH, 6)} fill="none" stroke={hue} strokeOpacity={0.5} strokeWidth={1} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ip(draw, [0.3, 1], [0, 1])} />
        {/* 兩側與底角的菱形 */}
        {[[-14, R + 10], [CW + 14, R + 10], [-14, CH + 14], [CW + 14, CH + 14]].map(([x, y], k) => (
          <path key={k} d={`M${x} ${y - 11}L${x + 7} ${y}L${x} ${y + 11}L${x - 7} ${y}Z`} fill={GOLD} opacity={ip(draw, [0.7 + k * 0.05, 0.95], [0, 1])} />
        ))}
        {/* 拱頂的圓章與編號 */}
        <g opacity={ip(draw, [0.6, 1], [0, 1])} transform={`translate(${CW / 2},-30)`}>
          <circle r={40} fill="#0b1a1d" stroke={`url(#g${num})`} strokeWidth={3} />
          <circle r={33} fill="none" stroke={hue} strokeOpacity={0.6} strokeWidth={1} />
          <text y={13} textAnchor="middle" fontFamily='"NiYu", serif' fontSize={num.length > 1 ? 34 : 40} fill={GOLD}>{num}</text>
        </g>
      </svg>
    </div>
  );
};

/* ── 緞帶：兩條正弦，金與藍相位差 π；在交叉處一上一下，在拱門前後交替 ── */
const ribbonSegs = (f: number, phase: number, amp: number, reveal: number, lam = 560, speed = 0.012, wob = 26) => {
  const k = (2 * Math.PI) / lam, t = f * speed;
  const segs: { d: string; over: boolean }[] = [];
  let cur: string[] = [], curOver: boolean | null = null;
  for (let x = -120; x <= 2040; x += 6) {
    const vis = Math.abs(x - 960) <= reveal;
    const a = k * x + phase + t;
    const env = 0.55 + 0.45 * Math.cos(((x - 960) / 1100) * Math.PI);
    const y = 540 + amp * env * Math.sin(a) + wob * Math.sin(a * 0.5 + t * 0.7);
    const over = Math.floor((a - Math.PI / 2) / Math.PI) % 2 === 0;
    if (!vis) { if (cur.length > 1) segs.push({ d: 'M' + cur.join('L'), over: !!curOver }); cur = []; curOver = null; continue; }
    if (curOver !== null && over !== curOver) { cur.push(`${x} ${y.toFixed(1)}`); segs.push({ d: 'M' + cur.join('L'), over: curOver }); cur = []; }
    cur.push(`${x} ${y.toFixed(1)}`);
    curOver = over;
  }
  if (cur.length > 1) segs.push({ d: 'M' + cur.join('L'), over: !!curOver });
  return segs;
};
type Card = { x: number; y: number; s: number; op: number };
const Ribbons: React.FC<{ f: number; layer: 'back' | 'front'; amp: number; reveal: number; op: number; cards: Card[] }> = ({ f, layer, amp, reveal, op, cards }) => {
  const A = ribbonSegs(f, 0, amp, reveal), B = ribbonSegs(f, Math.PI, amp, reveal);
  // 第二對：細的金線與藍線，擺得更開，從拱頂上面、底座下面繞過去，往反方向流
  const a2 = ribbonSegs(f, 0.9, 500, reveal, 860, -0.007, 14), b2 = ribbonSegs(f, 0.9 + Math.PI, 500, reveal, 860, -0.007, 14);
  const thin = (segs: typeof A, c: string, id: string, flip: boolean) => segs.filter(s => (layer === 'front') === (flip ? !s.over : s.over)).map((s, i) => (
    <g key={id + i}>
      <path d={s.d} fill="none" stroke="#06100f" strokeOpacity={0.5} strokeWidth={5} strokeLinecap="round" />
      <path d={s.d} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </g>
  ));
  const fine = <>{thin(a2, GOLD, 'c', false)}{thin(b2, BLUE, 'd', true)}</>;
  const draw = (segs: typeof A, c1: string, c2: string, id: string, flip: boolean) => segs.filter(s => (layer === 'front') === (flip ? !s.over : s.over)).map((s, i) => (
    <g key={id + i}>
      <path d={s.d} fill="none" stroke="#06100f" strokeOpacity={0.55} strokeWidth={15} strokeLinecap="round" />
      <path d={s.d} fill="none" stroke={c2} strokeWidth={9} strokeLinecap="round" />
      <path d={s.d} fill="none" stroke={c1} strokeWidth={5} strokeLinecap="round" />
      <path d={s.d} fill="none" stroke="#fffbea" strokeOpacity={0.7} strokeWidth={1.2} strokeLinecap="round" />
    </g>
  ));
  if (layer === 'back') return <svg width={1920} height={1080} style={{ position: 'absolute', overflow: 'visible', opacity: op }}>{fine}{draw(A, GOLD, GOLD2, 'a', false)}{draw(B, BLUE, BLUE2, 'b', true)}</svg>;
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', overflow: 'visible', opacity: op }}>
      <defs>
        <mask id="cards" maskUnits="userSpaceOnUse" x={-400} y={-400} width={2720} height={1880}>
          <rect x={-400} y={-400} width={2720} height={1880} fill="#fff" />
          {cards.map((c, i) => (
            <path key={i} d={archPath(CW, CH, 0)} fill="#000" fillOpacity={c.op} transform={`translate(${c.x} ${c.y}) scale(${c.s}) translate(${-CW / 2} ${-CH / 2})`} />
          ))}
        </mask>
      </defs>
      <g mask={OFF.has('mask') ? undefined : 'url(#cards)'}>{fine}{draw(A, GOLD, GOLD2, 'a', false)}{draw(B, BLUE, BLUE2, 'b', true)}</g>
    </svg>
  );
};

/* ── 金環與藍環扣在一起（片尾） ── */
const Rings: React.FC<{ p: number; layer: 'back' | 'front' }> = ({ p, layer }) => {
  if (p <= 0) return null;
  const r = 470, c1 = 760, c2 = 1160, cy = 540;
  const arc = (cx: number, a0: number, a1: number) => {
    const P = (a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    return `M${P(a0)}A${r} ${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} 1 ${P(a1)}`;
  };
  const th = Math.acos((c2 - c1) / 2 / r);    // 兩環交點的角度
  // 金環：上交點那一小段在前；藍環：下交點那一小段在前
  const gold = { all: arc(c1, -Math.PI + 0.001, Math.PI - 0.001), front: arc(c1, -th - 0.14, -th + 0.14) };
  const blue = { all: arc(c2, 0.001, 2 * Math.PI - 0.001), front: arc(c2, Math.PI - th - 0.14, Math.PI - th + 0.14) };
  const st = (c: string, c2: string, d: string, k: number) => (
    <g key={k}>
      <path d={d} fill="none" stroke="#06100f" strokeOpacity={0.6} strokeWidth={16} pathLength={1} strokeDasharray="1 1" strokeDashoffset={layer === 'back' ? 1 - p : 0} />
      <path d={d} fill="none" stroke={c2} strokeWidth={9} pathLength={1} strokeDasharray="1 1" strokeDashoffset={layer === 'back' ? 1 - p : 0} />
      <path d={d} fill="none" stroke={c} strokeWidth={4.5} pathLength={1} strokeDasharray="1 1" strokeDashoffset={layer === 'back' ? 1 - p : 0} />
    </g>
  );
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', overflow: 'visible' }}>
      {layer === 'back' ? [st(GOLD, GOLD2, gold.all, 0), st(BLUE, BLUE2, blue.all, 1)] : p > 0.98 ? [st(GOLD, GOLD2, gold.front, 2), st(BLUE, BLUE2, blue.front, 3)] : null}
    </svg>
  );
};

/* ── 背景：放射線、同心圓、方程式、往上落的雨 ── */
const Backdrop: React.FC<{ f: number; cam: { x: number; y: number; s: number } }> = ({ f, cam }) => {
  const R1 = rng(1999), drops = [];
  for (let i = 0; i < 70; i++) {
    const x = R1() * 1920, sp = 1.2 + R1() * 2.6, len = 40 + R1() * 160, ph = R1() * 1400, r = 1.6 + R1() * 2.2, a = 0.25 + R1() * 0.5;
    const y = 1180 - ((f * sp + ph) % 1400);
    drops.push(<g key={i} opacity={a}><line x1={x} y1={y + r * 2} x2={x} y2={y + len} stroke={GOLD} strokeWidth={1.1} /><circle cx={x} cy={y + r} r={r} fill={GOLD} /></g>);
  }
  const px = (cam.x - 960) * -0.04, py = (cam.y - 540) * -0.04;
  const intro = ip(f, [0, 90], [0, 1], out);
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 48%, #163338 0%, #0b1c1f 55%, #040a0b 100%)' }}>
      {/* GeoGebra 排出來的方程式，反白成淡金色，左欄往上、右欄往下 */}
      {[['c6', 40, -1], ['c37', 1240, 1]].map(([n, x, dir]) => (
        <div key={n as string} style={{ position: 'absolute', left: (x as number) + px, top: 0, width: 640, height: 1080, overflow: 'hidden', opacity: 0.13 * intro }}>
          <Img src={staticFile(`tex/eqg-${n}.png`)} style={{ position: 'absolute', width: 640, left: 0, top: ((dir as number) > 0 ? -3000 + f * 0.9 : -f * 0.9) % 4154 }} />
        </div>
      ))}
      <svg width={1920} height={1080} style={{ position: 'absolute', left: px, top: py }}>
        <g transform={`translate(960 540) rotate(${f * 0.012})`} opacity={0.09 * intro}>
          {Array.from({ length: 72 }, (_, k) => { const a = (k / 72) * Math.PI * 2, r0 = 230 + (k % 2) * 60; return <line key={k} x1={r0 * Math.cos(a)} y1={r0 * Math.sin(a)} x2={1300 * Math.cos(a)} y2={1300 * Math.sin(a)} stroke={GOLD} strokeWidth={k % 6 === 0 ? 2 : 0.8} />; })}
        </g>
        <g transform={`translate(960 540) rotate(${-f * 0.03})`} fill="none" stroke={GOLD} opacity={0.16 * intro}>
          <circle r={300} strokeDasharray="2 10" /><circle r={430} strokeWidth={0.8} /><circle r={560} strokeDasharray="30 12 4 12" strokeWidth={0.8} />
        </g>
        {drops}
      </svg>
    </AbsoluteFill>
  );
};

export const Weave: React.FC = () => {
  const f = useCurrentFrame();
  const rec = Math.round(ip(f, [F0, F1], [0, NREC], (x: number) => x));
  // 換位：第 600–720 格繞行半圈，第 1200–1320 格再繞半圈回來
  const theta = ip(f, [600, 720], [0, Math.PI]) + ip(f, [1200, 1320], [0, Math.PI]);
  const gather = ip(f, [2250, 2460], [0, 1]);
  const sep = 360 - 80 * gather;
  const left = { x: 960 - sep * Math.cos(theta), y: 540 - 46 * Math.sin(theta), s: 1 - 0.17 * Math.sin(theta), dim: Math.max(0, Math.sin(theta)) };
  const right = { x: 960 + sep * Math.cos(theta), y: 540 + 46 * Math.sin(theta), s: 1 + 0.05 * Math.sin(theta), dim: Math.max(0, -Math.sin(theta)) };
  // 鏡頭：推近 6 的臉 → 移到 37 的臉 → 拉遠
  const zoom = ip(f, [1380, 1500, 1830, 1950], [1, 1.75, 1.75, 1]);
  const focusX = ip(f, [1380, 1500, 1620, 1740, 1830, 1950], [960, 600, 600, 1320, 1320, 960]);
  const focusY = ip(f, [1380, 1500, 1830, 1950], [540, 250, 250, 540]);
  const cam = { x: focusX, y: focusY, s: zoom };
  const draw = ip(f, [20, 130], [0, 1]);
  const reveal = ip(f, [50, 260], [0, 1150], out);
  const ribOp = 1 - ip(f, [2300, 2480], [0, 1]);
  const ring = ip(f, [2280, 2560], [0, 1]);
  const black = Math.max(1 - ip(f, [0, 24], [0, 1]), ip(f, [T - 70, T - 4], [0, 1]));
  const order = left.s <= right.s ? ['L', 'R'] : ['R', 'L'];
  const cardOp = ip(draw, [0.35, 0.9], [0, 1]);
  const cards = [{ x: left.x, y: left.y, s: left.s, op: cardOp }, { x: right.x, y: right.y, s: right.s, op: cardOp }];
  const shine = ip(f, [2240, 2330], [-20, 130], (x: number) => x);
  const arch = (k: string) => k === 'L'
    ? <Arch key="L" f={f} src={staticFile(`f6/${pad(rec)}.jpg`)} fw={314} num="6" cx={left.x} cy={left.y} s={left.s} dim={left.dim} draw={draw} hue={GOLD} shine={shine} />
    : <Arch key="R" f={f} src={staticFile(`f37/${pad(rec)}.jpg`)} fw={588} num="37" cx={right.x} cy={right.y} s={right.s} dim={right.dim} draw={draw} hue={BLUE} shine={shine} />;
  return (
    <AbsoluteFill style={{ backgroundColor: '#040a0b' }}>
      {OFF.has('backdrop') ? null : <Backdrop f={f} cam={cam} />}
      <AbsoluteFill style={{ transform: `translate(${960 - cam.x * cam.s}px, ${540 - cam.y * cam.s}px) scale(${cam.s})`, transformOrigin: '0 0' }}>
        <Rings p={ring} layer="back" />
        {OFF.has('ribbons') ? null : <Ribbons f={f} layer="back" amp={330} reveal={reveal} op={ribOp} cards={cards} />}
        {OFF.has('arches') ? null : order.map(arch)}
        {OFF.has('ribbons') ? null : <Ribbons f={f} layer="front" amp={330} reveal={reveal} op={ribOp} cards={cards} />}
        <Rings p={ring} layer="front" />
      </AbsoluteFill>
      {OFF.has('vignette') ? null : <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 75% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%)' }} />}
      {OFF.has('grain') ? null : <AbsoluteFill style={{ backgroundImage: `url(${staticFile('tex/grain-a.png')})` }} />}
      {black > 0 ? <AbsoluteFill style={{ backgroundColor: '#040a0b', opacity: black }} /> : null}
      <Audio src={staticFile('audio/music.wav')} />
    </AbsoluteFill>
  );
};
