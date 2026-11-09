/**
 * GET /api/links?symbol=2330.TW[&templates=<JSON LinkTemplate[]>]
 * 外部追蹤網站連結（模板集中於 config/external-links.json）+ 使用者自訂模板 + TradingView 代號。
 */
import { z } from 'zod';
import { getExternalLinks, toTradingViewSymbol, type LinkTemplate } from '@/lib/integrations';
import { errorResponse, resolveSymbol } from '../analyze/_pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Template = z.object({
  id: z.string().max(60).optional(),
  label: z.string().min(1).max(40),
  url: z.string().min(8).max(500),
  market: z.enum(['TW', 'US', 'INDEX', 'ALL']).optional(),
});

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const raw = sp.get('symbol');
  if (!raw) return Response.json({ error: '缺少 symbol 參數' }, { status: 400 });
  let templates: LinkTemplate[] = [];
  const t = sp.get('templates');
  if (t) {
    try {
      const parsed = z.array(Template).max(30).safeParse(JSON.parse(t));
      if (!parsed.success) return Response.json({ error: '自訂連結模板格式錯誤' }, { status: 400 });
      templates = parsed.data;
    } catch {
      return Response.json({ error: 'templates 必須為 JSON 陣列' }, { status: 400 });
    }
  }
  try {
    const { symbol, name } = resolveSymbol(raw);
    return Response.json({
      symbol,
      name: name ?? null,
      links: getExternalLinks(symbol, templates),
      tvSymbol: toTradingViewSymbol(symbol),
      note: '外部網站僅以連結呈現，不抓取或複製其內容。',
    });
  } catch (e) {
    return errorResponse(e, '連結產生失敗');
  }
}
