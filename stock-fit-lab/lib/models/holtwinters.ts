/**
 * Holt–Winters 加法型三參數指數平滑（水準 ℓ、趨勢 b、季節 s）
 *
 *   ℓ_t = α(y_t − s_{t−m}) + (1−α)(ℓ_{t−1} + b_{t−1})
 *   b_t = β(ℓ_t − ℓ_{t−1}) + (1−β) b_{t−1}
 *   s_t = γ(y_t − ℓ_t) + (1−γ) s_{t−m}
 *   ŷ_{t+h|t} = ℓ_t + h·b_t + s_{t+h−m(⌊(h−1)/m⌋+1)}
 *
 * m = 季節長度（預設 5 = 一個交易週；m ≤ 1 或資料 < 2m+2 筆時退化為 Holt 雙參數，γ 固定 0）。
 * 初始化（古典分解法）：ℓ、b 由前兩季平均差估計，s_i = y_i − (ℓ̄₁ + b₀(i − (m−1)/2))，再中心化使 Σs = 0。
 * 參數估計：最小化一步預測加權 SSE = Σ w_t (y_t − ŷ_{t|t−1})²，
 *   以 Nelder–Mead 在 logit 空間（α, β, γ ∈ (0,1) ↔ ℝ）無約束搜尋，兩個起點、迭代上限 250。
 * 預測區間（Hyndman et al. 2008 的 ETS(A,A,A) 解析近似）：
 *   Var(e_{t+h}) = σ²[1 + Σ_{j=1}^{h−1} c_j²],  c_j = α(1 + jβ) + γ(1−α)·1{j mod m = 0}
 * 時間軸：遞迴模型以交易日為步長（不使用 τ），斜率 b 的單位為「每交易日」。
 * update(newPoint)：以既有 α, β, γ 執行一步遞迴（真正的線上更新，不重新最佳化）。
 */
import type { Forecast, ParamSpec } from '../types';
import { BaseModel } from './base';
import { nelderMead, toUnit, fromUnit } from '../math/optim';
import { usableWeights } from './linreg';

interface HWRun {
  sse: number;
  wsum: number;
  fitted: number[];
  level: number;
  trend: number;
  /** 季節分量，以絕對時間索引 */
  season: number[];
}

export class HoltWintersModel extends BaseModel {
  readonly id = 'holtwinters' as const;
  readonly version = '1.0.0';

  private alpha = 0.3;
  private beta = 0.05;
  private gamma = 0.1;
  private m = 5;
  private seasonal = true;
  private level = 0;
  private trend = 0;
  private season: number[] = [];
  private sseOpt = 0;
  private naiveSse = 0;
  private dof = 1;
  private nmIterations = 0;

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'season', label: '季節長度 m（交易日；≤1 = 無季節）', min: 0, max: 60, step: 1, default: 5 },
      { key: 'alpha', label: 'α 水準平滑（−1 = 自動）', min: -1, max: 1, step: 0.01, default: -1, auto: true },
      { key: 'beta', label: 'β 趨勢平滑（−1 = 自動）', min: -1, max: 1, step: 0.01, default: -1, auto: true },
      { key: 'gamma', label: 'γ 季節平滑（−1 = 自動）', min: -1, max: 1, step: 0.01, default: -1, auto: true },
    ];
  }

  /** 執行整段遞迴；回傳一步預測加權 SSE 與最終狀態 */
  private run(y: number[], a: number, b: number, g: number, w: number[] | undefined, m: number): HWRun {
    const n = y.length;
    const fitted = new Array<number>(n);
    const season = new Array<number>(n).fill(0);
    let level: number;
    let trend: number;
    let start: number;
    if (this.seasonal) {
      let m1 = 0;
      let m2 = 0;
      for (let i = 0; i < m; i++) {
        m1 += y[i] / m;
        m2 += y[i + m] / m;
      }
      trend = (m2 - m1) / m;
      let sm = 0;
      for (let i = 0; i < m; i++) {
        const base = m1 + trend * (i - (m - 1) / 2);
        season[i] = y[i] - base;
        sm += season[i] / m;
        fitted[i] = base;
      }
      for (let i = 0; i < m; i++) season[i] -= sm;
      level = m1 + (trend * (m - 1)) / 2;
      start = m;
    } else {
      level = y[0];
      trend = n > 1 ? y[1] - y[0] : 0;
      fitted[0] = y[0];
      start = 1;
      m = 1;
    }
    let sse = 0;
    let wsum = 0;
    for (let t = start; t < n; t++) {
      const sPrev = this.seasonal ? season[t - m] : 0;
      const pred = level + trend + sPrev;
      fitted[t] = pred;
      const e = y[t] - pred;
      const wt = w ? w[t] : 1;
      sse += wt * e * e;
      wsum += wt;
      const newLevel = a * (y[t] - sPrev) + (1 - a) * (level + trend);
      trend = b * (newLevel - level) + (1 - b) * trend;
      level = newLevel;
      if (this.seasonal) season[t] = g * (y[t] - level) + (1 - g) * sPrev;
    }
    return { sse, wsum, fitted, level, trend, season };
  }

  protected fitCore(): void {
    const y = this.ys();
    const n = y.length;
    const w = usableWeights(this.opts.weights, n);
    let m = Math.round(this.param('season', 5));
    this.seasonal = m >= 2 && n >= 2 * m + 2;
    if (m >= 2 && !this.seasonal) this.degraded = `資料筆數 ${n} 不足兩個完整季節（m=${m}），退化為 Holt 雙參數（無季節）`;
    if (!this.seasonal) m = 1;
    this.m = m;

    const fixedA = this.param('alpha', -1);
    const fixedB = this.param('beta', -1);
    const fixedG = this.param('gamma', -1);
    const isFixed = (v: number) => v >= 0 && v <= 1;
    const clampU = (v: number) => Math.min(Math.max(v, 1e-4), 0.9999);

    // 自由參數向量（logit 空間）
    const free: ('a' | 'b' | 'g')[] = [];
    if (!isFixed(fixedA)) free.push('a');
    if (!isFixed(fixedB)) free.push('b');
    if (this.seasonal && !isFixed(fixedG)) free.push('g');
    const unpack = (z: number[]) => {
      const get = (k: 'a' | 'b' | 'g', fixed: number) => {
        const idx = free.indexOf(k);
        return idx >= 0 ? clampU(toUnit(z[idx])) : clampU(fixed);
      };
      return { a: get('a', fixedA), b: get('b', fixedB), g: this.seasonal ? get('g', fixedG) : 0 };
    };
    const objective = (z: number[]) => {
      const p = unpack(z);
      return this.run(y, p.a, p.b, p.g, w, m).sse;
    };

    let best = { a: clampU(fixedA), b: clampU(fixedB), g: this.seasonal ? clampU(fixedG) : 0 };
    this.nmIterations = 0;
    if (free.length) {
      const starts = [
        { a: 0.3, b: 0.05, g: 0.1 },
        { a: 0.8, b: 0.01, g: 0.05 },
      ];
      let bestF = Infinity;
      for (const s of starts) {
        const z0 = free.map((k) => fromUnit(s[k]));
        const res = nelderMead(objective, z0, { maxIter: 250, tol: 1e-8, step: free.map(() => 0.8) });
        this.nmIterations += res.iterations;
        if (res.fx < bestF) {
          bestF = res.fx;
          best = unpack(res.x);
        }
      }
    }
    this.alpha = best.a;
    this.beta = best.b;
    this.gamma = best.g;

    const r = this.run(y, this.alpha, this.beta, this.gamma, w, m);
    this.level = r.level;
    this.trend = r.trend;
    this.season = r.season;
    this.sseOpt = r.sse;
    const k = free.length + 2 + (this.seasonal ? m - 1 : 0);
    this.dof = Math.max(r.wsum - k, 1);
    this.sigma = Math.sqrt(r.sse / this.dof);
    this.fittedValues = r.fitted.map((v) => this.back(v));
    // 對照：naive（y_{t−1}）的一步 SSE
    let ns = 0;
    const start = this.seasonal ? m : 1;
    for (let t = start; t < n; t++) ns += (w ? w[t] : 1) * (y[t] - y[t - 1]) ** 2;
    this.naiveSse = ns;
  }

  /** 以既有 α, β, γ 執行一步遞迴（線上更新） */
  update(newPoint: number): this {
    if (!(newPoint > 0) || !Number.isFinite(newPoint)) throw new Error('holtwinters: 價格必須為正有限數');
    const yv = this.priceMode === 'log' ? Math.log(newPoint) : newPoint;
    const t = this.y.length;
    const m = this.m;
    const sPrev = this.seasonal ? this.season[t - m] : 0;
    const pred = this.level + this.trend + sPrev;
    const e = yv - pred;
    const newLevel = this.alpha * (yv - sPrev) + (1 - this.alpha) * (this.level + this.trend);
    this.trend = this.beta * (newLevel - this.level) + (1 - this.beta) * this.trend;
    this.level = newLevel;
    this.season[t] = this.seasonal ? this.gamma * (yv - this.level) + (1 - this.gamma) * sPrev : 0;
    this.y.push(newPoint);
    this.fittedValues.push(this.back(pred));
    // σ² 以累積平均更新
    this.sigma = Math.sqrt((this.sigma * this.sigma * this.dof + e * e) / (this.dof + 1));
    this.dof += 1;
    return this;
  }

  protected predictCore(h: number, level: number): Forecast {
    const n = this.y.length;
    const m = this.m;
    const mean: number[] = [];
    const sd: number[] = [];
    let cumC2 = 0;
    for (let k = 1; k <= h; k++) {
      const s = this.seasonal ? this.season[n - m + ((k - 1) % m)] : 0;
      mean.push(this.level + k * this.trend + s);
      if (k > 1) {
        const j = k - 1;
        const c = this.alpha * (1 + j * this.beta) + (this.seasonal && j % m === 0 ? this.gamma * (1 - this.alpha) : 0);
        cumC2 += c * c;
      }
      sd.push(this.sigma * Math.sqrt(1 + cumC2));
    }
    return this.makeForecast(mean, sd, level);
  }

  /** 目前狀態（模型空間） */
  getState(): { level: number; trend: number; season: number[] } {
    const n = this.y.length;
    return { level: this.level, trend: this.trend, season: this.seasonal ? this.season.slice(n - this.m, n) : [] };
  }

  protected describeCore() {
    const st = this.getState();
    return {
      name: 'Holt–Winters 三參數指數平滑',
      formulaLatex:
        '\\begin{aligned}\\ell_t&=\\alpha(y_t-s_{t-m})+(1-\\alpha)(\\ell_{t-1}+b_{t-1})\\\\' +
        'b_t&=\\beta(\\ell_t-\\ell_{t-1})+(1-\\beta)b_{t-1}\\\\' +
        's_t&=\\gamma(y_t-\\ell_t)+(1-\\gamma)s_{t-m}\\\\' +
        '\\hat y_{t+h|t}&=\\ell_t+h\\,b_t+s_{t+h-m}\\end{aligned}',
      params: {
        alpha: this.alpha,
        beta: this.beta,
        gamma: this.gamma,
        season: this.seasonal ? this.m : 0,
        level: st.level,
        trend: st.trend,
        seasonal: st.season,
      },
      paramSpecs: this.paramSpecs(),
      useCases: '有穩定趨勢與固定長度週期（例如週內效應、月營收節奏）的序列；短期（數日）預測。',
      failureModes:
        '股價的季節性通常很弱，γ 會被估得很小；趨勢外推為直線，轉折時落後；跳空或結構性改變後需要數期才能追上。',
      derivation:
        '以一步預測誤差平方和 $\\mathrm{SSE}=\\sum_t w_t(y_t-\\hat y_{t|t-1})^2$ 為目標，' +
        '將 $\\alpha,\\beta,\\gamma$ 以 $\\mathrm{logit}$ 映射到實數軸後用 Nelder–Mead 最小化。' +
        '預測變異數採 ETS(A,A,A) 解析近似 $\\sigma_h^2=\\sigma^2[1+\\sum_{j=1}^{h-1}c_j^2]$，' +
        '$c_j=\\alpha(1+j\\beta)+\\gamma(1-\\alpha)\\mathbf 1\\{j\\bmod m=0\\}$。',
      diagnostics: {
        sse: this.sseOpt,
        naiveSse: this.naiveSse,
        sseRatioVsNaive: this.naiveSse > 0 ? this.sseOpt / this.naiveSse : 1,
        seasonal: this.seasonal,
        nelderMeadIterations: this.nmIterations,
      },
    };
  }
}
