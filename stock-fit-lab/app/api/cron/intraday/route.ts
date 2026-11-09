/** Vercel Cron：GET /api/cron/intraday?market=TW|US */
import { NextResponse } from 'next/server';
import { runIntradayJob } from '@/jobs/intraday';
import { checkCronAuth, marketParam } from '../_auth';

export const maxDuration = 60; // Hobby 方案上限；Pro 或啟用 Fluid compute 可調高到 300
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const { market, error } = marketParam(req);
  if (error) return error;
  const report = await runIntradayJob({ market });
  const ok = !(report.failed.some((f) => f.symbol === '*'));
  return NextResponse.json({ ok, report }, { status: ok ? 200 : 500 });
}
