/**
 * 洩漏稽核（規格第八節，必要）。
 *
 * 觸發：任何模型樣本外方向準確率 > 70% 或 Theil's U < 0.5 → 標記「疑似資料洩漏」。
 * 檢查：
 *  (a) 特徵與目標的時間對齊：每一組配對 origin < target（索引與日期），且送入模型的最後一個輸入值
 *      必須等於起點當時的真實價格（偵測把未來值移入特徵的管線）；快照 trainEnd < targetDates[0]。
 *  (b) 還原股價是否引入未來分割資訊：adjClose/close 還原因子的跳動日必須對應公司行動事件日。
 *  (c) 標準化 / 前處理只使用視窗內統計量：在抽樣起點把資料截斷到 t 後重跑整條管線，
 *      模型輸入視窗、樣本內擬合值與預測必須與原 walk-forward 完全相同。
 *  (d) 快照未被事後改寫：每筆快照的內容雜湊（重新讀取比對 + 與先前保存的雜湊清單比對）。
 * 稽核未通過（任一檢查 fail）前，疑似洩漏的結果不得顯示在計分卡上（hiddenModels）。
 */
import { createHash } from 'node:crypto';
import type { Bar, ModelId, PredictionSnapshot } from '../types';
import type { CorporateEvent } from '../data-adapters/types';
import type { Store } from '../storage/types';
import { forecastAtOrigin, type WalkForwardResult } from './walkforward';
import { makeCreateModel, type EngineDeps } from './models';

import { LEAK_LABEL } from './leak-audit-label';
export { LEAK_LABEL };

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skipped';

export interface LeakCheck {
  id: 'a' | 'b' | 'c' | 'd';
  name: string;
  status: CheckStatus;
  detail: string;
  data?: Record<string, unknown>;
}

export interface LeakSuspect {
  model: string;
  horizon: number;
  n: number;
  directionAccuracy: number;
  theilU: number;
  reasons: string[];
}

export interface LeakAuditResult {
  /** 是否有任何模型觸發疑似洩漏門檻 */
  suspect: boolean;
  /** 所有檢查皆未 fail */
  passed: boolean;
  label: typeof LEAK_LABEL;
  suspects: LeakSuspect[];
  checks: LeakCheck[];
  /** 計分卡必須隱藏的模型（疑似且稽核未通過） */
  hiddenModels: string[];
  /** 本次計算的快照雜湊清單（請保存，供下次 (d) 比對） */
  snapshotHashes: Record<string, string>;
  auditedAt: string;
}

export interface LeakAuditInput {
  wf?: WalkForwardResult;
  /** walk-forward 使用的原始價格（(a)(c) 需要） */
  prices?: number[];
  dates?: string[];
  /** walk-forward 使用的前處理（(c) 以截斷資料重跑） */
  preprocess?: (prices: number[]) => number[];
  deps?: EngineDeps;
  /** (b) 還原價檢查 */
  bars?: Bar[];
  events?: CorporateEvent[];
  /** (d) 快照檢查 */
  store?: Store;
  symbol?: string;
  snapshots?: PredictionSnapshot[];
  knownHashes?: Record<string, string>;
  thresholds?: { maxDirAcc?: number; minTheilU?: number; minN?: number };
  /** (c) 每個模型抽樣的起點數（預設 6） */
  sampleOrigins?: number;
  /** (c) 未有疑似模型時也檢查的模型（預設全部；設 false 只查疑似模型） */
  checkAllModels?: boolean;
  now?: () => Date;
}

// ───────── 雜湊 ─────────

/** 鍵排序後的穩定 JSON */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

export function snapshotHash(s: PredictionSnapshot): string {
  return createHash('sha256').update(stableStringify(s)).digest('hex');
}

// ───────── 疑似判定 ─────────

export function findSuspects(wf: WalkForwardResult, th: LeakAuditInput['thresholds'] = {}): LeakSuspect[] {
  const maxDir = th.maxDirAcc ?? 0.7;
  const minU = th.minTheilU ?? 0.5;
  const minN = th.minN ?? 20;
  const out: LeakSuspect[] = [];
  for (const [model, byH] of Object.entries(wf.models)) {
    for (const r of Object.values(byH)) {
      const m = r.metrics;
      const reasons: string[] = [];
      if (m.dirN >= minN && m.directionAccuracy > maxDir) reasons.push(`樣本外方向準確率 ${(m.directionAccuracy * 100).toFixed(1)}% > ${maxDir * 100}%`);
      if (m.n >= minN && m.theilU < minU) reasons.push(`Theil's U ${m.theilU.toFixed(3)} < ${minU}`);
      if (reasons.length) out.push({ model, horizon: r.horizon, n: m.n, directionAccuracy: m.directionAccuracy, theilU: m.theilU, reasons });
    }
  }
  return out;
}

const close = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// ───────── (a) 時間對齊 ─────────

export function checkTimeAlignment(input: Pick<LeakAuditInput, 'wf' | 'prices' | 'dates' | 'snapshots'>): LeakCheck {
  const problems: string[] = [];
  let pairs = 0;
  let inputMismatch = 0;
  const { wf, prices, dates, snapshots } = input;
  if (wf) {
    for (const m of wf.oos) {
      for (let i = 0; i < m.originIdx.length; i++) {
        pairs++;
        if (!(m.originIdx[i] < m.targetIdx[i])) problems.push(`h=${m.horizon} 起點索引 ${m.originIdx[i]} ≥ 目標 ${m.targetIdx[i]}`);
        if (dates && !(dates[m.originIdx[i]] < dates[m.targetIdx[i]])) problems.push(`h=${m.horizon} 起點日期 ${dates[m.originIdx[i]]} 未早於目標 ${dates[m.targetIdx[i]]}`);
      }
    }
    if (prices) {
      wf.origins.forEach((t, i) => {
        if (!close(wf.lastInputs[i], prices[t])) inputMismatch++;
      });
      if (inputMismatch) problems.push(`${inputMismatch}/${wf.origins.length} 個起點送入模型的最後輸入值 ≠ 當時真實價格（特徵含未來資訊或位移）`);
    }
  }
  let snapChecked = 0;
  for (const s of snapshots ?? []) {
    snapChecked++;
    if (s.targetDates.length && !(s.trainEnd < s.targetDates[0])) problems.push(`快照 ${s.id} trainEnd ${s.trainEnd} 未早於首個目標日 ${s.targetDates[0]}`);
    for (let i = 1; i < s.targetDates.length; i++) if (!(s.targetDates[i - 1] < s.targetDates[i])) problems.push(`快照 ${s.id} 目標日未遞增`);
    if (s.createdAt.slice(0, 10) < s.trainEnd) problems.push(`快照 ${s.id} 建立時間 ${s.createdAt} 早於訓練迄日 ${s.trainEnd}`);
  }
  if (!wf && !snapChecked) return { id: 'a', name: '特徵與目標時間對齊', status: 'skipped', detail: '未提供 walk-forward 結果或快照' };
  return {
    id: 'a',
    name: '特徵與目標時間對齊',
    status: problems.length ? 'fail' : 'pass',
    detail: problems.length ? problems.slice(0, 10).join('；') : `檢查 ${pairs} 組樣本外配對、${snapChecked} 筆快照，起點皆早於目標且輸入對齊`,
    data: { pairs, inputMismatch, snapshots: snapChecked, problems: problems.length },
  };
}

// ───────── (b) 還原價 ─────────

export function checkAdjustedPrices(bars?: Bar[], events?: CorporateEvent[]): LeakCheck {
  const name = '還原股價是否引入未來分割資訊';
  if (!bars?.length) return { id: 'b', name, status: 'skipped', detail: '未提供 K 棒' };
  const withAdj = bars.filter((b) => b.adjClose != null && b.close > 0);
  if (!withAdj.length) return { id: 'b', name, status: 'pass', detail: '序列未使用還原價（adjClose），無未來公司行動資訊' };
  const jumps: { date: string; factor: number; matched: string | null; kind: 'split' | 'dividend' }[] = [];
  const evs = (events ?? []).filter((e) => e.type === 'split' || e.type === 'dividend');
  const dayMs = 86400000;
  for (let i = 1; i < withAdj.length; i++) {
    const r0 = withAdj[i - 1].adjClose! / withAdj[i - 1].close;
    const r1 = withAdj[i].adjClose! / withAdj[i].close;
    const f = r1 / r0;
    if (Math.abs(f - 1) <= 0.002) continue;
    const date = withAdj[i].date;
    const t = Date.parse(date + 'T00:00:00Z');
    const m = evs.find((e) => Math.abs(Date.parse(e.date + 'T00:00:00Z') - t) <= 3 * dayMs);
    jumps.push({ date, factor: f, matched: m ? `${m.type} ${m.date}` : null, kind: f > 1.4 || f < 0.7 ? 'split' : 'dividend' });
  }
  const unmatched = jumps.filter((j) => !j.matched);
  const splits = jumps.filter((j) => j.kind === 'split');
  const note = splits.length
    ? `還原因子含 ${splits.length} 次分割（${splits.map((s) => s.date).join('、')}）；在此之前的起點使用的是事後回溯調整的價格水準，僅適用於報酬率尺度不變的比較`
    : '';
  if (!jumps.length) return { id: 'b', name, status: 'pass', detail: '還原因子在整段期間固定', data: { jumps: 0 } };
  if (unmatched.length && events) {
    return {
      id: 'b',
      name,
      status: 'fail',
      detail: `${unmatched.length} 個還原因子跳動日無對應除權息 / 分割事件（${unmatched.slice(0, 5).map((j) => j.date).join('、')}），可能混入未來資訊或資料錯誤。${note}`,
      data: { jumps, unmatched: unmatched.length },
    };
  }
  if (unmatched.length) {
    return { id: 'b', name, status: 'warn', detail: `偵測到 ${jumps.length} 個還原因子跳動日，但未提供事件日可比對。${note}`, data: { jumps } };
  }
  return { id: 'b', name, status: 'pass', detail: `${jumps.length} 個還原因子跳動日皆對應公司行動事件。${note}`, data: { jumps } };
}

// ───────── (c) 截斷重算 ─────────

export function checkTruncationInvariance(input: LeakAuditInput, models: string[]): LeakCheck {
  const name = '標準化 / 前處理只用視窗內統計量（截斷重算）';
  const { wf, prices } = input;
  if (!wf || !prices) return { id: 'c', name, status: 'skipped', detail: '未提供 walk-forward 結果與原始價格' };
  const create = makeCreateModel(input.deps);
  const k = Math.max(1, input.sampleOrigins ?? 6);
  const maxH = wf.horizons[wf.horizons.length - 1];
  const full = input.preprocess ? input.preprocess(prices.slice()) : prices;
  // 均勻抽樣起點（含第一個與最後一個）
  const os = wf.origins;
  const picks = [...new Set(Array.from({ length: Math.min(k, os.length) }, (_, i) => os[Math.round((i * (os.length - 1)) / Math.max(1, Math.min(k, os.length) - 1))]))];
  const problems: string[] = [];
  let compared = 0;
  for (const id of models) {
    if (id === 'ensemble' || !wf.models[id]) continue;
    for (const t of picks) {
      const trunc = input.preprocess ? input.preprocess(prices.slice(0, t + 1)) : prices.slice(0, t + 1);
      const start = Math.max(0, t - wf.settings.window + 1);
      const winFull = full.slice(start, t + 1);
      const winTrunc = trunc.slice(start, t + 1);
      const inDiff = winFull.findIndex((v, i) => !close(v, winTrunc[i]));
      if (inDiff >= 0) {
        problems.push(`${id} 起點 ${t}：截斷後模型輸入視窗第 ${inDiff} 筆不同（${winFull[inDiff]} vs ${winTrunc[inDiff]}）`);
        continue;
      }
      try {
        const mFull = create(id as ModelId);
        const mTrunc = create(id as ModelId);
        const fFull = forecastAtOrigin(mFull, full, t, maxH, wf.settings, id as ModelId);
        const fTrunc = forecastAtOrigin(mTrunc, trunc, t, maxH, wf.settings, id as ModelId);
        compared++;
        const a = mFull.fitted();
        const b = mTrunc.fitted();
        if (a.length !== b.length || a.some((v, i) => !close(v, b[i]))) problems.push(`${id} 起點 ${t}：截斷重算後樣本內擬合值不同`);
        if (fFull.mean.some((v, i) => !close(v, fTrunc.mean[i]))) problems.push(`${id} 起點 ${t}：截斷重算後預測不同`);
        // 與 walk-forward 紀錄比對
        for (const h of wf.horizons) {
          const r = wf.models[id][h];
          const j = r.originIdx.indexOf(t);
          if (j >= 0 && !close(r.pred[j], fTrunc.mean[h - 1])) {
            problems.push(`${id} 起點 ${t} h=${h}：walk-forward 紀錄 ${r.pred[j]} ≠ 截斷重算 ${fTrunc.mean[h - 1]}`);
            break;
          }
        }
      } catch (e) {
        problems.push(`${id} 起點 ${t}：重算失敗 ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return {
    id: 'c',
    name,
    status: problems.length ? 'fail' : compared || picks.length ? 'pass' : 'skipped',
    detail: problems.length ? problems.slice(0, 10).join('；') : `抽樣 ${picks.length} 個起點 × ${models.length} 個模型，截斷資料重算結果完全相同`,
    data: { origins: picks, compared, problems: problems.length },
  };
}

// ───────── (d) 快照未被改寫 ─────────

export async function checkSnapshotsImmutable(input: Pick<LeakAuditInput, 'store' | 'symbol' | 'snapshots' | 'knownHashes'>): Promise<{ check: LeakCheck; hashes: Record<string, string> }> {
  const name = '快照未被事後改寫';
  const hashes: Record<string, string> = {};
  const problems: string[] = [];
  let list = input.snapshots ?? [];
  if (input.store) list = await input.store.listSnapshots({ symbol: input.symbol });
  if (!list.length) return { check: { id: 'd', name, status: 'skipped', detail: '沒有快照可檢查' }, hashes };
  const seen = new Set<string>();
  for (const s of list) {
    if (seen.has(s.id)) problems.push(`快照 id ${s.id} 重複`);
    seen.add(s.id);
    const h = snapshotHash(s);
    hashes[s.id] = h;
    if (input.knownHashes?.[s.id] && input.knownHashes[s.id] !== h) problems.push(`快照 ${s.id} 內容雜湊與先前紀錄不符（已被改寫）`);
    if (input.store) {
      const again = await input.store.getSnapshot(s.id);
      if (!again) problems.push(`快照 ${s.id} 重新讀取時不存在（被刪除）`);
      else if (snapshotHash(again) !== h) problems.push(`快照 ${s.id} 重新讀取內容不同`);
    }
  }
  if (input.knownHashes) {
    for (const id of Object.keys(input.knownHashes)) if (!seen.has(id)) problems.push(`先前紀錄的快照 ${id} 已不存在（被刪除）`);
  }
  return {
    check: {
      id: 'd',
      name,
      status: problems.length ? 'fail' : 'pass',
      detail: problems.length ? problems.slice(0, 10).join('；') : `${list.length} 筆快照雜湊一致${input.knownHashes ? '，且與先前保存的雜湊清單相符' : ''}`,
      data: { count: list.length, problems: problems.length },
    },
    hashes,
  };
}

/** 執行完整稽核 */
export async function auditForLeakage(input: LeakAuditInput): Promise<LeakAuditResult> {
  const suspects = input.wf ? findSuspects(input.wf, input.thresholds) : [];
  const suspectModels = [...new Set(suspects.map((s) => s.model))];
  const cModels = input.checkAllModels === false ? suspectModels : input.wf ? Object.keys(input.wf.models).filter((m) => m !== 'ensemble') : [];
  // 只有疑似模型時優先檢查它們（若 checkAllModels 未關閉則全部檢查）
  const checks: LeakCheck[] = [];
  checks.push(checkTimeAlignment(input));
  checks.push(checkAdjustedPrices(input.bars, input.events));
  checks.push(checkTruncationInvariance(input, cModels.length ? cModels : suspectModels));
  const d = await checkSnapshotsImmutable(input);
  checks.push(d.check);
  const passed = checks.every((c) => c.status !== 'fail');
  return {
    suspect: suspects.length > 0,
    passed,
    label: LEAK_LABEL,
    suspects,
    checks,
    hiddenModels: passed ? [] : suspectModels,
    snapshotHashes: d.hashes,
    auditedAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}
