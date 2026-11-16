#!/usr/bin/env python3
"""把兩段 GeoGebra 錄影整理成《交織》要用的素材，放進 public/。

- f6/、f37/：每一步的截圖只留下畫的那一塊（JPEG），檔名是第幾步（0000.jpg…）。
- tex/eqg-c6.png、tex/eqg-c37.png：把右欄的方程式在幾個時間點截下來，接成一條長條，染成金色、底透明，當背景的紋理。
- tex/grain-a.png：顆粒，亮的白、暗的黑，透明度很低。
- audio/music.wav、fonts/：照原樣複製。

顏色和顆粒都先在這裡做好，不在瀏覽器裡用濾鏡或混合模式：那些在軟體繪圖下很慢。

裁切的範圍取決於 post.cjs 的版面（圖在左邊，左邊界 50 像素）；預設值是 6 和 37 那兩個檔的。

用法：python3 prepare.py --rec6 ../rec-c6 --rec37 ../rec-c37 --music 音樂.wav --fonts 字型資料夾 --grain grain.png
"""
import argparse
import os
import shutil
from concurrent.futures import ProcessPoolExecutor

import cv2
import numpy as np


def crop(args):
    src, dst, (x, y, w, h) = args
    im = cv2.imread(src)
    cv2.imwrite(dst, im[y:y + h, x:x + w], [cv2.IMWRITE_JPEG_QUALITY, 92])


def box(s):
    return tuple(int(v) for v in s.split(','))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rec6', required=True)
    ap.add_argument('--rec37', required=True)
    ap.add_argument('--box6', type=box, default=(44, 34, 314, 1012), help='x,y,寬,高')
    ap.add_argument('--box37', type=box, default=(44, 34, 588, 1012))
    ap.add_argument('--eq6', type=int, default=412, help='右欄方程式的左緣')
    ap.add_argument('--eq37', type=int, default=686)
    ap.add_argument('--music', required=True)
    ap.add_argument('--fonts', required=True, help='放 NiYu-sub.woff2 的資料夾')
    ap.add_argument('--grain', required=True, help='灰階的顆粒圖（512×512，可以重複鋪）')
    ap.add_argument('--out', default='public')
    a = ap.parse_args()
    for d in ('f6', 'f37', 'tex', 'fonts', 'audio'):
        os.makedirs(os.path.join(a.out, d), exist_ok=True)
    jobs = []
    for rec, name, b in ((a.rec6, 'f6', a.box6), (a.rec37, 'f37', a.box37)):
        for f in sorted(os.listdir(rec)):
            if f.startswith('s') and f.endswith('.png'):
                jobs.append((os.path.join(rec, f), os.path.join(a.out, name, f'{int(f[1:5]):04d}.jpg'), b))
    with ProcessPoolExecutor(4) as ex:
        list(ex.map(crop, jobs, chunksize=40))
    for rec, name, x0 in ((a.rec6, 'c6', a.eq6), (a.rec37, 'c37', a.eq37)):
        parts = [cv2.imread(os.path.join(rec, f's{k:04d}.png'))[30:1050, x0:x0 + 1100] for k in (120, 260, 400, 540, 680, 820, 900)]
        gray = cv2.cvtColor(np.concatenate(parts, 0), cv2.COLOR_BGR2GRAY).astype(np.float32)
        alpha = np.clip((255 - gray) / 255 * 1.6, 0, 1)
        h = int(gray.shape[0] * 640 / gray.shape[1])
        alpha = cv2.resize(alpha, (640, h), interpolation=cv2.INTER_AREA)
        img = np.zeros((h, 640, 4), np.uint8)
        img[..., :3] = (124, 189, 217)                 # BGR：#d9bd7c
        img[..., 3] = (alpha * 255).astype(np.uint8)
        cv2.imwrite(os.path.join(a.out, 'tex', f'eqg-{name}.png'), img)
    g = cv2.imread(a.grain, cv2.IMREAD_GRAYSCALE).astype(np.float32)
    d = (g - 128) / 128
    grain = np.zeros(g.shape + (4,), np.uint8)
    grain[..., :3] = np.where(d[..., None] > 0, 255, 0)
    grain[..., 3] = np.clip(np.abs(d) * 0.10 * 255, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(a.out, 'tex', 'grain-a.png'), grain)
    shutil.copy(a.music, os.path.join(a.out, 'audio', 'music.wav'))
    for f in os.listdir(a.fonts):
        if f.endswith('.woff2'):
            shutil.copy(os.path.join(a.fonts, f), os.path.join(a.out, 'fonts', f))
    print(len(jobs), '格')


if __name__ == '__main__':
    main()
