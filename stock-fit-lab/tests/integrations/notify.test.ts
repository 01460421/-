import { describe, it, expect, afterEach, vi } from 'vitest';
import { notify, sanitizeText, containsForbidden, absoluteUrl, configuredChannels } from '@/lib/notify';

const ENV_KEYS = ['DISCORD_WEBHOOK_URL', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_TO', 'RESEND_API_KEY', 'ALERT_EMAIL_TO', 'ALERT_EMAIL_FROM', 'NEXT_PUBLIC_SITE_URL'];

function setEnv(vals: Record<string, string>) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vals);
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) delete process.env[k];
});

const msg = { title: '2330.TW 殘差異常，保證必漲？', body: '標準化殘差 z = 4.2；穩賺不賠的說法不成立，模型不保證任何結果。', url: '/stock/2330.TW?models=poly3', severity: 'critical' as const };

describe('禁用字眼過濾', () => {
  it('移除 保證 / 必漲 / 穩賺', () => {
    const out = sanitizeText(msg.title + msg.body);
    expect(containsForbidden(out)).toBe(false);
    expect(out).toContain('不擔保');
    expect(containsForbidden('穩賺')).toBe(true);
  });
});

describe('notify', () => {
  it('未設定任何頻道 → 空陣列，不呼叫 fetch', async () => {
    setEnv({});
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await notify(msg)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('送往三個頻道、附絕對網址、內容已過濾', async () => {
    setEnv({
      DISCORD_WEBHOOK_URL: 'https://discord.example/api/webhooks/1/abc',
      LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
      LINE_TO: 'U123',
      RESEND_API_KEY: 're_key',
      ALERT_EMAIL_TO: 'a@example.com, b@example.com',
      ALERT_EMAIL_FROM: 'Lab <lab@example.com>',
      NEXT_PUBLIC_SITE_URL: 'https://lab.example/',
    });
    const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
        return new Response('{}', { status: 200 });
      }),
    );
    const res = await notify(msg);
    expect(res).toEqual([
      { channel: 'discord', ok: true },
      { channel: 'line', ok: true },
      { channel: 'email', ok: true },
    ]);
    const all = JSON.stringify(calls.map((c) => c.body));
    expect(containsForbidden(all)).toBe(false);
    const discord = calls.find((c) => c.url.startsWith('https://discord.example'))!;
    expect(discord.body.embeds[0].url).toBe('https://lab.example/stock/2330.TW?models=poly3');
    expect(discord.body.embeds[0].color).toBe(0xef4444);
    const line = calls.find((c) => c.url === 'https://api.line.me/v2/bot/message/push')!;
    expect(line.headers.Authorization).toBe('Bearer line-token');
    expect(line.body.to).toBe('U123');
    expect(line.body.messages[0].text).toContain('https://lab.example/stock/2330.TW');
    const email = calls.find((c) => c.url === 'https://api.resend.com/emails')!;
    expect(email.body.to).toEqual(['a@example.com', 'b@example.com']);
    expect(email.body.from).toBe('Lab <lab@example.com>');
    expect(email.body.html).toContain('href="https://lab.example/stock/2330.TW?models=poly3"');
  });

  it('單一頻道失敗不影響其他、永不丟錯', async () => {
    setEnv({ DISCORD_WEBHOOK_URL: 'https://discord.example/hook', LINE_CHANNEL_ACCESS_TOKEN: 't', LINE_TO: 'U1' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('discord')) throw new Error('network down');
        return new Response('{"message":"bad"}', { status: 400 });
      }),
    );
    const res = await notify({ title: 't', body: 'b', severity: 'info' });
    expect(res[0]).toMatchObject({ channel: 'discord', ok: false });
    expect(res[0].error).toContain('network down');
    expect(res[1]).toMatchObject({ channel: 'line', ok: false });
    expect(res[1].error).toContain('400');
  });

  it('absoluteUrl 與已設定頻道', () => {
    expect(absoluteUrl('/a', { NEXT_PUBLIC_SITE_URL: 'https://x.example' })).toBe('https://x.example/a');
    expect(absoluteUrl('https://y.example/b', {})).toBe('https://y.example/b');
    expect(absoluteUrl('javascript:alert(1)', { NEXT_PUBLIC_SITE_URL: 'https://x.example' })).toBeUndefined();
    expect(configuredChannels({ LINE_CHANNEL_ACCESS_TOKEN: 'x' })).toEqual([]);
  });
});
