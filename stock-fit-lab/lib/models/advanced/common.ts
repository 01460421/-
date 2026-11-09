/**
 * 進階模型共用工具：報酬轉換、累積對數報酬 → 價格區間、Holt 線性平滑、週期圖諧波選擇。
 *
 * 報酬類模型（GARCH / EGARCH / MS-AR）一律在「對數報酬」空間建模：
 *   r_t = 100·ln(P_t / P_{t−1})      （以百分比為單位，改善最佳化的數值尺度）
 * 第 k 期價格預測：
 *   \hat P_{T+k} = P_T \exp\Big(\sum_{j=1}^{k} \mu_{T+j}\Big),
 *   區間 = P_T \exp\Big(\sum_j \mu_{T+j} \pm z\sqrt{\sum_j \sigma^2_{T+j}}\Big)
 * 其中 σ²_{T+j} 為「條件」變異數預測路徑，而不是固定 σ。
 */
import type { Forecast } from '../../types';
import { zForLevel, normalCdf, clamp } from '../../math/stats';
import { nelderMead, toUnit, fromUnit } from '../../math/optim';
import { lstsq } from '../../math/linalg';

/** 百分比對數報酬 r_t = 100·ln(P_t/P_{t−1}) */
export function pctLogReturns(p: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < p.length; i++) r.push(100 * Math.log(p[i] / p[i - 1]));
  return r;
}

/**
 * 由每期條件平均 μ_j 與條件變異數 σ²_j（皆為百分比對數報酬單位）組成累積價格預測。
 */
export function cumulativeReturnForecast(last: number, mu: number[], v: number[], level: number): Forecast {
  const z = zForLevel(level);
  const mean: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];
  let cm = 0;
  let cv = 0;
  for (let k = 0; k < mu.length; k++) {
    cm += mu[k] / 100;
    cv += Math.max(v[k], 0) / 1e4;
    const sd = Math.sqrt(cv);
    mean.push(last * Math.exp(cm));
    lower.push(last * Math.exp(cm - z * sd));
    upper.push(last * Math.exp(cm + z * sd));
  }
  return { horizon: mu.length, mean, lower, upper, level };
}

/** P(累積報酬 > 0) = Φ(Σμ / √Σσ²) */
export function cumulativePUp(mu: number[], v: number[]): number {
  const m = mu.reduce((a, b) => a + b, 0);
  const s = Math.sqrt(Math.max(v.reduce((a, b) => a + b, 0), 1e-12));
  return clamp(normalCdf(m / s), 0.001, 0.999);
}

export function signalOf(pUp: number): 'up' | 'down' | 'neutral' {
  return pUp > 0.5 ? 'up' : pUp < 0.5 ? 'down' : 'neutral';
}

// ───────────────────────── 阻尼 Holt 線性平滑（趨勢層外推用） ─────────────────────────

export interface HoltFit {
  alpha: number;
  beta: number;
  /** 趨勢阻尼 φ ∈ [0.8, 0.995]（φ → 1 為一般 Holt） */
  phi: number;
  level: number;
  trend: number;
  /** 一步預測誤差 */
  errors: number[];
  fitted: number[];
  /** k 期外推：ℓ + (φ + φ² + … + φ^k)·b */
  forecast: (k: number) => number;
}

/**
 * 阻尼 Holt 線性平滑（Gardner & McKenzie）：
 *   ℓ_t = α y_t + (1−α)(ℓ_{t−1} + φ b_{t−1}),  b_t = β(ℓ_t − ℓ_{t−1}) + (1−β) φ b_{t−1}
 *   \hat y_{t+k} = ℓ_t + (φ + … + φ^k) b_t
 * α、β、φ 以最小化一步預測 SSE 求得（logit 參數化 + Nelder–Mead）。
 * 阻尼避免把邊界處的局部斜率無限外推（股價趨勢層的常見失效）。
 */
export function holtFit(y: number[]): HoltFit {
  const n = y.length;
  const PHI_LO = 0.8;
  const PHI_HI = 0.995;
  const phiOf = (z: number) => PHI_LO + (PHI_HI - PHI_LO) * toUnit(z);
  const run = (a: number, b: number, phi: number) => {
    let l = y[0];
    let t = n > 1 ? y[1] - y[0] : 0;
    const errors: number[] = [0];
    const fitted: number[] = [y[0]];
    let sse = 0;
    for (let i = 1; i < n; i++) {
      const f = l + phi * t;
      fitted.push(f);
      const e = y[i] - f;
      errors.push(e);
      sse += e * e;
      const lPrev = l;
      l = a * y[i] + (1 - a) * (l + phi * t);
      t = b * (l - lPrev) + (1 - b) * phi * t;
    }
    return { l, t, sse, errors, fitted };
  };
  const res = nelderMead(
    (x) => run(toUnit(x[0]), toUnit(x[1]), phiOf(x[2])).sse,
    [fromUnit(0.5), fromUnit(0.1), 0],
    { maxIter: 400, step: [1, 1, 1] },
  );
  const a = toUnit(res.x[0]);
  const b = toUnit(res.x[1]);
  const phi = phiOf(res.x[2]);
  const r = run(a, b, phi);
  const forecast = (k: number) => {
    let s = 0;
    let p = 1;
    for (let i = 1; i <= k; i++) {
      p *= phi;
      s += p;
    }
    return r.l + s * r.t;
  };
  return { alpha: a, beta: b, phi, level: r.l, trend: r.t, errors: r.errors, fitted: r.fitted, forecast };
}

// ───────────────────────── 週期圖 + 諧波最小平方（中週期層外推用） ─────────────────────────

export interface HarmonicFit {
  /** 每期角頻率 ω（弧度 / 期） */
  omegas: number[];
  coef: number[];
  fitted: number[];
  /** 在索引 i 處的諧波值（可外推） */
  evalAt: (i: number) => number;
}

/**
 * 以週期圖選出能量最大的 m 個頻率（排除週期 < minPeriod 與 > n 的頻率），
 * 再以最小平方擬合 r(t) = c_0 + Σ_j (b_j cos ω_j t + c_j sin ω_j t)。
 */
export function harmonicFit(x: number[], m = 3, minPeriod = 4): HarmonicFit {
  const n = x.length;
  const mu = x.reduce((a, b) => a + b, 0) / n;
  const power: { k: number; p: number }[] = [];
  for (let k = 1; k <= Math.floor(n / 2); k++) {
    const period = n / k;
    if (period < minPeriod) continue;
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / n;
    for (let t = 0; t < n; t++) {
      re += (x[t] - mu) * Math.cos(w * t);
      im -= (x[t] - mu) * Math.sin(w * t);
    }
    power.push({ k, p: re * re + im * im });
  }
  power.sort((a, b) => b.p - a.p);
  const omegas = power.slice(0, Math.min(m, power.length)).map((q) => (2 * Math.PI * q.k) / n);
  const row = (t: number) => {
    const r = [1];
    for (const w of omegas) r.push(Math.cos(w * t), Math.sin(w * t));
    return r;
  };
  if (n < 2 * omegas.length + 2) {
    return { omegas: [], coef: [mu], fitted: x.map(() => mu), evalAt: () => mu };
  }
  const X = Array.from({ length: n }, (_, t) => row(t));
  const fit = lstsq(X, x);
  const coef = fit.coef;
  const evalAt = (t: number) => row(t).reduce((s, v, j) => s + v * coef[j], 0);
  return { omegas, coef, fitted: fit.fitted, evalAt };
}
