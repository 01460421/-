#!/usr/bin/env python3
"""從試卷 PDF 裁切圖表。用法：
  python3 tools/crop.py 年度 頁碼 x0 y0 x1 y1 輸出檔名
座標為頁面比例（0~1，左上為原點）。輸出到 figs/。例：
  python3 tools/crop.py 112 2 0.05 0.30 0.48 0.62 112_q07.png
"""
import sys, subprocess, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
y, pg, x0, y0, x1, y1, out = sys.argv[1:8]
pdf = os.path.join(ROOT, 'source', 'pdf', f'{y}_q.pdf')
info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
import re
m = re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info)
W, H = float(m.group(1)), float(m.group(2))
r = re.search(r'Page rot:\s+(\d+)', info)
if r and r.group(1) in ('90', '270'):
    W, H = H, W
R = 300
s = R / 72
x0, y0, x1, y1 = map(float, (x0, y0, x1, y1))
args = ['pdftoppm', '-r', str(R), '-f', pg, '-l', pg, '-x', str(int(x0 * W * s)), '-y', str(int(y0 * H * s)),
        '-W', str(int((x1 - x0) * W * s)), '-H', str(int((y1 - y0) * H * s)), '-png', '-singlefile', pdf,
        os.path.join(ROOT, 'figs', out[:-4])]
subprocess.run(args, check=True)
print('→ figs/' + out)
