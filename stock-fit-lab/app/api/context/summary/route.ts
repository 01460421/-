/**
 * GET /api/context/summary?symbol=2330.TW[&asOf=YYYY-MM-DD]
 * AI 情境 JSON 用的精簡摘要（context_layers）：長期歷史、財報、心理社會指標、近 7 日新聞。
 * 各層獨立失敗（errors 欄位說明），快取 30 分鐘（有失敗層時 5 分鐘）。前端以 attachContextLayers 併入情境（總量 < 20KB）。
 */
import { z } from 'zod';
import { addDays } from '@/lib/calendar';
import { getHistorySummary } from '@/lib/history';
import { contextCache } from '@/lib/history/cache';
import { getFundamentals } from '@/lib/fundamentals';
import { getBehavioralIndicators } from '@/lib/behavioral';
import { searchNews } from '@/lib/news';
import { compactBehavioralLayer, compactFundamentalsLayer, compactHistoryLayer, compactNewsLayer, type ContextLayers } from '@/lib/ai/context';
import { DATE, NO_STORE, badSymbol, parseQuery, resolve } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;

const Query = z.object({ symbol: z.string().min(1).max(40), asOf: DATE.optional() });

async function build(symbol: string, asOf?: string): Promise<ContextLayers> {
  const to = asOf ?? new Date().toISOString().slice(0, 10);
  const [h, f, b, n] = await Promise.allSettled([
    getHistorySummary(symbol, { to: asOf }),
    getFundamentals(symbol, { asOf }),
    getBehavioralIndicators(symbol, { asOf, includeNews: false }),
    // 摘要不等待 GDELT（受限流時退避可達數十秒）；完整新聞由 search_news 工具查詢
    searchNews({ symbol, from: addDays(to, -6), to, asOf: asOf ?? undefined, limit: 20, maxFinMindDays: 3, maxMopsMonths: 1, includeGdelt: false }),
  ]);
  const errors: Record<string, string> = {};
  const val = <T, R>(r: PromiseSettledResult<T>, key: string, fn: (x: T) => R): R | null => {
    if (r.status === 'fulfilled') return fn(r.value);
    errors[key] = String((r.reason as Error)?.message ?? r.reason).slice(0, 160);
    return null;
  };
  return {
    history: val(h, 'history', compactHistoryLayer),
    fundamentals: val(f, 'fundamentals', compactFundamentalsLayer),
    behavioral: val(b, 'behavioral', compactBehavioralLayer),
    recentNews: val(n, 'recentNews', compactNewsLayer),
    ...(Object.keys(errors).length ? { errors } : {}),
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(req: Request) {
  const q = parseQuery(req, Query);
  if (!q.ok) return q.res;
  const symbol = resolve(q.data.symbol);
  if (!symbol) return badSymbol(q.data.symbol);
  const key = `ctx:summary:v1:${symbol}:${q.data.asOf ?? '-'}`;
  const c = contextCache();
  const hit = await c.get<ContextLayers>(key).catch(() => null);
  if (hit && hit.freshUntil > Date.now()) return Response.json(hit.value, { headers: NO_STORE });
  const layers = await build(symbol, q.data.asOf);
  // 有任一層失敗時只快取 5 分鐘，讓資料源恢復後能盡快補上
  await c.set(key, layers, layers.errors ? 300 : 1800).catch(() => undefined);
  return Response.json(layers, { headers: NO_STORE });
}
