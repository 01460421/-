/**
 * GET /api/context/news?symbol=2330.TW[&from=&to=][&asOf=][&query=][&minTier=official|wire|major|trade|other][&officialOnly=1]
 * 權威新聞標題與官方公告（point-in-time：只回傳 publishedAt ≤ asOf）。只有標題 + 連結 + 來源 + 時間，不含內文。
 */
import { z } from 'zod';
import { searchNews } from '@/lib/news';
import { DATE, NO_STORE, badSymbol, fail, parseQuery, resolve } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const Query = z
  .object({
    symbol: z.string().min(1).max(40),
    from: DATE.optional(),
    to: DATE.optional(),
    asOf: z.string().min(10).max(30).optional(),
    query: z.string().min(1).max(80).optional(),
    minTier: z.enum(['official', 'wire', 'major', 'trade', 'other']).optional(),
    officialOnly: z.enum(['0', '1']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'from 不可晚於 to' })
  .refine((v) => !v.asOf || Number.isFinite(Date.parse(v.asOf)), { message: 'asOf 格式錯誤' });

export async function GET(req: Request) {
  const q = parseQuery(req, Query);
  if (!q.ok) return q.res;
  const symbol = resolve(q.data.symbol);
  if (!symbol) return badSymbol(q.data.symbol);
  try {
    const r = await searchNews({ symbol, from: q.data.from, to: q.data.to, asOf: q.data.asOf, query: q.data.query, minTier: q.data.minTier, officialOnly: q.data.officialOnly === '1', limit: q.data.limit ?? 60 });
    return Response.json({ ...r, label: '只取標題與連結（不複製全文）；標題情緒為粗略啟發式' }, { headers: NO_STORE });
  } catch (e) {
    return fail(e, '新聞查詢失敗');
  }
}
