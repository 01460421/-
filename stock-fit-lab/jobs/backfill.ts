/**
 * 實際值回填工作：對所有追蹤代號抓日線，把已到期目標日的實際收盤寫入 outcomes（快照永不修改）。
 */
import { backfillOutcomes } from '../lib/engine/backfill';
import { errMsg, makeEvent, resolveSymbols, runJob, type JobDeps, type JobMarket, type JobReport } from './common';

export interface BackfillJobOptions extends JobDeps {
  market?: JobMarket;
}

export async function runBackfillJob(opts: BackfillJobOptions = {}): Promise<JobReport> {
  return runJob('backfill', opts.market, opts, async (d, report) => {
    report.symbols = await resolveSymbols(d.store, opts.market, opts.symbols);
    // 另外納入有待回填快照、但已不在追蹤清單的代號
    const pending = await d.store.listSnapshots({ pendingOnly: true, limit: 5000 });
    for (const s of pending) if (!report.symbols.includes(s.symbol) && (!opts.market || (opts.market === 'US') === !/\.TWO?$/i.test(s.symbol))) report.symbols.push(s.symbol);
    for (const symbol of report.symbols) {
      try {
        const series = await d.marketData.getHistory(symbol, { interval: '1d' });
        const n = await backfillOutcomes(d.store, symbol, series.bars, { now: d.now });
        report.stats.outcomes = (report.stats.outcomes ?? 0) + n;
        report.ok.push(symbol);
      } catch (e) {
        report.failed.push({ symbol, error: errMsg(e) });
        await d.store.appendEvent(makeEvent(d.now, 'job_error', 'warn', `${symbol} 回填失敗`, { error: errMsg(e) }, symbol));
      }
    }
  });
}
