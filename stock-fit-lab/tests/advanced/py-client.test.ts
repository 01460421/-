import { describe, it, expect } from 'vitest';
import { fitRemote, pingRemote } from '@/lib/models/advanced/py-client';

const ok = (body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('py-client', () => {
  it('未設定 PY_SERVICE_URL 時回傳 null（呼叫端退回 TS 實作）', async () => {
    const prev = process.env.PY_SERVICE_URL;
    delete process.env.PY_SERVICE_URL;
    expect(await fitRemote('arima', [1, 2, 3], 2)).toBeNull();
    expect(await pingRemote()).toBe(false);
    if (prev !== undefined) process.env.PY_SERVICE_URL = prev;
  });

  it('成功時解析回應；長度不符、HTTP 501、例外皆回傳 null', async () => {
    const body = { mean: [1, 2], lower: [0.5, 1], upper: [1.5, 3], level: 0.9, params: { a: 1 }, diagnostics: {} };
    const r = await fitRemote('garch', [1, 2, 3], 2, 0.9, {}, { baseUrl: 'http://x', fetchImpl: ok(body) });
    expect(r?.mean).toEqual([1, 2]);
    expect(await fitRemote('garch', [1, 2, 3], 3, 0.9, {}, { baseUrl: 'http://x', fetchImpl: ok(body) })).toBeNull();
    const notImpl = (async () => new Response('{}', { status: 501 })) as unknown as typeof fetch;
    expect(await fitRemote('lstm', [1, 2, 3], 2, 0.9, {}, { baseUrl: 'http://x', fetchImpl: notImpl })).toBeNull();
    const boom = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await fitRemote('arima', [1, 2, 3], 2, 0.9, {}, { baseUrl: 'http://x', fetchImpl: boom })).toBeNull();
  });

  it('逾時回傳 null', async () => {
    const slow = ((_: string, init: RequestInit) =>
      new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    expect(await fitRemote('arima', [1, 2, 3], 2, 0.9, {}, { baseUrl: 'http://x', fetchImpl: slow, timeoutMs: 50 })).toBeNull();
  });
});
