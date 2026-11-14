#!/usr/bin/env python3
"""《量雨的人》一頁一張 PNG，打成一個 zip。

用法：python3 dev/book/pages.py
需要：node（先跑 build.cjs --pages）、poppler 的 pdftoppm、ImageMagick 的 convert。
輸出：dev/book/out/量雨的人-單頁PNG.zip（封面、內文九十八頁、封底，共一百張，1170×1653）

內文頁是米色底上的黑字，轉成 128 色的 PNG 幾乎看不出差別，檔案只剩三分之一；
封面與封底有布紋，維持全彩。
"""
import glob
import os
import shutil
import subprocess
import tempfile
import zipfile

DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(DIR, 'out', '量雨的人-單頁PNG.zip')       # 不放上網站，out/ 也不進 repo
NAME = '量雨的人-單頁PNG'


def main():
    subprocess.run(['node', os.path.join(DIR, 'build.cjs'), '--pages'], check=True)
    tmp = tempfile.mkdtemp(prefix='liangyu-pages-')
    try:
        subprocess.run(['pdftoppm', '-r', '200', '-png', os.path.join(DIR, 'out', 'pages.pdf'), os.path.join(tmp, 'p')], check=True)
        src = sorted(glob.glob(os.path.join(tmp, 'p-*.png')))
        n = len(src)
        with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_STORED) as z:
            for i, f in enumerate(src):
                if i == 0:
                    name = '量雨的人_000_封面.png'
                elif i == n - 1:
                    name = '量雨的人_%03d_封底.png' % i
                else:
                    name = '量雨的人_%03d.png' % i
                    small = f + '.8.png'
                    subprocess.run(['convert', f, '-dither', 'None', '-colors', '128', '-define', 'png:compression-level=9', 'PNG8:' + small], check=True)
                    f = small
                z.write(f, NAME + '/' + name)
        print('%d 張 → %s｜%.1f MB' % (n, os.path.relpath(OUT, DIR), os.path.getsize(OUT) / 1048576))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
