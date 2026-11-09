/**
 * Vercel Cron 共用：設定 CRON_SECRET 時驗證 Authorization: Bearer <CRON_SECRET>。
 */
import { NextResponse } from 'next/server';
import { parseMarket, type JobMarket } from '@/jobs/common';

export function checkCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return null;
}

export function marketParam(req: Request): { market?: JobMarket; error?: NextResponse } {
  const raw = new URL(req.url).searchParams.get('market');
  if (!raw) return {};
  const market = parseMarket(raw);
  if (!market) return { error: NextResponse.json({ ok: false, error: `market 必須為 TW 或 US（收到 ${raw}）` }, { status: 400 }) };
  return { market };
}
