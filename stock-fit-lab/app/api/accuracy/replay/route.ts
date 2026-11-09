/**
 * GET /api/accuracy/replay?symbol=&date=YYYY-MM-DD&models=a,b
 * 預測回放：回到過去時點，只回傳當時已知價格 + 當時已寫入的快照，再附上之後的真實走勢。
 * 未提供 date 時只回傳可回放的日期清單（快照的訓練迄日）。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Bar } from '@/lib/types';
import { getStore } from '@/lib/storage';
import { replayAt } from '@/lib/engine/accuracy';
import { getMarketData } from '@/lib/data-adapters';
import { jsonError, jsonSafe, modelNames, parseParams, zDate, zSymbol } from '../_lib';

export const dynamic = 'force-dynamic';

const schema = z.object({
  symbol: zSymbol,
  date: zDate.optional(),
  models: z
    .string()
    .regex(/^[a-z0-9_,]{1,300}$/, '模型清單格式錯誤')
    .transform((s) => s.split(',').filter(Boolean))
    .optional(),
  before: z.coerce.number().int().min(10).max(500).optional(),
});

export async function GET(req: Request) {
  const p = parseParams(req.url, schema);
  if (!p.ok) return p.res;
  const { symbol, date, models, before = 120 } = p.data;
  try {
    const store = await getStore();
    const all = await store.listSnapshots({ symbol });
    const availableDates = [...new Set(all.filter((s) => s.mean?.length).map((s) => s.trainEnd))].sort();
    if (!date) return NextResponse.json({ symbol, availableDates, generatedAt: new Date().toISOString() });

    let bars: Bar[] = [];
    let source: string | null = null;
    let barsError: string | null = null;
    try {
      const series = await getMarketData().getHistory(symbol, { interval: '1d' });
      bars = series.bars;
      source = `${series.source}${series.stale ? '（快取）' : ''}`;
    } catch (e) {
      barsError = `無法取得 ${symbol} 日線：${e instanceof Error ? e.message : String(e)}；之後走勢改以快照回填的實際值呈現`;
    }
    const r = await replayAt(store, symbol, date, { bars, models });
    const snapshots = r.snapshots
      .filter((s) => s.mean?.length)
      .map((s) => ({
        id: s.id,
        modelId: s.modelId,
        modelVersion: s.modelVersion,
        createdAt: s.createdAt,
        trainEnd: s.trainEnd,
        lastPrice: s.lastPrice,
        targetDates: s.targetDates,
        mean: s.mean,
        lower: s.lower,
        upper: s.upper,
        level: s.level,
        pUp: s.pUp ?? null,
        naive: s.benchmarks.naive ?? null,
      }));
    const lastTarget = snapshots.reduce((m, s) => (s.targetDates[s.targetDates.length - 1] > m ? s.targetDates[s.targetDates.length - 1] : m), date);
    // 之後的真實走勢：顯示到最後一個目標日後再多 10 根
    let afterCount = r.after.findIndex((x) => x.date > lastTarget);
    afterCount = afterCount < 0 ? r.after.length : Math.min(r.after.length, afterCount + 10);
    return NextResponse.json(
      jsonSafe({
        symbol,
        date,
        generatedAt: new Date().toISOString(),
        source,
        barsError,
        availableDates,
        known: r.known.slice(-before),
        after: r.after.slice(0, afterCount),
        snapshots,
        outcomes: r.outcomes,
        modelNames: modelNames(),
        note: '主圖只使用回放日當時已知的價格與當時已寫入的快照；之後走勢僅作事後對照。',
      }),
    );
  } catch (e) {
    return jsonError(`回放失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
