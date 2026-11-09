/**
 * GET /api/symbols?q=&limit=
 * 代號搜尋：支援 2330.TW、2330、AAPL、台積電、TWSE:2330 等格式（台股美股自動分流）。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchSymbols } from '@/lib/data-adapters/symbols';
import { jsonError, parseParams } from '../accuracy/_lib';

export const dynamic = 'force-dynamic';

const schema = z.object({
  q: z.string().max(40, '查詢字串過長').optional(),
  limit: z.coerce.number().int('limit 須為整數').min(1, 'limit 至少 1').max(30, 'limit 最多 30').optional(),
});

export async function GET(req: Request) {
  const p = parseParams(req.url, schema);
  if (!p.ok) return p.res;
  const { q = '', limit = 10 } = p.data;
  if (!q) return NextResponse.json({ results: [] });
  try {
    const results = await searchSymbols(q, limit);
    return NextResponse.json({ results: results.map((r) => ({ symbol: r.symbol, market: r.market, name: r.name, code: r.code })) });
  } catch (e) {
    return jsonError(`搜尋代號失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
