'use client';
import { useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import EChart, { type EChartHandle } from '@/components/EChart';
import type { AccuracyResponse } from './types';
import { chartTextColor, colorFor } from './format';

/** 準度趨勢：橫軸為預測發出日，縱軸為該次預測的 MAPE，每個模型一條線；點擊資料點開啟單次預測詳情 */
export default function TrendChart({ trend, names, horizon }: { trend: AccuracyResponse['trend']; names: Record<string, string>; horizon: number | null }) {
  const ref = useRef<EChartHandle>(null);
  const router = useRouter();
  const models = useMemo(() => Object.keys(trend).sort(), [trend]);
  const option = useMemo(() => {
    const tc = chartTextColor();
    const defaultOn = new Set(['ensemble', 'kalman', 'arima', 'holtwinters']);
    const anyDefault = models.some((m) => defaultOn.has(m));
    return {
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: unknown) => (typeof v === 'number' ? `${v.toFixed(2)}%` : '—'),
      },
      legend: {
        type: 'scroll',
        top: 0,
        textStyle: { color: tc },
        selected: Object.fromEntries(models.map((m) => [names[m] ?? m, !anyDefault || defaultOn.has(m)])),
      },
      grid: { left: 50, right: 20, top: 40, bottom: 60 },
      xAxis: { type: 'time', axisLabel: { color: tc } },
      yAxis: { type: 'value', name: 'MAPE (%)', nameTextStyle: { color: tc }, axisLabel: { color: tc, formatter: '{value}%' }, scale: true },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 10 }],
      series: models.map((m) => ({
        name: names[m] ?? m,
        type: 'line',
        showSymbol: true,
        symbolSize: 4,
        connectNulls: true,
        lineStyle: { width: m === 'ensemble' ? 2.5 : 1.2 },
        itemStyle: { color: colorFor(m, models) },
        data: trend[m].filter((p) => p.mape !== null).map((p) => ({ value: [p.createdAt, p.mape], snapshotId: p.snapshotId })),
      })),
    };
  }, [trend, names, models]);

  if (!models.length) return <p className="muted py-6 text-center text-sm">尚無已回填的預測可計算 MAPE。</p>;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs muted">
        <span>{horizon ? `只計第 ${horizon} 期（t+${horizon}）的絕對百分比誤差` : '每筆快照所有已回填期數的平均絕對百分比誤差'}；點擊資料點查看該次預測詳情</span>
        <button className="btn !py-0 text-xs" onClick={() => ref.current?.toPng('accuracy-trend.png')}>
          匯出 PNG
        </button>
      </div>
      <EChart
        ref={ref}
        option={option as never}
        height={340}
        onEvents={{
          click: (p: { data?: { snapshotId?: string } }) => {
            if (p.data?.snapshotId) router.push(`/snapshot/${p.data.snapshotId}`);
          },
        }}
      />
    </div>
  );
}
