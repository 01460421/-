'use client';
import katex from 'katex';
import { useMemo } from 'react';

/** KaTeX 渲染；display=true 為區塊公式 */
export default function Tex({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false });
    } catch {
      return tex;
    }
  }, [tex, display]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 把含 $...$ / $$...$$ 的說明文字切段渲染 */
export function RichTex({ text }: { text: string }) {
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
  return (
    <span>
      {parts.map((p, i) =>
        p.startsWith('$$') ? <Tex key={i} tex={p.slice(2, -2)} display /> : p.startsWith('$') ? <Tex key={i} tex={p.slice(1, -1)} /> : <span key={i}>{p}</span>,
      )}
    </span>
  );
}
