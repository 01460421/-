/**
 * GET /api/events?kind=&symbol=&severity=&from=&to=&q=&limit=&format=json|csv
 * 事件日誌（稽核軌跡）：排程執行、偵測觸發、AI 建議、通知、結構性變化、權重重分配、洩漏旗標、資料源錯誤。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { EventKind } from '@/lib/types';
import { getStore } from '@/lib/storage';
import { toCsv } from '@/lib/engine/accuracy';
import { jsonError, parseParams, zDate, zSymbol } from '../accuracy/_lib';

export const dynamic = 'force-dynamic';

const EVENT_KINDS: EventKind[] = ['job_run', 'job_error', 'detector', 'ai_advice', 'notification', 'structural_break', 'weight_shift', 'leak_suspect', 'data_source_error'];

const schema = z.object({
  kind: z.enum(EVENT_KINDS as [EventKind, ...EventKind[]], { errorMap: () => ({ message: `事件類型只支援 ${EVENT_KINDS.join('、')}` }) }).optional(),
  symbol: zSymbol.optional(),
  severity: z.enum(['info', 'warn', 'critical'], { errorMap: () => ({ message: '嚴重度只支援 info、warn、critical' }) }).optional(),
  from: zDate.optional(),
  to: zDate.optional(),
  q: z.string().max(80, '關鍵字過長').optional(),
  limit: z.coerce.number().int('limit 須為整數').min(1, 'limit 至少 1').max(5000, 'limit 最多 5000').optional(),
  format: z.enum(['json', 'csv'], { errorMap: () => ({ message: 'format 只支援 json、csv' }) }).optional(),
});

export async function GET(req: Request) {
  const p = parseParams(req.url, schema);
  if (!p.ok) return p.res;
  const q = p.data;
  if (q.from && q.to && q.from > q.to) return jsonError('起日不可晚於迄日');
  const limit = q.limit ?? 300;
  try {
    const store = await getStore();
    const needsFilter = !!(q.severity || q.q);
    let events = await store.listEvents({
      kind: q.kind,
      symbol: q.symbol,
      from: q.from,
      to: q.to ? `${q.to}T23:59:59.999Z` : undefined,
      limit: needsFilter ? Math.max(limit * 10, 2000) : limit,
    });
    if (q.severity) events = events.filter((e) => e.severity === q.severity);
    if (q.q) {
      const kw = q.q.toLowerCase();
      events = events.filter((e) => e.title.toLowerCase().includes(kw) || JSON.stringify(e.detail).toLowerCase().includes(kw));
    }
    events = events.slice(0, limit);
    if (q.format === 'csv') {
      const csv = toCsv(
        events,
        [
          { key: 'at', label: '時間(UTC)' },
          { key: 'kind', label: '類型' },
          { key: 'severity', label: '嚴重度' },
          { key: 'symbol', label: '代號' },
          { key: 'title', label: '標題' },
          { key: 'detail', label: '詳細(JSON)', format: (e) => JSON.stringify(e.detail) },
          { key: 'id', label: '事件ID' },
        ],
        { bom: true },
      );
      return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="events-${new Date().toISOString().slice(0, 10)}.csv"` } });
    }
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    return NextResponse.json({ generatedAt: new Date().toISOString(), storeKind: store.kind, total: events.length, limit, counts, events });
  } catch (e) {
    return jsonError(`讀取事件日誌失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
