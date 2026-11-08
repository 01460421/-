/** Vercel Cron：GET /api/cron/backfill?market=TW|US */
import { NextResponse } from 'next/server';
import { runBackfillJob } from '@/jobs/backfill';
import { checkCronAuth, marketParam } from '../_auth';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const { market, error } = marketParam(req);
  if (error) return error;
  const report = await runBackfillJob({ market });
  const ok = !(report.failed.some((f) => f.symbol === '*'));
  return NextResponse.json({ ok, report }, { status: ok ? 200 : 500 });
}
