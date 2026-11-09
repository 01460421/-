'use client';
/**
 * 即時修正時間軸（規格第四節、第六節 4）：
 *  - 同一目標日的預測如何隨修正時間收斂 / 漂移（資料來自快照，/api/convergence）
 *  - 卡爾曼增益 K_t 與結構性變化警示
 *  - RLS 增益範數與遺忘因子
 *  - 集成權重（歸零模型標示原因）
 */
import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import EChart from '@/components/EChart';
import type { ConvergenceSeries } from '@/lib/engine/convergence';
import type { AnalyzePayload } from './types';
import { fetchJson, fmtNum, fmtPct, fmtTime, modelColor, isDarkMode } from './util';

type ConvResp = (ConvergenceSeries | { targetDate: null; byModel: Record<string, never>; actual: null }) & {
  candidates: { date: string; count: number }[];
  note?: string;
  storeKind?: string;
};

export default function CorrectionTimeline({ payload, refreshKey }: { payload: AnalyzePayload; refreshKey: number }) {
  const res = payload.result;
  const dark = isDarkMode();
  const [target, setTarget] = useState<string>('');
  const [conv, setConv] = useState<ConvResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'conv' | 'kalman' | 'rls' | 'weights'>('conv');

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ symbol: payload.symbol });
    if (target) q.set('target', target);
    q.set('models', ['ensemble', ...res.order.filter((m) => m !== 'ensemble').slice(0, 6)].join(','));
    fetchJson<ConvResp>(`/api/convergence?${q}`)
      .then((d) => {
        if (!alive) return;
        setConv(d);
        setErr(null);
      })
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [payload.symbol, target, refreshKey, res.order]);

  const convOption = useMemo<EChartsOption | null>(() => {
    if (!conv || !conv.targetDate) return null;
    const byModel = conv.byModel as ConvergenceSeries['byModel'];
    const ids = Object.keys(byModel);
    if (!ids.length) return null;
    const xs = [...new Set(ids.flatMap((id) => byModel[id].map((p) => p.createdAt)))].sort();
    const series: NonNullable<EChartsOption['series']> = [];
    for (const id of ids) {
      const m = new Map(byModel[id].map((p) => [p.createdAt, p] as const));
      series.push({ name: id, type: 'line', connectNulls: true, symbolSize: 5, data: xs.map((x) => (m.has(x) ? +m.get(x)!.mean.toFixed(3) : '-')), lineStyle: { color: modelColor(id, dark), width: id === 'ensemble' ? 2.4 : 1.2 }, itemStyle: { color: modelColor(id, dark) } });
    }
    const ens = byModel.ensemble;
    if (ens?.length) {
      const m = new Map(ens.map((p) => [p.createdAt, p] as const));
      series.push({ name: '集成區間', type: 'line', stack: 'b', data: xs.map((x) => (m.has(x) ? +m.get(x)!.lower.toFixed(3) : '-')), lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { opacity: 0 }, tooltip: { show: false } });
      series.push({ name: '集成區間', type: 'line', stack: 'b', data: xs.map((x) => (m.has(x) ? +(m.get(x)!.upper - m.get(x)!.lower).toFixed(3) : '-')), lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { opacity: 0.12, color: modelColor('ensemble', dark) }, tooltip: { show: false } });
    }
    return {
      animation: false,
      legend: { type: 'scroll', top: 0, textStyle: { fontSize: 11 } },
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtNum(v as number) },
      grid: { left: 56, right: 16, top: 30, bottom: 50 },
      xAxis: { type: 'category', data: xs.map((x) => fmtTime(x)), name: '修正時間', nameLocation: 'middle', nameGap: 32, axisLabel: { fontSize: 9 } },
      yAxis: { type: 'value', scale: true, name: `對 ${conv.targetDate} 的預測`, nameTextStyle: { fontSize: 10 } },
      series: [
        ...series,
        ...(conv.actual !== null
          ? [{ name: '實際值', type: 'line' as const, data: xs.map(() => conv.actual as number), showSymbol: false, lineStyle: { type: 'dashed' as const, color: '#ef4444' }, itemStyle: { color: '#ef4444' } }]
          : []),
      ],
    };
  }, [conv, dark]);

  const kalmanOption = useMemo<EChartsOption | null>(() => {
    const t = res.kalmanTrace;
    if (!t.length) return null;
    const alertSteps = new Set(res.kalmanAlerts.map((a) => a.step));
    return {
      animation: false,
      legend: { top: 0, textStyle: { fontSize: 11 } },
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtNum(v as number, 4) },
      grid: [{ left: 50, right: 50, top: 30, height: '45%' }, { left: 50, right: 50, top: '68%', height: '20%' }],
      xAxis: [
        { type: 'category', data: t.map((p) => p.step), gridIndex: 0, axisLabel: { show: false } },
        { type: 'category', data: t.map((p) => p.step), gridIndex: 1, name: '步數 t', nameLocation: 'middle', nameGap: 22 },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, name: 'K_t', min: 0, max: 1 },
        { type: 'value', gridIndex: 0, name: 'Q 放大倍數', position: 'right', scale: true },
        { type: 'value', gridIndex: 1, name: '創新 / σ', scale: true },
      ],
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      series: [
        { name: 'K_t（水準）', type: 'line', showSymbol: false, data: t.map((p) => +p.gain[0].toFixed(4)), lineStyle: { color: '#4f46e5' }, itemStyle: { color: '#4f46e5' } },
        { name: 'K_t（斜率）', type: 'line', showSymbol: false, data: t.map((p) => +p.gain[1].toFixed(4)), lineStyle: { color: '#0d9488' }, itemStyle: { color: '#0d9488' } },
        { name: 'Q 放大', type: 'line', yAxisIndex: 1, step: 'end', showSymbol: false, data: t.map((p) => +p.qScale.toFixed(3)), lineStyle: { color: '#f59e0b', type: 'dashed' }, itemStyle: { color: '#f59e0b' } },
        {
          name: '標準化創新',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 2,
          data: t.map((p) => ({ value: p.innovationSd ? +(p.innovation / p.innovationSd).toFixed(3) : 0, itemStyle: { color: alertSteps.has(p.step) ? '#dc2626' : Math.abs(p.innovation / (p.innovationSd || 1)) > 2 ? '#f59e0b' : '#94a3b8' } })),
        },
      ],
    };
  }, [res.kalmanTrace, res.kalmanAlerts]);

  const rlsOption = useMemo<EChartsOption | null>(() => {
    const ids = Object.keys(res.rlsTrace).filter((k) => res.rlsTrace[k].length);
    if (!ids.length) return null;
    const steps = [...new Set(ids.flatMap((id) => res.rlsTrace[id].map((p) => p.step)))].sort((a, b) => a - b);
    return {
      animation: false,
      legend: { top: 0, textStyle: { fontSize: 11 } },
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtNum(v as number, 4) },
      grid: { left: 56, right: 56, top: 30, bottom: 36 },
      xAxis: { type: 'category', data: steps, name: '步數 t', nameLocation: 'middle', nameGap: 22 },
      yAxis: [
        { type: 'value', name: '‖k_t‖', scale: true },
        { type: 'value', name: '遺忘因子', min: 0.85, max: 1, position: 'right' },
      ],
      series: ids.flatMap((id) => {
        const m = new Map(res.rlsTrace[id].map((p) => [p.step, p] as const));
        return [
          { name: `${id} ‖k‖`, type: 'line' as const, showSymbol: false, data: steps.map((s) => (m.has(s) ? +Math.hypot(...m.get(s)!.gain).toFixed(5) : '-')), lineStyle: { color: modelColor(id) }, itemStyle: { color: modelColor(id) } },
          { name: `${id} λ_f`, type: 'line' as const, yAxisIndex: 1, showSymbol: false, data: steps.map((s) => (m.has(s) ? m.get(s)!.forgetting : '-')), lineStyle: { color: modelColor(id), type: 'dotted' as const, opacity: 0.6 }, itemStyle: { color: modelColor(id) } },
        ];
      }),
    };
  }, [res.rlsTrace]);

  const weights = Object.entries(res.weightStatus).sort((a, b) => b[1].weight - a[1].weight);
  const weightOption = useMemo<EChartsOption>(
    () => ({
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmtPct(v as number) },
      grid: { left: 80, right: 20, top: 10, bottom: 20 },
      xAxis: { type: 'value', max: 1, axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%` } },
      yAxis: { type: 'category', data: weights.map(([id]) => res.results[id as keyof typeof res.results]?.name ?? id), inverse: true, axisLabel: { fontSize: 10 } },
      series: [
        {
          type: 'bar',
          data: weights.map(([id, s]) => ({ value: s.weight, itemStyle: { color: s.zeroed ? '#9ca3af' : modelColor(id, dark) }, label: { show: true, position: 'right', fontSize: 10, formatter: s.zeroed ? '已歸零' : `${(s.weight * 100).toFixed(1)}%` } })),
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [res.weightStatus, dark],
  );

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'conv', label: '目標日收斂' },
    { key: 'kalman', label: `卡爾曼增益 K_t${res.kalmanAlerts.length ? `（${res.kalmanAlerts.length} 警示）` : ''}` },
    { key: 'rls', label: 'RLS 增益' },
    { key: 'weights', label: '集成權重' },
  ];
  const targetOptions = [...new Set([...(conv?.candidates ?? []).map((c) => c.date), ...res.targetDates.slice(0, 5)])].sort();

  return (
    <section className="panel space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="h2">即時修正時間軸</h2>
        <div className="flex flex-wrap gap-1" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={`btn text-xs ${tab === t.key ? 'ring-2 ring-blue-500/50' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs muted">修正層：{res.layersRun.rollingRefit.length ? `滾動重擬合 ${res.layersRun.rollingRefit.length} 模型` : ''}{res.layersRun.rls.length ? ` · RLS ${res.layersRun.rls.join(',')}` : ''}{res.layersRun.kalman.length ? ' · 卡爾曼' : ''}</span>
      </div>

      {tab === 'conv' && (
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <label>
              目標日
              <select className="input ml-1" value={target || conv?.targetDate || ''} onChange={(e) => setTarget(e.target.value)} aria-label="目標日">
                {targetOptions.map((d) => {
                  const c = conv?.candidates.find((x) => x.date === d)?.count;
                  return (
                    <option key={d} value={d}>
                      {d}
                      {c ? `（${c} 次預測）` : ''}
                    </option>
                  );
                })}
              </select>
            </label>
            <span className="muted">資料來源：預測快照表（append-only{conv?.storeKind ? `，${conv.storeKind}` : ''}）{conv && 'actual' in conv && conv.actual !== null ? ` · 實際值 ${fmtNum(conv.actual)}` : ' · 實際值尚未回填'}</span>
          </div>
          {err && <p className="text-sm text-red-500">{err}</p>}
          {convOption ? (
            <EChart option={convOption} height={260} />
          ) : (
            <p className="py-8 text-center text-sm muted">{conv?.note ?? '此目標日尚無多次預測紀錄；每次分析 / 盤中輪詢 / 排程都會寫入快照，累積後即可看到預測逐步收斂或漂移。'}</p>
          )}
        </div>
      )}

      {tab === 'kalman' && (
        <div className="grid gap-2 lg:grid-cols-[1fr_280px]">
          {kalmanOption ? <EChart option={kalmanOption} height={280} /> : <p className="py-8 text-center text-sm muted">未啟用卡爾曼模型或第 3 層已關閉</p>}
          <div className="text-xs">
            <h3 className="mb-1 font-medium">結構性變化警示（殘差連續三期 &gt; 2σ → 自動放大 Q）</h3>
            {res.kalmanAlerts.length ? (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {res.kalmanAlerts.slice().reverse().map((a, i) => (
                  <li key={i} className="rounded border p-1.5" style={{ borderColor: 'var(--border)' }}>
                    <span className="chip mr-1">t={a.step}</span>
                    {a.message} <span className="muted">（Q×{fmtNum(a.qScale, 2)}）</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">目前無警示</p>
            )}
            <p className="mt-2 muted">K_t 越接近 1 代表模型越「相信新資料」；越接近 0 代表較信任既有狀態估計。</p>
          </div>
        </div>
      )}

      {tab === 'rls' && (rlsOption ? <EChart option={rlsOption} height={260} /> : <p className="py-8 text-center text-sm muted">RLS 線上更新尚無紀錄（第 2 層關閉或未啟用多項式 / 線性類模型）</p>)}

      {tab === 'weights' && (
        <div className="grid gap-2 lg:grid-cols-2">
          <EChart option={weightOption} height={Math.max(160, weights.length * 24 + 30)} />
          <div className="overflow-x-auto">
            <table className="table-std text-xs">
              <thead>
                <tr>
                  <th>模型</th>
                  <th>權重</th>
                  <th>ē（誤差 EWMA）</th>
                  <th>近 k 期方向準確率</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {weights.map(([id, s]) => (
                  <tr key={id}>
                    <td>{res.results[id as keyof typeof res.results]?.name ?? id}</td>
                    <td>{fmtPct(s.weight)}</td>
                    <td>{fmtNum(s.ebar, 3)}</td>
                    <td>
                      {fmtPct(s.rollingDirAcc)} <span className="muted">（n={s.dirSamples}）</span>
                    </td>
                    <td>{s.zeroed ? <span className="chip border-red-400 text-red-500" title={s.reason}>暫時歸零：{s.reason}</span> : s.belowCount > 0 ? <span className="chip">連續失準 {s.belowCount} 期</span> : '正常'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs muted">w_m ∝ ē_m⁻²；方向準確率低於 50% 連續 10 期時權重暫時歸零。</p>
          </div>
        </div>
      )}
    </section>
  );
}
