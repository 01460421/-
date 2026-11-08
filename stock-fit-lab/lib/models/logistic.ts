/**
 * Logistic 成長曲線（Levenberg–Marquardt 非線性最小平方）
 *
 *   y = \frac{L}{1+e^{-k(τ−τ_0)}} ,   τ ∈ [−1, 1]
 *
 * L：飽和上限（k < 0 時為左側漸近線）；k：成長速率（每單位 τ）；τ₀：反曲點位置。
 *
 * 初始值：對多個候選 L₀ ∈ {1.02, 1.1, 1.3, 1.6, 2.2, 3.5, 6}·max(y)，以 logit 轉換
 *   z = ln(y / (L₀ − y)) = kτ − kτ₀
 * 做線性回歸得到 (k₀, τ₀)，取 RSS 最小的一組作為 LM 起點。
 * LM：(JᵀWJ + λ·diag(JᵀWJ)) δ = JᵀW r，邊界 L ∈ [0.5·max y, 50·max y]、|k| ≤ 60、|τ₀| ≤ 20（投影法）。
 *
 * 降級策略（設定 degraded 說明並改用加權線性回歸）：
 *  - LM 未收斂、參數非有限或觸及邊界（L 觸上界代表仍處於指數段，L 無法辨識；|k| 觸界代表退化為階梯）；
 *  - logistic 的 RSS 比線性回歸差 25% 以上；
 *  - 模型空間的值非正（priceMode = 'log' 且價格 ≤ 1 時 ln y ≤ 0，logistic 無定義）。
 *
 * 預測區間（delta method）：Var(ŷ₀) = s²(1 + g₀ᵀ(JᵀWJ)⁻¹g₀)，g₀ = ∂f/∂(L,k,τ₀) 於 τ₀ 處。
 */
import type { Forecast, ParamSpec } from '../types';
import { BaseModel } from './base';
import { levenbergMarquardt } from '../math/optim';
import { inverse, dot, matvec } from '../math/linalg';
import { residualSigma, usableWeights, wls2 } from './linreg';

const K_MAX = 60;
const T_MAX = 20;
const L_UP = 50;

function logisticF(t: number, p: number[]): number {
  return p[0] / (1 + Math.exp(-p[1] * (t - p[2])));
}

/** ∂f/∂(L, k, τ₀) 解析梯度 */
function logisticGrad(t: number, p: number[]): number[] {
  const [L, k, t0] = p;
  const e = Math.exp(-k * (t - t0));
  if (!Number.isFinite(e)) return [0, 0, 0];
  const d = 1 + e;
  return [1 / d, (L * e * (t - t0)) / (d * d), (-L * e * k) / (d * d)];
}

export class LogisticModel extends BaseModel {
  readonly id = 'logistic' as const;
  readonly version = '1.0.0';

  private p: number[] = [1, 0, 0];
  private lin: { a: number; b: number; cov: number[][] } | null = null;
  private covP: number[][] = [];
  private iterations = 0;
  private converged = false;
  private rssLogistic = NaN;
  private rssLinear = NaN;

  paramSpecs(): ParamSpec[] {
    return [{ key: 'maxIter', label: 'LM 最大迭代次數', min: 20, max: 500, step: 10, default: 150 }];
  }

  protected fitCore(): void {
    const y = this.ys();
    const n = y.length;
    const taus = this.axis.train;
    const w = usableWeights(this.opts.weights, n);

    // 線性基準（同時是降級後的模型）
    const lr = wls2(taus, y, w);
    this.rssLinear = lr.rss;
    const fallbackToLinear = (msg: string) => {
      this.degraded = msg;
      this.lin = { a: lr.a, b: lr.b, cov: lr.cov };
      this.sigma = residualSigma(lr.rss, lr.sw, 2);
      this.fittedValues = lr.fitted.map((v) => this.back(v));
    };
    this.lin = null;
    this.converged = false;
    this.iterations = 0;
    this.rssLogistic = NaN;

    if (y.some((v) => !(v > 0))) {
      fallbackToLinear('模型空間出現非正值（log 模式下價格 ≤ 1），logistic 無定義，改用線性回歸');
      return;
    }

    const ymax = Math.max(...y);
    const rssOf = (p: number[]) => {
      let s = 0;
      for (let i = 0; i < n; i++) {
        const r = y[i] - logisticF(taus[i], p);
        s += (w ? w[i] : 1) * r * r;
      }
      return Number.isFinite(s) ? s : Infinity;
    };

    // 多起點 logit 線性化初始值
    let best: number[] | null = null;
    let bestRss = Infinity;
    for (const f of [1.02, 1.1, 1.3, 1.6, 2.2, 3.5, 6]) {
      const L0 = ymax * f;
      const z = y.map((v) => Math.log(v / (L0 - v)));
      if (z.some((v) => !Number.isFinite(v))) continue;
      const zr = wls2(taus, z, w);
      const k0 = Math.max(-K_MAX * 0.9, Math.min(K_MAX * 0.9, zr.b));
      if (Math.abs(k0) < 1e-6) continue;
      const t00 = Math.max(-T_MAX * 0.9, Math.min(T_MAX * 0.9, -zr.a / k0));
      const p0 = [L0, k0, t00];
      const r = rssOf(p0);
      if (r < bestRss) {
        bestRss = r;
        best = p0;
      }
    }
    if (!best) {
      fallbackToLinear('無法取得 logistic 初始值（序列近乎水平），改用線性回歸');
      return;
    }

    const lm = levenbergMarquardt(logisticF, taus, y, best, {
      maxIter: Math.round(this.param('maxIter', 150)),
      tol: 1e-9,
      lower: [0.5 * ymax, -K_MAX, -T_MAX],
      upper: [L_UP * ymax, K_MAX, T_MAX],
      weights: w,
    });
    this.iterations = lm.iterations;
    this.converged = lm.converged;
    this.rssLogistic = lm.rss;
    const [L, k, t0] = lm.params;
    const sw = w ? w.reduce((a, b) => a + b, 0) : n;

    if (!lm.converged) return fallbackToLinear(`LM 於 ${lm.iterations} 次迭代內未收斂，改用線性回歸`);
    if (!lm.params.every(Number.isFinite) || !Number.isFinite(lm.rss)) return fallbackToLinear('LM 產生非有限參數，改用線性回歸');
    if (L >= L_UP * ymax * 0.999) return fallbackToLinear('L 觸及上界：資料仍處於指數成長段，飽和上限無法辨識，改用線性回歸');
    if (Math.abs(k) >= K_MAX * 0.999) return fallbackToLinear('|k| 觸及邊界：曲線退化為階梯函數，改用線性回歸');
    if (Math.abs(t0) >= T_MAX * 0.999) return fallbackToLinear('反曲點 τ₀ 遠離資料範圍，參數無法辨識，改用線性回歸');
    if (lm.rss > 1.25 * lr.rss) return fallbackToLinear('logistic 殘差平方和比線性回歸差 25% 以上，改用線性回歸');

    this.p = lm.params.slice();
    this.sigma = residualSigma(lm.rss, sw, 3);
    this.fittedValues = taus.map((t) => this.back(logisticF(t, this.p)));
    // JᵀWJ 於最終參數（解析梯度）
    const JtJ = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let i = 0; i < n; i++) {
      const g = logisticGrad(taus[i], this.p);
      const wi = w ? w[i] : 1;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) JtJ[a][b] += wi * g[a] * g[b];
    }
    this.covP = inverse(JtJ);
  }

  protected predictCore(h: number, level: number): Forecast {
    const mean: number[] = [];
    const sd: number[] = [];
    const nIdx = this.y.length - 1;
    for (let i = 1; i <= h; i++) {
      const tau = this.axis.tau(nIdx + i);
      if (this.lin) {
        const x = [1, tau];
        mean.push(this.lin.a + this.lin.b * tau);
        sd.push(this.sigma * Math.sqrt(1 + Math.max(dot(x, matvec(this.lin.cov, x)), 0)));
      } else {
        const g = logisticGrad(tau, this.p);
        const lev = Math.max(dot(g, matvec(this.covP, g)), 0);
        mean.push(logisticF(tau, this.p));
        sd.push(this.sigma * Math.sqrt(1 + (Number.isFinite(lev) ? lev : 0)));
      }
    }
    return this.makeForecast(mean, sd, level);
  }

  /** 已擬合參數（模型空間）；降級時回傳 null */
  getParams(): { L: number; k: number; tau0: number } | null {
    return this.lin ? null : { L: this.p[0], k: this.p[1], tau0: this.p[2] };
  }

  protected describeCore() {
    const n = this.axis.n;
    const params: Record<string, number | string> = this.lin
      ? { fallback: 'linear', a: this.lin.a, b: this.lin.b }
      : {
          L: this.p[0],
          k: this.p[1],
          tau0: this.p[2],
          /** 反曲點對應的視窗索引（可能落在視窗外） */
          inflectionIndex: ((this.p[2] + 1) * (n - 1)) / 2,
        };
    return {
      name: 'Logistic 成長曲線',
      formulaLatex: 'y=\\frac{L}{1+e^{-k(\\tau-\\tau_0)}}',
      params,
      paramSpecs: this.paramSpecs(),
      useCases: '題材或產業滲透率接近飽和、漲勢逐步趨緩的 S 形走勢；判斷是否接近天花板 L。',
      failureModes:
        '資料尚未出現減速時 L 無法辨識（只看到指數段）；盤整或下跌段強行套用會得到無意義參數；' +
        '對雜訊敏感，反曲點 τ₀ 估計不穩。失敗時自動降級為線性回歸並標示。',
      derivation:
        '以 Levenberg–Marquardt 解 $\\min_{L,k,\\tau_0}\\sum w_i\\,(y_i-f(\\tau_i))^2$：' +
        '$(J^\\top WJ+\\lambda\\,\\mathrm{diag}(J^\\top WJ))\\delta=J^\\top Wr$，成功時 $\\lambda\\leftarrow\\lambda/10$，失敗時 $\\lambda\\leftarrow10\\lambda$。' +
        '初始值由 logit 線性化 $\\ln\\frac{y}{L_0-y}=k\\tau-k\\tau_0$ 於多個候選 $L_0$ 中取最佳。' +
        '預測區間以 delta method：$\\mathrm{Var}(\\hat y_0)=s^2(1+g_0^\\top(J^\\top WJ)^{-1}g_0)$。',
      diagnostics: {
        lmIterations: this.iterations,
        lmConverged: this.converged,
        rssLogistic: Number.isFinite(this.rssLogistic) ? this.rssLogistic : -1,
        rssLinear: this.rssLinear,
        fallbackLinear: !!this.lin,
      },
    };
  }
}
