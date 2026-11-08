/**
 * TradingView 代號對應（Advanced Chart widget 與連結用）。
 *  2330.TW → TWSE:2330；6488.TWO → TPEX:6488；AAPL → NASDAQ:AAPL（名稱表 / 小型交易所表），未知美股回傳純代號讓 widget 自行解析。
 */
import { knownExchange, normalizeSymbol } from '../data-adapters/symbols';

/** 指數 / 匯率 / 殖利率 */
const SPECIAL: Record<string, string> = {
  '^TWII': 'TWSE:TAIEX',
  '^TWOII': 'TPEX:TPEX',
  '^GSPC': 'SP:SPX',
  '^IXIC': 'NASDAQ:IXIC',
  '^DJI': 'DJ:DJI',
  '^SOX': 'NASDAQ:SOX',
  '^VIX': 'TVC:VIX',
  '^TNX': 'TVC:TNX',
  'TWD=X': 'FX_IDC:USDTWD',
};

/** 名稱表以外的常見美股交易所（best-effort） */
const EXTRA_US_EXCHANGE: Record<string, string> = {
  INTU: 'NASDAQ', PANW: 'NASDAQ', SNPS: 'NASDAQ', CDNS: 'NASDAQ', ADI: 'NASDAQ', NXPI: 'NASDAQ', MCHP: 'NASDAQ', ON: 'NASDAQ',
  ABNB: 'NASDAQ', BKNG: 'NASDAQ', CMCSA: 'NASDAQ', TMUS: 'NASDAQ', GILD: 'NASDAQ', AMGN: 'NASDAQ', VRTX: 'NASDAQ', REGN: 'NASDAQ',
  MDLZ: 'NASDAQ', CRWD: 'NASDAQ', ZS: 'NASDAQ', DDOG: 'NASDAQ', TEAM: 'NASDAQ', WDAY: 'NASDAQ', MSTR: 'NASDAQ', HOOD: 'NASDAQ',
  BABA: 'NYSE', NIO: 'NYSE', PDD: 'NASDAQ', JD: 'NASDAQ', BIDU: 'NASDAQ', SNOW: 'NYSE', NOW: 'NYSE', ANET: 'NYSE', TGT: 'NYSE',
  LOW: 'NYSE', PG: 'NYSE', T: 'NYSE', VZ: 'NYSE', C: 'NYSE', AXP: 'NYSE', BLK: 'NYSE', SCHW: 'NYSE', F: 'NYSE', GM: 'NYSE',
  RTX: 'NYSE', LMT: 'NYSE', DE: 'NYSE', MMM: 'NYSE', HON: 'NASDAQ', UPS: 'NYSE', FDX: 'NYSE', TM: 'NYSE', SONY: 'NYSE', UMC: 'NYSE',
  ASX: 'NYSE', XLF: 'AMEX', XLK: 'AMEX', XLE: 'AMEX', ARKK: 'AMEX', SQQQ: 'NASDAQ', SOXS: 'AMEX', VT: 'AMEX', VEA: 'AMEX', EEM: 'AMEX',
};

export function tradingViewExchange(symbol: string): string | null {
  const info = normalizeSymbol(symbol);
  if (!info) return null;
  if (SPECIAL[info.symbol]) return SPECIAL[info.symbol].split(':')[0];
  if (info.market === 'TW') return 'TWSE';
  if (info.market === 'TWO') return 'TPEX';
  return knownExchange(info.symbol) ?? EXTRA_US_EXCHANGE[info.symbol] ?? null;
}

/** 本系統代號 → TradingView widget 代號 */
export function toTradingViewSymbol(symbol: string): string | null {
  const info = normalizeSymbol(symbol);
  if (!info) return null;
  if (SPECIAL[info.symbol]) return SPECIAL[info.symbol];
  if (info.market === 'TW') return `TWSE:${info.code}`;
  if (info.market === 'TWO') return `TPEX:${info.code}`;
  const ex = tradingViewExchange(info.symbol);
  return ex ? `${ex}:${info.symbol}` : info.symbol;
}

/** TradingView 代號 → 本系統代號（委派 normalizeSymbol） */
export function fromTradingViewSymbol(tv: string): string | null {
  return normalizeSymbol(tv)?.symbol ?? null;
}

/** Advanced Chart widget 設定（前端 embed script 用；只使用官方嵌入工具） */
export function tradingViewWidgetConfig(symbol: string, opts: { theme?: 'light' | 'dark'; interval?: string; locale?: string } = {}): Record<string, unknown> | null {
  const tv = toTradingViewSymbol(symbol);
  if (!tv) return null;
  return {
    autosize: true,
    symbol: tv,
    interval: opts.interval ?? 'D',
    timezone: normalizeSymbol(symbol)?.market === 'US' ? 'America/New_York' : 'Asia/Taipei',
    theme: opts.theme ?? 'light',
    style: '1',
    locale: opts.locale ?? 'zh_TW',
    allow_symbol_change: false,
    hide_side_toolbar: false,
    support_host: 'https://www.tradingview.com',
  };
}
