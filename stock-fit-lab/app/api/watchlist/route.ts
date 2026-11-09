/**
 * 自選股（個人資料，只存於 cookie 使用者 id 名下）。
 *   GET                       → { tw: Item[], us: Item[] }，每檔附最近一次集成預測方向與近 20 日準度徵章
 *   POST { symbol }           → 新增單檔
 *   POST { csv, format? }     → 匯入 Yahoo Finance / TradingView 匯出清單（自動辨識台美股並正規化）
 *   DELETE ?symbol=           → 移除
 */
import { z } from 'zod';
import type { WatchlistItem } from '@/lib/types';
import { getStore } from '@/lib/storage';
import { getUserId } from '@/lib/user';
import { parseWatchlist, toWatchlistItems } from '@/lib/integrations';
import { normalizeSymbol } from '@/lib/data-adapters';
import { loadRecords, scorecardFromRecords } from '@/lib/engine';
import { gate, DEFAULT_GATE } from '@/lib/direction/gating';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function enrich(item: WatchlistItem) {
  const store = await getStore();
  const [snap] = await store.listSnapshots({ symbol: item.symbol, modelId: 'ensemble', limit: 1 });
  let latest: { pUp: number | null; signal: 'up' | 'down' | 'neutral'; issuedAt: string; trainEnd: string; horizon: number } | null = null;
  if (snap) {
    const p = snap.pUp?.[snap.pUp.length - 1];
    latest = {
      pUp: typeof p === 'number' && Number.isFinite(p) ? p : null,
      signal: typeof p === 'number' && Number.isFinite(p) ? gate(p, DEFAULT_GATE) : 'neutral',
      issuedAt: snap.createdAt,
      trainEnd: snap.trainEnd,
      horizon: snap.targetDates.length,
    };
  }
  let accuracy20: { directionAccuracy: number | null; n: number } = { directionAccuracy: null, n: 0 };
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const recs = await loadRecords(store, { symbol: item.symbol, models: ['ensemble'], period: { from, to: now.toISOString() } });
    const row = scorecardFromRecords(recs, { horizons: [1] })[0];
    if (row && !row.hidden) accuracy20 = { directionAccuracy: Number.isFinite(row.directionAccuracy) ? row.directionAccuracy : null, n: row.dirN };
  } catch {
    /* 無紀錄 */
  }
  return { ...item, latest, accuracy20 };
}

export async function GET() {
  try {
    const userId = getUserId();
    const store = await getStore();
    const items = await store.listWatchlist(userId);
    const enriched = await Promise.all(items.map(enrich));
    return Response.json(
      {
        tw: enriched.filter((x) => x.market === 'TW' || x.market === 'TWO'),
        us: enriched.filter((x) => x.market === 'US'),
        storeKind: store.kind,
        note: '方向取自最近一次寫入的集成快照（門檻 0.65 / 0.35）；準度為近 20 個交易日（約 30 日曆日）1 日期方向準確率。',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json({ error: `自選股讀取失敗：${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

const PostBody = z.union([
  z.object({ symbol: z.string().min(1).max(40), name: z.string().max(60).optional() }),
  z.object({ csv: z.string().min(1).max(200_000), format: z.enum(['auto', 'yahoo_csv', 'tradingview', 'plain']).optional() }),
]);

export async function POST(req: Request) {
  let body: z.infer<typeof PostBody>;
  try {
    const parsed = PostBody.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: '請提供 symbol 或 csv' }, { status: 400 });
    body = parsed.data;
  } catch {
    return Response.json({ error: '請求內容必須為 JSON' }, { status: 400 });
  }
  try {
    const userId = getUserId();
    const store = await getStore();
    if ('symbol' in body) {
      const info = normalizeSymbol(body.symbol);
      if (!info) return Response.json({ error: `無法辨識代號：${body.symbol}` }, { status: 400 });
      const item: WatchlistItem = { userId, symbol: info.symbol, market: info.market, name: body.name ?? info.name, addedAt: new Date().toISOString(), source: 'manual' };
      await store.upsertWatchlist([item]);
      return Response.json({ ok: true, added: [item.symbol] });
    }
    const result = parseWatchlist(body.csv, body.format ?? 'auto');
    const items = toWatchlistItems(result, userId);
    if (items.length) await store.upsertWatchlist(items);
    return Response.json({
      ok: true,
      format: result.format,
      added: items.map((i) => i.symbol),
      tw: result.tw.length,
      us: result.us.length,
      unrecognized: result.unrecognized,
      duplicates: result.duplicates,
    });
  } catch (e) {
    return Response.json({ error: `自選股寫入失敗：${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams;
  let raw = sp.get('symbol');
  if (!raw) {
    try {
      raw = ((await req.json()) as { symbol?: string }).symbol ?? null;
    } catch {
      /* 無 body */
    }
  }
  if (!raw) return Response.json({ error: '缺少 symbol' }, { status: 400 });
  const info = normalizeSymbol(raw);
  try {
    await (await getStore()).removeWatchlist(getUserId(), info?.symbol ?? raw);
    return Response.json({ ok: true, removed: info?.symbol ?? raw });
  } catch (e) {
    return Response.json({ error: `移除失敗：${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
