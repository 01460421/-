/**
 * fetchWithRetry：逾時、429 / 5xx 指數退避重試（尊重 Retry-After）、速率限制、JSON 驗證。
 * 一律使用全域 fetch（測試以 vi.stubGlobal / globalThis.fetch mock）。
 */
import type { TokenBucket } from './ratelimit';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 資料源回應格式不符預期 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Adapter 不支援此請求（例如不支援的頻率 / 市場）——不計入健康失敗 */
export class UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedError';
  }
}

/** 可全域調整（測試會把 baseDelayMs 調小） */
export const httpConfig = {
  retries: 3,
  baseDelayMs: 600,
  maxDelayMs: 8_000,
  timeoutMs: 12_000,
  userAgent: 'stock-fit-lab/0.1 (+educational research tool)',
};

export interface FetchRetryOptions {
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  limiter?: TokenBucket;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  /** 遮蔽 URL 中的金鑰（錯誤訊息用） */
  redact?: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryableStatus(s: number): boolean {
  return s === 429 || s === 408 || (s >= 500 && s <= 599);
}

export function redactUrl(url: string, secrets: (string | undefined)[] = []): string {
  let u = url;
  for (const s of secrets) if (s) u = u.split(s).join('***');
  return u.replace(/(apikey|apiKey|token|api_key)=([^&]+)/g, '$1=***');
}

function retryAfterMs(res: Response): number | null {
  const h = res.headers?.get?.('retry-after');
  if (!h) return null;
  const sec = Number(h);
  if (Number.isFinite(sec)) return sec * 1000;
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : null;
}

export async function fetchWithRetry(url: string, opts: FetchRetryOptions = {}): Promise<Response> {
  const retries = opts.retries ?? httpConfig.retries;
  const timeoutMs = opts.timeoutMs ?? httpConfig.timeoutMs;
  const base = opts.baseDelayMs ?? httpConfig.baseDelayMs;
  const safeUrl = redactUrl(url, opts.redact);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.limiter) await opts.limiter.take();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: { 'User-Agent': httpConfig.userAgent, Accept: 'application/json, text/plain, */*', ...(opts.headers ?? {}) },
        body: opts.body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) return res;
      const text = await safeText(res);
      const err = new HttpError(`HTTP ${res.status} ${safeUrl}`, res.status, safeUrl, text.slice(0, 500));
      if (!isRetryableStatus(res.status) || attempt === retries) throw err;
      lastErr = err;
      const ra = retryAfterMs(res);
      await sleep(Math.min(httpConfig.maxDelayMs, ra ?? backoff(base, attempt)));
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof HttpError) throw e;
      const aborted = (e as Error)?.name === 'AbortError';
      lastErr = aborted ? new HttpError(`timeout after ${timeoutMs}ms ${safeUrl}`, 0, safeUrl) : e;
      if (attempt === retries) break;
      await sleep(backoff(base, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function backoff(base: number, attempt: number): number {
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.min(httpConfig.maxDelayMs, base * 2 ** attempt * jitter);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export async function fetchJson<T = unknown>(url: string, opts: FetchRetryOptions = {}): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ValidationError(`invalid JSON from ${redactUrl(url, opts.redact)}: ${text.slice(0, 120)}`);
  }
}
