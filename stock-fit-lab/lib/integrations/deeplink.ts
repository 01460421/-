/**
 * 連動跳轉 URL 狀態：/stock/2330.TW?models=poly3,kalman&h=20&window=250&lambda=0.97&range=1y&priceMode=log
 *  - models：逗號分隔，模型 id 後可接數字作為「主參數」（poly3 → 多項式次數 3；fourier4 → 4 個諧波）
 *  - h：預測步數 1–60
 *  - window：訓練視窗（交易日 10–5000）；lambda：遺忘因子 (0, 1]
 *  - range：顯示區間 1m/3m/6m/ytd/1y/2y/5y/max 或 YYYY-MM-DD~YYYY-MM-DD
 *  - priceMode：raw | log
 * 不合法的值會被忽略（並記錄於 warnings），不會讓頁面壞掉。
 */
import type { ModelId, PriceMode } from '../types';
import { normalizeSymbol } from '../data-adapters/symbols';

export const MODEL_IDS: readonly ModelId[] = [
  'poly', 'exp', 'log', 'logistic', 'fourier', 'linchannel', 'holtwinters', 'arima', 'gbm', 'kalman', 'ensemble',
  'garch', 'egarch', 'msar', 'gp', 'wavelet', 'emd', 'bsts', 'stacking',
] as const;

/** 模型 id 後綴數字所代表的主參數鍵（模型 paramSpecs 的 key；未列者以 'main' 表示） */
export const MODEL_MAIN_PARAM: Partial<Record<ModelId, string>> = {
  poly: 'degree',
  fourier: 'harmonics',
  holtwinters: 'season',
  arima: 'p',
  linchannel: 'k',
  gbm: 'lookback',
  msar: 'regimes',
  wavelet: 'levels',
  emd: 'maxImfs',
};

export interface DeepLinkModel {
  id: ModelId;
  /** 主參數（例如 poly3 → 3） */
  param?: number;
  /** 主參數鍵（MODEL_MAIN_PARAM） */
  paramKey?: string;
}

export const RANGE_PRESETS = ['1m', '3m', '6m', 'ytd', '1y', '2y', '5y', 'max'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface DeepLinkState {
  symbol: string;
  models: DeepLinkModel[];
  h?: number;
  window?: number;
  lambda?: number;
  range?: RangePreset | { start: string; end: string };
  priceMode?: PriceMode;
}

export interface ParsedDeepLink {
  state: DeepLinkState | null;
  warnings: string[];
}

export const H_MIN = 1;
export const H_MAX = 60;

const ID_SET = new Set<string>(MODEL_IDS);

export function parseModelToken(token: string): DeepLinkModel | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (ID_SET.has(t)) return { id: t as ModelId };
  const m = t.match(/^([a-z]+?)[-_:]?(\d+(?:\.\d+)?)$/);
  if (!m || !ID_SET.has(m[1])) return null;
  const id = m[1] as ModelId;
  const param = Number(m[2]);
  if (!Number.isFinite(param)) return null;
  return { id, param, paramKey: MODEL_MAIN_PARAM[id] ?? 'main' };
}

function toParams(input: string | URLSearchParams | Record<string, string | string[] | undefined>): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input === 'string') return new URLSearchParams(input.startsWith('?') ? input.slice(1) : input);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(input)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else if (v !== undefined) p.set(k, v);
  }
  return p;
}

/**
 * 解析深連結。可傳完整 URL / 路徑（'/stock/2330.TW?models=...'）或 symbol + searchParams（Next.js 的 params / searchParams）。
 */
export function parseDeepLink(urlOrPath: string): ParsedDeepLink;
export function parseDeepLink(symbol: string, search: string | URLSearchParams | Record<string, string | string[] | undefined>): ParsedDeepLink;
export function parseDeepLink(a: string, b?: string | URLSearchParams | Record<string, string | string[] | undefined>): ParsedDeepLink {
  const warnings: string[] = [];
  let rawSymbol: string;
  let params: URLSearchParams;
  if (b === undefined) {
    let path = a;
    let query = '';
    try {
      const u = new URL(a, 'http://local');
      path = u.pathname;
      query = u.search;
    } catch {
      /* 保留原字串 */
    }
    const m = path.match(/\/stock\/([^/?#]+)/);
    rawSymbol = decodeURIComponent(m ? m[1] : path.replace(/^\//, ''));
    params = toParams(query);
  } else {
    rawSymbol = decodeURIComponent(a);
    params = toParams(b);
  }
  const info = normalizeSymbol(rawSymbol);
  if (!info) return { state: null, warnings: [`無法辨識代號：${rawSymbol}`] };
  const state: DeepLinkState = { symbol: info.symbol, models: [] };

  const modelsRaw = params.getAll('models').join(',');
  if (modelsRaw) {
    const seen = new Set<string>();
    for (const tok of modelsRaw.split(',')) {
      if (!tok.trim()) continue;
      const m = parseModelToken(tok);
      if (!m) {
        warnings.push(`未知模型：${tok}`);
        continue;
      }
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      state.models.push(m);
    }
  }
  const h = params.get('h');
  if (h !== null) {
    const n = Number(h);
    if (Number.isInteger(n) && n >= H_MIN && n <= H_MAX) state.h = n;
    else if (Number.isFinite(n)) {
      state.h = Math.min(H_MAX, Math.max(H_MIN, Math.round(n)));
      warnings.push(`h 超出範圍 ${H_MIN}–${H_MAX}，已調整為 ${state.h}`);
    } else warnings.push(`h 不是數字：${h}`);
  }
  const w = params.get('window');
  if (w !== null) {
    const n = Number(w);
    if (Number.isInteger(n) && n >= 10 && n <= 5000) state.window = n;
    else warnings.push(`window 不合法：${w}`);
  }
  const l = params.get('lambda');
  if (l !== null) {
    const n = Number(l);
    if (Number.isFinite(n) && n > 0 && n <= 1) state.lambda = n;
    else warnings.push(`lambda 不合法：${l}`);
  }
  const r = params.get('range');
  if (r !== null) {
    const rl = r.toLowerCase();
    const custom = r.match(/^(\d{4}-\d{2}-\d{2})(?:~|\.\.|_)(\d{4}-\d{2}-\d{2})$/);
    if ((RANGE_PRESETS as readonly string[]).includes(rl)) state.range = rl as RangePreset;
    else if (custom && custom[1] <= custom[2]) state.range = { start: custom[1], end: custom[2] };
    else warnings.push(`range 不合法：${r}`);
  }
  const pm = params.get('priceMode');
  if (pm !== null) {
    if (pm === 'raw' || pm === 'log') state.priceMode = pm;
    else warnings.push(`priceMode 不合法：${pm}`);
  }
  return { state, warnings };
}

export function formatModelToken(m: DeepLinkModel): string {
  return m.param !== undefined ? `${m.id}${m.param}` : m.id;
}

/** 由狀態產生相對路徑（逗號保留不編碼，方便分享） */
export function buildDeepLink(state: DeepLinkState, opts: { base?: string } = {}): string {
  const parts: string[] = [];
  if (state.models.length) parts.push(`models=${state.models.map(formatModelToken).join(',')}`);
  if (state.h !== undefined) parts.push(`h=${Math.min(H_MAX, Math.max(H_MIN, Math.round(state.h)))}`);
  if (state.window !== undefined) parts.push(`window=${Math.round(state.window)}`);
  if (state.lambda !== undefined) parts.push(`lambda=${state.lambda}`);
  if (state.range !== undefined) parts.push(`range=${typeof state.range === 'string' ? state.range : `${state.range.start}~${state.range.end}`}`);
  if (state.priceMode) parts.push(`priceMode=${state.priceMode}`);
  const path = `/stock/${encodeURIComponent(state.symbol).replace(/%5E/gi, '%5E')}${parts.length ? `?${parts.join('&')}` : ''}`;
  return opts.base ? `${opts.base.replace(/\/$/, '')}${path}` : path;
}
