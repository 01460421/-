/**
 * 對數擬合（自變數取對數後線性回歸）+ RLS 線上更新
 *
 *   y = a + b·ln(s)
 *
 * 時間映射：ln 需要 s > 0，但標準化時間 τ ∈ [−1, 1] 含非正值，因此改用
 *   s(τ) = ((n−1)(τ+1)/2 + 1) / n  ⇔  s_i = (i+1)/n ,   i = 0..n−1
 * 也就是「以視窗長度標準化的交易日序號」：s ∈ [1/n, 1]，最新一筆 s = 1（ln s = 0），
 * 因此 a 恰為模型在視窗最後一天的水準，b 為「時間每乘以 e 倍」價格的變化量。
 * 外推時 s = (n+k)/n > 1，沿用同一映射（只依賴視窗長度，不使用價格統計量 → 無前視偏誤）。
 *
 * 價格空間：priceMode = 'log' 時以 ln y 為應變數（y = e^{a + b ln s} = e^a s^b，冪律成長）。
 * 求解：加權最小平方閉式解；預測區間 ŷ₀ ± z·s√(1 + x₀ᵀ(XᵀWX)⁻¹x₀)，x₀ = [1, ln s₀]。
 */
import type { Forecast, ParamSpec } from '../types';
import { BaseModel } from './base';
import { Rls, residualSigma, usableWeights, wls2 } from './linreg';
import type { RlsTrace } from './poly';

export class LogarithmicModel extends BaseModel {
  readonly id = 'log' as const;
  readonly version = '1.0.0';

  private a = 0;
  private b = 0;
  private n0 = 1;
  private rls: Rls | null = null;
  private nextIndex = 0;

  paramSpecs(): ParamSpec[] {
    return [{ key: 'forgetting', label: 'RLS 遺忘因子 λ_f', min: 0.9, max: 1, step: 0.005, default: 0.98 }];
  }

  /** τ → s(τ) = ((n−1)(τ+1)/2 + 1)/n（n 為擬合時的視窗長度） */
  private sOfTau(tau: number): number {
    return ((this.n0 - 1) * (tau + 1)) / 2 / this.n0 + 1 / this.n0;
  }

  private g(index: number): number {
    return Math.log(this.sOfTau(this.axis.tau(index)));
  }

  protected fitCore(): void {
    const n = this.y.length;
    this.n0 = n;
    const y = this.ys();
    const g = Array.from({ length: n }, (_, i) => this.g(i));
    const w = usableWeights(this.opts.weights, n);
    const r = wls2(g, y, w);
    this.a = r.a;
    this.b = r.b;
    this.sigma = residualSigma(r.rss, r.sw, 2);
    this.fittedValues = r.fitted.map((v) => this.back(v));
    this.rls = new Rls([r.a, r.b], r.cov, this.sigma, n);
    this.nextIndex = n;
  }

  update(newPoint: number): this {
    if (!this.rls) return this.fit([...this.y, newPoint], this.opts);
    if (!(newPoint > 0) || !Number.isFinite(newPoint)) throw new Error('log: 價格必須為正有限數');
    const lf = this.param('forgetting', 0.98);
    const x = [1, this.g(this.nextIndex)];
    const yv = this.priceMode === 'log' ? Math.log(newPoint) : newPoint;
    this.rls.update(x, yv, lf);
    [this.a, this.b] = this.rls.coef;
    this.sigma = this.rls.sigma;
    this.y.push(newPoint);
    this.fittedValues.push(this.back(this.a + this.b * x[1]));
    this.nextIndex++;
    return this;
  }

  getRlsTrace(): RlsTrace[] {
    return this.rls ? this.rls.trace.slice() : [];
  }

  protected predictCore(h: number, level: number): Forecast {
    const mean: number[] = [];
    const sd: number[] = [];
    for (let k = 1; k <= h; k++) {
      const x = [1, this.g(this.nextIndex - 1 + k)];
      mean.push(this.a + this.b * x[1]);
      sd.push(this.sigma * Math.sqrt(1 + (this.rls ? this.rls.leverage(x) : 0)));
    }
    return this.makeForecast(mean, sd, level);
  }

  protected describeCore() {
    return {
      name: '對數擬合',
      formulaLatex: 'y=a+b\\ln s,\\qquad s(\\tau)=\\frac{(n-1)(\\tau+1)/2+1}{n}',
      params: { a: this.a, b: this.b },
      paramSpecs: this.paramSpecs(),
      useCases: '成長逐漸放緩（邊際遞減）的長期趨勢，例如成熟產業股價或大型股長線。',
      failureModes:
        '加速上漲或反轉時明顯落後；ln s 在視窗起點附近變化最劇烈，視窗前段的極端值影響大；外推只會越來越平緩。',
      derivation:
        '因 $\\ln$ 需正自變數，令 $s_i=(i+1)/n$（等價於 $s(\\tau)=\\frac{(n-1)(\\tau+1)/2+1}{n}$），' +
        '令 $g_i=\\ln s_i$ 後成為線性回歸 $y=a+b\\,g$，以加權最小平方閉式解 ' +
        '$\\hat b=\\frac{\\sum w(g-\\bar g)(y-\\bar y)}{\\sum w(g-\\bar g)^2}$。最新一筆 $s=1$，所以 $a$ 即為視窗末端的模型水準。' +
        '預測區間 $\\hat y_0\\pm z\\,s\\sqrt{1+x_0^\\top(X^\\top WX)^{-1}x_0}$。線上更新採 RLS。',
      diagnostics: {
        sMapping: 's=(i+1)/n',
        rlsSteps: this.rls ? this.rls.trace.length : 0,
      },
    };
  }
}
