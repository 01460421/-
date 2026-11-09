/**
 * 純 TypeScript 線性代數工具（Serverless 備援用，無外部依賴）。
 * 矩陣以 row-major 的 number[][] 表示。
 *
 * 最小平方採 Householder QR 求解，避免正規方程式 XᵀX 造成條件數平方化：
 *   cond(XᵀX) = cond(X)²
 * 另提供 one-sided Jacobi SVD，用於條件數檢查與秩虧時的偽逆解。
 */

export type Matrix = number[][];
export type Vector = number[];

export function zeros(r: number, c: number): Matrix {
  return Array.from({ length: r }, () => new Array<number>(c).fill(0));
}

export function identity(n: number): Matrix {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i][i] = 1;
  return m;
}

export function transpose(a: Matrix): Matrix {
  const r = a.length;
  const c = r ? a[0].length : 0;
  const t = zeros(c, r);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) t[j][i] = a[i][j];
  return t;
}

export function matmul(a: Matrix, b: Matrix): Matrix {
  const r = a.length;
  const k = b.length;
  const c = k ? b[0].length : 0;
  const out = zeros(r, c);
  for (let i = 0; i < r; i++) {
    const ai = a[i];
    const oi = out[i];
    for (let p = 0; p < k; p++) {
      const v = ai[p];
      if (v === 0) continue;
      const bp = b[p];
      for (let j = 0; j < c; j++) oi[j] += v * bp[j];
    }
  }
  return out;
}

export function matvec(a: Matrix, x: Vector): Vector {
  return a.map((row) => dot(row, x));
}

export function dot(a: Vector, b: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function outer(a: Vector, b: Vector): Matrix {
  return a.map((ai) => b.map((bj) => ai * bj));
}

export function add(a: Matrix, b: Matrix): Matrix {
  return a.map((row, i) => row.map((v, j) => v + b[i][j]));
}

export function sub(a: Matrix, b: Matrix): Matrix {
  return a.map((row, i) => row.map((v, j) => v - b[i][j]));
}

export function scale(a: Matrix, s: number): Matrix {
  return a.map((row) => row.map((v) => v * s));
}

export function clone(a: Matrix): Matrix {
  return a.map((r) => r.slice());
}

/**
 * Householder QR 分解，回傳緊湊形式供最小平方使用。
 * A (m×n, m ≥ n) = Q R
 */
export function qr(a: Matrix): { Q: Matrix; R: Matrix } {
  const m = a.length;
  const n = a[0].length;
  const R = clone(a);
  let Q = identity(m);
  for (let k = 0; k < Math.min(m - 1, n); k++) {
    let norm = 0;
    for (let i = k; i < m; i++) norm += R[i][k] * R[i][k];
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = R[k][k] > 0 ? -norm : norm;
    const v = new Array<number>(m).fill(0);
    for (let i = k; i < m; i++) v[i] = R[i][k];
    v[k] -= alpha;
    let vnorm2 = 0;
    for (let i = k; i < m; i++) vnorm2 += v[i] * v[i];
    if (vnorm2 === 0) continue;
    // R = (I - 2vvᵀ/vᵀv) R
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let i = k; i < m; i++) s += v[i] * R[i][j];
      const f = (2 * s) / vnorm2;
      for (let i = k; i < m; i++) R[i][j] -= f * v[i];
    }
    // Q = Q (I - 2vvᵀ/vᵀv)
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let p = k; p < m; p++) s += Q[i][p] * v[p];
      const f = (2 * s) / vnorm2;
      for (let p = k; p < m; p++) Q[i][p] -= f * v[p];
    }
  }
  return { Q, R };
}

/** 上三角回代 R x = b（只取前 n 列）。 */
export function backSubstitute(R: Matrix, b: Vector): Vector {
  const n = R[0].length;
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= R[i][j] * x[j];
    const d = R[i][i];
    x[i] = Math.abs(d) < 1e-300 ? 0 : s / d;
  }
  return x;
}

export interface LstsqResult {
  coef: Vector;
  fitted: Vector;
  residuals: Vector;
  rss: number;
  /** 2-範數條件數（由 SVD 奇異值比計算） */
  cond: number;
  rank: number;
  /** (XᵀWX)⁻¹，用於係數標準誤與預測區間 */
  covUnscaled: Matrix;
  method: 'qr' | 'svd';
}

/**
 * 加權最小平方：min Σ w_i (y_i − x_iᵀβ)²
 * 先以 √w 縮放列，再用 QR；若條件數 > 1e12 自動改用 SVD 截斷偽逆（降級策略）。
 */
export function lstsq(X: Matrix, y: Vector, weights?: Vector): LstsqResult {
  const m = X.length;
  const n = X[0].length;
  const sw = weights ? weights.map((w) => Math.sqrt(Math.max(w, 0))) : new Array<number>(m).fill(1);
  const Xw = X.map((row, i) => row.map((v) => v * sw[i]));
  const yw = y.map((v, i) => v * sw[i]);

  const sv = svd(Xw);
  const smax = Math.max(...sv.S);
  const smin = Math.min(...sv.S);
  const cond = smin > 0 ? smax / smin : Infinity;
  const tol = Math.max(m, n) * Number.EPSILON * smax;
  const rank = sv.S.filter((s) => s > tol).length;

  let coef: Vector;
  let method: 'qr' | 'svd' = 'qr';
  if (cond < 1e12 && rank === n) {
    coef = householderSolve(Xw, yw);
  } else {
    method = 'svd';
    coef = svdSolve(sv, yw, tol);
  }

  const fitted = matvec(X, coef);
  const residuals = y.map((v, i) => v - fitted[i]);
  let rss = 0;
  for (let i = 0; i < m; i++) rss += (weights ? weights[i] : 1) * residuals[i] * residuals[i];

  // (XᵀWX)⁻¹ = V Σ⁻² Vᵀ
  const covUnscaled = zeros(n, n);
  for (let k = 0; k < n; k++) {
    const s = sv.S[k];
    if (s <= tol) continue;
    const inv = 1 / (s * s);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) covUnscaled[i][j] += sv.V[i][k] * sv.V[j][k] * inv;
  }

  return { coef, fitted, residuals, rss, cond, rank, covUnscaled, method };
}

/**
 * 經濟型 Householder 最小平方：反射直接作用在右手邊 b，不建立 m×m 的 Q（O(mn²) 時間、O(mn) 記憶體）。
 */
export function householderSolve(A: Matrix, b: Vector): Vector {
  const m = A.length;
  const n = A[0].length;
  const R = clone(A);
  const y = b.slice();
  const v = new Array<number>(m).fill(0);
  for (let k = 0; k < Math.min(m - 1, n); k++) {
    let norm = 0;
    for (let i = k; i < m; i++) norm += R[i][k] * R[i][k];
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = R[k][k] > 0 ? -norm : norm;
    let vnorm2 = 0;
    for (let i = k; i < m; i++) {
      v[i] = R[i][k] - (i === k ? alpha : 0);
      vnorm2 += v[i] * v[i];
    }
    if (vnorm2 === 0) continue;
    for (let j = k; j < n; j++) {
      let s = 0;
      for (let i = k; i < m; i++) s += v[i] * R[i][j];
      const f = (2 * s) / vnorm2;
      for (let i = k; i < m; i++) R[i][j] -= f * v[i];
    }
    let s = 0;
    for (let i = k; i < m; i++) s += v[i] * y[i];
    const f = (2 * s) / vnorm2;
    for (let i = k; i < m; i++) y[i] -= f * v[i];
  }
  return backSubstitute(R, y);
}

export interface SVDResult {
  U: Matrix; // m×n
  S: Vector; // n
  V: Matrix; // n×n
}

/**
 * One-sided Jacobi SVD（數值穩定、實作簡單，適合 n ≤ 20 的設計矩陣）。
 * A = U diag(S) Vᵀ
 */
export function svd(a: Matrix): SVDResult {
  const m = a.length;
  const n = a[0].length;
  const U = clone(a);
  const V = identity(n);
  const maxSweeps = 60;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let i = 0; i < m; i++) {
          alpha += U[i][p] * U[i][p];
          beta += U[i][q] * U[i][q];
          gamma += U[i][p] * U[i][q];
        }
        if (alpha === 0 || beta === 0) continue;
        const c0 = Math.abs(gamma) / Math.sqrt(alpha * beta);
        off = Math.max(off, c0);
        if (c0 < 1e-15) continue;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let i = 0; i < m; i++) {
          const up = U[i][p];
          const uq = U[i][q];
          U[i][p] = c * up - s * uq;
          U[i][q] = s * up + c * uq;
        }
        for (let i = 0; i < n; i++) {
          const vp = V[i][p];
          const vq = V[i][q];
          V[i][p] = c * vp - s * vq;
          V[i][q] = s * vp + c * vq;
        }
      }
    }
    if (off < 1e-15) break;
  }
  const S = new Array<number>(n).fill(0);
  for (let j = 0; j < n; j++) {
    let norm = 0;
    for (let i = 0; i < m; i++) norm += U[i][j] * U[i][j];
    norm = Math.sqrt(norm);
    S[j] = norm;
    if (norm > 0) for (let i = 0; i < m; i++) U[i][j] /= norm;
  }
  return { U, S, V };
}

export function svdSolve(sv: SVDResult, b: Vector, tol = 1e-12): Vector {
  const n = sv.S.length;
  const m = sv.U.length;
  const x = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    if (sv.S[k] <= tol) continue;
    let ub = 0;
    for (let i = 0; i < m; i++) ub += sv.U[i][k] * b[i];
    const f = ub / sv.S[k];
    for (let i = 0; i < n; i++) x[i] += f * sv.V[i][k];
  }
  return x;
}

export function conditionNumber(a: Matrix): number {
  const { S } = svd(a);
  const smax = Math.max(...S);
  const smin = Math.min(...S);
  return smin > 0 ? smax / smin : Infinity;
}

/** 高斯消去（部分樞軸）解 A x = b，A 為方陣。 */
export function solve(A: Matrix, b: Vector): Vector {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    if (Math.abs(d) < 1e-300) continue;
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = Math.abs(M[i][i]) < 1e-300 ? 0 : s / M[i][i];
  }
  return x;
}

/** 方陣反矩陣（Gauss–Jordan）。奇異時回傳 SVD 偽逆。 */
export function inverse(A: Matrix): Matrix {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...identity(n)[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-14) return pinv(A);
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let c = 0; c < 2 * n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row.slice(n));
}

export function pinv(A: Matrix): Matrix {
  const sv = svd(A);
  const n = sv.S.length;
  const m = A.length;
  const smax = Math.max(...sv.S);
  const tol = Math.max(m, n) * Number.EPSILON * smax;
  const out = zeros(n, m);
  for (let k = 0; k < n; k++) {
    if (sv.S[k] <= tol) continue;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) out[i][j] += (sv.V[i][k] * sv.U[j][k]) / sv.S[k];
  }
  return out;
}

/** Cholesky 分解 A = L Lᵀ（A 對稱正定），失敗時加對角抖動重試。 */
export function cholesky(A: Matrix, jitter = 0): Matrix {
  const n = A.length;
  for (let attempt = 0; attempt < 8; attempt++) {
    const eps = attempt === 0 ? jitter : Math.max(jitter, 1e-10) * Math.pow(10, attempt);
    const L = zeros(n, n);
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i][j] + (i === j ? eps : 0);
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (s <= 0) {
            ok = false;
            break;
          }
          L[i][i] = Math.sqrt(s);
        } else {
          L[i][j] = s / L[j][j];
        }
      }
    }
    if (ok) return L;
  }
  throw new Error('cholesky: matrix not positive definite');
}

/** 以 Cholesky 因子解 (L Lᵀ) x = b */
export function choleskySolve(L: Matrix, b: Vector): Vector {
  const n = L.length;
  const z = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * z[k];
    z[i] = s / L[i][i];
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = z[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}
