'use client';
/**
 * 基準對照表（規格第五節、第六節 5）：模型 × 指標矩陣（走動式前向驗證、樣本外），
 * 與 naive 的差值與相對改善百分比、顯著性著色；疑似資料洩漏者隱藏並標示「稽核中」。
 */
import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import EChart from '@/components/EChart';
import type { ModelId, PriceMode } from '@/lib/types';
import type { Verdict, WalkForwardResponse, WfRow } from './types';
import { downloadBlob, fetchJson, fmtNum, fmtPct, fmtTime, modelColor, toCsv } from './util';

type SortKey = 'model' | 'mae' | 'rmse' | 'mape' | 'directionAccuracy' | 'theilU' | 'coverage' | 'rel';

const VERDICT_STYLE: Record<Verdict, string> = {
  better: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  worse: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  insignificant: '',
  na: 'opacity-60',
};
const VERDICT_TEXT: Record<Verdict, string> = { better: '顯著較佳', worse: '顯著較差', insignificant: '不顯著', na: '—' };

export default function BenchmarkTable({
  symbol,
  models,
  window,
  lambda,
  priceMode,
  params,
  data,
  onData,
}: {
  symbol: string;
  models: ModelId[];
  window: number;
  lambda: number;
  priceMode: PriceMode;
  params: Partial<Record<ModelId, Record<string, number>>>;
  data: WalkForwardResponse | null;
  onData: (d: WalkForwardResponse) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [h, setH] = useState(5);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'directionAccuracy', dir: -1 });

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchJson<WalkForwardResponse>('/api/walkforward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, models, window, lambda, priceMode, params, horizons: [1, 5, 10, 20] }),
      });
      onData(d);
      if (!d.horizons.includes(h)) setH(d.horizons[0]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => {
    if (!data) return [] as WfRow[];
    const val = (r: WfRow): number | string => {
      if (sort.key === 'model') return r.name;
      if (r.hidden || !r.metrics) return NaN;
      if (sort.key === 'rel') return r.vsNaive?.metrics.rmse?.relImprovementPct ?? NaN;
      return (r.metrics[sort.key] as number | null) ?? NaN;
    };
    return data.rows
      .filter((r) => r.horizon === h)
      .sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * sort.dir;
        if (Number.isNaN(va)) return 1;
        if (Number.isNaN(vb)) return -1;
        return (va - vb) * sort.dir;
      });
  }, [data, h, sort]);

  const curveOption = useMemo<EChartsOption | null>(() => {
    if (!data) return null;
    const ids = Object.keys(data.curves).filter((id) => data.curves[id][String(h)]);
    if (!ids.length) return null;
    const dates = [...new Set(ids.flatMap((id) => data.curves[id][String(h)].dates))].sort();
    return {
      animation: false,
      legend: { type: 'scroll', top: 0, textStyle: { fontSize: 10 } },
      tooltip: { trigger: 'axis', valueFormatter: (v) => (typeof v === 'number' ? `${v.toFixed(2)}%` : '—') },
      grid: { left: 46, right: 12, top: 30, bottom: 50 },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 14, bottom: 4 }],
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 9 } },
      yAxis: { type: 'value', name: '|誤差| %', nameTextStyle: { fontSize: 10 } },
      series: ids.map((id) => {
        const c = data.curves[id][String(h)];
        const m = new Map(c.dates.map((d, i) => [d, c.absPctError[i]] as const));
        return {
          name: id === 'naive' ? '基準：naive' : id,
          type: 'line' as const,
          showSymbol: false,
          connectNulls: true,
          data: dates.map((d) => m.get(d) ?? '-'),
          lineStyle: { width: id === 'naive' ? 2 : id === 'ensemble' ? 1.8 : 1, type: id === 'naive' ? ('dashed' as const) : ('solid' as const), color: id === 'naive' ? '#9ca3af' : modelColor(id) },
          itemStyle: { color: id === 'naive' ? '#9ca3af' : modelColor(id) },
        };
      }),
    };
  }, [data, h]);

  const exportCsv = () => {
    if (!data) return;
    const head = ['model', 'horizon', 'n', 'MAE', 'RMSE', 'MAPE%', 'dirAcc', 'dirP', 'theilU', 'coverage', 'RMSE_vs_naive_diff', 'RMSE_rel_improve%', 'overall', 'hidden'];
    const body = data.rows.map((r) => [r.model, r.horizon, r.metrics?.n, r.metrics?.mae, r.metrics?.rmse, r.metrics?.mape, r.metrics?.directionAccuracy, r.metrics?.dirPValue, r.metrics?.theilU, r.metrics?.coverage, r.vsNaive?.metrics.rmse?.diff, r.vsNaive?.metrics.rmse?.relImprovementPct, r.vsNaive?.overall, r.hidden ? r.hiddenReason : '']);
    for (const b of data.benchmarks) body.push([`bench:${b.id}`, b.horizon, b.metrics.n, b.metrics.mae, b.metrics.rmse, b.metrics.mape, b.metrics.directionAccuracy, b.metrics.dirPValue, b.metrics.theilU, b.metrics.coverage, '', '', '', '']);
    downloadBlob(toCsv(head, body), `${symbol}_walkforward.csv`, 'text/csv;charset=utf-8');
  };

  const th = (key: SortKey, label: string, title?: string) => (
    <th className="cursor-pointer select-none whitespace-nowrap" title={title} onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'model' ? 1 : -1 }))}>
      {label}
      {sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const cell = (r: WfRow, metric: 'mae' | 'rmse' | 'mape' | 'directionAccuracy' | 'theilU' | 'coverage') => {
    const v = r.metrics?.[metric] ?? null;
    const c = r.vsNaive?.metrics[metric];
    const verdict = c?.verdict ?? 'na';
    const text = metric === 'directionAccuracy' || metric === 'coverage' ? fmtPct(v) : metric === 'mape' ? `${fmtNum(v)}%` : fmtNum(v, metric === 'theilU' ? 3 : 2);
    const title = c ? `vs naive：差值 ${fmtNum(c.diff, 4)}，相對改善 ${fmtNum(c.relImprovementPct, 1)}%${c.pValue !== null ? `，p = ${fmtNum(c.pValue, 3)}` : ''}（${VERDICT_TEXT[verdict]}）` : undefined;
    return (
      <td className={VERDICT_STYLE[verdict]} title={title}>
        {text}
        {c && c.relImprovementPct !== null && Number.isFinite(c.relImprovementPct) && metric !== 'coverage' && (
          <span className="ml-1 text-[10px] opacity-75">{c.relImprovementPct >= 0 ? '+' : ''}{c.relImprovementPct.toFixed(1)}%</span>
        )}
      </td>
    );
  };

  return (
    <section className="panel space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="h2">基準對照表（走動式前向驗證）</h2>
        <button className="btn-primary" onClick={run} disabled={loading}>
          {loading ? '驗證中…（約 5–30 秒）' : data ? '重新執行走動式驗證' : '執行走動式驗證'}
        </button>
        {data && (
          <>
            <label className="text-xs">
              預測期數
              <select className="input ml-1" value={h} onChange={(e) => setH(Number(e.target.value))} aria-label="預測期數">
                {data.horizons.map((x) => (
                  <option key={x} value={x}>
                    {x} 日
                  </option>
                ))}
              </select>
            </label>
            <button className="btn text-xs" onClick={exportCsv}>
              匯出 CSV
            </button>
          </>
        )}
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}
      {!data && !loading && <p className="text-sm muted">以歷史資料模擬「當時只知道過去」：在每個起點只用之前的資料擬合、預測，再與之後的真值比對，產出樣本外誤差，避免只看樣本內擬合的過度樂觀。</p>}
      {loading && !data && <div className="h-40 animate-pulse rounded bg-gray-500/10" />}
      {data && (
        <>
          <p className="text-xs muted">
            來源 {data.source}{data.stale ? '（快取）' : ''} · 資料時間 {fmtTime(data.asOf)} · 樣本外起點 {data.origins} 個（{data.firstOrigin} ~ {data.lastOrigin}，每 {data.step} 日）· 訓練視窗 {data.window} · 耗時 {(data.timings.totalMs / 1000).toFixed(1)} 秒
          </p>
          <div className="overflow-x-auto">
            <table className="table-std text-xs">
              <thead>
                <tr>
                  {th('model', '模型')}
                  <th>n</th>
                  {th('mae', 'MAE')}
                  {th('rmse', 'RMSE')}
                  {th('mape', 'MAPE')}
                  {th('directionAccuracy', '方向準確率')}
                  {th('theilU', "Theil's U", 'U < 1 才代表優於 naive')}
                  {th('coverage', '區間覆蓋率', '90% 區間實測覆蓋率，應接近 90%')}
                  {th('rel', 'RMSE 改善', '相對 naive 的 RMSE 改善百分比')}
                  <th>整體</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) =>
                  r.hidden ? (
                    <tr key={r.model}>
                      <td>{r.name}</td>
                      <td colSpan={9} className="text-amber-600">
                        ⚠ {r.hiddenReason ?? `${data.leakLabel}，稽核中`}（數值暫不顯示：{data.suspects.find((s) => s.model === r.model && s.horizon === r.horizon)?.reasons.join('；')}）
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.model}>
                      <td className="whitespace-nowrap">
                        <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: modelColor(r.model) }} />
                        {r.name}
                        {r.advanced && <span className="chip ml-1">進階</span>}
                      </td>
                      <td>{r.metrics?.n ?? '—'}</td>
                      {cell(r, 'mae')}
                      {cell(r, 'rmse')}
                      {cell(r, 'mape')}
                      {cell(r, 'directionAccuracy')}
                      {cell(r, 'theilU')}
                      {cell(r, 'coverage')}
                      <td className={VERDICT_STYLE[r.vsNaive?.metrics.rmse?.verdict ?? 'na']}>{fmtNum(r.vsNaive?.metrics.rmse?.relImprovementPct, 1)}%</td>
                      <td className={VERDICT_STYLE[r.vsNaive?.overall ?? 'na']}>{VERDICT_TEXT[r.vsNaive?.overall ?? 'na']}</td>
                    </tr>
                  ),
                )}
                {data.benchmarks
                  .filter((b) => b.horizon === h)
                  .map((b) => (
                    <tr key={`b-${b.id}`} className="opacity-70">
                      <td className="italic">基準：{b.name}</td>
                      <td>{b.metrics.n}</td>
                      <td>{fmtNum(b.metrics.mae)}</td>
                      <td>{fmtNum(b.metrics.rmse)}</td>
                      <td>{fmtNum(b.metrics.mape)}%</td>
                      <td>{fmtPct(b.metrics.directionAccuracy)}</td>
                      <td>{fmtNum(b.metrics.theilU, 3)}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs muted">
            圖例：<span className={`rounded px-1 ${VERDICT_STYLE.better}`}>綠底＝顯著優於 naive</span> <span className={`rounded px-1 ${VERDICT_STYLE.worse}`}>紅底＝顯著劣於 naive</span>（此處顏色代表模型相對基準的優劣，與漲跌紅綠無關）。小字為相對改善 %，滑鼠停留可見差值與 p 值。股價接近隨機漫步，多數模型不顯著優於 naive 是正常現象。
          </p>
          {Object.keys(data.failures).length > 0 && <p className="text-xs text-amber-600">部分起點擬合失敗：{Object.entries(data.failures).map(([k, v]) => `${k} ${v.count} 次`).join('、')}</p>}
          {curveOption && (
            <div>
              <h3 className="text-sm font-medium">樣本外誤差曲線（h = {h}，|誤差| / 實際值）</h3>
              <EChart option={curveOption} height={240} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
