#!/usr/bin/env node
/* 《量雨的人》：把 ms/*.txt 排成直排的 PDF。
   用法：node dev/book/build.cjs            散葉      → 量雨的人.pdf
        node dev/book/build.cjs --bound    線裝本    → 量雨的人-線裝本.pdf
        node dev/book/build.cjs --kit      書衣與裝訂說明 → 量雨的人-書衣與裝訂.pdf
        node dev/book/build.cjs --all      三份都做
        node dev/book/build.cjs --publish  把三份 PDF 複製到網站的 book/（檔名改成英數，連結才不必轉碼）
   需要 Playwright 的 Chromium，並且連得上 Google Fonts（內文用芫荽）。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIR = __dirname;
const MS = path.join(DIR, 'ms');
const OUT = path.join(DIR, 'out');
const TARGETS = {
  leaves: { pdf: '量雨的人.pdf', pub: 'liangyu-leaves.pdf', w: '297mm', h: '210mm' },
  bound: { pdf: '量雨的人-線裝本.pdf', pub: 'liangyu-bound.pdf', w: '317mm', h: '230mm', css: true },
  kit: { pdf: '量雨的人-書衣與裝訂.pdf', pub: 'liangyu-binding-kit.pdf', w: '297mm', h: '210mm', css: true },
  pages: { pdf: 'out/pages.pdf', w: '148.5mm', h: '210mm', css: true }   /* 只是轉 PNG 的中間檔：node build.cjs --pages */
};

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
  blurb: ["雨是往上落的。", "每落一場，帶走一個年代。", "", "有一只手提箱，", "盛得下一整個年代的零碎，", "卻護不了一個尋常人。", "", "它記得街角賣柑橘的女孩，", "記得押後一班的管家，", "記得一句始終沒有寫下的話。", "", "提著它的人，只量雨，不淋雨。", "只有箱子知道：那隻手，握緊過。"],
  en: 'The One Who Measures the Rain',
  enSub: 'A REVERSE: 1999 FAN NOVEL',
  volsEn: [['VOLUME I', 'Essays'], ['VOLUME II', 'Sayings'], ['VOLUME III', 'Dialogues'], ['VOLUME IV', 'Old Bottles'], ['VOLUME V', 'Poems'], ['VOLUME VI', 'Two Stories and a Play'], ['VOLUME VII', 'Fables'], ['VOLUME VIII', 'Letters']],
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
    ['內文字型', '芫荽 Iansui（SIL OFL 1.1）']
  ],
  notes: [
    '本書是愛好者的二次創作，不是官方出版品，也不作營利之用。《重返未來：1999》的名稱、世界觀與人物，權利屬於深藍互動（Bluepoch）。',
    '全書以司辰的手提箱為敘事者。年份與事件依主線已經寫出的部分；主線留白的地方，本書不代為補寫。幾處添寫，在後記裡一一交代。'
  ],
  guide: [
    ['用料', '書葉{M}張（《量雨的人.pdf》）、書衣兩張（這份檔案的第一、二頁：第一頁有行李牌，是前書衣；第二頁是後書衣。可以換成厚一點的色紙來印）、棉線或絲線約一百公分、針、錐子、長尾夾兩個。'],
    ['一　印', '書葉與書衣都用 A4 橫向、單面列印，縮放選「實際大小」，不要選「符合頁面」，四眼的位置才對得上。'],
    ['二　對摺', '每一張沿正中的版心對摺，字朝外。摺得準的話，版心那個黑色尖角正好落在摺線上。'],
    ['三　理齊', '照版心下方的葉次，由一疊到{M}。前書衣放最上面，行李牌朝上；後書衣放最下面，箱子的圖朝下。摺口都朝同一邊，那一邊就是書口。把書口和上下撞齊，用長尾夾夾住書口。'],
    ['四　打眼', '前書衣右緣有四個十字記號，離書脊十一公釐。用錐子對準記號，垂直打穿整疊。'],
    ['五　穿線', '從第二眼起針，線頭留在書葉之間。每一眼都繞書脊一圈；頭尾兩眼再各繞書頭、書根一圈；正反兩面，眼與眼之間都要走到線。最後回到起針的那一眼打結，把結拉進眼裡，剪去線頭。'],
    ['六　落款', '翻到末頁，填上訂書者、年月和當天的天氣。線過之日，方是書成之日。']
  ],
  binding: [
    '此書成於丙午冬月，凡{N}頁，分八卷。',
    '箱無手，不能自訂，茲以散葉{M}付與讀者：對摺，理齊，打四眼，穿一線。',
    '線過之日，方是書成之日。'
  ]
};

async function build(browser, book, mode, count) {
  const T = TARGETS[mode];
  const PDF = path.join(DIR, T.pdf);
  book.meta = Object.assign({}, META, { mode });
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>量雨的人</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Iansui&family=LXGW+WenKai+TC:wght@400&family=Noto+Serif+TC:wght@400&family=IM+Fell+English:ital@0;1&family=Courier+Prime&display=block">
<link rel="stylesheet" href="../book.css">${T.css ? '<link rel="stylesheet" href="../bound.css">' : ''}
<style>@page { size: ${T.w} ${T.h}; margin: 0; }</style></head><body><div id="stage"></div><div id="book"></div>
<script>window.BOOK=${JSON.stringify(book).replace(/</g, '\\u003c')};</script><script src="../layout.js"></script></body></html>`;
  const file = path.join(OUT, mode + '.html');
  fs.writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto('file://' + file, { waitUntil: 'load' });
  await page.waitForFunction(() => window.DONE, null, { timeout: 180000 });
  const done = await page.evaluate(() => window.DONE);
  if (done.error) { console.error(done.error); await page.close(); process.exitCode = 1; return; }
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => 0))));
  const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').length);
  await page.pdf({ path: PDF, width: T.w, height: T.h, printBackground: true, preferCSSPageSize: true });
  await page.close();
  console.log(`${T.pdf}｜漢字 ${count}｜${done.pages} 頁、${done.sheets} 張｜目錄用了 ${done.tiersUsed} 層｜字型檔 ${fonts}｜${(fs.statSync(PDF).size / 1048576).toFixed(2)} MB`);
  if (mode === 'leaves') {
    console.log(done.toc.filter(e => e.t).map(e => e.t + ' ' + e.p).join('、'));
    const thin = done.cols.map((c, i) => [i + 1, c]).filter(x => x[1] >= 0 && x[1] <= 3);
    if (thin.length) console.log('只有三欄以內的頁：' + thin.map(x => `第 ${x[0]} 頁（${x[1]} 欄）`).join('、'));
    if (process.argv.includes('--cols')) console.log(done.cols.map((c, i) => (i + 1) + ':' + c).join(' '));
  }
  if (done.warn.length) { console.log('注意：\n  ' + done.warn.join('\n  ')); process.exitCode = 2; }
}

(async () => {
  const book = parse();
  const count = JSON.stringify(book).replace(/[^\u4e00-\u9fff]/g, '').length;
  fs.mkdirSync(OUT, { recursive: true });
  const a = process.argv;
  if (a.includes('--publish')) {
    const dst = path.join(DIR, '..', '..', 'book');
    fs.mkdirSync(dst, { recursive: true });
    const all = Object.values(TARGETS).filter(t => t.pub).concat([{ pdf: '量雨的人.docx', pub: 'liangyu.docx' }, { pdf: '量雨的人.txt', pub: 'liangyu.txt' }]);   /* 後兩個由 export.py 產生 */
    for (const t of all) { fs.copyFileSync(path.join(DIR, t.pdf), path.join(dst, t.pub)); console.log(`${t.pdf} → book/${t.pub}｜${(fs.statSync(path.join(dst, t.pub)).size / 1048576).toFixed(2)} MB`); }
    return;
  }
  const modes = a.includes('--all') ? ['leaves', 'bound', 'kit'] : a.includes('--bound') ? ['bound'] : a.includes('--kit') ? ['kit'] : a.includes('--pages') ? ['pages'] : ['leaves'];
  const browser = await chromium.launch();
  for (const m of modes) await build(browser, book, m, count);
  await browser.close();
})();
