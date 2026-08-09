"""The leek-spinning scene: an original chibi vocaloid-style character.

All artwork here is drawn from scratch with primitives (no traced or copied
source images). Geometry lives in a virtual 1000x1000 space, y down, with the
character standing on a ground line at y=940.
"""

import math

from PIL import Image, ImageFilter

from vector import Pen, oval, ribbon, smooth, translate

# ---------------------------------------------------------------- palette ---
INK        = (26, 58, 64, 255)      # outline
HAIR       = (86, 216, 208, 255)
HAIR_DK    = (44, 165, 160, 255)
HAIR_LT    = (162, 240, 233, 255)
SKIN       = (255, 229, 214, 255)
CLOTH      = (48, 54, 68, 255)
CLOTH_LT   = (70, 78, 96, 255)
TRIM       = (76, 208, 199, 255)
TIE        = (46, 152, 190, 255)
EYE_DK     = (20, 116, 124, 255)
EYE_MD     = (44, 178, 178, 255)
EYE_LT     = (146, 234, 228, 255)
MOUTH      = (150, 62, 70, 255)
TONGUE     = (228, 126, 132, 255)
BLUSH      = (255, 146, 150, 135)
LEEK_W     = (248, 253, 245, 255)
LEEK_G1    = (188, 226, 140, 255)
LEEK_G2    = (118, 194, 88, 255)
LEEK_G3    = (72, 156, 66, 255)
SKY_TOP    = (214, 248, 246)
SKY_BOT    = (144, 224, 224)
RAY        = (255, 255, 255, 58)

GROUND = 940.0
CX = 500.0
HEAD_Y = 388.0
PIVOT = (CX, 560.0)          # neck: head + hair rotate about this
ZOOM = 1.16                  # character scale about the ground point


# ------------------------------------------------------------- background ---
_GRAD_CACHE = {}


def _gradient(w, h):
    strip = Image.new("RGB", (1, h))
    for y in range(h):
        f = y / max(1, h - 1)
        strip.putpixel((0, y), tuple(int(a + (b - a) * f) for a, b in zip(SKY_TOP, SKY_BOT)))
    return strip.resize((w, h), Image.BILINEAR).convert("RGBA")


def background(size, ss, aspect, t, beat, loop):
    h = size * ss
    w = int(round(h * aspect))
    grad = _GRAD_CACHE.get((w, h))
    if grad is None:
        grad = _GRAD_CACHE[(w, h)] = _gradient(w, h)
    pen = Pen(size, ss, aspect, image=grad.copy())
    half = 500.0 * aspect             # visible virtual half-width
    left = CX - half
    reach = 2.2 * half                # long enough to leave the frame

    # Slow sunburst behind the character, breathing on every beat. The rays
    # repeat every 20 deg, so one loop has to turn a whole multiple of that or
    # the seam jumps: 200 deg over the loop is ten of them.
    pulse = 1.0 + 0.05 * math.cos(math.pi * 2 * beat) ** 2
    for i in range(18):
        a0 = (t / loop) * 200.0 + i * 20.0
        a1 = a0 + 10.0 * pulse
        pts = [(CX, 430)]
        for a in (a0, a1):
            r = math.radians(a)
            pts.append((CX + reach * math.cos(r), 430 + reach * math.sin(r)))
        pen.shape(pts, fill=RAY)

    # expanding rings, one launched per beat
    for k in range(2):
        f = ((beat % 1.0) + k * 0.5) % 1.0
        alpha = int(80 * (1 - f) ** 1.6)
        if alpha > 2:
            rr = 220 + f * 780
            pen.ellipse(CX, 430, rr, rr * 0.82, outline=(255, 255, 255, alpha), width=10)

    # drifting leeks + notes; periods divide the loop length so it seams
    count = 13
    for i in range(count):
        per = loop / 4.0 if i % 2 == 0 else loop / 6.0
        f = ((t / per) + i * 0.1137) % 1.0
        x = left + 40 + ((i * 617) % 1000) / 1000.0 * (2 * half - 80) \
            + 26 * math.sin(2 * math.pi * (f + i * 0.3))
        y = 1060 - f * 1230
        s = 0.5 + 0.22 * math.sin(i * 2.1)
        if abs(x - CX) < 210:         # keep the character silhouette clean
            x += 260 * (1 if x > CX else -1)
        if i % 3 == 2:
            _mini_leek(pen, x, y, s, ang=40 * math.sin(2 * math.pi * f + i))
        else:
            _note(pen, x, y, s, ang=18 * math.sin(2 * math.pi * f + i))
    return pen


def _note(pen, x, y, s, ang=0.0):
    col = (255, 255, 255, 165)
    pen.shape(oval(x, y, 26 * s, 20 * s, rot=-22 + ang), fill=col)
    pen.stroke([(x + 22 * s, y - 6 * s), (x + 26 * s, y - 74 * s)], col, width=9 * s)
    pen.shape([(x + 26 * s, y - 74 * s), (x + 58 * s, y - 56 * s),
               (x + 54 * s, y - 30 * s), (x + 26 * s, y - 48 * s)], fill=col)


def _mini_leek(pen, x, y, s, ang=0.0):
    a = math.radians(ang)
    ca, sa = math.cos(a), math.sin(a)

    def P(dx, dy):
        return (x + dx * s * ca - dy * s * sa, y + dx * s * sa + dy * s * ca)

    pen.shape([P(-11, 46), P(11, 46), P(9, -14), P(-9, -14)], fill=(255, 255, 255, 180))
    for dx in (-18, 0, 18):
        pen.shape([P(dx * 0.4 - 8, -10), P(dx * 0.4 + 8, -10), P(dx, -72)],
                  fill=(196, 238, 166, 175))


# ------------------------------------------------------------------- leek ---
def leek(pen, hx, hy):
    """Draw the negi upright with the grip point at (hx, hy)."""
    up, dn, w = 178.0, 104.0, 36.0

    pen.shape([(hx - w, hy + dn), (hx + w, hy + dn), (hx + w * 0.9, hy - up),
               (hx - w * 0.9, hy - up)], fill=LEEK_W, outline=INK, width=7)
    for dx in (-14, 0, 14):
        pen.stroke([(hx + dx * 0.6, hy + dn - 6), (hx + dx, hy + dn + 28)],
                   (236, 243, 232, 255), width=6)
    # white-to-green transition
    pen.shape([(hx - w * 0.9, hy - up), (hx + w * 0.9, hy - up),
               (hx + w * 0.84, hy - up - 46), (hx - w * 0.84, hy - up - 46)],
              fill=LEEK_G1, outline=INK, width=7)
    # leaf blades
    top = hy - up - 40
    for lean, rise, col in ((-1.0, -102, LEEK_G3), (0.12, -118, LEEK_G2),
                            (1.0, -96, LEEK_G3)):
        mid = [(hx + lean * 5, top), (hx + lean * 44, top + rise * 0.5),
               (hx + lean * 100, top + rise)]
        pen.shape(ribbon(smooth(mid, closed=False, samples=8), [52, 38, 4]),
                  fill=col, outline=INK, width=6)
    pen.stroke([(hx - 12, hy + dn - 24), (hx - 13, hy - up + 14)],
               (255, 255, 255, 200), width=10)


# --------------------------------------------------------------- body bits ---
def _arm(pen, sh, elbow, hand, w0=54.0, w1=38.0, draw_hand=True):
    """Bare shoulder + skin arm + detached sleeve + teal cuff."""
    pen.circle(sh[0], sh[1], 33, fill=SKIN, outline=INK, width=7)
    line = smooth([sh, elbow, hand], closed=False, samples=10)
    pen.shape(ribbon(line, [w0, (w0 + w1) / 2, w1]), fill=SKIN, outline=INK, width=7)

    seg = line[int(len(line) * 0.24):int(len(line) * 0.88)]
    if len(seg) > 4:
        pen.shape(ribbon(seg, [w0 * 1.08, (w0 + w1) / 2 * 1.12, w1 * 1.14]),
                  fill=CLOTH, outline=INK, width=7)
        pen.shape(ribbon(seg[-5:], [w1 * 1.14, w1 * 1.12]), fill=TRIM)
    if draw_hand:
        pen.circle(hand[0], hand[1], 31, fill=SKIN, outline=INK, width=7)


def free_hand(beat, dy):
    swing = 18 * math.sin(math.pi * 2 * beat)
    return (CX - 232 - swing, 762 + dy)


def leek_hand(beat, dy):
    return (CX + 214, 452 + dy + 11 * math.sin(math.pi * 2 * beat))


def body(pen, beat, bounce, breathe):
    """Legs, arms, skirt and torso. Arms go under the torso so the bare
    shoulders read as shoulders rather than as ball joints."""
    dy = bounce
    step = math.sin(math.pi * 2 * beat)
    wob = 11 * math.sin(math.pi * 2 * beat)

    # legs + boots
    for side in (-1, 1):
        knee = CX + side * 56
        footy = GROUND - 12 * max(0.0, side * step)
        pen.shape(ribbon(smooth([(CX + side * 50, 686 + dy), (knee, 800 + dy * 0.4)],
                                closed=False, samples=8), [64, 56]),
                  fill=SKIN, outline=INK, width=7)
        boot = smooth([(knee, 788), (knee + side * 4, 858), (knee + side * 3, footy - 20)],
                      closed=False, samples=10)
        pen.shape(ribbon(boot, [60, 58, 56]), fill=CLOTH, outline=INK, width=7)
        pen.shape(oval(knee + side * 5, footy - 18, 42, 26), fill=CLOTH, outline=INK, width=7)
        pen.shape(ribbon(boot[:5], [62, 62]), fill=TRIM)
        pen.stroke([(knee - 27, 856), (knee + 27, 856)], TRIM, width=9)

    # both arms, before the torso
    swing = 18 * math.sin(math.pi * 2 * beat)
    _arm(pen, (CX - 98, 590 + dy), (CX - 178 - swing * 0.5, 656 + dy), free_hand(beat, dy))
    _arm(pen, (CX + 98, 590 + dy), (CX + 176, 546 + dy + wob * 0.4),
         leek_hand(beat, dy), draw_hand=False)

    # pleated skirt
    hem = [(CX - 172 + 344 * (i / 8), 766 + dy * 0.7 + (16 if i % 2 else 0)) for i in range(9)]
    pen.shape([(CX - 80, 642 + dy)] + hem + [(CX + 80, 642 + dy)],
              fill=CLOTH, outline=INK, width=7)
    for i in range(1, 8):
        x = CX - 172 + 344 * (i / 8)
        pen.stroke([(CX + (x - CX) * 0.42, 658 + dy), (x, 760 + dy * 0.7)], CLOTH_LT, width=6)
    pen.shape([(CX - 176, 758 + dy * 0.7), (CX + 176, 758 + dy * 0.7),
               (CX + 178, 778 + dy * 0.7), (CX - 178, 778 + dy * 0.7)], fill=TRIM)

    # torso
    w = 1.0 + breathe
    pen.shape([(CX - 98 * w, 578 + dy), (CX - 106 * w, 626 + dy), (CX - 90, 668 + dy),
               (CX, 678 + dy), (CX + 90, 668 + dy), (CX + 106 * w, 626 + dy),
               (CX + 98 * w, 578 + dy), (CX, 560 + dy)],
              fill=CLOTH, outline=INK, width=8, smooth_it=True)
    pen.stroke([(CX - 94, 598 + dy), (CX, 612 + dy), (CX + 94, 598 + dy)],
               TRIM, width=10, smooth_it=True)
    pen.shape([(CX - 98, 650 + dy), (CX + 98, 650 + dy), (CX + 94, 672 + dy),
               (CX - 94, 672 + dy)], fill=TRIM)

    # neck, collar, tie
    pen.shape([(CX - 31, 516 + dy), (CX + 31, 516 + dy), (CX + 33, 572 + dy),
               (CX - 33, 572 + dy)], fill=SKIN, outline=INK, width=7)
    pen.shape(oval(CX, 528 + dy, 31, 16), fill=(228, 178, 162, 255))
    pen.shape([(CX - 64, 552 + dy), (CX + 64, 552 + dy), (CX + 56, 584 + dy),
               (CX - 56, 584 + dy)], fill=CLOTH, outline=INK, width=7)
    pen.shape([(CX - 21, 574 + dy), (CX + 21, 574 + dy), (CX + 31, 644 + dy),
               (CX, 660 + dy), (CX - 31, 644 + dy)], fill=TIE, outline=INK, width=6)


# ------------------------------------------------------------------- head ---
def _eye(pen, ex, ey, side, blink):
    if blink:
        pen.stroke([(ex - 40, ey + 8), (ex - 14, ey - 16), (ex + 14, ey - 16),
                    (ex + 40, ey + 8)], INK, width=12, smooth_it=True)
        return
    pen.shape(oval(ex, ey, 45, 54), fill=(255, 255, 255, 255), outline=INK, width=7)
    pen.shape(oval(ex, ey + 4, 38, 47), fill=EYE_DK)
    pen.shape(oval(ex, ey + 14, 35, 38), fill=EYE_MD)
    pen.shape(oval(ex, ey + 28, 30, 23), fill=EYE_LT)
    pen.shape(oval(ex, ey + 4, 17, 24), fill=(18, 40, 52, 255))
    pen.shape(oval(ex - 14, ey - 20, 15, 12, rot=-24), fill=(255, 255, 255, 255))
    pen.shape(oval(ex + 16, ey + 27, 8, 6, rot=20), fill=(255, 255, 255, 225))
    pen.stroke([(ex - 47, ey - 22), (ex, ey - 56), (ex + 47, ey - 22)],
               INK, width=15, smooth_it=True)
    pen.shape([(ex + side * 42, ey - 30), (ex + side * 58, ey - 46),
               (ex + side * 48, ey - 16)], fill=INK)


def head(pen, blink, mouth_open):
    hy = HEAD_Y
    for side in (-1, 1):
        pen.shape(oval(CX + side * 146, hy + 24, 20, 32, rot=side * 12),
                  fill=SKIN, outline=INK, width=7)
    pen.shape(oval(CX, hy, 152, 156), fill=SKIN, outline=INK, width=8)

    for side in (-1, 1):
        _eye(pen, CX + side * 62, hy + 34, side, blink)

    my = hy + 104
    if mouth_open > 0.12:
        h = 11 + 26 * mouth_open
        pen.shape(oval(CX, my, 21 + 8 * mouth_open, h), fill=MOUTH, outline=INK, width=6)
        pen.shape(oval(CX, my + h * 0.44, 13 + 5 * mouth_open, h * 0.40), fill=TONGUE)
    else:
        pen.stroke([(CX - 23, my - 8), (CX, my + 10), (CX + 23, my - 8)],
                   INK, width=8, smooth_it=True)

    blur = pen.blank()
    for side in (-1, 1):
        blur.shape(oval(CX + side * 106, hy + 66, 42, 22), fill=BLUSH)
    blur.img = blur.img.filter(ImageFilter.GaussianBlur(radius=7 * pen.k))
    pen.paste(blur)

    _bangs(pen, hy)


def _bangs(pen, hy):
    """Hair cap + center-parted fringe as one continuous silhouette."""
    # Soft scalloped fringe. It has to clear the eyes completely: pointed
    # strands hanging over the eyes read as angry eyebrows.
    tip, notch = hy - 36, hy - 84
    edge = [(CX + 164, hy + 20), (CX + 150, tip), (CX + 96, notch),
            (CX + 44, tip - 4), (CX, notch - 4), (CX - 44, tip - 4),
            (CX - 96, notch), (CX - 150, tip), (CX - 164, hy + 20)]
    crown = [(CX - 172, hy - 40), (CX - 132, hy - 128), (CX - 40, hy - 178),
             (CX + 60, hy - 172), (CX + 146, hy - 116), (CX + 172, hy - 40)]
    pen.shape(crown + edge, fill=HAIR, outline=INK, width=8, smooth_it=True)
    pen.stroke([(CX - 118, hy - 112), (CX - 26, hy - 144), (CX + 84, hy - 124)],
               HAIR_LT, width=17, smooth_it=True)
    # side locks framing the cheeks
    for side in (-1, 1):
        line = smooth([(CX + side * 152, hy - 62), (CX + side * 178, hy + 44),
                       (CX + side * 158, hy + 158)], closed=False, samples=10)
        pen.shape(ribbon(line, [58, 48, 10]), fill=HAIR, outline=INK, width=7)


def back_hair(pen, sway, bounce):
    """Back mass + twintails; sits behind the body."""
    hy = HEAD_Y
    pen.shape(oval(CX, hy + 6, 188, 198), fill=HAIR_DK, outline=INK, width=8)
    pen.shape([(CX - 152, hy + 50), (CX + 152, hy + 50), (CX + 124, 648 + bounce),
               (CX - 124, 648 + bounce)], fill=HAIR_DK, outline=INK, width=8, smooth_it=True)

    for side in (-1, 1):
        s = -sway * side
        base = (CX + side * 178, hy + 4)
        line = smooth([base,
                       (CX + side * 222 + s * 0.5, 486),
                       (CX + side * 244 + s * 1.3, 628),
                       (CX + side * 226 + s * 2.1, 772),
                       (CX + side * 248 + s * 3.0, 898)], closed=False, samples=12)
        pen.shape(ribbon(line, [80, 86, 84, 68, 24]), fill=HAIR, outline=INK, width=8)
        inner = translate(line[3:-8], side * -16, 0)
        if len(inner) > 3:
            pen.stroke(inner, HAIR_LT, width=15)
        pen.shape(oval(base[0], base[1] + 6, 54, 34, rot=side * 24),
                  fill=CLOTH, outline=INK, width=7)
        pen.shape(oval(base[0], base[1] + 6, 54, 14, rot=side * 24), fill=TRIM)


# ------------------------------------------------------------------ frame ---
def _alternating(x):
    """Smooth 0-crossing wave that flips direction every unit of x."""
    return math.sin(math.pi * x) * (1 if int(math.floor(x)) % 2 == 0 else -1)


def render(t, beat, size=720, ss=2, aspect=16 / 9, loop=24.0):
    bounce = -20.0 * abs(math.sin(math.pi * beat))
    breathe = 0.02 * math.sin(math.pi * 2 * beat)
    tilt = 9.0 * _alternating(beat)
    sway = 18.0 * _alternating(beat - 0.28)
    spin = -360.0 * beat
    blink = (beat % 4.0) < 0.16
    mouth_open = abs(math.sin(math.pi * beat)) ** 0.6

    frame = background(size, ss, aspect, t, beat, loop)

    def layer():
        return Pen(size, ss, aspect, zoom=ZOOM, zoom_center=(CX, GROUND))

    shadow = layer()
    squash = 1.0 + 0.14 * (bounce / -20.0)
    shadow.shape(oval(CX, GROUND + 8, 250 / squash, 40 / squash), fill=(38, 126, 126, 78))
    frame.paste(shadow)

    hair_layer = layer()
    back_hair(hair_layer, sway, bounce)
    frame.paste(hair_layer.rotated(-tilt, PIVOT))

    body_layer = layer()
    body(body_layer, beat, bounce, breathe)
    frame.paste(body_layer)

    head_layer = layer()
    head(head_layer, blink, mouth_open)
    frame.paste(head_layer.rotated(-tilt, PIVOT))

    hand = leek_hand(beat, bounce)
    leek_layer = layer()
    leek(leek_layer, *hand)
    frame.paste(leek_layer.rotated(spin, hand))

    hand_layer = layer()
    hand_layer.circle(hand[0], hand[1], 31, fill=SKIN, outline=INK, width=7)
    frame.paste(hand_layer)

    return frame.finish(size).convert("RGB")
