/**
 * GET /api/context/fundamentals?symbol=AAPL[&asOf=YYYY-MM-DD][&guidance=1][&from=&to=]
 * asOf 當時已公開的實際財報（台股：法定期限判斷；美股：SEC XBRL filed 日）與（可選）官方方針出處清單。
 */
import { z } from 'zod';
import { getFundamentals, getGuidance } from '@/lib/fundamentals';
import { DATE, NO_STORE, badSymbol, fail, parseQuery, resolve } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const Query = z.object({
  symbol: z.string().min(1).max(40),
  asOf: DATE.optional(),
  guidance: z.enum(['0', '1']).optional(),
  from: DATE.optional(),
  to: DATE.optional(),
});

export async function GET(req: Request) {
  const q = parseQuery(req, Query);
  if (!q.ok) return q.res;
  const symbol = resolve(q.data.symbol);
  if (!symbol) return badSymbol(q.data.symbol);
  try {
    const asOf = q.data.asOf;
    const [fundamentals, guidance] = await Promise.all([
      getFundamentals(symbol, { asOf }),
      q.data.guidance === '1' ? getGuidance(symbol, { from: q.data.from, to: q.data.to ?? asOf, asOf: q.data.to ?? asOf }).catch((e: Error) => ({ error: e.message })) : Promise.resolve(null),
    ]);
    return Response.json({ symbol, asOf: fundamentals.asOf, fundamentals, guidance, label: '財報以公開日判斷 point-in-time；方針只列官方出處連結' }, { headers: NO_STORE });
  } catch (e) {
    return fail(e, '財報取得失敗');
  }
}
