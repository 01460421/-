#!/usr/bin/env node
/* 《量雨的人》：把 ms/*.txt 排成直排的散葉 PDF。
   用法：node dev/book/build.cjs [--png]      輸出 dev/book/量雨的人.pdf
   需要 Playwright 的 Chromium，並且連得上 Google Fonts（內文用思源宋體）。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIR = __dirname;
const MS = path.join(DIR, 'ms');
const OUT = path.join(DIR, 'out');
const PDF = path.join(DIR, '量雨的人.pdf');

const FW = s => s.replace(/[0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));   // 直排：數字用全形，站著排

function blocksOf(kind, lines) {
  const out = [];
  const push = b => out.push(b);
  let first = true;
  for (let raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line === '') { if (kind === 'poem' && out.length) push({ t: 'gap' }); continue; }
    if (line.startsWith('>')) {
      const x = FW(line.slice(1));
      push({ t: 'gap' }); push(/[。」]$/.test(x) ? { t: 'note', x } : { t: 'sig', x });
      continue;
    }
    if (line === '***') { push({ t: 'br' }); continue; }
    if (line.startsWith('##')) { if (kind !== 'poem' && out.length) push({ t: 'gap' }); push({ t: 'sub', x: FW(line.slice(2)) }); continue; }
    if (line.startsWith('#')) { push({ t: 'num', x: line.slice(1) }); continue; }
    const x = FW(line);
    if (kind === 'poem') { push({ t: 'pl', x }); continue; }
    if (kind === 'koan') {
      const m = x.match(/^〔(.+?)〕(.*)$/);
      push(m ? { t: 'kn', tag: m[1], x: m[2] } : { t: 'p0', x });
      continue;
    }
    if (kind === 'dialog' || kind === 'play') {
      const i = x.indexOf('｜');
      if (i > 0) { push({ t: 'dl', who: x.slice(0, i), x: x.slice(i + 1) }); continue; }
      if (x.startsWith('（')) { push({ t: 'stage', x }); continue; }
    }
    push({ t: 'p', x });
    first = false;
  }
  while (out.length && out[out.length - 1].t === 'gap') out.pop();
  return out;
}

function parse() {
  const files = fs.readdirSync(MS).filter(f => /\.txt$/.test(f)).sort();
  const book = { front: null, vols: [], back: null };
  let cur = null;              // { kind, lines, into }
  const flush = () => {
    if (!cur) return;
    const b = blocksOf(cur.kind, cur.lines);
    if (cur.piece) {
      cur.piece.blocks = b;
      const who = b.filter(x => x.t === 'dl').map(x => x.who.length);
      if (who.length) cur.piece.lab = (Math.max.apply(null, who) + 1) + 'em';
    } else cur.target.blocks = b;
    cur = null;
  };
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(MS, f), 'utf8').split('\n')) {
      if (line.startsWith('=FRONT ')) { flush(); const [title, sub] = line.slice(7).split('|'); book.front = { title, sub }; cur = { kind: 'prose', lines: [], target: book.front }; continue; }
      if (line.startsWith('=BACK ')) { flush(); book.back = { title: line.slice(6).trim() }; cur = { kind: 'prose', lines: [], target: book.back }; continue; }
      if (line.startsWith('=VOL ')) { flush(); const [no, title, genre, epi] = line.slice(5).split('|'); book.vols.push({ no, title, genre, epi: (epi || '').split('/'), pieces: [] }); continue; }
      if (line.startsWith('=PIECE ')) {
        flush(); const [title, sub, kind] = line.slice(7).split('|');
        const piece = { title, sub: sub || '', kind: (kind || 'prose').trim() };
        book.vols[book.vols.length - 1].pieces.push(piece);
        cur = { kind: piece.kind === 'letters' ? 'prose' : piece.kind, lines: [], piece }; continue;
      }
      if (cur) cur.lines.push(line);
    }
  }
  flush();
  return book;
}

const META = {
  title: '量雨的人',
  short: '量雨的人',
  author: 'Omega',
  series: '重返未來：１９９９　二創小說',
  date: '丙午冬月　讀者手訂',
  epigraph: ['雨把年份帶走，', '人把東西留下。', '我是盛著那些東西走來的。'],
  colophon: [
    ['著者', 'Omega'],
    ['所本', '《重返未來：1999》主線，序幕至第十三章'],
    ['體例', '依《巔峰集》，分八卷'],
    ['成書', '二〇二六年十一月'],
    ['篇幅', '{N}頁，八卷'],
    ['標題字型', '逆雨 NiYu（SIL OFL 1.1）'],
    ['內文字型', '思源宋體 Noto Serif TC']
  ],
  notes: [
    '本書是愛好者的二次創作，不是官方出版品，也不作營利之用。《重返未來：1999》的名稱、世界觀與人物，權利屬於深藍互動（Bluepoch）。',
    '全書以司辰的手提箱為敘事者。年份與事件依主線已經寫出的部分；主線留白的地方，本書不代為補寫。幾處添寫，在後記裡一一交代。'
  ],
  binding: [
    '此書成於丙午冬月，凡{N}頁，分八卷。',
    '箱無手，不能自訂，茲以散葉{M}付與讀者：對摺，理齊，打四眼，穿一線。',
    '線過之日，方是書成之日。'
  ]
};

(async () => {
  const book = parse();
  book.meta = META;
  const count = JSON.stringify(book).replace(/[^\u4e00-\u9fff]/g, '').length;
  fs.mkdirSync(OUT, { recursive: true });
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>量雨的人</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&display=block">
<link rel="stylesheet" href="../book.css"></head><body><div id="stage"></div><div id="book"></div>
<script>window.BOOK=${JSON.stringify(book).replace(/</g, '\\u003c')};</script><script src="../layout.js"></script></body></html>`;
  const file = path.join(OUT, 'book.html');
  fs.writeFileSync(file, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto('file://' + file, { waitUntil: 'load' });
  await page.waitForFunction(() => window.DONE, null, { timeout: 180000 });
  const done = await page.evaluate(() => window.DONE);
  if (done.error) { console.error(done.error); await browser.close(); process.exit(1); }
  const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').length);
  await page.pdf({ path: PDF, width: '297mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(`漢字 ${count}｜${done.pages} 頁、${done.sheets} 張｜目錄用了 ${done.tiersUsed} 層｜字型檔 ${fonts}｜${(fs.statSync(PDF).size / 1048576).toFixed(2)} MB`);
  console.log(done.toc.filter(e => e.t).map(e => e.t + ' ' + e.p).join('、'));
  const thin = done.cols.map((c, i) => [i + 1, c]).filter(x => x[1] >= 0 && x[1] <= 3);
  if (thin.length) console.log('只有三欄以內的頁：' + thin.map(x => `第 ${x[0]} 頁（${x[1]} 欄）`).join('、'));
  if (process.argv.includes('--cols')) console.log(done.cols.map((c, i) => (i + 1) + ':' + c).join(' '));
  if (done.warn.length) { console.log('注意：\n  ' + done.warn.join('\n  ')); process.exitCode = 2; }
})();
