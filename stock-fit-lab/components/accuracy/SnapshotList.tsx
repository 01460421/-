'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SnapshotListResponse } from './types';
import { TRIGGER_TEXT, fmtNum, fmtPct, fmtPctRaw, fmtTimeShort, isNum, signalColor } from './format';

const PAGE = 25;

/** 快照列表（分頁、可篩選），連到單次預測詳情；快照唯讀 */
export default function SnapshotList({ symbol, model, names }: { symbol: string | null; model: string | null; names: Record<string, string> }) {
  const [page, setPage] = useState(0);
  const [trigger, setTrigger] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<SnapshotListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(0), [symbol, model, trigger, from, to]);

  const qs = new URLSearchParams();
  if (symbol) qs.set('symbol', symbol);
  if (model) qs.set('model', model);
  if (trigger) qs.set('trigger', trigger);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const base = qs.toString();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const q = new URLSearchParams(base);
    q.set('limit', String(PAGE));
    q.set('offset', String(page * PAGE));
    fetch(`/api/snapshots?${q}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? '讀取失敗');
        return j as SnapshotListResponse;
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
  }, [base, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col text-xs">
          <span className="muted">觸發來源</span>
          <select className="input" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
            <option value="">全部</option>
            {Object.entries(TRIGGER_TEXT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">寫入日起</span>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">寫入日迄</span>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <span className="text-xs muted">代號 / 模型沿用上方篩選</span>
        <span className="flex-1" />
        <a className="btn" href={`/api/snapshots?${base}${base ? '&' : ''}format=csv`}>
          匯出 CSV
        </a>
        <a className="btn" href={`/api/snapshots?${base}${base ? '&' : ''}limit=500`} target="_blank" rel="noreferrer">
          JSON
        </a>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="overflow-x-auto">
        <table className="table-std">
          <thead>
            <tr>
              <th>寫入時間（台北）</th>
              <th>代號</th>
              <th>模型</th>
              <th>觸發</th>
              <th>訓練迄日</th>
              <th>最後已知價</th>
              <th>最後期預測（區間）</th>
              <th>P(上漲)</th>
              <th>已回填</th>
              <th>MAPE</th>
              <th>方向判對</th>
              <th>覆蓋率</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={13} className="py-6 text-center muted">
                  載入中…
                </td>
              </tr>
            )}
            {data && !data.items.length && (
              <tr>
                <td colSpan={13} className="py-6 text-center muted">
                  沒有符合條件的快照
                </td>
              </tr>
            )}
            {data?.items.map((s) => {
              const sig = isNum(s.pUpLast) ? (s.pUpLast >= 0.65 ? 'up' : s.pUpLast <= 0.35 ? 'down' : 'neutral') : null;
              return (
                <tr key={s.id} style={{ opacity: loading ? 0.6 : 1 }}>
                  <td className="whitespace-nowrap">{fmtTimeShort(s.createdAt)}</td>
                  <td>{s.symbol}</td>
                  <td className="whitespace-nowrap">{names[s.modelId] ?? s.modelId}</td>
                  <td className="whitespace-nowrap">{TRIGGER_TEXT[s.trigger] ?? s.trigger}</td>
                  <td>{s.trainEnd}</td>
                  <td>{fmtNum(s.lastPrice)}</td>
                  <td className="whitespace-nowrap">
                    {s.hasAi ? (
                      <span className="muted">AI 文字建議</span>
                    ) : (
                      <>
                        {fmtNum(s.meanLast)} <span className="muted">[{fmtNum(s.lowerLast)}, {fmtNum(s.upperLast)}]</span> <span className="muted">@{s.lastTarget}</span>
                      </>
                    )}
                  </td>
                  <td style={{ color: signalColor(sig) }}>{fmtPct(s.pUpLast)}</td>
                  <td>
                    {s.filled}/{s.horizon}
                  </td>
                  <td>{fmtPctRaw(s.mape)}</td>
                  <td>{s.dirN ? `${s.dirHits}/${s.dirN}` : '—'}</td>
                  <td>{fmtPct(s.coverage)}</td>
                  <td>
                    <Link href={`/snapshot/${s.id}`} className="whitespace-nowrap underline">
                      詳情
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          上一頁
        </button>
        <span className="muted">
          第 {page + 1} / {pages} 頁（共 {data?.total ?? 0} 筆{data?.truncated ? '，已達掃描上限' : ''}）
        </span>
        <button className="btn" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
          下一頁
        </button>
      </div>
    </div>
  );
}
