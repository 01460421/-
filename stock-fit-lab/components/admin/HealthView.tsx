/** 系統健康畫面（伺服器元件；/health 與 /admin 共用） */
import Link from 'next/link';
import type { HealthData } from '@/app/api/health/_data';
import { SEVERITY_COLOR, fmtPct, fmtTime, fmtTimeShort } from '@/components/accuracy/format';

const STATUS: Record<string, { text: string; color: string }> = {
  ok: { text: '正常', color: '#2563eb' },
  late: { text: '延遲', color: '#d97706' },
  missed: { text: '未執行', color: '#dc2626' },
  error: { text: '執行失敗', color: '#dc2626' },
  never: { text: '尚無紀錄', color: '#6b7280' },
};

const OVERALL: Record<HealthData['overall'], { text: string; color: string }> = {
  ok: { text: '系統正常', color: '#2563eb' },
  warn: { text: '有需要注意的項目', color: '#d97706' },
  critical: { text: '有嚴重異常', color: '#dc2626' },
};

function Bar({ value, max }: { value: number; max: number }) {
  const r = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="h-2 w-full rounded" style={{ background: 'var(--border)' }}>
      <div className="h-2 rounded" style={{ width: `${r * 100}%`, background: r >= 0.8 ? '#dc2626' : r >= 0.5 ? '#d97706' : '#2563eb' }} />
    </div>
  );
}

export default function HealthView({ data, compact = false }: { data: HealthData; compact?: boolean }) {
  const ov = OVERALL[data.overall];
  const groups = [...new Set(data.env.map((e) => e.group))];
  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-3" style={{ borderLeft: `4px solid ${ov.color}` }}>
        <span className="text-lg font-semibold" style={{ color: ov.color }}>
          {ov.text}
        </span>
        <span className="text-xs muted">產生於 {fmtTime(data.generatedAt)}</span>
        <span className="flex-1" />
        <a className="btn" href={compact ? '/admin' : '/health'}>
          重新整理
        </a>
        <a className="btn" href="/api/health" target="_blank" rel="noreferrer">
          JSON
        </a>
      </div>

      {data.storage.warning && (
        <div className="panel text-sm" style={{ borderColor: data.storage.onVercel ? '#dc2626' : 'var(--border)', color: data.storage.onVercel ? '#dc2626' : undefined }}>
          {data.storage.onVercel ? '⚠ ' : 'ℹ '}
          {data.storage.warning}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel">
          <h2 className="h2 mb-2">儲存</h2>
          <p className="text-sm">
            類型：<b>{data.storage.kind === 'postgres' ? 'PostgreSQL' : '記憶體'}</b>
            {data.storage.kind === 'memory' && <span className="muted">{data.storage.onVercel ? '（Vercel 上不會持久保存）' : '（本機同步 .data/store.json）'}</span>}
          </p>
          <p className="text-sm">執行環境：{data.storage.onVercel ? 'Vercel' : '本機 / 自架'}</p>
        </section>
        <section className="panel">
          <h2 className="h2 mb-2">LLM 配額（今日）</h2>
          {!data.llm.configured && <p className="mb-1 text-xs" style={{ color: '#d97706' }}>未設定 LLM 金鑰：AI 分析助理停用</p>}
          <div className="space-y-2 text-sm">
            <div>
              <div className="flex justify-between">
                <span>呼叫次數</span>
                <span className="tabular-nums">
                  {data.llm.usage.requests} / {data.llm.limits.maxRequests}
                </span>
              </div>
              <Bar value={data.llm.usage.requests} max={data.llm.limits.maxRequests} />
            </div>
            <div>
              <div className="flex justify-between">
                <span>估計費用</span>
                <span className="tabular-nums">
                  US${data.llm.usage.costUsd.toFixed(3)} / US${data.llm.limits.maxCostUsd}
                </span>
              </div>
              <Bar value={data.llm.usage.costUsd} max={data.llm.limits.maxCostUsd} />
            </div>
          </div>
          <p className="mt-2 text-xs muted">{data.llm.note}</p>
        </section>
        <section className="panel">
          <h2 className="h2 mb-2">錯誤摘要</h2>
          <ul className="space-y-1 text-sm">
            <li>
              排程錯誤（24 小時）：<b style={{ color: data.jobErrors24h ? '#d97706' : undefined }}>{data.jobErrors24h}</b>
            </li>
            <li>
              資料源錯誤（24 小時 / 7 天）：
              <b style={{ color: data.dataSourceErrors.last24h ? '#d97706' : undefined }}>
                {data.dataSourceErrors.last24h} / {data.dataSourceErrors.last7d}
              </b>
            </li>
            <li>
              連續失敗通知（24 小時）：<b style={{ color: data.dataSourceErrors.consecutiveCritical ? '#dc2626' : undefined }}>{data.dataSourceErrors.consecutiveCritical}</b>
            </li>
          </ul>
          <Link className="mt-2 inline-block text-xs underline" href="/events?kind=data_source_error">
            查看資料源錯誤事件 →
          </Link>
        </section>
      </div>

      <section className="panel">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <h2 className="h2">排程延遲</h2>
          <span className="text-xs muted">排定時間依 vercel.json 的 cron（UTC）推算；延遲 = 實際啟動時間 − 最近一次排定時間（資料：job_run / job_error 事件）</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table-std">
            <thead>
              <tr>
                <th>排程</th>
                <th>cron（UTC）</th>
                <th>最近排定</th>
                <th>最近執行</th>
                <th>耗時</th>
                <th>延遲</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {data.schedules.map((s) => {
                const st = STATUS[s.status];
                return (
                  <tr key={s.id}>
                    <td>
                      <div>{s.label}</div>
                      <div className="text-xs muted">{s.path}</div>
                    </td>
                    <td>
                      <code className="text-xs">{s.cron}</code>
                    </td>
                    <td className="whitespace-nowrap">{fmtTimeShort(s.expectedLast)}</td>
                    <td className="whitespace-nowrap">
                      {s.lastRun ? (
                        <>
                          {fmtTimeShort(s.lastRun.startedAt)}
                          <div className="text-xs muted">
                            {s.lastRun.skipped ? `略過：${s.lastRun.skipped}` : `成功 ${s.lastRun.ok}、失敗 ${s.lastRun.failed}`}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{s.lastRun?.durationMs != null ? `${(s.lastRun.durationMs / 1000).toFixed(1)} 秒` : '—'}</td>
                    <td>{s.delayMinutes != null ? `${s.delayMinutes.toFixed(1)} 分` : '—'}</td>
                    <td>
                      <span className="chip" style={{ color: st.color, borderColor: st.color }}>
                        {st.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <h2 className="h2">資料源</h2>
          <span className="text-xs muted">{data.adapterNote}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table-std">
            <thead>
              <tr>
                <th>資料源</th>
                <th>呼叫</th>
                <th>失敗</th>
                <th>失敗率</th>
                <th>連續失敗</th>
                <th>配額用量</th>
                <th>最後成功</th>
                <th>最近錯誤</th>
              </tr>
            </thead>
            <tbody>
              {data.adapters.map((a) => (
                <tr key={a.adapterId} style={{ background: a.alert ? 'rgba(220,38,38,0.08)' : undefined }}>
                  <td className="font-medium">{a.adapterId}</td>
                  <td>{a.calls}</td>
                  <td>{a.failures}</td>
                  <td>{fmtPct(a.failureRate)}</td>
                  <td style={{ color: a.consecutiveFailures >= 2 ? '#dc2626' : undefined }}>
                    {a.consecutiveFailures}
                    {a.alert && ' ⚠'}
                  </td>
                  <td>{a.quotaUsed != null ? `${a.quotaUsed}${a.quotaLimit ? ` / ${a.quotaLimit}` : ''}` : '—'}</td>
                  <td className="whitespace-nowrap">{fmtTimeShort(a.lastSuccessAt)}</td>
                  <td className="max-w-[280px] truncate" title={a.lastError}>
                    {a.lastError ?? '—'}
                  </td>
                </tr>
              ))}
              {!data.adapters.length && (
                <tr>
                  <td colSpan={8} className="muted">
                    尚無資料源統計
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data.dataSourceErrors.recent.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1 text-sm font-medium">最近資料源錯誤事件</h3>
            <ul className="space-y-1 text-sm">
              {data.dataSourceErrors.recent.map((e, i) => (
                <li key={i}>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[e.severity] }} />
                  <span className="text-xs muted">{fmtTimeShort(e.at)}</span> {e.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {!compact && (
        <section className="panel">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="h2">環境設定檢查</h2>
            <span className="text-xs muted">只顯示是否已設定，不顯示任何值；未設定的選填項目會自動降級</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => (
              <div key={g}>
                <h3 className="mb-1 text-sm font-medium">{g}</h3>
                <ul className="space-y-1 text-sm">
                  {data.env
                    .filter((e) => e.group === g)
                    .map((e) => (
                      <li key={e.key} className="flex gap-2">
                        <span style={{ color: e.configured ? '#2563eb' : '#9ca3af' }}>{e.configured ? '✔' : '○'}</span>
                        <span>
                          {e.label}
                          {!e.configured && e.note && <span className="block text-xs muted">{e.note}</span>}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
