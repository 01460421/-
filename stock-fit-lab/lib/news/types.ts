/**
 * 新聞與官方公告的統一型別（規格第十節：只取標題與連結，不複製全文）。
 * 每筆都帶來源、發布時間（ISO，UTC）與權威等級；不含任何內文。
 */

/** 權威等級：official 官方揭露 > wire 通訊社 > major 主要財經媒體 > trade 產業 / 專業媒體 > other 其他 / 聚合 */
export type AuthorityTier = 'official' | 'wire' | 'major' | 'trade' | 'other';

export const TIER_RANK: Record<AuthorityTier, number> = { official: 4, wire: 3, major: 2, trade: 1, other: 0 };

export const TIER_LABEL: Record<AuthorityTier, string> = {
  official: '官方揭露',
  wire: '通訊社',
  major: '主要財經媒體',
  trade: '產業媒體',
  other: '其他 / 聚合',
};

export type NewsProvider = 'mops' | 'twse-openapi' | 'finmind' | 'sec-edgar' | 'sec-efts' | 'gdelt';

export interface SentimentScore {
  /** (正向詞數 − 負向詞數) / (正向 + 負向)，介於 −1 ~ 1；沒有命中詞為 0 */
  score: number;
  pos: number;
  neg: number;
  /** 命中的詞（供使用者檢驗） */
  matched: string[];
}

export interface NewsItem {
  id: string;
  title: string;
  url: string | null;
  /** 來源名稱（媒體 / 機關），例如「公開資訊觀測站」「SEC EDGAR」「Reuters」 */
  source: string;
  /** 發布時間 ISO（UTC）；只有日期者以當地 23:59:59 表示並標 dateOnly */
  publishedAt: string;
  dateOnly?: boolean;
  tier: AuthorityTier;
  kind: 'news' | 'disclosure' | 'filing' | 'conference';
  provider: NewsProvider;
  symbol?: string;
  /** 官方文件的形式 / 條款，例如 "8-K"、"第51款" */
  form?: string;
  /** 8-K items，例如 ["2.02","9.01"] */
  items?: string[];
  domain?: string;
  language?: string;
  sentiment?: SentimentScore;
  /** 由標題關鍵字推得的標籤（macro、guidance、earnings…） */
  tags?: string[];
}

export interface SourceStatus {
  name: string;
  provider: NewsProvider;
  ok: boolean;
  count: number;
  /** 該來源的官方入口或查詢端點 */
  url?: string;
  error?: string;
  note?: string;
  stale?: boolean;
}
