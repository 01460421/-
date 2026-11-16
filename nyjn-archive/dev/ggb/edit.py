#!/usr/bin/env python3
"""把幾段在 GeoGebra 裡錄的畫面剪成一支影片，段與段之間用「往上落的雨」轉場。

每一段：開頭停一下 → 照順序畫（每秒 15 步）→ 畫完停一下。
轉場：前一段畫好的整張圖切成直條，一條一條往上升，拖出一道金色的雨，底下露出下一段的空白畫面。
開頭是空白畫面上升起一陣雨；結尾整張圖往上散去，留下白。
配樂：每一段配一次（每段的長度剛好等於音樂的長度），第二段的音樂從轉場結束那一刻重新開始。

用法：python3 edit.py <輸出.mp4> --music <音檔> --seg <錄影資料夾1> --seg <錄影資料夾2> …
"""
import argparse
import math
import os
import shutil
import subprocess
import tempfile

import cv2
import numpy as np

FPS = 30
GOLD = (90, 160, 205)        # BGR：金色
INK = (40, 70, 95)


def ease_in(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x) * x ** 0.5


def rain_frames(A, B, n, seed, rain_only=False):
    """A 往上散成雨，露出 B。rain_only：畫面不動，只升起一陣雨（片頭用）。"""
    H, W = A.shape[:2]
    rs = np.random.RandomState(seed)
    N = 120
    sw = W / N
    delay = rs.uniform(0, 0.42, N)
    span = rs.uniform(0.42, 0.58, N)
    tail = rs.uniform(160, 420, N)
    drop_r = rs.uniform(3.0, 6.0, N)
    out = []
    for f in range(n):
        t = f / max(1, n - 1)
        img = B.astype(np.float32).copy()
        ov = np.zeros((H, W, 3), np.float32)
        oa = np.zeros((H, W), np.float32)
        for i in range(N):
            x0, x1 = int(round(i * sw)), int(round((i + 1) * sw))
            p = ease_in((t - delay[i]) / span[i])
            lift = p * (H + tail[i] + 40)
            if not rain_only:
                # 這一條 A 往上移
                if p < 1:
                    dy = int(lift)
                    a = 1 - p ** 1.6
                    if dy < H:
                        img[0:H - dy, x0:x1] = img[0:H - dy, x0:x1] * (1 - a) + A[dy:H, x0:x1].astype(np.float32) * a
            # 雨：條的底邊往上升，拖一道線，上面一顆倒著的水滴
            if 0 < p < 1:
                cx = (x0 + x1) / 2
                yb = H - lift if not rain_only else H + 60 - p * (H + tail[i] + 160)
                y_top, y_bot = int(yb), int(yb + tail[i])
                aa = math.sin(p * math.pi) * 0.85
                cv2.line(ov, (int(cx), max(-10, y_top)), (int(cx), min(H + 10, y_bot)), GOLD, 2, cv2.LINE_AA)
                cv2.line(oa, (int(cx), max(-10, y_top)), (int(cx), min(H + 10, y_bot)), aa, 2, cv2.LINE_AA)
                r = drop_r[i]
                pts = drop_pts(cx, y_top - r * 0.6, r)
                cv2.fillPoly(ov, [pts], GOLD, cv2.LINE_AA, 4)
                cv2.fillPoly(oa, [pts], aa, cv2.LINE_AA, 4)
        oa3 = oa[..., None]
        img = img * (1 - oa3) + ov * oa3
        out.append(np.clip(img, 0, 255).astype(np.uint8))
    return out


def drop_pts(x, y, r):
    """倒著落的雨滴：圓的在上，尖的在下（座標乘 16，給 fillPoly 的 shift=4 用）。"""
    pts = [(x - r, y)] + [(x + r * math.cos(math.pi - math.pi * k / 23), y - r * math.sin(math.pi * k / 23)) for k in range(24)] + [(x + r, y), (x, y + r * 2.2)]
    return (np.array(pts) * 16).astype(np.int32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--music', required=True)
    ap.add_argument('--seg', action='append', required=True)
    ap.add_argument('--step-fps', type=int, default=15)
    a = ap.parse_args()
    music_len = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', a.music]).decode())
    tmp = tempfile.mkdtemp(prefix='ggb-edit-')
    frames = []                                  # 每一格對應的圖檔路徑

    def hold(path, sec):
        frames.extend([path] * int(round(sec * FPS)))

    def save(img, name):
        p = os.path.join(tmp, name)
        cv2.imwrite(p, img, [cv2.IMWRITE_PNG_COMPRESSION, 1])
        return p

    segs = []
    for d in a.seg:
        fs = sorted(f for f in os.listdir(d) if f.endswith('.png'))
        segs.append([os.path.join(d, f) for f in fs])
    rep = FPS // a.step_fps
    draw_len = len(segs[0]) * rep / FPS
    T_IN, T_MID, T_OUT, LEAD = 1.5, 2.0, 1.5, 1.5
    for k, seg in enumerate(segs):
        first, last = cv2.imread(seg[0]), cv2.imread(seg[-1])
        if k == 0:
            for j, im in enumerate(rain_frames(first, first, int(T_IN * FPS), 11, rain_only=True)):
                frames.append(save(im, f'in{j:03d}.png'))
        else:
            hold(seg[0], LEAD)
        for p in seg:
            frames.extend([p] * rep)
        end = len(segs) - 1 == k
        seg_len = music_len
        used = (T_IN if k == 0 else LEAD) + len(seg) * rep / FPS
        if not end:
            hold(seg[-1], seg_len - used - T_MID)
            nxt = cv2.imread(segs[k + 1][0])
            for j, im in enumerate(rain_frames(last, nxt, int(T_MID * FPS), 23 + k)):
                frames.append(save(im, f'mid{k}_{j:03d}.png'))
        else:
            hold(seg[-1], seg_len - used - T_OUT)
            white = np.full_like(last, 255)
            for j, im in enumerate(rain_frames(last, white, int(T_OUT * FPS), 37)):
                frames.append(save(im, f'out{j:03d}.png'))
    # 用符號連結排成一串，交給 ffmpeg
    seq = os.path.join(tmp, 'seq')
    os.makedirs(seq)
    for i, p in enumerate(frames):
        os.symlink(os.path.abspath(p), os.path.join(seq, f'f{i:05d}.png'))
    total = len(frames) / FPS
    n = len(segs)
    cmd = ['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(seq, 'f%05d.png')]
    cmd += ['-i', a.music] * n
    fc = ''.join(f'[{i + 1}:a]' for i in range(n)) + f'concat=n={n}:v=0:a=1,atrim=0:{total:.3f}[a]'
    cmd += ['-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-crf', '19', '-preset', 'medium', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', a.out]
    subprocess.run(cmd, check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f'{len(frames)} 格，{total:.2f} 秒（音樂 {music_len:.2f} 秒 × {n}）→ {a.out}')


if __name__ == '__main__':
    main()
