'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import EChart, { type EChartHandle } from '@/components/EChart';
import type { ReplayResponse } from './types';
import { chartTextColor, colorFor, fmtNum, fmtPct, fmtTime, isNum } from './format';

/** 預測回放：時間滑桿回到過去任一時點，只顯示當時已知價格與當時寫入的預測，再疊上之後真實走勢 */
export default function ReplayPanel({ symbol, model, names }: { symbol: string | null; model: string | null; names: Record<string, string> }) {
  const ref = useRef<EChartHandle>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [data, setData] = useState<ReplayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [band, setBand] = useState<string>('ensemble');
  const [showAfter, setShowAfter] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setDates([]);
    setData(null);
    setError(null);
    if (!symbol) return;
    let alive = true;
    fetch(`/api/accuracy/replay?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? '讀取失敗');
        return j as ReplayResponse;
      })
      .then((j) => {
        if (!alive) return;
        setDates(j.availableDates);
        // 預設回到有足夠後續走勢的時點（倒數第 20 個可回放日）
        setIdx(Math.max(0, j.availableDates.length - 20));
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [symbol]);

  const date = dates[idx];
  useEffect(() => {
    if (!symbol || !date) return;
    clearTimeout(timer.current);
    let alive = true;
    timer.current = setTimeout(() => {
      setLoading(true);
      const qs = new URLSearchParams({ symbol, date });
      if (model) qs.set('models', model);
      fetch(`/api/accuracy/replay?${qs}`)
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? '讀取失敗');
          return j as ReplayResponse;
        })
        .then((j) => {
          if (!alive) return;
          setData(j);
          setError(null);
          const ids = (j.snapshots ?? []).map((s) => s.modelId);
          setBand((b) => (ids.includes(b) ? b : ids.includes('ensemble') ? 'ensemble' : (ids[0] ?? b)));
        })
        .catch((e) => alive && setError(e.message))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [symbol, date, model]);

  const snaps = useMemo(() => data?.snapshots ?? [], [data]);
  const option = useMemo(() => {
    if (!data) return null;
    const tc = chartTextColor();
    const ids = snaps.map((s) => s.modelId).sort();
    const nm = (id: string) => names[id] ?? id;
    // 無日線時，以快照回填值作為之後走勢
    let after = data.after ?? [];
    if (!after.length && data.outcomes) {
      const m = new Map<string, number>();
      for (const os of Object.values(data.outcomes)) for (const o of os) if (isNum(o.actual)) m.set(o.targetDate, o.actual);
      after = [...m.entries()].sort().map(([d, p]) => ({ date: d, price: p }));
    }
    const defaultOn = new Set(['ensemble', 'kalman', 'arima', band]);
    const series: unknown[] = [
      { name: '當時已知價格', type: 'line', showSymbol: false, data: (data.known ?? []).map((p) => [p.date, p.price]), lineStyle: { width: 1.8, color: '#64748b' }, itemStyle: { color: '#64748b' }, z: 3 },
    ];
    if (showAfter) series.push({ name: '之後真實走勢', type: 'line', showSymbol: false, data: after.map((p) => [p.date, p.price]), lineStyle: { width: 1.8, type: 'dotted', color: '#f59e0b' }, itemStyle: { color: '#f59e0b' }, z: 3 });
    const b = snaps.find((s) => s.modelId === band);
    if (b) {
      series.push(
        { name: `${nm(b.modelId)} ${Math.round(b.level * 100)}% 區間`, type: 'line', stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, data: b.targetDates.map((d, i) => [d, b.lower[i]]), tooltip: { show: false } },
        {
          name: `${nm(b.modelId)} ${Math.round(b.level * 100)}% 區間`,
          type: 'line',
          stack: 'band',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: { color: colorFor(b.modelId, ids), opacity: 0.15 },
          data: b.targetDates.map((d, i) => [d, isNum(b.upper[i]) && isNum(b.lower[i]) ? (b.upper[i] as number) - (b.lower[i] as number) : null]),
          tooltip: { show: false },
        },
      );
    }
    for (const s of snaps) {
      series.push({
        name: nm(s.modelId),
        type: 'line',
        symbol: 'circle',
        symbolSize: 3,
        lineStyle: { type: 'dashed', width: s.modelId === 'ensemble' ? 2.5 : 1.3 },
        itemStyle: { color: colorFor(s.modelId, ids) },
        data: [[s.trainEnd, s.lastPrice], ...s.targetDates.map((d, i) => [d, s.mean[i]])],
      });
    }
    const legendSel: Record<string, boolean> = {};
    for (const s of snaps) legendSel[nm(s.modelId)] = defaultOn.has(s.modelId) || snaps.length <= 4;
    return {
      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : '—') },
      legend: { type: 'scroll', top: 0, textStyle: { color: tc }, selected: legendSel },
      grid: { left: 60, right: 20, top: 40, bottom: 60 },
      xAxis: { type: 'time', axisLabel: { color: tc } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: tc } },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 10 }],
      series: [
        ...series,
        {
          name: '回放時點',
          type: 'line',
          data: [],
          markLine: { symbol: 'none', silent: true, lineStyle: { color: '#ef4444', type: 'solid' }, label: { formatter: `回放日 ${data.date}`, color: tc }, data: [{ xAxis: data.date }] },
        },
      ],
    };
  }, [data, snaps, names, band, showAfter]);

  if (!symbol) return <p className="muted py-6 text-center text-sm">請先在上方篩選列選擇一個代號，即可回放該代號過去任一時點的預測。</p>;
  if (error && !dates.length) return <p className="py-6 text-center text-sm text-red-500">{error}</p>;
  if (!dates.length) return <p className="muted py-6 text-center text-sm">{symbol} 尚無可回放的快照。</p>;

  const bandSnap = snaps.find((s) => s.modelId === band);
  const bandOut = bandSnap ? (data?.outcomes?.[bandSnap.id] ?? []) : [];
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex flex-1 items-center gap-2" style={{ minWidth: 260 }}>
          <span className="whitespace-nowrap muted">回放日</span>
          <input type="range" min={0} max={dates.length - 1} value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="flex-1" aria-label="回放日期滑桿" />
          <b className="tabular-nums">{date}</b>
        </label>
        <button className="btn" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
          ◀ 前一日
        </button>
        <button className="btn" onClick={() => setIdx((i) => Math.min(dates.length - 1, i + 1))} disabled={idx >= dates.length - 1}>
          後一日 ▶
        </button>
        <label className="flex items-center gap-1">
          <span className="muted">區間陰影</span>
          <select className="input" value={band} onChange={(e) => setBand(e.target.value)}>
            {snaps.map((s) => (
              <option key={s.modelId} value={s.modelId}>
                {names[s.modelId] ?? s.modelId}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showAfter} onChange={(e) => setShowAfter(e.target.checked)} />
          疊上之後走勢
        </label>
        <button className="btn !py-0 text-xs" onClick={() => ref.current?.toPng(`replay-${symbol}-${date}.png`)}>
          匯出 PNG
        </button>
      </div>
      <div className="relative">
        {loading && <div className="absolute right-2 top-8 z-10 text-xs muted">載入中…</div>}
        {option && <EChart ref={ref} option={option as never} height={380} />}
      </div>
      {data && (
        <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
          <p className="muted">
            資料：價格 {data.source ?? '—'}（只取 ≤ {data.date} 的收盤為「當時已知」）；預測取自 {data.date} 當日結束前已寫入的快照（每模型最新一筆，共 {snaps.length} 筆）。{data.barsError}
          </p>
          {bandSnap && (
            <p>
              <Link href={`/snapshot/${bandSnap.id}`} className="underline">
                {names[bandSnap.modelId] ?? bandSnap.modelId} 快照
              </Link>
              ：寫入 {fmtTime(bandSnap.createdAt)}，最後已知價 {fmtNum(bandSnap.lastPrice)}；已回填 {bandOut.length}/{bandSnap.targetDates.length} 期，區間命中{' '}
              {fmtPct(bandOut.length ? bandOut.filter((o) => o.inInterval).length / bandOut.length : null)}，方向判對 {bandOut.filter((o) => o.directionCorrect).length}/{bandOut.filter((o) => o.directionCorrect !== null).length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
