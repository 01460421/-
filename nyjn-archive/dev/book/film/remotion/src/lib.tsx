// 共用的小工具。
// 幾樣做法取自這些 skill，各自註明：
//   PageCam 的 2.5D 相機算法（用 CSS zoom 放大，字才不糊）── video-shotcraft（Apache-2.0，Vincent Wei）
//   由左而右的圖層顯影、翻頁的捲邊 ── story-to-handdrawn-video（MIT，gnipbao）
//   筆畫的 pathLength=1 與圓頭虛線的 1 / 1.2 ── pixel2motion（MIT，Nolan Lai）
//   時間與緩動的數字 ── LottieFiles motion-design-skill（MIT）
import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';

export const INK = '#10151a', PAPER = '#f2ebdb', GOLD = '#a9853f', FOIL = '#d6bd84', TEAL = '#10262b', STAMP = '#22409a', ORANGE = '#d9822b', COPPER = '#b9703a';
export const CJK = '"Iansui", serif', HEAD = '"NiYu", serif', LAT = '"IM Fell English", serif', MONO = '"Courier Prime", monospace';

export const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
export const eOut = Easing.bezier(0.05, 0.7, 0.1, 1);          // 進場
export const eInOut = Easing.bezier(0.4, 0, 0.2, 1);           // 在畫面上移動
export const eCam = Easing.bezier(0.33, 0, 0.15, 1);           // 相機
export const prog = (f: number, t0: number, dur: number, ease = eInOut) => interpolate(f, [t0, t0 + Math.max(1, dur)], [0, 1], { ...clamp, easing: ease });
const smooth = (v: number) => v * v * (3 - 2 * v);
export const reveal = (f: number, t0: number, dur: number) => smooth(interpolate(f, [t0, t0 + Math.max(1, dur)], [0, 1], clamp));

// 固定種子的亂數
export const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// 倒著落的雨滴：圓的在上，尖的在下
export const dropPath = (x: number, y: number, r: number) =>
  `M${x} ${y + r * 1.9}C${x - r * 1.15} ${y + r * 0.5} ${x - r} ${y - r} ${x} ${y - r}C${x + r} ${y - r} ${x + r * 1.15} ${y + r * 0.5} ${x} ${y + r * 1.9}Z`;

// 一筆：從頭畫到尾
export const Ink: React.FC<{ d: string; t0: number; dur?: number; w?: number; color?: string; opacity?: number; fill?: string }> = ({ d, t0, dur = 18, w = 3.4, color = INK, opacity = 1, fill = 'none' }) => {
  const f = useCurrentFrame();
  const p = prog(f, t0, dur);
  if (p <= 0) return null;
  return <path d={d} pathLength={1} fill={fill} fillOpacity={fill === 'none' ? 0 : reveal(f, t0 + dur * 0.7, dur * 0.5)} stroke={color} strokeWidth={w} strokeOpacity={opacity} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1.2" strokeDashoffset={1.1 * (1 - p)} />;
};

// 一塊顏色：由左而右顯出來，疊在線稿底下
export const Wash: React.FC<{ t0: number; dur?: number; children: React.ReactNode; x: number; y: number; w: number; h: number }> = ({ t0, dur = 26, children, x, y, w, h }) => {
  const f = useCurrentFrame();
  const p = reveal(f, t0, dur);
  if (p <= 0) return null;
  const id = `w${Math.round(x)}-${Math.round(y)}-${t0}`;
  return (
    <g>
      <defs><clipPath id={id}><rect x={x} y={y} width={w * p} height={h} /></clipPath></defs>
      <g clipPath={`url(#${id})`} style={{ mixBlendMode: 'multiply' }}><g filter="url(#wsh)">{children}</g></g>
    </g>
  );
};

// 往上落的雨：一組線，由下往上畫，水滴最後出現
export const Rain: React.FC<{ x0: number; x1: number; ground: number; maxLen: number; n: number; seed: number; t0: number; span?: number; color?: string; w?: number; drift?: number }> = ({ x0, x1, ground, maxLen, n, seed, t0, span = 60, color = INK, w = 2.2, drift = 0 }) => {
  const f = useCurrentFrame();
  const R = rng(seed);
  const items = [];
  for (let k = 0; k < n; k++) {
    const x = x0 + (x1 - x0) * ((k + 0.15 + R() * 0.7) / n), len = 40 + Math.pow(R(), 1.6) * maxLen, r = 3.2 + R() * 3.4, start = t0 + R() * span, g = ground - R() * 14;
    const p = prog(f, start, 20 + len / 22, eOut);
    if (p <= 0) continue;
    const lift = drift * Math.max(0, f - start - 30) * (0.6 + R() * 0.8);
    const top = g - len * p - lift;
    items.push(<g key={k}><line x1={x} y1={g - lift * 0.35} x2={x} y2={top + r * 2} stroke={color} strokeWidth={w} strokeLinecap="round" strokeOpacity={0.75} /><path d={dropPath(x, top + r, r)} fill={color} fillOpacity={interpolate(p, [0.5, 1], [0, 1], clamp)} /></g>);
  }
  return <g>{items}</g>;
};

// 直排的字幕：一句一欄，由上往下顯出來
export const Caption: React.FC<{ lines: string[]; at: number[]; x: number; y: number; size?: number; pitch?: number; color?: string }> = ({ lines, at, x, y, size = 46, pitch = 92, color = INK }) => {
  const f = useCurrentFrame();
  return (
    <>
      {lines.map((l, i) => {
        const p = prog(f, at[i], 22, eOut);
        if (p <= 0) return null;
        return (
          <div key={i} style={{ position: 'absolute', left: x - i * pitch, top: y, writingMode: 'vertical-rl', fontFamily: CJK, fontSize: size, lineHeight: `${pitch}px`, letterSpacing: '0.14em', color, whiteSpace: 'nowrap', clipPath: `inset(0 0 ${(1 - p) * 100}% 0)`, opacity: interpolate(p, [0, 0.4], [0, 1], clamp) }}>{l}</div>
        );
      })}
    </>
  );
};

// 2.5D 相機：算法照 video-shotcraft 的 PageCam（焦點落在畫面中心，放大用 CSS zoom）
export type CamKey = { frame: number; cx: number; cy: number; zoom: number; rotX?: number; rotY?: number; rotZ?: number; persp?: number };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const camAt = (keys: CamKey[], frame: number) => {
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (frame >= keys[i].frame && frame <= keys[i + 1].frame) { a = keys[i]; b = keys[i + 1]; break; }
  if (frame <= keys[0].frame) b = a = keys[0];
  const t = a.frame === b.frame ? 1 : interpolate(frame, [a.frame, b.frame], [0, 1], { ...clamp, easing: eCam });
  return { cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), zoom: lerp(a.zoom, b.zoom, t), rotX: lerp(a.rotX ?? 0, b.rotX ?? 0, t), rotY: lerp(a.rotY ?? 0, b.rotY ?? 0, t), rotZ: lerp(a.rotZ ?? 0, b.rotZ ?? 0, t), persp: lerp(a.persp ?? 1400, b.persp ?? 1400, t) };
};
export const Cam: React.FC<{ keys: CamKey[]; w: number; h: number; children: React.ReactNode; frame?: number }> = ({ keys, w, h, children, frame }) => {
  const own = useCurrentFrame();
  const c = camAt(keys, frame ?? own);
  return (
    <div style={{ position: 'absolute', inset: 0, perspective: `${c.persp * c.zoom}px`, perspectiveOrigin: '960px 540px' }}>
      <div style={{ position: 'absolute', width: w, height: h, zoom: c.zoom, transform: `translate(${960 / c.zoom - c.cx}px, ${540 / c.zoom - c.cy}px) rotateY(${c.rotY}deg) rotateX(${c.rotX}deg) rotateZ(${c.rotZ}deg)`, transformOrigin: `${c.cx}px ${c.cy}px`, transformStyle: 'preserve-3d' }}>{children}</div>
    </div>
  );
};
