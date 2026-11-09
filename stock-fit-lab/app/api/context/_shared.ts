/** /api/context/* 共用：參數驗證、代號解析、錯誤回應（不依賴其他模組的私有檔案） */
import { z } from 'zod';
import { normalizeSymbol } from '@/lib/data-adapters';

export const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式須為 YYYY-MM-DD');

export function parseQuery<T extends z.ZodTypeAny>(req: Request, schema: T): { ok: true; data: z.infer<T> } | { ok: false; res: Response } {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = schema.safeParse(sp);
  if (!parsed.success) return { ok: false, res: Response.json({ error: `參數錯誤：${parsed.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')} ${i.message}`).join('；')}` }, { status: 400 }) };
  return { ok: true, data: parsed.data };
}

export function resolve(symbol: string): string | null {
  return normalizeSymbol(symbol)?.symbol ?? null;
}

export function badSymbol(symbol: string): Response {
  return Response.json({ error: `無法辨識代號：${symbol}` }, { status: 400 });
}

export function fail(e: unknown, label: string): Response {
  const msg = e instanceof Error ? e.message : String(e);
  return Response.json({ error: `${label}：${msg.slice(0, 300)}` }, { status: 502 });
}

export const NO_STORE = { 'Cache-Control': 'no-store' };
