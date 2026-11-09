import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryLRU } from '@/lib/data-adapters/cache';
import { httpConfig } from '@/lib/data-adapters/http';
import { resetLimiters } from '@/lib/data-adapters/ratelimit';
import { resetMarketData } from '@/lib/data-adapters';
import { setContextCache } from '@/lib/history/cache';
import { setHistoryFetcher, summarizeHistory } from '@/lib/history';
import { capToolOutput, CONTEXT_TOOL_NAMES, makeChatTools, TOOL_OUTPUT_MAX_CHARS } from '@/lib/ai/tools';
import { attachContextLayers, compactHistoryLayer, CONTEXT_MAX_CHARS, type ContextLayers } from '@/lib/ai/context';
import { ANALYST_SYSTEM, ADVISOR_SYSTEM } from '@/lib/ai/prompts';
import { gdeltConfig } from '@/lib/news/gdelt';
import { mopsConfig } from '@/lib/news/mops';
import { barsFrom, gaussian, rng, seriesOf } from './helpers';
import * as nfx from '../news/fixtures';

const fetchMock = vi.fn();
beforeEach(() => {
  resetLimiters();
  resetMarketData();
  setContextCache(new MemoryLRU(300));
  httpConfig.baseDelayMs = 1;
  gdeltConfig.refillPerSec = 1000;
  gdeltConfig.baseDelayMs = 1;
  mopsConfig.refillPerSec = 1000;
  mopsConfig.baseDelayMs = 1;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('nf', { status: 404 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setHistoryFetcher(null);
});

/** 30 年合成日線（含波動 regime） */
function longBars() {
  const r = rng(3);
  const closes = [50];
  for (let i = 1; i < 7800; i++) closes.push(closes[i - 1] * Math.exp(0.0003 + gaussian(r) * (i > 4000 && i < 4500 ? 0.04 : 0.015)));
  return barsFrom(closes, '1995-01-02', { volume: closes.map((_, i) => 1e6 + (i % 13) * 1e4) });
}

function walkSchema(node: unknown, path: string, errors: string[]) {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.type === 'object') {
    if (n.additionalProperties !== false) errors.push(`${path}: additionalProperties 必須為 false`);
    for (const [k, v] of Object.entries((n.properties as Record<string, unknown>) ?? {})) walkSchema(v, `${path}.${k}`, errors);
    for (const r of (n.required as string[]) ?? []) if (!(r in ((n.properties as object) ?? {}))) errors.push(`${path}: required ${r} 不在 properties`);
  }
  if (n.type === 'array') walkSchema(n.items, `${path}[]`, errors);
}

describe('AI 工具定義', () => {
  const tools = makeChatTools({ symbol: 'AAPL' });

  it('保留原有 7 個工具並新增 6 個情境工具', () => {
    const names = tools.map((t) => t.definition.name);
    expect(names.slice(0, 7)).toEqual(['refit_model', 'what_if', 'query_snapshots', 'compare_symbols', 'get_dataset', 'run_walkforward', 'chart_command']);
    expect(names.slice(7)).toEqual([...CONTEXT_TOOL_NAMES]);
  });

  it('每個 schema 都是 strict 相容（所有 object 皆 additionalProperties:false）且描述為中文', () => {
    for (const t of tools) {
      const errors: string[] = [];
      walkSchema(t.definition.input_schema, t.definition.name, errors);
      expect(errors).toEqual([]);
      expect(t.definition.description).toMatch(/[一-鿿]/);
      expect(t.definition.name).toMatch(/^[a-z_]{1,64}$/);
    }
  });

  it('驗證器拒絕未知欄位、錯誤日期與 from > to', () => {
    const by = Object.fromEntries(tools.map((t) => [t.definition.name, t]));
    expect(by.get_long_history.validate!({})).toBeNull();
    expect(by.get_long_history.validate!({ foo: 1 })).not.toBeNull();
    expect(by.get_long_history.validate!({ from: '2024-02-01', to: '2024-01-01' })).toContain('from');
    expect(by.search_news.validate!({ from: '2024-01-01' })).not.toBeNull();
    expect(by.search_news.validate!({ from: '2024-01-01', to: '2024-01-05', min_tier: 'wire' })).toBeNull();
    expect(by.search_news.validate!({ from: '2024-01-01', to: '2024-01-05', min_tier: 'blog' })).not.toBeNull();
    expect(by.explain_move.validate!({ date: '2024/01/01' })).not.toBeNull();
    expect(by.get_fundamentals.validate!({ as_of: '2023-08-10' })).toBeNull();
    expect(by.get_guidance.validate!({ to: '2024-01-01' })).toBeNull();
    expect(by.get_behavioral_indicators.validate!({ as_of: 'yesterday' })).not.toBeNull();
  });
});

describe('輸出大小限制', () => {
  it('capToolOutput 把大陣列砍到上限以內並標記 _truncated', () => {
    const big = { meta: { a: 1 }, items: Array.from({ length: 5000 }, (_, i) => ({ i, title: '標題'.repeat(10) })), other: Array.from({ length: 50 }, (_, i) => i) };
    const out = capToolOutput(big);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_CHARS);
    expect((out as unknown as { _truncated: boolean })._truncated).toBe(true);
    expect(out.meta).toEqual({ a: 1 });
    expect(out.items[0].i).toBe(0);
    const small = { a: [1, 2, 3] };
    expect(capToolOutput(small)).toEqual(small);
  });

  it('get_long_history：30 年資料的摘要 + 區間結果都在上限內並附 sources', async () => {
    const bars = longBars();
    setHistoryFetcher(async (s) => seriesOf(s, bars, 'Yahoo Finance'));
    const tool = makeChatTools({ symbol: 'AAPL' }).find((t) => t.definition.name === 'get_long_history')!;
    const full = (await tool.run({})) as Record<string, unknown>;
    expect(JSON.stringify(full).length).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_CHARS);
    expect((full.yearly as unknown[]).length).toBeGreaterThan(25);
    expect(full.sources).toEqual([{ name: 'Yahoo Finance', asOf: bars[bars.length - 1].date }]);
    const ranged = (await tool.run({ from: '2000-01-01', to: '2010-12-31', granularity: 'week' })) as { range: { points: unknown[]; to: string }; period: { to: string } };
    expect(JSON.stringify(ranged).length).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_CHARS);
    expect(ranged.range.points.length).toBeLessThanOrEqual(80);
    expect(ranged.period.to <= '2010-12-31').toBe(true); // point-in-time
  });

  it('explain_move：當日漲跌、量比；新聞來源失敗時如實回報', async () => {
    const bars = barsFrom([100, 100, 100, 100, 100, 100, 110, 105], '2024-01-01', { volume: [1, 1, 1, 1, 1, 1, 3, 1] });
    setHistoryFetcher(async (s) => seriesOf(s, bars));
    const tool = makeChatTools({ symbol: 'AAPL' }).find((t) => t.definition.name === 'explain_move')!;
    const out = (await tool.run({ date: bars[6].date })) as { move: Record<string, number>; pointInTimeCutoff: string; newsStatus: { ok: boolean }[]; caveat: string; sources: unknown[] };
    expect(out.move.returnPct).toBe(10);
    expect(out.move.volumeRatio20d).toBe(3);
    expect(bars[6].date).toBe('2024-01-09');
    expect(out.pointInTimeCutoff).toBe('2024-01-10'); // date + 1
    expect(out.newsStatus.some((s) => !s.ok)).toBe(true);
    expect(out.caveat).toContain('因果');
    expect(out.sources.length).toBeGreaterThan(0);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_CHARS);
  });

  it('search_news：結果附 sources、大小受限', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('ajax_t05st01')) return nfx.textResponse(nfx.mopsT05st01Html);
      if (url.includes('TaiwanStockNews')) return nfx.jsonResponse(nfx.finmindNewsDay(/start_date=([\d-]+)/.exec(url)![1]));
      if (url.includes('gdeltproject')) return nfx.jsonResponse(nfx.gdeltArticles);
      return new Response('nf', { status: 404 });
    });
    const tool = makeChatTools({ symbol: '2330.TW' }).find((t) => t.definition.name === 'search_news')!;
    const out = (await tool.run({ from: '2024-01-15', to: '2024-01-18' })) as { items: { publishedAt: string }[]; sources: { name: string }[]; sentimentLabel: string };
    expect(out.items.length).toBeGreaterThan(0);
    for (const it of out.items) expect(Date.parse(it.publishedAt)).toBeLessThanOrEqual(Date.parse('2024-01-18T15:59:59.999Z'));
    expect(out.sources.length).toBeGreaterThan(0);
    expect(out.sentimentLabel).toContain('粗略');
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_CHARS);
  });

  it('get_behavioral_indicators：每項含公式與出處，大小受限', async () => {
    setHistoryFetcher(async (s) => seriesOf(s, longBars()));
    const tool = makeChatTools({ symbol: 'AAPL' }).find((t) => t.definition.name === 'get_behavioral_indicators')!;
    const out = (await tool.run({ as_of: '2020-06-30' })) as { indicators: { formula: string; reference: string; asOf: string | null }[]; caveat: string };
    expect(out.indicators.length).toBeGreaterThanOrEqual(7);
    for (const x of out.indicators) {
      expect(x.formula.length).toBeGreaterThan(5);
      expect(x.reference.length).toBeGreaterThan(5);
      if (x.asOf) expect(x.asOf <= '2020-06-30').toBe(true);
    }
    expect(out.caveat).toContain('相關不等於因果');
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_CHARS);
  });
});

describe('情境 JSON 與系統提示', () => {
  it('attachContextLayers：總量 < 20KB', () => {
    const h = summarizeHistory(longBars(), { symbol: 'AAPL', source: 'Yahoo', adjusted: true });
    const layers: ContextLayers = {
      history: compactHistoryLayer(h),
      recentNews: { window: 'x', asOf: 'x', total: 99, items: Array.from({ length: 8 }, (_, i) => ({ t: '2024-01-01T00:00', title: '很長的標題'.repeat(16), src: 's', tier: 'wire' as const, s: 0, url: `https://www.reuters.com/${'x'.repeat(200)}${i}` })), daily: [], sentimentLabel: '', sources: [] },
      behavioral: { asOf: 'x', indicators: Array.from({ length: 9 }, (_, i) => ({ id: `i${i}`, value: 1, unit: 'x', reading: '讀數'.repeat(45), ok: true })), caveat: '相關不等於因果' },
    };
    const baseCtx = { symbol: 'AAPL', models: { pad: 'x'.repeat(14_000) } };
    const out = attachContextLayers(baseCtx, layers);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS);
    expect(out.context_layers?.history).toBeTruthy();
    const small = attachContextLayers({ symbol: 'AAPL' }, layers);
    expect(small.context_layers?.recentNews?.items).toHaveLength(8);
    expect(attachContextLayers({ a: 1 }, null)).toEqual({ a: 1 });
  });

  it('系統提示涵蓋：引用來源與日期、相關≠因果、point-in-time、方針不轉述數字、禁用字', () => {
    for (const k of ['來源 + 日期', '相關與因果', 'point-in-time', '不得轉述或推測任何財測數字', '不給買賣指令', '保證', 'get_fundamentals', 'explain_move']) expect(ANALYST_SYSTEM).toContain(k);
    expect(ADVISOR_SYSTEM).toContain('context_layers');
  });
});
