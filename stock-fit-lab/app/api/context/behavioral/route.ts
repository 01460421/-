/**
 * GET /api/context/behavioral?symbol=2330.TW[&asOf=YYYY-MM-DD][&news=0]
 * 心理與社會指標（point-in-time），每項附公式、說明、學術出處與「相關不等於因果」警語。
 */
import { z } from 'zod';
import { getBehavioralIndicators } from '@/lib/behavioral';
import { DATE, NO_STORE, badSymbol, fail, parseQuery, resolve } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const Query = z.object({ symbol: z.string().min(1).max(40), asOf: DATE.optional(), news: z.enum(['0', '1']).optional() });

export async function GET(req: Request) {
  const q = parseQuery(req, Query);
  if (!q.ok) return q.res;
  const symbol = resolve(q.data.symbol);
  if (!symbol) return badSymbol(q.data.symbol);
  try {
    const r = await getBehavioralIndicators(symbol, { asOf: q.data.asOf, includeNews: q.data.news !== '0' });
    return Response.json(r, { headers: NO_STORE });
  } catch (e) {
    return fail(e, '心理社會指標計算失敗');
  }
}
