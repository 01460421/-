"""每一筆線，找一個「最簡單又夠準」的方程式來表示它。

依序試（誤差都量到原本那條線上每一點的距離，單位是 GeoGebra 的單位）：
  閉合的線：圓 (x − h)² + (y − k)² = r²、橢圓（可以斜放）、極座標傅立葉級數 r(θ) = a₀ + Σ(aₙcos nθ + bₙsin nθ)
  開口的線：直線 y = mx + b 或 x = my + b、圓弧 x = h + r cos θ, y = k + r sin θ、
           拋物線 y = a(x − x₀)² + b(x − x₀) + c 或 x = a(y − y₀)² + …、三次函數 y = f(x) 或 x = g(y)
  都不行的，才用三次參數曲線 x(t)、y(t)。

每一種形式回傳一個 dict：
  f   形式的名字
  cmd 給 GeoGebra 的指令（不含名字）
  eq  給人看的方程式
  pts 沿著這條線取樣的點（量誤差、畫預覽用）
"""
import math

import numpy as np

TAU = 2 * math.pi


# ───────── 數字的寫法 ─────────
def num(v, d=4):
    v = round(float(v), d)
    if v == 0:
        v = 0.0
    s = ('%.' + str(d) + 'f') % v
    s = s.rstrip('0').rstrip('.') if '.' in s else s
    return '0' if s in ('-0', '') else s


def lin(terms, var_free=''):
    """terms: [(係數, 'x²' 形式的字串), …]；回傳 'a·x² − b·x + c' 的寫法（ascii 與好看的兩種）。"""
    a_out, p_out = [], []
    for c, ga, pa in terms:
        c = round(float(c), 5)
        if abs(c) < 5e-6:
            continue
        s = num(abs(c), 5)
        if not a_out:
            sgn_a, sgn_p = ('-' if c < 0 else ''), ('−' if c < 0 else '')
        else:
            sgn_a, sgn_p = (' - ' if c < 0 else ' + '), (' − ' if c < 0 else ' + ')
        if ga:
            a_out.append(f'{sgn_a}{s} {ga}' if s != '1' else f'{sgn_a}{ga}')
            p_out.append(f'{sgn_p}{s}{pa}' if s != '1' else f'{sgn_p}{pa}')
        else:
            a_out.append(f'{sgn_a}{s}')
            p_out.append(f'{sgn_p}{s}')
    return (''.join(a_out) or '0'), (''.join(p_out) or '0')


def shifted(var, v0):
    """(x − 8.21) 這樣的寫法。"""
    v0 = round(float(v0), 4)
    if v0 == 0:
        return var, var
    if v0 > 0:
        return f'({var} - {num(v0)})', f'({var} − {num(v0)})'
    return f'({var} + {num(-v0)})', f'({var} + {num(-v0)})'


SUP = {2: '²', 3: '³'}


def poly_terms(coef, var, v0):
    """coef 由高次到低次；回傳 terms 給 lin() 用。"""
    ga, pa = shifted(var, v0)
    n = len(coef) - 1
    out = []
    for i, c in enumerate(coef):
        p = n - i
        if p == 0:
            out.append((c, '', ''))
        elif p == 1:
            out.append((c, ga, pa))
        else:
            out.append((c, f'{ga}^{p}', f'{pa}{SUP[p]}'))
    return out


# ───────── 量誤差 ─────────
def max_dist(P, S):
    """P 的每一點到折線 S 的最短距離，取最大。"""
    A, B = S[:-1], S[1:]
    AB = B - A
    L2 = (AB ** 2).sum(1)
    L2[L2 == 0] = 1e-12
    worst = 0.0
    for i in range(0, len(P), 256):
        Q = P[i:i + 256]
        t = np.clip((((Q[:, None, :] - A[None]) * AB[None]).sum(2)) / L2[None], 0, 1)
        D = Q[:, None, :] - (A[None] + t[..., None] * AB[None])
        d = np.sqrt((D ** 2).sum(2)).min(1)
        worst = max(worst, float(d.max()))
    return worst


# ───────── 各種形式 ─────────
def f_line(P, tol):
    a, b = P[0], P[-1]
    v = b - a
    L = math.hypot(*v)
    if L < 1e-9:
        return None
    n = np.array([-v[1], v[0]]) / L
    if np.abs((P - a) @ n).max() > tol:
        return None
    dx, dy = v
    if abs(dx) >= abs(dy) * 0.25:                                   # y = mx + b
        m = dy / dx
        c = a[1] - m * a[0]
        x0, x1 = sorted((a[0], b[0]))
        ga, pa = lin([(m, 'x', 'x'), (c, '', '')])
        return {'f': 'line', 'cmd': f'Function({ga}, {num(x0)}, {num(x1)})', 'eq': f'y = {pa}，{num(x0)} ≤ x ≤ {num(x1)}', 'pts': np.array([a, b])}
    m = dx / dy                                                      # x = my + b
    c = a[0] - m * a[1]
    y0, y1 = sorted((a[1], b[1]))
    ga, pa = lin([(m, 't', 'y'), (c, '', '')])
    return {'f': 'line', 'cmd': f'Curve({ga}, t, t, {num(y0)}, {num(y1)})', 'eq': f'x = {pa}，{num(y0)} ≤ y ≤ {num(y1)}', 'pts': np.array([a, b])}


def circle_lsq(P):
    x, y = P[:, 0], P[:, 1]
    A = np.stack([x, y, np.ones_like(x)], 1)
    rhs = -(x * x + y * y)
    try:
        D, E, F = np.linalg.lstsq(A, rhs, rcond=None)[0]
    except np.linalg.LinAlgError:
        return None
    h, k = -D / 2, -E / 2
    r2 = h * h + k * k - F
    if r2 <= 0:
        return None
    return h, k, math.sqrt(r2)


def f_arc(P, tol, min_span=0.35):
    c = circle_lsq(P)
    if not c:
        return None
    h, k, r = c
    L = float(np.hypot(*np.diff(P, axis=0).T).sum())
    if r < 0.015 or r > max(6.0, L * 3):
        return None
    if np.abs(np.hypot(P[:, 0] - h, P[:, 1] - k) - r).max() > tol:
        return None
    th = np.unwrap(np.arctan2(P[:, 1] - k, P[:, 0] - h))
    d = np.diff(th)
    if not (np.all(d > -1e-4) or np.all(d < 1e-4)):
        return None
    t0, t1 = sorted((th[0], th[-1]))
    if t1 - t0 < min_span or t1 - t0 > TAU - 0.05:
        return None
    tt = np.linspace(t0, t1, max(8, int((t1 - t0) * r * 400) + 2))
    S = np.stack([h + r * np.cos(tt), k + r * np.sin(tt)], 1)
    if max_dist(P, S) > tol:
        return None
    return {'f': 'arc', 'cmd': f'Curve({num(h)} + {num(r)} cos(t), {num(k)} + {num(r)} sin(t), t, {num(t0)}, {num(t1)})',
            'eq': f'x = {num(h)} + {num(r)} cos θ，y = {num(k)} + {num(r)} sin θ，{num(t0)} ≤ θ ≤ {num(t1)}', 'pts': S}


def f_poly(P, tol, deg, axis):
    """axis 0：y = f(x)；axis 1：x = g(y)。"""
    u, v = P[:, axis], P[:, 1 - axis]
    du = np.diff(u)
    if not (np.all(du > 1e-7) or np.all(du < -1e-7)):
        return None
    u0 = round(float(u.min()), 4)
    lo, hi = float(u.min()), float(u.max())
    if hi - lo < 1e-4:
        return None
    try:
        coef = np.polyfit(u - u0, v, deg)
    except (np.linalg.LinAlgError, ValueError):
        return None
    coef = np.round(coef, 5)
    uu = np.linspace(lo, hi, max(12, int((hi - lo) * 300) + 2))
    vv = np.polyval(coef, uu - u0)
    slope = np.abs(np.polyval(np.polyder(coef), uu - u0)).max()
    if slope > 6:
        return None
    S = np.stack([uu, vv], 1) if axis == 0 else np.stack([vv, uu], 1)
    if max_dist(P, S) > tol:
        return None
    name = {2: 'parabola', 3: 'cubic'}[deg]
    if axis == 0:
        ga, pa = lin(poly_terms(coef, 'x', u0))
        return {'f': name, 'cmd': f'Function({ga}, {num(lo)}, {num(hi)})', 'eq': f'y = {pa}，{num(lo)} ≤ x ≤ {num(hi)}', 'pts': S}
    ga, pa = lin(poly_terms(coef, 't', u0))
    pa = lin(poly_terms(coef, 'y', u0))[1]
    return {'f': name + '_y', 'cmd': f'Curve({ga}, t, t, {num(lo)}, {num(hi)})', 'eq': f'x = {pa}，{num(lo)} ≤ y ≤ {num(hi)}', 'pts': S}


def f_ellipse(P, tol):
    import cv2
    if len(P) < 8:
        return None
    (cx, cy), (w, h), ang = cv2.fitEllipse(P.astype(np.float32))
    a, b = w / 2, h / 2
    if min(a, b) < 0.012 or max(a, b) > 8:
        return None
    phi = math.radians(ang)
    tt = np.linspace(0, TAU, 720)
    S = np.stack([cx + a * np.cos(tt) * math.cos(phi) - b * np.sin(tt) * math.sin(phi), cy + a * np.cos(tt) * math.sin(phi) + b * np.sin(tt) * math.cos(phi)], 1)
    if max_dist(P, S) > tol:
        return None
    if abs(a - b) <= 0.03 * (a + b) / 2:                               # 圓
        r = (a + b) / 2
        S = np.stack([cx + r * np.cos(tt), cy + r * np.sin(tt)], 1)
        if max_dist(P, S) <= tol:
            gx, px = shifted('x', cx)
            gy, py = shifted('y', cy)
            return {'f': 'circle', 'cmd': f'{gx}^2 + {gy}^2 = {num(r * r, 6)}', 'eq': f'{px}² + {py}² = {num(r)}²', 'pts': S, 'implicit': True}
    c, s = math.cos(phi), math.sin(phi)
    gx, px = shifted('x', cx)
    gy, py = shifted('y', cy)
    cmd = f'({num(c, 5)} {gx} + {num(s, 5)} {gy})^2 / {num(a * a, 6)} + ({num(-s, 5)} {gx} + {num(c, 5)} {gy})^2 / {num(b * b, 6)} = 1'
    eq = f'({num(c, 5)}{px} + {num(s, 5)}{py})² / {num(a)}² + ({num(-s, 5)}{px} + {num(c, 5)}{py})² / {num(b)}² = 1'
    return {'f': 'ellipse', 'cmd': cmd.replace('+ -', '- '), 'eq': eq.replace('+ -', '− '), 'pts': S, 'implicit': True}


def f_polar(P, tol, kmax=10):
    h, k = P[:-1].mean(0)
    th = np.unwrap(np.arctan2(P[:, 1] - k, P[:, 0] - h))
    d = np.diff(th)
    if not (np.all(d > 0) or np.all(d < 0)):
        return None
    if abs(abs(th[-1] - th[0]) - TAU) > 0.05:
        return None
    r = np.hypot(P[:, 0] - h, P[:, 1] - k)
    if r.min() < 0.01:
        return None
    tm = np.mod(th, TAU)
    for K in range(1, kmax + 1):
        A = [np.ones_like(tm)]
        for n in range(1, K + 1):
            A += [np.cos(n * tm), np.sin(n * tm)]
        A = np.stack(A, 1)
        co = np.round(np.linalg.lstsq(A, r, rcond=None)[0], 5)
        tt = np.linspace(0, TAU, 900)
        B = [np.ones_like(tt)]
        for n in range(1, K + 1):
            B += [np.cos(n * tt), np.sin(n * tt)]
        rr = np.stack(B, 1) @ co
        if rr.min() <= 0:
            continue
        S = np.stack([h + rr * np.cos(tt), k + rr * np.sin(tt)], 1)
        if max_dist(P, S) <= tol:
            terms_a, terms_p = [(co[0], '', '')], [(co[0], '', '')]
            for n in range(1, K + 1):
                ca, sa = (f'cos({n}t)', f'sin({n}t)') if n > 1 else ('cos(t)', 'sin(t)')
                cp, sp = (f'cos {n}θ', f'sin {n}θ') if n > 1 else ('cos θ', 'sin θ')
                terms_a += [(co[2 * n - 1], ca, cp), (co[2 * n], sa, sp)]
            ra, rp = lin(terms_a)
            return {'f': 'polar', 'cmd': f'Curve({num(h)} + ({ra}) cos(t), {num(k)} + ({ra}) sin(t), t, 0, 2pi)',
                    'eq': f'r(θ) = {rp}，極點 ({num(h)}, {num(k)})，0 ≤ θ ≤ 2π', 'pts': S, 'K': K}
    return None


def f_bezier(c):
    """三次貝茲的四個控制點 → x(t)、y(t)。"""
    def co(p0, p1, p2, p3):
        return [-p0 + 3 * p1 - 3 * p2 + p3, 3 * p0 - 6 * p1 + 3 * p2, -3 * p0 + 3 * p1, p0]
    kx, ky = co(*c[:, 0]), co(*c[:, 1])
    tx = [(kx[0], 't^3', 't³'), (kx[1], 't^2', 't²'), (kx[2], 't', 't'), (kx[3], '', '')]
    ty = [(ky[0], 't^3', 't³'), (ky[1], 't^2', 't²'), (ky[2], 't', 't'), (ky[3], '', '')]
    xa, xp = lin(tx)
    ya, yp = lin(ty)
    t = np.linspace(0, 1, 24)[:, None]
    S = (1 - t) ** 3 * c[0] + 3 * (1 - t) ** 2 * t * c[1] + 3 * (1 - t) * t ** 2 * c[2] + t ** 3 * c[3]
    return {'f': 'bezier', 'cmd': f'Curve({xa}, {ya}, t, 0, 1)', 'eq': f'x(t) = {xp}，y(t) = {yp}，0 ≤ t ≤ 1', 'pts': S}


def best_open(P, tol):
    if len(P) < 2:
        return None
    r = f_line(P, tol)
    if r:
        return r
    if len(P) < 4:
        return None
    for fn in (lambda: f_arc(P, tol), lambda: f_poly(P, tol, 2, 0), lambda: f_poly(P, tol, 2, 1), lambda: f_poly(P, tol, 3, 0), lambda: f_poly(P, tol, 3, 1)):
        r = fn()
        if r:
            return r
    return None


def best_closed(P, tol):
    if len(P) < 8:
        return None
    return f_ellipse(P, tol) or f_polar(P, tol)
