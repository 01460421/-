/** 前端共用格式化（API 會把 NaN / Infinity 轉為 null，統一顯示「—」） */
export type Num = number | null | undefined;

export const UP_COLOR = '#e5484d'; // 台股慣例：紅漲
export const DOWN_COLOR = '#30a46c'; // 綠跌
export const BETTER_COLOR = '#2563eb'; // 優於基準（避免與漲跌紅綠混淆）
export const WORSE_COLOR = '#d97706'; // 劣於基準

export const isNum = (v: Num): v is number => typeof v === 'number' && Number.isFinite(v);

export function fmtNum(v: Num, d = 2): string {
  if (!isNum(v)) return '—';
  const [i, f] = Math.abs(v).toFixed(d).split('.');
  return `${v < 0 ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${f ? `.${f}` : ''}`;
}

/** 0–1 比例 → 百分比 */
export function fmtPct(v: Num, d = 1): string {
  return isNum(v) ? `${(v * 100).toFixed(d)}%` : '—';
}

/** 已是百分比的數值（例如 MAPE 1.23 = 1.23%） */
export function fmtPctRaw(v: Num, d = 2): string {
  return isNum(v) ? `${v.toFixed(d)}%` : '—';
}

export function fmtSigned(v: Num, d = 2, suffix = ''): string {
  return isNum(v) ? `${v > 0 ? '+' : ''}${v.toFixed(d)}${suffix}` : '—';
}

/** 台北時間（UTC+8、無夏令時間）手動格式化：避免伺服器與瀏覽器 Intl 輸出差異造成 hydration 不一致 */
function tpeString(d: Date): string {
  const t = new Date(d.getTime() + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}/${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

/** ISO → 台北時間字串 */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${tpeString(d)}（台北）`;
}

export function fmtTimeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : tpeString(d);
}

export const SIGNAL_TEXT: Record<string, string> = { up: '看漲', down: '看跌', neutral: '觀望' };

export function signalColor(s: string | null | undefined): string | undefined {
  return s === 'up' ? UP_COLOR : s === 'down' ? DOWN_COLOR : undefined;
}

export function verdictColor(v: string | null | undefined): string | undefined {
  return v === 'better' ? BETTER_COLOR : v === 'worse' ? WORSE_COLOR : undefined;
}

export const VERDICT_TEXT: Record<string, string> = { better: '優於', worse: '劣於', insignificant: '無顯著差異', na: '—' };

export const SEVERITY_COLOR: Record<string, string> = { info: '#3b82f6', warn: '#d97706', critical: '#dc2626' };
export const SEVERITY_TEXT: Record<string, string> = { info: '資訊', warn: '警告', critical: '嚴重' };

export const EVENT_KIND_TEXT: Record<string, string> = {
  job_run: '排程執行',
  job_error: '排程錯誤',
  detector: '偵測觸發',
  ai_advice: 'AI 建議',
  notification: '通知發送',
  structural_break: '結構性變化',
  weight_shift: '權重重分配',
  leak_suspect: '疑似資料洩漏',
  data_source_error: '資料源錯誤',
};

export const TRIGGER_TEXT: Record<string, string> = { refit: '滾動重擬合', rls: 'RLS', kalman: '卡爾曼', ensemble: '集成重分配', schedule: '排程', manual: '手動' };

/** 觸發瀏覽器下載 */
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

/** 依目前主題取 ECharts 文字顏色 */
export function chartTextColor(): string {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? '#9aa4b2' : '#6b7280';
}

/** 模型配色（穩定對應） */
const PALETTE = ['#2563eb', '#e5484d', '#30a46c', '#d97706', '#8b5cf6', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#a16207', '#be123c', '#7c3aed', '#059669', '#9333ea', '#475569', '#c2410c', '#1d4ed8'];
export function colorFor(key: string, keys: string[]): string {
  const i = keys.indexOf(key);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}
