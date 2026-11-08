/**
 * 系統健康監控資料（伺服器端）：資料源失敗率與連續失敗、排程延遲、API 配額、儲存類型、環境設定檢查。
 * 環境變數只回報「是否已設定」（布林），絕不回傳值。
 */
import type { SystemEvent } from '@/lib/types';
import type { AdapterHealth } from '@/lib/data-adapters/types';
import type { Store } from '@/lib/storage/types';
import { getStore } from '@/lib/storage';
import { getMarketData } from '@/lib/data-adapters';
import { limits as llmLimits, usage as llmUsage } from '@/lib/ai/quota';

/** 與 vercel.json 的 crons 保持一致（Vercel Cron 時間為 UTC） */
export const CRON_SCHEDULES: { id: string; job: 'close' | 'intraday' | 'backfill'; market?: 'TW' | 'US'; path: string; cron: string; label: string }[] = [
  { id: 'close-TW', job: 'close', market: 'TW', path: '/api/cron/close?market=TW', cron: '10 6 * * 1-5', label: '台股收盤全量（台北 14:10）' },
  { id: 'close-US', job: 'close', market: 'US', path: '/api/cron/close?market=US', cron: '20 22 * * 1-5', label: '美股收盤全量（UTC 22:20）' },
  { id: 'intraday-TW', job: 'intraday', market: 'TW', path: '/api/cron/intraday?market=TW', cron: '*/15 1-5 * * 1-5', label: '台股盤中輕量偵測（每 15 分）' },
  { id: 'intraday-US', job: 'intraday', market: 'US', path: '/api/cron/intraday?market=US', cron: '*/15 13-21 * * 1-5', label: '美股盤中輕量偵測（每 15 分）' },
  { id: 'backfill', job: 'backfill', path: '/api/cron/backfill', cron: '40 23 * * *', label: '實際值回填（UTC 23:40）' },
];

// ───────── 極簡 cron 解析（支援 *、*/n、a-b、a-b/n、逗號清單） ─────────

function fieldMatches(expr: string, v: number): boolean {
  return expr.split(',').some((part) => {
    const [range, stepS] = part.split('/');
    const step = stepS ? Number(stepS) : 1;
    let lo: number;
    let hi: number;
    if (range === '*') {
      lo = 0;
      hi = 59;
    } else if (range.includes('-')) {
      [lo, hi] = range.split('-').map(Number);
    } else {
      lo = Number(range);
      hi = stepS ? 59 : lo;
    }
    return v >= lo && v <= hi && (v - lo) % step === 0;
  });
}

export function cronMatches(cron: string, d: Date): boolean {
  const [mi, h, dom, mo, dow] = cron.trim().split(/\s+/);
  return fieldMatches(mi, d.getUTCMinutes()) && fieldMatches(h, d.getUTCHours()) && fieldMatches(dom, d.getUTCDate()) && fieldMatches(mo, d.getUTCMonth() + 1) && fieldMatches(dow, d.getUTCDay());
}

/** 不晚於 now 的最近一次排定時間（往回最多 8 天） */
export function lastScheduled(cron: string, now: Date): Date | null {
  const t = new Date(now);
  t.setUTCSeconds(0, 0);
  for (let i = 0; i < 8 * 1440; i++) {
    if (cronMatches(cron, t)) return new Date(t);
    t.setUTCMinutes(t.getUTCMinutes() - 1);
  }
  return null;
}

// ───────── 型別 ─────────

export interface ScheduleStatus {
  id: string;
  label: string;
  path: string;
  cron: string;
  expectedLast: string | null;
  lastRun: { at: string; startedAt: string; durationMs: number | null; kind: SystemEvent['kind']; severity: SystemEvent['severity']; skipped: string | null; ok: number; failed: number } | null;
  /** 最近一次排定時間對應的實際啟動延遲（分鐘） */
  delayMinutes: number | null;
  status: 'ok' | 'late' | 'missed' | 'error' | 'never';
}

export interface AdapterRow extends AdapterHealth {
  failureRate: number | null;
  alert: boolean;
}

export interface EnvItem {
  key: string;
  label: string;
  group: string;
  configured: boolean;
  note?: string;
}

export interface HealthData {
  generatedAt: string;
  overall: 'ok' | 'warn' | 'critical';
  storage: { kind: Store['kind']; onVercel: boolean; warning: string | null };
  adapters: AdapterRow[];
  adapterNote: string;
  dataSourceErrors: { last24h: number; last7d: number; consecutiveCritical: number; recent: Pick<SystemEvent, 'at' | 'symbol' | 'severity' | 'title'>[] };
  schedules: ScheduleStatus[];
  jobErrors24h: number;
  llm: { configured: boolean; usage: { requests: number; costUsd: number }; limits: { maxRequests: number; maxCostUsd: number }; note: string };
  env: EnvItem[];
}

const has = (...keys: string[]) => keys.every((k) => !!process.env[k] && process.env[k]!.trim() !== '');
const any = (...keys: string[]) => keys.some((k) => has(k));

export function envChecklist(): EnvItem[] {
  return [
    { group: '儲存', key: 'DATABASE_URL', label: 'Postgres 連線（DATABASE_URL / POSTGRES_URL）', configured: any('DATABASE_URL', 'POSTGRES_URL'), note: '未設定 → 記憶體儲存，Vercel 上快照無法持久保存' },
    { group: '儲存', key: 'KV_REST_API_URL', label: 'KV 快取（KV_REST_API_URL + TOKEN）', configured: has('KV_REST_API_URL', 'KV_REST_API_TOKEN'), note: '未設定 → 記憶體 LRU' },
    { group: '資料源', key: 'FINMIND_TOKEN', label: 'FinMind Token（台股）', configured: has('FINMIND_TOKEN'), note: '選填；未設定使用免費額度' },
    { group: '資料源', key: 'ALPHAVANTAGE_API_KEY', label: 'Alpha Vantage（美股備援）', configured: has('ALPHAVANTAGE_API_KEY') },
    { group: '資料源', key: 'POLYGON_API_KEY', label: 'Polygon（美股備援）', configured: has('POLYGON_API_KEY') },
    { group: '資料源', key: 'FINNHUB_API_KEY', label: 'Finnhub（財報日 / 報價）', configured: has('FINNHUB_API_KEY') },
    { group: 'AI', key: 'ANTHROPIC_API_KEY', label: 'LLM 金鑰（ANTHROPIC_API_KEY）', configured: has('ANTHROPIC_API_KEY'), note: '未設定 → AI 分析助理停用' },
    { group: 'AI', key: 'LLM_MODEL', label: 'LLM 模型設定（LLM_MODEL）', configured: has('LLM_MODEL'), note: '未設定使用預設模型' },
    { group: '排程', key: 'CRON_SECRET', label: '排程驗證（CRON_SECRET）', configured: has('CRON_SECRET'), note: '正式環境必填，避免排程端點被外部觸發' },
    { group: '排程', key: 'TRACK_SYMBOLS', label: '固定追蹤代號（TRACK_SYMBOLS）', configured: has('TRACK_SYMBOLS'), note: '未設定使用預設清單' },
    { group: '通知', key: 'DISCORD_WEBHOOK_URL', label: 'Discord Webhook', configured: has('DISCORD_WEBHOOK_URL') },
    { group: '通知', key: 'LINE_CHANNEL_ACCESS_TOKEN', label: 'LINE Messaging API（TOKEN + LINE_TO）', configured: has('LINE_CHANNEL_ACCESS_TOKEN', 'LINE_TO') },
    { group: '通知', key: 'RESEND_API_KEY', label: 'Email（RESEND_API_KEY + ALERT_EMAIL_TO）', configured: has('RESEND_API_KEY', 'ALERT_EMAIL_TO') },
    { group: '通知', key: 'ADMIN_ALERT_WEBHOOK', label: '管理者通知 Webhook', configured: any('ADMIN_ALERT_WEBHOOK', 'DISCORD_WEBHOOK_URL'), note: '連續失敗兩次時通知；未設定時改用 Discord Webhook' },
    { group: '網站', key: 'NEXT_PUBLIC_SITE_URL', label: '網站網址（通知直連 URL）', configured: has('NEXT_PUBLIC_SITE_URL') },
    { group: '數值服務', key: 'PY_SERVICE_URL', label: 'Python 數值微服務', configured: has('PY_SERVICE_URL'), note: '選填；未設定全部使用 TypeScript 實作' },
  ];
}

function runInfo(e: SystemEvent): NonNullable<ScheduleStatus['lastRun']> {
  const d = e.detail as { startedAt?: string; durationMs?: number; skipped?: string; ok?: unknown[]; failed?: unknown[]; report?: { startedAt?: string; durationMs?: number; ok?: unknown[]; failed?: unknown[] } };
  const r = e.kind === 'job_error' ? (d.report ?? {}) : d;
  return {
    at: e.at,
    startedAt: r.startedAt ?? e.at,
    durationMs: typeof r.durationMs === 'number' ? r.durationMs : null,
    kind: e.kind,
    severity: e.severity,
    skipped: d.skipped ?? null,
    ok: r.ok?.length ?? 0,
    failed: r.failed?.length ?? 0,
  };
}

function jobKey(e: SystemEvent): { job?: string; market?: string } {
  const d = e.detail as { job?: string; market?: string; report?: { job?: string; market?: string } };
  return e.kind === 'job_error' ? { job: d.report?.job ?? d.job, market: d.report?.market ?? d.market } : { job: d.job, market: d.market };
}

export async function getHealthData(now = new Date()): Promise<HealthData> {
  const store = await getStore();
  const onVercel = !!process.env.VERCEL;

  // 資料源（本執行個體的累計統計）
  let health: AdapterHealth[] = [];
  try {
    health = getMarketData().health();
  } catch {
    health = [];
  }
  const adapters: AdapterRow[] = health.map((h) => ({ ...h, failureRate: h.calls ? h.failures / h.calls : null, alert: h.consecutiveFailures >= 2 }));

  const d7 = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const d1 = new Date(now.getTime() - 86400_000).toISOString();
  const dsErr = await store.listEvents({ kind: 'data_source_error', from: d7, limit: 2000 });

  // 排程
  const runs = [...(await store.listEvents({ kind: 'job_run', from: d7, limit: 3000 })), ...(await store.listEvents({ kind: 'job_error', from: d7, limit: 1000 }))].sort((a, b) => (a.at < b.at ? 1 : -1));
  const jobErrors24h = runs.filter((e) => e.kind === 'job_error' && e.at >= d1).length;
  const schedules: ScheduleStatus[] = CRON_SCHEDULES.map((s) => {
    const mine = runs.filter((e) => {
      const k = jobKey(e);
      return k.job === s.job && (s.market ? k.market === s.market : true) && (e.kind === 'job_run' || !!k.job);
    });
    const exp = lastScheduled(s.cron, now);
    const last = mine[0] ? runInfo(mine[0]) : null;
    let delayMinutes: number | null = null;
    let status: ScheduleStatus['status'] = 'never';
    if (exp) {
      // 對應這次排定時間的執行：啟動時間不早於排定前 5 分鐘
      const matched = mine.map(runInfo).filter((r) => new Date(r.startedAt).getTime() >= exp.getTime() - 5 * 60_000).pop();
      if (matched) {
        delayMinutes = Math.max(0, (new Date(matched.startedAt).getTime() - exp.getTime()) / 60_000);
        status = matched.kind === 'job_error' ? 'error' : delayMinutes > 15 ? 'late' : 'ok';
      } else if (last) {
        const waited = (now.getTime() - exp.getTime()) / 60_000;
        status = waited > 30 ? 'missed' : last.kind === 'job_error' ? 'error' : 'ok';
        delayMinutes = waited > 30 ? waited : null;
      }
    }
    return { id: s.id, label: s.label, path: s.path, cron: s.cron, expectedLast: exp?.toISOString() ?? null, lastRun: last, delayMinutes, status };
  });

  const storageWarning =
    store.kind === 'memory'
      ? onVercel
        ? '目前在 Vercel 上使用記憶體儲存：快照、回填值與事件只存在單一 Serverless 執行個體內，重新部署或冷啟動即遺失。請設定 DATABASE_URL。'
        : '未設定資料庫：使用記憶體儲存並同步到本機 .data/store.json（僅適合本機開發）。'
      : null;

  const llm = { configured: has('ANTHROPIC_API_KEY'), usage: llmUsage(), limits: llmLimits(), note: '計數以台北日期為一日；未設定 KV 時為單一執行個體的記憶體計數。' };
  const consecutiveCritical = dsErr.filter((e) => e.severity === 'critical' && e.at >= d1).length;

  const sevs: HealthData['overall'][] = [
    adapters.some((a) => a.alert) || consecutiveCritical > 0 ? 'critical' : 'ok',
    schedules.some((s) => s.status === 'missed' || s.status === 'error') ? 'critical' : schedules.some((s) => s.status === 'late') ? 'warn' : 'ok',
    store.kind === 'memory' && onVercel ? 'critical' : 'ok',
    jobErrors24h > 0 ? 'warn' : 'ok',
    llm.usage.requests >= llm.limits.maxRequests * 0.8 || llm.usage.costUsd >= llm.limits.maxCostUsd * 0.8 ? 'warn' : 'ok',
  ];
  const overall = sevs.includes('critical') ? 'critical' : sevs.includes('warn') ? 'warn' : 'ok';

  return {
    generatedAt: now.toISOString(),
    overall,
    storage: { kind: store.kind, onVercel, warning: storageWarning },
    adapters,
    adapterNote: '資料源統計為本伺服器執行個體啟動以來的累計（Serverless 冷啟動會歸零）；跨執行個體的失敗紀錄見下方資料源錯誤事件。連續失敗 ≥ 2 次時排程會通知管理者。',
    dataSourceErrors: {
      last24h: dsErr.filter((e) => e.at >= d1).length,
      last7d: dsErr.length,
      consecutiveCritical,
      recent: dsErr.slice(0, 10).map((e) => ({ at: e.at, symbol: e.symbol, severity: e.severity, title: e.title })),
    },
    schedules,
    jobErrors24h,
    llm,
    env: envChecklist(),
  };
}
