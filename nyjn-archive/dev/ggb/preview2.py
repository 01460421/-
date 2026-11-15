#!/usr/bin/env python3
"""把方程式（取樣的點）與上色的多邊形畫回點陣圖，和原圖並排。用法：python3 preview2.py <json> <輸出.jpg>"""
import json, sys
import cv2, numpy as np

def main(src, out):
    d = json.load(open(src))
    W, H, U = d['stats']['width'], d['stats']['height'], d['stats']['unit_px']
    k = 2
    im = np.full((H * k, W * k, 3), 255, np.uint8)
    S = 16
    tr = lambda P: np.round(np.stack([P[:, 0] * U, H - P[:, 1] * U], 1) * k * S).astype(np.int32)
    for f in d['fills']:
        cv2.fillPoly(im, [tr(np.array(f['pts']))], tuple(int(v) for v in f['c'][::-1]), cv2.LINE_AA, 4)
    lines = im.copy() * 0 + 255
    for c in d['curves']:
        P = tr(np.array(c['pts']))
        col = tuple(int(v) for v in c['c'][::-1])
        w = max(1, round(c['w'] * k * 0.62))
        cv2.polylines(im, [P], c['imp'], col, w, cv2.LINE_AA, 4)
        cv2.polylines(lines, [P], c['imp'], col, w, cv2.LINE_AA, 4)
    im = cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)
    lines = cv2.resize(lines, (W, H), interpolation=cv2.INTER_AREA)
    orig = cv2.imread(src.replace('.json', '-src.png'))
    gap = np.full((H, 16, 3), 255, np.uint8)
    cv2.imwrite(out, np.concatenate([orig, gap, lines, gap, im], 1), [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(out.replace('.jpg', '-color.png'), im)

main(sys.argv[1], sys.argv[2])
