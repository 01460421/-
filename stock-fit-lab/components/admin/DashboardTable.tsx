'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { DashboardRow } from '@/app/api/dashboard/_data';
import { DOWN_COLOR, SEVERITY_COLOR, SIGNAL_TEXT, UP_COLOR, WORSE_COLOR, fmtNum, fmtPct, fmtSigned, fmtTimeShort, isNum, signalColor } from '@/components/accuracy/format';

type Key = 'symbol' | 'signal' | 'pUp' | 'change' | 'acc' | 'event' | 'fresh';

const COLS: { key: Key; label: string; title?: string }[] = [
  { key: 'symbol', label: '代號' },
  { key: 'signal', label: '最新預測方向', title: '最新集成快照最後一期的 P(上漲)，以 0.65 / 0.35 門檻判斷看漲 / 看跌 / 觀望' },
  { key: 'pUp', label: 'P(上漲)' },
  { key: 'change', label: '預測變動', title: '最後一期預測均值相對發出時收盤價' },
  { key: 'acc', label: '近 20 筆準度', title: '集成模型最近 20 個已回填的 1 日期方向準確率（依目標日）' },
  { key: 'event', label: '最近偵測事件' },
  { key: 'fresh', label: '資料新鮮度', title: '最新快照的訓練迄日與「應已有收盤資料」的交易日相差幾個交易日' },
];

const sigRank = { up: 3, neutral: 2, down: 1 } as const;

function val(r: DashboardRow, k: Key): number | string {
  switch (k) {
    case 'symbol':
      return r.symbol;
    case 'signal':
      return r.latest?.signal ? sigRank[r.latest.signal] : -1;
    case 'pUp':
      return r.latest?.pUp ?? -1;
    case 'change':
      return r.latest?.expectedChangePct ?? -Infinity;
    case 'acc':
      return r.acc20.accuracy ?? -1;
    case 'event':
      return r.latestEvent?.at ?? '';
    case 'fresh':
      return r.freshness.lagTradingDays === null ? 9999 : r.freshness.lagTradingDays;
  }
}

const FRESH: Record<string, { text: string; color?: string }> = {
  fresh: { text: '最新', color: '#2563eb' },
  lag: { text: '落後', color: '#d97706' },
  stale: { text: '過期', color: '#dc2626' },
  none: { text: '無快照' },
};

export default function DashboardTable({ rows }: { rows: DashboardRow[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'symbol', dir: 1 });
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const va = val(a, sort.key);
        const vb = val(b, sort.key);
        return (typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)) * sort.dir;
      }),
    [rows, sort],
  );
  return (
    <div className="overflow-x-auto">
      <table className="table-std">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c.key} title={c.title} className="cursor-pointer select-none whitespace-nowrap" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === 'symbol' || c.key === 'fresh' ? 1 : -1 }))}>
                {c.label}
                {sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const f = FRESH[r.freshness.status];
            return (
              <tr key={r.symbol}>
                <td className="whitespace-nowrap">
                  <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="font-medium hover:underline">
                    {r.symbol}
                  </Link>
                  {r.name && <span className="ml-1 text-xs muted">{r.name}</span>}
                </td>
                <td className="whitespace-nowrap">
                  {r.latest?.signal ? (
                    <span className="font-medium" style={{ color: signalColor(r.latest.signal) }}>
                      {SIGNAL_TEXT[r.latest.signal]}
                      <span className="ml-1 text-xs muted">（{r.latest.horizon} 日）</span>
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{fmtPct(r.latest?.pUp)}</td>
                <td style={{ color: isNum(r.latest?.expectedChangePct) ? (r.latest!.expectedChangePct! > 0 ? UP_COLOR : r.latest!.expectedChangePct! < 0 ? DOWN_COLOR : undefined) : undefined }}>
                  {fmtSigned(r.latest?.expectedChangePct, 2, '%')}
                  {r.latest && <span className="ml-1 text-xs muted">→ {fmtNum(r.latest.meanLast)}</span>}
                </td>
                <td title={`${r.acc20.hits}/${r.acc20.n}`} style={{ color: isNum(r.acc20.accuracy) && r.acc20.n >= 10 && r.acc20.accuracy < 0.5 ? WORSE_COLOR : undefined }}>
                  {fmtPct(r.acc20.accuracy)}
                  {r.acc20.n > 0 && <span className="ml-1 text-xs muted">({r.acc20.n})</span>}
                </td>
                <td className="max-w-[320px]">
                  {r.latestEvent ? (
                    <span title={r.latestEvent.title}>
                      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[r.latestEvent.severity] }} />
                      <span className="text-xs muted">{fmtTimeShort(r.latestEvent.at)}</span>
                      <span className="ml-1 block truncate">{r.latestEvent.title}</span>
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  <span style={{ color: f.color }}>{f.text}</span>
                  <span className="ml-1 text-xs muted">
                    {r.freshness.trainEnd ? `迄 ${r.freshness.trainEnd}` : ''}
                    {r.freshness.lagTradingDays ? `（落後 ${r.freshness.lagTradingDays} 交易日）` : ''}
                  </span>
                </td>
                <td className="whitespace-nowrap text-xs">
                  <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="underline">
                    分析
                  </Link>{' '}
                  <Link href={`/accuracy?symbol=${encodeURIComponent(r.symbol)}`} className="underline">
                    準度
                  </Link>
                  {r.latest && (
                    <>
                      {' '}
                      <Link href={`/snapshot/${r.latest.snapshotId}`} className="underline">
                        快照
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
