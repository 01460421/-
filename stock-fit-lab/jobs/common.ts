/**
 * 排程工作共用：追蹤代號解析、事件寫入、依賴注入（測試可替換 store / 資料源 / 通知 / 時鐘）。
 */
import type { Market, SystemEvent } from '../lib/types';
import type { Store } from '../lib/storage/types';
import { getStore, newId } from '../lib/storage';
import { marketOf } from '../lib/calendar';
import { getMarketData, type MarketDataService } from '../lib/data-adapters';
import { notify as defaultNotify, type NotifyMessage, type NotifyResult } from '../lib/notify';

export type JobMarket = 'TW' | 'US';

export interface JobDeps {
  store?: Store;
  marketData?: Pick<MarketDataService, 'getHistory' | 'getEvents' | 'health'>;
  notify?: (msg: NotifyMessage) => Promise<NotifyResult[]>;
  now?: () => Date;
  /** 覆寫追蹤代號（預設：自選清單 ∪ TRACK_SYMBOLS） */
  symbols?: string[];
}

export interface ResolvedDeps {
  store: Store;
  marketData: Pick<MarketDataService, 'getHistory' | 'getEvents' | 'health'>;
  notify: (msg: NotifyMessage) => Promise<NotifyResult[]>;
  now: () => Date;
}

export async function resolveDeps(deps: JobDeps = {}): Promise<ResolvedDeps> {
  return {
    store: deps.store ?? (await getStore()),
    marketData: deps.marketData ?? getMarketData(),
    notify: deps.notify ?? ((m) => defaultNotify(m)),
    now: deps.now ?? (() => new Date()),
  };
}

export const DEFAULT_TRACK_SYMBOLS = '2330.TW,0050.TW,AAPL,NVDA';

/** 'TW' 包含上市（.TW）與上櫃（.TWO） */
export function inMarket(symbol: string, market?: JobMarket | null): boolean {
  if (!market) return true;
  const m: Market = marketOf(symbol);
  return market === 'TW' ? m === 'TW' || m === 'TWO' : m === 'US';
}

export function parseMarket(v: string | null | undefined): JobMarket | undefined {
  const s = (v ?? '').toUpperCase();
  return s === 'TW' || s === 'US' ? s : undefined;
}

/** 追蹤代號 = 所有使用者自選清單 ∪ TRACK_SYMBOLS 環境變數 */
export async function resolveSymbols(store: Store, market?: JobMarket, override?: string[]): Promise<string[]> {
  const fromEnv = (process.env.TRACK_SYMBOLS ?? DEFAULT_TRACK_SYMBOLS)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  let tracked: string[] = [];
  try {
    tracked = await store.listAllTrackedSymbols();
  } catch {
    tracked = [];
  }
  const all = override ?? [...new Set([...tracked.map((s) => s.toUpperCase()), ...fromEnv])];
  return all.filter((s) => inMarket(s, market));
}

export function makeEvent(
  now: () => Date,
  kind: SystemEvent['kind'],
  severity: SystemEvent['severity'],
  title: string,
  detail: Record<string, unknown>,
  symbol?: string,
): SystemEvent {
  return { id: newId(), at: now().toISOString(), kind, severity, title, detail, ...(symbol ? { symbol } : {}) };
}

/** 分析頁網址（通知訊息附上直連 URL；notify 會以 NEXT_PUBLIC_SITE_URL 補成絕對網址） */
export function analysisUrl(symbol: string): string {
  return `/stock/${encodeURIComponent(symbol)}`;
}

/** 送出通知並寫入 notification 事件（稽核軌跡） */
export async function notifyAndLog(d: ResolvedDeps, msg: NotifyMessage, symbol?: string): Promise<NotifyResult[]> {
  let results: NotifyResult[] = [];
  try {
    results = await d.notify(msg);
  } catch (e) {
    results = [{ channel: 'unknown', ok: false, error: e instanceof Error ? e.message : String(e) }];
  }
  await d.store.appendEvent(makeEvent(d.now, 'notification', msg.severity, msg.title, { body: msg.body, url: msg.url, results }, symbol));
  return results;
}

export interface JobReport {
  job: 'close' | 'intraday' | 'backfill';
  market?: JobMarket;
  startedAt: string;
  durationMs: number;
  symbols: string[];
  ok: string[];
  failed: { symbol: string; error: string }[];
  skipped?: string;
  stats: Record<string, number>;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 以 job_run / job_error 事件包住整個工作 */
export async function runJob(
  job: JobReport['job'],
  market: JobMarket | undefined,
  deps: JobDeps,
  body: (d: ResolvedDeps, report: JobReport) => Promise<void>,
): Promise<JobReport> {
  const d = await resolveDeps(deps);
  const t0 = Date.now();
  const report: JobReport = { job, market, startedAt: d.now().toISOString(), durationMs: 0, symbols: [], ok: [], failed: [], stats: {} };
  try {
    await body(d, report);
    report.durationMs = Date.now() - t0;
    await d.store.appendEvent(
      makeEvent(d.now, 'job_run', report.failed.length ? 'warn' : 'info', `排程 ${job}${market ? ` (${market})` : ''} 完成`, {
        ...report,
      }),
    );
  } catch (e) {
    report.durationMs = Date.now() - t0;
    report.failed.push({ symbol: '*', error: errMsg(e) });
    await d.store.appendEvent(makeEvent(d.now, 'job_error', 'critical', `排程 ${job}${market ? ` (${market})` : ''} 失敗`, { error: errMsg(e), stack: e instanceof Error ? e.stack : undefined, report }));
  }
  return report;
}
