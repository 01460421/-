/**
 * AI 即時互動分析面板（規格第十節）。
 *   GET  → { configured, provider, model, quota: { requests, costUsd, maxRequests, maxCostUsd } }
 *   POST { symbol, messages: [{role:'user'|'assistant', content}], context, config?, conversationId? }
 *        → NDJSON 串流（每行一個 ChatEvent；首行 {type:'conversation', id}）。
 * 對話結束後連同情境快照存入對話表（個人資料，只存於 cookie 使用者 id 名下）。
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ChatMessage, Conversation } from '@/lib/types';
import type { EngineConfig } from '@/lib/engine/types';
import { runChat, type ChatEvent } from '@/lib/ai/chat';
import { llmConfig } from '@/lib/ai/provider';
import { usage, limits } from '@/lib/ai/quota';
import { makeChatTools } from '@/lib/ai/tools';
import { getStore, newId } from '@/lib/storage';
import { getUserId } from '@/lib/user';
import { normalizeSymbol } from '@/lib/data-adapters';
import { DISCLAIMER_SHORT } from '@/lib/compliance';
import { ConfigSchema } from '../../analyze/_schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Hobby 方案上限；Pro 或啟用 Fluid compute 可調高到 300

export async function GET() {
  const cfg = llmConfig();
  const u = usage();
  const l = limits();
  return Response.json({
    configured: cfg.configured && cfg.provider === 'anthropic',
    provider: cfg.provider,
    model: cfg.model,
    quota: { requests: u.requests, costUsd: Number(u.costUsd.toFixed(4)), maxRequests: l.maxRequests, maxCostUsd: l.maxCostUsd },
    reason: cfg.configured ? null : '伺服器未設定 ANTHROPIC_API_KEY，AI 分析功能停用。設定環境變數後重新部署即可啟用。',
    label: DISCLAIMER_SHORT,
  });
}

const Body = z.object({
  symbol: z.string().min(1).max(40),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(20000) })).min(1).max(40),
  context: z.record(z.unknown()),
  config: ConfigSchema.optional(),
  conversationId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const cfg = llmConfig();
  if (!cfg.configured) return Response.json({ error: '伺服器未設定 ANTHROPIC_API_KEY，AI 分析功能停用。' }, { status: 503 });
  let body: z.infer<typeof Body>;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: `輸入格式錯誤：${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('；')}` }, { status: 400 });
    body = parsed.data;
  } catch {
    return Response.json({ error: '請求內容必須為 JSON' }, { status: 400 });
  }
  const info = normalizeSymbol(body.symbol);
  if (!info) return Response.json({ error: `無法辨識代號：${body.symbol}` }, { status: 400 });
  if (JSON.stringify(body.context).length > 60_000) return Response.json({ error: '情境 JSON 過大（上限 60KB）' }, { status: 413 });
  if (body.messages[body.messages.length - 1].role !== 'user') return Response.json({ error: '最後一則訊息必須為使用者訊息' }, { status: 400 });

  const userId = getUserId();
  const conversationId = body.conversationId ?? newId();
  const tools = makeChatTools({ symbol: info.symbol, baseConfig: body.config as Partial<EngineConfig> | undefined });
  const history: Anthropic.Beta.Messages.BetaMessageParam[] = body.messages.map((m) => ({ role: m.role, content: m.content }));
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const now = () => new Date().toISOString();
      const transcript: ChatMessage[] = [];
      let text = '';
      let closed = false;
      const send = (e: ChatEvent | { type: 'conversation'; id: string }) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + '\n'));
        } catch {
          closed = true;
        }
      };
      send({ type: 'conversation', id: conversationId });
      const emit = (e: ChatEvent) => {
        if (e.type === 'text') text += e.delta;
        if (e.type === 'tool_call') {
          if (text) transcript.push({ role: 'assistant', content: text, at: now() });
          text = '';
          transcript.push({ role: 'tool', content: JSON.stringify(e.input).slice(0, 4000), toolName: e.name, at: now() });
        }
        if (e.type === 'tool_result') transcript.push({ role: 'tool', content: JSON.stringify(e.result).slice(0, 8000), toolName: `${e.name}:result`, at: now() });
        send(e);
      };
      try {
        await runChat({ history, context: body.context, tools, emit });
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      }
      if (text) transcript.push({ role: 'assistant', content: text, at: now() });
      try {
        const store = await getStore();
        const prior = (await store.listConversations(userId, info.symbol)).find((c) => c.id === conversationId);
        const userMsg = body.messages[body.messages.length - 1];
        const conv: Conversation = {
          id: conversationId,
          userId,
          symbol: info.symbol,
          createdAt: prior?.createdAt ?? now(),
          messages: [...(prior?.messages ?? []), { role: 'user', content: userMsg.content, at: now() }, ...transcript],
          contextSnapshot: body.context,
        };
        await store.saveConversation(conv);
      } catch {
        /* 對話儲存失敗不影響已串流的回答 */
      }
      closed = true;
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Conversation-Id': conversationId } });
}
