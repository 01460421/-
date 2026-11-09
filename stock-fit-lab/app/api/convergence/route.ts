/**
 * GET /api/convergence?symbol=2330.TW&target=YYYY-MM-DD[&models=ensemble,kalman]
 * 即時修正時間軸：同一目標日的預測如何隨修正時間收斂或漂移（資料只來自已寫入的快照）。
 * 另回傳 candidates：近期快照中涵蓋最多次預測的目標日（供前端選擇）。
 */
import { z } from 'zod';
import { convergenceForTarget } from '@/lib/engine';
import { getStore } from '@/lib/storage';
import { errorResponse, resolveSymbol } from '../analyze/_pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Query = z.object({
  symbol: z.string().min(1).max(40),
  target: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  models: z.string().max(300).optional(),
  lookbackDays: z.coerce.number().int().min(5).max(400).optional(),
});

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return Response.json({ error: `參數錯誤：${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('；')}` }, { status: 400 });
  const q = parsed.data;
  try {
    const { symbol } = resolveSymbol(q.symbol);
    const store = await getStore();
    const recent = await store.listSnapshots({ symbol, modelId: 'ensemble', limit: 300 });
    const counts = new Map<string, number>();
    for (const s of recent) for (const d of s.targetDates) counts.set(d, (counts.get(d) ?? 0) + 1);
    const candidates = [...counts.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, count]) => ({ date, count }))
      .slice(-80);
    const target = q.target ?? candidates.filter((c) => c.count > 1).at(-1)?.date ?? candidates.at(-1)?.date;
    if (!target) return Response.json({ symbol, targetDate: null, byModel: {}, actual: null, candidates, note: '尚無快照：每次分析或排程執行都會寫入快照，累積後即可看到收斂過程。' });
    const models = q.models ? q.models.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const series = await convergenceForTarget(store, symbol, target, { models, lookbackDays: q.lookbackDays });
    return Response.json({ ...series, candidates, storeKind: store.kind }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e, '收斂資料取得失敗');
  }
}
