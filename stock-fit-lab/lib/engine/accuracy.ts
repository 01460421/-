/**
 * 歷史預測準度回顧（規格第五節）。
 *
 * 所有數據「只」來自當時真實寫入的快照（PredictionSnapshot）與回填結果（SnapshotOutcome）：
 * 誤差、絕對百分比誤差、是否落在區間、方向是否正確都直接讀取回填時寫入的欄位，
 * 基準值讀取快照當時記錄的 benchmarks 欄位 —— 絕不以現在的模型重算，避免前視偏誤。
 *
 * 功能：
 *  - scorecard：代號 × 模型 × 期數（1/5/10/20）計分卡，近 1/3/6/12 個月或自訂區間
 *  - mapeTrend：準度趨勢（預測發出日 × MAPE）
 *  - replayAt：回放到任一過去時點
 *  - snapshotDetail：單次預測詳情 + 誤差分解（偏差² + 變異）
 *  - confusionMatrix：看漲 / 看跌 / 觀望 × 實際漲 / 跌
 *  - monthlyReport + toCsv：月度報告
 * 疑似資料洩漏（方向 > 70% 或 U < 0.5）的列在稽核通過前隱藏（規格第八節）。
 */
import type { Bar, BenchmarkId, PredictionSnapshot, SnapshotOutcome } from '../types';
import type { Store } from '../storage/types';
import { compareToBenchmark, type BenchmarkComparison } from '../metrics';
import { binomialTestGreater } from '../math/stats';
import { LEAK_LABEL } from './leak-audit-label';

export type Period = '1m' | '3m' | '6m' | '12m' | { from: string; to: string };

export interface SnapRecord {
  snapshot: PredictionSnapshot;
  /** horizonIndex → outcome */
  outcomes: Map<number, SnapshotOutcome>;
}

export interface AccuracyQuery {
  symbol?: string;
  symbols?: string[];
  models?: string[];
  period?: Period;
  /** 預設 [1, 5, 10, 20] */
  horizons?: number[];
  now?: Date;
  /** 出手門檻（預設 P ≥ 0.65 看漲、≤ 0.35 看跌） */
  actThresholds?: { up: number; down: number };
  /** 'lastPerDay'（預設）：同一代號 × 模型 × 訓練迄日只取最後一筆快照，避免盤中多次修正重複計分 */
  dedupe?: 'none' | 'lastPerDay';
  /** 已通過洩漏稽核的「代號|模型」鍵 */
  auditPassed?: string[];
  leakThresholds?: { maxDirAcc?: number; minTheilU?: number; minN?: number };
}

export interface ScorecardRow {
  symbol: string;
  modelId: string;
  horizon: number;
  n: number;
  mae: number;
  rmse: number;
  mape: number;
  directionAccuracy: number;
  dirN: number;
  /** 方向準確率 > 50% 的二項檢定 p 值 */
  dirPValue: number;
  /** 出手（P ≥ up 或 ≤ down）時的準確率 */
  actHitRate: number;
  /** 出手比例 */
  actRatio: number;
  actN: number;
  coverage: number;
  theilU: number;
  longestCorrectStreak: number;
  longestWrongStreak: number;
  /** 同期快照記錄的 naive 基準 */
  naive: { mae: number; rmse: number; mape: number };
  vsNaive: BenchmarkComparison | null;
  firstIssued: string | null;
  lastIssued: string | null;
  leakSuspect: boolean;
  /** 疑似洩漏且稽核未通過 → 隱藏（數值為 NaN） */
  hidden: boolean;
  hiddenReason?: string;
}

// ───────── 期間與載入 ─────────

export function periodRange(period: Period = '3m', now = new Date()): { from: string; to: string } {
  if (typeof period === 'object') return period;
  const months = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[period];
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return { from: d.toISOString().slice(0, 10), to: now.toISOString() };
}

async function outcomesFor(store: Store, ids: string[]): Promise<SnapshotOutcome[]> {
  const out: SnapshotOutcome[] = [];
  for (let i = 0; i < ids.length; i += 500) out.push(...(await store.listOutcomes(ids.slice(i, i + 500))));
  return out;
}

export function dedupeLastPerDay(snaps: PredictionSnapshot[]): PredictionSnapshot[] {
  const best = new Map<string, PredictionSnapshot>();
  for (const s of snaps) {
    const k = `${s.symbol}|${s.modelId}|${s.trainEnd}`;
    const cur = best.get(k);
    if (!cur || s.createdAt > cur.createdAt) best.set(k, s);
  }
  return [...best.values()];
}

/** 載入快照與回填結果（唯一資料來源） */
export async function loadRecords(store: Store, q: AccuracyQuery = {}): Promise<SnapRecord[]> {
  const { from, to } = periodRange(q.period ?? '3m', q.now);
  const symbols = q.symbols ?? (q.symbol ? [q.symbol] : [undefined]);
  let snaps: PredictionSnapshot[] = [];
  for (const symbol of symbols) snaps.push(...(await store.listSnapshots({ symbol, from, to })));
  if (q.models?.length) snaps = snaps.filter((s) => q.models!.includes(s.modelId));
  snaps = snaps.filter((s) => Array.isArray(s.mean) && s.mean.length);
  if ((q.dedupe ?? 'lastPerDay') === 'lastPerDay') snaps = dedupeLastPerDay(snaps);
  const outs = await outcomesFor(
    store,
    snaps.map((s) => s.id),
  );
  const byId = new Map<string, Map<number, SnapshotOutcome>>();
  for (const o of outs) {
    if (!byId.has(o.snapshotId)) byId.set(o.snapshotId, new Map());
    byId.get(o.snapshotId)!.set(o.horizonIndex, o);
  }
  return snaps
    .map((snapshot) => ({ snapshot, outcomes: byId.get(snapshot.id) ?? new Map() }))
    .sort((a, b) => (a.snapshot.createdAt < b.snapshot.createdAt ? -1 : 1));
}

// ───────── 計分卡 ─────────

function streaks(seq: boolean[]): { correct: number; wrong: number } {
  let c = 0;
  let w = 0;
  let bc = 0;
  let bw = 0;
  for (const v of seq) {
    if (v) {
      c++;
      w = 0;
    } else {
      w++;
      c = 0;
    }
    bc = Math.max(bc, c);
    bw = Math.max(bw, w);
  }
  return { correct: bc, wrong: bw };
}

const avg = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);

/** 由同一 (symbol, model, h) 的紀錄計算一列 */
export function scoreRow(symbol: string, modelId: string, h: number, recs: SnapRecord[], q: AccuracyQuery = {}): ScorecardRow {
  const up = q.actThresholds?.up ?? 0.65;
  const down = q.actThresholds?.down ?? 0.35;
  const i = h - 1;
  const absE: number[] = [];
  const sqE: number[] = [];
  const ape: number[] = [];
  const inInt: number[] = [];
  const dir: boolean[] = [];
  const nE: number[] = [];
  const nSq: number[] = [];
  const nApe: number[] = [];
  let theilNum = 0;
  let theilDen = 0;
  let actN = 0;
  let actHit = 0;
  let total = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const r of recs) {
    const o = r.outcomes.get(i);
    const s = r.snapshot;
    if (!o || s.targetDates.length < h) continue;
    total++;
    first = first ?? s.createdAt;
    last = s.createdAt;
    absE.push(Math.abs(o.error));
    sqE.push(o.error * o.error);
    if (Number.isFinite(o.absPctError)) ape.push(o.absPctError);
    inInt.push(o.inInterval ? 1 : 0);
    if (o.directionCorrect !== null) dir.push(o.directionCorrect);
    const nb = s.benchmarks.naive?.[i] ?? s.lastPrice;
    const ne = o.actual - nb;
    nE.push(Math.abs(ne));
    nSq.push(ne * ne);
    if (o.actual) nApe.push((Math.abs(ne) / Math.abs(o.actual)) * 100);
    theilNum += (o.error / s.lastPrice) ** 2;
    theilDen += ((o.actual - s.lastPrice) / s.lastPrice) ** 2;
    const p = s.pUp?.[i];
    if (p !== undefined && Number.isFinite(p) && (p >= up || p <= down) && o.actual !== s.lastPrice) {
      actN++;
      if ((p >= up && o.actual > s.lastPrice) || (p <= down && o.actual < s.lastPrice)) actHit++;
    }
  }
  const hits = dir.filter(Boolean).length;
  const st = streaks(dir);
  const row: ScorecardRow = {
    symbol,
    modelId,
    horizon: h,
    n: total,
    mae: avg(absE),
    rmse: Math.sqrt(avg(sqE)),
    mape: avg(ape),
    directionAccuracy: dir.length ? hits / dir.length : NaN,
    dirN: dir.length,
    dirPValue: binomialTestGreater(hits, dir.length),
    actHitRate: actN ? actHit / actN : NaN,
    actRatio: total ? actN / total : NaN,
    actN,
    coverage: avg(inInt),
    theilU: theilDen > 0 ? Math.sqrt(theilNum / theilDen) : NaN,
    longestCorrectStreak: st.correct,
    longestWrongStreak: st.wrong,
    naive: { mae: avg(nE), rmse: Math.sqrt(avg(nSq)), mape: avg(nApe) },
    vsNaive: null,
    firstIssued: first,
    lastIssued: last,
    leakSuspect: false,
    hidden: false,
  };
  if (total) {
    row.vsNaive = compareToBenchmark(
      { n: total, mae: row.mae, rmse: row.rmse, mape: row.mape, directionAccuracy: row.directionAccuracy, theilU: row.theilU, coverage: row.coverage, dirN: row.dirN },
      { n: total, mae: row.naive.mae, rmse: row.naive.rmse, mape: row.naive.mape, directionAccuracy: NaN, theilU: 1, coverage: NaN },
      { level: recs[0]?.snapshot.level ?? 0.9 },
    );
  }
  // 洩漏旗標
  const th = q.leakThresholds ?? {};
  const minN = th.minN ?? 20;
  const suspect = (row.dirN >= minN && row.directionAccuracy > (th.maxDirAcc ?? 0.7)) || (row.n >= minN && row.theilU < (th.minTheilU ?? 0.5));
  if (suspect) {
    row.leakSuspect = true;
    if (!q.auditPassed?.includes(`${symbol}|${modelId}`)) {
      row.hidden = true;
      row.hiddenReason = `${LEAK_LABEL}：稽核通過前不顯示`;
      for (const k of ['mae', 'rmse', 'mape', 'directionAccuracy', 'dirPValue', 'actHitRate', 'coverage', 'theilU'] as const) row[k] = NaN;
      row.vsNaive = null;
    }
  }
  return row;
}

/** 預設排序：方向準確率 → 出手準確率 → 最長連續判對（NaN 置後） */
export function sortScorecard(rows: ScorecardRow[]): ScorecardRow[] {
  const key = (v: number) => (Number.isFinite(v) ? v : -Infinity);
  return [...rows].sort(
    (a, b) =>
      key(b.directionAccuracy) - key(a.directionAccuracy) ||
      key(b.actHitRate) - key(a.actHitRate) ||
      b.longestCorrectStreak - a.longestCorrectStreak ||
      a.symbol.localeCompare(b.symbol) ||
      a.modelId.localeCompare(b.modelId) ||
      a.horizon - b.horizon,
  );
}

export function scorecardFromRecords(records: SnapRecord[], q: AccuracyQuery = {}): ScorecardRow[] {
  const horizons = q.horizons ?? [1, 5, 10, 20];
  const groups = new Map<string, SnapRecord[]>();
  for (const r of records) {
    const k = `${r.snapshot.symbol}\u0000${r.snapshot.modelId}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const rows: ScorecardRow[] = [];
  for (const [k, recs] of groups) {
    const [symbol, modelId] = k.split('\u0000');
    for (const h of horizons) {
      const row = scoreRow(symbol, modelId, h, recs, q);
      if (row.n > 0) rows.push(row);
    }
  }
  return sortScorecard(rows);
}

export async function scorecard(store: Store, q: AccuracyQuery = {}): Promise<ScorecardRow[]> {
  return scorecardFromRecords(await loadRecords(store, q), q);
}

// ───────── 準度趨勢 ─────────

export interface TrendPoint {
  /** 預測發出日（快照 createdAt 的日期部分） */
  date: string;
  createdAt: string;
  snapshotId: string;
  mape: number;
  /** 已回填的期數 */
  n: number;
}

/** 每個模型一條線：橫軸預測發出日，縱軸該次預測的 MAPE（指定 horizon 時只取該期） */
export async function mapeTrend(store: Store, q: AccuracyQuery & { horizon?: number } = {}): Promise<Record<string, TrendPoint[]>> {
  const recs = await loadRecords(store, q);
  const out: Record<string, TrendPoint[]> = {};
  for (const r of recs) {
    const os = [...r.outcomes.values()].filter((o) => (q.horizon ? o.horizonIndex === q.horizon - 1 : true) && Number.isFinite(o.absPctError));
    if (!os.length) continue;
    (out[r.snapshot.modelId] = out[r.snapshot.modelId] ?? []).push({
      date: r.snapshot.createdAt.slice(0, 10),
      createdAt: r.snapshot.createdAt,
      snapshotId: r.snapshot.id,
      mape: avg(os.map((o) => o.absPctError)),
      n: os.length,
    });
  }
  return out;
}

// ───────── 回放 ─────────

export interface ReplayResult {
  date: string;
  /** 當時已知的最新快照（每模型一筆） */
  snapshots: PredictionSnapshot[];
  /** 這些快照之後回填的實際值 */
  outcomes: Record<string, SnapshotOutcome[]>;
  /** 當時已知的價格（需傳入 bars） */
  known: { date: string; price: number }[];
  /** 之後的真實走勢（需傳入 bars） */
  after: { date: string; price: number }[];
}

/** 回到過去時點 date：只取當時已建立的快照（createdAt ≤ date 當日結束） */
export async function replayAt(store: Store, symbol: string, date: string, opts: { bars?: Bar[]; models?: string[] } = {}): Promise<ReplayResult> {
  const end = date.length === 10 ? `${date}T23:59:59.999Z` : date;
  const day = date.slice(0, 10);
  const snaps = (await store.listSnapshots({ symbol, to: end })).filter((s) => s.createdAt <= end && s.trainEnd <= day && (!opts.models || opts.models.includes(s.modelId)));
  const latest = new Map<string, PredictionSnapshot>();
  for (const s of snaps) {
    const cur = latest.get(s.modelId);
    if (!cur || s.createdAt > cur.createdAt) latest.set(s.modelId, s);
  }
  const chosen = [...latest.values()];
  const outs = await outcomesFor(
    store,
    chosen.map((s) => s.id),
  );
  const outcomes: Record<string, SnapshotOutcome[]> = {};
  for (const o of outs) (outcomes[o.snapshotId] = outcomes[o.snapshotId] ?? []).push(o);
  for (const k of Object.keys(outcomes)) outcomes[k].sort((a, b) => a.horizonIndex - b.horizonIndex);
  const px = (opts.bars ?? []).map((b) => ({ date: b.date, price: b.adjClose ?? b.close }));
  return { date, snapshots: chosen, outcomes, known: px.filter((p) => p.date <= day), after: px.filter((p) => p.date > day) };
}

// ───────── 單次預測詳情 ─────────

export interface SnapshotDetail {
  snapshot: PredictionSnapshot;
  outcomes: SnapshotOutcome[];
  /** 誤差分解：MSE = 偏差² + 變異 */
  decomposition: { n: number; bias: number; mse: number; biasSq: number; variance: number; biasShare: number };
  /** 當時記錄的基準在相同目標日的誤差 */
  benchmarkErrors: Partial<Record<BenchmarkId, { errors: number[]; mae: number }>>;
  coverage: number;
  directionHits: number;
  directionN: number;
}

export async function snapshotDetail(store: Store, id: string): Promise<SnapshotDetail | null> {
  const snapshot = await store.getSnapshot(id);
  if (!snapshot) return null;
  const outcomes = (await store.listOutcomes([id])).slice().sort((a, b) => a.horizonIndex - b.horizonIndex);
  const e = outcomes.map((o) => o.error);
  const n = e.length;
  const bias = avg(e);
  const mse = avg(e.map((x) => x * x));
  const variance = n ? avg(e.map((x) => (x - bias) ** 2)) : NaN;
  const benchmarkErrors: SnapshotDetail['benchmarkErrors'] = {};
  for (const [bid, vals] of Object.entries(snapshot.benchmarks)) {
    if (!vals) continue;
    const errs = outcomes.map((o) => o.actual - vals[o.horizonIndex]);
    benchmarkErrors[bid as BenchmarkId] = { errors: errs, mae: avg(errs.map(Math.abs)) };
  }
  const dir = outcomes.filter((o) => o.directionCorrect !== null);
  return {
    snapshot,
    outcomes,
    decomposition: { n, bias, mse, biasSq: bias * bias, variance, biasShare: mse > 0 ? (bias * bias) / mse : NaN },
    benchmarkErrors,
    coverage: avg(outcomes.map((o) => (o.inInterval ? 1 : 0))),
    directionHits: dir.filter((o) => o.directionCorrect).length,
    directionN: dir.length,
  };
}

// ───────── 混淆矩陣 ─────────

export interface ConfusionMatrix {
  predLabels: ['看漲', '看跌', '觀望'];
  actualLabels: ['上漲', '下跌'];
  /** matrix[預測類別][實際類別] */
  matrix: [[number, number], [number, number], [number, number]];
  total: number;
  /** 出手（看漲 + 看跌）準確率 */
  actAccuracy: number;
}

export function confusionFromRecords(records: SnapRecord[], horizon: number, th: { up: number; down: number } = { up: 0.65, down: 0.35 }): ConfusionMatrix {
  const m: ConfusionMatrix['matrix'] = [
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  const i = horizon - 1;
  let total = 0;
  for (const r of records) {
    const o = r.outcomes.get(i);
    const s = r.snapshot;
    if (!o || o.actual === s.lastPrice) continue;
    const p = s.pUp?.[i];
    let cls: 0 | 1 | 2;
    if (p !== undefined && Number.isFinite(p)) cls = p >= th.up ? 0 : p <= th.down ? 1 : 2;
    else cls = s.mean[i] > s.lastPrice ? 0 : s.mean[i] < s.lastPrice ? 1 : 2;
    m[cls][o.actual > s.lastPrice ? 0 : 1]++;
    total++;
  }
  const acted = m[0][0] + m[0][1] + m[1][0] + m[1][1];
  return { predLabels: ['看漲', '看跌', '觀望'], actualLabels: ['上漲', '下跌'], matrix: m, total, actAccuracy: acted ? (m[0][0] + m[1][1]) / acted : NaN };
}

export async function confusionMatrix(store: Store, q: AccuracyQuery & { horizon: number }): Promise<ConfusionMatrix> {
  return confusionFromRecords(await loadRecords(store, q), q.horizon, q.actThresholds);
}

// ───────── 月度報告 ─────────

export interface MonthlyReport {
  month: string;
  from: string;
  to: string;
  generatedAt: string;
  rows: ScorecardRow[];
  /** 每代號 × 期數的模型排名（依方向準確率） */
  ranking: { symbol: string; horizon: number; models: { modelId: string; directionAccuracy: number; mape: number; theilU: number }[] }[];
  /** 信賴區間覆蓋率實測值（每模型，所有期數彙總） */
  coverage: Record<string, { coverage: number; n: number; nominal: number }>;
  hiddenCount: number;
}

export async function monthlyReport(store: Store, q: Omit<AccuracyQuery, 'period'> & { month: string }): Promise<MonthlyReport> {
  const [y, mo] = q.month.split('-').map(Number);
  const from = `${q.month}-01`;
  const toD = new Date(Date.UTC(y, mo, 0));
  const to = `${toD.toISOString().slice(0, 10)}T23:59:59.999Z`;
  const recs = await loadRecords(store, { ...q, period: { from, to } });
  const rows = scorecardFromRecords(recs, q);
  const ranking: MonthlyReport['ranking'] = [];
  const groups = new Map<string, ScorecardRow[]>();
  for (const r of rows) {
    if (r.hidden) continue;
    const k = `${r.symbol}|${r.horizon}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  for (const [k, rs] of groups) {
    const [symbol, h] = k.split('|');
    ranking.push({ symbol, horizon: Number(h), models: sortScorecard(rs).map((r) => ({ modelId: r.modelId, directionAccuracy: r.directionAccuracy, mape: r.mape, theilU: r.theilU })) });
  }
  const covAcc: Record<string, { hit: number; n: number; nominal: number }> = {};
  for (const r of recs) {
    for (const o of r.outcomes.values()) {
      const c = (covAcc[r.snapshot.modelId] = covAcc[r.snapshot.modelId] ?? { hit: 0, n: 0, nominal: r.snapshot.level });
      c.n++;
      if (o.inInterval) c.hit++;
    }
  }
  const coverage: MonthlyReport['coverage'] = {};
  for (const [m, c] of Object.entries(covAcc)) coverage[m] = { coverage: c.n ? c.hit / c.n : NaN, n: c.n, nominal: c.nominal };
  return { month: q.month, from, to, generatedAt: new Date().toISOString(), rows, ranking, coverage, hiddenCount: rows.filter((r) => r.hidden).length };
}

// ───────── CSV ─────────

export interface CsvColumn<T> {
  key: keyof T | string;
  label: string;
  format?: (row: T) => string | number | null | undefined;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 通用 CSV 產生器（含 UTF-8 BOM 選項，Excel 開啟中文不亂碼） */
export function toCsv<T extends object>(rows: T[], columns?: CsvColumn<T>[], opts: { bom?: boolean } = {}): string {
  const cols: CsvColumn<T>[] = columns ?? (rows.length ? Object.keys(rows[0]).map((k) => ({ key: k, label: k })) : []);
  const lines = [cols.map((c) => csvCell(c.label)).join(',')];
  for (const r of rows) {
    lines.push(cols.map((c) => csvCell(c.format ? c.format(r) : (r as Record<string, unknown>)[c.key as string])).join(','));
  }
  return (opts.bom ? '﻿' : '') + lines.join('\n');
}

const pct = (v: number) => (Number.isFinite(v) ? Number((v * 100).toFixed(2)) : null);
const num = (v: number, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

export const SCORECARD_CSV_COLUMNS: CsvColumn<ScorecardRow>[] = [
  { key: 'symbol', label: '代號' },
  { key: 'modelId', label: '模型' },
  { key: 'horizon', label: '期數(日)' },
  { key: 'n', label: '樣本數' },
  { key: 'directionAccuracy', label: '方向準確率(%)', format: (r) => pct(r.directionAccuracy) },
  { key: 'dirPValue', label: '方向二項檢定p值', format: (r) => num(r.dirPValue) },
  { key: 'actHitRate', label: '出手準確率(%)', format: (r) => pct(r.actHitRate) },
  { key: 'actRatio', label: '出手比例(%)', format: (r) => pct(r.actRatio) },
  { key: 'mae', label: 'MAE', format: (r) => num(r.mae) },
  { key: 'rmse', label: 'RMSE', format: (r) => num(r.rmse) },
  { key: 'mape', label: 'MAPE(%)', format: (r) => num(r.mape, 3) },
  { key: 'theilU', label: "Theil's U", format: (r) => num(r.theilU) },
  { key: 'coverage', label: '區間覆蓋率(%)', format: (r) => pct(r.coverage) },
  { key: 'naiveRmse', label: 'Naive RMSE', format: (r) => num(r.naive.rmse) },
  { key: 'rmseImprovement', label: 'RMSE相對naive改善(%)', format: (r) => num(r.vsNaive?.metrics.rmse?.relImprovementPct ?? NaN, 2) },
  { key: 'longestCorrectStreak', label: '最長連續判對' },
  { key: 'longestWrongStreak', label: '最長連續判錯' },
  { key: 'hidden', label: '備註', format: (r) => (r.hidden ? r.hiddenReason : r.leakSuspect ? `${LEAK_LABEL}（已通過稽核）` : '') },
];

export function scorecardCsv(rows: ScorecardRow[]): string {
  return toCsv(rows, SCORECARD_CSV_COLUMNS, { bom: true });
}
