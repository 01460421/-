/**
 * 外部網站連結面板：模板集中於 config/external-links.json，使用者可另外新增模板。
 * 佔位符：{code}、{symbol}、{exchange}、{yahoo}、{tv}。
 */
import config from '../../config/external-links.json';
import { normalizeSymbol, toYahooSymbol } from '../data-adapters/symbols';
import { toTradingViewSymbol, tradingViewExchange } from './tradingview';

export interface LinkTemplate {
  id?: string;
  label: string;
  url: string;
  /** 適用市場：TW（含上櫃）、US、INDEX 或 ALL；預設 ALL */
  market?: 'TW' | 'US' | 'INDEX' | 'ALL';
}

export interface ExternalLink {
  id: string;
  label: string;
  url: string;
  custom: boolean;
}

type Group = 'TW' | 'US' | 'INDEX';

export const DEFAULT_LINK_TEMPLATES: Record<Group, LinkTemplate[]> = {
  TW: (config as Record<string, unknown>).TW as LinkTemplate[],
  US: (config as Record<string, unknown>).US as LinkTemplate[],
  INDEX: (config as Record<string, unknown>).INDEX as LinkTemplate[],
};

export function fillTemplate(url: string, vars: Record<string, string>): string {
  return url.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? encodeURIComponent(vars[k]).replace(/%2F/g, '/') : m));
}

/** 只接受 http(s) 連結，避免使用者模板注入 javascript: 等協定 */
export function isSafeUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url);
}

export function getExternalLinks(symbol: string, userTemplates: LinkTemplate[] = []): ExternalLink[] {
  const info = normalizeSymbol(symbol);
  if (!info) return [];
  const group: Group = info.symbol.startsWith('^') || info.symbol.includes('=') ? 'INDEX' : info.market === 'US' ? 'US' : 'TW';
  const vars: Record<string, string> = {
    code: info.code,
    symbol: info.symbol,
    exchange: tradingViewExchange(info.symbol) ?? (group === 'TW' ? 'TWSE' : ''),
    yahoo: toYahooSymbol(info.symbol),
    tv: toTradingViewSymbol(info.symbol) ?? info.symbol,
  };
  const out: ExternalLink[] = [];
  for (const t of DEFAULT_LINK_TEMPLATES[group] ?? []) {
    // 交易所未知的美股：TradingView 符號頁改用 chart 搜尋
    const url = !vars.exchange && t.url.includes('{exchange}') ? `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(info.symbol)}` : fillTemplate(t.url, vars);
    out.push({ id: t.id ?? t.label, label: t.label, url, custom: false });
  }
  userTemplates.forEach((t, i) => {
    const m = t.market ?? 'ALL';
    if (m !== 'ALL' && m !== group) return;
    if (!t.label || !t.url) return;
    const url = fillTemplate(t.url, vars);
    if (!isSafeUrl(url)) return;
    out.push({ id: t.id ?? `custom_${i}`, label: t.label, url, custom: true });
  });
  return out;
}
