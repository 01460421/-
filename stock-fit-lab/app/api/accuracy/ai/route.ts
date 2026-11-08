/**
 * GET /api/accuracy/ai?symbol=&limit=
 * AI 建議歷史：列出過去 modelId = 'ai' 的快照（AI 當時說了什麼），並以「同一訓練迄日」寫入的模型快照
 * 之回填結果對照之後實際走勢、AI 認定最可信的模型後來是否優於 naive 基準、在當日所有模型中的 MAPE 排名。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/storage';
import { aiHistoryItem } from './_item';
import { jsonError, jsonSafe, modelNames, parseParams, zSymbol } from '../_lib';

export const dynamic = 'force-dynamic';

const schema = z.object({
  symbol: zSymbol.optional(),
  limit: z.coerce.number().int('limit 須為整數').min(1, 'limit 至少 1').max(200, 'limit 最多 200').optional(),
});

export async function GET(req: Request) {
  const p = parseParams(req.url, schema);
  if (!p.ok) return p.res;
  const { symbol, limit = 30 } = p.data;
  try {
    const store = await getStore();
    const ais = await store.listSnapshots({ symbol, modelId: 'ai', limit });
    const items = [];
    for (const ai of ais) items.push(await aiHistoryItem(store, ai));
    return NextResponse.json(jsonSafe({ generatedAt: new Date().toISOString(), items, modelNames: modelNames(), note: 'AI 建議原文來自當時寫入的快照（modelId = ai）；後續結果取自同一訓練迄日之模型快照的排程回填值。' }));
  } catch (e) {
    return jsonError(`讀取 AI 建議歷史失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
