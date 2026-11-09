/**
 * 即時修正引擎（規格第四節的核心）。
 *
 * analyze(series, config)：全量擬合（第 1 層：最近 N 筆 + 衰減權重），輸出 AnalysisResult。
 *
 * CorrectionSession.ingest(bar)：逐筆修正，依序執行啟用的層：
 *   1 滾動視窗重擬合   —— 未由第 2/3 層處理的模型以最近 N 筆重擬合；
 *                          線上更新的 RLS 模型每 reanchorEvery 根重新錨定一次
 *   2 RLS              —— 多項式 / 線性類以 model.update(y) 線上更新（不重算整個矩陣）
 *   3 卡爾曼            —— kalman 模型 model.update(y) 執行預測—更新，增益 K_t 寫入 kalmanTrace；
 *                          新的結構性變化警示 → structural_break 事件
 *   4 集成權重再分配     —— 以「上一輪的一步預測 vs 新實際值」更新 ē_m 與方向命中，重算權重；
 *                          大幅重分配 / 歸零 / 恢復 → weight_shift 事件
 * 所有層都關閉的模型為「凍結」：沿用舊擬合外推（預測向後平移 staleBars 期），不寫快照。
 *
 * 同一日期的新 K 棒（盤中價更新）視為覆寫最後一根：非凍結模型以滾動視窗重擬合，第 4 層不更新
 * （當日實際值尚未定案）。
 */
import type { Bar, ForecastModel, ModelDescription, ModelId, PredictionSnapshot, PriceSeries, SystemEvent } from '../types';
import type { Store } from '../storage/types';
import { newId as defaultNewId } from '../storage';
import { nextTradingDays } from '../calendar';
import { benchmarkForecasts } from '../benchmarks';
import { combineForecasts, EnsembleWeightState, type EnsembleWeightStateData, type WeightUpdateReport } from './ensemble-weights';
import { fitModel, trailingWindow } from './rolling';
import { getKalmanTrace, getRlsTrace, isKalmanModel, isRlsModel, makeCreateModel, pUpFromForecast, type CreateModel, type EngineDeps } from './models';
import { buildSnapshots, writeSnapshots } from './snapshot';
import { backfillOutcomes } from './backfill';
import { resolveConfig, type AnalysisResult, type EngineConfig, type IngestResult, type ModelRunResult, type RlsTracePoint, type UpdatedBy } from './types';

export type { EngineDeps } from './models';

/** 模型使用的價格：還原價優先 */
export function barPrice(b: Bar): number {
  return b.adjClose ?? b.close;
}

interface Slot {
  id: ModelId;
  model: ForecastModel | null;
  ok: boolean;
  error?: string;
  updatedBy: UpdatedBy;
  /** 模型最後觀測落後序列尾端的 K 棒數（凍結時 > 0） */
  lag: number;
  /** 上次全量錨定後的線上更新次數 */
  sinceAnchor: number;
  fitMs: number;
}

const MAX_TRACE = 500;
const MAX_HISTORY = 1000;

export class CorrectionSession {
  readonly config: EngineConfig;
  private create: CreateModel;
  private deps: EngineDeps;
  private meta: Omit<PriceSeries, 'bars'>;
  private bars: Bar[] = [];
  private prices: number[] = [];
  private slots = new Map<ModelId, Slot>();
  private weights: EnsembleWeightState;
  /** 上一輪各模型對下一期的一步預測（第 4 層使用） */
  private prevOneStep: Record<string, number> = {};
  private kalmanAlertSeen = new Map<ModelId, number>();
  private rlsTraces: Record<string, RlsTracePoint[]> = {};
  private result!: AnalysisResult;
  private lastLayers: AnalysisResult['layersRun'] = { rollingRefit: [], rls: [], kalman: [], ensembleReweight: false };
  private warnings: string[] = [];

  constructor(series: PriceSeries, config: Partial<EngineConfig> = {}, deps: EngineDeps = {}, weightState?: EnsembleWeightStateData) {
    const t0 = performance.now();
    this.config = resolveConfig(config);
    this.deps = deps;
    this.create = makeCreateModel(deps);
    const { bars, ...meta } = series;
    this.meta = meta;
    this.bars = bars.filter((b) => Number.isFinite(barPrice(b)) && barPrice(b) > 0);
    if (this.bars.length < 10) throw new Error(`${series.symbol}: 至少需要 10 根有效 K 棒（目前 ${this.bars.length}）`);
    this.prices = this.bars.map(barPrice);

    const members = this.memberIds();
    // 第 1 層：全量擬合
    const ran: ModelId[] = [];
    for (const id of members) {
      this.refitSlot(id);
      ran.push(id);
    }
    this.weights = weightState
      ? EnsembleWeightState.fromJSON(weightState)
      : new EnsembleWeightState(members, { eta: this.config.eta, k: this.config.errorWindow, rule: this.config.zeroWeightRule });
    for (const id of members) this.weights.addModel(id);
    if (!weightState) this.initWeights();
    this.lastLayers = { rollingRefit: ran, rls: [], kalman: [], ensembleReweight: false };
    this.result = this.buildResult(t0, null);
  }

  // ───────── 公開 API ─────────

  getResult(): AnalysisResult {
    return this.result;
  }

  getWeightState(): EnsembleWeightStateData {
    return this.weights.toJSON();
  }

  getBars(): Bar[] {
    return this.bars.slice();
  }

  get symbol(): string {
    return this.meta.symbol;
  }

  /** 逐筆修正。回傳更新後結果、需寫入的快照與事件。 */
  ingest(bar: Bar): IngestResult {
    const t0 = performance.now();
    const y = barPrice(bar);
    if (!Number.isFinite(y) || y <= 0) throw new Error(`無效價格 ${y}`);
    const lastDate = this.bars[this.bars.length - 1].date;
    if (bar.date < lastDate) throw new Error(`K 棒日期 ${bar.date} 早於最後日期 ${lastDate}（不接受亂序資料）`);
    const replaced = bar.date === lastDate;
    const L = this.config.layers;
    const layers: AnalysisResult['layersRun'] = { rollingRefit: [], rls: [], kalman: [], ensembleReweight: false };
    let report: WeightUpdateReport | null = null;
    const events: SystemEvent[] = [];

    if (replaced) {
      this.bars[this.bars.length - 1] = bar;
      this.prices[this.prices.length - 1] = y;
      for (const id of this.memberIds()) {
        const s = this.slots.get(id)!;
        if (s.ok && s.lag > 0 && !L.rollingRefit) continue; // 凍結模型保持凍結
        this.refitSlot(id);
        layers.rollingRefit.push(id);
      }
    } else {
      const prevPrice = this.prices[this.prices.length - 1];
      const preds = { ...this.prevOneStep };
      this.bars.push(bar);
      this.prices.push(y);
      if (this.bars.length > MAX_HISTORY * 4) {
        // 避免長時間盤中執行記憶體無限成長（保留足夠視窗）
        const drop = this.bars.length - MAX_HISTORY * 2;
        this.bars.splice(0, drop);
        this.prices.splice(0, drop);
      }
      for (const id of this.memberIds()) {
        const s = this.slots.get(id)!;
        const online = s.ok && s.model ? (L.kalman && isKalmanModel(id, s.model) ? 'kalman' : L.rls && isRlsModel(id, s.model) ? 'rls' : null) : null;
        if (online) {
          const t1 = performance.now();
          try {
            // 補上凍結期間錯過的觀測，再加入新觀測
            const missed = this.prices.slice(this.prices.length - 1 - s.lag, this.prices.length);
            for (const p of missed) s.model!.update(p);
            s.lag = 0;
            s.sinceAnchor++;
            s.updatedBy = online;
            s.fitMs = performance.now() - t1;
            (online === 'kalman' ? layers.kalman : layers.rls).push(id);
            if (online === 'rls') this.collectRls(id, s.model!, missed.length);
            if (online === 'rls' && L.rollingRefit && this.config.reanchorEvery > 0 && s.sinceAnchor >= this.config.reanchorEvery) {
              this.refitSlot(id);
              layers.rollingRefit.push(id);
            }
          } catch (e) {
            this.warnings.push(`${id} 線上更新失敗，改以滾動視窗重擬合：${e instanceof Error ? e.message : String(e)}`);
            this.refitSlot(id);
            layers.rollingRefit.push(id);
          }
        } else if (L.rollingRefit) {
          this.refitSlot(id);
          layers.rollingRefit.push(id);
        } else {
          s.lag++;
          s.updatedBy = 'frozen';
        }
      }
      // 第 4 層
      if (L.ensembleReweight) {
        report = this.weights.update(y, prevPrice, preds, this.activeMembers());
        layers.ensembleReweight = true;
      }
    }

    this.lastLayers = layers;
    this.result = this.buildResult(t0, report);

    // 事件：卡爾曼結構性變化
    for (const [id, seen] of this.kalmanAlertSeen) {
      const s = this.slots.get(id);
      if (!s?.model) continue;
      const { alerts } = getKalmanTrace(s.model);
      for (const a of alerts.slice(seen)) {
        events.push(
          this.event('structural_break', 'warn', `${this.meta.symbol} 結構性變化警示（${id}）`, {
            modelId: id,
            date: this.result.lastDate,
            step: a.step,
            message: a.message,
            qScale: a.qScale,
          }),
        );
      }
      this.kalmanAlertSeen.set(id, alerts.length);
    }
    // 事件：集成權重大幅重分配
    if (report && (report.shift >= this.config.weightShiftThreshold || report.zeroedNow.length || report.restoredNow.length)) {
      const st = this.result.weightStatus;
      events.push(
        this.event('weight_shift', report.zeroedNow.length ? 'warn' : 'info', `${this.meta.symbol} 集成權重重分配 ${(report.shift * 100).toFixed(0)}%`, {
          date: this.result.lastDate,
          shift: report.shift,
          previous: report.previous,
          weights: report.weights,
          zeroed: report.zeroedNow.map((id) => ({ id, reason: st[id]?.reason })),
          restored: report.restoredNow,
        }),
      );
    }

    const snapshots = buildSnapshots(this.result, { now: this.deps.now, newId: this.deps.newId });
    return { result: this.result, snapshots, events, replacedLastBar: replaced };
  }

  /** ingest + 寫入快照、事件，並回填已到期的實際值 */
  async ingestAndPersist(store: Store, bar: Bar): Promise<IngestResult & { outcomesAdded: number }> {
    const r = this.ingest(bar);
    await writeSnapshots(store, r.snapshots);
    for (const e of r.events) await store.appendEvent(e);
    const outcomesAdded = await backfillOutcomes(store, this.meta.symbol, this.bars, { now: this.deps.now });
    return { ...r, outcomesAdded };
  }

  // ───────── 內部 ─────────

  private memberIds(): ModelId[] {
    return this.config.models.filter((m) => m !== 'ensemble');
  }

  private activeMembers(): ModelId[] {
    return this.memberIds().filter((id) => this.slots.get(id)?.ok);
  }

  private refitSlot(id: ModelId) {
    const { slice } = trailingWindow(this.prices, this.config.window);
    const r = fitModel(this.create, id, slice, this.config);
    const prev = this.slots.get(id);
    const s: Slot = { id, model: r.model, ok: r.ok, error: r.error, updatedBy: 'refit', lag: 0, sinceAnchor: 0, fitMs: r.ms };
    if (!r.ok && prev?.ok && prev.model) {
      // 保留前一個可用模型，標記錯誤
      this.warnings.push(`${id} 重擬合失敗，沿用上一版：${r.error}`);
      s.model = prev.model;
      s.ok = true;
      s.lag = prev.lag + 1;
      s.updatedBy = 'frozen';
    }
    this.slots.set(id, s);
    if (s.ok && s.model && isKalmanModel(id, s.model)) this.kalmanAlertSeen.set(id, getKalmanTrace(s.model).alerts.length);
    if (s.ok && s.model && isRlsModel(id, s.model)) this.rlsTraces[id] = this.rlsTraces[id] ?? [];
  }

  private collectRls(id: ModelId, model: ForecastModel, count: number) {
    const tr = getRlsTrace(model).slice(-count);
    const arr = (this.rlsTraces[id] = this.rlsTraces[id] ?? []);
    arr.push(...tr);
    if (arr.length > MAX_TRACE) arr.splice(0, arr.length - MAX_TRACE);
  }

  /** 依設定初始化集成權重狀態 */
  private initWeights() {
    const k = this.config.errorWindow;
    const n = this.prices.length;
    const members = this.activeMembers();
    if (!members.length) return;
    if (this.config.weightInit === 'oos') {
      for (let o = Math.max(2, n - k - 1); o <= n - 2; o++) {
        const win = trailingWindow(this.prices.slice(0, o + 1), this.config.window).slice;
        const preds: Record<string, number> = {};
        for (const id of members) {
          const r = fitModel(this.create, id, win, this.config);
          if (r.ok && r.model) {
            try {
              preds[id] = r.model.predict(1, this.config.level).mean[0];
            } catch {
              /* 略過 */
            }
          }
        }
        this.weights.update(this.prices[o + 1], this.prices[o], preds, members);
      }
    } else {
      // 樣本內：最後 k 筆的擬合值 vs 實際值
      const fittedById: Record<string, number[]> = {};
      for (const id of members) fittedById[id] = this.slots.get(id)!.model!.fitted();
      for (let i = Math.max(1, n - k); i < n; i++) {
        const preds: Record<string, number> = {};
        for (const id of members) {
          const f = fittedById[id];
          const j = f.length - (n - i);
          if (j >= 0) preds[id] = f[j];
        }
        this.weights.update(this.prices[i], this.prices[i - 1], preds, members);
      }
      this.warnings.push('集成權重以樣本內殘差初始化（weightInit = insample），之後每根 K 棒以樣本外一步預測更新');
    }
  }

  private event(kind: SystemEvent['kind'], severity: SystemEvent['severity'], title: string, detail: Record<string, unknown>): SystemEvent {
    return {
      id: (this.deps.newId ?? defaultNewId)(),
      at: (this.deps.now ?? (() => new Date()))().toISOString(),
      kind,
      symbol: this.meta.symbol,
      severity,
      title,
      detail,
    };
  }

  private runSlot(s: Slot, h: number, level: number, dates: string[]): ModelRunResult {
    const n = this.prices.length;
    const last = this.prices[n - 1];
    const base: ModelRunResult = {
      id: s.id,
      name: s.id,
      version: '',
      ok: false,
      error: s.error,
      fitted: [],
      residuals: [],
      fittedFrom: null,
      fittedTo: null,
      forecast: null,
      direction: null,
      pUp: [],
      description: null,
      updatedBy: s.updatedBy,
      staleBars: s.lag,
      fitMs: s.fitMs,
    };
    if (!s.ok || !s.model) return base;
    try {
      const m = s.model;
      const full = m.predict(h + s.lag, level);
      const forecast = { horizon: h, level: full.level, mean: full.mean.slice(s.lag), lower: full.lower.slice(s.lag), upper: full.upper.slice(s.lag) };
      const pUp = pUpFromForecast(forecast, last);
      let direction = null;
      if (s.lag === 0) {
        try {
          direction = m.direction(h);
          pUp[h - 1] = direction.pUp;
        } catch {
          direction = null;
        }
      }
      if (!direction) {
        const p = pUp[h - 1];
        direction = { pUp: p, signal: p > 0.5 ? ('up' as const) : p < 0.5 ? ('down' as const) : ('neutral' as const) };
      }
      const fitted = m.fitted();
      const residuals = m.residuals();
      const endIdx = n - 1 - s.lag;
      const startIdx = endIdx - (fitted.length - 1);
      let description: ModelDescription | null = null;
      try {
        description = m.describe();
      } catch {
        description = null;
      }
      return {
        ...base,
        ok: true,
        error: undefined,
        name: description?.name ?? s.id,
        version: m.version,
        fitted,
        residuals,
        fittedFrom: dates[Math.max(0, startIdx)] ?? null,
        fittedTo: dates[endIdx] ?? null,
        forecast,
        direction,
        pUp,
        description,
      };
    } catch (e) {
      return { ...base, error: `預測失敗：${e instanceof Error ? e.message : String(e)}` };
    }
  }

  private buildResult(t0: number, report: WeightUpdateReport | null): AnalysisResult {
    const c = this.config;
    const h = c.horizon;
    const n = this.prices.length;
    const dates = this.bars.map((b) => b.date);
    const lastDate = dates[n - 1];
    const lastPrice = this.prices[n - 1];
    const results: AnalysisResult['results'] = {};
    const perModelMs: Record<string, number> = {};
    const order: ModelId[] = [];
    let kalmanTrace: AnalysisResult['kalmanTrace'] = [];
    let kalmanAlerts: AnalysisResult['kalmanAlerts'] = [];
    let minStart = n - Math.min(n, c.window);

    for (const id of this.memberIds()) {
      const s = this.slots.get(id)!;
      const r = this.runSlot(s, h, c.level, dates);
      results[id] = r;
      order.push(id);
      perModelMs[id] = s.fitMs;
      if (r.ok) {
        this.prevOneStep[id] = r.forecast!.mean[0];
        if (r.fittedFrom) minStart = Math.min(minStart, Math.max(0, n - 1 - s.lag - (r.fitted.length - 1)));
      } else delete this.prevOneStep[id];
      if (s.ok && s.model && isKalmanModel(id, s.model)) {
        const k = getKalmanTrace(s.model);
        kalmanTrace = k.trace.slice(-MAX_TRACE);
        kalmanAlerts = k.alerts.slice(-100);
      }
    }
    for (const id of Object.keys(this.prevOneStep)) if (!this.memberIds().includes(id as ModelId)) delete this.prevOneStep[id];

    // 集成
    const tE = performance.now();
    const active = this.activeMembers().filter((id) => results[id as ModelId]?.ok);
    const ensembleWeights = this.weights.weights(active);
    const weightStatus = this.weights.status(active);
    if (c.models.includes('ensemble')) {
      order.push('ensemble');
      results.ensemble = this.buildEnsemble(results, ensembleWeights, report, lastPrice, h, c.level, dates);
    }
    const ensembleMs = performance.now() - tE;

    const tB = performance.now();
    const benchmarks = benchmarkForecasts(trailingWindow(this.prices, Math.max(c.window, 60)).slice, h, c.customBenchmark);
    const benchmarksMs = performance.now() - tB;

    const hs = Math.max(0, Math.min(minStart, n - MAX_HISTORY));
    const winStart = n - Math.min(n, c.window);
    const rlsTrace: Record<string, RlsTracePoint[]> = {};
    for (const [id, tr] of Object.entries(this.rlsTraces)) if (this.slots.get(id as ModelId)?.ok) rlsTrace[id] = tr.slice();

    return {
      symbol: this.meta.symbol,
      market: this.meta.market,
      currency: this.meta.currency,
      source: this.meta.source,
      asOf: this.bars[n - 1].t ? new Date(this.bars[n - 1].t).toISOString() : this.meta.asOf,
      generatedAt: (this.deps.now ?? (() => new Date()))().toISOString(),
      lastDate,
      lastPrice,
      priceField: this.bars.some((b) => b.adjClose != null) ? 'adjClose' : 'close',
      trainStart: dates[winStart],
      trainEnd: lastDate,
      trainSize: n - winStart,
      horizon: h,
      level: c.level,
      targetDates: nextTradingDays(this.meta.market, lastDate, h),
      history: { dates: dates.slice(hs), prices: this.prices.slice(hs) },
      results,
      order,
      benchmarks,
      ensembleWeights,
      weightStatus,
      kalmanTrace,
      kalmanAlerts,
      rlsTrace,
      layersRun: this.lastLayers,
      config: c,
      timings: { totalMs: performance.now() - t0, perModelMs, benchmarksMs, ensembleMs },
      warnings: [...new Set(this.warnings)].slice(-20),
    };
  }

  private buildEnsemble(
    results: AnalysisResult['results'],
    weights: Record<string, number>,
    report: WeightUpdateReport | null,
    lastPrice: number,
    h: number,
    level: number,
    dates: string[],
  ): ModelRunResult {
    const members: Record<string, { mean: number[]; lower: number[]; upper: number[] }> = {};
    for (const [id, w] of Object.entries(weights)) {
      const r = results[id as ModelId];
      if (r?.ok && r.forecast && w > 0) members[id] = r.forecast;
    }
    const comb = combineForecasts(members, weights);
    const anyUpdated = Object.keys(members).some((id) => results[id as ModelId]!.updatedBy !== 'frozen');
    const updatedBy: UpdatedBy = report ? 'ensemble' : anyUpdated ? 'refit' : 'frozen';
    const description: ModelDescription = {
      id: 'ensemble',
      name: '動態加權集成',
      version: '1.0.0',
      formulaLatex: 'w_m=\\frac{\\bar e_m^{-2}}{\\sum_j \\bar e_j^{-2}},\\quad \\bar e_m^{(t)}=\\eta\\,|y_t-\\hat y_{m,t}|+(1-\\eta)\\,\\bar e_m^{(t-1)}',
      params: { ...weights },
      paramSpecs: [
        { key: 'eta', label: '誤差平滑係數 η', min: 0.01, max: 1, step: 0.01, default: 0.1 },
        { key: 'errorWindow', label: '方向準確率視窗 k', min: 5, max: 60, step: 1, default: 20 },
      ],
      useCases: '多個模型各有擅長市況時，以近期一步誤差自動分配權重。',
      failureModes: '市況突變時權重調整落後；所有成員同向偏誤時集成也無法修正。',
      derivation:
        '每個成員維護一步預測絕對誤差的指數移動平均 $\\bar e_m$，權重與 $\\bar e_m^{-2}$ 成正比（近似逆 MSE 加權）。' +
        '方向準確率連續 10 期低於 50% 的成員權重暫時歸零。區間上下界取成員上下界的加權平均。',
      diagnostics: {
        members: Object.keys(weights).length,
        zeroed: Object.values(this.weights.status(Object.keys(weights))).filter((s) => s.zeroed).length,
        lastShift: report?.shift ?? 0,
        weightStep: this.weights.currentStep,
      },
    };
    if (!comb) {
      return {
        id: 'ensemble',
        name: description.name,
        version: description.version,
        ok: false,
        error: '沒有可用的成員模型',
        fitted: [],
        residuals: [],
        fittedFrom: null,
        fittedTo: null,
        forecast: null,
        direction: null,
        pUp: [],
        description,
        updatedBy,
        staleBars: 0,
        fitMs: 0,
      };
    }
    const forecast = { horizon: h, level, ...comb };
    const pUp = pUpFromForecast(forecast, lastPrice);
    const p = pUp[h - 1];
    // 擬合值：成員中尾端對齊最新日期者的共同區段加權平均
    const aligned = Object.keys(members).filter((id) => results[id as ModelId]!.fittedTo === dates[dates.length - 1]);
    const len = aligned.length ? Math.min(...aligned.map((id) => results[id as ModelId]!.fitted.length)) : 0;
    const tw = aligned.reduce((a, id) => a + weights[id], 0);
    const fitted = new Array<number>(len).fill(0);
    for (const id of aligned) {
      const f = results[id as ModelId]!.fitted;
      for (let i = 0; i < len; i++) fitted[i] += (weights[id] / tw) * f[f.length - len + i];
    }
    const yTail = this.prices.slice(this.prices.length - len);
    return {
      id: 'ensemble',
      name: description.name,
      version: description.version,
      ok: true,
      fitted,
      residuals: yTail.map((v, i) => v - fitted[i]),
      fittedFrom: len ? dates[dates.length - len] : null,
      fittedTo: len ? dates[dates.length - 1] : null,
      forecast,
      direction: { pUp: p, signal: p > 0.5 ? 'up' : p < 0.5 ? 'down' : 'neutral' },
      pUp,
      description,
      updatedBy,
      staleBars: 0,
      fitMs: 0,
    };
  }
}

/** 全量分析（第 1 層全量擬合 + 集成權重初始化 + 基準） */
export async function analyze(series: PriceSeries, config: Partial<EngineConfig> = {}, deps: EngineDeps = {}): Promise<AnalysisResult> {
  return new CorrectionSession(series, config, deps).getResult();
}

/** 全量分析並建立快照（排程用） */
export async function analyzeAndSnapshot(
  series: PriceSeries,
  config: Partial<EngineConfig> = {},
  deps: EngineDeps = {},
  trigger: PredictionSnapshot['trigger'] = 'schedule',
): Promise<{ result: AnalysisResult; snapshots: PredictionSnapshot[] }> {
  const result = await analyze(series, config, deps);
  return { result, snapshots: buildSnapshots(result, { trigger, now: deps.now, newId: deps.newId }) };
}
