#!/usr/bin/env python3
"""用 fit.py 的結果做一支「照順序畫出來」的影片，順序和 .ggb 裡的一樣：
墨線由上往下 → 細線 → 上色（色塊由大到小，鋪在線的底下）。右邊跟著列出正在畫的方程式。

用法：python3 anim.py <json> <輸出.mp4> --title 十四行詩 --niyu <逆雨 otf> --iansui <芫荽 ttf> [--music <m4a>]
"""
import argparse
import json
import os
import subprocess
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

A0, A1, B0, B1, C0, C1, SMAX = 1, 150, 151, 200, 201, 300, 312
THICK = {'out': 4, 'ink3': 3, 'ink2': 2, 'ink1': 1, 'tone': 1, 'tex': 1}
FORM = {'line': '直線', 'arc': '圓弧', 'parabola': '拋物線', 'parabola_y': '拋物線', 'cubic': '三次函數', 'cubic_y': '三次函數',
        'circle': '圓', 'ellipse': '橢圓', 'polar': '極座標', 'bezier': '參數曲線'}
LAYER = {'out': '外輪廓', 'ink': '墨線', 'tone': '色界', 'tex': '紋理'}
PAPER = (246, 241, 230)
INK = (40, 34, 30)
GOLD = (150, 116, 52)
DIM = (120, 110, 96)


def order(curves, a, b):
    groups = {}
    for c in curves:
        groups.setdefault(c['g'], []).append(c)
    gs = sorted(groups.values(), key=lambda g: -max(c['y'] for c in g))
    flat = [c for g in gs for c in g]
    for k, c in enumerate(flat):
        c['step'] = a + (k * (b - a + 1)) // len(flat)
    return flat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--title', default='')
    ap.add_argument('--niyu', required=True)
    ap.add_argument('--iansui', required=True)
    ap.add_argument('--music', default='')
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--per', type=int, default=2, help='每一步幾格')
    a = ap.parse_args()
    d = json.load(open(a.src))
    W, H, U = d['stats']['width'], d['stats']['height'], d['stats']['unit_px']
    curves = d['curves']
    A = order([c for c in curves if c['k'] in ('ink', 'out')], A0, A1)
    B = order([c for c in curves if c['k'] in ('tone', 'tex')], B0, B1)
    fills = d['fills']
    for k, f in enumerate(fills):
        f['step'] = C0 + (k * (C1 - C0 + 1)) // len(fills)
    lines = A + B

    # 畫布：圖高 1000，放大兩倍畫再縮小
    DH = 1000
    sc = DH / H
    DW = int(round(W * sc))
    ss = 2
    CH, CW = DH * ss, DW * ss
    SHIFT = 4
    def tr(pts):
        P = np.array(pts)
        return np.round(np.stack([P[:, 0] * U * sc * ss, (H - P[:, 1] * U) * sc * ss], 1) * (1 << SHIFT)).astype(np.int32)

    fill_rgb = np.full((CH, CW, 3), 255, np.uint8)
    fill_m = np.zeros((CH, CW), np.uint8)
    line_rgb = np.zeros((CH, CW, 3), np.uint8)
    line_a = np.zeros((CH, CW), np.uint8)
    by_step = {}
    for c in lines:
        by_step.setdefault(c['step'], []).append(('c', c))
    for f in fills:
        by_step.setdefault(f['step'], []).append(('p', f))

    f_title = ImageFont.truetype(a.niyu, 78)
    f_sub = ImageFont.truetype(a.iansui, 30)
    f_small = ImageFont.truetype(a.iansui, 24)
    f_eq = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 17)
    f_tag = ImageFont.truetype(a.iansui, 19)
    f_num = ImageFont.truetype(a.niyu, 54)
    total_eq = len(lines)
    stats = {}
    for c in lines:
        stats[FORM[c['f']]] = stats.get(FORM[c['f']], 0) + 1

    tmp = tempfile.mkdtemp(prefix='ggb-anim-')
    frames = []
    INTRO, HOLD = 36, 120
    recent = []
    drawn_eq = 0
    fno = 0
    X0, Y0 = 150, 40
    PX = X0 + DW + 110

    def compose(step, phase_note):
        nonlocal fno
        base = np.full((CH, CW, 3), 255, np.float32)
        m = fill_m > 0
        base[m] = fill_rgb[m]
        al = (line_a.astype(np.float32) / 255)[..., None]
        base = base * (1 - al) + line_rgb.astype(np.float32) * al
        img = cv2.resize(base.astype(np.uint8), (DW, DH), interpolation=cv2.INTER_AREA)
        canvas = Image.new('RGB', (1920, 1080), PAPER)
        canvas.paste(Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)), (X0, Y0))
        dr = ImageDraw.Draw(canvas)
        dr.rectangle([X0 - 1, Y0 - 1, X0 + DW, Y0 + DH], outline=(214, 204, 184), width=1)
        dr.text((PX, 70), a.title, font=f_title, fill=INK)
        dr.text((PX, 172), f'用 {total_eq:,} 條方程式畫成，{len(fills)} 塊顏色', font=f_sub, fill=DIM)
        dr.text((PX, 236), f'{drawn_eq:,}', font=f_num, fill=GOLD)
        dr.text((PX + 12 + dr.textlength(f'{drawn_eq:,}', font=f_num), 262), f'／ {total_eq:,} 條方程式　　{phase_note}', font=f_small, fill=DIM)
        y = 330
        for kind, form, eq in recent[-21:]:
            tag = f'{LAYER[kind]}·{form}'
            dr.text((PX, y + 1), tag, font=f_tag, fill=GOLD)
            t = eq.replace('，', ',  ')
            if len(t) > 78:
                t = t[:76] + '…'
            dr.text((PX + 132, y + 2), t, font=f_eq, fill=INK)
            y += 31
        ys = 1000
        dr.text((PX, ys), '　'.join(f'{k} {v:,}' for k, v in sorted(stats.items(), key=lambda kv: -kv[1])), font=f_small, fill=DIM)
        p = os.path.join(tmp, f'f{fno:05d}.png')
        canvas.save(p, compress_level=1)
        fno += 1

    for _ in range(INTRO):
        compose(0, '')
    for s in range(1, SMAX + 1):
        for typ, o in by_step.get(s, []):
            if typ == 'p':
                cv2.fillPoly(fill_rgb, [tr(o['pts'])], tuple(int(v) for v in o['c'][::-1]), cv2.LINE_AA, SHIFT)
                cv2.fillPoly(fill_m, [tr(o['pts'])], 255, cv2.LINE_8, SHIFT)
            else:
                P = tr(o['pts'])
                th = THICK['ink' + str(o['w'])] if o['k'] == 'ink' else THICK[o['k']]
                w = max(1, int(round(th * ss * 0.75)))
                cv2.polylines(line_rgb, [P], o['imp'], tuple(int(v) for v in o['c'][::-1]), w, cv2.LINE_AA, SHIFT)
                cv2.polylines(line_a, [P], o['imp'], 255, w, cv2.LINE_AA, SHIFT)
                recent.append((o['k'], FORM[o['f']], o['eq']))
                drawn_eq += 1
        note = '墨線' if s <= A1 else '細線' if s <= B1 else '上色' if s <= C1 else '完成'
        for _ in range(a.per):
            compose(s, note)
    for _ in range(HOLD):
        compose(SMAX, '完成')
    dur = fno / a.fps
    cmd = ['ffmpeg', '-v', 'error', '-y', '-framerate', str(a.fps), '-i', os.path.join(tmp, 'f%05d.png')]
    if a.music:
        cmd += ['-i', a.music, '-af', f'afade=t=in:d=0.6,afade=t=out:st={dur - 3:.2f}:d=3', '-c:a', 'aac', '-b:a', '160k', '-shortest']
    cmd += ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', a.out]
    subprocess.run(cmd, check=True)
    final = os.path.join(tmp, f'f{fno - 1:05d}.png')
    Image.open(final).save(a.out.replace('.mp4', '-final.png'))
    print(f'{fno} 格，{dur:.1f} 秒 → {a.out}')


if __name__ == '__main__':
    main()
