'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SystemEvent } from '@/lib/types';
import { EVENT_KIND_TEXT, SEVERITY_COLOR, SEVERITY_TEXT, fmtTime, fmtTimeShort } from '@/components/accuracy/format';

interface Resp {
  generatedAt: string;
  storeKind: string;
  total: number;
  limit: number;
  counts: Record<string, number>;
  events: SystemEvent[];
}

export interface EventFilters {
  kind: string;
  symbol: string;
  severity: string;
  from: string;
  to: string;
  q: string;
  limit: string;
}

/** 事件日誌：可查詢的稽核軌跡（排程、偵測、AI 建議、通知、結構性變化、權重、洩漏旗標、資料源錯誤） */
export default function EventsClient({ initial }: { initial: EventFilters }) {
  const [f, setF] = useState<EventFilters>(initial);
  const [draft, setDraft] = useState({ symbol: initial.symbol, q: initial.q });
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
    return q.toString();
  }, [f]);

  useEffect(() => {
    try {
      window.history.replaceState(null, '', `/events${qs ? `?${qs}` : ''}`);
    } catch {
      /* 忽略 */
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/events?${qs}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? '讀取失敗');
        return j as Resp;
      })
      .then((j) => {
        if (alive) {
          setData(j);
          setError(null);
        }
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [qs]);

  const set = (k: keyof EventFilters, v: string) => setF((s) => ({ ...s, [k]: v }));
  const applyDraft = () => setF((s) => ({ ...s, symbol: draft.symbol.trim().toUpperCase(), q: draft.q.trim() }));
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="panel flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col text-xs">
          <span className="muted">類型</span>
          <select className="input" value={f.kind} onChange={(e) => set('kind', e.target.value)}>
            <option value="">全部類型</option>
            {Object.entries(EVENT_KIND_TEXT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">嚴重度</span>
          <select className="input" value={f.severity} onChange={(e) => set('severity', e.target.value)}>
            <option value="">全部</option>
            <option value="info">資訊</option>
            <option value="warn">警告</option>
            <option value="critical">嚴重</option>
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">代號</span>
          <input className="input w-28" placeholder="全部" value={draft.symbol} onChange={(e) => setDraft((d) => ({ ...d, symbol: e.target.value }))} onBlur={applyDraft} onKeyDown={(e) => e.key === 'Enter' && applyDraft()} />
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">起日</span>
          <input type="date" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">迄日</span>
          <input type="date" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} />
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">關鍵字</span>
          <input className="input w-40" placeholder="標題或內容" value={draft.q} onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))} onBlur={applyDraft} onKeyDown={(e) => e.key === 'Enter' && applyDraft()} />
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">筆數上限</span>
          <select className="input" value={f.limit || '300'} onChange={(e) => set('limit', e.target.value)}>
            {['100', '300', '1000', '5000'].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <span className="flex-1" />
        {loading && <span className="text-xs muted">載入中…</span>}
        <a className="btn" href={`/api/events?${qs}${qs ? '&' : ''}format=csv`}>
          匯出 CSV
        </a>
        <a className="btn" href={`/api/events?${qs}`} target="_blank" rel="noreferrer">
          JSON
        </a>
      </div>

      {data && (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(data.counts).map(([k, n]) => (
            <button key={k} className="chip hover:underline" onClick={() => set('kind', f.kind === k ? '' : k)}>
              {EVENT_KIND_TEXT[k] ?? k}：{n}
            </button>
          ))}
          <span className="muted">
            共 {data.total} 筆{data.total >= data.limit ? `（已達上限 ${data.limit}，請縮小條件）` : ''} · 資料：事件表（{data.storeKind === 'postgres' ? 'PostgreSQL' : '記憶體'}）· 查詢於 {fmtTime(data.generatedAt)}
          </span>
        </div>
      )}
      {error && <p className="text-sm text-red-500">⚠ {error}</p>}

      <div className="panel overflow-x-auto">
        <table className="table-std">
          <thead>
            <tr>
              <th>時間（台北）</th>
              <th>嚴重度</th>
              <th>類型</th>
              <th>代號</th>
              <th>標題</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!data && loading && (
              <tr>
                <td colSpan={6} className="py-6 text-center muted">
                  載入中…
                </td>
              </tr>
            )}
            {data && !data.events.length && (
              <tr>
                <td colSpan={6} className="py-6 text-center muted">
                  沒有符合條件的事件。排程執行、偵測觸發、AI 建議與通知發送都會寫入事件表。
                </td>
              </tr>
            )}
            {data?.events.map((e) => (
              <Fragment key={e.id}>
                <tr style={{ borderLeft: `3px solid ${SEVERITY_COLOR[e.severity]}`, opacity: loading ? 0.6 : 1 }}>
                  <td className="whitespace-nowrap">{fmtTimeShort(e.at)}</td>
                  <td>
                    <span className="chip" style={{ color: SEVERITY_COLOR[e.severity], borderColor: SEVERITY_COLOR[e.severity] }}>
                      {SEVERITY_TEXT[e.severity] ?? e.severity}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">{EVENT_KIND_TEXT[e.kind] ?? e.kind}</td>
                  <td className="whitespace-nowrap">
                    {e.symbol ? (
                      <Link className="hover:underline" href={`/stock/${encodeURIComponent(e.symbol)}`}>
                        {e.symbol}
                      </Link>
                    ) : (
                      <span className="muted">系統</span>
                    )}
                  </td>
                  <td>{e.title}</td>
                  <td>
                    <button className="btn !py-0 text-xs" onClick={() => toggle(e.id)} aria-expanded={open.has(e.id)}>
                      {open.has(e.id) ? '收合' : '詳細 JSON'}
                    </button>
                  </td>
                </tr>
                {open.has(e.id) && (
                  <tr>
                    <td colSpan={6}>
                      <pre className="max-h-80 overflow-auto rounded p-2 text-xs" style={{ background: 'var(--bg)' }}>
                        {JSON.stringify({ id: e.id, at: e.at, kind: e.kind, severity: e.severity, symbol: e.symbol, detail: e.detail }, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
