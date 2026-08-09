"""Tiny vector-drawing helpers on top of Pillow.

Everything is authored in a virtual 1000x1000 coordinate space (y grows down)
and scaled to the real pixel canvas on the way out, so the same scene code can
be rendered at any resolution / supersampling factor.
"""

import math

from PIL import Image, ImageDraw


def smooth(points, closed=True, samples=9):
    """Catmull-Rom spline through `points`, returned as a dense polyline."""
    pts = [tuple(map(float, p)) for p in points]
    if len(pts) < 3:
        return pts
    if closed:
        ext = [pts[-1]] + pts + [pts[0], pts[1]]
    else:
        # reflect the end points so the curve actually reaches them
        ext = ([(2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1])] + pts +
               [(2 * pts[-1][0] - pts[-2][0], 2 * pts[-1][1] - pts[-2][1])])
    out = []
    for i in range(len(ext) - 3):
        p0, p1, p2, p3 = ext[i:i + 4]
        for j in range(samples):
            t = j / samples
            t2, t3 = t * t, t * t * t
            x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t +
                       (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                       (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t +
                       (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                       (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    if not closed:
        out.append(ext[-2])
    return out


def ribbon(centerline, widths, closed_ends=True):
    """Turn a centerline + per-point width profile into a closed outline.

    `widths` is sampled along the (already smoothed) centerline by fractional
    position, so you can pass a handful of control widths for many points.
    """
    pts = centerline
    n = len(pts)
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        u = i / max(1, n - 1)
        w = _lerp_profile(widths, u) * 0.5
        if i == 0:
            dx, dy = pts[1][0] - x, pts[1][1] - y
        elif i == n - 1:
            dx, dy = x - pts[-2][0], y - pts[-2][1]
        else:
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln, dx / ln
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    return left + right[::-1] if closed_ends else (left, right)


def _lerp_profile(profile, u):
    if len(profile) == 1:
        return profile[0]
    pos = u * (len(profile) - 1)
    i = min(int(pos), len(profile) - 2)
    f = pos - i
    return profile[i] * (1 - f) + profile[i + 1] * f


def oval(cx, cy, rx, ry, rot=0.0, steps=64):
    """Polygon approximation of a (possibly rotated) ellipse."""
    ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    out = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        x, y = rx * math.cos(a), ry * math.sin(a)
        out.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return out


def translate(points, dx, dy):
    return [(x + dx, y + dy) for x, y in points]


class Pen:
    """An RGBA layer plus drawing ops in virtual units.

    The virtual space is 1000 units tall; x=0..1000 is the centred square, and
    wider aspect ratios simply extend the usable x range on both sides (for
    16:9 that is roughly -389..1389), so scene geometry stays resolution- and
    aspect-independent.
    """

    def __init__(self, size, ss=2, aspect=16 / 9, bg=(0, 0, 0, 0), image=None,
                 zoom=1.0, zoom_center=(500.0, 940.0)):
        self.size = size
        self.ss = ss
        self.aspect = aspect
        self.zoom = zoom
        self.zc = zoom_center
        self.h = size * ss
        self.w = int(round(size * ss * aspect))
        self.k = self.h / 1000.0
        self.ox = (self.w - self.h) / 2.0
        self.img = image if image is not None else Image.new("RGBA", (self.w, self.h), bg)
        self.d = ImageDraw.Draw(self.img)

    def blank(self):
        """A transparent layer with the same geometry as this one."""
        return Pen(self.size, self.ss, self.aspect, zoom=self.zoom, zoom_center=self.zc)

    def p(self, xy):
        zx, zy = self.zc
        return ((zx + (xy[0] - zx) * self.zoom) * self.k + self.ox,
                (zy + (xy[1] - zy) * self.zoom) * self.k)

    def _map(self, points):
        zx, zy = self.zc
        z, k, ox = self.zoom, self.k, self.ox
        return [((zx + (x - zx) * z) * k + ox, (zy + (y - zy) * z) * k) for x, y in points]

    # ImageDraw *overwrites* pixels on RGBA layers instead of blending, so any
    # colour with alpha < 255 has to be rendered on a scratch tile and then
    # alpha-composited back. The tile is clipped to the shape's bounding box so
    # translucent ops stay cheap.
    def _blended(self, mapped, pad, paint):
        xs = [p[0] for p in mapped]
        ys = [p[1] for p in mapped]
        x0 = max(0, int(min(xs)) - pad)
        y0 = max(0, int(min(ys)) - pad)
        x1 = min(self.w, int(max(xs)) + pad + 1)
        y1 = min(self.h, int(max(ys)) + pad + 1)
        if x1 <= x0 or y1 <= y0:
            return
        tile = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
        paint(ImageDraw.Draw(tile), [(x - x0, y - y0) for x, y in mapped])
        self.img.alpha_composite(tile, (x0, y0))

    @staticmethod
    def _opaque(colour):
        return colour is None or len(colour) < 4 or colour[3] >= 255

    def shape(self, points, fill=None, outline=None, width=7, smooth_it=False, closed=True):
        pts = smooth(points, closed=closed) if smooth_it else list(points)
        mapped = self._map(pts)
        w = max(1, int(round(width * self.k * self.zoom)))
        if fill is not None:
            if self._opaque(fill):
                self.d.polygon(mapped, fill=fill)
            else:
                self._blended(mapped, 2, lambda d, p: d.polygon(p, fill=fill))
        if outline is not None:
            if self._opaque(outline):
                self.d.line(mapped + [mapped[0]], fill=outline, width=w, joint="curve")
            else:
                self._blended(mapped, w + 2,
                              lambda d, p: d.line(p + [p[0]], fill=outline, width=w,
                                                  joint="curve"))

    def stroke(self, points, color, width=7, smooth_it=False, closed=False):
        pts = smooth(points, closed=closed) if smooth_it else list(points)
        mapped = self._map(pts)
        if closed:
            mapped = mapped + [mapped[0]]
        w = max(1, int(round(width * self.k * self.zoom)))
        if self._opaque(color):
            self.d.line(mapped, fill=color, width=w, joint="curve")
        else:
            self._blended(mapped, w + 2,
                          lambda d, p: d.line(p, fill=color, width=w, joint="curve"))

    def ellipse(self, cx, cy, rx, ry, fill=None, outline=None, width=7, rot=0.0):
        self.shape(oval(cx, cy, rx, ry, rot), fill=fill, outline=outline, width=width)

    def circle(self, cx, cy, r, **kw):
        self.ellipse(cx, cy, r, r, **kw)

    def rotated(self, angle_deg, center):
        """Return a copy of this layer rotated about a virtual-space point."""
        return self.img.rotate(angle_deg, resample=Image.BICUBIC, center=self.p(center))

    def paste(self, other, mode="alpha"):
        img = other.img if isinstance(other, Pen) else other
        self.img.alpha_composite(img)

    def finish(self, size):
        return self.img.resize((int(round(size * self.aspect)), size), Image.LANCZOS)
