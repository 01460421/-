/**
 * 追蹤儀表板資料（伺服器端）：所有追蹤代號的最新預測方向、近 20 筆準度、最近偵測事件、資料新鮮度。
 * 追蹤代號 = 所有使用者自選清單 ∪ TRACK_SYMBOLS 環境變數。
 */
import type { Market, PredictionSnapshot, SystemEvent } from '@/lib/types';
import type { Store } from '@/lib/storage/types';
import { getStore } from '@/lib/storage';
import { dedupeLastPerDay } from '@/lib/engine/accuracy';
import { gate, DEFAULT_GATE } from '@/lib/direction/gating';
import { addDays, getMarketStatus, isTradingDay, marketOf } from '@/lib/calendar';
import { lookupName } from '@/lib/data-adapters/symbols';

export const DEFAULT_DASHBOARD_SYMBOLS = '2330.TW,0050.TW,2454.TW,AAPL,NVDA,MSFT';

export interface DashboardRow {
  symbol: string;
  name: string | null;
  market: Market;
  latest: {
    snapshotId: string;
    modelId: string;
    createdAt: string;
    trainEnd: string;
    horizon: number;
    lastPrice: number;
    meanLast: number | null;
    pUp: number | null;
    /** 依 0.65 / 0.35 門檻的訊號 */
    signal: 'up' | 'down' | 'neutral' | null;
    expectedChangePct: number | null;
  } | null;
  acc20: { n: number; hits: number; accuracy: number | null; horizon: 1 };
  latestEvent: Pick<SystemEvent, 'id' | 'at' | 'kind' | 'severity' | 'title'> | null;
  freshness: { trainEnd: string | null; expectedDate: string; lagTradingDays: number | null; status: 'fresh' | 'lag' | 'stale' | 'none' };
}

export interface DashboardData {
  generatedAt: string;
  storeKind: Store['kind'];
  symbols: string[];
  rows: DashboardRow[];
  lastCloseRuns: Record<'TW' | 'US', { at: string; title: string; severity: string; ok: number; failed: number } | null>;
  thresholds: { up: number; down: number };
  sources: { tracked: number; env: string[] };
}

export function envTrackSymbols(): string[] {
  return (process.env.TRACK_SYMBOLS || DEFAULT_DASHBOARD_SYMBOLS)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/** 最近一個「應已有收盤資料」的交易日 */
export function expectedDataDate(market: Market, now = new Date()): string {
  const st = getMarketStatus(market, now);
  let d = st.localDate;
  if (!(isTradingDay(market, d) && st.state === 'closed' && st.label === '收盤')) {
    d = addDays(d, -1);
    for (let i = 0; i < 30 && !isTradingDay(market, d); i++) d = addDays(d, -1);
  }
  return d;
}

export function tradingDaysBetween(market: Market, from: string, to: string): number {
  if (from >= to) return 0;
  let n = 0;
  let d = from;
  for (let i = 0; i < 400 && d < to; i++) {
    d = addDays(d, 1);
    if (isTradingDay(market, d)) n++;
  }
  return n;
}

async function rowFor(store: Store, symbol: string, now: Date): Promise<DashboardRow> {
  const market = marketOf(symbol);
  const expectedDate = expectedDataDate(market, now);
  let [snap] = await store.listSnapshots({ symbol, modelId: 'ensemble', limit: 1 });
  if (!snap) [snap] = (await store.listSnapshots({ symbol, limit: 5 })).filter((s) => s.modelId !== 'ai' && s.mean?.length);
  let latest: DashboardRow['latest'] = null;
  if (snap) {
    const h = snap.targetDates.length;
    const p = snap.pUp?.[h - 1];
    const pUp = p !== undefined && p !== null && Number.isFinite(p) ? p : null;
    const meanLast = snap.mean[h - 1] ?? null;
    latest = {
      snapshotId: snap.id,
      modelId: snap.modelId,
      createdAt: snap.createdAt,
      trainEnd: snap.trainEnd,
      horizon: h,
      lastPrice: snap.lastPrice,
      meanLast,
      pUp,
      signal: pUp === null ? null : gate(pUp, DEFAULT_GATE),
      expectedChangePct: meanLast !== null && snap.lastPrice ? ((meanLast - snap.lastPrice) / snap.lastPrice) * 100 : null,
    };
  }

  // 近 20 筆：集成模型 1 日期方向（依目標日排序取最近 20 筆已回填）
  let acc20: DashboardRow['acc20'] = { n: 0, hits: 0, accuracy: null, horizon: 1 };
  const ens: PredictionSnapshot[] = dedupeLastPerDay(await store.listSnapshots({ symbol, modelId: snap?.modelId ?? 'ensemble', limit: 80 }));
  if (ens.length) {
    const outs = (await store.listOutcomes(ens.map((s) => s.id)))
      .filter((o) => o.horizonIndex === 0 && o.directionCorrect !== null)
      .sort((a, b) => (a.targetDate < b.targetDate ? 1 : -1))
      .slice(0, 20);
    const hits = outs.filter((o) => o.directionCorrect).length;
    acc20 = { n: outs.length, hits, accuracy: outs.length ? hits / outs.length : null, horizon: 1 };
  }

  const evs = [
    ...(await store.listEvents({ symbol, kind: 'detector', limit: 1 })),
    ...(await store.listEvents({ symbol, kind: 'structural_break', limit: 1 })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const ev = evs[0];

  const lag = snap ? tradingDaysBetween(market, snap.trainEnd, expectedDate) : null;
  return {
    symbol,
    name: lookupName(symbol) ?? null,
    market,
    latest,
    acc20,
    latestEvent: ev ? { id: ev.id, at: ev.at, kind: ev.kind, severity: ev.severity, title: ev.title } : null,
    freshness: { trainEnd: snap?.trainEnd ?? null, expectedDate, lagTradingDays: lag, status: lag === null ? 'none' : lag === 0 ? 'fresh' : lag <= 2 ? 'lag' : 'stale' },
  };
}

export async function getDashboardData(now = new Date()): Promise<DashboardData> {
  const store = await getStore();
  let tracked: string[] = [];
  try {
    tracked = await store.listAllTrackedSymbols();
  } catch {
    tracked = [];
  }
  const env = envTrackSymbols();
  const symbols = [...new Set([...tracked.map((s) => s.toUpperCase()), ...env])];
  const rows = await Promise.all(symbols.map((s) => rowFor(store, s, now)));
  const runs = await store.listEvents({ kind: 'job_run', limit: 300 });
  const lastClose = (m: 'TW' | 'US') => {
    const e = runs.find((x) => (x.detail as { job?: string; market?: string }).job === 'close' && (x.detail as { market?: string }).market === m);
    if (!e) return null;
    const d = e.detail as { ok?: unknown[]; failed?: unknown[] };
    return { at: e.at, title: e.title, severity: e.severity, ok: d.ok?.length ?? 0, failed: d.failed?.length ?? 0 };
  };
  return {
    generatedAt: now.toISOString(),
    storeKind: store.kind,
    symbols,
    rows,
    lastCloseRuns: { TW: lastClose('TW'), US: lastClose('US') },
    thresholds: { up: DEFAULT_GATE.upper, down: DEFAULT_GATE.lower },
    sources: { tracked: tracked.length, env },
  };
}
