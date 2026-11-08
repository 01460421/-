'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ScoreRowJ } from './types';
import { BETTER_COLOR, WORSE_COLOR, fmtNum, fmtPct, fmtPctRaw, fmtSigned, isNum, verdictColor, VERDICT_TEXT } from './format';

const LEAK_TEXT = '疑似資料洩漏，稽核中';

type SortKey = 'default' | 'symbol' | 'modelId' | 'horizon' | 'n' | 'directionAccuracy' | 'actHitRate' | 'actRatio' | 'longestCorrectStreak' | 'longestWrongStreak' | 'mae' | 'rmse' | 'mape' | 'coverage' | 'theilU' | 'rmseRel';

const COLS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'symbol', label: '代號' },
  { key: 'modelId', label: '模型' },
  { key: 'horizon', label: '期數' },
  { key: 'n', label: '樣本' },
  { key: 'directionAccuracy', label: '方向準確率', title: '方向判對比例；粗體 = 二項檢定 p < 0.05（顯著高於 50%）' },
  { key: 'actHitRate', label: '出手準確率', title: 'P(上漲) ≥ 看漲門檻或 ≤ 看跌門檻時的準確率' },
  { key: 'actRatio', label: '出手比例' },
  { key: 'longestCorrectStreak', label: '最長連對' },
  { key: 'longestWrongStreak', label: '最長連錯' },
  { key: 'mae', label: 'MAE' },
  { key: 'rmse', label: 'RMSE' },
  { key: 'mape', label: 'MAPE' },
  { key: 'coverage', label: '區間覆蓋率', title: '實際值落在信賴區間內的比例；名目 90% 時目標 88%–92%' },
  { key: 'theilU', label: "Theil's U", title: 'U < 1 代表優於 naive' },
  { key: 'rmseRel', label: 'vs Naive（RMSE）', title: '模型 − naive 的差值與相對改善 %（正值 = 優於 naive）；以相對改善 ≥ 5% 判定優劣' },
];

function sortVal(r: ScoreRowJ, k: SortKey): number | string {
  if (k === 'symbol' || k === 'modelId') return r[k];
  if (k === 'rmseRel') return r.vsNaive?.metrics.rmse?.relImprovementPct ?? -Infinity;
  if (k === 'default') return 0;
  const v = r[k];
  return isNum(v as number | null) ? (v as number) : -Infinity;
}

export default function Scorecard({ rows, names, thresholds }: { rows: ScoreRowJ[]; names: Record<string, string>; thresholds: { up: number; down: number } }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'default', dir: -1 });
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => {
    if (sort.key === 'default') return rows;
    const out = [...rows].sort((a, b) => {
      // 隱藏列（疑似洩漏）一律置後
      if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
      const va = sortVal(a, sort.key);
      const vb = sortVal(b, sort.key);
      return (typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)) * sort.dir;
    });
    return out;
  }, [rows, sort]);
  const visible = showAll ? sorted : sorted.slice(0, 40);

  const head = (c: (typeof COLS)[number]) => (
    <th key={c.key} title={c.title} className="cursor-pointer select-none whitespace-nowrap" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === 'symbol' || c.key === 'modelId' ? 1 : -1 }))}>
      {c.label}
      {sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  if (!rows.length) return <p className="muted py-6 text-center text-sm">此條件下沒有已回填實際值的快照。排程每日收盤後寫入快照並回填，累積數日後即可看到計分卡。</p>;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs muted">
        <span>預設排序：方向準確率 → 出手準確率 → 最長連續判對（點欄位標題可改排序）</span>
        <span className="chip">出手門檻 P ≥ {thresholds.up} 看漲 / ≤ {thresholds.down} 看跌</span>
        <span className="chip" style={{ color: BETTER_COLOR }}>■ 優於 naive</span>
        <span className="chip" style={{ color: WORSE_COLOR }}>■ 劣於 naive</span>
        {sort.key !== 'default' && (
          <button className="btn !py-0 text-xs" onClick={() => setSort({ key: 'default', dir: -1 })}>
            還原預設排序
          </button>
        )}
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="table-std">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--panel)' }}>
            <tr>{COLS.map(head)}</tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const rm = r.vsNaive?.metrics.rmse;
              const covOk = isNum(r.coverage) && Math.abs(r.coverage - 0.9) <= 0.02;
              return (
                <tr key={`${r.symbol}|${r.modelId}|${r.horizon}`}>
                  <td className="whitespace-nowrap">
                    <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="hover:underline">
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap" title={r.modelId}>
                    {names[r.modelId] ?? r.modelId}
                  </td>
                  <td>{r.horizon} 日</td>
                  <td>{r.n}</td>
                  {r.hidden ? (
                    <td colSpan={11} className="text-center font-medium" style={{ color: WORSE_COLOR }} title={r.hiddenReason}>
                      ⚠ {LEAK_TEXT}
                    </td>
                  ) : (
                    <>
                      <td className={isNum(r.dirPValue) && r.dirPValue < 0.05 ? 'font-semibold' : ''} title={`n=${r.dirN}，p=${fmtNum(r.dirPValue, 4)}`}>
                        {fmtPct(r.directionAccuracy)}
                      </td>
                      <td title={`出手 ${r.actN} 次`}>{fmtPct(r.actHitRate)}</td>
                      <td>{fmtPct(r.actRatio)}</td>
                      <td>{r.longestCorrectStreak}</td>
                      <td>{r.longestWrongStreak}</td>
                      <td>{fmtNum(r.mae)}</td>
                      <td>{fmtNum(r.rmse)}</td>
                      <td>{fmtPctRaw(r.mape)}</td>
                      <td style={{ color: isNum(r.coverage) ? (covOk ? BETTER_COLOR : WORSE_COLOR) : undefined }}>{fmtPct(r.coverage)}</td>
                      <td style={{ color: isNum(r.theilU) ? (r.theilU < 1 ? BETTER_COLOR : WORSE_COLOR) : undefined }}>{fmtNum(r.theilU, 3)}</td>
                      <td className="whitespace-nowrap" style={{ color: verdictColor(rm?.verdict) }} title={rm ? `模型 ${fmtNum(rm.model)} vs naive ${fmtNum(rm.benchmark)}（${VERDICT_TEXT[rm.verdict] ?? rm.verdict}）` : ''}>
                        {rm ? `${fmtSigned(rm.diff)}（${fmtSigned(rm.relImprovementPct, 1, '%')}）` : '—'}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > 40 && (
        <button className="btn mt-2 text-xs" onClick={() => setShowAll((v) => !v)}>
          {showAll ? '只顯示前 40 列' : `顯示全部 ${sorted.length} 列`}
        </button>
      )}
    </div>
  );
}
