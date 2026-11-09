import type { Metadata } from 'next';
import Link from 'next/link';
import { getHealthData } from '@/app/api/health/_data';
import { getStore } from '@/lib/storage';
import HealthView from '@/components/admin/HealthView';
import { EVENT_KIND_TEXT, SEVERITY_COLOR, fmtTimeShort } from '@/components/accuracy/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '管理者總覽' };

/** 管理者總覽：通知訊息中的「/admin」連結落點 —— 健康摘要 + 最近通知與嚴重事件 */
export default async function AdminPage() {
  const [data, store] = await Promise.all([getHealthData(), getStore()]);
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [notes, criticals] = await Promise.all([store.listEvents({ kind: 'notification', from: since, limit: 15 }), store.listEvents({ from: since, limit: 500 })]);
  const crit = criticals.filter((e) => e.severity === 'critical').slice(0, 15);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold">管理者總覽</h1>
          <p className="text-sm muted">排程與資料源異常通知的落點。詳細資訊請見 <Link className="underline" href="/health">系統健康</Link>、<Link className="underline" href="/events">事件日誌</Link> 與 <Link className="underline" href="/dashboard">追蹤儀表板</Link>。</p>
        </div>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="h2">最近 7 天嚴重事件</h2>
            <Link className="ml-auto text-xs underline" href="/events?severity=critical">
              全部 →
            </Link>
          </div>
          {crit.length ? (
            <ul className="space-y-1 text-sm">
              {crit.map((e) => (
                <li key={e.id}>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[e.severity] }} />
                  <span className="text-xs muted">{fmtTimeShort(e.at)} · {EVENT_KIND_TEXT[e.kind] ?? e.kind}</span> {e.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted text-sm">最近 7 天沒有嚴重事件。</p>
          )}
        </section>
        <section className="panel">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="h2">最近通知發送</h2>
            <Link className="ml-auto text-xs underline" href="/events?kind=notification">
              全部 →
            </Link>
          </div>
          {notes.length ? (
            <ul className="space-y-1 text-sm">
              {notes.map((e) => {
                const results = ((e.detail as { results?: { channel: string; ok: boolean }[] }).results ?? []).map((r) => `${r.channel}${r.ok ? '✔' : '✘'}`).join(' ');
                return (
                  <li key={e.id}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[e.severity] }} />
                    <span className="text-xs muted">{fmtTimeShort(e.at)}</span> {e.title} {results && <span className="text-xs muted">（{results}）</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted text-sm">最近 7 天沒有通知發送紀錄。</p>
          )}
        </section>
      </div>
      <HealthView data={data} compact />
    </div>
  );
}
