/** 詳細資料層（第十節）前端輔助：資料集清單與「疊加到圖上」的子圖轉換 */
import type { DataTable, DatasetId } from '@/lib/data-adapters/types';
import type { Market } from '@/lib/types';
import type { Subplot } from './types';
import { fetchJson } from './util';

export const DATASET_LABEL: Record<DatasetId, string> = {
  institutional: '三大法人',
  margin: '融資融券',
  securities_lending: '借券賣出',
  shareholding: '股權分散',
  monthly_revenue: '月營收',
  financials: '季報',
  dividends: '股利',
  valuation: '本益比 / 淨值比',
  short_interest: '空單餘額',
  insider: '內部人交易',
  options: '選擇權',
  news: '新聞標題',
  macro: '市場環境',
};

export function datasetsFor(market: Market): DatasetId[] {
  return market === 'US'
    ? ['short_interest', 'insider', 'options', 'dividends', 'news', 'macro']
    : ['institutional', 'margin', 'securities_lending', 'shareholding', 'monthly_revenue', 'financials', 'dividends', 'valuation', 'news', 'macro'];
}

/** 找出日期欄位 key */
export function dateKey(t: DataTable): string | null {
  const byName = t.columns.find((c) => /^(date|日期|Date|period|month)$/i.test(c.key) || /日期|月份/.test(c.label));
  if (byName) return byName.key;
  const first = t.rows[0];
  if (!first) return null;
  const k = Object.keys(first).find((k) => typeof first[k] === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(String(first[k])));
  return k ?? null;
}

export function numericColumns(t: DataTable): { key: string; label: string; unit?: string }[] {
  const dk = dateKey(t);
  return t.columns.filter((c) => c.key !== dk && t.rows.some((r) => typeof r[c.key] === 'number'));
}

export function tableToSubplot(t: DataTable, colKey: string): Subplot | null {
  const dk = dateKey(t);
  if (!dk) return null;
  const col = t.columns.find((c) => c.key === colKey);
  if (!col) return null;
  const rows = t.rows
    .map((r) => ({ d: String(r[dk] ?? ''), v: typeof r[colKey] === 'number' ? (r[colKey] as number) : null }))
    .filter((x) => /^\d{4}-\d{2}/.test(x.d))
    .map((x) => ({ d: x.d.length === 7 ? `${x.d}-01` : x.d.slice(0, 10), v: x.v }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  return { id: `${t.dataset}.${colKey}`, label: `${t.title}：${col.label}${col.unit ? `（${col.unit}）` : ''}`, source: `${t.source} · ${t.asOf}`, dates: rows.map((r) => r.d), values: rows.map((r) => r.v) };
}

const cache = new Map<string, Promise<DataTable>>();

export function loadDataset(symbol: string, dataset: DatasetId): Promise<DataTable> {
  const k = `${symbol}|${dataset}`;
  if (!cache.has(k)) {
    const p = fetchJson<DataTable>(`/api/dataset?symbol=${encodeURIComponent(symbol)}&dataset=${dataset}`);
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return cache.get(k)!;
}

/** 解析 AI 的 add_subplot series 參數：'volume' 或 'dataset.column'（column 省略時取第一個數值欄位） */
export async function resolveSubplot(symbol: string, series: string): Promise<Subplot | null> {
  if (series === 'volume') return null; // 成交量本來就在子圖
  const [ds, col] = series.split('.') as [DatasetId, string | undefined];
  if (!(ds in DATASET_LABEL)) throw new Error(`未知資料集：${ds}`);
  const t = await loadDataset(symbol, ds);
  if (t.unavailableReason) throw new Error(t.unavailableReason);
  const nums = numericColumns(t);
  const key = col && nums.some((c) => c.key === col) ? col : nums.find((c) => /net|total|合計|買賣超/i.test(c.key + c.label))?.key ?? nums[0]?.key;
  if (!key) throw new Error(`${t.title} 沒有可疊加的數值欄位`);
  return tableToSubplot(t, key);
}
