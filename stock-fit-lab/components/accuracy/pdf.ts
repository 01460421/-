/**
 * 月度報告 PDF（瀏覽器端 jsPDF）。
 * jsPDF 內建字型沒有中日韓字形：先用系統中文字型把報告逐頁繪到離屏 <canvas>（A4 @150dpi），
 * 再把每頁 canvas 以 PNG 影像嵌入 PDF，確保中文正確顯示。
 */
import type { ReportJ } from './types';
import { fmtTime } from './format';

const W = 1240; // A4 寬 @150dpi
const H = 1754; // A4 高
const M = 80; // 邊界
const FONT = '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", "Source Han Sans TC", "WenQuanYi Zen Hei", "WenQuanYi Micro Hei", sans-serif';

const pct = (v: number | null | undefined, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
const num = (v: number | null | undefined, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—');

class PageWriter {
  pages: HTMLCanvasElement[] = [];
  ctx!: CanvasRenderingContext2D;
  y = M;
  constructor(private footer: string) {
    this.newPage();
  }
  newPage() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'top';
    this.pages.push(c);
    this.ctx = ctx;
    this.y = M;
  }
  ensure(h: number) {
    if (this.y + h > H - M - 30) this.newPage();
  }
  text(s: string, size = 22, opts: { bold?: boolean; color?: string; x?: number; maxWidth?: number } = {}) {
    const maxW = opts.maxWidth ?? W - 2 * M;
    this.ctx.font = `${opts.bold ? '700' : '400'} ${size}px ${FONT}`;
    // 中文逐字換行
    const lines: string[] = [];
    let cur = '';
    for (const ch of s) {
      if (this.ctx.measureText(cur + ch).width > maxW) {
        lines.push(cur);
        cur = ch;
      } else cur += ch;
    }
    if (cur) lines.push(cur);
    for (const ln of lines) {
      this.ensure(size * 1.5);
      this.ctx.fillStyle = opts.color ?? '#111827';
      this.ctx.font = `${opts.bold ? '700' : '400'} ${size}px ${FONT}`;
      this.ctx.fillText(ln, opts.x ?? M, this.y);
      this.y += size * 1.5;
    }
  }
  gap(h = 16) {
    this.y += h;
  }
  table(headers: string[], rows: string[][], widths: number[], colors?: (string | undefined)[][]) {
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = (W - 2 * M) / total;
    const ws = widths.map((w) => w * scale);
    const rowH = 34;
    const drawHeader = () => {
      this.ensure(rowH * 2);
      this.ctx.fillStyle = '#f1f5f9';
      this.ctx.fillRect(M, this.y, W - 2 * M, rowH);
      this.ctx.font = `700 18px ${FONT}`;
      this.ctx.fillStyle = '#334155';
      let x = M;
      headers.forEach((h, i) => {
        this.ctx.fillText(h, x + 6, this.y + 8, ws[i] - 10);
        x += ws[i];
      });
      this.y += rowH;
    };
    drawHeader();
    rows.forEach((r, ri) => {
      if (this.y + rowH > H - M - 30) {
        this.newPage();
        drawHeader();
      }
      this.ctx.strokeStyle = '#e2e8f0';
      this.ctx.beginPath();
      this.ctx.moveTo(M, this.y + rowH);
      this.ctx.lineTo(W - M, this.y + rowH);
      this.ctx.stroke();
      this.ctx.font = `400 18px ${FONT}`;
      let x = M;
      r.forEach((cell, i) => {
        this.ctx.fillStyle = colors?.[ri]?.[i] ?? '#111827';
        this.ctx.fillText(cell, x + 6, this.y + 8, ws[i] - 10);
        x += ws[i];
      });
      this.y += rowH;
    });
  }
  finish() {
    this.pages.forEach((c, i) => {
      const ctx = c.getContext('2d')!;
      ctx.font = `400 15px ${FONT}`;
      ctx.fillStyle = '#6b7280';
      ctx.textBaseline = 'top';
      ctx.fillText(this.footer, M, H - M + 10, W - 2 * M - 120);
      ctx.fillText(`第 ${i + 1} / ${this.pages.length} 頁`, W - M - 110, H - M + 10);
    });
  }
}

export function renderReportPages(report: ReportJ, names: Record<string, string>): HTMLCanvasElement[] {
  const nm = (id: string) => names[id] ?? id;
  const w = new PageWriter('本報告為數學擬合的歷史統計，不構成投資建議；過去表現不代表未來結果。資料來源：預測快照與排程回填值。');
  w.text(`月度準度報告　${report.month}${report.symbol ? `　·　${report.symbol}` : '　·　全部代號'}`, 38, { bold: true });
  w.text(`統計區間：${report.from} ～ ${report.to.slice(0, 10)}（依快照寫入時間）　產生時間：${fmtTime(report.generatedAt)}`, 18, { color: '#475569' });
  w.text('所有數值讀取當時寫入的預測快照與事後回填的實際值，未以現在的模型重算（無前視偏誤）。同一代號×模型×訓練迄日只取最後一筆快照。', 18, { color: '#475569' });
  if (report.hiddenCount) w.text(`有 ${report.hiddenCount} 列因「疑似資料洩漏」在稽核通過前不列入排名與比較。`, 18, { color: '#b45309' });
  w.gap(10);

  // 一、模型排名
  w.text('一、模型排名（依方向準確率，前 5 名）', 26, { bold: true });
  w.gap(4);
  const rankRows: string[][] = [];
  for (const g of [...report.ranking].sort((a, b) => a.symbol.localeCompare(b.symbol) || (a.horizon ?? 0) - (b.horizon ?? 0))) {
    g.models.slice(0, 5).forEach((m, i) => rankRows.push([g.symbol, `${g.horizon} 日`, String(i + 1), nm(m.modelId), pct(m.directionAccuracy), m.mape === null ? '—' : `${num(m.mape)}%`, num(m.theilU, 3)]));
  }
  if (rankRows.length) w.table(['代號', '期數', '排名', '模型', '方向準確率', 'MAPE', "Theil's U"], rankRows, [14, 8, 6, 20, 13, 12, 12]);
  else w.text('本月沒有已回填的快照。', 20, { color: '#6b7280' });
  w.gap(24);

  // 二、與 naive 基準比較
  w.text('二、與 naive 基準比較（RMSE；相對改善 ≥ 5% 判為優於 / 劣於）', 26, { bold: true });
  w.gap(4);
  const cmpRows: string[][] = [];
  const cmpColors: (string | undefined)[][] = [];
  for (const r of report.rows.filter((x) => !x.hidden)) {
    const rm = r.vsNaive?.metrics.rmse;
    const v = rm?.verdict;
    cmpRows.push([r.symbol, nm(r.modelId), `${r.horizon} 日`, String(r.n), num(r.rmse), num(r.naive.rmse), rm && rm.relImprovementPct !== null ? `${rm.relImprovementPct > 0 ? '+' : ''}${num(rm.relImprovementPct, 1)}%` : '—', v === 'better' ? '優於' : v === 'worse' ? '劣於' : v === 'insignificant' ? '無顯著差異' : '—']);
    const c = v === 'better' ? '#1d4ed8' : v === 'worse' ? '#b45309' : undefined;
    cmpColors.push([undefined, undefined, undefined, undefined, undefined, undefined, c, c]);
  }
  if (cmpRows.length) w.table(['代號', '模型', '期數', '樣本', '模型 RMSE', 'Naive RMSE', '相對改善', '判定'], cmpRows, [13, 18, 8, 7, 13, 13, 12, 12], cmpColors);
  else w.text('本月沒有可比較的資料。', 20, { color: '#6b7280' });
  w.gap(24);

  // 三、覆蓋率
  w.text('三、信賴區間覆蓋率實測值（所有期數彙總；目標為名目水準 ±2 個百分點）', 26, { bold: true });
  w.gap(4);
  const covRows: string[][] = [];
  const covColors: (string | undefined)[][] = [];
  for (const [m, c] of Object.entries(report.coverage).sort((a, b) => a[0].localeCompare(b[0]))) {
    const ok = typeof c.coverage === 'number' && typeof c.nominal === 'number' && Math.abs(c.coverage - c.nominal) <= 0.02;
    covRows.push([nm(m), pct(c.nominal, 0), pct(c.coverage), String(c.n), ok ? '校準良好' : '偏離名目']);
    covColors.push([undefined, undefined, ok ? '#1d4ed8' : '#b45309', undefined, ok ? '#1d4ed8' : '#b45309']);
  }
  if (covRows.length) w.table(['模型', '名目水準', '實測覆蓋率', '樣本數', '判定'], covRows, [24, 14, 16, 12, 16], covColors);
  else w.text('本月沒有回填資料。', 20, { color: '#6b7280' });
  w.finish();
  return w.pages;
}

export async function exportReportPdf(report: ReportJ, names: Record<string, string>) {
  const { jsPDF } = await import('jspdf');
  const pages = renderReportPages(report, names);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  pages.forEach((c, i) => {
    if (i > 0) doc.addPage();
    doc.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
  });
  doc.setProperties({ title: `月度準度報告 ${report.month}`, subject: 'Stock Fit Lab accuracy report' });
  doc.save(`accuracy-report-${report.month}${report.symbol ? `-${report.symbol}` : ''}.pdf`);
}
