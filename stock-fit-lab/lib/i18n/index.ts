import { zhTW, type Dict } from './zh-TW';

export type Locale = 'zh-TW';
const dicts: Record<Locale, Dict> = { 'zh-TW': zhTW };

export function getDict(locale: Locale = 'zh-TW'): Dict {
  return dicts[locale] ?? zhTW;
}

export const t = getDict();
