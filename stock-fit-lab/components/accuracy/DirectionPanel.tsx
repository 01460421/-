'use client';
import { useMemo, useRef } from 'react';
import EChart, { type EChartHandle } from '@/components/EChart';
import type { AccuracyResponse } from './types';
import { DOWN_COLOR, UP_COLOR, chartTextColor, fmtNum, fmtPct, isNum } from './format';

/** 混淆矩陣（看漲 / 看跌 / 觀望 × 實際漲 / 跌）+ 機率校準（Brier score、可靠度圖） */
export default function DirectionPanel({ direction, names, thresholds }: { direction: AccuracyResponse['direction']; names: Record<string, string>; thresholds: { up: number; down: number } }) {
  const ref = useRef<EChartHandle>(null);
  const { confusion: cm, calibration: cal } = direction;
  const option = useMemo(() => {
    const tc = chartTextColor();
    const pts = cal.bins.filter((b) => (b.count ?? 0) > 0 && isNum(b.meanPredicted) && isNum(b.observedFrequency));
    return {
      tooltip: { trigger: 'item' },
      legend: { top: 0, textStyle: { color: tc } },
      grid: { left: 50, right: 50, top: 36, bottom: 40 },
      xAxis: { type: 'value', min: 0, max: 1, name: '預測 P(上漲)', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: tc }, axisLabel: { color: tc } },
      yAxis: [
        { type: 'value', min: 0, max: 1, name: '實際上漲頻率', nameTextStyle: { color: tc }, axisLabel: { color: tc } },
        { type: 'value', name: '樣本數', nameTextStyle: { color: tc }, axisLabel: { color: tc }, splitLine: { show: false } },
      ],
      series: [
        { name: '完美校準', type: 'line', data: [[0, 0], [1, 1]], symbol: 'none', lineStyle: { type: 'dashed', color: '#94a3b8' }, tooltip: { show: false } },
        {
          name: '樣本數',
          type: 'bar',
          yAxisIndex: 1,
          barWidth: '60%',
          itemStyle: { color: 'rgba(148,163,184,0.35)' },
          data: cal.bins.map((b) => [((b.lo ?? 0) + (b.hi ?? 0)) / 2, b.count ?? 0]),
          tooltip: { formatter: (p: { value: number[] }) => `區間 ${(p.value[0] - 0.05).toFixed(1)}–${(p.value[0] + 0.05).toFixed(1)}：${p.value[1]} 筆` },
        },
        {
          name: '可靠度',
          type: 'line',
          data: pts.map((b) => [b.meanPredicted, b.observedFrequency, b.count]),
          symbolSize: (v: number[]) => Math.min(18, 5 + Math.sqrt(v[2])),
          itemStyle: { color: '#2563eb' },
          tooltip: { formatter: (p: { value: number[] }) => `平均預測 ${fmtPct(p.value[0])}<br/>實際上漲 ${fmtPct(p.value[1])}<br/>${p.value[2]} 筆` },
        },
      ],
    };
  }, [cal]);

  const rowLabels = ['看漲', '看跌', '觀望'];
  const rowColor = [UP_COLOR, DOWN_COLOR, undefined];
  const modelLabel = direction.model ? (names[direction.model] ?? direction.model) : '—';

  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <div>
        <h3 className="mb-1 text-sm font-medium">混淆矩陣（{modelLabel}，第 {direction.horizon} 期）</h3>
        <p className="mb-2 text-xs muted">
          列 = 快照當時的訊號（P ≥ {thresholds.up} 看漲、≤ {thresholds.down} 看跌、其餘觀望；無 P 時以預測均值方向）；欄 = 回填後實際相對發出日收盤價的漲跌。
        </p>
        {cm.total ? (
          <table className="table-std max-w-md">
            <thead>
              <tr>
                <th>訊號 \ 實際</th>
                <th style={{ color: UP_COLOR }}>上漲</th>
                <th style={{ color: DOWN_COLOR }}>下跌</th>
                <th>合計</th>
                <th>判對率</th>
              </tr>
            </thead>
            <tbody>
              {cm.matrix.map((row, i) => {
                const [u, d] = row as [number | null, number | null];
                const tot = (u ?? 0) + (d ?? 0);
                const hit = i === 0 ? u : i === 1 ? d : null;
                return (
                  <tr key={i}>
                    <td style={{ color: rowColor[i] }} className="font-medium">
                      {rowLabels[i]}
                    </td>
                    <td className={i === 0 ? 'font-semibold' : ''}>{u}</td>
                    <td className={i === 1 ? 'font-semibold' : ''}>{d}</td>
                    <td>{tot}</td>
                    <td>{hit !== null && tot ? fmtPct((hit ?? 0) / tot) : i === 2 ? `占 ${fmtPct(tot / (cm.total || 1))}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted text-sm">此期數尚無回填結果。</p>
        )}
        <p className="mt-2 text-sm">
          出手準確率：<b>{fmtPct(cm.actAccuracy)}</b>
          <span className="muted">（總樣本 {cm.total}）</span>
        </p>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-medium">機率校準（可靠度圖）</h3>
          <button className="btn !py-0 text-xs" onClick={() => ref.current?.toPng('reliability.png')}>
            匯出 PNG
          </button>
        </div>
        <div className="mb-1 flex flex-wrap gap-2 text-xs">
          <span className="chip" title="Brier = 平均 (p − o)²，越低越好；永遠猜 0.5 時為 0.25">Brier {fmtNum(cal.brier, 4)}</span>
          <span className="chip" title="相對永遠預測基礎率的改善；> 0 代表優於基礎率">BSS {fmtNum(cal.brierSkill, 3)}</span>
          <span className="chip" title="預期校準誤差（各分箱 |平均預測 − 實際頻率| 的加權平均）">ECE {fmtNum(cal.ece, 3)}</span>
          <span className="chip">基礎上漲率 {fmtPct(cal.baseRate)}</span>
          <span className="chip">n = {cal.n}</span>
        </div>
        {cal.n ? <EChart ref={ref} option={option as never} height={280} /> : <p className="muted text-sm">快照沒有 P(上漲) 或尚未回填。</p>}
      </div>
    </div>
  );
}
