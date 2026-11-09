/**
 * GET /api/context/history?symbol=2330.TW[&from=&to=][&granularity=auto|day|week|month|quarter|year]
 * 上市以來長期日線摘要（point-in-time：只用 to 之前的資料）＋ 指定區間的降採樣 OHLC。
 * 回傳附來源（source）與資料時間（asOf）。
 */
import { z } from 'zod';
import { getHistorySummary, getRangeSeries, type Granularity } from '@/lib/history';
import { DATE, NO_STORE, badSymbol, fail, parseQuery, resolve } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const Query = z
  .object({
    symbol: z.string().min(1).max(40),
    from: DATE.optional(),
    to: DATE.optional(),
    granularity: z.enum(['auto', 'day', 'week', 'month', 'quarter', 'year']).optional(),
    maxPoints: z.coerce.number().int().min(10).max(400).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'from 不可晚於 to' });

export async function GET(req: Request) {
  const q = parseQuery(req, Query);
  if (!q.ok) return q.res;
  const symbol = resolve(q.data.symbol);
  if (!symbol) return badSymbol(q.data.symbol);
  try {
    const g = q.data.granularity && q.data.granularity !== 'auto' ? (q.data.granularity as Granularity) : undefined;
    const [summary, range] = await Promise.all([
      getHistorySummary(symbol, { to: q.data.to }),
      getRangeSeries(symbol, { from: q.data.from, to: q.data.to, granularity: g, maxPoints: q.data.maxPoints ?? 160 }),
    ]);
    return Response.json(
      { symbol, summary, range, source: summary.source, asOf: summary.asOf, delayMinutes: 0, pointInTime: q.data.to ?? null, label: '日線收盤資料；報酬以還原價計算' },
      { headers: NO_STORE },
    );
  } catch (e) {
    return fail(e, '長期歷史取得失敗');
  }
}
