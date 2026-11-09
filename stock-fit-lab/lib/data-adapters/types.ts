/**
 * 資料源 Adapter 合約（規格第二節）。新增資料源只需實作 DataAdapter。
 * 每個 Adapter 必須：回傳統一 PriceSeries、標示來源與資料時間、實作速率限制 / 重試 / 快取。
 */
import type { Interval, Market, PriceSeries } from '../types';

export interface HistoryRequest {
  interval: Interval;
  /** YYYY-MM-DD，未給則由 adapter 決定預設長度（日線至少 2 年） */
  start?: string;
  end?: string;
}

export interface Quote {
  symbol: string;
  price: number;
  change?: number;
  changePct?: number;
  at: string; // ISO
  delayMinutes: number;
  source: string;
}

/** 超詳細資料層（第十節）的通用表格型回傳：介面可直接渲染為原始數值表並下載 */
export interface DataTable {
  dataset: string; // 例如 'institutional'、'margin'、'monthly_revenue'
  title: string; // 繁中標題
  symbol: string;
  source: string;
  fetchedAt: string;
  asOf: string;
  delayMinutes: number;
  columns: { key: string; label: string; unit?: string }[];
  rows: Record<string, string | number | null>[];
  /** 未設定金鑰或資料源不支援時的說明 */
  unavailableReason?: string;
}

export type DatasetId =
  | 'institutional' // 三大法人買賣超
  | 'margin' // 融資融券
  | 'securities_lending' // 借券賣出
  | 'shareholding' // 集保股權分散
  | 'monthly_revenue'
  | 'financials' // 季報
  | 'dividends'
  | 'valuation' // PER / PBR / 殖利率
  | 'short_interest' // 美股空單
  | 'insider' // 內部人交易
  | 'options' // 選擇權 IV / PCR / 未平倉
  | 'news' // 新聞標題 + 連結
  | 'macro'; // 市場環境指數

export interface CorporateEvent {
  date: string; // YYYY-MM-DD
  type: 'earnings' | 'dividend' | 'split' | 'conference' | 'announcement';
  title: string;
  source: string;
  url?: string;
}

export interface DataAdapter {
  id: string; // 'finmind' | 'twse' | 'tpex' | 'yahoo' | 'alphavantage' | 'polygon' | 'finnhub'
  name: string; // 顯示名稱
  markets: Market[];
  requiresKey: boolean;
  /** 金鑰已設定或不需金鑰 */
  isConfigured(): boolean;
  getHistory(symbol: string, req: HistoryRequest): Promise<PriceSeries>;
  getQuote?(symbol: string): Promise<Quote>;
  getDataset?(symbol: string, dataset: DatasetId, opts?: { start?: string; end?: string }): Promise<DataTable>;
  getEvents?(symbol: string, opts?: { start?: string; end?: string }): Promise<CorporateEvent[]>;
}

export interface SymbolInfo {
  symbol: string; // 正規化代號
  market: Market;
  name?: string;
  code: string; // 不含後綴的代號，例如 2330、AAPL
}

export interface AdapterHealth {
  adapterId: string;
  calls: number;
  failures: number;
  consecutiveFailures: number;
  lastError?: string;
  lastSuccessAt?: string;
  quotaUsed?: number;
  quotaLimit?: number;
}
