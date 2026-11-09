/**
 * POST /api/privacy/delete   body: { "confirm": "DELETE" }
 * 刪除目前使用者的個人資料（自選股 + AI 對話紀錄）。預測快照為系統資料且 append-only，不會被刪除。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/storage';
import { getUserId } from '@/lib/user';
import { jsonError } from '../../accuracy/_lib';

export const dynamic = 'force-dynamic';

const schema = z.object({ confirm: z.literal('DELETE', { errorMap: () => ({ message: '請在確認欄位輸入 DELETE 以確認刪除' }) }) });

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('請求內容須為 JSON：{ "confirm": "DELETE" }');
  }
  const p = schema.safeParse(raw);
  if (!p.success) return jsonError(p.error.issues[0]?.message ?? '確認參數錯誤');
  try {
    const userId = getUserId();
    const store = await getStore();
    const before = await store.exportUserData(userId);
    await store.deleteUserData(userId);
    return NextResponse.json({
      ok: true,
      deletedAt: new Date().toISOString(),
      deleted: { watchlist: before.watchlist.length, conversations: before.conversations.length },
      note: '已刪除您的自選股與 AI 對話紀錄。預測快照為不含個人資訊的系統資料，依 append-only 設計保留。',
    });
  } catch (e) {
    return jsonError(`刪除個人資料失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
