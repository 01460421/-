#!/usr/bin/env python3
"""把一張角色圖擬合成一組三次參數曲線，供 GeoGebra 使用。

三層線，由粗到細：
  墨線（ink）：lineart.py 產生的線稿，取它的脊線（中心線），位置準到小數像素；外輪廓取自透明度，併在同一層。
  色界（tone）：把畫面分成幾十種顏色的色塊，取色塊之間的界線。陰影的形狀、花紋、反光都在這一層。
  紋理（tex）：前兩層沒有涵蓋到的顏色梯度邊緣（Canny）。
每一層的線都細化成一個像素寬，沿著像素連成鏈，在轉角處斷開，再用 Schneider 的演算法擬合成首尾相接的三次貝茲曲線，
誤差上限以像素計。每一段貝茲就是一條參數方程式：x(t) = a₃t³ + a₂t² + a₁t + a₀，y(t) 亦同，t ∈ [0, 1]。

用法：
  python3 fit.py <圖檔> <輸出.json> --prep [--crop x0,y0,x1,y1] [--erase x0,y0,x1,y1 …] [--height 2400]     # 先裁圖
  python3 lineart.py <輸出-src.png> <線稿.png> --weights <權重>                                        # 轉線稿
  python3 fit.py <圖檔> <輸出.json> --lines <線稿.png> [--lines2 <第二張線稿>] [同樣的裁圖參數]              # 擬合
輸出的 json 交給 build.cjs，由 GeoGebra 自己建出 .ggb。
"""
import argparse
import json
import math
import sys

import cv2
import numpy as np


# ───────────────────────── 讀圖 ─────────────────────────
def load(path, crop, height, erase):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im is None:
        sys.exit('讀不到圖：' + path)
    if im.ndim == 2:
        im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGRA)
    if im.shape[2] == 3:
        im = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA)
    for (x0, y0, x1, y1) in erase:                     # 把不要的部分（例如簽名）清成透明
        im[y0:y1, x0:x1, 3] = 0
    if crop:
        x0, y0, x1, y1 = crop
        im = im[y0:y1, x0:x1]
    a = im[:, :, 3]
    ys, xs = np.where(a > 24)
    m = 12
    y0, y1, x0, x1 = max(0, ys.min() - m), min(im.shape[0], ys.max() + m + 1), max(0, xs.min() - m), min(im.shape[1], xs.max() + m + 1)
    im = im[y0:y1, x0:x1]
    k = height / im.shape[0]
    im = cv2.resize(im, (round(im.shape[1] * k), height), interpolation=cv2.INTER_CUBIC if k > 1 else cv2.INTER_AREA)
    alpha = im[:, :, 3].astype(np.float32) / 255
    bgr = im[:, :, :3].astype(np.float32)
    white = bgr * alpha[..., None] + 255 * (1 - alpha[..., None])      # 鋪在白底上
    return white.astype(np.uint8), (alpha * 255).astype(np.uint8)


# ───────────────────────── 邊緣 ─────────────────────────
def edges(img, alpha, hi_pct, lo_ratio):
    smooth = cv2.bilateralFilter(img, 7, 32, 5)
    smooth = cv2.bilateralFilter(smooth, 7, 24, 5)
    dx = np.stack([cv2.Sobel(smooth[:, :, c], cv2.CV_32F, 1, 0, ksize=3) for c in range(3)], -1)
    dy = np.stack([cv2.Sobel(smooth[:, :, c], cv2.CV_32F, 0, 1, ksize=3) for c in range(3)], -1)
    mag = np.hypot(dx, dy)
    best = mag.argmax(-1)
    ii, jj = np.indices(best.shape)
    gx, gy = dx[ii, jj, best], dy[ii, jj, best]
    g = np.hypot(gx, gy)
    inside = cv2.erode((alpha > 128).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0     # 離外輪廓遠一點，免得和輪廓重複
    hi = float(np.percentile(g[inside], hi_pct))
    lo = hi * lo_ratio
    e = cv2.Canny(np.clip(gx, -32767, 32767).astype(np.int16), np.clip(gy, -32767, 32767).astype(np.int16), lo, hi, L2gradient=True)
    e[~inside] = 0
    return e > 0, g, smooth, (lo, hi)


def regions(img, alpha, k, min_area, seed=7):
    """把畫面分成 k 種顏色的色塊，取色塊之間的界線。界線是連續的，不像梯度邊緣那樣斷斷續續。"""
    flat = cv2.pyrMeanShiftFiltering(img, 5, 12)
    lab = cv2.cvtColor(flat, cv2.COLOR_BGR2Lab).astype(np.float32)
    inside = alpha > 128
    px = lab[inside]
    rs = np.random.RandomState(seed)
    sub = px[rs.choice(len(px), min(len(px), 120000), replace=False)]
    _, _, cen = cv2.kmeans(sub, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3), 3, cv2.KMEANS_PP_CENTERS)
    d = ((lab[:, :, None, :] - cen[None, None]) ** 2).sum(-1)
    lb = d.argmin(-1).astype(np.uint8)
    lb = cv2.medianBlur(lb, 5)
    # 太小的碎塊併進旁邊最近的色塊
    hole = np.zeros(lb.shape, bool)
    for i in range(k):
        n, cc, st, _ = cv2.connectedComponentsWithStats(((lb == i) & inside).astype(np.uint8), connectivity=4)
        small = np.where(st[:, cv2.CC_STAT_AREA] < min_area)[0]
        small = small[small > 0]
        if len(small):
            hole |= np.isin(cc, small)
    if hole.any():
        _, near = cv2.distanceTransformWithLabels((hole | ~inside).astype(np.uint8), cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
        zy, zx = np.where(~(hole | ~inside))
        if len(zy):
            src = np.zeros(near.max() + 1, np.int64)
            src[near[zy, zx]] = np.arange(len(zy))
            idx = src[near[hole]]
            lb[hole] = lb[zy[idx], zx[idx]]
    L = lb.astype(np.int16)
    L[~inside] = -1
    e = np.zeros(lb.shape, bool)
    e[:, :-1] |= (L[:, :-1] != L[:, 1:]) & (L[:, :-1] >= 0) & (L[:, 1:] >= 0)
    e[:-1, :] |= (L[:-1, :] != L[1:, :]) & (L[:-1, :] >= 0) & (L[1:, :] >= 0)
    return e, flat, lb


def inklines(img, alpha, sigma, thresh, min_area):
    """畫裡用深色勾的線：比周圍暗的細條（高斯差）。取它的中心線。"""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2Lab)[:, :, 0].astype(np.float32)
    d = cv2.GaussianBlur(g, (0, 0), sigma * 1.9) - cv2.GaussianBlur(g, (0, 0), sigma)
    inside = cv2.erode((alpha > 128).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    m = ((d > thresh) & inside).astype(np.uint8)
    n, cc, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.where(st[:, cv2.CC_STAT_AREA] >= min_area)[0]
    keep = keep[keep > 0]
    return np.isin(cc, keep)


def ridges(dark, sigma, lo, hi):
    """線稿是軟的灰線；直接二值化，靠得近的線會糊成一團。
    這裡找「脊線」：把暗度當成高度，沿著曲率最大的方向找山脊（Steger 1998），相鄰兩三個像素的線也分得開，
    而且算得出脊線在像素裡偏哪一邊，位置準到小數。"""
    D = cv2.GaussianBlur(dark, (0, 0), sigma)
    gy, gx = np.gradient(D)
    gxy, gxx = np.gradient(gx)
    gyy, _ = np.gradient(gy)
    tr, df = (gxx + gyy) / 2, np.hypot((gxx - gyy) / 2, gxy)
    lam = tr - df                                                  # 橫過脊線的二階導數，越負越像一條線
    th = 0.5 * np.arctan2(2 * gxy, gxx - gyy) + np.pi / 2          # 脊線的法線方向
    nx, ny = np.cos(th), np.sin(th)
    den = gxx * nx * nx + 2 * gxy * nx * ny + gyy * ny * ny
    den[np.abs(den) < 1e-6] = -1e-6
    t = -(gx * nx + gy * ny) / den
    ox, oy = t * nx, t * ny
    # 山脊：沿法線往兩邊各走一個像素，都不比自己高
    h, w = D.shape
    xs, ys = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    nxf, nyf = nx.astype(np.float32), ny.astype(np.float32)
    a1 = cv2.remap(D, xs + nxf, ys + nyf, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    a2 = cv2.remap(D, xs - nxf, ys - nyf, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    on = (D >= a1) & (D >= a2) & (lam < 0)
    st = np.where(on, -lam, 0)
    weak, strong = st > lo, st > hi
    weak = cv2.morphologyEx(weak.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0     # 補上一個像素的小缺口
    n, cc = cv2.connectedComponents(weak.astype(np.uint8), connectivity=8)
    keep = np.unique(cc[strong])
    e = np.isin(cc, keep[keep > 0])
    return e, np.clip(ox, -0.7, 0.7), np.clip(oy, -0.7, 0.7), D, st


def thin(e):
    """Zhang–Suen 細化，再去掉階梯上多餘的角。"""
    e = e.astype(np.uint8)
    def nb(a):
        p = np.pad(a, 1)
        return [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]   # P2..P9：上、右上、右、右下、下、左下、左、左上
    while True:
        changed = False
        for step in (0, 1):
            P = nb(e)
            B = sum(P)
            A = sum(((P[i] == 0) & (P[(i + 1) % 8] == 1)).astype(np.uint8) for i in range(8))
            if step == 0:
                c = (P[0] * P[2] * P[4] == 0) & (P[2] * P[4] * P[6] == 0)
            else:
                c = (P[0] * P[2] * P[6] == 0) & (P[0] * P[4] * P[6] == 0)
            rm = (e == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if rm.any():
                e[rm] = 0
                changed = True
        if not changed:
            break
    for conds in (((0, 2, 5), (2, 4, 7)), ((4, 6, 1), (6, 0, 3))):       # 上與右都有、左下沒有 → 這一點是多餘的角；其餘三個方向同理
        P = nb(e)
        rm = np.zeros(e.shape, bool)
        for a, b, c in conds:
            rm |= (e == 1) & (P[a] == 1) & (P[b] == 1) & (P[c] == 0)
        e[rm] = 0
    return e > 0


OFF = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]


def chains(e):
    """把一個像素寬的邊緣沿著像素連成鏈；在端點與岔口斷開。回傳 [(N×2 的 (x, y) 陣列, 是否閉合)]。"""
    h, w = e.shape
    p = np.pad(e, 1).astype(np.uint8)
    deg = sum(p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w] for dy, dx in OFF) * e
    pts = set(zip(*np.where(e)))
    node = set(zip(*np.where(e & (deg != 2))))
    used = set()                                                   # 走過的邊：((y,x),(y,x))，小的在前
    out = []
    def nbrs(q):
        return [(q[0] + dy, q[1] + dx) for dy, dx in OFF if (q[0] + dy, q[1] + dx) in pts]
    def key(a, b):
        return (a, b) if a < b else (b, a)
    def walk(a, b):
        path = [a, b]
        used.add(key(a, b))
        prev, cur = a, b
        while cur not in node:
            nx = [q for q in nbrs(cur) if q != prev and key(cur, q) not in used]
            if not nx:
                break
            # 優先走上下左右的鄰居，免得在斜角上跳過像素
            nx.sort(key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1]))
            prev, cur = cur, nx[0]
            used.add(key(prev, cur))
            path.append(cur)
            if cur == a:
                break
        return path
    for n in sorted(node):
        for q in nbrs(n):
            if key(n, q) not in used:
                out.append((walk(n, q), False))
    seen = set(q for path, _ in out for q in path)
    for q in sorted(pts - seen - node):                            # 剩下的是沒有端點的環
        if q in seen:
            continue
        nb = nbrs(q)
        if not nb:
            continue
        path = walk(q, nb[0])
        seen.update(path)
        out.append((path, path[-1] == q and len(path) > 3))
    return [(np.array([(x, y) for y, x in path], np.float64), closed) for path, closed in out if len(path) >= 2]


def smooth_chain(P, closed, sigma):
    """沿著鏈做一點高斯平滑，去掉像素的階梯；開口的鏈端點不動。"""
    n = len(P)
    if n < 5:
        return P
    r = max(1, int(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    if closed:
        Q = np.concatenate([P[-r - 1:-1], P, P[1:r + 1]])
        return np.stack([np.convolve(Q[:, i], k, 'valid') for i in (0, 1)], 1)
    Q = np.concatenate([np.repeat(P[:1], r, 0), P, np.repeat(P[-1:], r, 0)])
    S = np.stack([np.convolve(Q[:, i], k, 'valid') for i in (0, 1)], 1)
    S[0], S[-1] = P[0], P[-1]
    return S


def split_corners(P, closed, span, deg):
    """在轉角處斷開，貝茲曲線才不會把尖角磨圓。"""
    n = len(P)
    if n < span * 2 + 3:
        return [(P, closed)]
    idx = np.arange(n)
    a = P[np.clip(idx - span, 0, n - 1)] if not closed else P[(idx - span) % (n - 1)]
    b = P[np.clip(idx + span, 0, n - 1)] if not closed else P[(idx + span) % (n - 1)]
    v1, v2 = P - a, b - P
    l1, l2 = np.hypot(*v1.T) + 1e-9, np.hypot(*v2.T) + 1e-9
    ang = np.degrees(np.arccos(np.clip((v1 * v2).sum(1) / (l1 * l2), -1, 1)))
    if not closed:
        ang[:span] = 0
        ang[-span:] = 0
    cut = []
    i = 0
    while i < n:
        if ang[i] > deg:
            j = i
            while j + 1 < n and ang[j + 1] > deg:
                j += 1
            cut.append(i + int(np.argmax(ang[i:j + 1])))
            i = j + 1
        else:
            i += 1
    if not cut:
        return [(P, closed)]
    if closed:                                                     # 從第一個轉角起算，轉一圈
        c0 = cut[0]
        P = np.concatenate([P[c0:-1], P[:c0 + 1]])
        cut = [c - c0 for c in cut[1:]]
    cut = [0] + [c for c in cut if 2 <= c <= len(P) - 3] + [len(P) - 1]
    return [(P[cut[i]:cut[i + 1] + 1], False) for i in range(len(cut) - 1) if cut[i + 1] - cut[i] >= 1]


# ───────────────────────── 貝茲擬合（Schneider 1990） ─────────────────────────
def bez(c, t):
    t = np.asarray(t)[:, None]
    return (1 - t) ** 3 * c[0] + 3 * (1 - t) ** 2 * t * c[1] + 3 * (1 - t) * t ** 2 * c[2] + t ** 3 * c[3]


def unit(v):
    n = math.hypot(v[0], v[1])
    return v / n if n > 1e-12 else v


def chord(P):
    d = np.hypot(*np.diff(P, axis=0).T)
    u = np.concatenate([[0], np.cumsum(d)])
    return u / u[-1] if u[-1] > 0 else np.linspace(0, 1, len(P))


def gen(P, u, t1, t2):
    b1, b2 = 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u ** 2
    b0, b3 = (1 - u) ** 3, u ** 3
    A1, A2 = b1[:, None] * t1, b2[:, None] * t2
    c00, c01, c11 = (A1 * A1).sum(), (A1 * A2).sum(), (A2 * A2).sum()
    tmp = P - (P[0] * (b0 + b1)[:, None] + P[-1] * (b2 + b3)[:, None])
    x0, x1 = (A1 * tmp).sum(), (A2 * tmp).sum()
    det = c00 * c11 - c01 * c01
    seg = math.hypot(*(P[-1] - P[0]))
    if abs(det) > 1e-12:
        a1, a2 = (x0 * c11 - x1 * c01) / det, (c00 * x1 - c01 * x0) / det
    else:
        a1 = a2 = 0
    eps = 1e-6 * seg
    if a1 < eps or a2 < eps:
        a1 = a2 = seg / 3
    return np.array([P[0], P[0] + t1 * a1, P[-1] + t2 * a2, P[-1]])


def reparam(c, P, u):
    d1 = 3 * (c[1:] - c[:-1])
    d2 = 2 * (d1[1:] - d1[:-1])
    t = u[:, None]
    q = bez(c, u)
    q1 = (1 - t) ** 2 * d1[0] + 2 * (1 - t) * t * d1[1] + t ** 2 * d1[2]
    q2 = (1 - t) * d2[0] + t * d2[1]
    num = ((q - P) * q1).sum(1)
    den = (q1 * q1).sum(1) + ((q - P) * q2).sum(1)
    den[np.abs(den) < 1e-12] = 1e-12
    return np.clip(u - num / den, 0, 1)


def fit(P, t1, t2, tol, out, depth=0):
    n = len(P)
    if n == 2:
        d = math.hypot(*(P[1] - P[0])) / 3
        out.append((np.array([P[0], P[0] + t1 * d, P[1] + t2 * d, P[1]]), P))
        return
    u = chord(P)
    c = gen(P, u, t1, t2)
    err = np.hypot(*(bez(c, u) - P).T)
    k = int(err.argmax())
    if err[k] < tol:
        out.append((c, P))
        return
    if err[k] < tol * 4:
        for _ in range(6):
            u = reparam(c, P, u)
            c = gen(P, u, t1, t2)
            err = np.hypot(*(bez(c, u) - P).T)
            k = int(err.argmax())
            if err[k] < tol:
                out.append((c, P))
                return
    k = min(max(k, 1), n - 2)
    tc = unit(P[k - 1] - P[k + 1])
    if not np.any(tc):
        tc = unit(P[k - 1] - P[k])
    fit(P[:k + 1], t1, tc, tol, out, depth + 1)
    fit(P[k:], -tc, t2, tol, out, depth + 1)


def fit_chain(P, closed, tol):
    out = []
    if len(P) < 2:
        return out
    if closed and len(P) > 6:
        t1 = unit(P[1] - P[-2])
        fit(P, t1, -t1, tol, out)
    else:
        k = min(2, len(P) - 1)
        fit(P, unit(P[k] - P[0]), unit(P[-1 - k] - P[-1]), tol, out)
    return out


# ───────────────────────── 顏色 ─────────────────────────
def colour(P, img, alpha, vmax=150):
    """沿著鏈在兩側各取樣，用比較深的那一側；太淺的壓深一些，白底上才看得見。"""
    h, w = alpha.shape
    if len(P) < 3:
        nrm = np.array([[0.0, 1.0]])
        mid = P[:1]
    else:
        tg = P[2:] - P[:-2]
        tg /= (np.hypot(*tg.T)[:, None] + 1e-9)
        nrm = np.stack([-tg[:, 1], tg[:, 0]], 1)
        mid = P[1:-1]
    best = None
    for s in (-2.2, 2.2):
        q = np.round(mid + nrm * s).astype(int)
        ok = (q[:, 0] >= 0) & (q[:, 0] < w) & (q[:, 1] >= 0) & (q[:, 1] < h)
        q = q[ok]
        if not len(q):
            continue
        q = q[alpha[q[:, 1], q[:, 0]] > 128]
        if not len(q):
            continue
        c = np.median(img[q[:, 1], q[:, 0]].astype(np.float64), 0)
        if best is None or c.sum() < best.sum():
            best = c
    if best is None:
        best = np.array([40.0, 40.0, 40.0])
    hsv = cv2.cvtColor(np.uint8([[best]]), cv2.COLOR_BGR2HSV)[0, 0].astype(np.float64)
    hsv[2] = min(hsv[2], vmax)                                     # 太亮的壓暗
    hsv[1] = min(255, hsv[1] * 1.15)
    b, g, r = cv2.cvtColor(np.uint8([[hsv]]), cv2.COLOR_HSV2BGR)[0, 0]
    return [int(r), int(g), int(b)]


def fills(img, alpha, k, min_area, eps, U):
    """把畫面分成 k 種顏色的色塊；每一塊取外框，化成多邊形，填它在原圖裡的平均色。
    相鄰的色塊各往外多一個像素，接縫才不會露白；畫的時候由大到小，小塊疊在大塊上，洞自然補上。"""
    H = alpha.shape[0]
    _, _, lb = regions(img, alpha, k, min_area)
    inside = alpha > 128
    out = []
    for i in range(k):
        n, cc, st, _ = cv2.connectedComponentsWithStats(((lb == i) & inside).astype(np.uint8), connectivity=4)
        for j in range(1, n):
            x, y, w, h, area = st[j]
            if area < min_area:
                continue
            x0, y0 = max(0, x - 2), max(0, y - 2)
            reg = cc[y0:y + h + 2, x0:x + w + 2] == j
            colr = img[y0:y + h + 2, x0:x + w + 2][reg].mean(0)
            m = cv2.dilate(reg.astype(np.uint8), np.ones((3, 3), np.uint8))
            cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            c = max(cs, key=cv2.contourArea)
            ap = cv2.approxPolyDP(c, eps, True)[:, 0, :].astype(np.float64)
            if len(ap) < 3:
                continue
            ap[:, 0] += x0
            ap[:, 1] += y0
            out.append({'pts': [[round(px / U, 4), round((H - py) / U, 4)] for px, py in ap], 'c': [int(colr[2]), int(colr[1]), int(colr[0])], 'area': int(area)})
    out.sort(key=lambda r: -r['area'])
    return out


def degree(e):
    h, w = e.shape
    p = np.pad(e, 1).astype(np.uint8)
    return sum(p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w] for dy, dx in OFF) * e


def trace(e, min_len, spur):
    """細化、連成鏈；骨架上又短又懸空的岔枝去掉（去掉之後原本的岔口就接成一條），孤立的短線也不要。"""
    e = thin(e)
    for _ in range(3):
        deg = degree(e)
        cut = False
        for P, c in chains(e):
            if c or len(P) >= spur:
                continue
            q = P.astype(int)
            d0, d1 = int(deg[q[0, 1], q[0, 0]]), int(deg[q[-1, 1], q[-1, 0]])
            if d0 <= 1 and d1 >= 3:
                q = q[:-1]
            elif d1 <= 1 and d0 >= 3:
                q = q[1:]
            else:
                continue
            e[q[:, 1], q[:, 0]] = False
            cut = True
        if not cut:
            break
        e = thin(e)
    deg = degree(e)
    out = []
    for P, c in chains(e):
        q = P.astype(int)
        d0, d1 = int(deg[q[0, 1], q[0, 0]]), int(deg[q[-1, 1], q[-1, 0]])
        length = float(np.hypot(*np.diff(P, axis=0).T).sum())
        if not c and length < min_len and d0 <= 1 and d1 <= 1:
            continue
        out.append((P, c))
    return out, e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('out')
    ap.add_argument('--name', default='')
    ap.add_argument('--crop', default='')
    ap.add_argument('--erase', nargs='*', default=[])
    ap.add_argument('--height', type=int, default=2400, help='擬合時圖的高度（像素）')
    ap.add_argument('--prep', action='store_true', help='只輸出裁好、鋪在白底上的圖')
    ap.add_argument('--layers', default='ink+tone+tex')
    ap.add_argument('--tol', type=float, default=0.3, help='擬合的誤差上限（像素）')
    ap.add_argument('--min', type=float, default=7, help='孤立而且短於這個長度（像素）的線不要')
    ap.add_argument('--spur', type=int, default=7, help='短於這個長度的岔枝去掉')
    ap.add_argument('--smooth', type=float, default=0.9, help='沿著鏈平滑的尺度（像素）')
    ap.add_argument('--corner', type=float, default=48, help='轉角超過幾度就斷開')
    ap.add_argument('--lines', default='', help='lineart.py 產生的線稿')
    ap.add_argument('--lines2', default='', help='第二張線稿，補細節用')
    ap.add_argument('--w2', type=float, default=0.9, help='第二張線稿的比重')
    ap.add_argument('--lt-lo', dest='lt_lo', type=float, default=1.0, help='脊線的低門檻（橫過線的二階導數）')
    ap.add_argument('--lt-hi', dest='lt_hi', type=float, default=3.0, help='高門檻：一條線裡至少要有這麼強的地方')
    ap.add_argument('--rsigma', type=float, default=1.2, help='找脊線之前的平滑尺度')
    ap.add_argument('--k', type=int, default=28, help='色界：色塊的顏色數')
    ap.add_argument('--area', type=int, default=30, help='色界：小於這個面積（像素）的色塊併掉')
    ap.add_argument('--hi', type=float, default=62, help='紋理：Canny 高門檻取梯度的第幾百分位')
    ap.add_argument('--lo', type=float, default=0.4, help='紋理：低門檻相對於高門檻的比例')
    ap.add_argument('--vmax', type=float, default=112, help='墨線的顏色最亮到多少（0–255）')
    ap.add_argument('--unit', type=float, default=100, help='幾個像素算 GeoGebra 的一個單位')
    ap.add_argument('--ftol', type=float, default=0.4, help='直線、圓弧、拋物線等形式的誤差上限（像素）')
    ap.add_argument('--fk', type=int, default=40, help='上色：色塊的顏色數（0 表示不上色）')
    ap.add_argument('--farea', type=int, default=90, help='上色：小於這個面積（像素）的色塊併掉')
    ap.add_argument('--feps', type=float, default=0.9, help='上色：多邊形的簡化誤差（像素）')
    a = ap.parse_args()
    box = lambda t: tuple(int(v) for v in t.split(','))
    img, alpha = load(a.image, box(a.crop) if a.crop else None, a.height, [box(t) for t in a.erase])
    H, W = alpha.shape
    if a.prep:
        cv2.imwrite(a.out.replace('.json', '-src.png'), img)
        print('prep', W, H)
        return
    layers = a.layers.split('+')
    solid = (alpha > 128).astype(np.uint8)
    soft = cv2.bilateralFilter(img, 7, 30, 5)
    taken = np.zeros((H, W), bool)                                   # 已經有線的地方（後面的層不重複畫）
    todo = []                                                        # (鏈, 是否閉合, 種類, 顏色, 粗細)
    near = lambda m: cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0

    if 'ink' in layers:
        if a.lines:
            lm = cv2.imread(a.lines, 0).astype(np.float32)
            if lm.shape != (H, W):
                sys.exit('線稿的尺寸和裁好的圖不一樣，請用同樣的裁圖參數先跑 --prep')
            if a.lines2:
                lm = np.minimum(lm, 255 - a.w2 * (255 - cv2.imread(a.lines2, 0).astype(np.float32)))
            dark = 255 - lm
        else:
            dark = np.zeros((H, W), np.float32)
        rim = (solid > 0) & (cv2.erode(solid, np.ones((3, 3), np.uint8)) == 0)       # 外輪廓：一個像素寬
        band = cv2.dilate(rim.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
        dark = np.maximum(dark, cv2.GaussianBlur(rim.astype(np.float32) * 255, (0, 0), 0.9) * 1.6)   # 外輪廓畫進線稿，和模型畫的輪廓併成一條
        dark[solid == 0] = 0
        e, ox, oy, D, _ = ridges(dark, a.rsigma, a.lt_lo, a.lt_hi)
        ch, e = trace(e, a.min, a.spur)
        taken |= e
        for P, c in ch:
            q = P.astype(int)
            qy, qx = q[:, 1], q[:, 0]
            kind = 'out' if float(np.mean(band[qy, qx])) > 0.7 else 'ink'
            hsv = cv2.cvtColor(np.uint8([[np.median(soft[qy, qx].astype(np.float64), 0)]]), cv2.COLOR_BGR2HSV)[0, 0].astype(np.float64)
            hsv[2] = min(hsv[2], a.vmax)
            hsv[1] = min(255, hsv[1] * 1.1)
            b, g, r = cv2.cvtColor(np.uint8([[hsv]]), cv2.COLOR_HSV2BGR)[0, 0]
            d = float(np.mean(D[qy, qx]))                            # 這條線平均有多暗
            todo.append((P + np.stack([ox[qy, qx], oy[qy, qx]], 1), c, kind, [int(r), int(g), int(b)], 3 if kind == 'out' else (3 if d > 150 else 2 if d > 62 else 1)))

    if 'tone' in layers:
        eb, flat, _ = regions(img, alpha, a.k, a.area)
        eb &= ~near(taken)
        ch, eb = trace(eb, a.min, a.spur)
        taken |= eb
        for P, c in ch:
            todo.append((P, c, 'tone', colour(smooth_chain(P, c, 1.0), flat, alpha, 172), 1))

    if 'tex' in layers:
        ec, _, sm, _ = edges(img, alpha, a.hi, a.lo)
        ec &= ~near(taken)
        ch, ec = trace(ec, a.min, a.spur)
        taken |= ec
        for P, c in ch:
            todo.append((P, c, 'tex', colour(smooth_chain(P, c, 1.0), sm, alpha, 188), 1))

    import forms
    U = a.unit
    ftol = a.ftol / U
    toU = lambda Q: np.stack([Q[:, 0] / U, (H - Q[:, 1]) / U], 1)
    curves, count, total, ref = [], {}, 0.0, []
    for g, (P, closed, kind, col, thick) in enumerate(todo):
        S = smooth_chain(P, closed, a.smooth)
        total += float(np.hypot(*np.diff(S, axis=0).T).sum())
        ref.append(toU(S))
        for Q, cl in split_corners(S, closed, 4, a.corner):
            if len(Q) < 2:
                continue
            Qu = toU(Q)
            r = forms.best_closed(Qu, ftol) if cl else forms.best_open(Qu, ftol)
            recs = [r] if r else [forms.best_open(toU(sub), ftol) or forms.f_bezier(toU(c)) for c, sub in fit_chain(Q, cl, a.tol)]
            for r in recs:
                curves.append({'cmd': r['cmd'], 'eq': r['eq'], 'f': r['f'], 'imp': bool(r.get('implicit')), 'pts': np.round(r['pts'], 5).tolist(),
                               'c': col, 'w': thick, 'k': kind, 'g': g, 'y': round(float(Qu[:, 1].mean()), 3)})
                count[kind] = count.get(kind, 0) + 1
    by_form = {}
    for c in curves:
        by_form[c['f']] = by_form.get(c['f'], 0) + 1

    # 誤差：原本那條線上的點，到最後的方程式（取樣成細密的折線）的最短距離
    dense = []
    for c in curves:
        Pp = np.array(c['pts'])
        seg = np.hypot(*np.diff(Pp, axis=0).T)
        for k in range(len(Pp) - 1):
            m = max(1, int(seg[k] / 0.0015))
            tt = np.linspace(0, 1, m + 1)[:, None]
            dense.append(Pp[k] + tt * (Pp[k + 1] - Pp[k]))
    dense = np.concatenate(dense) * U
    grid = {}
    for x, y in dense:
        grid.setdefault((int(x) >> 2, int(y) >> 2), []).append((x, y))
    def dist(p):
        gx, gy = int(p[0]) >> 2, int(p[1]) >> 2
        best = 1e9
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for q in grid.get((gx + i, gy + j), ()):
                    d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
                    if d < best:
                        best = d
        return math.sqrt(best)
    ds = np.array([dist(p) for R in ref for p in (R * U)[::4]])
    fl = fills(img, alpha, a.fk, a.farea, a.feps, U) if a.fk else []
    stats = {'width': W, 'height': H, 'chains': len(todo), 'curves': len(curves), 'by_layer': count, 'by_form': by_form, 'fills': len(fl),
             'fill_vertices': sum(len(f['pts']) for f in fl), 'length_px': round(total), 'tol_px': a.tol, 'ftol_px': a.ftol,
             'err_mean_px': round(float(ds.mean()), 3), 'err_p95_px': round(float(np.percentile(ds, 95)), 3), 'err_max_px': round(float(ds.max()), 3), 'unit_px': U}
    json.dump({'name': a.name, 'stats': stats, 'curves': curves, 'fills': fl}, open(a.out, 'w'), ensure_ascii=False)
    cv2.imwrite(a.out.replace('.json', '-src.png'), img)
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == '__main__':
    main()
