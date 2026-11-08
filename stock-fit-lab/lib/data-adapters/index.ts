/**
 * MarketDataService：資料源優先序 + 快取 + 健康追蹤 + 失敗降級。
 *
 * 優先序（第二節）：
 *  - 上市 TW ：FinMind（還原）→ TWSE → Yahoo
 *  - 上櫃 TWO：FinMind（還原）→ TPEx → Yahoo
 *  - 美股 US ：Yahoo → Polygon → Alpha Vantage → Finnhub（需金鑰者未設定時自動跳過）
 *  - 盤中頻率：不支援的資料源（FinMind / TWSE / TPEx）自動跳過
 * 全部失敗時回傳快取中的舊資料並標示 stale: true；完全沒有資料才丟錯。
 */
import type { Interval, Market, PriceSeries } from '../types';
import type { AdapterHealth, CorporateEvent, DataAdapter, DataTable, DatasetId, HistoryRequest, Quote, SymbolInfo } from './types';
import { createCache, ttlForInterval, type CacheStore } from './cache';
import { UnsupportedError } from './http';
import { getLimiter } from './ratelimit';
import { MACRO_SYMBOLS, lookupName, normalizeSymbol, setTwSymbolLoader } from './symbols';
import { filterRange, todayIn } from './util';
import { FinMindAdapter, loadTaiwanStockInfo } from './finmind';
import { TwseAdapter } from './twse';
import { TpexAdapter } from './tpex';
import { YahooAdapter } from './yahoo';
import { AlphaVantageAdapter } from './alphavantage';
import { PolygonAdapter } from './polygon';
import { FinnhubAdapter } from './finnhub';
import { addDays } from '../calendar';

export { normalizeSymbol, searchSymbols, MACRO_SYMBOLS, toYahooSymbol, lookupName } from './symbols';
export type { HistoryRequest } from './types';

export interface MarketDataService {
  getHistory(symbol: string, req?: Partial<HistoryRequest>): Promise<PriceSeries>;
  getQuote(symbol: string): Promise<Quote | null>;
  getDataset(symbol: string, dataset: DatasetId, opts?: { start?: string; end?: string }): Promise<DataTable>;
  getEvents(symbol: string, opts?: { start?: string; end?: string }): Promise<CorporateEvent[]>;
  health(): AdapterHealth[];
}

/** 具備額外能力宣告的 Adapter */
export type ExtendedAdapter = DataAdapter & { supportsInterval?(i: Interval): boolean };

export interface ServiceOptions {
  adapters?: ExtendedAdapter[];
  cache?: CacheStore;
  priority?: Partial<Record<Market, string[]>>;
  quotePriority?: Partial<Record<Market, string[]>>;
  /** 某資料源連續失敗達 alertAfter 次時呼叫（健康監控通知管理者） */
  onHealthAlert?: (h: AdapterHealth) => void;
  alertAfter?: number;
}

const HISTORY_PRIORITY: Record<Market, string[]> = {
  TW: ['finmind', 'twse', 'yahoo'],
  TWO: ['finmind', 'tpex', 'yahoo'],
  US: ['yahoo', 'polygon', 'alphavantage', 'finnhub'],
};

const QUOTE_PRIORITY: Record<Market, string[]> = {
  TW: ['yahoo', 'finmind', 'twse'],
  TWO: ['yahoo', 'finmind', 'tpex'],
  US: ['yahoo', 'finnhub', 'polygon', 'alphavantage'],
};

const DATASET_PRIORITY: Record<Market, string[]> = {
  TW: ['finmind', 'twse'],
  TWO: ['finmind', 'tpex'],
  US: ['finnhub', 'polygon', 'alphavantage', 'yahoo'],
};

const EVENT_SOURCES: Record<Market, string[]> = {
  TW: ['finmind', 'yahoo'],
  TWO: ['finmind', 'yahoo'],
  US: ['yahoo', 'finnhub'],
};

const DATASET_TITLES: Record<DatasetId, string> = {
  institutional: '三大法人買賣超',
  margin: '融資融券',
  securities_lending: '借券賣出',
  shareholding: '集保股權分散表',
  monthly_revenue: '月營收',
  financials: '季報三大表',
  dividends: '股利發放紀錄',
  valuation: '本益比 / 股價淨值比 / 殖利率',
  short_interest: '空單餘額',
  insider: '內部人交易',
  options: '選擇權 IV / PCR / 未平倉',
  news: '新聞標題',
  macro: '市場環境指數',
};

/** 各資料集在無資料源時的說明 */
const UNAVAILABLE_HINT: Partial<Record<DatasetId, string>> = {
  short_interest: '美股空單餘額需付費資料源（例如 Polygon / Finnhub 進階方案），目前未接入。',
  options: '選擇權 IV / PCR / 未平倉需券商或付費資料源，目前未接入。',
  insider: '內部人交易需設定 FINNHUB_API_KEY。',
};

export function defaultAdapters(): ExtendedAdapter[] {
  return [new FinMindAdapter(), new TwseAdapter(), new TpexAdapter(), new YahooAdapter(), new PolygonAdapter(), new AlphaVantageAdapter(), new FinnhubAdapter()];
}

class HealthTracker {
  private readonly map = new Map<string, AdapterHealth>();
  constructor(
    ids: string[],
    private readonly onAlert?: (h: AdapterHealth) => void,
    private readonly alertAfter = 2,
  ) {
    for (const id of ids) this.map.set(id, { adapterId: id, calls: 0, failures: 0, consecutiveFailures: 0 });
  }

  private entry(id: string): AdapterHealth {
    let h = this.map.get(id);
    if (!h) {
      h = { adapterId: id, calls: 0, failures: 0, consecutiveFailures: 0 };
      this.map.set(id, h);
    }
    return h;
  }

  ok(id: string): void {
    const h = this.entry(id);
    h.calls++;
    h.consecutiveFailures = 0;
    h.lastSuccessAt = new Date().toISOString();
  }

  fail(id: string, err: unknown): void {
    const h = this.entry(id);
    h.calls++;
    h.failures++;
    h.consecutiveFailures++;
    h.lastError = errMsg(err).slice(0, 300);
    if (h.consecutiveFailures === this.alertAfter && this.onAlert) {
      try {
        this.onAlert({ ...h });
      } catch {
        /* 通知失敗不影響資料流程 */
      }
    }
  }

  list(): AdapterHealth[] {
    return [...this.map.values()].map((h) => {
      const lim = getLimiter(h.adapterId);
      const quotaLimit = h.adapterId === 'finmind' && process.env.FINMIND_TOKEN ? 600 : lim.hourlyQuota;
      return { ...h, quotaUsed: lim.usedLastHour(), quotaLimit };
    });
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

class MarketDataServiceImpl implements MarketDataService {
  private readonly adapters: Map<string, ExtendedAdapter>;
  private readonly cache: CacheStore;
  private readonly tracker: HealthTracker;
  private readonly priority: Record<Market, string[]>;
  private readonly quotePriority: Record<Market, string[]>;
  private readonly inflight = new Map<string, Promise<PriceSeries>>();

  constructor(opts: ServiceOptions = {}) {
    const list = opts.adapters ?? defaultAdapters();
    this.adapters = new Map(list.map((a) => [a.id, a]));
    this.cache = opts.cache ?? createCache();
    this.tracker = new HealthTracker(list.map((a) => a.id), opts.onHealthAlert, opts.alertAfter ?? 2);
    this.priority = { ...HISTORY_PRIORITY, ...(opts.priority ?? {}) };
    this.quotePriority = { ...QUOTE_PRIORITY, ...(opts.quotePriority ?? {}) };
  }

  private chain(ids: string[], info: SymbolInfo): ExtendedAdapter[] {
    const out: ExtendedAdapter[] = [];
    for (const id of ids) {
      const a = this.adapters.get(id);
      if (!a || !a.isConfigured()) continue;
      if (!a.markets.includes(info.market)) continue;
      out.push(a);
    }
    return out;
  }

  async getHistory(symbol: string, req: Partial<HistoryRequest> = {}): Promise<PriceSeries> {
    const info = normalizeSymbol(symbol);
    if (!info) throw new Error(`無法辨識代號：${symbol}`);
    const interval: Interval = req.interval ?? '1d';
    const key = `hist:v1:${info.symbol}:${interval}:${req.start ?? '-'}:${req.end ?? '-'}`;
    const hit = await this.cache.get<PriceSeries>(key).catch(() => null);
    if (hit && hit.freshUntil > Date.now()) return hit.value;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.fetchHistory(info, { interval, start: req.start, end: req.end }, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async fetchHistory(info: SymbolInfo, req: HistoryRequest, key: string): Promise<PriceSeries> {
    const errors: string[] = [];
    for (const a of this.chain(this.priority[info.market], info)) {
      if (a.supportsInterval && !a.supportsInterval(req.interval)) continue;
      try {
        const s = await a.getHistory(info.symbol, req);
        if (!s?.bars?.length) throw new Error('empty series');
        this.tracker.ok(a.id);
        const ttl = ttlForInterval(req.interval, info.market);
        await this.cache.set(key, s, ttl).catch(() => undefined);
        await this.cache.set(`histlast:v1:${info.symbol}:${req.interval}`, s, ttl).catch(() => undefined);
        return s;
      } catch (e) {
        if (e instanceof UnsupportedError) continue;
        this.tracker.fail(a.id, e);
        errors.push(`${a.name}: ${errMsg(e)}`);
      }
    }
    // 降級：同一請求的舊快取 → 同代號同頻率最近一次成功的資料
    const old = await this.cache.get<PriceSeries>(key).catch(() => null);
    if (old) return { ...old.value, stale: true };
    const last = await this.cache.get<PriceSeries>(`histlast:v1:${info.symbol}:${req.interval}`).catch(() => null);
    if (last) {
      const bars = filterRange(last.value.bars, req.start, req.end);
      if (bars.length) return { ...last.value, bars, stale: true };
    }
    throw new Error(`所有資料源皆無法取得 ${info.symbol}（${req.interval}）：${errors.join('；') || '無可用資料源'}`);
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const info = normalizeSymbol(symbol);
    if (!info) return null;
    const key = `quote:v1:${info.symbol}`;
    const hit = await this.cache.get<Quote>(key).catch(() => null);
    if (hit && hit.freshUntil > Date.now()) return hit.value;
    for (const a of this.chain(this.quotePriority[info.market], info)) {
      if (!a.getQuote) continue;
      try {
        const q = await a.getQuote(info.symbol);
        this.tracker.ok(a.id);
        await this.cache.set(key, q, 30).catch(() => undefined);
        return q;
      } catch (e) {
        if (e instanceof UnsupportedError) continue;
        this.tracker.fail(a.id, e);
      }
    }
    try {
      const s = await this.getHistory(info.symbol, { interval: '1d' });
      const last = s.bars[s.bars.length - 1];
      const prev = s.bars[s.bars.length - 2];
      return {
        symbol: info.symbol,
        price: last.close,
        change: prev ? last.close - prev.close : undefined,
        changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : undefined,
        at: s.asOf,
        delayMinutes: s.delayMinutes,
        source: `${s.source}（最近收盤${s.stale ? '，快取' : ''}）`,
      };
    } catch {
      return hit?.value ?? null;
    }
  }

  async getDataset(symbol: string, dataset: DatasetId, opts: { start?: string; end?: string } = {}): Promise<DataTable> {
    const info = normalizeSymbol(symbol);
    const empty = (reason: string, sym = info?.symbol ?? symbol): DataTable => ({
      dataset,
      title: DATASET_TITLES[dataset] ?? dataset,
      symbol: sym,
      source: '—',
      fetchedAt: new Date().toISOString(),
      asOf: new Date().toISOString(),
      delayMinutes: 0,
      columns: [],
      rows: [],
      unavailableReason: reason,
    });
    if (!info) return empty(`無法辨識代號：${symbol}`);
    if (dataset === 'macro') return this.macroTable(info.symbol);
    const key = `ds:v1:${info.symbol}:${dataset}:${opts.start ?? '-'}:${opts.end ?? '-'}`;
    const hit = await this.cache.get<DataTable>(key).catch(() => null);
    if (hit && hit.freshUntil > Date.now()) return hit.value;
    const errors: string[] = [];
    let sawCandidate = false;
    for (const id of DATASET_PRIORITY[info.market]) {
      const a = this.adapters.get(id);
      if (!a?.getDataset || !a.markets.includes(info.market)) continue;
      if (!a.isConfigured()) {
        errors.push(`${a.name} 未設定金鑰`);
        continue;
      }
      sawCandidate = true;
      try {
        const t = await a.getDataset(info.symbol, dataset, opts);
        this.tracker.ok(a.id);
        const ttl = dataset === 'news' ? 900 : ttlForInterval('1d', info.market);
        await this.cache.set(key, t, ttl).catch(() => undefined);
        return t;
      } catch (e) {
        if (e instanceof UnsupportedError) continue;
        this.tracker.fail(a.id, e);
        errors.push(`${a.name}: ${errMsg(e)}`);
      }
    }
    if (hit) return { ...hit.value, unavailableReason: `資料源暫時失敗，顯示快取（${new Date(hit.storedAt).toISOString()}）` };
    const hint = UNAVAILABLE_HINT[dataset];
    if (!sawCandidate || !errors.length) return empty(hint ?? `目前沒有資料源提供「${DATASET_TITLES[dataset]}」（${info.market === 'US' ? '美股' : '台股'}）。${errors.join('；')}`);
    return empty(`資料源失敗：${errors.join('；')}`);
  }

  private async macroTable(forSymbol: string): Promise<DataTable> {
    const end = todayIn('TW');
    const start = addDays(end, -45);
    const results = await Promise.allSettled(MACRO_SYMBOLS.map((s) => this.getHistory(s, { interval: '1d', start })));
    const rows: DataTable['rows'] = [];
    const sources = new Set<string>();
    let asOf = '';
    results.forEach((r, i) => {
      const sym = MACRO_SYMBOLS[i];
      if (r.status !== 'fulfilled' || !r.value.bars.length) {
        rows.push({ symbol: sym, name: lookupName(sym) ?? sym, date: null, close: null, change: null, changePct: null, source: '無法取得' });
        return;
      }
      const s = r.value;
      const last = s.bars[s.bars.length - 1];
      const prev = s.bars[s.bars.length - 2];
      sources.add(s.source);
      if (s.asOf > asOf) asOf = s.asOf;
      rows.push({
        symbol: sym,
        name: lookupName(sym) ?? sym,
        date: last.date,
        close: last.close,
        change: prev ? round4(last.close - prev.close) : null,
        changePct: prev ? round4(((last.close - prev.close) / prev.close) * 100) : null,
        source: s.source + (s.stale ? '（快取）' : ''),
      });
    });
    const okCount = results.filter((r) => r.status === 'fulfilled').length;
    return {
      dataset: 'macro',
      title: DATASET_TITLES.macro,
      symbol: forSymbol,
      source: [...sources].join(' / ') || '—',
      fetchedAt: new Date().toISOString(),
      asOf: asOf || new Date().toISOString(),
      delayMinutes: 0,
      columns: [
        { key: 'symbol', label: '代號' },
        { key: 'name', label: '名稱' },
        { key: 'date', label: '日期' },
        { key: 'close', label: '收盤' },
        { key: 'change', label: '漲跌' },
        { key: 'changePct', label: '漲跌幅', unit: '%' },
        { key: 'source', label: '來源' },
      ],
      rows,
      unavailableReason: okCount === 0 ? '所有市場環境序列皆無法取得' : undefined,
    };
  }

  async getEvents(symbol: string, opts: { start?: string; end?: string } = {}): Promise<CorporateEvent[]> {
    const info = normalizeSymbol(symbol);
    if (!info || info.symbol.startsWith('^') || info.symbol.includes('=')) return [];
    const key = `ev:v1:${info.symbol}:${opts.start ?? '-'}:${opts.end ?? '-'}`;
    const hit = await this.cache.get<CorporateEvent[]>(key).catch(() => null);
    if (hit && hit.freshUntil > Date.now()) return hit.value;
    const sources = this.chain(EVENT_SOURCES[info.market], info).filter((a) => a.getEvents);
    const settled = await Promise.allSettled(sources.map((a) => a.getEvents!(info.symbol, opts)));
    const all: CorporateEvent[] = [];
    let anyOk = false;
    settled.forEach((r, i) => {
      const id = sources[i].id;
      if (r.status === 'fulfilled') {
        anyOk = true;
        this.tracker.ok(id);
        all.push(...r.value);
      } else if (!(r.reason instanceof UnsupportedError)) this.tracker.fail(id, r.reason);
    });
    if (!anyOk && hit) return hit.value;
    const merged = mergeEvents(all).filter((e) => (!opts.start || e.date >= opts.start) && (!opts.end || e.date <= opts.end));
    if (anyOk) await this.cache.set(key, merged, 6 * 3600).catch(() => undefined);
    return merged;
  }

  health(): AdapterHealth[] {
    return this.tracker.list();
  }
}

/** 同日同類型事件去重（保留先出現的來源，標題合併） */
export function mergeEvents(events: CorporateEvent[]): CorporateEvent[] {
  const m = new Map<string, CorporateEvent>();
  for (const e of events) {
    if (!e?.date) continue;
    const k = `${e.date}|${e.type}`;
    if (!m.has(k)) m.set(k, e);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

export function createMarketDataService(opts: ServiceOptions = {}): MarketDataService {
  return new MarketDataServiceImpl(opts);
}

let singleton: MarketDataService | null = null;
let alertHandler: ((h: AdapterHealth) => void) | undefined;

/** 設定資料源連續失敗通知（例如排程呼叫 notify）；需在第一次 getMarketData() 前設定 */
export function setHealthAlertHandler(fn: (h: AdapterHealth) => void): void {
  alertHandler = fn;
}

export function getMarketData(): MarketDataService {
  if (!singleton) singleton = createMarketDataService({ onHealthAlert: (h) => alertHandler?.(h) });
  return singleton;
}

/** 測試用 */
export function resetMarketData(): void {
  singleton = null;
}

// 台股完整清單：搜尋時才載入，失敗 10 分鐘後可重試
let twLoadedAt = 0;
let twLoading: Promise<void> | null = null;
setTwSymbolLoader(async () => {
  if (twLoading) return twLoading;
  if (Date.now() - twLoadedAt < 600_000) return;
  twLoadedAt = Date.now();
  twLoading = loadTaiwanStockInfo()
    .then(() => undefined)
    .finally(() => {
      twLoading = null;
    });
  return twLoading;
});
