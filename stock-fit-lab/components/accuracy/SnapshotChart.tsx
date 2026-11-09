'use client';
import { useMemo, useRef } from 'react';
import EChart, { type EChartHandle } from '@/components/EChart';
import { chartTextColor } from './format';

export interface SnapshotChartProps {
  trainEnd: string;
  lastPrice: number;
  targetDates: string[];
  mean: (number | null)[];
  lower: (number | null)[];
  upper: (number | null)[];
  level: number;
  actual: { date: string; value: number }[];
  benchmarks: Record<string, (number | null)[]>;
  benchmarkNames: Record<string, string>;
  modelName: string;
}

/** 單次預測：當時的預測曲線與區間 vs 事後回填的實際值，並列當時記錄的基準值 */
export default function SnapshotChart(p: SnapshotChartProps) {
  const ref = useRef<EChartHandle>(null);
  const option = useMemo(() => {
    const tc = chartTextColor();
    const x = [p.trainEnd, ...p.targetDates];
    const actualBy = new Map(p.actual.map((a) => [a.date, a.value]));
    const bandLabel = `${Math.round(p.level * 100)}% 區間`;
    return {
      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : '—') },
      legend: { type: 'scroll', top: 0, textStyle: { color: tc } },
      grid: { left: 60, right: 20, top: 40, bottom: 40 },
      xAxis: { type: 'category', data: x, axisLabel: { color: tc } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: tc } },
      series: [
        { name: bandLabel, type: 'line', stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, data: [p.lastPrice, ...p.lower], tooltip: { show: false } },
        {
          name: bandLabel,
          type: 'line',
          stack: 'band',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: { color: '#2563eb', opacity: 0.15 },
          data: [0, ...p.upper.map((u, i) => (u !== null && p.lower[i] !== null ? u - (p.lower[i] as number) : null))],
          tooltip: { show: false },
        },
        { name: `${p.modelName}（當時預測）`, type: 'line', data: [p.lastPrice, ...p.mean], lineStyle: { type: 'dashed', width: 2, color: '#2563eb' }, itemStyle: { color: '#2563eb' } },
        { name: '實際收盤（事後回填）', type: 'line', data: [p.lastPrice, ...p.targetDates.map((d) => actualBy.get(d) ?? null)], lineStyle: { width: 2, color: '#f59e0b' }, itemStyle: { color: '#f59e0b' }, connectNulls: false },
        ...Object.entries(p.benchmarks).map(([k, v]) => ({
          name: p.benchmarkNames[k] ?? k,
          type: 'line',
          symbol: 'none',
          data: [p.lastPrice, ...v],
          lineStyle: { width: 1, type: 'dotted' },
        })),
      ],
    };
  }, [p]);
  return (
    <div>
      <div className="mb-1 flex justify-end">
        <button className="btn !py-0 text-xs" onClick={() => ref.current?.toPng('snapshot.png')}>
          匯出 PNG
        </button>
      </div>
      <EChart ref={ref} option={option as never} height={340} />
    </div>
  );
}
