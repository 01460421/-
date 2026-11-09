/**
 * GET /api/privacy/export
 * 一鍵匯出個人資料（自選股 + AI 對話紀錄）為 JSON 檔案下載。快照屬系統資料，不在個人資料範圍內。
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/storage';
import { getUserId } from '@/lib/user';
import { jsonError } from '../../accuracy/_lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = getUserId();
    const store = await getStore();
    const data = await store.exportUserData(userId);
    const body = {
      exportedAt: new Date().toISOString(),
      userId,
      storage: store.kind,
      note: '此檔案包含您在本站的個人資料：自選股與 AI 對話紀錄。預測快照為系統資料（不含個人資訊），不在匯出範圍內。',
      counts: { watchlist: data.watchlist.length, conversations: data.conversations.length },
      ...data,
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="stock-fit-lab-personal-data-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return jsonError(`匯出個人資料失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
