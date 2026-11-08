/**
 * 法遵用語守門（規格第十一節）：介面與 AI 回答不得出現「保證」「必漲」「穩賺」等字眼。
 */
const FORBIDDEN: [RegExp, string][] = [
  [/保證/g, '（不保證）'],
  [/必漲/g, '（無法預知漲跌）'],
  [/必跌/g, '（無法預知漲跌）'],
  [/穩賺/g, '（投資有風險）'],
  [/穩賠/g, '（投資有風險）'],
  [/包賺/g, '（投資有風險）'],
  [/零風險/g, '（投資有風險）'],
  [/guaranteed?/gi, '(not guaranteed)'],
];

export function sanitizeCompliance(text: string): string {
  let out = text;
  for (const [re, rep] of FORBIDDEN) out = out.replace(re, rep);
  return out;
}

export function containsForbidden(text: string): boolean {
  return FORBIDDEN.some(([re]) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export const DISCLAIMER_SHORT = 'AI 分析，非投資建議';
