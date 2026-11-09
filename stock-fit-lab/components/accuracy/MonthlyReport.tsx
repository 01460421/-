'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ReportJ } from './types';
import { BETTER_COLOR, WORSE_COLOR, fmtNum, fmtPct, fmtPctRaw, fmtTime } from './format';

function recentMonths(n = 13): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

/** 月度準度報告：模型排名、與 naive 比較、覆蓋率實測值；匯出 CSV（含 BOM）與 PDF（中文以 canvas 影像嵌入） */
export default function MonthlyReport({ symbol, names }: { symbol: string | null; names: Record<string, string> }) {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0]);
  const [data, setData] = useState<ReportJ | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const qs = new URLSearchParams({ month });
  if (symbol) qs.set('symbol', symbol);
  const q = qs.toString();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/report?${q}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? '讀取失敗');
        return j as ReportJ;
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
  }, [q]);

  const onPdf = async () => {
    if (!data) return;
    setPdfBusy(true);
    try {
      const { exportReportPdf } = await import('./pdf');
      await exportReportPdf(data, names);
    } catch (e) {
      setError(`PDF 產生失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const rankTop = (data?.ranking ?? []).slice().sort((a, b) => a.symbol.localeCompare(b.symbol) || (a.horizon ?? 0) - (b.horizon ?? 0));
  const empty = data && !data.rows.length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          <span className="muted">月份</span>
          <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <span className="text-xs muted">{symbol ? `代號：${symbol}` : '全部代號'}（沿用上方篩選）</span>
        <span className="flex-1" />
        <a className="btn" href={`/api/report?${q}&format=csv`}>
          匯出 CSV
        </a>
        <button className="btn" onClick={onPdf} disabled={!data || !!empty || pdfBusy}>
          {pdfBusy ? '產生中…' : '匯出 PDF'}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && !data && <p className="muted text-sm">載入中…</p>}
      {empty && <p className="muted py-4 text-center text-sm">{month} 沒有已回填的快照。</p>}
      {data && !empty && (
        <div className="space-y-4" style={{ opacity: loading ? 0.6 : 1 }}>
          <p className="text-xs muted">
            統計區間 {data.from} ～ {data.to.slice(0, 10)}（依快照寫入時間）；產生於 {fmtTime(data.generatedAt)}；{data.hiddenCount ? `${data.hiddenCount} 列疑似資料洩漏已排除；` : ''}資料來源：預測快照與排程回填值。
          </p>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-1 text-sm font-medium">模型排名（依方向準確率，前 3 名）</h3>
              <div className="max-h-80 overflow-auto">
                <table className="table-std">
                  <thead>
                    <tr>
                      <th>代號</th>
                      <th>期數</th>
                      <th>第 1 名</th>
                      <th>第 2 名</th>
                      <th>第 3 名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankTop.map((g) => (
                      <tr key={`${g.symbol}|${g.horizon}`}>
                        <td>{g.symbol}</td>
                        <td>{g.horizon} 日</td>
                        {[0, 1, 2].map((i) => {
                          const m = g.models[i];
                          return (
                            <td key={i} className="whitespace-nowrap">
                              {m ? (
                                <>
                                  {names[m.modelId] ?? m.modelId} <span className="muted">{fmtPct(m.directionAccuracy)}</span>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="mb-1 text-sm font-medium">信賴區間覆蓋率實測值</h3>
              <div className="max-h-80 overflow-auto">
                <table className="table-std">
                  <thead>
                    <tr>
                      <th>模型</th>
                      <th>名目</th>
                      <th>實測</th>
                      <th>樣本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.coverage)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([m, c]) => {
                        const ok = c.coverage !== null && c.nominal !== null && Math.abs(c.coverage - c.nominal) <= 0.02;
                        return (
                          <tr key={m}>
                            <td>{names[m] ?? m}</td>
                            <td>{fmtPct(c.nominal, 0)}</td>
                            <td style={{ color: ok ? BETTER_COLOR : WORSE_COLOR }}>{fmtPct(c.coverage)}</td>
                            <td>{c.n}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium">與 naive 基準比較（RMSE）</h3>
            <div className="max-h-80 overflow-auto">
              <table className="table-std">
                <thead>
                  <tr>
                    <th>代號</th>
                    <th>模型</th>
                    <th>期數</th>
                    <th>樣本</th>
                    <th>方向準確率</th>
                    <th>MAPE</th>
                    <th>模型 RMSE</th>
                    <th>Naive RMSE</th>
                    <th>相對改善</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows
                    .filter((r) => !r.hidden)
                    .map((r) => {
                      const rm = r.vsNaive?.metrics.rmse;
                      const c = rm?.verdict === 'better' ? BETTER_COLOR : rm?.verdict === 'worse' ? WORSE_COLOR : undefined;
                      return (
                        <tr key={`${r.symbol}|${r.modelId}|${r.horizon}`}>
                          <td>{r.symbol}</td>
                          <td className="whitespace-nowrap">{names[r.modelId] ?? r.modelId}</td>
                          <td>{r.horizon} 日</td>
                          <td>{r.n}</td>
                          <td>{fmtPct(r.directionAccuracy)}</td>
                          <td>{fmtPctRaw(r.mape)}</td>
                          <td>{fmtNum(r.rmse)}</td>
                          <td>{fmtNum(r.naive.rmse)}</td>
                          <td style={{ color: c }}>{rm && rm.relImprovementPct !== null ? `${rm.relImprovementPct > 0 ? '+' : ''}${rm.relImprovementPct.toFixed(1)}%` : '—'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
