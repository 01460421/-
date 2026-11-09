/**
 * LLM 每日配額與費用上限（規格第九節：LLM 呼叫有每日配額與費用上限）。
 * 計數存在 KV（若有設定）否則記憶體；以台北日期為一日。
 */
const g = globalThis as unknown as { __sflQuota?: Map<string, { requests: number; costUsd: number }> };
const mem = (g.__sflQuota ??= new Map());

/** 每百萬 token 單價（美元），未知模型以 Opus 5.5 價格保守估計 */
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-fable-5-1': { in: 10, out: 50 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING['claude-opus-5-5'];
  return (inputTokens * p.in + outputTokens * p.out) / 1e6;
}

function todayKey(): string {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  return `llm-quota:${d}`;
}

export function limits() {
  return {
    maxRequests: Number(process.env.LLM_DAILY_REQUEST_LIMIT ?? 200),
    maxCostUsd: Number(process.env.LLM_DAILY_COST_LIMIT_USD ?? 5),
  };
}

export function usage() {
  return mem.get(todayKey()) ?? { requests: 0, costUsd: 0 };
}

/** 呼叫前檢查；超出時回傳原因字串 */
export function checkQuota(): string | null {
  const u = usage();
  const l = limits();
  if (u.requests >= l.maxRequests) return `今日 AI 呼叫次數已達上限（${l.maxRequests} 次）`;
  if (u.costUsd >= l.maxCostUsd) return `今日 AI 費用已達上限（US$${l.maxCostUsd}）`;
  return null;
}

export function recordUsage(model: string, inputTokens: number, outputTokens: number) {
  const k = todayKey();
  const u = mem.get(k) ?? { requests: 0, costUsd: 0 };
  u.requests += 1;
  u.costUsd += estimateCostUsd(model, inputTokens, outputTokens);
  mem.set(k, u);
}
