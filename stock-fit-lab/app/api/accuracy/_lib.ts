/**
 * 回顧 / 儀表板 / 健康頁 API 共用的伺服器端工具（僅限伺服器）。
 * 所有準度數據只讀取當時寫入的快照與回填結果（lib/engine/accuracy），不以現在的模型重算。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Store } from '@/lib/storage/types';
import type { SnapRecord } from '@/lib/engine/accuracy';
import type { Period } from '@/lib/engine/accuracy';
import { brierScore, brierSkillScore, expectedCalibrationError, reliabilityDiagram, type ReliabilityBin } from '@/lib/direction/calibration';
import { normalizeSymbol } from '@/lib/data-adapters/symbols';
import { MODEL_META } from '@/lib/models';
import { BENCHMARK_META } from '@/lib/benchmarks';

// ───────── 回應 ─────────

export function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** 把 URLSearchParams 轉成物件（空字串視為未提供）並以 zod 驗證 */
export function parseParams<T extends z.ZodTypeAny>(url: string, schema: T): { ok: true; data: z.infer<T> } | { ok: false; res: NextResponse } {
  const sp = new URL(url).searchParams;
  const raw: Record<string, string> = {};
  sp.forEach((v, k) => {
    if (v.trim() !== '') raw[k] = v.trim();
  });
  const r = schema.safeParse(raw);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || '參數'}：${i.message}`).join('；');
    return { ok: false, res: jsonError(`參數錯誤：${msg}`, 400) };
  }
  return { ok: true, data: r.data };
}

// ───────── 共用 zod 片段 ─────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 代號：接受 2330、2330.TW、台積電、AAPL 等並正規化 */
export const zSymbol = z
  .string()
  .max(40, '代號過長')
  .transform((v, ctx) => {
    const info = normalizeSymbol(v);
    if (!info) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `無法辨識的代號「${v}」` });
      return z.NEVER;
    }
    return info.symbol;
  });

export const zDate = z.string().regex(DATE_RE, '日期格式須為 YYYY-MM-DD');
export const zModel = z.string().regex(/^[a-z0-9_]{1,24}$/, '模型代碼格式錯誤');
export const zHorizon = z.coerce.number({ invalid_type_error: '期數須為數字' }).int('期數須為整數').refine((v) => [1, 5, 10, 20].includes(v), '期數只支援 1、5、10、20 日');
export const zPeriod = z.enum(['1m', '3m', '6m', '12m', 'custom'], { errorMap: () => ({ message: '期間只支援 1m、3m、6m、12m、custom' }) });
export const zProb = z.coerce.number({ invalid_type_error: '門檻須為數字' }).min(0, '門檻須介於 0–1').max(1, '門檻須介於 0–1');

/** period + from/to → lib Period；custom 需要 from/to */
export function resolvePeriod(period: string | undefined, from?: string, to?: string): Period | { error: string } {
  if (period === 'custom' || (!period && (from || to))) {
    if (!from || !to) return { error: '自訂區間需要同時提供 from 與 to（YYYY-MM-DD）' };
    if (from > to) return { error: '起日不可晚於迄日' };
    return { from, to: `${to}T23:59:59.999Z` };
  }
  return (period as Period) ?? '3m';
}

// ───────── 洩漏稽核 ─────────

/**
 * 已通過洩漏稽核的「代號|模型」鍵。
 * 約定：稽核流程通過時寫入 kind = 'leak_suspect' 事件，detail 帶 { auditPassed: true, modelId }（或 models: string[]）。
 * 沒有這類事件時，所有疑似洩漏列一律隱藏（規格第八節：稽核未通過前不得顯示）。
 */
export async function getAuditPassed(store: Store, symbol?: string): Promise<string[]> {
  try {
    const evs = await store.listEvents({ kind: 'leak_suspect', symbol, limit: 2000 });
    const out = new Set<string>();
    for (const e of evs) {
      const d = e.detail as { auditPassed?: unknown; passed?: unknown; modelId?: unknown; models?: unknown };
      if (!(d.auditPassed === true || d.passed === true) || !e.symbol) continue;
      if (typeof d.modelId === 'string') out.add(`${e.symbol}|${d.modelId}`);
      if (Array.isArray(d.models)) for (const m of d.models) if (typeof m === 'string') out.add(`${e.symbol}|${m}`);
    }
    return [...out];
  } catch {
    return [];
  }
}

// ───────── 機率校準（快照當時的 pUp vs 實際漲跌） ─────────

export interface CalibrationSummary {
  horizon: number;
  n: number;
  brier: number;
  brierSkill: number;
  ece: number;
  baseRate: number;
  bins: ReliabilityBin[];
}

export function calibrationFromRecords(records: SnapRecord[], horizon: number): CalibrationSummary {
  const i = horizon - 1;
  const p: number[] = [];
  const o: number[] = [];
  for (const r of records) {
    const out = r.outcomes.get(i);
    const pu = r.snapshot.pUp?.[i];
    if (!out || pu === undefined || pu === null || !Number.isFinite(pu) || out.actual === r.snapshot.lastPrice) continue;
    p.push(pu);
    o.push(out.actual > r.snapshot.lastPrice ? 1 : 0);
  }
  return {
    horizon,
    n: p.length,
    brier: brierScore(p, o),
    brierSkill: p.length > 1 ? brierSkillScore(p, o) : NaN,
    ece: p.length ? expectedCalibrationError(p, o) : NaN,
    baseRate: o.length ? o.reduce((a, b) => a + b, 0) / o.length : NaN,
    bins: reliabilityDiagram(p, o),
  };
}

// ───────── 名稱 ─────────

export function modelNames(): Record<string, string> {
  const out: Record<string, string> = { ai: 'AI 分析助理' };
  for (const [k, v] of Object.entries(MODEL_META)) out[k] = v.advanced ? v.name.replace(/（.*）$/, '') : v.short || v.name;
  for (const [k, v] of Object.entries(BENCHMARK_META)) out[k] = v.name;
  return out;
}

/** JSON 無法表示 NaN / Infinity：統一轉為 null（前端以「—」顯示） */
export function jsonSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : x instanceof Map ? Object.fromEntries(x) : x)));
}

export function storeLabel(kind: 'postgres' | 'memory'): string {
  return kind === 'postgres' ? 'PostgreSQL' : '記憶體（本機同步 .data/store.json）';
}
