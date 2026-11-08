/**
 * 代號正規化與搜尋。
 *  - 台股上市 2330.TW、上櫃 6488.TWO；美股 AAPL、BRK.B；指數 ^TWII / ^GSPC；匯率 TWD=X。
 *  - 接受：'2330'、'2330.tw'、'台積電'、'TWSE:2330'、'TPEX:6488'、'NASDAQ:AAPL'、'aapl'、'brk-b'、'^vix'。
 *  - 內建約 200 檔熱門台美股名稱表；另可於執行期由 FinMind TaiwanStockInfo 補充（registerTwSymbols）。
 */
import type { Market } from '../types';
import type { SymbolInfo } from './types';

export interface KnownSymbol {
  symbol: string;
  name: string;
  /** 其他別名（簡稱、英文名、中文俗稱） */
  aliases?: string[];
  /** 美股 TradingView 交易所 */
  exchange?: string;
}

// [代號, 名稱, 別名...]
const TW_LISTED: [string, string, ...string[]][] = [
  ['2330', '台積電', 'TSMC', '台積'], ['2317', '鴻海', 'Foxconn'], ['2454', '聯發科', 'MediaTek'], ['2308', '台達電'],
  ['2382', '廣達'], ['2412', '中華電'], ['2881', '富邦金'], ['2882', '國泰金'], ['2891', '中信金'], ['2303', '聯電', 'UMC'],
  ['3711', '日月光投控', '日月光'], ['2886', '兆豐金'], ['2884', '玉山金'], ['1216', '統一'], ['2357', '華碩', 'ASUS'],
  ['2885', '元大金'], ['2892', '第一金'], ['2880', '華南金'], ['2887', '台新金'], ['2883', '凱基金', '開發金'],
  ['2890', '永豐金'], ['5880', '合庫金'], ['2002', '中鋼'], ['1301', '台塑'], ['1303', '南亞'], ['1326', '台化'],
  ['6505', '台塑化'], ['2603', '長榮'], ['2609', '陽明'], ['2615', '萬海'], ['2618', '長榮航'], ['2610', '華航'],
  ['3008', '大立光'], ['2379', '瑞昱'], ['3034', '聯詠'], ['2395', '研華'], ['3231', '緯創'], ['2356', '英業達'],
  ['2376', '技嘉'], ['2377', '微星'], ['2324', '仁寶'], ['2353', '宏碁', 'Acer'], ['4938', '和碩'], ['3045', '台灣大'],
  ['4904', '遠傳'], ['2345', '智邦'], ['3017', '奇鋐'], ['2301', '光寶科'], ['2408', '南亞科'], ['2344', '華邦電'],
  ['3661', '世芯-KY', '世芯'], ['3443', '創意'], ['6669', '緯穎'], ['2059', '川湖'], ['3037', '欣興'], ['8046', '南電'],
  ['2368', '金像電'], ['2383', '台光電'], ['3533', '嘉澤'], ['2327', '國巨'], ['2360', '致茂'], ['1590', '亞德客-KY', '亞德客'],
  ['2207', '和泰車'], ['9910', '豐泰'], ['9904', '寶成'], ['2912', '統一超'], ['1101', '台泥'], ['1102', '亞泥'],
  ['2105', '正新'], ['2474', '可成'], ['3481', '群創'], ['2409', '友達'], ['5269', '祥碩'], ['2404', '漢唐'],
  ['3653', '健策'], ['6176', '瑞儀'], ['3406', '玉晶光'], ['2449', '京元電子', '京元電'], ['6770', '力積電'], ['2337', '旺宏'],
  ['1519', '華城'], ['1504', '東元'], ['1513', '中興電'], ['1503', '士電'], ['2371', '大同'], ['3035', '智原'],
  ['3023', '信邦'], ['2201', '裕隆'], ['4958', '臻鼎-KY', '臻鼎'], ['2385', '群光'], ['3702', '大聯大'], ['2347', '聯強'],
  ['6239', '力成'], ['2801', '彰銀'], ['2834', '臺企銀', '台企銀'], ['1402', '遠東新'], ['2633', '台灣高鐵', '高鐵'],
  ['9945', '潤泰新'], ['2542', '興富發'], ['1476', '儒鴻'], ['2006', '東和鋼鐵'], ['1605', '華新'],
  // ETF（上市）
  ['0050', '元大台灣50', '台灣50'], ['0056', '元大高股息', '高股息'], ['00878', '國泰永續高股息'], ['00919', '群益台灣精選高息'],
  ['006208', '富邦台50'], ['00929', '復華台灣科技優息'], ['00940', '元大台灣價值高息'], ['00713', '元大台灣高息低波'],
  ['00692', '富邦公司治理'], ['0052', '富邦科技'], ['00881', '國泰台灣5G+'], ['00631L', '元大台灣50正2', '50正2'],
  ['00632R', '元大台灣50反1', '50反1'],
];

const TW_OTC: [string, string, ...string[]][] = [
  ['6488', '環球晶'], ['5347', '世界', '世界先進'], ['3105', '穩懋'], ['8299', '群聯'], ['5483', '中美晶'], ['6147', '頎邦'],
  ['3293', '鈊象'], ['8069', '元太'], ['5274', '信驊'], ['4966', '譜瑞-KY', '譜瑞'], ['3324', '雙鴻'], ['6510', '精測'],
  ['3680', '家登'], ['6446', '藥華藥'], ['6223', '旺矽'], ['3264', '欣銓'], ['5371', '中光電'], ['6187', '萬潤'],
  ['3374', '精材'], ['8086', '宏捷科'], ['3211', '順達'], ['6182', '合晶'], ['4105', '東洋'], ['6121', '新普'],
  ['6274', '台燿'], ['5904', '寶雅'], ['3260', '威剛'], ['1785', '光洋科'], ['5289', '宜鼎'],
  // 債券 ETF（上櫃）
  ['00679B', '元大美債20年'], ['00687B', '國泰20年美債'], ['00937B', '群益ESG投等債20+'],
];

// [代號, 交易所, 名稱, 別名...]
const US_LIST: [string, string, string, ...string[]][] = [
  ['AAPL', 'NASDAQ', 'Apple', '蘋果'], ['MSFT', 'NASDAQ', 'Microsoft', '微軟'], ['NVDA', 'NASDAQ', 'NVIDIA', '輝達'],
  ['GOOGL', 'NASDAQ', 'Alphabet A', '谷歌', 'Google'], ['GOOG', 'NASDAQ', 'Alphabet C'], ['AMZN', 'NASDAQ', 'Amazon', '亞馬遜'],
  ['META', 'NASDAQ', 'Meta Platforms', 'Facebook', '臉書'], ['TSLA', 'NASDAQ', 'Tesla', '特斯拉'], ['AVGO', 'NASDAQ', 'Broadcom', '博通'],
  ['TSM', 'NYSE', 'TSMC ADR', '台積電ADR'], ['AMD', 'NASDAQ', 'AMD', '超微'], ['INTC', 'NASDAQ', 'Intel', '英特爾'],
  ['QCOM', 'NASDAQ', 'Qualcomm', '高通'], ['MU', 'NASDAQ', 'Micron', '美光'], ['ARM', 'NASDAQ', 'Arm Holdings', '安謀'],
  ['ASML', 'NASDAQ', 'ASML', '艾司摩爾'], ['NFLX', 'NASDAQ', 'Netflix', '網飛'], ['ADBE', 'NASDAQ', 'Adobe'],
  ['CRM', 'NYSE', 'Salesforce'], ['ORCL', 'NYSE', 'Oracle', '甲骨文'], ['CSCO', 'NASDAQ', 'Cisco', '思科'], ['IBM', 'NYSE', 'IBM'],
  ['TXN', 'NASDAQ', 'Texas Instruments', '德州儀器'], ['AMAT', 'NASDAQ', 'Applied Materials', '應用材料'],
  ['LRCX', 'NASDAQ', 'Lam Research', '科林研發'], ['KLAC', 'NASDAQ', 'KLA'], ['MRVL', 'NASDAQ', 'Marvell', '邁威爾'],
  ['SMCI', 'NASDAQ', 'Super Micro Computer', '美超微'], ['DELL', 'NYSE', 'Dell', '戴爾'], ['PLTR', 'NASDAQ', 'Palantir'],
  ['COIN', 'NASDAQ', 'Coinbase'], ['UBER', 'NYSE', 'Uber'], ['SHOP', 'NYSE', 'Shopify'], ['PYPL', 'NASDAQ', 'PayPal'],
  ['V', 'NYSE', 'Visa'], ['MA', 'NYSE', 'Mastercard', '萬事達'], ['JPM', 'NYSE', 'JPMorgan Chase', '摩根大通'],
  ['BAC', 'NYSE', 'Bank of America', '美國銀行'], ['GS', 'NYSE', 'Goldman Sachs', '高盛'], ['MS', 'NYSE', 'Morgan Stanley', '摩根士丹利'],
  ['WFC', 'NYSE', 'Wells Fargo', '富國銀行'], ['BRK.B', 'NYSE', 'Berkshire Hathaway B', '波克夏'], ['JNJ', 'NYSE', 'Johnson & Johnson', '嬌生'],
  ['PFE', 'NYSE', 'Pfizer', '輝瑞'], ['LLY', 'NYSE', 'Eli Lilly', '禮來'], ['UNH', 'NYSE', 'UnitedHealth', '聯合健康'],
  ['MRK', 'NYSE', 'Merck', '默克'], ['ABBV', 'NYSE', 'AbbVie', '艾伯維'], ['NVO', 'NYSE', 'Novo Nordisk', '諾和諾德'],
  ['KO', 'NYSE', 'Coca-Cola', '可口可樂'], ['PEP', 'NASDAQ', 'PepsiCo', '百事'], ['MCD', 'NYSE', "McDonald's", '麥當勞'],
  ['WMT', 'NYSE', 'Walmart', '沃爾瑪'], ['COST', 'NASDAQ', 'Costco', '好市多'], ['NKE', 'NYSE', 'Nike', '耐吉'],
  ['DIS', 'NYSE', 'Disney', '迪士尼'], ['SBUX', 'NASDAQ', 'Starbucks', '星巴克'], ['HD', 'NYSE', 'Home Depot', '家得寶'],
  ['XOM', 'NYSE', 'Exxon Mobil', '埃克森美孚'], ['CVX', 'NYSE', 'Chevron', '雪佛龍'], ['BA', 'NYSE', 'Boeing', '波音'],
  ['CAT', 'NYSE', 'Caterpillar', '開拓重工'], ['GE', 'NYSE', 'GE Aerospace', '奇異'],
  // ETF
  ['SPY', 'AMEX', 'SPDR S&P 500 ETF'], ['QQQ', 'NASDAQ', 'Invesco QQQ'], ['VOO', 'AMEX', 'Vanguard S&P 500 ETF'],
  ['VTI', 'AMEX', 'Vanguard Total Stock Market ETF'], ['SOXX', 'NASDAQ', 'iShares Semiconductor ETF'], ['SMH', 'NASDAQ', 'VanEck Semiconductor ETF'],
  ['TQQQ', 'NASDAQ', 'ProShares UltraPro QQQ'], ['SOXL', 'AMEX', 'Direxion Semiconductor Bull 3X'], ['DIA', 'AMEX', 'SPDR Dow Jones ETF'],
  ['IWM', 'AMEX', 'iShares Russell 2000 ETF'], ['TLT', 'NASDAQ', 'iShares 20+ Year Treasury ETF'], ['GLD', 'AMEX', 'SPDR Gold Shares'],
];

/** 指數 / 匯率 / 殖利率（市場環境層） */
const MACRO_LIST: [string, Market, string, ...string[]][] = [
  ['^TWII', 'TW', '加權指數', '台股加權指數', 'TAIEX', '大盤'],
  ['^TWOII', 'TWO', '櫃買指數', 'OTC指數'],
  ['^GSPC', 'US', 'S&P 500', '標普500', 'SPX'],
  ['^IXIC', 'US', '那斯達克綜合指數', 'NASDAQ Composite', '那斯達克'],
  ['^DJI', 'US', '道瓊工業指數', 'Dow Jones', '道瓊'],
  ['^SOX', 'US', '費城半導體指數', 'PHLX Semiconductor', '費半'],
  ['^VIX', 'US', 'VIX 恐慌指數', 'VIX', '恐慌指數'],
  ['^TNX', 'US', '美債10年殖利率', '10年期美債殖利率'],
  ['TWD=X', 'US', '美元兌台幣', 'USDTWD', '台幣匯率'],
];

/** 市場環境預設序列（第十節第 6 點） */
export const MACRO_SYMBOLS = ['^TWII', '^TWOII', '^GSPC', '^SOX', '^VIX', 'TWD=X', '^TNX'] as const;

interface Entry extends SymbolInfo {
  aliases: string[];
  exchange?: string;
}

const bySymbol = new Map<string, Entry>();
const byName = new Map<string, Entry>();

function addEntry(e: Entry): void {
  bySymbol.set(e.symbol, e);
  for (const n of [e.name ?? '', ...e.aliases]) {
    const k = nameKey(n);
    if (k && !byName.has(k)) byName.set(k, e);
  }
}

function nameKey(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

for (const [code, name, ...aliases] of TW_LISTED) addEntry({ symbol: `${code}.TW`, market: 'TW', code, name, aliases });
for (const [code, name, ...aliases] of TW_OTC) addEntry({ symbol: `${code}.TWO`, market: 'TWO', code, name, aliases });
for (const [code, exchange, name, ...aliases] of US_LIST) addEntry({ symbol: code, market: 'US', code, name, aliases, exchange });
for (const [sym, market, name, ...aliases] of MACRO_LIST) addEntry({ symbol: sym, market, code: sym, name, aliases });

/** 由 TaiwanStockInfo 載入的完整台股清單（代號 → 市場 / 名稱） */
const twRuntime = new Map<string, { market: 'TW' | 'TWO'; name: string }>();

export function registerTwSymbols(list: { code: string; market: 'TW' | 'TWO'; name: string }[]): void {
  for (const s of list) {
    twRuntime.set(s.code, { market: s.market, name: s.name });
    const k = nameKey(s.name);
    if (k && !byName.has(k)) {
      byName.set(k, { symbol: `${s.code}.${s.market === 'TWO' ? 'TWO' : 'TW'}`, market: s.market, code: s.code, name: s.name, aliases: [] });
    }
  }
}

export function twRuntimeSize(): number {
  return twRuntime.size;
}

export function knownSymbols(): KnownSymbol[] {
  return [...bySymbol.values()].map((e) => ({ symbol: e.symbol, name: e.name ?? e.code, aliases: e.aliases, exchange: e.exchange }));
}

/** 美股 TradingView 交易所（名稱表內才有） */
export function knownExchange(symbol: string): string | undefined {
  return bySymbol.get(symbol)?.exchange;
}

export function lookupName(symbol: string): string | undefined {
  const e = bySymbol.get(symbol);
  if (e) return e.name;
  const m = symbol.match(/^(.+)\.(TW|TWO)$/);
  return m ? twRuntime.get(m[1])?.name : undefined;
}

const TW_CODE = /^\d{4,6}[A-Z]?$/;
const US_TICKER = /^[A-Z]{1,5}(?:[.\-/][A-Z]{1,2})?$/;

function twInfo(code: string, forced?: 'TW' | 'TWO'): SymbolInfo {
  let market: 'TW' | 'TWO' = forced ?? 'TW';
  if (!forced) {
    if (bySymbol.has(`${code}.TWO`)) market = 'TWO';
    else if (bySymbol.has(`${code}.TW`)) market = 'TW';
    else market = twRuntime.get(code)?.market ?? 'TW';
  }
  const symbol = `${code}.${market === 'TWO' ? 'TWO' : 'TW'}`;
  return { symbol, market, code, name: lookupName(symbol) };
}

function usInfo(ticker: string): SymbolInfo {
  const t = ticker.replace(/[-/]/g, '.');
  return { symbol: t, market: 'US', code: t, name: lookupName(t) };
}

/** TradingView 特殊代號 → 本系統代號 */
const TV_SPECIAL: Record<string, string> = {
  'TWSE:TAIEX': '^TWII',
  'TPEX:TPEX': '^TWOII',
  'TVC:VIX': '^VIX',
  'CBOE:VIX': '^VIX',
  'SP:SPX': '^GSPC',
  'TVC:SPX': '^GSPC',
  'NASDAQ:IXIC': '^IXIC',
  'TVC:IXIC': '^IXIC',
  'DJ:DJI': '^DJI',
  'TVC:DJI': '^DJI',
  'NASDAQ:SOX': '^SOX',
  'TVC:SOX': '^SOX',
  'TVC:TNX': '^TNX',
  'TVC:US10Y': '^TNX',
  'FX_IDC:USDTWD': 'TWD=X',
  'FX:USDTWD': 'TWD=X',
};

function indexInfo(sym: string): SymbolInfo {
  const e = bySymbol.get(sym);
  if (e) return { symbol: e.symbol, market: e.market, code: e.code, name: e.name };
  return { symbol: sym, market: 'US', code: sym };
}

/**
 * 正規化使用者輸入的代號。無法辨識回傳 null。
 * 純數字台股代號若不在名稱表與執行期清單中，預設視為上市（.TW）。
 */
export function normalizeSymbol(input: string): SymbolInfo | null {
  if (typeof input !== 'string') return null;
  let s = input.normalize('NFKC').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!s) return null;
  const up = s.toUpperCase();

  // TradingView EXCHANGE:TICKER
  const tv = up.match(/^([A-Z_]+):([A-Z0-9.\-!=^/]+)$/);
  if (tv) {
    const special = TV_SPECIAL[`${tv[1]}:${tv[2]}`];
    if (special) return indexInfo(special);
    const ex = tv[1];
    const tk = tv[2];
    if (ex === 'TWSE' || ex === 'TWSE_DLY') return TW_CODE.test(tk) ? twInfo(tk, 'TW') : null;
    if (ex === 'TPEX' || ex === 'GTSM') return TW_CODE.test(tk) ? twInfo(tk, 'TWO') : null;
    if (US_TICKER.test(tk)) return usInfo(tk);
    return null;
  }

  // 2330.TW / 6488.TWO
  const suf = up.match(/^([0-9A-Z]+)\.(TW|TWO)$/);
  if (suf) return TW_CODE.test(suf[1]) ? twInfo(suf[1], suf[2] as 'TW' | 'TWO') : null;

  // 指數 ^XXX
  if (/^\^[A-Z0-9.]{2,10}$/.test(up)) return indexInfo(up);
  // 匯率 XXX=X / USDTWD=X、期貨 ES=F
  if (/^[A-Z]{3,6}=X$/.test(up)) return up === 'USDTWD=X' ? indexInfo('TWD=X') : indexInfo(up);
  if (/^[A-Z]{1,3}=F$/.test(up)) return indexInfo(up);

  if (TW_CODE.test(up)) return twInfo(up);

  // 名稱（中文 / 英文別名）優先於英文代號，避免 'Apple' 被當成代號
  const byN = byName.get(nameKey(s));
  if (byN && !bySymbol.has(up)) return { symbol: byN.symbol, market: byN.market, code: byN.code, name: byN.name };

  if (US_TICKER.test(up)) return usInfo(up);
  return null;
}

/** 本系統代號 → Yahoo Finance 代號（BRK.B → BRK-B） */
export function toYahooSymbol(symbol: string): string {
  if (/\.(TW|TWO)$/.test(symbol) || symbol.startsWith('^') || symbol.includes('=')) return symbol;
  return symbol.replace(/\./g, '-');
}

export function isMacroSymbol(symbol: string): boolean {
  return symbol.startsWith('^') || symbol.includes('=');
}

let twLoader: (() => Promise<void>) | null = null;
/** index.ts 注入：從 FinMind 載入完整台股清單 */
export function setTwSymbolLoader(fn: () => Promise<void>): void {
  twLoader = fn;
}

/**
 * 搜尋代號：本地名稱表 + 執行期台股清單；查詢含中文或數字時會嘗試載入 FinMind 台股清單。永不丟錯。
 */
export async function searchSymbols(q: string, limit = 10): Promise<SymbolInfo[]> {
  const query = (q ?? '').normalize('NFKC').trim();
  if (!query) return [];
  if (twLoader && twRuntime.size === 0 && /[\d一-鿿]/.test(query)) {
    try {
      await twLoader();
    } catch {
      /* 離線時只用內建表 */
    }
  }
  const key = nameKey(query);
  const scored: { info: SymbolInfo; score: number }[] = [];
  const seen = new Set<string>();
  const push = (info: SymbolInfo, score: number) => {
    if (seen.has(info.symbol)) {
      const ex = scored.find((x) => x.info.symbol === info.symbol);
      if (ex && ex.score < score) ex.score = score;
      return;
    }
    seen.add(info.symbol);
    scored.push({ info, score });
  };
  const direct = normalizeSymbol(query);
  if (direct) push(direct, 100);
  for (const e of bySymbol.values()) {
    const s = scoreEntry(key, e.code, [e.name ?? '', ...e.aliases]);
    if (s > 0) push({ symbol: e.symbol, market: e.market, code: e.code, name: e.name }, s);
  }
  for (const [code, v] of twRuntime) {
    const s = scoreEntry(key, code, [v.name]);
    if (s > 0) push({ symbol: `${code}.${v.market === 'TWO' ? 'TWO' : 'TW'}`, market: v.market, code, name: v.name }, s - 1);
  }
  scored.sort((a, b) => b.score - a.score || a.info.code.length - b.info.code.length || a.info.code.localeCompare(b.info.code));
  return scored.slice(0, limit).map((x) => x.info);
}

function scoreEntry(key: string, code: string, names: string[]): number {
  const c = code.toUpperCase();
  if (c === key) return 90;
  let best = 0;
  if (c.startsWith(key)) best = 70;
  for (const n of names) {
    const nk = nameKey(n);
    if (!nk) continue;
    if (nk === key) best = Math.max(best, 85);
    else if (nk.startsWith(key)) best = Math.max(best, 60);
    else if (nk.includes(key)) best = Math.max(best, 40);
  }
  return best;
}
