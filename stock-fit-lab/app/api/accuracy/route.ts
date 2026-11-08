/**
 * GET /api/accuracy?symbol=&model=&horizon=&period=1m|3m|6m|12m|custom&from=&to=&up=&down=&dirModel=
 * 回傳：計分卡 + 準度趨勢 + 混淆矩陣 + 機率校準（全部來自已寫入的快照與回填結果）。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/storage';
import { confusionFromRecords, loadRecords, mapeTrend, periodRange, scorecardCsv, scorecardFromRecords } from '@/lib/engine/accuracy';
import { calibrationFromRecords, getAuditPassed, jsonError, jsonSafe, modelNames, parseParams, resolvePeriod, zDate, zHorizon, zModel, zPeriod, zProb, zSymbol } from './_lib';

export const dynamic = 'force-dynamic';

const schema = z
  .object({
    symbol: zSymbol.optional(),
    model: zModel.optional(),
    horizon: zHorizon.optional(),
    period: zPeriod.optional(),
    from: zDate.optional(),
    to: zDate.optional(),
    up: zProb.optional(),
    down: zProb.optional(),
    dirModel: zModel.optional(),
    format: z.enum(['json', 'csv'], { errorMap: () => ({ message: 'format 只支援 json、csv' }) }).optional(),
  })
  .refine((v) => (v.up ?? 0.65) > (v.down ?? 0.35), { message: '看漲門檻必須大於看跌門檻', path: ['up'] });

export async function GET(req: Request) {
  const p = parseParams(req.url, schema);
  if (!p.ok) return p.res;
  const q = p.data;
  const period = resolvePeriod(q.period, q.from, q.to);
  if (typeof period === 'object' && 'error' in period) return jsonError(period.error);
  const th = { up: q.up ?? 0.65, down: q.down ?? 0.35 };
  try {
    const store = await getStore();
    const now = new Date();
    const auditPassed = await getAuditPassed(store, q.symbol);
    const models = q.model ? [q.model] : undefined;
    const base = { symbol: q.symbol, period, now, auditPassed, actThresholds: th };
    const records = await loadRecords(store, { ...base, models });
    const horizons = q.horizon ? [q.horizon] : [1, 5, 10, 20];
    const scorecard = scorecardFromRecords(records, { ...base, models, horizons });
    if (q.format === 'csv') {
      return new NextResponse(scorecardCsv(scorecard), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="scorecard-${q.symbol ?? 'all'}-${now.toISOString().slice(0, 10)}.csv"` },
      });
    }
    const trend = await mapeTrend(store, { ...base, models, horizon: q.horizon });

    // 方向評估（混淆矩陣 / 校準）：預設看集成模型（系統的主要方向輸出）
    const available = [...new Set(records.map((r) => r.snapshot.modelId))].sort();
    const dirModel = q.dirModel ?? q.model ?? (available.includes('ensemble') ? 'ensemble' : available[0]);
    const dirRecords = records.filter((r) => r.snapshot.modelId === dirModel);
    const dirHorizon = q.horizon ?? 5;
    const confusion = confusionFromRecords(dirRecords, dirHorizon, th);
    const calibration = calibrationFromRecords(dirRecords, dirHorizon);

    const range = periodRange(period, now);
    return NextResponse.json(
      jsonSafe({
        generatedAt: now.toISOString(),
        storeKind: store.kind,
        query: { symbol: q.symbol ?? null, model: q.model ?? null, horizon: q.horizon ?? null, period: q.period ?? (typeof period === 'string' ? period : 'custom'), thresholds: th },
        range,
        counts: {
          snapshots: records.length,
          withOutcomes: records.filter((r) => r.outcomes.size > 0).length,
          symbols: [...new Set(records.map((r) => r.snapshot.symbol))].sort(),
          models: available,
          firstIssued: records[0]?.snapshot.createdAt ?? null,
          lastIssued: records[records.length - 1]?.snapshot.createdAt ?? null,
        },
        scorecard,
        trend,
        direction: { model: dirModel ?? null, horizon: dirHorizon, confusion, calibration },
        modelNames: modelNames(),
        note: '所有數值皆讀取當時寫入的預測快照與排程回填的實際值，未以現在的模型重算；同一代號×模型×訓練迄日只取最後一筆快照。',
      }),
    );
  } catch (e) {
    return jsonError(`讀取準度資料失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
