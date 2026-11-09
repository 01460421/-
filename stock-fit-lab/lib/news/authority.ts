/**
 * 權威來源白名單與分級（official > wire > major > trade）。
 * 只用於「標示」與「過濾」新聞標題；本系統不抓取任何新聞網站的 HTML，
 * 媒體新聞只透過公開 API（GDELT DOC 2.0、FinMind）取得標題與連結。
 */
import type { AuthorityTier } from './types';
import { TIER_RANK } from './types';

export interface AuthorityDomain {
  domain: string;
  name: string;
  tier: AuthorityTier;
}

export const AUTHORITY_DOMAINS: AuthorityDomain[] = [
  // 官方
  { domain: 'sec.gov', name: 'SEC EDGAR', tier: 'official' },
  { domain: 'twse.com.tw', name: '臺灣證券交易所 / 公開資訊觀測站', tier: 'official' },
  { domain: 'tpex.org.tw', name: '證券櫃檯買賣中心', tier: 'official' },
  { domain: 'federalreserve.gov', name: 'Federal Reserve', tier: 'official' },
  { domain: 'cbc.gov.tw', name: '中央銀行', tier: 'official' },
  // 通訊社
  { domain: 'reuters.com', name: 'Reuters', tier: 'wire' },
  { domain: 'apnews.com', name: 'AP News', tier: 'wire' },
  { domain: 'bloomberg.com', name: 'Bloomberg', tier: 'wire' },
  { domain: 'cna.com.tw', name: '中央社', tier: 'wire' },
  { domain: 'focustaiwan.tw', name: '中央社 Focus Taiwan', tier: 'wire' },
  // 主要財經媒體
  { domain: 'ft.com', name: 'Financial Times', tier: 'major' },
  { domain: 'wsj.com', name: 'The Wall Street Journal', tier: 'major' },
  { domain: 'cnbc.com', name: 'CNBC', tier: 'major' },
  { domain: 'nikkei.com', name: 'Nikkei', tier: 'major' },
  { domain: 'barrons.com', name: "Barron's", tier: 'major' },
  { domain: 'marketwatch.com', name: 'MarketWatch', tier: 'major' },
  { domain: 'economist.com', name: 'The Economist', tier: 'major' },
  { domain: 'udn.com', name: '經濟日報 / 聯合報', tier: 'major' },
  { domain: 'ctee.com.tw', name: '工商時報', tier: 'major' },
  // 產業 / 專業媒體
  { domain: 'technews.tw', name: 'TechNews 科技新報', tier: 'trade' },
  { domain: 'digitimes.com', name: 'DIGITIMES', tier: 'trade' },
  { domain: 'digitimes.com.tw', name: 'DIGITIMES', tier: 'trade' },
  { domain: 'eetimes.com', name: 'EE Times', tier: 'trade' },
  { domain: 'trendforce.com', name: 'TrendForce', tier: 'trade' },
  { domain: 'moneydj.com', name: 'MoneyDJ 理財網', tier: 'trade' },
  { domain: 'cnyes.com', name: '鉅亨網', tier: 'trade' },
];

/** GDELT 查詢使用的網域白名單（只含新聞媒體，不含官方網站） */
export const GDELT_DOMAINS = ['reuters.com', 'apnews.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'cnbc.com', 'nikkei.com', 'cna.com.tw', 'focustaiwan.tw', 'udn.com', 'ctee.com.tw', 'technews.tw', 'digitimes.com'];

/** 媒體名稱（FinMind 新聞的 source 欄位等）→ 等級 */
const SOURCE_NAME_TIERS: [RegExp, AuthorityTier, string][] = [
  [/公開資訊觀測站|MOPS|證交所|櫃買中心|SEC\b/i, 'official', '官方'],
  [/中央社|中央通訊社|CNA|Focus Taiwan|Reuters|路透|美聯社|Associated Press|\bAP\b|Bloomberg|彭博/i, 'wire', '通訊社'],
  [/經濟日報|工商時報|Financial Times|金融時報|Wall Street Journal|華爾街日報|WSJ|CNBC|Nikkei|日經|Barron|MarketWatch|Economist/i, 'major', '主要財經媒體'],
  [/科技新報|TechNews|DIGITIMES|電子時報|MoneyDJ|鉅亨|EE Times|TrendForce|集邦/i, 'trade', '產業媒體'],
];

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function authorityForDomain(domainOrUrl: string | null | undefined): AuthorityDomain | null {
  const h = domainOrUrl?.includes('/') ? hostOf(domainOrUrl) : domainOrUrl?.toLowerCase().replace(/^www\./, '');
  if (!h) return null;
  for (const a of AUTHORITY_DOMAINS) if (h === a.domain || h.endsWith('.' + a.domain)) return a;
  return null;
}

export function tierForSourceName(name: string | null | undefined): AuthorityTier {
  if (!name) return 'other';
  for (const [re, tier] of SOURCE_NAME_TIERS) if (re.test(name)) return tier;
  return 'other';
}

export function tierAtLeast(t: AuthorityTier, min: AuthorityTier): boolean {
  return TIER_RANK[t] >= TIER_RANK[min];
}
