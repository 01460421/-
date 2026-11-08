/**
 * Python FastAPI 微服務（services/py）的 TypeScript 客戶端。
 *
 * - 讀取 process.env.PY_SERVICE_URL（例如 http://localhost:8000）；未設定時直接回傳 null。
 * - 逾時（預設 15 秒）、HTTP 錯誤（含 501 未安裝選用套件）、格式錯誤一律回傳 null，
 *   呼叫端應退回 TypeScript 實作（lib/models/advanced/*），而不是讓整個流程失敗。
 * - 只在伺服器端（API route / jobs）使用；API 位址不暴露給瀏覽器。
 */

export type RemoteModel = 'arima' | 'holtwinters' | 'garch' | 'msar' | 'ucm' | 'gp' | 'lstm' | 'tft';

export interface RemoteFitResult {
  model: RemoteModel;
  mean: number[];
  lower: number[];
  upper: number[];
  level: number;
  params: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
}

export interface RemoteFitOptions {
  timeoutMs?: number;
  /** 外生變數（ucm 使用），列與 y 對齊 */
  exog?: number[][];
  /** 覆寫服務位址（測試用）；預設讀 PY_SERVICE_URL */
  baseUrl?: string;
  /** 注入 fetch（測試用） */
  fetchImpl?: typeof fetch;
}

function isNumArray(v: unknown, len: number): v is number[] {
  return Array.isArray(v) && v.length === len && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

export function pyServiceUrl(): string | null {
  const u = typeof process !== 'undefined' ? process.env.PY_SERVICE_URL : undefined;
  return u && u.trim() ? u.trim().replace(/\/+$/, '') : null;
}

/**
 * 呼叫 POST /fit。成功回傳預測；未設定 / 失敗 / 逾時回傳 null（呼叫端改用 TS 實作）。
 */
export async function fitRemote(
  model: RemoteModel,
  y: number[],
  h: number,
  level = 0.9,
  params: Record<string, number> = {},
  opts: RemoteFitOptions = {},
): Promise<RemoteFitResult | null> {
  const base = opts.baseUrl ?? pyServiceUrl();
  if (!base) return null;
  const f = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!f) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await f(`${base}/fit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, y, h, level, params, exog: opts.exog }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<RemoteFitResult>;
    if (!isNumArray(j.mean, h) || !isNumArray(j.lower, h) || !isNumArray(j.upper, h)) return null;
    return {
      model,
      mean: j.mean,
      lower: j.lower,
      upper: j.upper,
      level: typeof j.level === 'number' ? j.level : level,
      params: (j.params as Record<string, unknown>) ?? {},
      diagnostics: (j.diagnostics as Record<string, unknown>) ?? {},
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** GET /health；服務可用回傳 true */
export async function pingRemote(opts: { baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<boolean> {
  const base = opts.baseUrl ?? pyServiceUrl();
  const f = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!base || !f) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 3_000);
  try {
    const res = await f(`${base}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
