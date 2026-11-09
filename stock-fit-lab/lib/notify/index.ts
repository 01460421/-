/**
 * 警示通知：Discord Webhook、LINE Messaging API（LINE Notify 已於 2025-03-31 終止）、Email（Resend HTTP API）。
 *  - notify() 送往所有已設定的頻道，永不丟錯，回傳各頻道結果
 *  - 相對 URL 以 NEXT_PUBLIC_SITE_URL 補成絕對網址
 *  - 標題與內文經 sanitizeText 過濾禁用字眼，並附免責聲明
 */
import { DISCLAIMER, sanitizeText } from './sanitize';

export { sanitizeText, containsForbidden, FORBIDDEN_WORDS, DISCLAIMER } from './sanitize';

export interface NotifyMessage {
  title: string;
  body: string;
  url?: string;
  severity: 'info' | 'warn' | 'critical';
}

export interface NotifyResult {
  channel: string;
  ok: boolean;
  error?: string;
}

type Env = Record<string, string | undefined>;

const SEVERITY_COLOR: Record<NotifyMessage['severity'], number> = { info: 0x3b82f6, warn: 0xf59e0b, critical: 0xef4444 };
const SEVERITY_LABEL: Record<NotifyMessage['severity'], string> = { info: '資訊', warn: '警示', critical: '嚴重' };
const SEVERITY_EMOJI: Record<NotifyMessage['severity'], string> = { info: 'ℹ️', warn: '⚠️', critical: '🚨' };

/** 相對路徑 → 絕對網址（NEXT_PUBLIC_SITE_URL）；只允許 http(s) */
export function absoluteUrl(url: string | undefined, env: Env = process.env): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return undefined;
  const base = (env.NEXT_PUBLIC_SITE_URL || env.SITE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '')).replace(/\/$/, '');
  if (!base) return undefined;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function prepareMessage(msg: NotifyMessage, env: Env = process.env): Required<Pick<NotifyMessage, 'title' | 'body' | 'severity'>> & { url?: string } {
  const severity = msg.severity in SEVERITY_COLOR ? msg.severity : 'info';
  return {
    title: sanitizeText(msg.title).slice(0, 240),
    body: sanitizeText(msg.body).slice(0, 3500),
    url: absoluteUrl(msg.url, env),
    severity,
  };
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}, timeoutMs = 10_000): Promise<void> {
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
      if (res.ok) return;
      let text = '';
      try {
        text = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      lastErr = `HTTP ${res.status}${text ? `: ${text}` : ''}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      lastErr = (e as Error)?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : String((e as Error)?.message ?? e);
    } finally {
      clearTimeout(t);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(lastErr || 'unknown error');
}

export async function sendDiscord(msg: NotifyMessage, env: Env = process.env): Promise<NotifyResult> {
  const hook = env.DISCORD_WEBHOOK_URL;
  if (!hook) return { channel: 'discord', ok: false, error: 'DISCORD_WEBHOOK_URL 未設定' };
  const m = prepareMessage(msg, env);
  try {
    await post(hook, {
      username: 'Stock Fit Lab',
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: `${SEVERITY_EMOJI[m.severity]} ${m.title}`.slice(0, 256),
          description: m.body.slice(0, 4000),
          url: m.url,
          color: SEVERITY_COLOR[m.severity],
          footer: { text: `${SEVERITY_LABEL[m.severity]}｜${DISCLAIMER}`.slice(0, 2048) },
          timestamp: new Date().toISOString(),
        },
      ],
    });
    return { channel: 'discord', ok: true };
  } catch (e) {
    return { channel: 'discord', ok: false, error: (e as Error).message };
  }
}

export async function sendLine(msg: NotifyMessage, env: Env = process.env): Promise<NotifyResult> {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = env.LINE_TO;
  if (!token || !to) return { channel: 'line', ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN / LINE_TO 未設定' };
  const m = prepareMessage(msg, env);
  const text = [`${SEVERITY_EMOJI[m.severity]}【${SEVERITY_LABEL[m.severity]}】${m.title}`, m.body, m.url ?? '', DISCLAIMER].filter(Boolean).join('\n\n').slice(0, 5000);
  try {
    await post('https://api.line.me/v2/bot/message/push', { to, messages: [{ type: 'text', text }] }, { Authorization: `Bearer ${token}` });
    return { channel: 'line', ok: true };
  } catch (e) {
    return { channel: 'line', ok: false, error: (e as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function sendEmail(msg: NotifyMessage, env: Env = process.env): Promise<NotifyResult> {
  const key = env.RESEND_API_KEY;
  const to = env.ALERT_EMAIL_TO;
  if (!key || !to) return { channel: 'email', ok: false, error: 'RESEND_API_KEY / ALERT_EMAIL_TO 未設定' };
  const from = env.ALERT_EMAIL_FROM || 'Stock Fit Lab <onboarding@resend.dev>';
  const m = prepareMessage(msg, env);
  const color = `#${SEVERITY_COLOR[m.severity].toString(16).padStart(6, '0')}`;
  const html = `<div style="font-family:sans-serif;line-height:1.6">
<h2 style="color:${color};margin:0 0 8px">${escapeHtml(m.title)}</h2>
<p style="white-space:pre-wrap">${escapeHtml(m.body)}</p>
${m.url ? `<p><a href="${escapeHtml(m.url)}">開啟分析頁</a></p>` : ''}
<hr><p style="color:#6b7280;font-size:12px">${escapeHtml(DISCLAIMER)}</p></div>`;
  try {
    await post(
      'https://api.resend.com/emails',
      {
        from,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        subject: `[${SEVERITY_LABEL[m.severity]}] ${m.title}`,
        html,
        text: [m.title, m.body, m.url ?? '', DISCLAIMER].filter(Boolean).join('\n\n'),
      },
      { Authorization: `Bearer ${key}` },
    );
    return { channel: 'email', ok: true };
  } catch (e) {
    return { channel: 'email', ok: false, error: (e as Error).message };
  }
}

/** 目前已設定的頻道 */
export function configuredChannels(env: Env = process.env): string[] {
  const out: string[] = [];
  if (env.DISCORD_WEBHOOK_URL) out.push('discord');
  if (env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_TO) out.push('line');
  if (env.RESEND_API_KEY && env.ALERT_EMAIL_TO) out.push('email');
  return out;
}

/** 送往所有已設定頻道；未設定任何頻道時回傳空陣列。永不丟錯。 */
export async function notify(msg: NotifyMessage, env: Env = process.env): Promise<NotifyResult[]> {
  const senders: Record<string, (m: NotifyMessage, e: Env) => Promise<NotifyResult>> = { discord: sendDiscord, line: sendLine, email: sendEmail };
  const channels = configuredChannels(env);
  const settled = await Promise.allSettled(channels.map((c) => senders[c](msg, env)));
  return settled.map((s, i) => (s.status === 'fulfilled' ? s.value : { channel: channels[i], ok: false, error: String((s.reason as Error)?.message ?? s.reason) }));
}
