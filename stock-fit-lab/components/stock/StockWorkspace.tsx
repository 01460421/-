'use client';
/**
 * 單檔分析頁主體（規格第六節）。狀態 ↔ URL 深連結（replaceState）、呼叫 /api/analyze（300 ms 防抖）、
 * 盤中輪詢（只在市場開盤時）、主圖 / 殘差 / 即時修正 / 基準對照 / 方向 / 詳細資料 / AI / 側欄。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ResidualPanel from '@/components/ResidualPanel';
import ModelDrawer from '@/components/ModelDrawer';
import TradingViewWidget from '@/components/TradingViewWidget';
import type { BenchmarkId, ModelDescription, ModelId } from '@/lib/types';
import type { LayerToggles } from '@/lib/engine/types';
import { buildDeepLink, type DeepLinkModel } from '@/lib/integrations/deeplink';
import { MODEL_MAIN_PARAM } from '@/lib/integrations/deeplink';
import { getMarketStatus } from '@/lib/calendar';
import { buildContext, type WalkForwardSummaryRow } from '@/lib/ai/context';
import type { AnalyzePayload, ChartCommand, MarkRange, ModelMetaLite, RangeKey, Subplot, WalkForwardResponse } from './types';
import { RANGE_OPTIONS } from './types';
import MainChart, { type MainChartHandle } from './MainChart';
import ModelControls from './ModelControls';
import DirectionCard from './DirectionCard';
import CorrectionTimeline from './CorrectionTimeline';
import BenchmarkTable from './BenchmarkTable';
import DataTabs from './DataTabs';
import LinksPanel from './LinksPanel';
import WatchlistPanel from './WatchlistPanel';
import AiPanel from './AiPanel';
import { resolveSubplot } from './datasets';
import { downloadBlob, fetchJson, fmtNum, fmtTime, toCsv } from './util';

export interface InitialState {
  symbol: string;
  name?: string;
  market: 'TW' | 'TWO' | 'US';
  tvSymbol: string | null;
  range: RangeKey;
  horizon: number;
  window: number;
  lambda: number;
  priceMode: 'raw' | 'log';
  models: ModelId[];
  visible: ModelId[];
  params: Partial<Record<ModelId, Record<string, number>>>;
  advanced: boolean;
  warnings: string[];
}

const DEFAULT_LAYERS: LayerToggles = { rollingRefit: true, rls: true, kalman: true, ensembleReweight: true };
const REFRESH_OPTIONS = [
  { v: 0, label: '不自動更新' },
  { v: 30, label: '30 秒' },
  { v: 60, label: '60 秒' },
  { v: 120, label: '2 分鐘' },
  { v: 300, label: '5 分鐘' },
];
const BENCH_OPTIONS: { id: BenchmarkId; label: string }[] = [
  { id: 'naive', label: 'Naive' },
  { id: 'drift', label: '漂移' },
  { id: 'sma20', label: 'SMA20' },
  { id: 'sma60', label: 'SMA60' },
  { id: 'custom', label: '自訂' },
];

export default function StockWorkspace({ initial, meta }: { initial: InitialState; meta: ModelMetaLite[] }) {
  const symbol = initial.symbol;
  // ───── 計算相關狀態 ─────
  const [range, setRange] = useState<RangeKey>(initial.range);
  const [horizon, setHorizon] = useState(initial.horizon);
  const [hLocal, setHLocal] = useState(initial.horizon);
  const [winN, setWinN] = useState(initial.window);
  const [lambda, setLambda] = useState(initial.lambda);
  const [priceMode, setPriceMode] = useState(initial.priceMode);
  const [advanced, setAdvanced] = useState(initial.advanced);
  const [enabled, setEnabled] = useState<ModelId[]>(initial.models);
  const [visible, setVisible] = useState<ModelId[]>(initial.visible);
  const [layers, setLayers] = useState<LayerToggles>(DEFAULT_LAYERS);
  const [params, setParams] = useState(initial.params);
  const [customTarget, setCustomTarget] = useState<number | null>(null);
  const [thresholds, setThresholds] = useState({ upper: 0.65, lower: 0.35 });
  // ───── 結果 ─────
  const [payload, setPayload] = useState<AnalyzePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [wf, setWf] = useState<WalkForwardResponse | null>(null);
  // ───── 圖表顯示 ─────
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [timescale, setTimescale] = useState<'day' | 'week' | 'month'>('day');
  const [bandModel, setBandModel] = useState<ModelId | 'all' | 'none'>(initial.visible.includes('ensemble') ? 'ensemble' : initial.visible[0] ?? 'none');
  const [benchShown, setBenchShown] = useState<BenchmarkId[]>(['naive', 'sma20']);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [marks, setMarks] = useState<MarkRange[]>([]);
  const [subplots, setSubplots] = useState<Subplot[]>([]);
  const [showDetectors, setShowDetectors] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [selection, setSelection] = useState<{ from: string; to: string } | null>(null);
  const [drawer, setDrawer] = useState<ModelDescription | null>(null);
  const [refreshSec, setRefreshSec] = useState(60);
  const [alerts, setAlerts] = useState<{ key: string; text: string }[]>([]);
  const [chartMsg, setChartMsg] = useState<string | null>(null);
  const chartRef = useRef<MainChartHandle>(null);
  const reqId = useRef(0);
  const prevHits = useRef<Set<string> | null>(null);

  const config = useMemo(
    () => ({
      window: winN,
      lambda,
      horizon,
      priceMode,
      models: enabled.length ? enabled : (['ensemble'] as ModelId[]),
      params,
      layers,
      customBenchmark: customTarget ? { targetPrice: customTarget, steps: horizon, mode: 'linear' as const, label: '自訂目標價' } : null,
    }),
    [winN, lambda, horizon, priceMode, enabled, params, layers, customTarget],
  );

  const run = useCallback(
    async (reason: 'config' | 'poll' | 'manual') => {
      const id = ++reqId.current;
      if (reason !== 'poll') setLoading(true);
      try {
        const d = await fetchJson<AnalyzePayload>('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, config, range, snapshot: true, thresholds }),
        });
        if (id !== reqId.current) return;
        // 主動推送：輪詢時偵測到新的偵測器命中
        const keys = new Set(d.detectorHits.map((h) => `${h.date}|${h.detector}|${h.message}`));
        if (reason === 'poll' && prevHits.current) {
          const fresh = d.detectorHits.filter((h) => !prevHits.current!.has(`${h.date}|${h.detector}|${h.message}`));
          if (fresh.length) setAlerts((a) => [...a, ...fresh.map((h) => ({ key: `${h.date}|${h.detector}|${h.message}`, text: `${h.date} ${h.detector}：${h.message}` }))].slice(-30));
        }
        prevHits.current = keys;
        setPayload(d);
        setError(null);
        setLastFetch(new Date().toISOString());
        setRefreshKey((k) => k + 1);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    // thresholds 只影響伺服器端的預設閘門顯示，不需因其變化重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol, config, range],
  );

  // 設定變更 → 300 ms 防抖重算
  useEffect(() => {
    const t = setTimeout(() => run('config'), 300);
    return () => clearTimeout(t);
  }, [run]);

  // 盤中輪詢（只在市場開盤時）
  const market = payload?.result.market ?? initial.market;
  useEffect(() => {
    if (!refreshSec) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (getMarketStatus(market).state !== 'open') return;
      run('poll');
    }, refreshSec * 1000);
    return () => clearInterval(t);
  }, [refreshSec, market, run]);

  // 狀態 → URL（replaceState，方便分享 / 反向連回）
  useEffect(() => {
    const models: DeepLinkModel[] = visible
      .filter((id) => enabled.includes(id))
      .map((id) => {
        const k = MODEL_MAIN_PARAM[id];
        const v = k ? params[id]?.[k] : undefined;
        return v !== undefined ? { id, param: v, paramKey: k } : { id };
      });
    const url = buildDeepLink({ symbol, models, h: horizon, window: winN, lambda, range, priceMode });
    const full = advanced ? `${url}${url.includes('?') ? '&' : '?'}advanced=1` : url;
    if (full !== window_location()) history.replaceState(null, '', full);
  }, [symbol, visible, enabled, params, horizon, winN, lambda, range, priceMode, advanced]);

  // ───── AI 情境與圖表指令 ─────
  const wfSummary = useMemo<WalkForwardSummaryRow[] | undefined>(
    () =>
      wf?.rows.map((r) => ({
        model: r.model,
        horizon: r.horizon,
        hidden: r.hidden,
        theilU: r.metrics?.theilU ?? null,
        rmse: r.metrics?.rmse ?? null,
        directionAccuracy: r.metrics?.directionAccuracy ?? null,
        coverage: r.metrics?.coverage ?? null,
        rmseImprovementPct: r.vsNaive?.metrics.rmse?.relImprovementPct ?? null,
      })),
    [wf],
  );
  const getContext = useCallback(
    (sel?: { from: string; to: string } | null) => {
      if (!payload) return null;
      return buildContext(payload, { range, enabledModels: enabled, selection: sel ?? selection, thresholds, advanced }, { walkforward: wfSummary }) as unknown as Record<string, unknown>;
    },
    [payload, range, enabled, selection, thresholds, advanced, wfSummary],
  );

  const onChartCommand = useCallback(
    async (c: ChartCommand) => {
      try {
        if (c.action === 'mark_range' && c.from && c.to) {
          setMarks((m) => [...m, { from: c.from! <= c.to! ? c.from! : c.to!, to: c.from! <= c.to! ? c.to! : c.from!, label: c.label ?? 'AI 標註' }].slice(-8));
          setChartMsg(`AI 已標註 ${c.from} ~ ${c.to}`);
        } else if (c.action === 'highlight_model' && c.model) {
          const id = c.model as ModelId;
          if (!visible.includes(id) && enabled.includes(id)) setVisible((v) => [...v, id]);
          setHighlight(id);
          setChartMsg(`AI 已高亮 ${id}`);
        } else if (c.action === 'set_timescale' && c.timescale) {
          setTimescale(c.timescale);
          setChartMsg(`AI 已切換為${c.timescale === 'day' ? '日' : c.timescale === 'week' ? '週' : '月'}線`);
        } else if (c.action === 'add_subplot' && c.series) {
          const s = await resolveSubplot(symbol, c.series);
          if (s) setSubplots((p) => (p.some((x) => x.id === s.id) ? p : [...p, s].slice(-3)));
          setChartMsg(s ? `AI 已加入子圖：${s.label}` : '成交量已在子圖中');
        }
      } catch (e) {
        setChartMsg(`圖表指令失敗：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [symbol, visible, enabled],
  );

  useEffect(() => {
    if (!chartMsg) return;
    const t = setTimeout(() => setChartMsg(null), 5000);
    return () => clearTimeout(t);
  }, [chartMsg]);

  // ───── 匯出 ─────
  const exportJson = () => {
    if (!payload) return;
    downloadBlob(JSON.stringify({ symbol, meta: payload.meta, generatedAt: payload.result.generatedAt, config: payload.result.config, targetDates: payload.result.targetDates, results: payload.result.results, benchmarks: payload.result.benchmarks, ensembleWeights: payload.result.ensembleWeights, direction: payload.direction, detectorHits: payload.detectorHits }, null, 1), `${symbol}_analysis_${payload.result.lastDate}.json`, 'application/json');
  };
  const exportForecastCsv = () => {
    if (!payload) return;
    const r = payload.result;
    const ids = r.order.filter((id) => r.results[id]?.forecast);
    const head = ['targetDate', ...ids.flatMap((id) => [`${id}_mean`, `${id}_lower`, `${id}_upper`, `${id}_pUp`]), ...Object.keys(r.benchmarks).map((b) => `bench_${b}`)];
    const rows = r.targetDates.map((d, i) => [d, ...ids.flatMap((id) => { const f = r.results[id]!.forecast!; return [f.mean[i], f.lower[i], f.upper[i], r.results[id]!.pUp[i]]; }), ...Object.values(r.benchmarks).map((v) => v?.[i])]);
    downloadBlob(toCsv(head, rows), `${symbol}_forecast_${r.lastDate}.csv`, 'text/csv;charset=utf-8');
  };
  const exportMetricsCsv = () => {
    if (!payload) return;
    const r = payload.result;
    const head = ['model', 'name', 'version', 'ok', 'updatedBy', 'weight', 'zeroed', 'zeroReason', 'rollingDirAcc', 'pUp_h', 'forecast_end', 'lower_end', 'upper_end', 'inSampleRMSE', 'params'];
    const rows = r.order.map((id) => {
      const x = r.results[id]!;
      const ws = r.weightStatus[id];
      const rr = x.residuals.filter(Number.isFinite);
      const f = x.forecast;
      return [id, x.name, x.version, x.ok, x.updatedBy, r.ensembleWeights[id], ws?.zeroed, ws?.reason, ws?.rollingDirAcc, x.direction?.pUp, f?.mean.at(-1), f?.lower.at(-1), f?.upper.at(-1), rr.length ? Math.sqrt(rr.reduce((a, b) => a + b * b, 0) / rr.length) : '', x.description?.params];
    });
    downloadBlob(toCsv(head, rows), `${symbol}_metrics_${r.lastDate}.csv`, 'text/csv;charset=utf-8');
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setChartMsg('已複製分享連結');
    } catch {
      setChartMsg(location.href);
    }
  };

  const residuals = useMemo(() => {
    if (!payload) return {} as Record<string, number[]>;
    const out: Record<string, number[]> = {};
    const r = payload.result;
    for (const id of r.order) {
      const x = r.results[id];
      if (x?.ok && x.residuals.length && x.fittedTo === r.lastDate) out[id] = x.residuals;
    }
    return out;
  }, [payload]);

  const res = payload?.result;
  const status = payload?.marketStatus;
  const ensemble = res?.results.ensemble;
  const lastClose = payload?.ohlc.close.at(-1);
  const prevClose = payload?.ohlc.close.at(-2);
  const chg = lastClose !== undefined && prevClose ? lastClose - prevClose : null;

  return (
    <div className="space-y-3">
      {/* ───── 頂部列 ───── */}
      <section className="panel space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="text-xl font-semibold">
            {symbol} <span className="text-base font-normal muted">{initial.name}</span>
          </h1>
          {lastClose !== undefined && (
            <span className="text-lg font-semibold tabular-nums" style={{ color: chg === null ? undefined : chg >= 0 ? '#e5484d' : '#30a46c' }}>
              {fmtNum(lastClose)} {chg !== null && <span className="text-sm">{chg >= 0 ? '▲' : '▼'} {fmtNum(Math.abs(chg))}（{fmtNum((chg / prevClose!) * 100)}%）</span>}
            </span>
          )}
          {status && (
            <span className={`chip ${status.state === 'open' ? 'border-red-400 text-red-600' : ''}`} title={`交易時段（台北時間）${status.taipeiSession}`}>
              {status.state === 'open' && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
              {status.label} · 台北 {status.taipeiSession}
            </span>
          )}
          {payload && (
            <span className="text-xs muted">
              資料來源 <b>{payload.meta.source}</b> · 資料時間 {fmtTime(payload.meta.asOf)} · {payload.meta.delayMinutes ? `延遲 ${payload.meta.delayMinutes} 分鐘` : '收盤資料'}
              {payload.meta.adjusted ? ' · 還原價' : ''}
              {payload.meta.filled ? ` · ${payload.meta.filled} 筆缺值已填補` : ''} · 更新於 {fmtTime(lastFetch)}
            </span>
          )}
          {payload?.meta.stale && <span className="chip border-amber-500 text-amber-600">⚠ 快取資料（資料源暫時無法連線）</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            區間
            <select className="input" value={range} onChange={(e) => setRange(e.target.value as RangeKey)} aria-label="顯示區間">
              {RANGE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            預測期數 h = <b className="w-6 tabular-nums">{hLocal}</b>
            <input
              type="range"
              min={1}
              max={60}
              value={hLocal}
              onChange={(e) => setHLocal(Number(e.target.value))}
              onMouseUp={() => setHorizon(hLocal)}
              onTouchEnd={() => setHorizon(hLocal)}
              onKeyUp={() => setHorizon(hLocal)}
              aria-label="預測期數 h"
            />
          </label>
          <label className="flex items-center gap-1">
            更新頻率
            <select className="input" value={refreshSec} onChange={(e) => setRefreshSec(Number(e.target.value))} aria-label="更新頻率">
              {REFRESH_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }} role="group" aria-label="價格模式">
            {(['raw', 'log'] as const).map((m) => (
              <button key={m} className={`px-2 py-1 text-xs ${priceMode === m ? 'bg-blue-600 text-white' : ''}`} onClick={() => setPriceMode(m)}>
                {m === 'raw' ? '原始價' : '對數價'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={advanced}
              onChange={(e) => {
                setAdvanced(e.target.checked);
                if (!e.target.checked) {
                  const basic = new Set(meta.filter((m) => !m.advanced).map((m) => m.id));
                  setEnabled((x) => x.filter((id) => basic.has(id)));
                  setVisible((x) => x.filter((id) => basic.has(id)));
                }
              }}
            />
            進階模式
          </label>
          <button className="btn text-xs" onClick={() => run('manual')} disabled={loading}>
            {loading ? '計算中…' : '↻ 重新整理'}
          </button>
          <button className="btn text-xs" onClick={copyLink}>
            🔗 複製分享連結
          </button>
          <span className="text-[11px] muted">{refreshSec ? (status?.state === 'open' ? `盤中每 ${refreshSec} 秒輪詢` : '非交易時段，暫停輪詢') : '自動更新已關閉'}</span>
        </div>
        {initial.warnings.length > 0 && <p className="text-xs text-amber-600">連結參數：{initial.warnings.join('；')}</p>}
      </section>

      {error && (
        <div className="panel border-red-400/60 bg-red-500/5 text-sm">
          <b className="text-red-600">{payload ? '更新失敗，以下顯示上一次成功的結果：' : '分析失敗：'}</b> {error}
          <button className="btn ml-2 text-xs" onClick={() => run('manual')}>
            重試
          </button>
        </div>
      )}
      {payload?.warnings.length ? (
        <details className="text-xs text-amber-700 dark:text-amber-400">
          <summary className="cursor-pointer">系統提示（{payload.warnings.length}）</summary>
          <ul className="ml-4 list-disc">
            {payload.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ───── 左欄 ───── */}
        <div className="min-w-0 space-y-3">
          <section className="panel space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }} role="group" aria-label="圖表類型">
                {(['candle', 'line'] as const).map((t) => (
                  <button key={t} className={`px-2 py-1 ${chartType === t ? 'bg-blue-600 text-white' : ''}`} onClick={() => setChartType(t)}>
                    {t === 'candle' ? 'K 線' : '收盤線'}
                  </button>
                ))}
              </div>
              <div className="flex overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }} role="group" aria-label="時間尺度">
                {(['day', 'week', 'month'] as const).map((t) => (
                  <button key={t} className={`px-2 py-1 ${timescale === t ? 'bg-blue-600 text-white' : ''}`} onClick={() => setTimescale(t)}>
                    {t === 'day' ? '日' : t === 'week' ? '週' : '月'}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1">
                信賴區間
                <select className="input text-xs" value={bandModel} onChange={(e) => setBandModel(e.target.value as ModelId | 'all' | 'none')} aria-label="信賴區間">
                  <option value="none">不顯示</option>
                  <option value="all">全部顯示中模型</option>
                  {visible.map((id) => (
                    <option key={id} value={id}>
                      {res?.results[id]?.name ?? id}
                    </option>
                  ))}
                </select>
              </label>
              <span className="muted">基準：</span>
              {BENCH_OPTIONS.filter((b) => b.id !== 'custom' || customTarget).map((b) => (
                <label key={b.id} className="flex items-center gap-0.5">
                  <input type="checkbox" checked={benchShown.includes(b.id)} onChange={() => setBenchShown((s) => (s.includes(b.id) ? s.filter((x) => x !== b.id) : [...s, b.id]))} />
                  {b.label}
                </label>
              ))}
              <label className="flex items-center gap-0.5">
                <input type="checkbox" checked={showDetectors} onChange={(e) => setShowDetectors(e.target.checked)} />
                偵測器
              </label>
              <label className="flex items-center gap-0.5">
                <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />
                事件
              </label>
              <span className="ml-auto flex flex-wrap gap-1">
                <button className="btn text-xs" onClick={() => chartRef.current?.toPng(`${symbol}_chart.png`)} disabled={!payload}>
                  PNG
                </button>
                <button className="btn text-xs" onClick={exportForecastCsv} disabled={!payload}>
                  預測 CSV
                </button>
                <button className="btn text-xs" onClick={exportMetricsCsv} disabled={!payload}>
                  指標 CSV
                </button>
                <button className="btn text-xs" onClick={exportJson} disabled={!payload}>
                  JSON
                </button>
              </span>
            </div>
            {(highlight || marks.length > 0 || subplots.length > 0 || selection) && (
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {highlight && (
                  <button className="chip" onClick={() => setHighlight(null)}>
                    高亮：{highlight} ×
                  </button>
                )}
                {marks.map((m, i) => (
                  <button key={i} className="chip" onClick={() => setMarks((x) => x.filter((_, j) => j !== i))}>
                    標註 {m.label}（{m.from}~{m.to}）×
                  </button>
                ))}
                {subplots.map((s) => (
                  <button key={s.id} className="chip" onClick={() => setSubplots((x) => x.filter((y) => y.id !== s.id))} title={s.source}>
                    子圖：{s.label} ×
                  </button>
                ))}
                {selection && (
                  <>
                    <span className="chip border-blue-400">框選 {selection.from} ~ {selection.to}</span>
                    <button className="chip" onClick={() => setMarks((m) => [...m, { ...selection, label: '框選' }].slice(-8))}>
                      ＋ 保留為標註
                    </button>
                  </>
                )}
              </div>
            )}
            {chartMsg && <p className="text-xs text-blue-600">{chartMsg}</p>}
            {payload ? (
              <div className={loading ? 'opacity-70 transition-opacity' : ''}>
                <MainChart
                  ref={chartRef}
                  payload={payload}
                  visibleModels={visible.filter((id) => enabled.includes(id))}
                  chartType={chartType}
                  benchmarks={benchShown}
                  bandModel={bandModel}
                  highlight={highlight}
                  marks={marks}
                  timescale={timescale}
                  subplots={subplots}
                  showDetectors={showDetectors}
                  showEvents={showEvents}
                  onBrush={setSelection}
                />
                <p className="text-[11px] muted">
                  實線＝樣本內擬合（訓練視窗 {res?.trainStart} ~ {res?.trainEnd}，N = {res?.trainSize}）；虛線＝未來 {res?.horizon} 期預測；陰影＝{Math.round((res?.level ?? 0.9) * 100)}% 信賴區間；▲＝偵測器命中；紫色虛線＝公司事件。滑鼠移到預測點可看公式代入值；工具列「區間框選」後可在右側問 AI。計算耗時 {payload.elapsedMs} ms
                  {payload.snapshot.written ? ` · 已寫入 ${payload.snapshot.written} 筆快照` : payload.snapshot.skippedReason ? ` · ${payload.snapshot.skippedReason}` : ''}。
                </p>
              </div>
            ) : (
              <div className="h-[560px] animate-pulse rounded bg-gray-500/10" aria-label="載入中" />
            )}
            {initial.tvSymbol && <TradingViewWidget tvSymbol={initial.tvSymbol} />}
          </section>

          <ModelControls
            payload={payload}
            meta={meta}
            advanced={advanced}
            enabled={enabled}
            visible={visible}
            layers={layers}
            window={winN}
            lambda={lambda}
            params={params}
            customTarget={customTarget}
            onEnabled={(ids) => {
              setEnabled(ids);
              setVisible((v) => [...v.filter((x) => ids.includes(x)), ...ids.filter((x) => !enabled.includes(x))]);
            }}
            onVisible={setVisible}
            onLayers={setLayers}
            onWindow={setWinN}
            onLambda={setLambda}
            onParams={setParams}
            onCustomTarget={(v) => {
              setCustomTarget(v);
              if (v) setBenchShown((s) => (s.includes('custom') ? s : [...s, 'custom']));
            }}
            onOpenDrawer={setDrawer}
          />

          {payload && Object.keys(residuals).length > 0 && <ResidualPanel key={`${symbol}-${refreshKey > 0 ? 'r' : ''}`} dates={payload.result.history.dates} residuals={residuals} />}
          {payload && <CorrectionTimeline payload={payload} refreshKey={refreshKey} />}
          <BenchmarkTable symbol={symbol} models={enabled} window={winN} lambda={lambda} priceMode={priceMode} params={params} data={wf} onData={setWf} />
          <DataTabs symbol={symbol} market={market} onAddSubplot={(s) => setSubplots((p) => (p.some((x) => x.id === s.id) ? p : [...p, s].slice(-3)))} activeSubplots={subplots.map((s) => s.id)} />
        </div>

        {/* ───── 右側欄 ───── */}
        <aside className="min-w-0 space-y-3">
          {payload ? <DirectionCard payload={payload} thresholds={thresholds} onThresholds={setThresholds} /> : <div className="panel h-64 animate-pulse" />}
          {ensemble?.forecast && res && (
            <section className="panel text-xs">
              <div className="mb-1 font-medium">集成預測（{res.targetDates.at(-1)}）</div>
              <div className="tabular-nums">
                {fmtNum(ensemble.forecast.mean.at(-1))} <span className="muted">（{Math.round(ensemble.forecast.level * 100)}% 區間 {fmtNum(ensemble.forecast.lower.at(-1))} ~ {fmtNum(ensemble.forecast.upper.at(-1))}）</span>
              </div>
              <div className="muted">
                Naive {fmtNum(res.benchmarks.naive?.at(-1))} · 漂移 {fmtNum(res.benchmarks.drift?.at(-1))} · SMA20 {fmtNum(res.benchmarks.sma20?.at(-1))} · 來源 {payload?.meta.source}，{fmtTime(payload?.meta.asOf)}
              </div>
            </section>
          )}
          <AiPanel symbol={symbol} getContext={getContext} config={config} selection={selection} alerts={alerts} onChartCommand={onChartCommand} />
          <LinksPanel symbol={symbol} />
          <WatchlistPanel symbol={symbol} name={initial.name} />
        </aside>
      </div>

      {drawer && <ModelDrawer desc={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function window_location(): string {
  return typeof location === 'undefined' ? '' : location.pathname + location.search;
}
