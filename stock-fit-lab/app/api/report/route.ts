/**
 * GET /api/report?month=YYYY-MM&symbol=&format=json|csv
 * 月度準度報告：模型排名、與 naive 基準比較、信賴區間覆蓋率實測值。CSV 含 UTF-8 BOM（Excel 開啟中文不亂碼）。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/storage';
import { monthlyReport, scorecardCsv, toCsv } from '@/lib/engine/accuracy';
import { getAuditPassed, jsonError, jsonSafe, modelNames, parseParams, zSymbol } from '../accuracy/_lib';

export const dynamic = 'force-dynamic';

const schema = z.object({
  month: z
    .string({ required_error: '請提供月份 month=YYYY-MM' })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, '月份格式須為 YYYY-MM'),
  symbol: zSymbol.optional(),
  format: z.enum(['json', 'csv'], { errorMap: () => ({ message: 'format 只支援 json、csv' }) }).optional(),
});

const pct = (v: number) => (Number.isFinite(v) ? Number((v * 100).toFixed(2)) : null);

export async function GET(req: Request) {
  const p = parseParams(req.url, schema);
  if (!p.ok) return p.res;
  const { month, symbol, format = 'json' } = p.data;
  try {
    const store = await getStore();
    const auditPassed = await getAuditPassed(store, symbol);
    const report = await monthlyReport(store, { month, symbol, auditPassed });
    if (format === 'csv') {
      const names = modelNames();
      const ranking = report.ranking.flatMap((g) => g.models.map((m, i) => ({ symbol: g.symbol, horizon: g.horizon, rank: i + 1, modelId: m.modelId, name: names[m.modelId] ?? m.modelId, dir: pct(m.directionAccuracy), mape: Number.isFinite(m.mape) ? Number(m.mape.toFixed(3)) : null, theilU: Number.isFinite(m.theilU) ? Number(m.theilU.toFixed(4)) : null })));
      const coverage = Object.entries(report.coverage).map(([modelId, c]) => ({ modelId, name: names[modelId] ?? modelId, nominal: pct(c.nominal), coverage: pct(c.coverage), n: c.n }));
      const csv = [
        `# 月度準度報告 ${month}${symbol ? ` · ${symbol}` : ''}（產生時間 ${report.generatedAt}；資料來源：預測快照與排程回填值）`,
        '',
        '# 一、計分卡（代號 × 模型 × 期數）',
        scorecardCsv(report.rows),
        '',
        '# 二、模型排名（依方向準確率）',
        toCsv(ranking, [
          { key: 'symbol', label: '代號' },
          { key: 'horizon', label: '期數(日)' },
          { key: 'rank', label: '排名' },
          { key: 'modelId', label: '模型代碼' },
          { key: 'name', label: '模型' },
          { key: 'dir', label: '方向準確率(%)' },
          { key: 'mape', label: 'MAPE(%)' },
          { key: 'theilU', label: "Theil's U" },
        ]),
        '',
        '# 三、信賴區間覆蓋率實測值',
        toCsv(coverage, [
          { key: 'modelId', label: '模型代碼' },
          { key: 'name', label: '模型' },
          { key: 'nominal', label: '名目信賴水準(%)' },
          { key: 'coverage', label: '實測覆蓋率(%)' },
          { key: 'n', label: '樣本數' },
        ]),
        '',
        '# 本報告為數學擬合的歷史統計，不構成投資建議；過去表現不代表未來結果。',
      ].join('\n');
      // scorecardCsv 自帶 BOM：移到檔案最前面
      const body = '﻿' + csv.replace(/﻿/g, '');
      return new NextResponse(body, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="accuracy-report-${month}${symbol ? `-${symbol}` : ''}.csv"` },
      });
    }
    return NextResponse.json(jsonSafe({ ...report, symbol: symbol ?? null, storeKind: store.kind, modelNames: modelNames() }));
  } catch (e) {
    return jsonError(`產生月度報告失敗：${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
