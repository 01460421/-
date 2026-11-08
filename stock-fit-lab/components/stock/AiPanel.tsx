'use client';
/**
 * AI 即時互動分析面板（規格第七、十節）：
 *  - 串流對話（NDJSON），工具呼叫可展開檢視；chart_command 直接在主圖執行
 *  - 「AI 結構化建議」固定 schema，列出引用欄位
 *  - 框選區間 →「這段發生什麼事」
 *  - 主動推送：輪詢偵測到新偵測器命中時插入簡短系統說明（可關閉）
 *  - 每則 AI 回答末尾標示「AI 分析，非投資建議」與引用
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartCommand } from './types';
import { fetchJson, fmtTime, readLocal, writeLocal } from './util';

const LABEL = 'AI 分析，非投資建議';

interface ToolTrace {
  name: string;
  input: unknown;
  result?: unknown;
  isError?: boolean;
}
interface Msg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tools?: ToolTrace[];
  citations?: string[];
  error?: string;
  at: string;
  streaming?: boolean;
  /** 系統說明附帶的追問 */
  followUp?: string;
}
interface Status {
  configured: boolean;
  model: string;
  provider: string;
  quota: { requests: number; costUsd: number; maxRequests: number; maxCostUsd: number };
  reason: string | null;
}
interface Advice {
  most_credible_model: { model_id: string; reason: string };
  parameter_suggestions: { model_id: string; parameter: string; suggestion: string; reason: string }[];
  reliability_warnings: string[];
  plain_summary: string;
  cited_fields: string[];
  label: string;
  model: string;
  generatedAt: string;
}

const uid = () => Math.random().toString(36).slice(2);

export default function AiPanel({
  symbol,
  getContext,
  config,
  selection,
  alerts,
  onChartCommand,
}: {
  symbol: string;
  /** 依目前狀態建立情境 JSON；selection 覆寫時用於「這段發生什麼事」 */
  getContext: (selection?: { from: string; to: string } | null) => Record<string, unknown> | null;
  config: Record<string, unknown>;
  selection: { from: string; to: string } | null;
  /** 輪詢偵測到的新事件（主動推送） */
  alerts: { key: string; text: string }[];
  onChartCommand: (c: ChartCommand) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | undefined>();
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [adviceBusy, setAdviceBusy] = useState(false);
  const [adviceErr, setAdviceErr] = useState<string | null>(null);
  const [proactive, setProactive] = useState(true);
  const seenAlerts = useRef(new Set<string>());
  const box = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    setProactive(readLocal('sfl-ai-proactive', true));
    fetchJson<Status>('/api/ai/chat')
      .then(setStatus)
      .catch((e: Error) => setStatusErr(e.message));
  }, []);

  // 換代號時重置對話
  useEffect(() => {
    setMsgs([]);
    setConvId(undefined);
    setAdvice(null);
    seenAlerts.current.clear();
  }, [symbol]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [msgs]);

  // 主動推送：新偵測器命中 → 簡短系統說明
  useEffect(() => {
    if (!proactive) return;
    const fresh = alerts.filter((a) => !seenAlerts.current.has(a.key));
    if (!fresh.length) return;
    fresh.forEach((a) => seenAlerts.current.add(a.key));
    setMsgs((m) => [
      ...m,
      {
        id: uid(),
        role: 'system',
        content: `盤中新資料觸發 ${fresh.length} 項偵測：\n${fresh.slice(0, 5).map((a) => `• ${a.text}`).join('\n')}`,
        at: new Date().toISOString(),
        followUp: '請根據情境 JSON 解釋剛剛觸發的偵測器事件代表什麼、是否與公司事件重疊，以及對模型可靠度的影響。',
      },
    ]);
  }, [alerts, proactive]);

  const send = useCallback(
    async (text: string, sel?: { from: string; to: string } | null) => {
      const q = text.trim();
      if (!q || busy || !status?.configured) return;
      const context = getContext(sel ?? null);
      if (!context) return;
      const userMsg: Msg = { id: uid(), role: 'user', content: q, at: new Date().toISOString() };
      const asst: Msg = { id: uid(), role: 'assistant', content: '', tools: [], at: new Date().toISOString(), streaming: true };
      const history = [...msgs.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content && !m.error), userMsg].slice(-20).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      setMsgs((m) => [...m, userMsg, asst]);
      setInput('');
      setBusy(true);
      const update = (fn: (a: Msg) => Msg) => setMsgs((m) => m.map((x) => (x.id === asst.id ? fn(x) : x)));
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, messages: history, context, config, conversationId: convId }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let ev: { type: string; [k: string]: unknown };
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.type === 'conversation') setConvId(ev.id as string);
            else if (ev.type === 'text') update((a) => ({ ...a, content: a.content + (ev.delta as string) }));
            else if (ev.type === 'tool_call') update((a) => ({ ...a, tools: [...(a.tools ?? []), { name: ev.name as string, input: ev.input }] }));
            else if (ev.type === 'tool_result')
              update((a) => {
                const tools = [...(a.tools ?? [])];
                for (let i = tools.length - 1; i >= 0; i--)
                  if (tools[i].name === ev.name && tools[i].result === undefined) {
                    tools[i] = { ...tools[i], result: ev.result, isError: ev.isError as boolean | undefined };
                    break;
                  }
                return { ...a, tools };
              });
            else if (ev.type === 'chart') onChartCommand(ev.command as ChartCommand);
            else if (ev.type === 'done') update((a) => ({ ...a, citations: ev.citations as string[], streaming: false }));
            else if (ev.type === 'error') update((a) => ({ ...a, error: ev.message as string, streaming: false }));
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') update((a) => ({ ...a, error: e instanceof Error ? e.message : String(e) }));
      } finally {
        update((a) => ({ ...a, streaming: false }));
        setBusy(false);
        abort.current = null;
      }
    },
    [busy, status, getContext, msgs, symbol, config, convId, onChartCommand],
  );

  const runAdvice = async () => {
    const context = getContext(null);
    if (!context) return;
    setAdviceBusy(true);
    setAdviceErr(null);
    try {
      const d = await fetchJson<{ advice: Advice; snapshotId: string | null }>('/api/ai/advice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, context }) });
      setAdvice(d.advice);
    } catch (e) {
      setAdviceErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdviceBusy(false);
    }
  };

  const disabled = !status?.configured;
  const suggestions = ['目前哪個模型最可信？為什麼？', '如果視窗改成 60 日會怎樣？', '近 20 日三大法人買賣超如何？請加到圖上', '把卡爾曼曲線高亮'];

  return (
    <section className="panel flex flex-col gap-2" aria-label="AI 分析助理">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="h2 mr-auto">AI 分析助理</h2>
        <label className="flex items-center gap-1 text-xs" title="盤中有新資料或偵測器觸發時，主動推送簡短說明">
          <input
            type="checkbox"
            checked={proactive}
            onChange={(e) => {
              setProactive(e.target.checked);
              writeLocal('sfl-ai-proactive', e.target.checked);
            }}
          />
          主動推送
        </label>
        <button className="btn text-xs" onClick={runAdvice} disabled={disabled || adviceBusy}>
          {adviceBusy ? '產生中…' : 'AI 結構化建議'}
        </button>
      </div>
      {statusErr && <p className="text-xs text-red-500">{statusErr}</p>}
      {status && disabled && (
        <div className="rounded border border-amber-400/60 bg-amber-500/10 p-2 text-xs">
          <b>AI 功能未啟用。</b>
          {status.reason ?? '伺服器未設定 LLM 金鑰。'} 其餘數學擬合、基準對照、偵測器功能不受影響。
        </div>
      )}
      {status && !disabled && (
        <p className="text-[11px] muted">
          模型 {status.model} · 今日用量 {status.quota.requests}/{status.quota.maxRequests} 次、US${status.quota.costUsd.toFixed(2)}/{status.quota.maxCostUsd} · 只根據系統計算出的數據回答，所有數字來自情境 JSON 或工具回傳值
        </p>
      )}

      {adviceErr && <p className="text-xs text-red-500">{adviceErr}</p>}
      {advice && (
        <div className="space-y-1 rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <b>AI 結構化建議</b>
            <button className="muted" onClick={() => setAdvice(null)} aria-label="關閉建議">
              ×
            </button>
          </div>
          <p>
            <span className="muted">最可信模型：</span>
            <b>{advice.most_credible_model.model_id}</b> — {advice.most_credible_model.reason}
          </p>
          {advice.parameter_suggestions.length > 0 && (
            <div>
              <span className="muted">參數建議：</span>
              <ul className="ml-4 list-disc">
                {advice.parameter_suggestions.map((p, i) => (
                  <li key={i}>
                    {p.model_id}.{p.parameter}：{p.suggestion}（{p.reason}）
                  </li>
                ))}
              </ul>
            </div>
          )}
          {advice.reliability_warnings.length > 0 && (
            <div className="text-amber-600">
              <span>可靠度警語：</span>
              <ul className="ml-4 list-disc">
                {advice.reliability_warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <p>{advice.plain_summary}</p>
          <details>
            <summary className="cursor-pointer muted">引用欄位（{advice.cited_fields.length}）</summary>
            <ul className="ml-4 list-disc font-mono text-[10px]">
              {advice.cited_fields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </details>
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
            {advice.label ?? LABEL} · {advice.model} · {fmtTime(advice.generatedAt)} · 已寫入快照供事後回顧
          </p>
        </div>
      )}

      <div ref={box} className="max-h-[460px] min-h-[120px] space-y-2 overflow-y-auto pr-1" aria-live="polite">
        {msgs.length === 0 && (
          <div className="space-y-1 text-xs muted">
            <p>可詢問模型可信度、參數調整、what-if 情境、法人買賣超、比較兩檔等。助理可直接在主圖上標註區間、高亮曲線、切換尺度或加入子圖。</p>
            <div className="flex flex-wrap gap-1">
              {suggestions.map((s) => (
                <button key={s} className="chip hover:underline" disabled={disabled || busy} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="ml-6 whitespace-pre-wrap rounded-lg bg-blue-500/10 p-2 text-sm">
              {m.content}
            </div>
          ) : m.role === 'system' ? (
            <div key={m.id} className="whitespace-pre-wrap rounded-lg border border-dashed p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
              <span className="muted">系統推送 · {fmtTime(m.at)}</span>
              <div>{m.content}</div>
              {m.followUp && !disabled && (
                <button className="btn mt-1 text-xs" disabled={busy} onClick={() => send(m.followUp!)}>
                  請 AI 解釋
                </button>
              )}
            </div>
          ) : (
            <div key={m.id} className="mr-2 space-y-1 rounded-lg border p-2 text-sm" style={{ borderColor: 'var(--border)' }}>
              {m.tools?.map((t, i) => (
                <details key={i} className="text-xs">
                  <summary className="cursor-pointer muted">
                    🔧 {t.name} {t.result === undefined ? '（執行中…）' : t.isError ? '（失敗）' : '（完成）'}
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-gray-500/10 p-1 text-[10px]">輸入：{JSON.stringify(t.input, null, 1)}{t.result !== undefined ? `\n結果：${JSON.stringify(t.result, null, 1).slice(0, 4000)}` : ''}</pre>
                </details>
              ))}
              <div className="whitespace-pre-wrap leading-relaxed">
                {m.content}
                {m.streaming && <span className="animate-pulse">▍</span>}
              </div>
              {m.error && <p className="text-xs text-red-500">錯誤：{m.error}</p>}
              {!m.streaming && (
                <div className="border-t pt-1 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                  {m.citations && m.citations.length > 0 && <div className="font-mono text-[10px] muted">工具引用：{m.citations.join('、')}</div>}
                  <div className="muted">情境資料時間：{fmtTime(m.at)}</div>
                  <div className="font-medium text-amber-700 dark:text-amber-400">{LABEL}</div>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      {selection && (
        <button className="btn text-xs" disabled={disabled || busy} onClick={() => send(`這段（${selection.from} ~ ${selection.to}）發生什麼事？請根據情境 JSON 的 selection 與偵測器、事件資料說明，必要時查詢三大法人資料並在圖上標註。`, selection)}>
          🔍 問 AI：框選區間 {selection.from} ~ {selection.to} 發生什麼事？
        </button>
      )}
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input className="input min-w-0 flex-1" placeholder={disabled ? 'AI 功能未啟用' : '輸入問題，例如：多項式次數是否過高？'} value={input} onChange={(e) => setInput(e.target.value)} disabled={disabled} aria-label="AI 問題" />
        {busy ? (
          <button type="button" className="btn" onClick={() => abort.current?.abort()}>
            停止
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={disabled || !input.trim()}>
            送出
          </button>
        )}
      </form>
      <p className="text-[11px] muted">助理只做分析與解釋，不提供買賣指令。對話與引用的情境快照會存於你的匿名帳號下，可於「個人資料」頁匯出或刪除。</p>
    </section>
  );
}
