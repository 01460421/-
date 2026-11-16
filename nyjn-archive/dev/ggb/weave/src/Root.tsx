import React, { useEffect, useState } from 'react';
import { Composition, continueRender, delayRender, staticFile } from 'remotion';
import { FPS, T, Weave } from './Weave';

const Fonts: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState(() => delayRender('fonts'));
  const [ok, setOk] = useState(false);
  useEffect(() => {
    new FontFace('NiYu', `url(${staticFile('fonts/NiYu-sub.woff2')})`).load().then(ff => { (document as any).fonts.add(ff); setOk(true); continueRender(handle); });
  }, [handle]);
  return ok ? <>{children}</> : null;
};
const Main: React.FC = () => <Fonts><Weave /></Fonts>;
export const Root: React.FC = () => <Composition id="Weave" component={Main} durationInFrames={T} fps={FPS} width={1920} height={1080} />;
