'use client';
/**
 * 詳細資料分頁（規格第十節）：籌碼、基本面、衍生性、新聞、市場環境。
 * 每一層標示來源 / 資料時間 / 延遲，提供原始數值表、CSV 下載與「疊加到圖上」。
 */
import { useEffect, useState } from 'react';
import type { DataTable, DatasetId } from '@/lib/data-adapters/types';
import type { Market } from '@/lib/types';
import type { Subplot } from './types';
import { DATASET_LABEL, datasetsFor, dateKey, loadDataset, numericColumns, tableToSubplot } from './datasets';
import { fmtNum, fmtTime } from './util';

const MAX_ROWS = 250;

export default function DataTabs({ symbol, market, onAddSubplot, activeSubplots }: { symbol: string; market: Market; onAddSubplot: (s: Subplot) => void; activeSubplots: string[] }) {
  const list = datasetsFor(market);
  const [tab, setTab] = useState<DatasetId>(list[0]);
  const [table, setTable] = useState<DataTable | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setTab(datasetsFor(market)[0]);
  }, [market, symbol]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    loadDataset(symbol, tab)
      .then((t) => alive && setTable(t))
      .catch((e: Error) => alive && (setErr(e.message), setTable(null)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [symbol, tab]);

  const dk = table ? dateKey(table) : null;
  const rows = table ? (dk ? [...table.rows].sort((a, b) => String(b[dk] ?? '').localeCompare(String(a[dk] ?? ''))) : table.rows).slice(0, MAX_ROWS) : [];
  const nums = table ? numericColumns(table) : [];

  return (
    <section className="panel space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="h2">詳細資料</h2>
        <div className="flex flex-wrap gap-1" role="tablist">
          {list.map((d) => (
            <button key={d} role="tab" aria-selected={tab === d} className={`btn text-xs ${tab === d ? 'ring-2 ring-blue-500/50' : ''}`} onClick={() => setTab(d)}>
              {DATASET_LABEL[d]}
            </button>
          ))}
        </div>
      </div>
      {loading && <div className="h-32 animate-pulse rounded bg-gray-500/10" />}
      {err && <p className="text-sm text-red-500">{err}</p>}
      {table && !loading && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <b>{table.title}</b>
            <span className="muted">
              來源 {table.source} · 資料時間 {fmtTime(table.asOf)} · {table.delayMinutes ? `延遲 ${table.delayMinutes} 分鐘` : '收盤 / 公告資料'} · 共 {table.rows.length} 列
            </span>
            {!table.unavailableReason && table.rows.length > 0 && (
              <a className="btn ml-auto text-xs" href={`/api/dataset?symbol=${encodeURIComponent(symbol)}&dataset=${tab}&format=csv`} download>
                下載 CSV
              </a>
            )}
          </div>
          {table.unavailableReason && <p className="rounded border border-amber-400/60 bg-amber-500/10 p-2 text-xs">{table.unavailableReason}</p>}
          {dk && nums.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="muted">疊加到圖上：</span>
              {nums.map((c) => {
                const id = `${table.dataset}.${c.key}`;
                const on = activeSubplots.includes(id);
                return (
                  <button
                    key={c.key}
                    className={`chip hover:underline ${on ? 'border-blue-500 text-blue-600' : ''}`}
                    disabled={on}
                    onClick={() => {
                      const s = tableToSubplot(table, c.key);
                      if (s) onAddSubplot(s);
                    }}
                  >
                    {on ? '✓ ' : '＋ '}
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}
          {rows.length > 0 && (
            <div className="max-h-80 overflow-auto">
              <table className="table-std text-xs">
                <thead className="sticky top-0" style={{ background: 'var(--panel)' }}>
                  <tr>
                    {table.columns.map((c) => (
                      <th key={c.key} className="whitespace-nowrap">
                        {c.label}
                        {c.unit ? <span className="muted">（{c.unit}）</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      {table.columns.map((c) => {
                        const v = r[c.key];
                        const isUrl = typeof v === 'string' && /^https?:\/\//.test(v);
                        return (
                          <td key={c.key} className={typeof v === 'number' ? 'text-right' : 'max-w-[360px] truncate'} title={typeof v === 'string' ? v : undefined}>
                            {isUrl ? (
                              <a href={v as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                連結 ↗
                              </a>
                            ) : typeof v === 'number' ? (
                              fmtNum(v, Number.isInteger(v) ? 0 : 2)
                            ) : (
                              (v ?? '—')
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {table.rows.length > MAX_ROWS && <p className="text-xs muted">僅顯示最近 {MAX_ROWS} 列，完整資料請下載 CSV。</p>}
            </div>
          )}
          {tab === 'news' && <p className="text-[11px] muted">只取新聞標題與連結，不複製全文。</p>}
        </div>
      )}
    </section>
  );
}
