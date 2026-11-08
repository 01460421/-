/**
 * 極簡 HTML 表格解析（只用於官方公開查詢端點的回應，例如公開資訊觀測站）。
 * 只抽取儲存格文字與連結，不保存任何全文內容。
 */

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export interface HtmlCell {
  text: string;
  html: string;
  links: string[];
  isHeader: boolean;
}

export interface HtmlTable {
  rows: HtmlCell[][];
}

export function parseTables(html: string): HtmlTable[] {
  const tables: HtmlTable[] = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  const blocks = html.match(tableRe) ?? [];
  for (const block of blocks) {
    const rows: HtmlCell[][] = [];
    const trRe = /<tr[^>]*>([\s\S]*?)(?=<tr[^>]*>|<\/table>|$)/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trRe.exec(block))) {
      const cells: HtmlCell[] = [];
      const cellRe = /<(t[hd])([^>]*)>([\s\S]*?)(?=<t[hd][^>]*>|<\/tr>|$)/gi;
      let c: RegExpExecArray | null;
      while ((c = cellRe.exec(tr[1]))) {
        const inner = c[3].replace(/<\/t[hd]>\s*$/i, '');
        const links = [...inner.matchAll(/href\s*=\s*['"]([^'"]+)['"]/gi)].map((m) => decodeEntities(m[1]));
        cells.push({ text: stripTags(inner), html: inner, links, isHeader: c[1].toLowerCase() === 'th' });
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push({ rows });
  }
  return tables;
}

/**
 * 依表頭關鍵字找出資料列：回傳 { header → text } 物件陣列與原始 cell。
 * headerMatchers：每個欄位名稱 → 表頭文字需包含的關鍵字（第一個符合者）。
 */
export function extractRows(html: string, headerMatchers: Record<string, RegExp>, required: string[]): { values: Record<string, string>; cells: HtmlCell[] }[] {
  const out: { values: Record<string, string>; cells: HtmlCell[] }[] = [];
  for (const t of parseTables(html)) {
    let colIdx: Record<string, number> | null = null;
    for (const row of t.rows) {
      const texts = row.map((c) => c.text);
      const allHeaderish = row.every((c) => c.isHeader) || required.every((k) => texts.some((x) => headerMatchers[k].test(x) && x.length <= 20));
      if (allHeaderish && required.every((k) => texts.some((x) => headerMatchers[k].test(x)))) {
        colIdx = {};
        for (const [k, re] of Object.entries(headerMatchers)) {
          const i = texts.findIndex((x) => re.test(x));
          if (i >= 0) colIdx[k] = i;
        }
        continue;
      }
      if (!colIdx || row.some((c) => c.isHeader)) continue;
      const values: Record<string, string> = {};
      for (const [k, i] of Object.entries(colIdx)) values[k] = row[i]?.text ?? '';
      if (required.every((k) => values[k])) out.push({ values, cells: row });
    }
  }
  return out;
}
