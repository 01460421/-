/**
 * 非線性最佳化：Levenberg–Marquardt（非線性最小平方）與 Nelder–Mead（無導數）。
 */
import { solve } from './linalg';

export interface LMOptions {
  maxIter?: number;
  tol?: number;
  lambda0?: number;
  /** 參數下界 / 上界（投影法處理） */
  lower?: number[];
  upper?: number[];
  weights?: number[];
}

export interface LMResult {
  params: number[];
  rss: number;
  iterations: number;
  converged: boolean;
  /** 近似 (JᵀWJ)⁻¹，用於參數不確定性 */
  jtj: number[][];
}

/**
 * Levenberg–Marquardt：
 *   (JᵀWJ + λ·diag(JᵀWJ)) δ = JᵀW r
 * 成功（RSS 下降）時 λ ← λ/10，失敗時 λ ← λ·10。
 * Jacobian 以中央差分數值估計。
 */
export function levenbergMarquardt(
  f: (x: number, p: number[]) => number,
  xs: number[],
  ys: number[],
  p0: number[],
  opts: LMOptions = {},
): LMResult {
  const maxIter = opts.maxIter ?? 200;
  const tol = opts.tol ?? 1e-10;
  let lambda = opts.lambda0 ?? 1e-3;
  const w = opts.weights ?? xs.map(() => 1);
  const np = p0.length;
  const project = (p: number[]) =>
    p.map((v, i) => {
      let out = v;
      if (opts.lower && Number.isFinite(opts.lower[i])) out = Math.max(out, opts.lower[i]);
      if (opts.upper && Number.isFinite(opts.upper[i])) out = Math.min(out, opts.upper[i]);
      return out;
    });

  const rssOf = (p: number[]) => {
    let s = 0;
    for (let i = 0; i < xs.length; i++) {
      const r = ys[i] - f(xs[i], p);
      s += w[i] * r * r;
    }
    return Number.isFinite(s) ? s : Infinity;
  };

  let p = project(p0.slice());
  let rss = rssOf(p);
  let converged = false;
  let iter = 0;
  let JtJ: number[][] = [];

  for (iter = 0; iter < maxIter; iter++) {
    const J: number[][] = [];
    const r: number[] = [];
    for (let i = 0; i < xs.length; i++) {
      const row: number[] = [];
      for (let k = 0; k < np; k++) {
        const h = 1e-6 * Math.max(1, Math.abs(p[k]));
        const pp = p.slice();
        const pm = p.slice();
        pp[k] += h;
        pm[k] -= h;
        row.push((f(xs[i], pp) - f(xs[i], pm)) / (2 * h));
      }
      J.push(row);
      r.push(ys[i] - f(xs[i], p));
    }
    JtJ = Array.from({ length: np }, () => new Array<number>(np).fill(0));
    const Jtr = new Array<number>(np).fill(0);
    for (let i = 0; i < xs.length; i++) {
      for (let a = 0; a < np; a++) {
        Jtr[a] += w[i] * J[i][a] * r[i];
        for (let b = 0; b < np; b++) JtJ[a][b] += w[i] * J[i][a] * J[i][b];
      }
    }
    let improved = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * Math.max(v, 1e-12) : v)));
      const delta = solve(A, Jtr);
      const pNew = project(p.map((v, k) => v + delta[k]));
      const rssNew = rssOf(pNew);
      if (rssNew < rss) {
        const rel = (rss - rssNew) / Math.max(rss, 1e-300);
        p = pNew;
        rss = rssNew;
        lambda = Math.max(lambda / 10, 1e-12);
        improved = true;
        if (rel < tol) converged = true;
        break;
      }
      lambda *= 10;
    }
    if (!improved || converged) {
      converged = converged || !improved;
      break;
    }
  }
  return { params: p, rss, iterations: iter, converged, jtj: JtJ };
}

export interface NMOptions {
  maxIter?: number;
  tol?: number;
  step?: number[];
}

/** Nelder–Mead 單純形法（Holt–Winters、ARIMA、GARCH 等概似最大化使用） */
export function nelderMead(fn: (x: number[]) => number, x0: number[], opts: NMOptions = {}): { x: number[]; fx: number; iterations: number } {
  const n = x0.length;
  const maxIter = opts.maxIter ?? 400 * n;
  const tol = opts.tol ?? 1e-9;
  const safe = (x: number[]) => {
    const v = fn(x);
    return Number.isFinite(v) ? v : 1e300;
  };
  let simplex: { x: number[]; f: number }[] = [{ x: x0.slice(), f: safe(x0) }];
  for (let i = 0; i < n; i++) {
    const x = x0.slice();
    const s = opts.step?.[i] ?? (x[i] !== 0 ? 0.05 * Math.abs(x[i]) : 0.00025);
    x[i] += s;
    simplex.push({ x, f: safe(x) });
  }
  let it = 0;
  for (; it < maxIter; it++) {
    simplex.sort((a, b) => a.f - b.f);
    const best = simplex[0];
    const worst = simplex[n];
    if (Math.abs(worst.f - best.f) <= tol * (Math.abs(best.f) + 1e-12)) break;
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j] / n;
    const at = (t: number) => centroid.map((c, j) => c + t * (worst.x[j] - c));
    const xr = at(-1);
    const fr = safe(xr);
    if (fr < best.f) {
      const xe = at(-2);
      const fe = safe(xe);
      simplex[n] = fe < fr ? { x: xe, f: fe } : { x: xr, f: fr };
    } else if (fr < simplex[n - 1].f) {
      simplex[n] = { x: xr, f: fr };
    } else {
      const xc = fr < worst.f ? at(-0.5) : at(0.5);
      const fc = safe(xc);
      if (fc < Math.min(fr, worst.f)) {
        simplex[n] = { x: xc, f: fc };
      } else {
        simplex = simplex.map((v, i) => (i === 0 ? v : { x: v.x.map((xx, j) => best.x[j] + 0.5 * (xx - best.x[j])), f: 0 }));
        for (let i = 1; i <= n; i++) simplex[i].f = safe(simplex[i].x);
      }
    }
  }
  simplex.sort((a, b) => a.f - b.f);
  return { x: simplex[0].x, fx: simplex[0].f, iterations: it };
}

/** logit / sigmoid 轉換：把 (0,1) 約束參數映射到實數軸做無約束最佳化 */
export const toUnit = (z: number) => 1 / (1 + Math.exp(-z));
export const fromUnit = (p: number) => Math.log(Math.min(Math.max(p, 1e-9), 1 - 1e-9) / (1 - Math.min(Math.max(p, 1e-9), 1 - 1e-9)));
