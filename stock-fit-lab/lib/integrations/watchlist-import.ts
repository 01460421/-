/**
 * 自選股匯入：
 *  - Yahoo Finance 投資組合 CSV 匯出（需有 Symbol 欄位；同代號多筆持倉自動去重）
 *  - TradingView 自選清單匯出（.txt：逗號或換行分隔的 EXCHANGE:TICKER，### 開頭為分組標題）
 *  - 其他：純代號清單（逗號 / 換行 / 空白分隔）
 * 自動辨識格式、正規化代號、分出台股與美股，並回報無法辨識的項目。
 */
import type { WatchlistItem } from '../types';
import type { SymbolInfo } from '../data-adapters/types';
import { normalizeSymbol } from '../data-adapters/symbols';

export type WatchlistFormat = 'yahoo_csv' | 'tradingview' | 'plain';

export interface ImportedSymbol extends SymbolInfo {
  input: string;
  section?: string;
}

export interface WatchlistImportResult {
  format: WatchlistFormat;
  items: ImportedSymbol[];
  tw: ImportedSymbol[];
  us: ImportedSymbol[];
  unrecognized: string[];
  duplicates: number;
  sections: string[];
}

/** RFC 4180 風格 CSV 解析（支援引號、跳脫雙引號、CRLF） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

export function detectFormat(text: string): WatchlistFormat {
  const s = text.replace(/^﻿/, '').trim();
  const firstLine = s.split(/\r?\n/)[0] ?? '';
  const header = parseCsv(firstLine)[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  if (header.includes('symbol') || header.includes('ticker') || header.includes('代號')) return 'yahoo_csv';
  if (/(^|[,\s])###/.test(s) || /\b[A-Z_]{2,}:[A-Z0-9.\-]+/i.test(s)) return 'tradingview';
  return 'plain';
}

export function parseWatchlist(text: string, format: WatchlistFormat | 'auto' = 'auto'): WatchlistImportResult {
  const fmt = format === 'auto' ? detectFormat(text ?? '') : format;
  const raw: { input: string; section?: string }[] = [];
  const sections: string[] = [];
  if (fmt === 'yahoo_csv') {
    const rows = parseCsv(text);
    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    let col = header.findIndex((h) => h === 'symbol' || h === 'ticker' || h === '代號');
    if (col < 0) col = 0;
    for (const r of rows.slice(1)) {
      const v = (r[col] ?? '').trim();
      if (v) raw.push({ input: v });
    }
  } else {
    let section: string | undefined;
    const tokens = text
      .replace(/^﻿/, '')
      .split(fmt === 'plain' ? /[,\r\n\t; ]+/ : /[,\r\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    for (const t of tokens) {
      if (t.startsWith('###')) {
        section = t.replace(/^#+/, '').trim() || undefined;
        if (section) sections.push(section);
        continue;
      }
      raw.push({ input: t, section });
    }
  }
  const items: ImportedSymbol[] = [];
  const unrecognized: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const r of raw) {
    const info = normalizeSymbol(r.input);
    if (!info) {
      unrecognized.push(r.input);
      continue;
    }
    if (seen.has(info.symbol)) {
      duplicates++;
      continue;
    }
    seen.add(info.symbol);
    items.push({ ...info, input: r.input, ...(r.section ? { section: r.section } : {}) });
  }
  return {
    format: fmt,
    items,
    tw: items.filter((x) => x.market === 'TW' || x.market === 'TWO'),
    us: items.filter((x) => x.market === 'US'),
    unrecognized,
    duplicates,
    sections,
  };
}

/** 轉成儲存層的 WatchlistItem */
export function toWatchlistItems(result: WatchlistImportResult, userId: string, now = new Date()): WatchlistItem[] {
  const source: WatchlistItem['source'] = result.format === 'yahoo_csv' ? 'yahoo_csv' : result.format === 'tradingview' ? 'tradingview_csv' : 'manual';
  return result.items.map((x) => ({ userId, symbol: x.symbol, market: x.market, name: x.name, addedAt: now.toISOString(), source }));
}
