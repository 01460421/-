/**
 * GET /api/snapshots?symbol=&model=&from=&to=&trigger=&limit=&offset=&format=json|csv
 * 預測快照列表（唯讀）。快照為 append-only 系統資料：本 API 不提供任何寫入 / 修改 / 刪除方法。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/storage';
import { toCsv } from '@/lib/engine/accuracy';
import { jsonError, jsonSafe, parseParams, zDate, zModel, zSymbol } from '../accuracy/_lib';

export const dynamic = 'force-dynamic';

const schema = z.object({
  symbol: zSymbol.optional(),
  model: zModel.optional(),
  from: zDate.optional(),
  to: zDate.optional(),
  trigger: z.enum(['refit', 'rls', 'kalman', 'ensemble', 'schedule', 'manual'], { errorMap: () => ({ message: '觸發來源不正確' }) }).optional(),
  limit: z.coerce.number().int('limit 須為整數').min(1, 'limit 至少 1').max(500, 'limit 最多 500').optional(),
  offset: z.coerce.number().int('offset 須為整數').min(0, 'offset 不可為負').optional(),
  format: z.enum(['json', 'csv'], { errorMap: () => ({ message: 'format 只支援 json、csv' }) }).optional(),
});

/** 上限：避免一次讀取過多快照 */
const SCAN_CAP = 20000;

export async function GET(req: Request) {
  const p = parseParams(req.url, schema);
  if (!p.ok) return p.res;
  const q = p.data;
  if (q.from && q.to && q.from > q.to) return jsonError('起日不可晚於迄日');
  const limit = q.limit ?? 50;
  const offset = q.offset ?? 0;
  try {
    const store = await getStore();
    let all = await store.listSnapshots({ symbol: q.symbol, modelId: q.model, from: q.from, to: q.to, limit: SCAN_CAP });
    if (q.trigger) all = all.filter((s) => s.trigger === q.trigger);
    const page = q.format === 'csv' ? all : all.slice(offset, offset + limit);
    const outs = await store.listOutcomes(page.map((s) => s.id));
    const by = new Map<string, typeof outs>();
    for (const o of outs) (by.get(o.snapshotId) ?? by.set(o.snapshotId, []).get(o.snapshotId)!).push(o);
    const items = page.map((s) => {
      const os = by.get(s.id) ?? [];
      const ape = os.filter((o) => Number.isFinite(o.absPctError)).map((o) => o.absPctError);
      const dir = os.filter((o) => o.directionCorrect !== null);
      const h = s.targetDates.length;
      return {
        id: s.id,
        createdAt: s.createdAt,
        symbol: s.symbol,
        modelId: s.modelId,
        modelVersion: s.modelVersion,
        trigger: s.trigger,
        trainStart: s.trainStart,
        trainEnd: s.trainEnd,
        lastPrice: s.lastPrice,
        horizon: h,
        lastTarget: s.targetDates[h - 1] ?? null,
        meanLast: s.mean[h - 1] ?? null,
        lowerLast: s.lower[h - 1] ?? null,
        upperLast: s.upper[h - 1] ?? null,
        pUpLast: s.pUp?.[h - 1] ?? null,
        level: s.level,
        filled: os.length,
        mape: ape.length ? ape.reduce((a, b) => a + b, 0) / ape.length : null,
        dirHits: dir.filter((o) => o.directionCorrect).length,
        dirN: dir.length,
        coverage: os.length ? os.filter((o) => o.inInterval).length / os.length : null,
        hasAi: s.modelId === 'ai',
      };
    });
    if (q.format === 'csv') {
      const csv = toCsv(
        items,
        [
          { key: 'id', label: '快照ID' },
          { key: 'createdAt', label: '快照時間' },
          { key: 'symbol', label: '代號' },
          { key: 'modelId', label: '模型' },
          { key: 'modelVersion', label: '版本' },
          { key: 'trigger', label: '觸發' },
          { key: 'trainStart', label: '訓練起' },
          { key: 'trainEnd', label: '訓練迄' },
          { key: 'lastPrice', label: '最後已知價' },
          { key: 'horizon', label: '期數' },
          { key: 'lastTarget', label: '最後目標日' },
          { key: 'meanLast', label: '最後期預測' },
          { key: 'lowerLast', label: '區間下界' },
          { key: 'upperLast', label: '區間上界' },
          { key: 'pUpLast', label: 'P(上漲)' },
          { key: 'filled', label: '已回填期數' },
          { key: 'mape', label: 'MAPE(%)' },
          { key: 'dirHits', label: '方向判對' },
          { key: 'dirN', label: '方向樣本' },
          { key: 'coverage', label: '區間覆蓋率' },
        ],
        { bom: true },
      );
      return new NextResponse(csv, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="snapshots-${new Date().toISOString().slice(0, 10)}.csv"` },
      });
    }
    return NextResponse.json(jsonSafe({ generatedAt: new Date().toISOString(), storeKind: store.kind, total: all.length, truncated: all.length >= SCAN_CAP, offset, limit, items }));
  } catch (e) {
    return jsonError(`讀取快照失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
