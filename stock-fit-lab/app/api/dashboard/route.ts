/**
 * GET /api/dashboard
 * 追蹤儀表板：所有追蹤代號（自選清單 ∪ TRACK_SYMBOLS）的最新預測方向、近 20 筆準度、最近偵測事件、資料新鮮度。
 */
import { NextResponse } from 'next/server';
import { getDashboardData } from './_data';
import { jsonError, jsonSafe } from '../accuracy/_lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(jsonSafe(await getDashboardData()));
  } catch (e) {
    return jsonError(`讀取儀表板資料失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
