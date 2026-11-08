/**
 * 盤中輕量偵測（每 15 分鐘）：只在市場「盤中」時執行，不重擬合模型、不寫快照。
 * 以最新可得序列（優先 15 分 K，資料源不支援時退回日線）跑統計偵測器，只看最新 K 棒；
 * critical 命中推播通知。
 */
import type { DetectorHit, PriceSeries } from '../lib/types';
import { getMarketStatus } from '../lib/calendar';
import { runDetectors } from '../lib/detectors';
import { analysisUrl, errMsg, makeEvent, notifyAndLog, resolveSymbols, runJob, type JobDeps, type JobMarket, type JobReport, type ResolvedDeps } from './common';
import { checkAdapterHealth } from './close';

export interface IntradayJobOptions extends JobDeps {
  market?: JobMarket;
  /** 測試用：忽略交易時段檢查 */
  force?: boolean;
}

async function fetchIntraday(d: ResolvedDeps, symbol: string): Promise<PriceSeries> {
  try {
    const s = await d.marketData.getHistory(symbol, { interval: '15m' });
    if (s.bars.length >= 30) return s;
  } catch {
    /* 退回日線 */
  }
  return d.marketData.getHistory(symbol, { interval: '1d' });
}

/** 盤中只跑便宜的偵測器（殘差 z / CUSUM / 量能 / 波動跳升），關閉 PELT / BOCPD / HMM */
const LIGHT_CONFIG = { lookbackBars: 1, pelt: { enabled: false }, bocpd: { enabled: false }, hmm: { enabled: false }, pageHinkley: { enabled: false } };

export async function runIntradayJob(opts: IntradayJobOptions = {}): Promise<JobReport> {
  return runJob('intraday', opts.market, opts, async (d, report) => {
    const markets: JobMarket[] = opts.market ? [opts.market] : ['TW', 'US'];
    const open = markets.filter((m) => opts.force || getMarketStatus(m, d.now()).state === 'open');
    if (!open.length) {
      report.skipped = `非交易時段（${markets.map((m) => `${m}:${getMarketStatus(m, d.now()).label}`).join('、')}）`;
      return;
    }
    const symbols: string[] = [];
    for (const m of open) symbols.push(...(await resolveSymbols(d.store, m, opts.symbols)));
    report.symbols = [...new Set(symbols)];
    for (const symbol of report.symbols) {
      try {
        const series = await fetchIntraday(d, symbol);
        const hits: DetectorHit[] = runDetectors({ series, config: LIGHT_CONFIG });
        report.stats.detectorHits = (report.stats.detectorHits ?? 0) + hits.length;
        for (const h of hits) {
          await d.store.appendEvent(makeEvent(d.now, 'detector', h.severity, `${symbol}（盤中）${h.detector}：${h.message}`, { ...h, interval: series.interval, intraday: true }, symbol));
        }
        const critical = hits.filter((h) => h.severity === 'critical');
        if (critical.length) {
          await notifyAndLog(
            d,
            { title: `${symbol} 盤中異常（${critical.length} 項）`, body: critical.map((h) => `• ${h.detector}：${h.message}`).join('\n'), severity: 'critical', url: analysisUrl(symbol) },
            symbol,
          );
        }
        report.ok.push(symbol);
      } catch (e) {
        report.failed.push({ symbol, error: errMsg(e) });
        await d.store.appendEvent(makeEvent(d.now, 'job_error', 'warn', `${symbol} 盤中偵測失敗`, { error: errMsg(e) }, symbol));
      }
    }
    await checkAdapterHealth(d);
  });
}
