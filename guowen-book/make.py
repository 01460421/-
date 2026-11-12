#!/usr/bin/env python3
"""一鍵產生全書 PDF（兩階段：排版 → 取得頁碼 → 回填目錄與索引 → 再排版）
用法：python3 make.py        產出 dist/科學班國文歷屆試題詳解集.pdf
"""
import subprocess, re, os, sys, json, glob
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
OUT = 'dist/科學班國文歷屆試題詳解集.pdf'


def run(*a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout, r.stderr)
        sys.exit(1)
    return r.stdout


print(run('python3', 'build.py').strip())
run('node', 'render.js', 'dist/book.html', 'dist/pass1.pdf')
dests = run('pdfinfo', '-dests', 'dist/pass1.pdf')
ref = {}
for m in re.finditer(r'^\s*(\d+)\s+\[.*?\]\s+"([^"]+)"', dests, re.M):
    name = m.group(2)
    ref[name[1:] if name.startswith('q') else name] = int(m.group(1))
n1 = int(re.search(r'Pages:\s+(\d+)', run('pdfinfo', 'dist/pass1.pdf')).group(1))
html = open('dist/book.html', encoding='utf-8').read()
miss = set()


def fill(m):
    k = m.group(1)
    if k not in ref:
        miss.add(k)
        return m.group(0)
    return f'data-ref="{k}">{ref[k]}<'


html = re.sub(r'data-ref="([^"]+)">—<', fill, html)
open('dist/book.html', 'w', encoding='utf-8').write(html)
if miss:
    print('⚠ 未找到頁碼：', sorted(miss))
run('node', 'render.js', 'dist/book.html', OUT)
n2 = int(re.search(r'Pages:\s+(\d+)', run('pdfinfo', OUT)).group(1))
os.remove('dist/pass1.pdf')
print(f'完成：{OUT}（{n2} 頁；第一階段 {n1} 頁{"，頁數一致 ✓" if n1 == n2 else "，⚠ 頁數不同，請再執行一次"}）')
