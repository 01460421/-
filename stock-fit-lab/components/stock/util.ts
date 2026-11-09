/** 分析頁前端小工具（純函式） */

export const UP_COLOR = '#e5484d'; // 台股慣例：紅漲
export const DOWN_COLOR = '#30a46c'; // 綠跌

/** 模型配色（固定對應，圖例 / 表格 / 權重圖一致） */
export const MODEL_COLORS: Record<string, string> = {
  poly: '#2563eb',
  exp: '#9333ea',
  log: '#0891b2',
  logistic: '#c026d3',
  fourier: '#ea580c',
  linchannel: '#64748b',
  holtwinters: '#0d9488',
  arima: '#ca8a04',
  gbm: '#db2777',
  kalman: '#4f46e5',
  ensemble: '#111827',
  garch: '#b45309',
  egarch: '#a16207',
  msar: '#7c3aed',
  gp: '#0369a1',
  wavelet: '#15803d',
  emd: '#be123c',
  bsts: '#4d7c0f',
  stacking: '#1e40af',
};
export const BENCH_COLORS: Record<string, string> = { naive: '#9ca3af', drift: '#a3a3a3', sma20: '#f59e0b', sma60: '#d97706', buyhold: '#6b7280', custom: '#ef4444' };

export function modelColor(id: string, dark = false): string {
  if (id === 'ensemble' && dark) return '#f3f4f6';
  return MODEL_COLORS[id] ?? '#6b7280';
}

export function fmtNum(x: number | null | undefined, d = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e9) return (x / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return x.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
  return x.toFixed(d);
}

export function fmtPct(x: number | null | undefined, d = 1, isFraction = true): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return `${(isFraction ? x * 100 : x).toFixed(d)}%`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `請求失敗（HTTP ${res.status}）`;
    throw new Error(msg);
  }
  return data as T;
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
}

/** 依日曆週 / 月重採樣（取每期最後一筆；OHLC 合併） */
export function resampleOhlc(
  o: { dates: string[]; open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] },
  unit: 'day' | 'week' | 'month',
) {
  if (unit === 'day') return o;
  const key = (d: string) => {
    if (unit === 'month') return d.slice(0, 7);
    const t = new Date(d + 'T00:00:00Z');
    const day = (t.getUTCDay() + 6) % 7; // 週一 = 0
    t.setUTCDate(t.getUTCDate() - day);
    return t.toISOString().slice(0, 10);
  };
  const out = { dates: [] as string[], open: [] as number[], high: [] as number[], low: [] as number[], close: [] as number[], volume: [] as number[] };
  let cur = '';
  o.dates.forEach((d, i) => {
    const k = key(d);
    if (k !== cur) {
      cur = k;
      out.dates.push(d);
      out.open.push(o.open[i]);
      out.high.push(o.high[i]);
      out.low.push(o.low[i]);
      out.close.push(o.close[i]);
      out.volume.push(o.volume[i]);
    } else {
      const j = out.dates.length - 1;
      out.dates[j] = d;
      out.high[j] = Math.max(out.high[j], o.high[i]);
      out.low[j] = Math.min(out.low[j], o.low[i]);
      out.close[j] = o.close[i];
      out.volume[j] += o.volume[i];
    }
  });
  return out;
}

export const SIGNAL_TEXT: Record<'up' | 'down' | 'neutral', string> = { up: '看漲', down: '看跌', neutral: '觀望' };
export const SIGNAL_COLOR: Record<'up' | 'down' | 'neutral', string> = { up: UP_COLOR, down: DOWN_COLOR, neutral: '#6b7280' };

export function gateSignal(p: number | null | undefined, th: { upper: number; lower: number }): 'up' | 'down' | 'neutral' {
  if (p === null || p === undefined || !Number.isFinite(p)) return 'neutral';
  if (p >= th.upper) return 'up';
  if (p <= th.lower) return 'down';
  return 'neutral';
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 隱私模式等 */
  }
}

export function isDarkMode(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}
