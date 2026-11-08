/**
 * AI 即時互動分析（規格第十節）：串流輸出 + function calling 手動迴圈。
 * 事件以 NDJSON 逐行送到前端：
 *   {type:'text', delta} | {type:'tool_call', name, input} | {type:'tool_result', name, result}
 *   {type:'chart', command} | {type:'done', citations, usage} | {type:'error', message}
 * 所有數字必須來自工具回傳值或情境 JSON（system prompt 強制 + 前端顯示引用）。
 */
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropic, llmConfig, fallbackParams } from './provider';
import { ANALYST_SYSTEM } from './prompts';
import { checkQuota, recordUsage } from './quota';
import { sanitizeCompliance } from '../compliance';

export interface AiTool {
  definition: Anthropic.Beta.Messages.BetaTool;
  /** 回傳 JSON 可序列化結果；拋錯會以 is_error 回給模型 */
  run: (input: Record<string, unknown>) => Promise<unknown>;
  /** 驗證輸入（eager streaming 下伺服器不驗證，需自行驗證） */
  validate?: (input: unknown) => string | null;
}

export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: unknown; isError?: boolean }
  | { type: 'chart'; command: unknown }
  | { type: 'done'; citations: string[]; usage: { input: number; output: number } }
  | { type: 'error'; message: string };

/** 依 JSON Schema 的 required 與基本型別檢查工具輸入 */
export function basicValidate(schema: Anthropic.Beta.Messages.BetaTool['input_schema'], input: unknown): string | null {
  if (!input || typeof input !== 'object') return '輸入必須為物件';
  const obj = input as Record<string, unknown>;
  for (const k of (schema.required as string[] | undefined) ?? []) if (!(k in obj)) return `缺少必要欄位 ${k}`;
  const props = (schema.properties ?? {}) as Record<string, { type?: string; enum?: unknown[] }>;
  for (const [k, v] of Object.entries(obj)) {
    const p = props[k];
    if (!p) continue;
    if (p.type === 'number' && typeof v !== 'number') return `${k} 必須為數字`;
    if (p.type === 'string' && typeof v !== 'string') return `${k} 必須為字串`;
    if (p.enum && !p.enum.includes(v)) return `${k} 必須為 ${p.enum.join('/')}`;
  }
  return null;
}

export async function runChat(opts: {
  history: Anthropic.Beta.Messages.BetaMessageParam[];
  context: unknown;
  tools: AiTool[];
  emit: (e: ChatEvent) => void;
  maxTurns?: number;
}): Promise<Anthropic.Beta.Messages.BetaMessageParam[]> {
  const quota = checkQuota();
  if (quota) {
    opts.emit({ type: 'error', message: quota });
    return opts.history;
  }
  const cfg = llmConfig();
  const client = getAnthropic();
  const fb = fallbackParams();
  const toolMap = new Map(opts.tools.map((t) => [t.definition.name, t]));
  const tools = opts.tools.map((t) => ({ ...t.definition, eager_input_streaming: true }));
  // 情境 JSON 放在 system 的第二段並設定快取斷點（同一頁面多次發問可命中快取）
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: 'text', text: ANALYST_SYSTEM },
    { type: 'text', text: `目前頁面情境 JSON（所有數字的唯一來源之一）：\n${JSON.stringify(opts.context)}`, cache_control: { type: 'ephemeral' } },
  ];
  const messages = [...opts.history];
  const citations = new Set<string>();
  let usageIn = 0;
  let usageOut = 0;
  let jsonRetries = 0;

  for (let turn = 0; turn < (opts.maxTurns ?? 8); turn++) {
    const stream = client.beta.messages.stream({
      model: cfg.model,
      max_tokens: 64000,
      system,
      tools: tools as Anthropic.Beta.Messages.BetaToolUnion[],
      messages,
      output_config: { effort: cfg.effort },
      ...(fb.betas ? { betas: fb.betas } : {}),
      ...(fb.fallbacks ? ({ fallbacks: fb.fallbacks } as Record<string, unknown>) : {}),
    } as Anthropic.Beta.Messages.MessageCreateParamsStreaming);
    stream.on('text', (delta) => opts.emit({ type: 'text', delta: sanitizeCompliance(delta) }));

    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) {
        opts.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        return messages;
      }
      continue; // 工具輸入 JSON 無法解析：重送此回合
    }
    usageIn += message.usage.input_tokens;
    usageOut += message.usage.output_tokens;
    recordUsage(cfg.model, message.usage.input_tokens, message.usage.output_tokens);
    messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });

    if (message.stop_reason === 'refusal') {
      opts.emit({ type: 'error', message: '模型拒絕回答此問題' });
      break;
    }
    if (message.stop_reason === 'pause_turn') continue;
    const toolUses = message.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use');
    if (!toolUses.length) break;
    if (message.stop_reason === 'max_tokens') {
      opts.emit({ type: 'error', message: '回答過長被截斷' });
      break;
    }
    // 平行工具呼叫：全部執行後以單一 user 訊息回傳所有 tool_result
    const results = await Promise.all(
      toolUses.map(async (tu): Promise<Anthropic.Beta.Messages.BetaToolResultBlockParam> => {
        const tool = toolMap.get(tu.name);
        opts.emit({ type: 'tool_call', name: tu.name, input: tu.input });
        if (!tool) return { type: 'tool_result', tool_use_id: tu.id, content: `未知工具 ${tu.name}`, is_error: true };
        const bad = (tool.validate ?? ((i: unknown) => basicValidate(tool.definition.input_schema, i)))(tu.input);
        if (bad) {
          opts.emit({ type: 'tool_result', name: tu.name, result: bad, isError: true });
          return { type: 'tool_result', tool_use_id: tu.id, content: `INVALID_INPUT: ${bad}`, is_error: true };
        }
        try {
          const result = await tool.run(tu.input as Record<string, unknown>);
          citations.add(`tool:${tu.name}@${new Date().toISOString()}`);
          if (tu.name === 'chart_command') opts.emit({ type: 'chart', command: tu.input });
          opts.emit({ type: 'tool_result', name: tu.name, result });
          return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          opts.emit({ type: 'tool_result', name: tu.name, result: msg, isError: true });
          return { type: 'tool_result', tool_use_id: tu.id, content: msg, is_error: true };
        }
      }),
    );
    messages.push({ role: 'user', content: results });
  }
  opts.emit({ type: 'done', citations: [...citations], usage: { input: usageIn, output: usageOut } });
  return messages;
}
