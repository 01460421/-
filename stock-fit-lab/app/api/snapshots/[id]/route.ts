/**
 * GET /api/snapshots/[id]
 * 單次預測詳情：當時參數、區間、基準值、回填實際值、誤差分解（偏差² + 變異）、當時集成權重、AI 內容。
 * 唯讀：快照建立後不可修改或刪除。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/storage';
import { snapshotDetail } from '@/lib/engine/accuracy';
import { jsonError, jsonSafe, modelNames } from '../../accuracy/_lib';

export const dynamic = 'force-dynamic';

const zId = z.string().min(1, '缺少快照 ID').max(80, '快照 ID 過長').regex(/^[A-Za-z0-9_-]+$/, '快照 ID 格式錯誤');

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = zId.safeParse(params.id);
  if (!id.success) return jsonError(`參數錯誤：${id.error.issues[0]?.message ?? '快照 ID 不正確'}`);
  try {
    const store = await getStore();
    const detail = await snapshotDetail(store, id.data);
    if (!detail) return jsonError('找不到這筆快照', 404);
    return NextResponse.json(jsonSafe({ generatedAt: new Date().toISOString(), modelName: modelNames()[detail.snapshot.modelId] ?? detail.snapshot.modelId, ...detail }));
  } catch (e) {
    return jsonError(`讀取快照失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
