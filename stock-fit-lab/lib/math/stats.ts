/**
 * 統計工具：描述統計、常態分布、卡方、二項檢定、ACF/PACF、Ljung–Box、Durbin–Watson。
 */

export function sum(x: number[]): number {
  let s = 0;
  for (const v of x) s += v;
  return s;
}

export function mean(x: number[]): number {
  return x.length ? sum(x) / x.length : NaN;
}

export function variance(x: number[], ddof = 1): number {
  const n = x.length;
  if (n - ddof <= 0) return NaN;
  const m = mean(x);
  let s = 0;
  for (const v of x) s += (v - m) * (v - m);
  return s / (n - ddof);
}

export function std(x: number[], ddof = 1): number {
  return Math.sqrt(variance(x, ddof));
}

export function weightedMean(x: number[], w: number[]): number {
  let s = 0;
  let ws = 0;
  for (let i = 0; i < x.length; i++) {
    s += x[i] * w[i];
    ws += w[i];
  }
  return ws > 0 ? s / ws : NaN;
}

export function quantile(x: number[], q: number): number {
  if (!x.length) return NaN;
  const s = [...x].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function median(x: number[]): number {
  return quantile(x, 0.5);
}

/** 對數報酬 r_t = ln(P_t / P_{t-1}) */
export function logReturns(p: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < p.length; i++) r.push(Math.log(p[i] / p[i - 1]));
  return r;
}

export function diff(x: number[], d = 1): number[] {
  let out = x.slice();
  for (let k = 0; k < d; k++) {
    const next: number[] = [];
    for (let i = 1; i < out.length; i++) next.push(out[i] - out[i - 1]);
    out = next;
  }
  return out;
}

// ───────── 常態分布 ─────────

export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Φ(x)，使用 erf 的高精度近似（W. J. Cody 有理逼近的簡化版，誤差 < 1e-7） */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function erf(x: number): number {
  // Abramowitz–Stegun 7.1.26 精度不足，改用 erfc 連分式 + 級數
  const ax = Math.abs(x);
  let r: number;
  if (ax < 2.5) {
    // Taylor 級數
    let term = ax;
    let s = ax;
    const x2 = ax * ax;
    for (let n = 1; n < 100; n++) {
      term *= -x2 / n;
      const add = term / (2 * n + 1);
      s += add;
      if (Math.abs(add) < 1e-17 * Math.abs(s)) break;
    }
    r = (2 / Math.sqrt(Math.PI)) * s;
  } else {
    // 連分式 erfc
    let f = 0;
    for (let n = 60; n >= 1; n--) f = n / 2 / (ax + f);
    const erfc = Math.exp(-ax * ax) / Math.sqrt(Math.PI) / (ax + f);
    r = 1 - erfc;
  }
  return x < 0 ? -r : r;
}

/** Φ⁻¹(p)，Acklam 演算法 + 一次 Halley 修正（相對誤差 ~1e-15） */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  let x: number;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - plow) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** 雙尾 z 值，例如 level=0.9 → 1.6449 */
export function zForLevel(level: number): number {
  return normalQuantile(0.5 + level / 2);
}

// ───────── Gamma / 卡方 / Beta ─────────

export function logGamma(x: number): number {
  const g = 7;
  const coef = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  x -= 1;
  let a = coef[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += coef[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** 正規化下不完全 Gamma P(a, x) */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sumv = 1 / a;
    let term = sumv;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sumv += term;
      if (Math.abs(term) < Math.abs(sumv) * 1e-15) break;
    }
    return sumv * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // 連分式求 Q
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

export function chiSquareCdf(x: number, k: number): number {
  return gammaP(k / 2, x / 2);
}

/** 正規化不完全 Beta I_x(a,b)（Lentz 連分式） */
export function betaInc(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lbeta);
  if (x > (a + 1) / (a + b + 2)) return 1 - betaInc(1 - x, b, a);
  let f = 1;
  let c = 1;
  let d = 0;
  for (let i = 0; i <= 400; i++) {
    const m = Math.floor(i / 2);
    let num: number;
    if (i === 0) num = 1;
    else if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const cd = c * d;
    f *= cd;
    if (Math.abs(1 - cd) < 1e-14) break;
  }
  return (front * (f - 1)) / a;
}

/** Student t 分布 CDF */
export function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const p = 0.5 * betaInc(x, df / 2, 0.5);
  return t > 0 ? 1 - p : p;
}

/**
 * 單尾二項檢定 P(X ≥ k | n, p0)：方向準確率是否「顯著高於 50%」。
 * n 大時用連續性修正常態近似，n ≤ 1000 時精確計算。
 */
export function binomialTestGreater(k: number, n: number, p0 = 0.5): number {
  if (n === 0) return 1;
  if (n <= 1000) {
    let p = 0;
    const lp = Math.log(p0);
    const lq = Math.log(1 - p0);
    for (let i = k; i <= n; i++) {
      p += Math.exp(logGamma(n + 1) - logGamma(i + 1) - logGamma(n - i + 1) + i * lp + (n - i) * lq);
    }
    return Math.min(1, p);
  }
  const mu = n * p0;
  const sd = Math.sqrt(n * p0 * (1 - p0));
  return 1 - normalCdf((k - 0.5 - mu) / sd);
}

// ───────── 時間序列診斷 ─────────

export function acf(x: number[], maxLag: number): number[] {
  const n = x.length;
  const m = mean(x);
  let c0 = 0;
  for (const v of x) c0 += (v - m) * (v - m);
  const out: number[] = [];
  for (let k = 0; k <= maxLag; k++) {
    let ck = 0;
    for (let t = k; t < n; t++) ck += (x[t] - m) * (x[t - k] - m);
    out.push(c0 > 0 ? ck / c0 : 0);
  }
  return out;
}

/** PACF 以 Durbin–Levinson 遞迴計算 */
export function pacf(x: number[], maxLag: number): number[] {
  const r = acf(x, maxLag);
  const out = [1];
  let phiPrev: number[] = [];
  for (let k = 1; k <= maxLag; k++) {
    let num = r[k];
    let den = 1;
    for (let j = 1; j < k; j++) {
      num -= phiPrev[j - 1] * r[k - j];
      den -= phiPrev[j - 1] * r[j];
    }
    const phikk = Math.abs(den) < 1e-12 ? 0 : num / den;
    const phi = new Array<number>(k);
    for (let j = 1; j < k; j++) phi[j - 1] = phiPrev[j - 1] - phikk * phiPrev[k - j - 1];
    phi[k - 1] = phikk;
    phiPrev = phi;
    out.push(phikk);
  }
  return out;
}

/** Ljung–Box Q 統計量與 p 值。fitDf = 已估計 ARMA 參數數（p+q）。 */
export function ljungBox(resid: number[], lags = 10, fitDf = 0): { q: number; pValue: number; lags: number } {
  const n = resid.length;
  const L = Math.min(lags, n - 1);
  const r = acf(resid, L);
  let q = 0;
  for (let k = 1; k <= L; k++) q += (r[k] * r[k]) / (n - k);
  q *= n * (n + 2);
  const df = Math.max(1, L - fitDf);
  return { q, pValue: 1 - chiSquareCdf(q, df), lags: L };
}

/** Durbin–Watson 統計量（≈2 代表無一階自相關） */
export function durbinWatson(resid: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < resid.length; i++) {
    den += resid[i] * resid[i];
    if (i > 0) num += (resid[i] - resid[i - 1]) ** 2;
  }
  return den > 0 ? num / den : NaN;
}

/** QQ 圖資料：理論常態分位數 vs 標準化樣本分位數 */
export function qqPoints(x: number[]): { theoretical: number; sample: number }[] {
  const n = x.length;
  if (n === 0) return [];
  const m = mean(x);
  const s = std(x) || 1;
  const sorted = x.map((v) => (v - m) / s).sort((a, b) => a - b);
  return sorted.map((v, i) => ({ theoretical: normalQuantile((i + 0.5) / n), sample: v }));
}

export function histogram(x: number[], bins = 20): { x0: number; x1: number; count: number }[] {
  if (!x.length) return [];
  const lo = Math.min(...x);
  const hi = Math.max(...x);
  const w = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0 }));
  for (const v of x) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)));
    out[i].count++;
  }
  return out;
}

export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
