import type { Metadata } from 'next';
import EventsClient, { type EventFilters } from '@/components/admin/EventsClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '事件日誌' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const KINDS = ['job_run', 'job_error', 'detector', 'ai_advice', 'notification', 'structural_break', 'weight_shift', 'leak_suspect', 'data_source_error'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function EventsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const kind = one(searchParams.kind);
  const severity = one(searchParams.severity);
  const initial: EventFilters = {
    kind: KINDS.includes(kind) ? kind : '',
    symbol: one(searchParams.symbol).slice(0, 20).toUpperCase(),
    severity: ['info', 'warn', 'critical'].includes(severity) ? severity : '',
    from: DATE.test(one(searchParams.from)) ? one(searchParams.from) : '',
    to: DATE.test(one(searchParams.to)) ? one(searchParams.to) : '',
    q: one(searchParams.q).slice(0, 80),
    limit: ['100', '300', '1000', '5000'].includes(one(searchParams.limit)) ? one(searchParams.limit) : '',
  };
  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold">事件日誌</h1>
        <p className="text-sm muted">完整稽核軌跡：所有排程執行、偵測器觸發、AI 建議、通知發送、結構性變化、集成權重重分配、疑似資料洩漏旗標與資料源錯誤都寫入可查詢的事件表。點「詳細 JSON」可展開原始內容。</p>
      </header>
      <EventsClient initial={initial} />
    </div>
  );
}
