/**
 * AI 即時互動分析的工具（function calling，規格第十節）。綁定目前代號與頁面設定。
 * 所有數字都來自系統內部函數的回傳值；AI 不得自行產生。
 *
 * 只能在伺服器端引用（使用資料源、儲存層與引擎）。
 * Schema 皆為 strict 相容：每一層 object 都 additionalProperties: false，自由鍵值改以 {key, value} 陣列表示。
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { AiTool } from './chat';
import type { ModelId, PriceSeries } from '../types';
import type { DatasetId } from '../data-adapters/types';
import { getMarketData, normalizeSymbol } from '../data-adapters';
import { addDays } from '../calendar';
import { analyze, barPrice, walkForward, LEAK_LABEL, type AnalysisResult, type EngineConfig, type EngineDeps } from '../engine';
import { findSuspects } from '../engine/leak-audit';
import { ALL_MODEL_IDS, createModel, isAdvanced } from '../models';
import { getStore } from '../storage';
import { r4 } from './context';
import { getHistorySummary, getLongHistory, getRangeSeries, px, round, type Granularity } from '../history';
import { searchNews, TIER_RANK, type AuthorityTier, type NewsItem } from '../news';
import { getFundamentals, getGuidance } from '../fundamentals';
import { getBehavioralIndicators, CAVEAT as BEHAVIORAL_CAVEAT } from '../behavioral';

type Schema = Anthropic.Beta.Messages.BetaTool['input_schema'];

export interface ToolBinding {
  symbol: string;
  /** 目前頁面的引擎設定（what-if 的比較基準） */
  baseConfig?: Partial<EngineConfig>;
}

const DEPS: EngineDeps = { createModel: (id: ModelId) => (isAdvanced(id) ? createModel(id) : undefined) };
const MODEL_ENUM = [...ALL_MODEL_IDS] as string[];
const DATASET_ENUM: DatasetId[] = ['institutional', 'margin', 'securities_lending', 'shareholding', 'monthly_revenue', 'financials', 'dividends', 'valuation', 'short_interest', 'insider', 'options', 'news', 'macro'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function zodValidator<T>(schema: z.ZodType<T>) {
  return (input: unknown): string | null => {
    const r = schema.safeParse(input);
    return r.success ? null : r.error.issues.map((i) => `${i.path.join('.') || '輸入'} ${i.message}`).join('；');
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 單次對話內快取行情與基準分析，避免重複抓取 */
function makeCache(binding: ToolBinding) {
  const series = new Map<string, Promise<PriceSeries>>();
  let base: Promise<AnalysisResult> | null = null;
  const getSeries = (symbol: string) => {
    if (!series.has(symbol)) series.set(symbol, getMarketData().getHistory(symbol, { interval: '1d', start: addDays(today(), -3 * 366) }));
    return series.get(symbol)!;
  };
  const getBase = () => (base ??= getSeries(binding.symbol).then((s) => analyze(s, binding.baseConfig ?? {}, DEPS)));
  return { getSeries, getBase };
}

function summarizeModel(res: AnalysisResult, id: ModelId) {
  const r = res.results[id];
  if (!r) return { model: id, ok: false, error: '模型未執行' };
  const f = r.forecast;
  const last = f ? f.mean.length - 1 : -1;
  let se = 0;
  let k = 0;
  r.residuals.forEach((e) => {
    if (Number.isFinite(e)) {
      se += e * e;
      k++;
    }
  });
  const params: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(r.description?.params ?? {}).slice(0, 10)) params[key] = typeof v === 'number' ? r4(v) : Array.isArray(v) ? v.slice(0, 8).map((x) => (typeof x === 'number' ? r4(x) : x)) : v;
  return {
    model: id,
    name: r.name,
    ok: r.ok,
    error: r.error,
    params,
    inSampleRmse: k ? r4(Math.sqrt(se / k)) : null,
    forecastEnd: f && last >= 0 ? { date: res.targetDates[last], mean: r4(f.mean[last]), lower: r4(f.lower[last]), upper: r4(f.upper[last]), level: f.level } : null,
    pUp: r4(r.direction?.pUp),
    weight: r4(res.ensembleWeights[id]),
  };
}

function seriesMeta(s: PriceSeries) {
  return { source: s.source, asOf: s.asOf, stale: !!s.stale, delayMinutes: s.delayMinutes };
}

function realizedVol(prices: number[], n: number): number | null {
  const p = prices.slice(-n - 1);
  if (p.length < 3) return null;
  const r = p.slice(1).map((v, i) => Math.log(v / p[i]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
  return r4(Math.sqrt(v * 252) * 100);
}

export function makeChatTools(binding: ToolBinding): AiTool[] {
  const cache = makeCache(binding);
  const symbol = binding.symbol;

  // ───── refit_model ─────
  const refitSchema = z.object({
    model: z.enum(MODEL_ENUM as [string, ...string[]]),
    params: z.array(z.object({ key: z.string().min(1).max(40), value: z.number().finite() }).strict()).max(10).optional(),
    window: z.number().int().min(20).max(1000).optional(),
  }).strict();
  const refit: AiTool = {
    definition: {
      name: 'refit_model',
      description: '以指定參數（可選）與訓練視窗重新擬合單一模型，回傳擬合參數、樣本內 RMSE、第 h 期預測與區間、P(上漲)。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['model'],
        properties: {
          model: { type: 'string', enum: MODEL_ENUM, description: '模型 id，例如 poly、kalman、arima' },
          params: {
            type: 'array',
            description: '覆寫參數（paramSpecs 的 key 與數值），例如 [{"key":"degree","value":3}]',
            items: { type: 'object', additionalProperties: false, required: ['key', 'value'], properties: { key: { type: 'string' }, value: { type: 'number' } } },
          },
          window: { type: 'integer', description: '訓練視窗長度（交易日，20–1000）' },
        },
      } as Schema,
    },
    validate: zodValidator(refitSchema),
    run: async (input) => {
      const inp = refitSchema.parse(input);
      const id = inp.model as ModelId;
      const s = await cache.getSeries(symbol);
      const params = inp.params?.length ? { [id]: Object.fromEntries(inp.params.map((p) => [p.key, p.value])) } : binding.baseConfig?.params ?? {};
      const res = await analyze(s, { ...binding.baseConfig, models: [id], params, ...(inp.window ? { window: inp.window } : {}) }, DEPS);
      return { symbol, data: seriesMeta(s), window: res.config.window, horizon: res.horizon, lastDate: res.lastDate, lastPrice: r4(res.lastPrice), result: summarizeModel(res, id) };
    },
  };

  // ───── what_if ─────
  const whatIfSchema = z.object({
    window: z.number().int().min(20).max(1000).optional(),
    lambda: z.number().min(0.5).max(1).optional(),
    horizon: z.number().int().min(1).max(60).optional(),
    priceMode: z.enum(['raw', 'log']).optional(),
  }).strict();
  const whatIf: AiTool = {
    definition: {
      name: 'what_if',
      description: '假設情境分析：改變訓練視窗 N、衰減係數 λ、預測期數 h 或價格模式後重算全部已啟用模型，回傳與目前設定的差異（集成與各模型的第 h 期預測、P(上漲)、權重）。例如「如果視窗改成 60 日會怎樣」。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          window: { type: 'integer', description: '訓練視窗（20–1000）' },
          lambda: { type: 'number', description: '衰減係數 λ（0.5–1）' },
          horizon: { type: 'integer', description: '預測期數 h（1–60）' },
          priceMode: { type: 'string', enum: ['raw', 'log'] },
        },
      } as Schema,
    },
    validate: zodValidator(whatIfSchema),
    run: async (input) => {
      const inp = whatIfSchema.parse(input);
      const s = await cache.getSeries(symbol);
      const base = await cache.getBase();
      const alt = await analyze(s, { ...binding.baseConfig, ...inp }, DEPS);
      const ids = alt.order;
      return {
        symbol,
        data: seriesMeta(s),
        changed: inp,
        base: { window: base.config.window, lambda: base.config.lambda, horizon: base.horizon, priceMode: base.config.priceMode },
        models: ids.map((id) => {
          const a = summarizeModel(alt, id);
          const b = summarizeModel(base, id);
          const am = 'forecastEnd' in a ? a.forecastEnd?.mean ?? null : null;
          const bm = 'forecastEnd' in b ? b.forecastEnd?.mean ?? null : null;
          return {
            model: id,
            whatIf: { forecastEnd: 'forecastEnd' in a ? a.forecastEnd : null, pUp: 'pUp' in a ? a.pUp : null, weight: 'weight' in a ? a.weight : null },
            current: { forecastEnd: 'forecastEnd' in b ? b.forecastEnd : null, pUp: 'pUp' in b ? b.pUp : null, weight: 'weight' in b ? b.weight : null },
            forecastEndDiff: am !== null && bm !== null ? r4(am - bm) : null,
          };
        }),
      };
    },
  };

  // ───── query_snapshots ─────
  const qsSchema = z.object({
    model: z.string().max(20).optional(),
    from: z.string().regex(DATE).optional(),
    to: z.string().regex(DATE).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).strict();
  const querySnapshots: AiTool = {
    definition: {
      name: 'query_snapshots',
      description: '查詢目前代號的歷史預測快照（只增不改）與已回填的實際值，回傳每筆快照的發出時間、訓練迄日、最後價、第 1 期與最後一期預測、P(上漲)與實際結果摘要。可用來回答「過去的預測準不準」。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          model: { type: 'string', description: "模型 id（例如 ensemble、kalman、ai）；省略則全部" },
          from: { type: 'string', description: '快照建立日期起（YYYY-MM-DD）' },
          to: { type: 'string', description: '快照建立日期迄（YYYY-MM-DD）' },
          limit: { type: 'integer', description: '最多筆數（1–50，預設 20）' },
        },
      } as Schema,
    },
    validate: zodValidator(qsSchema),
    run: async (input) => {
      const inp = qsSchema.parse(input);
      const store = await getStore();
      const snaps = await store.listSnapshots({ symbol, modelId: inp.model, from: inp.from, to: inp.to ? `${inp.to}T23:59:59Z` : undefined, limit: inp.limit ?? 20 });
      const outs = await store.listOutcomes(snaps.map((s) => s.id));
      const byId = new Map<string, typeof outs>();
      for (const o of outs) byId.set(o.snapshotId, [...(byId.get(o.snapshotId) ?? []), o]);
      return {
        symbol,
        storeKind: store.kind,
        count: snaps.length,
        snapshots: snaps.map((s) => {
          const o = (byId.get(s.id) ?? []).sort((a, b) => a.horizonIndex - b.horizonIndex);
          const dirKnown = o.filter((x) => x.directionCorrect !== null);
          return {
            id: s.id,
            createdAt: s.createdAt,
            model: s.modelId,
            trigger: s.trigger,
            trainEnd: s.trainEnd,
            lastPrice: r4(s.lastPrice),
            first: s.targetDates.length ? { date: s.targetDates[0], mean: r4(s.mean[0]) } : null,
            last: s.targetDates.length ? { date: s.targetDates[s.targetDates.length - 1], mean: r4(s.mean[s.mean.length - 1]), pUp: r4(s.pUp?.[s.pUp.length - 1]) } : null,
            outcomes: o.length
              ? { filled: o.length, mapePct: r4(o.reduce((a, b) => a + b.absPctError, 0) / o.length), directionHitRate: dirKnown.length ? r4(dirKnown.filter((x) => x.directionCorrect).length / dirKnown.length) : null, coverage: r4(o.filter((x) => x.inInterval).length / o.length) }
              : null,
            ...(s.modelId === 'ai' ? { aiSummary: String((s.aiPayload as { plain_summary?: string } | undefined)?.plain_summary ?? '').slice(0, 200) } : {}),
          };
        }),
      };
    },
  };

  // ───── compare_symbols ─────
  const cmpSchema = z.object({ other_symbol: z.string().min(1).max(40) }).strict();
  const compare: AiTool = {
    definition: {
      name: 'compare_symbols',
      description: '比較目前代號與另一檔代號：集成 P(上漲)、20/60 日年化實現波動率、集成第 h 期預測漲跌幅、以及快速走動式驗證的集成 Theil\'s U（h=5）。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['other_symbol'],
        properties: { other_symbol: { type: 'string', description: '另一檔代號，例如 2454.TW、AAPL、聯發科' } },
      } as Schema,
    },
    validate: zodValidator(cmpSchema),
    run: async (input) => {
      const inp = cmpSchema.parse(input);
      const other = normalizeSymbol(inp.other_symbol);
      if (!other) throw new Error(`無法辨識代號：${inp.other_symbol}`);
      const models: ModelId[] = ['kalman', 'holtwinters', 'arima', 'gbm', 'linchannel', 'ensemble'];
      const one = async (sym: string) => {
        const s = await cache.getSeries(sym);
        const prices = s.bars.map(barPrice);
        const res = await analyze(s, { horizon: binding.baseConfig?.horizon ?? 20, models }, DEPS);
        const ens = res.results.ensemble;
        let theilU: number | null = null;
        try {
          const wf = walkForward(prices.slice(-400), { models, horizons: [5], maxOrigins: 30, benchmarks: false });
          theilU = r4(wf.models.ensemble?.[5]?.metrics.theilU);
        } catch {
          /* 資料不足 */
        }
        const endMean = ens?.forecast?.mean[ens.forecast.mean.length - 1];
        return {
          symbol: sym,
          data: seriesMeta(s),
          lastDate: res.lastDate,
          lastPrice: r4(res.lastPrice),
          ensemblePUp: r4(ens?.direction?.pUp),
          ensembleForecastChangePct: endMean ? r4((endMean / res.lastPrice - 1) * 100) : null,
          horizon: res.horizon,
          realizedVol20Pct: realizedVol(prices, 20),
          realizedVol60Pct: realizedVol(prices, 60),
          ensembleTheilU_h5: theilU,
        };
      };
      const [a, b] = await Promise.all([one(symbol), one(other.symbol)]);
      return { models, note: "Theil's U < 1 才代表優於 naive；快速驗證僅 30 個起點，僅供參考。", current: a, other: b };
    },
  };

  // ───── get_dataset ─────
  const dsSchema = z.object({
    dataset: z.enum(DATASET_ENUM as [DatasetId, ...DatasetId[]]),
    start: z.string().regex(DATE).optional(),
    end: z.string().regex(DATE).optional(),
  }).strict();
  const getDataset: AiTool = {
    definition: {
      name: 'get_dataset',
      description: '取得目前代號的詳細資料表（例如 institutional 三大法人買賣超、margin 融資融券、monthly_revenue 月營收、valuation 本益比等），回傳欄位、最多 40 列資料與數值欄位在期間內的合計 / 平均，附來源與資料時間。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['dataset'],
        properties: {
          dataset: { type: 'string', enum: DATASET_ENUM },
          start: { type: 'string', description: '起日 YYYY-MM-DD' },
          end: { type: 'string', description: '迄日 YYYY-MM-DD' },
        },
      } as Schema,
    },
    validate: zodValidator(dsSchema),
    run: async (input) => {
      const inp = dsSchema.parse(input);
      const t = await getMarketData().getDataset(symbol, inp.dataset, { start: inp.start, end: inp.end });
      const rows = t.rows.filter((r) => {
        const d = String(r.date ?? r.Date ?? '');
        return (!inp.start || !d || d >= inp.start) && (!inp.end || !d || d <= inp.end);
      });
      const numeric = t.columns.filter((c) => rows.some((r) => typeof r[c.key] === 'number'));
      const stats: Record<string, { sum: number | null; mean: number | null; n: number }> = {};
      for (const c of numeric) {
        const v = rows.map((r) => r[c.key]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
        stats[c.key] = { sum: v.length ? r4(v.reduce((a, b) => a + b, 0)) : null, mean: v.length ? r4(v.reduce((a, b) => a + b, 0) / v.length) : null, n: v.length };
      }
      return {
        dataset: t.dataset,
        title: t.title,
        source: t.source,
        asOf: t.asOf,
        delayMinutes: t.delayMinutes,
        unavailableReason: t.unavailableReason,
        columns: t.columns,
        totalRows: rows.length,
        rows: rows.slice(-40),
        stats,
      };
    },
  };

  // ───── run_walkforward ─────
  const wfSchema = z.object({ model: z.enum(MODEL_ENUM as [string, ...string[]]), horizon: z.number().int().min(1).max(60) }).strict();
  const runWf: AiTool = {
    definition: {
      name: 'run_walkforward',
      description: '對單一模型執行走動式前向驗證（只用當時已知資料逐點預測），回傳樣本外 MAE / RMSE / MAPE / 方向準確率 / Theil\'s U / 覆蓋率與相對 naive 的改善；疑似資料洩漏者不回傳數值。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['model', 'horizon'],
        properties: { model: { type: 'string', enum: MODEL_ENUM }, horizon: { type: 'integer', description: '預測期數 1–60' } },
      } as Schema,
    },
    validate: zodValidator(wfSchema),
    run: async (input) => {
      const inp = wfSchema.parse(input);
      const id = inp.model as ModelId;
      const s = await cache.getSeries(symbol);
      const prices = s.bars.map(barPrice).slice(-750);
      const models: ModelId[] = id === 'ensemble' ? ['poly', 'exp', 'log', 'logistic', 'fourier', 'linchannel', 'holtwinters', 'arima', 'gbm', 'kalman', 'ensemble'] : [id];
      const wf = walkForward(prices, {
        models,
        horizons: [inp.horizon],
        window: binding.baseConfig?.window ?? 120,
        lambda: binding.baseConfig?.lambda ?? 0.97,
        maxOrigins: id === 'gp' || id === 'stacking' ? 30 : 100,
        deps: DEPS,
      });
      const r = wf.models[id]?.[inp.horizon];
      if (!r) throw new Error('走動式驗證沒有產生結果');
      const suspect = findSuspects(wf).find((x) => x.model === id);
      if (suspect) return { model: id, horizon: inp.horizon, hidden: true, label: `${LEAK_LABEL}，稽核中`, reasons: suspect.reasons };
      const m = r.metrics;
      const rm = r.vsNaive?.metrics.rmse;
      return {
        model: id,
        horizon: inp.horizon,
        data: seriesMeta(s),
        origins: wf.origins.length,
        step: wf.step,
        metrics: { n: m.n, mae: r4(m.mae), rmse: r4(m.rmse), mapePct: r4(m.mape), directionAccuracy: r4(m.directionAccuracy), dirPValue: r4(m.dirPValue), theilU: r4(m.theilU), coverage: r4(m.coverage) },
        vsNaive: r.vsNaive ? { overall: r.vsNaive.overall, rmseImprovementPct: r4(rm?.relImprovementPct), rmseVerdict: rm?.verdict ?? null } : null,
      };
    },
  };

  // ───── chart_command ─────
  const chartSchema = z.object({
    action: z.enum(['mark_range', 'highlight_model', 'set_timescale', 'add_subplot']),
    from: z.string().regex(DATE).optional(),
    to: z.string().regex(DATE).optional(),
    model: z.string().max(20).optional(),
    timescale: z.enum(['day', 'week', 'month']).optional(),
    series: z.string().max(60).optional(),
    label: z.string().max(60).optional(),
  }).strict().superRefine((v, ctx) => {
    if (v.action === 'mark_range' && (!v.from || !v.to)) ctx.addIssue({ code: 'custom', message: 'mark_range 需要 from 與 to' });
    if (v.action === 'highlight_model' && !v.model) ctx.addIssue({ code: 'custom', message: 'highlight_model 需要 model' });
    if (v.action === 'set_timescale' && !v.timescale) ctx.addIssue({ code: 'custom', message: 'set_timescale 需要 timescale' });
    if (v.action === 'add_subplot' && !v.series) ctx.addIssue({ code: 'custom', message: 'add_subplot 需要 series（例如 institutional.total）' });
  });
  const chart: AiTool = {
    definition: {
      name: 'chart_command',
      description:
        '在使用者的主圖上執行聯動指令：mark_range 標註日期區間（from/to/label）、highlight_model 高亮某模型曲線（model）、set_timescale 切換日/週/月尺度（timescale）、add_subplot 加入外生變數子圖（series：volume 或 "<dataset>.<欄位 key>"，例如 institutional.total 三大法人合計、institutional.foreign 外資、margin 融資融券）。只回傳 {ok:true}，由前端執行。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['mark_range', 'highlight_model', 'set_timescale', 'add_subplot'] },
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD' },
          model: { type: 'string', description: '模型 id' },
          timescale: { type: 'string', enum: ['day', 'week', 'month'] },
          series: { type: 'string', description: 'volume 或 dataset.column' },
          label: { type: 'string', description: '標註文字' },
        },
      } as Schema,
    },
    validate: zodValidator(chartSchema),
    run: async () => ({ ok: true }),
  };

  return [refit, whatIf, querySnapshots, compare, getDataset, runWf, chart, ...makeContextTools(symbol)];
}

// ═════════════════════ 情境層工具：長期歷史 / 新聞 / 財報 / 方針 / 心理社會指標 ═════════════════════
// 每個結果都帶 sources: [{ name, url?, publishedAt? | asOf? }]，並以 capToolOutput 限制大小（摘要而非原始傾印）。

export const TOOL_OUTPUT_MAX_CHARS = 14_000;

/** 把結果壓到 maxChars 以內：反覆把最長的陣列砍半（保留前段，結果多已依重要性 / 時間排序），並標記 _truncated */
export function capToolOutput<T>(value: T, maxChars = TOOL_OUTPUT_MAX_CHARS): T {
  let v: unknown = JSON.parse(JSON.stringify(value ?? null));
  for (let iter = 0; iter < 40 && JSON.stringify(v).length > maxChars; iter++) {
    let best: { holder: Record<string, unknown> | unknown[]; key: string | number; len: number } | null = null;
    const walk = (node: unknown, holder: Record<string, unknown> | unknown[] | null, key: string | number | null) => {
      if (Array.isArray(node)) {
        if (holder && key !== null && node.length > 1 && (!best || node.length > best.len)) best = { holder, key, len: node.length };
        node.forEach((x, i) => walk(x, node, i));
      } else if (node && typeof node === 'object') for (const [k, x] of Object.entries(node)) walk(x, node as Record<string, unknown>, k);
    };
    walk(v, null, null);
    if (!best) break;
    const b = best as { holder: Record<string, unknown> | unknown[]; key: string | number; len: number };
    const arr = (b.holder as Record<string | number, unknown[]>)[b.key];
    (b.holder as Record<string | number, unknown>)[b.key] = arr.slice(0, Math.max(1, Math.floor(arr.length / 2)));
    if (v && typeof v === 'object' && !Array.isArray(v)) (v as Record<string, unknown>)._truncated = true;
  }
  const s = JSON.stringify(v);
  if (s.length > maxChars) return { _truncated: true, preview: s.slice(0, maxChars - 200) } as unknown as T;
  return v as T;
}

const TIERS: AuthorityTier[] = ['official', 'wire', 'major', 'trade', 'other'];
const GRAN = ['auto', 'day', 'week', 'month', 'quarter', 'year'] as const;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function compactNews(n: NewsItem) {
  return {
    publishedAt: n.publishedAt,
    title: n.title.slice(0, 140),
    source: n.source,
    tier: n.tier,
    kind: n.kind,
    url: n.url,
    ...(n.form ? { form: n.form } : {}),
    sentiment: n.sentiment ? n.sentiment.score : null,
    ...(n.tags?.length ? { tags: n.tags } : {}),
  };
}

const dateOrder = (v: { from?: string; to?: string }, ctx: z.RefinementCtx) => {
  if (v.from && v.to && v.from > v.to) ctx.addIssue({ code: 'custom', message: 'from 不可晚於 to' });
};

export const CONTEXT_TOOL_NAMES = ['get_long_history', 'search_news', 'explain_move', 'get_fundamentals', 'get_guidance', 'get_behavioral_indicators'] as const;

export function makeContextTools(symbol: string): AiTool[] {
  // ───── get_long_history ─────
  const lhSchema = z.object({ from: z.string().regex(DATE).optional(), to: z.string().regex(DATE).optional(), granularity: z.enum(GRAN).optional() }).strict().superRefine(dateOrder);
  const longHistory: AiTool = {
    definition: {
      name: 'get_long_history',
      description:
        '取得目前代號上市以來（1990 起）的長期日線摘要（point-in-time：只用 to 之前的資料）。不給 from/to 時回傳全期摘要：逐年報酬 / 年化波動 / 最大回撤、歷史高低點、單日最大漲跌前 10 名、回撤事件與收復時間、PELT/HMM 結構區段；給 from/to 時另回傳該區間降採樣 OHLC（最多 80 筆，granularity 可指定 day/week/month/quarter/year 或 auto）。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string', description: '起日 YYYY-MM-DD（可省略）' },
          to: { type: 'string', description: '迄日 YYYY-MM-DD；也是 point-in-time 截止日（預設今天）' },
          granularity: { type: 'string', enum: [...GRAN], description: '降採樣顆粒度，預設 auto' },
        },
      } as Schema,
    },
    validate: zodValidator(lhSchema),
    run: async (input) => {
      const inp = lhSchema.parse(input);
      const sum = await getHistorySummary(symbol, { from: inp.from, to: inp.to });
      const src = [{ name: sum.source, asOf: sum.asOf }];
      const base = {
        symbol: sum.symbol,
        period: { from: sum.from, to: sum.to, bars: sum.bars, years: sum.years },
        adjusted: sum.adjusted,
        cagrPct: sum.cagrPct,
        annVolPct: sum.annVolPct,
        maxDrawdown: sum.maxDrawdown,
        extremes: sum.extremes,
        yearly: sum.yearly.map((y) => ({ year: y.year, returnPct: y.returnPct, volPct: y.volPct, maxDrawdownPct: y.maxDrawdownPct, ...(y.partial ? { partial: true } : {}) })),
        topMoves: sum.topMoves,
        drawdowns: sum.drawdowns,
        regimes: { method: sum.regimes.method, segments: sum.regimes.segments.slice(-10), hmm: sum.regimes.hmm },
        notes: sum.notes,
      };
      let range = null;
      if (inp.from || inp.to) {
        const g = inp.granularity && inp.granularity !== 'auto' ? (inp.granularity as Granularity) : undefined;
        const r = await getRangeSeries(symbol, { from: inp.from, to: inp.to, granularity: g, maxPoints: 80 });
        range = { from: r.from, to: r.to, granularity: r.granularity, truncated: r.truncated, stats: r.stats, points: r.points.map((p) => ({ d: p.date, o: p.open, h: p.high, l: p.low, c: p.close, chg: p.changePct, v: p.volume })) };
      }
      return capToolOutput({ ...base, range, stale: sum.stale, sources: src });
    },
  };

  // ───── search_news ─────
  const snSchema = z.object({ from: z.string().regex(DATE), to: z.string().regex(DATE), query: z.string().min(1).max(80).optional(), min_tier: z.enum(TIERS as [AuthorityTier, ...AuthorityTier[]]).optional() }).strict().superRefine(dateOrder);
  const searchNewsTool: AiTool = {
    definition: {
      name: 'search_news',
      description:
        '查詢目前代號在 from~to 期間的權威新聞標題與官方公告（point-in-time：只回傳發布時間 ≤ to 當日的項目）。來源：台股公開資訊觀測站重大訊息 / TWSE OpenAPI / FinMind 新聞；美股 SEC EDGAR 申報；全球 GDELT（權威網域白名單）。只有標題 + 連結 + 來源 + 時間 + 權威等級（official > wire > major > trade > other）+ 詞典法標題情緒（粗略啟發式），沒有內文。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: {
          from: { type: 'string', description: '起日 YYYY-MM-DD' },
          to: { type: 'string', description: '迄日 YYYY-MM-DD（亦為 point-in-time 截止）' },
          query: { type: 'string', description: '標題關鍵字（可省略），例如 法說、guidance、裁員' },
          min_tier: { type: 'string', enum: TIERS, description: '最低權威等級，預設 trade' },
        },
      } as Schema,
    },
    validate: zodValidator(snSchema),
    run: async (input) => {
      const inp = snSchema.parse(input);
      const r = await searchNews({ symbol, from: inp.from, to: inp.to, asOf: inp.to, query: inp.query, minTier: inp.min_tier, limit: 25 });
      return capToolOutput({
        symbol: r.symbol,
        from: r.from,
        to: r.to,
        asOf: r.asOf,
        total: r.total,
        truncated: r.truncated,
        items: r.items.map(compactNews),
        dailySentiment: r.daily.slice(-15),
        sentimentLabel: r.sentimentLabel,
        sourceStatus: r.sources.map((s) => ({ name: s.name, ok: s.ok, count: s.count, ...(s.error ? { error: s.error.slice(0, 120) } : {}) })),
        notes: r.notes,
        sources: [
          ...r.sources.filter((s) => s.ok).map((s) => ({ name: s.name, url: s.url, asOf: r.asOf })),
          ...r.items.slice(0, 10).map((n) => ({ name: n.source, url: n.url ?? undefined, publishedAt: n.publishedAt })),
        ],
      });
    },
  };

  // ───── explain_move ─────
  const emSchema = z.object({ date: z.string().regex(DATE) }).strict();
  const explainMove: AiTool = {
    definition: {
      name: 'explain_move',
      description:
        '解釋某一交易日的價格變動：回傳當日漲跌幅 / 跳空 / 量比與歷史分位、前後數日走勢、期間（date−2 ~ date+1）的權威新聞與官方公告、公司事件，以及當日的心理社會指標讀數。所有資料皆 ≤ date+1（point-in-time）。時間上相近不代表因果，請以「可能相關」表述。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['date'],
        properties: { date: { type: 'string', description: '交易日 YYYY-MM-DD' } },
      } as Schema,
    },
    validate: zodValidator(emSchema),
    run: async (input) => {
      const { date } = emSchema.parse(input);
      const asOf = addDays(date, 1);
      const h = await getLongHistory(symbol, { to: asOf });
      const bars = h.bars;
      let i = -1;
      for (let k = bars.length - 1; k >= 0; k--)
        if (bars[k].date <= date) {
          i = k;
          break;
        }
      if (i <= 0) throw new Error(`${date} 之前沒有行情資料`);
      const b = bars[i];
      const prev = bars[i - 1];
      const ret = px(b) / px(prev) - 1;
      const absRets = bars.slice(1, i + 1).map((x, k) => Math.abs(px(x) / px(bars[k]) - 1));
      const pctRank = absRets.length ? (absRets.filter((x) => x < Math.abs(ret)).length / absRets.length) * 100 : null;
      const avgVol = bars.slice(Math.max(0, i - 20), i).reduce((s, x) => s + (x.volume || 0), 0) / Math.max(1, Math.min(20, i));
      const around = bars.slice(Math.max(0, i - 5), Math.min(bars.length, i + 2)).map((x, k, arr) => ({ d: x.date, c: round(x.close), chg: k > 0 ? round((px(x) / px(arr[k - 1]) - 1) * 100, 2) : null }));
      const [news, events, beh] = await Promise.allSettled([
        searchNews({ symbol, from: addDays(b.date, -2), to: asOf, asOf, minTier: 'trade', limit: 20, maxFinMindDays: 4, maxMopsMonths: 2 }),
        getMarketData().getEvents(symbol, { start: addDays(b.date, -5), end: asOf }),
        getBehavioralIndicators(symbol, { asOf: b.date, includeNews: false }),
      ]);
      const n = news.status === 'fulfilled' ? news.value : null;
      return capToolOutput({
        symbol,
        date: b.date,
        requestedDate: date,
        pointInTimeCutoff: asOf,
        move: {
          close: round(b.close),
          prevClose: round(prev.close),
          returnPct: round(ret * 100, 2),
          gapPct: b.open ? round((b.open / prev.close - 1) * 100, 2) : null,
          intradayRangePct: b.high && b.low ? round(((b.high - b.low) / prev.close) * 100, 2) : null,
          volumeRatio20d: avgVol > 0 ? round((b.volume || 0) / avgVol, 2) : null,
          absMovePercentileSinceListing: pctRank === null ? null : round(pctRank, 1),
        },
        around,
        officialDisclosures: n ? n.items.filter((x) => x.tier === 'official').slice(0, 10).map(compactNews) : [],
        news: n ? n.items.filter((x) => x.tier !== 'official').slice(0, 12).map(compactNews) : [],
        newsStatus: n ? n.sources.map((s) => ({ name: s.name, ok: s.ok, count: s.count, ...(s.error ? { error: s.error.slice(0, 100) } : {}) })) : [{ name: 'news', ok: false, error: String((news as PromiseRejectedResult).reason).slice(0, 120) }],
        corporateEvents: events.status === 'fulfilled' ? events.value.filter((e) => e.date <= asOf).map((e) => ({ date: e.date, type: e.type, title: e.title.slice(0, 80), source: e.source })) : [],
        behavioral: beh.status === 'fulfilled' ? beh.value.indicators.map((x) => ({ id: x.id, name: x.name, value: x.value, unit: x.unit, reading: x.reading.slice(0, 120), available: x.available })) : [],
        caveat: '時間上接近的新聞 / 公告不代表造成股價變動的原因；相關不等於因果。',
        sources: [
          { name: h.source, asOf: b.date },
          ...(n ? n.sources.filter((s) => s.ok).map((s) => ({ name: s.name, url: s.url, asOf })) : []),
          ...(n ? n.items.slice(0, 8).map((x) => ({ name: x.source, url: x.url ?? undefined, publishedAt: x.publishedAt })) : []),
        ],
      });
    },
  };

  // ───── get_fundamentals ─────
  const fdSchema = z.object({ as_of: z.string().regex(DATE).optional() }).strict();
  const fundamentals: AiTool = {
    definition: {
      name: 'get_fundamentals',
      description:
        '取得目前代號 as_of 當時「已公開」的實際財報（point-in-time）：台股以 FinMind 季報 / 月營收 / 股利 / TWSE 估值（無申報日時以法定公告期限判斷已知）；美股以 SEC XBRL companyfacts 的 filed 日。回傳近 6 季營收 / 毛利 / 營益 / 淨利 / EPS 與 YoY、QoQ、三率，近四季 TTM，以 as_of 收盤計算的 P/E、P/B、殖利率，以及尚未公開的下一期。不提供分析師預期或財報驚喜。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: { as_of: { type: 'string', description: 'point-in-time 日期 YYYY-MM-DD（預設今天）' } },
      } as Schema,
    },
    validate: zodValidator(fdSchema),
    run: async (input) => {
      const inp = fdSchema.parse(input);
      const f = await getFundamentals(symbol, { asOf: inp.as_of });
      return capToolOutput({
        symbol: f.symbol,
        asOf: f.asOf,
        currency: f.currency,
        entityName: f.entityName,
        unavailableReason: f.unavailableReason,
        quarters: f.quarters.slice(-6).map((q) => ({
          period: q.label,
          periodEnd: q.periodEnd,
          knownAt: q.knownAt,
          basis: q.basis,
          revenue: q.revenue,
          revenueYoYPct: q.revenueYoYPct,
          revenueQoQPct: q.revenueQoQPct,
          grossMarginPct: q.grossMarginPct,
          operatingMarginPct: q.operatingMarginPct,
          netMarginPct: q.netMarginPct,
          netIncome: q.netIncome,
          eps: q.eps,
          operatingCashFlow: q.operatingCashFlow,
          ...(q.derivedFields.length ? { derivedFields: q.derivedFields } : {}),
        })),
        ttm: f.ttm,
        valuation: f.valuation,
        officialValuation: f.officialValuation,
        marginTrends: f.marginTrends,
        monthlyRevenue: f.monthlyRevenue.slice(-6),
        dividends: f.dividends.slice(-4),
        pendingNext: f.pendingNext,
        lagRule: f.lagRule,
        notes: f.notes,
        sources: f.sources,
      });
    },
  };

  // ───── get_guidance ─────
  const gdSchema = z.object({ from: z.string().regex(DATE).optional(), to: z.string().regex(DATE).optional() }).strict().superRefine(dateOrder);
  const guidance: AiTool = {
    definition: {
      name: 'get_guidance',
      description:
        '列出公司官方「方針」出處（point-in-time ≤ to）：台股公開資訊觀測站重大訊息中含 展望 / 資本支出 / 股利政策 / 財測 的公告與法人說明會；美股 SEC 8-K Item 2.02（財報新聞稿）、7.01、8.01 與 Exhibit 99 連結。只回傳 標題 + 日期 + 章節 + 連結；不得轉述或推測其中的財測數字，請引導使用者點連結閱讀原文。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string', description: '起日 YYYY-MM-DD（預設 to 往前一年）' },
          to: { type: 'string', description: '迄日 YYYY-MM-DD（預設今天，亦為 point-in-time 截止）' },
        },
      } as Schema,
    },
    validate: zodValidator(gdSchema),
    run: async (input) => {
      const inp = gdSchema.parse(input);
      const g = await getGuidance(symbol, { from: inp.from, to: inp.to, asOf: inp.to ?? todayDate() });
      return capToolOutput({
        symbol: g.symbol,
        from: g.from,
        to: g.to,
        asOf: g.asOf,
        items: g.items.slice(0, 20).map((i) => ({ date: i.date, section: i.section, title: i.title.slice(0, 140), url: i.url, exhibits: i.exhibits.slice(0, 3), source: i.source })),
        sourceStatus: g.sources.map((s) => ({ name: s.name, ok: s.ok, count: s.count, ...(s.error ? { error: s.error.slice(0, 120) } : {}) })),
        notes: g.notes,
        sources: [...g.sources.filter((s) => s.ok).map((s) => ({ name: s.name, url: s.url, asOf: g.asOf })), ...g.items.slice(0, 8).map((i) => ({ name: i.source, url: i.url ?? undefined, publishedAt: i.publishedAt }))],
      });
    },
  };

  // ───── get_behavioral_indicators ─────
  const bhSchema = z.object({ as_of: z.string().regex(DATE).optional() }).strict();
  const behavioral: AiTool = {
    definition: {
      name: 'get_behavioral_indicators',
      description:
        '取得 as_of 當時的心理與社會面指標（point-in-time）：52 週高點接近度（錨定）、異常成交量（注意力）、短期過度反應 z 分數、動能 12-1、台股融資 vs 法人背離與融資使用率、VIX / 台指選擇權 P/C 恐慌指標、新聞注意力與媒體悲觀度、簡化 Baker–Wurgler 市場情緒代理、行事曆情境（休市 / 財報季 / 季底 / 總經新聞）。每項附公式、說明與學術出處；均為統計關聯，相關不等於因果。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: { as_of: { type: 'string', description: 'point-in-time 日期 YYYY-MM-DD（預設今天）' } },
      } as Schema,
    },
    validate: zodValidator(bhSchema),
    run: async (input) => {
      const inp = bhSchema.parse(input);
      const r = await getBehavioralIndicators(symbol, { asOf: inp.as_of });
      return capToolOutput({
        symbol: r.symbol,
        asOf: r.asOf,
        indicators: r.indicators.map((x) => ({ id: x.id, name: x.name, available: x.available, value: x.value, unit: x.unit, reading: x.reading, details: x.details, formula: x.formula, reference: x.reference.split('；')[0].slice(0, 160), asOf: x.asOf })),
        macroHeadlines: r.macroHeadlines,
        notes: r.notes,
        caveat: BEHAVIORAL_CAVEAT,
        sources: r.indicators.flatMap((x) => x.sources.map((s) => ({ name: s.name, url: s.url, asOf: s.asOf ?? undefined }))).filter((s, i, a) => a.findIndex((y) => y.name === s.name) === i),
      });
    },
  };

  return [longHistory, searchNewsTool, explainMove, fundamentals, guidance, behavioral];
}

/** 新聞權威等級排序值（供前端 / 測試使用） */
export const NEWS_TIER_RANK = TIER_RANK;
