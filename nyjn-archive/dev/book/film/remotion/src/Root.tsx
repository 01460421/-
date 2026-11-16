import React, { useEffect, useState } from 'react';
import { Composition, continueRender, delayRender, staticFile } from 'remotion';
import { Handdrawn, P } from './Handdrawn';
import { BOOK_FRAMES, BookShots } from './BookShots';

// 字型都用本機的檔，載好了才開始算圖
const FONTS: [string, string, string][] = [
  ['NiYu', 'fonts/NiYu-film.woff2', 'normal'], ['Iansui', 'fonts/Iansui-film.woff2', 'normal'],
  ['IM Fell English', 'fonts/IMFellEnglish.woff2', 'normal'], ['IM Fell English', 'fonts/IMFellEnglishital1.woff2', 'italic'], ['Courier Prime', 'fonts/CourierPrime.woff2', 'normal'],
];
const Fonts: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState(() => delayRender('fonts'));
  const [ok, setOk] = useState(false);
  useEffect(() => {
    Promise.all(FONTS.map(([fam, src, style]) => new FontFace(fam, `url(${staticFile(src)})`, { style }).load().then(f => { (document as any).fonts.add(f); })))
      .then(() => { setOk(true); continueRender(handle); });
  }, [handle]);
  return ok ? <>{children}</> : null;
};
const H: React.FC = () => <Fonts><Handdrawn /></Fonts>;
const B: React.FC = () => <Fonts><BookShots /></Fonts>;

export const Root: React.FC = () => (
  <>
    <Composition id="Handdrawn" component={H} durationInFrames={P * 4} fps={30} width={1920} height={1080} />
    <Composition id="BookShots" component={B} durationInFrames={BOOK_FRAMES} fps={30} width={1920} height={1080} />
  </>
);
