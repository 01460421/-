/**
 * AI 建議層（規格第七節）：傳入結構化情境 JSON，要求回傳固定 schema 的建議。
 * 使用 structured outputs（output_config.format）確保格式；每則建議都會寫入快照（modelId = 'ai'）。
 */
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropic, llmConfig, fallbackParams } from './provider';
import { ADVISOR_SYSTEM } from './prompts';
import { checkQuota, recordUsage } from './quota';
import { sanitizeCompliance, DISCLAIMER_SHORT } from '../compliance';

export interface AiAdvice {
  most_credible_model: { model_id: string; reason: string };
  parameter_suggestions: { model_id: string; parameter: string; suggestion: string; reason: string }[];
  reliability_warnings: string[];
  plain_summary: string;
  cited_fields: string[];
  label: string; // 固定為「AI 分析，非投資建議」
  model: string;
  generatedAt: string;
}

const ADVICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['most_credible_model', 'parameter_suggestions', 'reliability_warnings', 'plain_summary', 'cited_fields'],
  properties: {
    most_credible_model: {
      type: 'object',
      additionalProperties: false,
      required: ['model_id', 'reason'],
      properties: { model_id: { type: 'string' }, reason: { type: 'string' } },
    },
    parameter_suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['model_id', 'parameter', 'suggestion', 'reason'],
        properties: { model_id: { type: 'string' }, parameter: { type: 'string' }, suggestion: { type: 'string' }, reason: { type: 'string' } },
      },
    },
    reliability_warnings: { type: 'array', items: { type: 'string' } },
    plain_summary: { type: 'string' },
    cited_fields: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** 驗證 cited_fields 確實存在於情境 JSON，移除不存在的路徑（防止 AI 捏造來源） */
export function verifyCitations(context: unknown, fields: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const f of fields) {
    let cur: unknown = context;
    let ok = true;
    for (const part of f.split('.')) {
      if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
      else {
        ok = false;
        break;
      }
    }
    (ok ? valid : invalid).push(f);
  }
  return { valid, invalid };
}

export async function generateAdvice(context: unknown): Promise<AiAdvice> {
  const quota = checkQuota();
  if (quota) throw new Error(quota);
  const cfg = llmConfig();
  const client = getAnthropic();
  const fb = fallbackParams();
  const stream = client.beta.messages.stream({
    model: cfg.model,
    max_tokens: 16000,
    system: ADVISOR_SYSTEM,
    output_config: { effort: cfg.effort, format: { type: 'json_schema', schema: ADVICE_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: `情境 JSON：\n${JSON.stringify(context)}` }],
    ...(fb.betas ? { betas: fb.betas } : {}),
    // fallbacks 的 "default" 形式較新，SDK 型別可能尚未涵蓋
    ...(fb.fallbacks ? ({ fallbacks: fb.fallbacks } as Record<string, unknown>) : {}),
  } as Anthropic.Beta.Messages.MessageCreateParamsStreaming);
  const msg = await stream.finalMessage();
  recordUsage(cfg.model, msg.usage.input_tokens, msg.usage.output_tokens);
  if (msg.stop_reason === 'refusal') throw new Error('模型拒絕產生此分析');
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const parsed = JSON.parse(text) as Omit<AiAdvice, 'label' | 'model' | 'generatedAt'>;
  const cites = verifyCitations(context, parsed.cited_fields ?? []);
  const warnings = [...(parsed.reliability_warnings ?? [])];
  if (cites.invalid.length) warnings.push(`AI 引用了不存在的欄位，已移除：${cites.invalid.join(', ')}`);
  return {
    most_credible_model: { model_id: parsed.most_credible_model.model_id, reason: sanitizeCompliance(parsed.most_credible_model.reason) },
    parameter_suggestions: parsed.parameter_suggestions.map((p) => ({ ...p, suggestion: sanitizeCompliance(p.suggestion), reason: sanitizeCompliance(p.reason) })),
    reliability_warnings: warnings.map(sanitizeCompliance),
    plain_summary: sanitizeCompliance(parsed.plain_summary),
    cited_fields: cites.valid,
    label: DISCLAIMER_SHORT,
    model: msg.model,
    generatedAt: new Date().toISOString(),
  };
}
