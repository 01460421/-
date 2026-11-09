/**
 * 排程 CLI：tsx jobs/run.ts close|intraday|backfill [TW|US]
 * （外部排程器或本機手動執行；Vercel 上改由 /api/cron/* 觸發）
 */
import { runCloseJob } from './close';
import { runIntradayJob } from './intraday';
import { runBackfillJob } from './backfill';
import { parseMarket, type JobReport } from './common';

export async function runFromArgs(argv: string[]): Promise<JobReport> {
  const [job, marketArg] = argv;
  const market = parseMarket(marketArg);
  if (marketArg && !market) throw new Error(`未知市場：${marketArg}（可用 TW / US）`);
  switch (job) {
    case 'close':
      return runCloseJob({ market });
    case 'intraday':
      return runIntradayJob({ market, force: argv.includes('--force') });
    case 'backfill':
      return runBackfillJob({ market });
    default:
      throw new Error('用法：tsx jobs/run.ts close|intraday|backfill [TW|US] [--force]');
  }
}

const isMain = typeof process !== 'undefined' && process.argv[1] && /jobs[\\/]run\.(ts|js|mjs)$/.test(process.argv[1]);
if (isMain) {
  runFromArgs(process.argv.slice(2))
    .then(async (r) => {
      console.log(JSON.stringify(r, null, 2));
      // 記憶體儲存在本機會延遲寫檔，稍候再結束
      await new Promise((res) => setTimeout(res, 400));
      process.exit(r.failed.length && !r.ok.length ? 1 : 0);
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
