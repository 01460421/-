/**
 * GET /api/dataset?symbol=2330.TW&dataset=institutional[&start=&end=][&format=csv]
 * 超詳細資料層（第十節）：回傳 DataTable（含來源 / 資料時間 / 延遲），format=csv 時下載 CSV（UTF-8 BOM）。
 */
import { z } from 'zod';
import type { DataTable, DatasetId } from '@/lib/data-adapters/types';
import { getMarketData } from '@/lib/data-adapters';
import { errorResponse, resolveSymbol } from '../analyze/_pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATASETS = [
  'institutional', 'margin', 'securities_lending', 'shareholding', 'monthly_revenue', 'financials', 'dividends', 'valuation',
  'short_interest', 'insider', 'options', 'news', 'macro',
] as const satisfies readonly DatasetId[];

const Query = z.object({
  symbol: z.string().min(1).max(40),
  dataset: z.enum(DATASETS),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(['json', 'csv']).optional(),
});

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(t: DataTable): string {
  const head = t.columns.map((c) => csvCell(c.unit ? `${c.label}(${c.unit})` : c.label)).join(',');
  const rows = t.rows.map((r) => t.columns.map((c) => csvCell(r[c.key])).join(','));
  const meta = `# ${t.title} · ${t.symbol} · 來源 ${t.source} · 資料時間 ${t.asOf} · 延遲 ${t.delayMinutes} 分鐘`;
  return '﻿' + [meta, head, ...rows].join('\r\n');
}

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = Query.safeParse(sp);
  if (!parsed.success) return Response.json({ error: `參數錯誤：${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('；')}` }, { status: 400 });
  const q = parsed.data;
  try {
    const { symbol } = resolveSymbol(q.symbol);
    const table = await getMarketData().getDataset(symbol, q.dataset, { start: q.start, end: q.end });
    if (q.format === 'csv') {
      return new Response(toCsv(table), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(`${symbol}_${q.dataset}.csv`)}"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return Response.json(table, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e, '資料集取得失敗');
  }
}
