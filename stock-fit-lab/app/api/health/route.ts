/**
 * GET /api/health
 * 系統健康：資料源失敗率 / 連續失敗、排程延遲、API 配額、儲存類型、環境設定檢查（只回報是否設定）。
 */
import { NextResponse } from 'next/server';
import { getHealthData } from './_data';
import { jsonError, jsonSafe } from '../accuracy/_lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getHealthData();
    return NextResponse.json(jsonSafe(data), { status: 200 });
  } catch (e) {
    return jsonError(`讀取系統健康資料失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
