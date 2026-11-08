/**
 * LLM 供應商設定（透過環境變數）：
 *   LLM_PROVIDER = anthropic（預設；目前唯一實作）
 *   LLM_MODEL    = claude-opus-5-5（預設）
 *   ANTHROPIC_API_KEY
 * 新增供應商：實作與 lib/ai/chat.ts、lib/ai/advisor.ts 相同的呼叫流程並在此分派。
 */
import Anthropic from '@anthropic-ai/sdk';

export function llmConfig() {
  return {
    provider: (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase(),
    model: process.env.LLM_MODEL ?? 'claude-opus-5-5',
    effort: (process.env.LLM_EFFORT ?? 'medium') as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
    configured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  };
}

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  const cfg = llmConfig();
  if (cfg.provider !== 'anthropic') throw new Error(`LLM_PROVIDER=${cfg.provider} 尚未實作，請使用 anthropic`);
  if (!cfg.configured) throw new Error('未設定 ANTHROPIC_API_KEY，AI 分析功能停用');
  client ??= new Anthropic();
  return client;
}

/**
 * 伺服器端拒答備援（refusal fallback）：以 "default" 模式讓 API 依拒答類別自動改由建議模型重跑。
 * 僅 Claude API 支援；設定 LLM_FALLBACKS=off 可關閉。
 */
export function fallbackParams(): { betas?: string[]; fallbacks?: 'default' } {
  if (process.env.LLM_FALLBACKS === 'off') return {};
  return { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
}
