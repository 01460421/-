/**
 * 自然三次樣條（natural cubic spline），EMD 包絡線使用。
 *
 * 在節點 x_0 < … < x_m 上，每段 [x_i, x_{i+1}] 為三次多項式，二階導數 M_i 連續且 M_0 = M_m = 0：
 *   h_{i-1}M_{i-1} + 2(h_{i-1}+h_i)M_i + h_iM_{i+1} = 6\Big(\frac{y_{i+1}-y_i}{h_i}-\frac{y_i-y_{i-1}}{h_{i-1}}\Big)
 * 三對角系統以 Thomas 演算法 O(m) 求解。
 *   S(x) = \frac{M_i(x_{i+1}-x)^3 + M_{i+1}(x-x_i)^3}{6h_i}
 *        + \Big(\frac{y_i}{h_i}-\frac{M_ih_i}{6}\Big)(x_{i+1}-x) + \Big(\frac{y_{i+1}}{h_i}-\frac{M_{i+1}h_i}{6}\Big)(x-x_i)
 */

export interface Spline {
  knotsX: number[];
  knotsY: number[];
  M: number[];
  evaluate: (x: number) => number;
}

/** 解三對角系統 a_i x_{i−1} + b_i x_i + c_i x_{i+1} = d_i */
export function thomas(a: number[], b: number[], c: number[], d: number[]): number[] {
  const n = b.length;
  const cp = new Array<number>(n);
  const dp = new Array<number>(n);
  cp[0] = c[0] / b[0];
  dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    cp[i] = c[i] / m;
    dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
  }
  const x = new Array<number>(n);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

export function naturalCubicSpline(xs: number[], ys: number[]): Spline {
  const m = xs.length;
  if (m < 2) {
    const v = ys[0] ?? 0;
    return { knotsX: xs.slice(), knotsY: ys.slice(), M: [0], evaluate: () => v };
  }
  const h = Array.from({ length: m - 1 }, (_, i) => xs[i + 1] - xs[i]);
  const M = new Array<number>(m).fill(0);
  if (m > 2) {
    const k = m - 2;
    const a = new Array<number>(k);
    const b = new Array<number>(k);
    const c = new Array<number>(k);
    const d = new Array<number>(k);
    for (let j = 0; j < k; j++) {
      const i = j + 1;
      a[j] = j === 0 ? 0 : h[i - 1];
      b[j] = 2 * (h[i - 1] + h[i]);
      c[j] = j === k - 1 ? 0 : h[i];
      d[j] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
    }
    const sol = thomas(a, b, c, d);
    for (let j = 0; j < k; j++) M[j + 1] = sol[j];
  }
  const evaluate = (x: number) => {
    // 二分搜尋所在區段（區間外以端段多項式外推）
    let lo = 0;
    let hi = m - 2;
    if (x <= xs[0]) lo = 0;
    else if (x >= xs[m - 1]) lo = m - 2;
    else {
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (xs[mid] <= x) lo = mid;
        else hi = mid - 1;
      }
    }
    const i = lo;
    const hi_ = h[i];
    const A = xs[i + 1] - x;
    const B = x - xs[i];
    return (
      (M[i] * A * A * A + M[i + 1] * B * B * B) / (6 * hi_) +
      (ys[i] / hi_ - (M[i] * hi_) / 6) * A +
      (ys[i + 1] / hi_ - (M[i + 1] * hi_) / 6) * B
    );
  };
  return { knotsX: xs.slice(), knotsY: ys.slice(), M, evaluate };
}
