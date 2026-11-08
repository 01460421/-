/**
 * 收盤後全量工作（台股、美股收盤後各一次）：
 *   對所有追蹤代號：抓日線 → 全量重擬合 → 寫快照（trigger = 'schedule'）→ 回填實際值 →
 *   偵測器掃描（只看最新 K 棒）→ 寫事件 → 推播。
 * 推播條件：偵測器 critical、集成權重大幅重分配、預測與基準差距超過門檻、卡爾曼結構性變化、
 *   資料源連續失敗兩次（通知管理者）。
 */
import type { DetectorHit, PriceSeries } from '../lib/types';
import type { CorporateEvent } from '../lib/data-adapters/types';
import { analyze } from '../lib/engine/correction';
import { buildSnapshots, writeSnapshots } from '../lib/engine/snapshot';
import { backfillOutcomes } from '../lib/engine/backfill';
import { scorecard } from '../lib/engine/accuracy';
import { resolveConfig, type AnalysisResult, type EngineConfig } from '../lib/engine/types';
import { runDetectors } from '../lib/detectors';
import { analysisUrl, errMsg, makeEvent, notifyAndLog, resolveSymbols, runJob, type JobDeps, type JobMarket, type JobReport, type ResolvedDeps } from './common';

export interface CloseJobOptions extends JobDeps {
  market?: JobMarket;
  config?: Partial<EngineConfig>;
}

const envNum = (k: string, d: number) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v > 0 ? v : d;
};

/** ½·Σ|w_new − w_old| */
export function weightShift(a: Record<string, number> | undefined, b: Record<string, number>): number {
  if (!a) return 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let s = 0;
  for (const k of keys) s += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return s / 2;
}

/** 同一代號上一次排程失敗後尚未成功過 → 本次失敗即為「連續第二次」 */
async function isConsecutiveFailure(d: ResolvedDeps, symbol: string): Promise<boolean> {
  const [lastErr] = await d.store.listEvents({ symbol, kind: 'data_source_error', limit: 1 });
  if (!lastErr) return false;
  const [lastSnap] = await d.store.listSnapshots({ symbol, limit: 1 });
  return !lastSnap || lastSnap.createdAt < lastErr.at;
}

async function processSymbol(d: ResolvedDeps, symbol: string, cfg: EngineConfig, report: JobReport) {
  let series: PriceSeries;
  try {
    series = await d.marketData.getHistory(symbol, { interval: '1d' });
    if (!series.bars.length) throw new Error('資料源回傳空序列');
  } catch (e) {
    const consecutive = await isConsecutiveFailure(d, symbol);
    await d.store.appendEvent(makeEvent(d.now, 'data_source_error', consecutive ? 'critical' : 'warn', `${symbol} 抓取日線失敗`, { error: errMsg(e), consecutive }, symbol));
    if (consecutive) {
      await notifyAndLog(d, { title: `【管理者】${symbol} 資料源連續失敗`, body: `${symbol} 已連續兩次以上無法取得日線資料：${errMsg(e)}`, severity: 'critical', url: '/admin' }, symbol);
    }
    throw e;
  }

  // 上一筆集成快照（比較權重重分配）
  const [prevEns] = await d.store.listSnapshots({ symbol, modelId: 'ensemble', limit: 1 });

  const result: AnalysisResult = await analyze(series, cfg, { now: d.now });
  const snaps = buildSnapshots(result, { trigger: 'schedule', now: d.now });
  await writeSnapshots(d.store, snaps);
  const outcomes = await backfillOutcomes(d.store, symbol, series.bars, { now: d.now });
  report.stats.snapshots = (report.stats.snapshots ?? 0) + snaps.length;
  report.stats.outcomes = (report.stats.outcomes ?? 0) + outcomes;
  if (series.stale) report.stats.stale = (report.stats.stale ?? 0) + 1;

  // 偵測器：殘差（尾端對齊最新 K 棒的模型）+ 集成一步誤差（Page–Hinkley 模型漂移）
  let events: CorporateEvent[] = [];
  try {
    events = await d.marketData.getEvents(symbol);
  } catch {
    events = [];
  }
  const residuals: Record<string, number[]> = {};
  for (const id of result.order) {
    const r = result.results[id];
    if (r?.ok && r.fittedTo === result.lastDate && r.residuals.length) residuals[id] = r.residuals;
  }
  const modelErrors: Record<string, number[]> = {};
  try {
    const ens = (await d.store.listSnapshots({ symbol, modelId: 'ensemble', limit: 200 })).reverse();
    const outs = await d.store.listOutcomes(ens.map((s) => s.id));
    const errs = outs
      .filter((o) => o.horizonIndex === 0)
      .sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1))
      .map((o) => Math.abs(o.error));
    if (errs.length >= 10) modelErrors.ensemble = errs;
  } catch {
    /* 無歷史誤差 */
  }
  let hits: DetectorHit[] = [];
  try {
    hits = runDetectors({ series, residuals, modelErrors, events, config: { lookbackBars: 1 } });
  } catch (e) {
    await d.store.appendEvent(makeEvent(d.now, 'job_error', 'warn', `${symbol} 偵測器執行失敗`, { error: errMsg(e) }, symbol));
  }
  report.stats.detectorHits = (report.stats.detectorHits ?? 0) + hits.length;
  for (const h of hits) {
    await d.store.appendEvent(makeEvent(d.now, 'detector', h.severity, `${symbol} ${h.detector}：${h.message}`, { ...h }, symbol));
  }
  const critical = hits.filter((h) => h.severity === 'critical');
  if (critical.length) {
    await notifyAndLog(
      d,
      {
        title: `${symbol} 偵測器觸發（${critical.length} 項嚴重）`,
        body: critical.map((h) => `• ${h.detector}：${h.message}${h.overlapsEvent ? `（與事件重疊：${h.overlapsEvent}）` : ''}`).join('\n'),
        severity: 'critical',
        url: analysisUrl(symbol),
      },
      symbol,
    );
  }

  // 卡爾曼結構性變化（最新一步觸發）
  const lastAlert = result.kalmanAlerts[result.kalmanAlerts.length - 1];
  const lastStep = result.kalmanTrace[result.kalmanTrace.length - 1]?.step;
  if (lastAlert && lastStep !== undefined && lastAlert.step === lastStep) {
    await d.store.appendEvent(makeEvent(d.now, 'structural_break', 'warn', `${symbol} 結構性變化警示`, { ...lastAlert, date: result.lastDate }, symbol));
    await notifyAndLog(d, { title: `${symbol} 結構性變化警示`, body: lastAlert.message, severity: 'warn', url: analysisUrl(symbol) }, symbol);
  }

  // 集成權重大幅重分配
  const shift = weightShift(prevEns?.ensembleWeights, result.ensembleWeights);
  const zeroed = Object.entries(result.weightStatus).filter(([, s]) => s.zeroed);
  if (shift >= envNum('WEIGHT_SHIFT_ALERT', 0.25)) {
    await d.store.appendEvent(makeEvent(d.now, 'weight_shift', 'warn', `${symbol} 集成權重重分配 ${(shift * 100).toFixed(0)}%`, { shift, previous: prevEns?.ensembleWeights, weights: result.ensembleWeights }, symbol));
    await notifyAndLog(
      d,
      {
        title: `${symbol} 集成權重大幅重分配`,
        body: `權重變動 ${(shift * 100).toFixed(0)}%。目前權重：${Object.entries(result.ensembleWeights)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
          .join('、')}${zeroed.length ? `；暫時歸零：${zeroed.map(([k]) => k).join('、')}` : ''}`,
        severity: 'warn',
        url: analysisUrl(symbol),
      },
      symbol,
    );
  }

  // 預測與基準差距
  const ens = result.results.ensemble;
  const naive = result.benchmarks.naive?.[result.horizon - 1];
  if (ens?.ok && ens.forecast && naive) {
    const gap = ens.forecast.mean[result.horizon - 1] / naive - 1;
    const thr = envNum('FORECAST_GAP_ALERT_PCT', 15) / 100;
    if (Math.abs(gap) >= thr) {
      await notifyAndLog(
        d,
        {
          title: `${symbol} 集成預測與 naive 基準差距 ${(gap * 100).toFixed(1)}%`,
          body: `${result.horizon} 日後集成預測 ${ens.forecast.mean[result.horizon - 1].toFixed(2)}，naive 基準 ${naive.toFixed(2)}（門檻 ±${(thr * 100).toFixed(0)}%）。數學擬合結果，請對照歷史準度。`,
          severity: 'warn',
          url: analysisUrl(symbol),
        },
        symbol,
      );
    }
  }

  // 疑似資料洩漏旗標（只用已回填快照）
  try {
    const rows = await scorecard(d.store, { symbol, period: '3m', now: d.now() });
    for (const r of rows.filter((x) => x.leakSuspect && x.hidden)) {
      await d.store.appendEvent(
        makeEvent(d.now, 'leak_suspect', 'warn', `${symbol} ${r.modelId} h=${r.horizon} 疑似資料洩漏（稽核前隱藏）`, { modelId: r.modelId, horizon: r.horizon, n: r.n }, symbol),
      );
    }
  } catch {
    /* 忽略 */
  }
}

export async function runCloseJob(opts: CloseJobOptions = {}): Promise<JobReport> {
  return runJob('close', opts.market, opts, async (d, report) => {
    const cfg = resolveConfig(opts.config);
    report.symbols = await resolveSymbols(d.store, opts.market, opts.symbols);
    for (const symbol of report.symbols) {
      try {
        await processSymbol(d, symbol, cfg, report);
        report.ok.push(symbol);
      } catch (e) {
        report.failed.push({ symbol, error: errMsg(e) });
        await d.store.appendEvent(makeEvent(d.now, 'job_error', 'warn', `${symbol} 收盤工作失敗`, { error: errMsg(e) }, symbol));
      }
    }
    await checkAdapterHealth(d);
  });
}

/** 資料源健康：任一 adapter 連續失敗 ≥ 2 次即通知管理者 */
export async function checkAdapterHealth(d: ResolvedDeps): Promise<void> {
  let health: ReturnType<ResolvedDeps['marketData']['health']> = [];
  try {
    health = d.marketData.health();
  } catch {
    return;
  }
  const recent = await d.store.listEvents({ kind: 'data_source_error', from: new Date(d.now().getTime() - 6 * 3600_000).toISOString(), limit: 200 });
  for (const h of health.filter((x) => x.consecutiveFailures >= 2)) {
    // 6 小時內已通知過同一資料源則不重複推播
    if (recent.some((e) => !e.symbol && (e.detail as { adapterId?: string }).adapterId === h.adapterId)) continue;
    await d.store.appendEvent(makeEvent(d.now, 'data_source_error', 'critical', `資料源 ${h.adapterId} 連續失敗 ${h.consecutiveFailures} 次`, { ...h }));
    await notifyAndLog(d, {
      title: `【管理者】資料源 ${h.adapterId} 連續失敗 ${h.consecutiveFailures} 次`,
      body: `最近錯誤：${h.lastError ?? '未知'}；最後成功：${h.lastSuccessAt ?? '無'}；呼叫 ${h.calls} 次、失敗 ${h.failures} 次。`,
      severity: 'critical',
      url: '/admin',
    });
  }
}
