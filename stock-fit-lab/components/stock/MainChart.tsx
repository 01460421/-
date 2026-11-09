'use client';
/**
 * 主圖：K 線 / 收盤線、各模型擬合曲線、未來預測虛線、信賴區間陰影（堆疊面積）、基準線、
 * 偵測器命中與公司事件標記、AI / 框選標註區間（markArea）、dataZoom、十字游標、區間框選。
 * 下方成交量與外生變數子圖是另一個 ECharts 實例，以 group 聯動（縮放、游標同步）。
 */
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import type { EChartsOption } from 'echarts';
import EChart, { type EChartHandle } from '@/components/EChart';
import type { BenchmarkId, ModelId } from '@/lib/types';
import type { ModelRunResult } from '@/lib/engine/types';
import type { AnalyzePayload, MarkRange, Subplot } from './types';
import { BENCH_COLORS, DOWN_COLOR, UP_COLOR, fmtNum, isDarkMode, modelColor, resampleOhlc } from './util';

export interface MainChartHandle {
  toPng: (filename?: string) => void;
}

interface Props {
  payload: AnalyzePayload;
  visibleModels: ModelId[];
  chartType: 'candle' | 'line';
  benchmarks: BenchmarkId[];
  bandModel: ModelId | 'all' | 'none';
  highlight: string | null;
  marks: MarkRange[];
  timescale: 'day' | 'week' | 'month';
  subplots: Subplot[];
  showDetectors: boolean;
  showEvents: boolean;
  onBrush?: (range: { from: string; to: string } | null) => void;
}

const BENCH_LABEL: Record<string, string> = { naive: 'Naive', drift: '漂移', sma20: 'SMA20', sma60: 'SMA60', buyhold: '買進持有', custom: '自訂基準' };
const EVENT_LABEL: Record<string, string> = { earnings: '財報', dividend: '除權息', split: '分割', conference: '法說會', announcement: '公告' };
const GROUP = 'stock-main';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 預測點的公式代入說明（tooltip） */
function formulaSubstitution(r: ModelRunResult, i: number, priceMode: 'raw' | 'log'): string {
  const f = r.forecast;
  if (!f) return '';
  const p = (r.description?.params ?? {}) as Record<string, unknown>;
  const n = r.fitted.length;
  const tau = n > 1 ? (2 * (n - 1 + i + 1)) / (n - 1) - 1 : 0;
  const wrap = (v: number) => (priceMode === 'log' ? Math.exp(v) : v);
  const tail = `ŷ = ${fmtNum(f.mean[i])}（${Math.round(f.level * 100)}% 區間 ${fmtNum(f.lower[i])} ~ ${fmtNum(f.upper[i])}）`;
  if (r.id === 'poly' && Array.isArray(p.coef)) {
    const coef = p.coef as number[];
    const v = coef.reduce((s, a, k) => s + a * Math.pow(tau, k), 0);
    return `τ = ${tau.toFixed(4)}，P<sub>${coef.length - 1}</sub>(τ) = Σ a<sub>k</sub>τ<sup>k</sup> = ${fmtNum(v, 3)}${priceMode === 'log' ? ` → e^P = ${fmtNum(wrap(v))}` : ''}<br/>${tail}`;
  }
  if (r.id === 'exp' && typeof p.a === 'number' && typeof p.b === 'number') {
    return `τ = ${tau.toFixed(4)}，a·e^(bτ) = ${fmtNum(p.a, 3)}·e^(${fmtNum(p.b, 4)}×${tau.toFixed(3)})<br/>${tail}`;
  }
  if (r.id === 'linchannel' && typeof p.a === 'number' && typeof p.b === 'number') {
    const v = p.a + p.b * tau;
    return `τ = ${tau.toFixed(4)}，a + bτ = ${fmtNum(p.a, 3)} + ${fmtNum(p.b, 3)}×${tau.toFixed(3)} = ${fmtNum(v, 3)}${priceMode === 'log' ? ` → ${fmtNum(wrap(v))}` : ''}；通道 ± ${fmtNum(Number(p.k), 2)}σ<br/>${tail}`;
  }
  const scalars = Object.entries(p)
    .filter(([, v]) => typeof v === 'number')
    .slice(0, 4)
    .map(([k, v]) => `${esc(k)}=${fmtNum(v as number, 4)}`)
    .join('，');
  return `${scalars ? scalars + '<br/>' : ''}${tail}`;
}

const MainChart = forwardRef<MainChartHandle, Props>(function MainChart(props, ref) {
  const { payload, visibleModels, chartType, benchmarks, bandModel, highlight, marks, timescale, subplots, showDetectors, showEvents } = props;
  const main = useRef<EChartHandle>(null);
  const brushCb = useRef(props.onBrush);
  brushCb.current = props.onBrush;
  useImperativeHandle(ref, () => ({ toPng: (fn) => main.current?.toPng(fn) }));

  const res = payload.result;
  const dark = isDarkMode();
  const priceMode = res.config.priceMode;

  const ohlc = useMemo(() => resampleOhlc(payload.ohlc, timescale), [payload.ohlc, timescale]);
  const xDates = useMemo(() => {
    const fut = res.targetDates.filter((d) => d > (ohlc.dates[ohlc.dates.length - 1] ?? ''));
    return [...ohlc.dates, ...fut];
  }, [ohlc.dates, res.targetDates]);
  const nHist = ohlc.dates.length;

  const snap = (d: string) => {
    // 把任意日期貼齊到 x 軸上存在的日期（≥ d 的第一個）
    const i = xDates.findIndex((x) => x >= d);
    return xDates[i < 0 ? xDates.length - 1 : i];
  };

  const option = useMemo<EChartsOption>(() => {
    const idxOfHistory = new Map(res.history.dates.map((d, i) => [d, i] as const));
    const series: NonNullable<EChartsOption['series']> = [];
    const legend: string[] = [];
    const hitByDate = new Map<string, string[]>();
    for (const h of payload.detectorHits) {
      const arr = hitByDate.get(h.date) ?? [];
      if (arr.length < 6) arr.push(`${h.severity === 'critical' ? '🔴' : h.severity === 'warn' ? '🟠' : '🔵'} ${h.detector}：${h.message}${h.overlapsEvent ? `（與事件重疊：${h.overlapsEvent}）` : ''}`);
      hitByDate.set(h.date, arr);
    }
    const evByDate = new Map<string, string[]>();
    for (const e of payload.events) evByDate.set(e.date, [...(evByDate.get(e.date) ?? []), `${EVENT_LABEL[e.type] ?? e.type}：${e.title}（${e.source}）`]);

    // 標記：事件（垂直線）、標註區間（markArea）
    const markLineData = showEvents
      ? payload.events
          .filter((e) => e.date >= xDates[0] && e.date <= ohlc.dates[nHist - 1])
          .map((e) => ({ xAxis: snap(e.date), label: { formatter: EVENT_LABEL[e.type] ?? e.type, fontSize: 9, position: 'insideEndTop' as const }, lineStyle: { color: '#8b5cf6', type: 'dotted' as const } }))
      : [];
    const markAreaData = marks.map((m) => [
      { xAxis: snap(m.from), name: m.label, itemStyle: { color: 'rgba(250, 204, 21, 0.18)' }, label: { color: dark ? '#fde68a' : '#92400e', fontSize: 11 } },
      { xAxis: snap(m.to) },
    ]);
    // 預測區段背景
    if (xDates.length > nHist) markAreaData.push([{ xAxis: xDates[nHist], name: '預測區間', itemStyle: { color: dark ? 'rgba(96,165,250,0.06)' : 'rgba(37,99,235,0.05)' }, label: { color: dark ? '#93c5fd' : '#1d4ed8', fontSize: 10 } }, { xAxis: xDates[xDates.length - 1] }]);

    const yLo = Math.min(...ohlc.low.filter(Number.isFinite));
    const yHi = Math.max(...ohlc.high.filter(Number.isFinite));
    const priceName = chartType === 'candle' ? 'K 線' : '收盤價';
    legend.push(priceName);
    const pad = (arr: (number | string)[]) => [...arr, ...new Array(xDates.length - arr.length).fill('-')];
    if (chartType === 'candle') {
      series.push({
        name: priceName,
        type: 'candlestick',
        data: pad(ohlc.dates.map((_, i) => [ohlc.open[i], ohlc.close[i], ohlc.low[i], ohlc.high[i]]) as unknown as (number | string)[]),
        itemStyle: { color: UP_COLOR, color0: DOWN_COLOR, borderColor: UP_COLOR, borderColor0: DOWN_COLOR },
        markLine: { symbol: 'none', silent: true, data: markLineData },
        markArea: { silent: true, data: markAreaData as never },
        z: 2,
      });
    } else {
      series.push({
        name: priceName,
        type: 'line',
        data: pad(ohlc.close),
        showSymbol: false,
        lineStyle: { width: 1.4, color: dark ? '#e5e7eb' : '#111827' },
        itemStyle: { color: dark ? '#e5e7eb' : '#111827' },
        markLine: { symbol: 'none', silent: true, data: markLineData },
        markArea: { silent: true, data: markAreaData as never },
        z: 2,
      });
    }

    // 偵測器命中（散點，依日期合併）
    if (showDetectors && hitByDate.size) {
      const pts = [...hitByDate.entries()]
        .filter(([d]) => d >= ohlc.dates[0])
        .map(([d]) => {
          const i = ohlc.dates.indexOf(d);
          const y = i >= 0 ? ohlc.high[i] : undefined;
          const crit = payload.detectorHits.some((h) => h.date === d && h.severity === 'critical');
          return y === undefined ? null : { value: [d, y * 1.015], itemStyle: { color: crit ? '#dc2626' : '#f59e0b' } };
        })
        .filter(Boolean);
      legend.push('偵測器');
      series.push({ name: '偵測器', type: 'scatter', symbol: 'triangle', symbolSize: 8, data: pts as never, z: 5, tooltip: { show: false } });
    }

    // 模型擬合 + 預測
    const futStart = nHist - 1;
    const anchor = ohlc.close[nHist - 1];
    const bandIds = bandModel === 'all' ? visibleModels : bandModel === 'none' ? [] : visibleModels.includes(bandModel) ? [bandModel] : [];
    for (const id of res.order) {
      const r = res.results[id];
      if (!r || !r.ok || !visibleModels.includes(id)) continue;
      const color = modelColor(id, dark);
      const dim = highlight && highlight !== id;
      const width = highlight === id ? 3.2 : id === 'ensemble' ? 2.2 : 1.4;
      const opacity = dim ? 0.2 : 1;
      const name = r.name;
      legend.push(name);
      // 擬合值以日期對齊
      const start = r.fittedFrom ? idxOfHistory.get(r.fittedFrom) ?? -1 : -1;
      const byDate = new Map<string, number>();
      if (start >= 0) r.fitted.forEach((v, k) => byDate.set(res.history.dates[start + k], v));
      const fitData = xDates.map((d, i) => (i < nHist && byDate.has(d) ? +byDate.get(d)!.toFixed(4) : '-'));
      series.push({ name, type: 'line', data: fitData, showSymbol: false, connectNulls: false, lineStyle: { width, color, opacity }, itemStyle: { color }, emphasis: { focus: 'series' }, z: 3 });
      // 預測（虛線，從最後實際價接續）
      if (r.forecast) {
        const fMap = new Map(res.targetDates.map((d, i) => [d, r.forecast!.mean[i]] as const));
        const fData = xDates.map((d, i) => (i === futStart ? anchor : i > futStart && fMap.has(d) ? +fMap.get(d)!.toFixed(4) : '-'));
        series.push({ name, type: 'line', data: fData, showSymbol: false, lineStyle: { width, color, type: 'dashed', opacity }, itemStyle: { color }, z: 3, id: `${id}__fc` });
        if (bandIds.includes(id)) {
          const lo = new Map(res.targetDates.map((d, i) => [d, r.forecast!.lower[i]] as const));
          const hi = new Map(res.targetDates.map((d, i) => [d, r.forecast!.upper[i]] as const));
          const lower = xDates.map((d, i) => (i === futStart ? anchor : lo.has(d) && i > futStart ? +lo.get(d)!.toFixed(4) : '-'));
          const diff = xDates.map((d, i) => (i === futStart ? 0 : lo.has(d) && i > futStart ? +(hi.get(d)! - lo.get(d)!).toFixed(4) : '-'));
          series.push({ name, id: `${id}__lo`, type: 'line', data: lower, stack: `band-${id}`, showSymbol: false, lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, tooltip: { show: false }, silent: true, z: 1 });
          series.push({ name, id: `${id}__band`, type: 'line', data: diff, stack: `band-${id}`, showSymbol: false, lineStyle: { opacity: 0 }, areaStyle: { color, opacity: dim ? 0.05 : 0.14 }, tooltip: { show: false }, silent: true, z: 1 });
        }
      }
    }

    // 基準線（未來區段）
    for (const b of benchmarks) {
      const v = res.benchmarks[b];
      if (!v?.length) continue;
      const m = new Map(res.targetDates.map((d, i) => [d, v[i]] as const));
      const nm = `基準：${BENCH_LABEL[b] ?? b}`;
      legend.push(nm);
      series.push({
        name: nm,
        type: 'line',
        data: xDates.map((d, i) => (i === futStart ? anchor : i > futStart && m.has(d) ? +m.get(d)!.toFixed(4) : '-')),
        showSymbol: false,
        lineStyle: { width: 1, type: [2, 3], color: BENCH_COLORS[b] ?? '#9ca3af' },
        itemStyle: { color: BENCH_COLORS[b] ?? '#9ca3af' },
        z: 2,
      });
    }

    const tooltipFormatter = (params: unknown) => {
      const arr = (Array.isArray(params) ? params : [params]) as { axisValue: string; dataIndex: number; seriesName: string; seriesId?: string; value: unknown; color: string }[];
      if (!arr.length) return '';
      const date = arr[0].axisValue;
      const i = arr[0].dataIndex;
      const lines: string[] = [`<b>${date}</b>${i >= nHist ? '（預測）' : ''}`];
      if (i < nHist) {
        lines.push(`開 ${fmtNum(ohlc.open[i])} 高 ${fmtNum(ohlc.high[i])} 低 ${fmtNum(ohlc.low[i])} 收 <b>${fmtNum(ohlc.close[i])}</b> 量 ${fmtNum(ohlc.volume[i], 0)}`);
        const fi = payload.ohlc.dates.indexOf(date);
        if (fi >= 0 && payload.ohlc.filled[fi]) lines.push('<span style="color:#f59e0b">⚠ 缺值，以前值填補</span>');
      }
      const seen = new Set<string>();
      for (const p of arr) {
        if (p.seriesName === priceName || p.seriesName === '偵測器' || p.value === '-' || p.value === undefined || seen.has(p.seriesName)) continue;
        if (p.seriesId?.endsWith('__lo') || p.seriesId?.endsWith('__band')) continue;
        const isFc = p.seriesId?.endsWith('__fc');
        if (i >= nHist && !isFc && !p.seriesName.startsWith('基準')) continue;
        seen.add(p.seriesName);
        const v = Array.isArray(p.value) ? (p.value as number[])[1] : (p.value as number);
        let extra = '';
        if (isFc && i >= nHist) {
          const id = p.seriesId!.replace('__fc', '') as ModelId;
          const r = res.results[id];
          const k = res.targetDates.indexOf(date);
          if (r && k >= 0) extra = `<div style="margin-left:14px;font-size:11px;opacity:.85">${formulaSubstitution(r, k, priceMode)}</div>`;
        }
        lines.push(`<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${p.color};margin-right:4px"></span>${esc(p.seriesName)}：${fmtNum(v)}${extra}`);
        if (lines.length > 26) break;
      }
      const hits = hitByDate.get(date);
      if (hits && showDetectors) lines.push(...hits.map((h) => `<span style="font-size:11px">${esc(h)}</span>`));
      const evs = evByDate.get(date);
      if (evs && showEvents) lines.push(...evs.map((e) => `<span style="font-size:11px;color:#8b5cf6">◆ ${esc(e)}</span>`));
      return lines.join('<br/>');
    };

    return {
      animation: false,
      legend: { type: 'scroll', top: 0, data: legend, textStyle: { fontSize: 11 } },
      grid: { left: 56, right: 16, top: 52, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, confine: true, formatter: tooltipFormatter as never, extraCssText: 'max-width:440px;white-space:normal;' },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      toolbox: {
        right: 8,
        top: 22,
        itemSize: 13,
        feature: { brush: { type: ['lineX', 'clear'], title: { lineX: '區間框選', clear: '清除框選' } }, restore: { title: '還原' } },
      },
      brush: { xAxisIndex: 0, brushLink: 'all', outOfBrush: { colorAlpha: 0.35 }, throttleType: 'debounce', throttleDelay: 300 },
      xAxis: { type: 'category', data: xDates, boundaryGap: chartType === 'candle', axisLine: { onZero: false }, axisLabel: { fontSize: 10 } },
      // 發散的外推（例如高次多項式）不讓 y 軸失真：上下界限制在價格區間 ±40%
      yAxis: {
        type: 'value',
        scale: true,
        min: (v: { min: number }) => +Math.max(v.min, yLo - 0.4 * (yHi - yLo)).toFixed(2),
        max: (v: { max: number }) => +Math.min(v.max, yHi + 0.4 * (yHi - yLo)).toFixed(2),
        splitLine: { lineStyle: { opacity: 0.35 } },
        axisLabel: { fontSize: 10 },
      },
      dataZoom: [{ type: 'inside', xAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0, height: 16, bottom: 4 }],
      series,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, ohlc, xDates, visibleModels, chartType, benchmarks, bandModel, highlight, marks, showDetectors, showEvents, dark]);

  const subOption = useMemo<EChartsOption>(() => {
    const grids = 1 + subplots.length;
    const h = 100 / grids;
    const pad = (arr: (number | null | string)[]) => [...arr, ...new Array(Math.max(0, xDates.length - arr.length)).fill('-')];
    const series: NonNullable<EChartsOption['series']> = [
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: pad(ohlc.volume.map((v, i) => ({ value: v, itemStyle: { color: ohlc.close[i] >= ohlc.open[i] ? UP_COLOR : DOWN_COLOR, opacity: 0.7 } })) as never),
      },
    ];
    subplots.forEach((s, k) => {
      const m = new Map(s.dates.map((d, i) => [d, s.values[i]] as const));
      series.push({
        name: s.label,
        type: 'bar',
        xAxisIndex: k + 1,
        yAxisIndex: k + 1,
        data: xDates.map((d) => {
          const v = m.get(d);
          return v === undefined || v === null ? '-' : { value: v, itemStyle: { color: v >= 0 ? UP_COLOR : DOWN_COLOR } };
        }) as never,
      });
    });
    return {
      animation: false,
      tooltip: { trigger: 'axis', confine: true, valueFormatter: (v) => fmtNum(v as number, 0) },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: Array.from({ length: grids }, (_, k) => ({ left: 56, right: 16, top: `${k * h + 6}%`, height: `${h - 14}%` })),
      xAxis: Array.from({ length: grids }, (_, k) => ({ type: 'category' as const, gridIndex: k, data: xDates, axisLabel: { show: k === grids - 1, fontSize: 10 }, axisTick: { show: false } })),
      yAxis: Array.from({ length: grids }, (_, k) => ({
        type: 'value' as const,
        gridIndex: k,
        scale: k > 0,
        splitNumber: 2,
        name: k === 0 ? '成交量' : `${subplots[k - 1].label}`,
        nameTextStyle: { fontSize: 10, align: 'left' as const },
        axisLabel: { fontSize: 9, formatter: (v: number) => fmtNum(v, 0) },
      })),
      dataZoom: [{ type: 'inside', xAxisIndex: Array.from({ length: grids }, (_, k) => k) }],
      series,
    };
  }, [ohlc, xDates, subplots]);

  const xRef = useRef(xDates);
  xRef.current = xDates;
  const events = useMemo(
    () => ({
      brushEnd: (p: { areas?: { coordRange?: [number, number] }[] }) => {
        const r = p.areas?.[0]?.coordRange;
        const xs = xRef.current;
        if (!r) return brushCb.current?.(null);
        const from = xs[Math.max(0, Math.round(r[0]))];
        const to = xs[Math.min(xs.length - 1, Math.round(r[1]))];
        if (from && to) brushCb.current?.({ from, to });
      },
    }),
    [],
  );

  return (
    <div>
      <EChart ref={main} option={option} height={460} group={GROUP} onEvents={events} />
      <EChart option={subOption} height={110 + subplots.length * 90} group={GROUP} />
    </div>
  );
});

export default MainChart;
