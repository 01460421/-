#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
甩蔥影片 / Leek-spinning video generator.

Draws every frame from scratch with PIL (vector-style polygons on a
supersampled canvas), synthesises a chiptune polka soundtrack with numpy,
then muxes both into an MP4 + a looping GIF with ffmpeg.

    python3 render.py            # full render
    python3 render.py --frame 20 # single preview frame -> preview.png

The character is an original chibi design (teal twintails, detached
sleeves) drawn entirely in code -- inspired by the classic leek-spinning
meme, not traced from any existing artwork. The music is an original
polka written for this clip.
"""

import argparse
import math
import os
import shutil
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- config ---
W, H = 1280, 720          # output resolution
FPS = 30
SS = 2                    # supersample factor for anti-aliasing
BPM = 150.0
BEAT = 60.0 / BPM         # 0.4 s
BARS = 12
DUR = BARS * 4 * BEAT     # 19.2 s -> 576 frames
SR = 44100                # audio sample rate

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(HERE, "_frames")

# ---------------------------------------------------------------- palette --
LINE     = (38, 30, 48)
HAIR     = (64, 216, 202)
HAIR_DK  = (32, 154, 150)
HAIR_LT  = (158, 246, 238)
SKIN     = (255, 227, 208)
SKIN_SH  = (243, 191, 174)
BLUSH    = (255, 150, 152)
CLOTH    = (52, 56, 70)
CLOTH_LT = (78, 84, 102)
CLOTH_DK = (34, 37, 48)
TEAL     = (72, 226, 212)
TEAL_DK  = (26, 140, 138)
BOOT     = (36, 38, 50)
EYE_D    = (26, 120, 124)
EYE_L    = (86, 232, 220)
MOUTH    = (128, 46, 62)
TONGUE   = (226, 118, 130)
LEEK_W   = (246, 251, 240)
LEEK_WS  = (214, 228, 206)
LEEK_G1  = (126, 204, 74)
LEEK_G2  = (82, 164, 44)
LEEK_G3  = (58, 124, 34)
BG_TOP   = (18, 52, 70)
BG_BOT   = (7, 18, 30)
BURST    = (26, 72, 92)
GLOW     = (46, 150, 160)


# ------------------------------------------------------------- geometry ----
def tf_maker(ox, oy, ang=0.0, sx=1.0, sy=1.0):
    """Local -> world transform: scale, then rotate, then translate."""
    ca, sa = math.cos(ang), math.sin(ang)

    def tf(pts):
        out = []
        for x, y in pts:
            x, y = x * sx, y * sy
            out.append((ox + x * ca - y * sa, oy + x * sa + y * ca))
        return out
    return tf


def ell(cx, cy, rx, ry, n=72, ang=0.0):
    """Ellipse as a polygon so it can be transformed like any other shape."""
    ca, sa = math.cos(ang), math.sin(ang)
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x, y = rx * math.cos(a), ry * math.sin(a)
        out.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return out


def arc(cx, cy, rx, ry, a0, a1, n=32):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / (n - 1)),
             cy + ry * math.sin(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]


def cr(pts, samples=14):
    """Catmull-Rom spline through the control points."""
    if len(pts) < 3:
        return list(pts)
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(len(P) - 3):
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            out.append((
                0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)))
    out.append(pts[-1])
    return out


def ribbon(center, widths):
    """Thick tapered band around a centreline -> closed polygon."""
    n = len(center)
    left, right = [], []
    for i, (x, y) in enumerate(center):
        if i == 0:
            dx, dy = center[1][0] - x, center[1][1] - y
        elif i == n - 1:
            dx, dy = x - center[-2][0], y - center[-2][1]
        else:
            dx = center[i + 1][0] - center[i - 1][0]
            dy = center[i + 1][1] - center[i - 1][1]
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L, dx / L
        hw = widths[i]
        left.append((x + nx * hw, y + ny * hw))
        right.append((x - nx * hw, y - ny * hw))
    return left + right[::-1]


def taper(n, w0, w1, power=1.0):
    return [w0 + (w1 - w0) * (i / (n - 1)) ** power for i in range(n)]


# ---------------------------------------------------------------- canvas ---
class Canvas:
    def __init__(self, base=None):
        if base is None:
            self.im = Image.new("RGB", (W * SS, H * SS), BG_BOT)
        else:
            self.im = base
        self.d = ImageDraw.Draw(self.im, "RGBA")

    def _s(self, pts):
        return [(x * SS, y * SS) for x, y in pts]

    def poly(self, pts, fill=None, outline=None, w=3.0):
        if fill is not None:
            self.d.polygon(self._s(pts), fill=fill)
        if outline is not None:
            self.stroke(pts, outline, w, closed=True)

    def stroke(self, pts, color, w, closed=False):
        p = self._s(pts)
        if closed:
            p = p + [p[0]]
        wpx = max(1, int(round(w * SS)))
        self.d.line(p, fill=color, width=wpx, joint="curve")
        r = wpx / 2.0
        for x, y in (p[0], p[-1]):
            self.d.ellipse([x - r, y - r, x + r, y + r], fill=color)

    def circle(self, cx, cy, r, fill=None, outline=None, w=3.0):
        self.poly(ell(cx, cy, r, r), fill, outline, w)

    def soft(self, cx, cy, rx, ry, color, alpha, layers=7):
        """Cheap soft-edged blob: nested ellipses with additive alpha."""
        for i in range(layers):
            k = 1.0 - i / layers
            a = int(alpha * (1.0 - k) ** 1.4) + 2
            self.d.polygon(self._s(ell(cx, cy, rx * k, ry * k)),
                           fill=color + (min(255, a),))


# ------------------------------------------------------------ the leek -----
GRIP = 104   # how far up the shaft the hand holds it


def draw_leek(c, ox, oy, ang, scale=1.0):
    """Spring onion, local origin = the grip, stalk pointing up (-y)."""
    _tf = tf_maker(ox, oy, ang, scale, scale)
    tf = lambda pts: _tf([(x, y - GRIP) for x, y in pts])

    # --- white shaft ---------------------------------------------------
    shaft = [(0, 148), (1, 100), (0, 40), (-1, -6)]
    sc = cr(shaft, 10)
    c.poly(tf(ribbon(sc, taper(len(sc), 15, 20, 0.8))), LEEK_W, LINE, 3.0)
    # shading on the right side of the shaft
    sh = [(6, 140), (7, 90), (6, 30), (5, -4)]
    shc = cr(sh, 8)
    c.poly(tf(ribbon(shc, taper(len(shc), 6, 8))), LEEK_WS)

    # --- roots ---------------------------------------------------------
    for i in range(7):
        a = -1.1 + 2.2 * i / 6
        L = 26 + 10 * math.cos(a * 1.4)
        rp = cr([(0, 140), (a * 9, 152), (a * 15, 140 + L)], 6)
        c.stroke(tf(rp), LEEK_WS, 3.0)

    # --- pale green transition ----------------------------------------
    tr = cr([(-1, 4), (-1, -14), (-2, -34)], 8)
    c.poly(tf(ribbon(tr, taper(len(tr), 20, 19))), (196, 226, 150), LINE, 3.0)

    # --- three leaves ---------------------------------------------------
    leaves = [
        ([(-2, -20), (-8, -80), (-26, -136), (-52, -178)], 19, 3, LEEK_G2),
        ([(-1, -22), (2, -92), (6, -156), (2, -212)], 20, 3, LEEK_G1),
        ([(0, -18), (10, -74), (30, -124), (58, -158)], 18, 3, LEEK_G3),
    ]
    for ctrl, w0, w1, col in leaves:
        p = cr(ctrl, 14)
        c.poly(tf(ribbon(p, taper(len(p), w0, w1, 1.25))), col, LINE, 3.0)
    # highlight down the middle leaf
    hp = cr([(1, -34), (4, -96), (7, -150)], 8)
    c.poly(tf(ribbon(hp, taper(len(hp), 5, 2))), (166, 232, 110))


# --------------------------------------------------------------- head ------
HEAD_SC = 0.92


def draw_head(c, ox, oy, ang, blink, mouth, squash):
    tf = tf_maker(ox, oy, ang, HEAD_SC, HEAD_SC * squash)

    # back hair mass
    c.poly(tf(ell(0, -2, 124, 122)), HAIR_DK, LINE, 3.5)

    # face
    c.poly(tf(cr([(-98, -20), (-94, 40), (-56, 90), (0, 106),
                  (56, 90), (94, 40), (98, -20), (0, -54)], 12)),
           SKIN, LINE, 3.5)
    # ears
    for s in (-1, 1):
        c.poly(tf(ell(s * 95, 26, 14, 22)), SKIN, LINE, 3.0)

    # ---- eyes ----------------------------------------------------------
    for s in (-1, 1):
        ex, ey = s * 48, 30
        if blink < 0.14:
            lid = cr([(ex - 30, ey - 4), (ex, ey + 8), (ex + 30, ey - 4)], 8)
            c.stroke(tf(lid), LINE, 5.0)
            continue
        k = blink
        eye = lambda cx, cy, rx, ry: tf(ell(cx, ey + (cy - ey) * k, rx, ry * k))
        c.poly(eye(ex, ey, 31, 37), (255, 255, 255), None)
        c.poly(eye(ex + s * 2, ey + 3, 25, 31), EYE_D)
        c.poly(eye(ex + s * 2, ey + 10, 22, 22), EYE_L)
        c.poly(eye(ex + s * 2, ey + 4, 13, 17), (30, 34, 52))
        c.poly(eye(ex - s * 10, ey - 13, 9, 10), (255, 255, 255))
        c.poly(eye(ex + s * 12, ey + 16, 5, 5), (255, 255, 255))
        # upper lash line
        lash = cr([(ex - 33, ey - 16), (ex, ey - 35 * k - 3), (ex + 33, ey - 16)], 10)
        c.stroke(tf(lash), LINE, 7.0)
        c.stroke(tf([(ex + s * 33, ey - 16), (ex + s * 46, ey - 27)]), LINE, 5.0)

    # ---- blush ---------------------------------------------------------
    for s in (-1, 1):
        px, py = tf([(s * 72, 62)])[0]
        c.soft(px, py, 21, 12, BLUSH, 150)

    # ---- mouth ---------------------------------------------------------
    if mouth > 0.12:
        mh = 5 + 17 * mouth
        c.poly(tf(ell(0, 76 + mh * 0.3, 15 + 4 * mouth, mh)), MOUTH, LINE, 3.0)
        c.poly(tf(ell(0, 76 + mh * 0.9, 10, mh * 0.42)), TONGUE)
    else:
        c.stroke(tf(cr([(-11, 74), (0, 82), (11, 74)], 8)), LINE, 4.0)

    # ---- bangs (arc over the top, spiky fringe along the bottom) --------
    bang = arc(0, -18, 126, 118, math.pi + 0.04, 2 * math.pi - 0.04, 30)
    bang += [(118, 18), (92, -14), (64, 26), (34, -10), (4, 30),
             (-26, -12), (-56, 24), (-88, -14), (-116, 16)]
    c.poly(tf(bang), HAIR, LINE, 3.5)
    # highlight streak across the fringe
    hl = arc(0, -22, 98, 88, math.radians(-158), math.radians(-28), 22)
    c.poly(tf(ribbon(hl, [4 + 8 * math.sin(math.pi * i / (len(hl) - 1))
                          for i in range(len(hl))])), HAIR_LT)

    # ---- brows (sit over the fringe, keeps the face readable) ----------
    for s in (-1, 1):
        ex, ey = s * 48, 30
        br = cr([(ex - 23, ey - 48), (ex, ey - 56), (ex + 23, ey - 49)], 8)
        c.stroke(tf(br), HAIR_DK, 4.0)

    # ---- side locks -----------------------------------------------------
    for s in (-1, 1):
        p = cr([(s * 102, -30), (s * 110, 30), (s * 98, 98), (s * 86, 142)], 10)
        c.poly(tf(ribbon(p, taper(len(p), 17, 3, 1.35))), HAIR, LINE, 3.0)


def draw_tail(c, ox, oy, side, swing, tie_col=TEAL):
    """One twintail: hangs from the side of the head, whips with `swing`."""
    s = side
    ctrl = [(0, 0)]
    seg = [(34, 46), (52, 116), (44, 196), (16, 262), (-18, 312)]
    for i, (dx, dy) in enumerate(seg):
        k = (i + 1) / len(seg)
        # the further down the tail, the more it lags and whips
        w = swing * (k ** 1.35)
        x = dx + w * 92 * k
        y = dy - abs(w) * 26 * k
        ctrl.append((x, y))
    ctrl = [(ox + s * x, oy + y) for x, y in ctrl]
    p = cr(ctrl, 14)
    c.poly(ribbon(p, taper(len(p), 30, 5, 1.15)), HAIR, LINE, 3.5)
    # inner shade + highlight
    hl = [(x + s * 6, y) for x, y in p[: int(len(p) * 0.55)]]
    c.poly(ribbon(hl, taper(len(hl), 9, 3)), HAIR_LT)
    sh = [(x - s * 12, y) for x, y in p[int(len(p) * 0.3):]]
    c.poly(ribbon(sh, taper(len(sh), 7, 2)), HAIR_DK)
    # hair tie
    t0, t1 = p[3], p[6]
    c.poly(ribbon([t0, t1], [17, 16]), tie_col, LINE, 3.0)


# --------------------------------------------------------------- body ------
def draw_arm(c, sx, sy, a1, a2, upper=70, fore=66):
    """One continuous shoulder-elbow-wrist limb + detached sleeve. -> hand."""
    ex, ey = sx + math.cos(a1) * upper, sy + math.sin(a1) * upper
    hx, hy = ex + math.cos(a2) * fore, ey + math.sin(a2) * fore
    path = cr([(sx, sy), (ex, ey), (hx, hy)], 14)
    c.poly(ribbon(path, taper(len(path), 17, 13)), SKIN, LINE, 3.0)
    # detached sleeve covering the forearm
    sl = path[int(len(path) * 0.44):]
    c.poly(ribbon(sl, taper(len(sl), 20, 17)), CLOTH_LT, LINE, 3.0)
    band = sl[:max(3, int(len(sl) * 0.22))]
    c.poly(ribbon(band, [20] * len(band)), TEAL, LINE, 2.5)
    c.circle(hx, hy, 15, SKIN, LINE, 3.0)
    return hx, hy


BODY_SC = 1.15


def draw_body(c, cx, cy, lean, arm_sw):
    """cy = neck base. Draws legs, torso and both arms; returns the leek hand."""
    tf = tf_maker(cx, cy, lean, BODY_SC, BODY_SC)

    # thighs / boots
    for s in (-1, 1):
        p = cr([(s * 21, 112), (s * 27, 152), (s * 26, 188)], 10)
        c.poly(tf(ribbon(p, taper(len(p), 21, 17))), BOOT, LINE, 3.0)
        c.poly(tf(ribbon(p[3:7], [21] * 4)), TEAL_DK)
        c.poly(tf(ell(s * 27, 192, 25, 13)), BOOT, LINE, 3.0)

    # neck (tucks behind the collar and the chin)
    c.poly(tf([(-16, -34), (16, -34), (14, 4), (-14, 4)]), SKIN_SH, LINE, 3.0)

    # skirt
    skirt = cr([(-42, 68), (-70, 104), (-62, 122), (0, 128),
                (62, 122), (70, 104), (42, 68)], 10)
    c.poly(tf(skirt), CLOTH, LINE, 3.5)
    hem = cr([(-66, 112), (0, 128), (66, 112)], 10)
    c.poly(tf(ribbon(hem, [5] * len(hem))), TEAL_DK)
    for s in (-2, -1, 0, 1, 2):
        c.stroke(tf([(s * 20, 74), (s * 27, 118)]), CLOTH_DK, 2.5)

    # torso: rounded, tapered, sleeveless
    body = cr([(-50, -4), (-47, 34), (-43, 62), (0, 74),
               (43, 62), (47, 34), (50, -4), (0, -16)], 12)
    c.poly(tf(body), CLOTH, LINE, 3.5)
    c.poly(tf(cr([(-50, -4), (0, -16), (50, -4), (40, 22), (0, 30), (-40, 22)], 10)),
           CLOTH_DK)
    # collar + tie
    c.poly(tf([(-28, -8), (0, 22), (28, -8), (15, -16), (0, 0), (-15, -16)]),
           (238, 242, 248), LINE, 3.0)
    c.poly(tf([(-10, 12), (10, 12), (13, 25), (-13, 25)]), TEAL, LINE, 2.5)
    c.poly(tf([(-12, 25), (12, 25), (8, 64), (-8, 64)]), TEAL, LINE, 2.5)

    # arms: her right arm (screen-left) holds the leek high and clear of the head
    sh_l = tf([(-46, 6)])[0]
    sh_r = tf([(46, 6)])[0]
    a1 = math.radians(-158 + 11 * arm_sw)
    a2 = a1 + math.radians(42 + 20 * arm_sw)
    hand = draw_arm(c, sh_l[0], sh_l[1], a1, a2, 76, 72)
    wrist = a2
    # her left arm rests low and swings a little
    b1 = math.radians(76 - 15 * arm_sw)
    b2 = b1 + math.radians(18 + 14 * arm_sw)
    draw_arm(c, sh_r[0], sh_r[1], b1, b2, 66, 62)
    return hand, wrist


# ---------------------------------------------------------- background ----
def make_bg():
    y = np.linspace(0.0, 1.0, H * SS, dtype=np.float32)[:, None]
    top = np.array(BG_TOP, dtype=np.float32)
    bot = np.array(BG_BOT, dtype=np.float32)
    grad = top[None, None, :] * (1 - y[..., None]) + bot[None, None, :] * y[..., None]
    grad = np.repeat(grad, W * SS, axis=1)
    return Image.fromarray(grad.astype(np.uint8), "RGB")


BG_BASE = None


def draw_bg(c, t, beat, bounce):
    cx, cy = W / 2, 400.0
    # rotating sunburst -- one wedge period per 2 beats so the loop is seamless
    wedges = 16
    step = 2 * math.pi / wedges
    a0 = step * (t / (2 * BEAT))
    R = 1500
    for i in range(wedges // 2):
        a = a0 + i * step * 2
        c.d.polygon(c._s([(cx, cy),
                          (cx + R * math.cos(a), cy + R * math.sin(a)),
                          (cx + R * math.cos(a + step), cy + R * math.sin(a + step))]),
                    fill=BURST + (255,))
    # glow behind the character
    c.soft(CX, 400, 330 + 16 * bounce, 300 + 14 * bounce, GLOW, 120, 9)

    # floating leek silhouettes
    for i in range(7):
        ph = (t / (8 * BEAT) + i / 7.0) % 1.0
        bx = 90 + (i * 197 % 1100)
        by = 760 - ph * 900
        sw = math.sin(2 * math.pi * t / (8 * BEAT) + i) * 0.5
        draw_leek_ghost(c, bx, by, sw, 0.34 + 0.05 * (i % 3))
    # sparkle notes on the beat
    for i in range(9):
        ph = (t / (4 * BEAT) + i / 9.0) % 1.0
        nx = 60 + (i * 311 % 1160) + 30 * math.sin(2 * math.pi * t / (4 * BEAT) + i)
        ny = 700 - ph * 820
        a = int(150 * math.sin(math.pi * ph))
        if a > 6:
            note(c, nx, ny, 15 + 4 * (i % 2), (120, 236, 226, a))


def draw_leek_ghost(c, x, y, ang, sc):
    col = (30, 92, 108, 120)
    tf = tf_maker(x, y, ang, sc, sc)
    p = cr([(0, 150), (0, 0), (-2, -30)], 8)
    c.d.polygon(c._s(tf(ribbon(p, taper(len(p), 16, 20)))), fill=col)
    for ctrl in ([(-2, -20), (-26, -130), (-52, -178)],
                 [(0, -22), (6, -150), (2, -212)],
                 [(0, -18), (30, -122), (58, -158)]):
        q = cr(ctrl, 10)
        c.d.polygon(c._s(tf(ribbon(q, taper(len(q), 18, 3, 1.25)))), fill=col)


def note(c, x, y, s, col):
    c.d.polygon(c._s(ell(x, y, s * 0.62, s * 0.46, 24, -0.35)), fill=col)
    c.d.polygon(c._s([(x + s * 0.5, y - s * 0.2), (x + s * 0.5 + s * 0.16, y - s * 0.2),
                      (x + s * 0.5 + s * 0.16, y - s * 2.0), (x + s * 0.5, y - s * 2.0)]),
                fill=col)
    c.d.polygon(c._s([(x + s * 0.66, y - s * 2.0), (x + s * 1.5, y - s * 1.5),
                      (x + s * 1.5, y - s * 1.0), (x + s * 0.66, y - s * 1.35)]),
                fill=col)


def draw_stage(c, bounce):
    c.soft(CX, 662, 235 - 20 * bounce, 34 - 4 * bounce, (0, 0, 0), 130, 8)
    c.d.rectangle([0, 668 * SS, W * SS, H * SS], fill=(10, 26, 38, 255))
    c.d.line([(0, 668 * SS), (W * SS, 668 * SS)], fill=TEAL_DK + (150,), width=3 * SS)


# ---------------------------------------------------------------- title ----
CX = 665.0        # character centre (leans right; the leek swings out left)
_FONTS = {}


def fonts():
    if not _FONTS:
        _FONTS["cjk"] = ImageFont.truetype(
            "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", int(78 * SS))
        _FONTS["lat"] = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(21 * SS))
    return _FONTS


def draw_title(c, bounce):
    f = fonts()
    right, base = 1222.0, 534.0 - 4 * bounce
    txt = "甩蔥歌"
    wpx = c.d.textlength(txt, font=f["cjk"]) / SS
    x, y = right - wpx, base
    c.d.text(((x + 5) * SS, (y + 6) * SS), txt, font=f["cjk"], fill=TEAL_DK + (200,))
    c.d.text((x * SS, y * SS), txt, font=f["cjk"], fill=(255, 255, 255, 255),
             stroke_width=int(5 * SS), stroke_fill=LINE)
    # letter-spaced subtitle
    sub, sp = "LEEK  SPIN", 4.0
    total = sum(c.d.textlength(ch, font=f["lat"]) / SS + sp for ch in sub) - sp
    sx, sy = right - total, base + 92
    for ch in sub:
        c.d.text((sx * SS, sy * SS), ch, font=f["lat"], fill=TEAL + (255,),
                 stroke_width=int(3 * SS), stroke_fill=LINE)
        sx += c.d.textlength(ch, font=f["lat"]) / SS + sp


# ---------------------------------------------------------------- frame ----
def render_frame(f):
    t = f / FPS
    b = t / BEAT
    ph = math.pi * b
    sway = math.sin(ph)                 # 2-beat period
    bounce = abs(math.sin(math.pi * b))  # 1-beat period, 0 on the beat
    squash = 1.0 - 0.035 * (1.0 - bounce)

    # blinks: scheduled inside the loop, away from the seam
    blink = 1.0
    for bt in (7.0, 19.4, 31.0, 43.5):
        d = abs(b - bt)
        if d < 0.42:
            blink = min(blink, abs(d / 0.42) ** 0.7)

    mouth = 0.5 + 0.5 * math.sin(2 * math.pi * b - 1.2)
    mouth = mouth ** 1.6

    lean = math.radians(5.5 * sway)
    head_ang = math.radians(11 * sway)
    base_y = 436 - 14 * bounce
    hx = CX + 10 * sway
    hy = base_y - 132 - 6 * bounce

    c = Canvas(BG_BASE.copy())
    draw_bg(c, t, b, bounce)
    draw_stage(c, bounce)

    # twintails sit behind the body, and lag behind the head
    lag = math.sin(ph - 1.15)
    for side in (-1, 1):
        draw_tail(c, hx + side * 88, hy + 2, side, lag * (1.0 if side > 0 else 0.86))

    hand, wrist = draw_body(c, CX, base_y, lean, sway)
    draw_head(c, hx, hy, head_ang, blink, mouth, squash)

    # the leek, gripped in the raised hand, whipping side to side
    leek_ang = math.radians(-8 + 36 * math.sin(ph + 0.42) + 6 * math.sin(3 * ph))
    draw_leek(c, hand[0], hand[1], leek_ang, 0.95)
    # fist closed around the shaft
    fa = leek_ang + math.pi / 2
    c.poly(ell(hand[0], hand[1], 23, 17, 40, fa), SKIN, LINE, 3.0)
    for k in (-0.42, 0.0, 0.42):
        o = (hand[0] + math.cos(fa) * 23 * k, hand[1] + math.sin(fa) * 23 * k)
        c.stroke([(o[0] - math.cos(leek_ang - math.pi / 2) * 9,
                   o[1] - math.sin(leek_ang - math.pi / 2) * 9),
                  (o[0] + math.cos(leek_ang - math.pi / 2) * 9,
                   o[1] + math.sin(leek_ang - math.pi / 2) * 9)], SKIN_SH, 2.5)

    # foreground sparkles pop on each beat
    for i in range(6):
        k = (b + i * 0.37) % 1.0
        if k < 0.5:
            a = int(220 * math.sin(math.pi * k * 2))
            sx = 120 + (i * 421 % 1040)
            sy = 180 + (i * 233 % 420)
            s = (7 + 5 * math.sin(i * 2.1)) * (0.4 + math.sin(math.pi * k * 2))
            c.d.polygon(c._s([(sx, sy - s * 2.4), (sx + s * 0.6, sy - s * 0.6),
                              (sx + s * 2.4, sy), (sx + s * 0.6, sy + s * 0.6),
                              (sx, sy + s * 2.4), (sx - s * 0.6, sy + s * 0.6),
                              (sx - s * 2.4, sy), (sx - s * 0.6, sy - s * 0.6)]),
                        fill=(210, 255, 250, a))

    draw_title(c, bounce)
    return c.im.resize((W, H), Image.LANCZOS)


# ---------------------------------------------------------------- audio ----
def adsr(n, a, d, s, r):
    env = np.zeros(n, dtype=np.float32)
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    a, d = max(1, min(a, n)), max(1, d)
    env[:a] = np.linspace(0, 1, a, dtype=np.float32)
    e = min(n, a + d)
    if e > a:
        env[a:e] = np.linspace(1, s, e - a, dtype=np.float32)
    if n > e:
        env[e:] = s
    if r and n > r:
        env[n - r:] *= np.linspace(1, 0, r, dtype=np.float32)
    return env


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def square(f, n, duty=0.5, detune=0.0):
    t = np.arange(n, dtype=np.float32) / SR
    vib = 1.0 + 0.004 * np.sin(2 * np.pi * 5.5 * t)
    ph = np.cumsum(f * vib * (1 + detune) / SR)
    return np.where((ph % 1.0) < duty, 1.0, -1.0).astype(np.float32)


def triangle(f, n):
    t = np.arange(n, dtype=np.float32) / SR
    ph = (f * t) % 1.0
    return (4 * np.abs(ph - 0.5) - 1).astype(np.float32)


def build_audio():
    total = int(DUR * SR) + SR // 2
    buf = np.zeros(total, dtype=np.float32)

    def put(sig, at):
        i = int(at * SR)
        j = min(total, i + len(sig))
        if j > i:
            buf[i:j] += sig[:j - i]

    # ---- harmony ------------------------------------------------------
    # 12 bars: Am Am Dm E  Am Am E Am  C G Dm E
    chords = [(57, [57, 60, 64]), (57, [57, 60, 64]), (62, [62, 65, 69]),
              (52, [64, 68, 71]), (57, [57, 60, 64]), (57, [57, 60, 64]),
              (52, [64, 68, 71]), (57, [57, 60, 64]), (48, [60, 64, 67]),
              (55, [59, 62, 67]), (62, [62, 65, 69]), (52, [64, 68, 71])]

    # ---- melody: 8 eighth notes per bar --------------------------------
    R = None
    mel = [
        [69, 69, 72, 76, 76, 74, 72, 69],
        [72, 76, 81, 76, 72, 76, 72, 69],
        [74, 74, 77, 81, 81, 79, 77, 74],
        [76, 76, 80, 83, 83, 80, 76, 71],
        [81, 81, 79, 77, 76, 74, 72, 71],
        [69, 72, 76, 72, 69, 72, 76, 81],
        [80, 80, 83, 80, 76, 80, 76, 71],
        [69, 69, R, 69, 72, 76, 81, R],
        [72, 76, 79, 84, 84, 79, 76, 79],
        [83, 79, 74, 79, 83, 79, 74, 71],
        [74, 77, 81, 86, 86, 81, 77, 74],
        [76, 80, 83, 80, 76, 71, 68, R],
    ]

    eighth = BEAT / 2
    for bar in range(BARS):
        root, tri = chords[bar]
        bt = bar * 4 * BEAT

        # oom-pah bass: root/fifth on 1 & 3, chord stabs on 2 & 4
        for beat in range(4):
            at = bt + beat * BEAT
            if beat % 2 == 0:
                m = root if beat == 0 else root + 7
                n = int(BEAT * 0.85 * SR)
                sig = (triangle(hz(m - 12), n) * 0.55
                       + square(np.full(n, hz(m - 12), np.float32), n, 0.5) * 0.16)
                put(sig * adsr(n, 0.004, 0.09, 0.55, 0.05) * 0.62, at)
            else:
                n = int(BEAT * 0.34 * SR)
                stab = np.zeros(n, dtype=np.float32)
                for m in tri:
                    stab += square(np.full(n, hz(m), np.float32), n, 0.5)
                put(stab / len(tri) * adsr(n, 0.004, 0.06, 0.25, 0.05) * 0.3, at)

        # drums
        for beat in range(4):
            at = bt + beat * BEAT
            if beat % 2 == 0:                      # kick
                n = int(0.16 * SR)
                tt = np.arange(n, dtype=np.float32) / SR
                f = 118 * np.exp(-tt * 26) + 44
                put(np.sin(2 * np.pi * np.cumsum(f) / SR)
                    * np.exp(-tt * 19) * 0.72, at)
            else:                                  # snare
                n = int(0.13 * SR)
                tt = np.arange(n, dtype=np.float32) / SR
                nz = np.random.RandomState(bar * 4 + beat).randn(n).astype(np.float32)
                nz = nz - np.concatenate([[0], nz[:-1]])       # crude high-pass
                put(nz * np.exp(-tt * 30) * 0.2, at)
            for half in (0, 1):                    # hats on every eighth
                n = int(0.05 * SR)
                tt = np.arange(n, dtype=np.float32) / SR
                nz = np.random.RandomState(bar * 8 + beat * 2 + half).randn(n)
                nz = (nz - np.concatenate([[0], nz[:-1]])).astype(np.float32)
                put(nz * np.exp(-tt * 90) * (0.075 if half else 0.11),
                    at + half * eighth)

        # melody + a third below
        for i, m in enumerate(mel[bar]):
            if m is None:
                continue
            at = bt + i * eighth
            n = int(eighth * 0.82 * SR)
            f = np.full(n, hz(m), dtype=np.float32)
            lead = (square(f, n, 0.32) * 0.5
                    + square(f, n, 0.5, detune=0.006) * 0.28)
            harm = square(np.full(n, hz(m - 5), np.float32), n, 0.25) * 0.16
            put((lead + harm) * adsr(n, 0.005, 0.07, 0.62, 0.03) * 0.34, at)

    # slap-back echo for a bit of room
    d = int(0.14 * SR)
    echo = np.zeros_like(buf)
    echo[d:] = buf[:-d] * 0.2
    buf += echo

    buf = np.tanh(buf * 1.25)
    buf /= max(1e-6, np.abs(buf).max())
    buf *= 0.92
    buf = buf[:int(DUR * SR)]
    # tiny fade so the loop point never clicks
    fade = int(0.006 * SR)
    buf[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
    buf[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)

    path = os.path.join(HERE, "_audio.wav")
    pcm = (buf * 32767).astype("<i2")
    stereo = np.repeat(pcm[:, None], 2, axis=1).tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(stereo)
    return path


# ----------------------------------------------------------------- main ----
def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def main():
    global BG_BASE
    ap = argparse.ArgumentParser()
    ap.add_argument("--frame", type=int, default=None)
    ap.add_argument("--frames-only", action="store_true")
    args = ap.parse_args()

    BG_BASE = make_bg()

    if args.frame is not None:
        render_frame(args.frame).save(os.path.join(HERE, "preview.png"))
        print("wrote preview.png")
        return

    if os.path.isdir(FRAMES):
        shutil.rmtree(FRAMES)
    os.makedirs(FRAMES)

    n = int(round(DUR * FPS))
    for f in range(n):
        render_frame(f).save(os.path.join(FRAMES, "%05d.png" % f))
        if f % 30 == 0:
            print("frame %d/%d" % (f, n), flush=True)
    print("frames done")

    if args.frames_only:
        return

    wav = build_audio()
    ff = ffmpeg_exe()
    mp4 = os.path.join(HERE, "miku-leek.mp4")
    subprocess.run([ff, "-y", "-loglevel", "error",
                    "-framerate", str(FPS), "-i", os.path.join(FRAMES, "%05d.png"),
                    "-i", wav,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    "-c:a", "aac", "-b:a", "160k", "-shortest", mp4], check=True)

    # a two-bar GIF loops perfectly and stays small enough to embed
    gif = os.path.join(HERE, "miku-leek.gif")
    pal = os.path.join(HERE, "_pal.png")
    seg = ["-t", str(8 * BEAT)]
    scl = "fps=12.5,scale=360:-1:flags=lanczos"
    subprocess.run([ff, "-y", "-loglevel", "error",
                    "-framerate", str(FPS), "-i", os.path.join(FRAMES, "%05d.png"),
                    *seg, "-vf", scl + ",palettegen=max_colors=64", pal], check=True)
    subprocess.run([ff, "-y", "-loglevel", "error",
                    "-framerate", str(FPS), "-i", os.path.join(FRAMES, "%05d.png"),
                    *seg, "-i", pal,
                    "-lavfi", scl + "[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4",
                    "-loop", "0", gif], check=True)
    os.remove(pal)
    print("mp4:", os.path.getsize(mp4), "gif:", os.path.getsize(gif))


if __name__ == "__main__":
    main()
