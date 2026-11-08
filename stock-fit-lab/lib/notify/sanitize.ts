/**
 * 法遵用語過濾（第十一節）：訊息不得出現「保證」「必漲」「穩賺」等字眼。
 */

export const FORBIDDEN_WORDS = ['保證', '必漲', '穩賺'] as const;

const REPLACEMENTS: [RegExp, string][] = [
  [/不保證/g, '不擔保'],
  [/必漲/g, '可能上漲'],
  [/穩賺/g, '可能獲利'],
  [/保證/g, '預估'],
  // 簡體 / 異體
  [/保证/g, '預估'],
  [/稳赚/g, '可能獲利'],
];

export function sanitizeText(text: string): string {
  let out = String(text ?? '');
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

export function containsForbidden(text: string): boolean {
  return /保證|必漲|穩賺|保证|稳赚/.test(String(text ?? ''));
}

export const DISCLAIMER = '本訊息為數學擬合與統計方法之自動分析，非投資建議；過去表現不代表未來結果。';
