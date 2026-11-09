'use client';
import { useMemo, useState } from 'react';
import EChart from './EChart';
import { durbinWatson, histogram, qqPoints, mean, std, ljungBox } from '@/lib/math/stats';

/** 殘差面板：時間序列、直方圖、QQ 圖、Durbin–Watson 與 Ljung–Box */
export default function ResidualPanel({ dates, residuals }: { dates: string[]; residuals: Record<string, number[]> }) {
  const ids = Object.keys(residuals);
  const [sel, setSel] = useState(ids[0] ?? '');
  const r = useMemo(() => residuals[sel] ?? [], [residuals, sel]);
  const d = dates.slice(-r.length);
  const stats = useMemo(() => {
    if (r.length < 5) return null;
    return { dw: durbinWatson(r), lb: ljungBox(r, 10), m: mean(r), s: std(r) };
  }, [r]);
  const hist = useMemo(() => histogram(r, 24), [r]);
  const qq = useMemo(() => qqPoints(r), [r]);

  if (!ids.length) return <section className="panel text-sm muted">尚無殘差資料</section>;
  return (
    <section className="panel space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="h2">殘差面板</h2>
        <select className="input" value={sel} onChange={(e) => setSel(e.target.value)} aria-label="選擇模型">
          {ids.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        {stats && (
          <span className="text-xs muted">
            Durbin–Watson = <b>{stats.dw.toFixed(3)}</b>（≈2 無一階自相關）· Ljung–Box Q({stats.lb.lags}) = {stats.lb.q.toFixed(2)}，p = {stats.lb.pValue.toFixed(3)}
            {stats.lb.pValue < 0.05 ? '（殘差仍有自相關，模型未捕捉完整結構）' : ''} · 平均 {stats.m.toFixed(3)} · 標準差 {stats.s.toFixed(3)}
          </span>
        )}
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        <EChart
          height={220}
          option={{
            title: { text: '殘差時間序列', textStyle: { fontSize: 12 } },
            tooltip: { trigger: 'axis' },
            grid: { left: 40, right: 10, top: 30, bottom: 30 },
            xAxis: { type: 'category', data: d },
            yAxis: { type: 'value', scale: true },
            series: [{ type: 'bar', data: r.map((v) => +v.toFixed(4)), itemStyle: { color: '#64748b' } }],
          }}
        />
        <EChart
          height={220}
          option={{
            title: { text: '直方圖', textStyle: { fontSize: 12 } },
            tooltip: {},
            grid: { left: 40, right: 10, top: 30, bottom: 30 },
            xAxis: { type: 'category', data: hist.map((b) => b.x0.toFixed(2)) },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: hist.map((b) => b.count), barCategoryGap: '5%' }],
          }}
        />
        <EChart
          height={220}
          option={{
            title: { text: 'QQ 圖（常態）', textStyle: { fontSize: 12 } },
            tooltip: {},
            grid: { left: 40, right: 10, top: 30, bottom: 30 },
            xAxis: { type: 'value', name: '理論', scale: true },
            yAxis: { type: 'value', name: '樣本', scale: true },
            series: [
              { type: 'scatter', symbolSize: 4, data: qq.map((p) => [p.theoretical, p.sample]) },
              { type: 'line', showSymbol: false, data: [[-3, -3], [3, 3]], lineStyle: { type: 'dashed' } },
            ],
          }}
        />
      </div>
    </section>
  );
}
