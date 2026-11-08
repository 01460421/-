/**
 * EGARCH(1,1)（Nelson 1991）：對數變異數形式，允許「槓桿效應」（下跌比上漲更推升波動）。
 *
 *   r_t = \mu + \sigma_t z_t,\quad z_t \sim N(0,1)
 *   \ln\sigma_t^2 = \omega + \alpha\big(|z_{t-1}| - \sqrt{2/\pi}\big) + \gamma z_{t-1} + \beta\ln\sigma_{t-1}^2
 *   限制：|β| < 1（以 β = 0.9999·tanh(θ) 參數化）；ω、α、γ 無符號限制，σ² 恆為正。
 *
 * 估計：高斯 MLE + Nelder–Mead。
 * 多步預測：ln σ² 的條件分布沒有封閉式期望，故以固定種子蒙地卡羅（預設 2000 條路徑）
 * 模擬 z 的未來路徑，取 E[σ²_{T+k}] 的樣本平均作為條件變異數路徑，
 * 再如同 GARCH 以累積變異數決定價格區間寬度。
 */
import type { DirectionOutput, Forecast, ParamSpec } from '../../types';
import { BaseModel } from '../base';
import { nelderMead } from '../../math/optim';
import { mean, variance, ljungBox } from '../../math/stats';
import { normalGenerator } from '../../math/random';
import { pctLogReturns, cumulativeReturnForecast, cumulativePUp, signalOf } from './common';

const SQRT_2_PI = Math.sqrt(2 / Math.PI);

export interface EgarchParams {
  mu: number;
  omega: number;
  alpha: number;
  gamma: number;
  beta: number;
}

const clampLog = (v: number) => Math.min(Math.max(v, -30), 30);

export function egarchFilter(r: number[], p: EgarchParams): { logS2: number[]; nll: number } {
  const n = r.length;
  const ls = new Array<number>(n);
  ls[0] = Math.log(Math.max(variance(r, 0), 1e-8));
  let nll = 0;
  for (let t = 0; t < n; t++) {
    if (t > 0) {
      const zPrev = (r[t - 1] - p.mu) / Math.exp(0.5 * ls[t - 1]);
      ls[t] = clampLog(p.omega + p.alpha * (Math.abs(zPrev) - SQRT_2_PI) + p.gamma * zPrev + p.beta * ls[t - 1]);
    }
    const e = r[t] - p.mu;
    nll += 0.5 * (Math.log(2 * Math.PI) + ls[t] + (e * e) / Math.exp(ls[t]));
  }
  return { logS2: ls, nll };
}

function unpack(x: number[]): EgarchParams {
  return { mu: x[0], omega: x[1], alpha: x[2], gamma: x[3], beta: 0.9999 * Math.tanh(x[4]) };
}

export function fitEgarch(r: number[]): { params: EgarchParams; nll: number } {
  const lv = Math.log(Math.max(variance(r, 0), 1e-8));
  const mu0 = mean(r);
  let best: { x: number[]; fx: number } | null = null;
  for (const b0 of [0.95, 0.8]) {
    const x0 = [mu0, (1 - b0) * lv, 0.1, -0.05, Math.atanh(b0 / 0.9999)];
    const f = (x: number[]) => egarchFilter(r, unpack(x)).nll;
    const a = nelderMead(f, x0, { maxIter: 2000, tol: 1e-10, step: [0.05, 0.1, 0.05, 0.05, 0.3] });
    const b = nelderMead(f, a.x, { maxIter: 2000, tol: 1e-12, step: [0.02, 0.05, 0.02, 0.02, 0.1] });
    const c = b.fx <= a.fx ? b : a;
    if (!best || c.fx < best.fx) best = { x: c.x, fx: c.fx };
  }
  return { params: unpack(best!.x), nll: best!.fx };
}

export class EgarchModel extends BaseModel {
  readonly id = 'egarch' as const;
  readonly version = '1.0.0';

  private r: number[] = [];
  private p: EgarchParams = { mu: 0, omega: 0, alpha: 0.1, gamma: 0, beta: 0.9 };
  private logS2: number[] = [];
  private logS2Next = 0;
  private nll = 0;

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'paths', label: '變異數預測蒙地卡羅路徑數', min: 200, max: 10000, step: 100, default: 2000 },
      { key: 'zeroMean', label: '強制 μ = 0（1 = 是）', min: 0, max: 1, step: 1, default: 0 },
    ];
  }

  protected fitCore(): void {
    this.r = pctLogReturns(this.y);
    if (this.r.length < 30) {
      const v = this.r.length > 1 ? variance(this.r, 1) : 1;
      this.p = { mu: this.r.length ? mean(this.r) : 0, omega: Math.log(Math.max(v, 1e-8)), alpha: 0, gamma: 0, beta: 0 };
      this.degraded = '報酬樣本 < 30，EGARCH 無法可靠估計，降級為常數變異數';
    } else {
      const res = fitEgarch(this.r);
      this.p = res.params;
      if (this.param('zeroMean', 0) === 1) this.p.mu = 0;
      if (!Number.isFinite(res.nll) || res.nll > 1e299) this.degraded = 'EGARCH 概似最佳化失敗';
      else if (Math.abs(this.p.beta) > 0.998) this.degraded = `|β| = ${Math.abs(this.p.beta).toFixed(4)} 接近 1，對數變異數近似單根`;
    }
    const f = egarchFilter(this.r, this.p);
    this.logS2 = f.logS2;
    this.nll = f.nll;
    const n = this.r.length;
    if (n > 0) {
      const z = (this.r[n - 1] - this.p.mu) / Math.exp(0.5 * this.logS2[n - 1]);
      this.logS2Next = clampLog(this.p.omega + this.p.alpha * (Math.abs(z) - SQRT_2_PI) + this.p.gamma * z + this.p.beta * this.logS2[n - 1]);
    } else this.logS2Next = this.p.omega;
    this.fittedValues = this.y.map((v, i) => (i === 0 ? v : this.y[i - 1] * Math.exp(this.p.mu / 100)));
    this.sigma = Math.sqrt(variance(this.r, 1) || 0) / 100;
  }

  /** 蒙地卡羅估計 E[σ²_{T+k}]，k = 1..h（σ²_{T+1} 為已知值） */
  variancePath(h: number): number[] {
    const N = Math.max(200, Math.round(this.param('paths', 2000)));
    const gen = normalGenerator(this.opts.seed ?? 42);
    const acc = new Array<number>(h).fill(0);
    for (let s = 0; s < N; s++) {
      let ls = this.logS2Next;
      for (let k = 0; k < h; k++) {
        acc[k] += Math.exp(ls);
        const z = gen();
        ls = clampLog(this.p.omega + this.p.alpha * (Math.abs(z) - SQRT_2_PI) + this.p.gamma * z + this.p.beta * ls);
      }
    }
    return acc.map((v) => v / N);
  }

  protected predictCore(h: number, level: number): Forecast {
    return cumulativeReturnForecast(this.last(), new Array<number>(h).fill(this.p.mu), this.variancePath(h), level);
  }

  direction(h: number): DirectionOutput {
    const hh = Math.max(1, Math.floor(h));
    const pUp = cumulativePUp(new Array<number>(hh).fill(this.p.mu), this.variancePath(hh));
    return { pUp, signal: signalOf(pUp) };
  }

  conditionalSigma(): number[] {
    return this.logS2.map((v) => Math.exp(0.5 * v));
  }

  getParams(): EgarchParams {
    return { ...this.p };
  }

  protected describeCore() {
    const n = this.r.length;
    const z = this.r.map((v, i) => (v - this.p.mu) / Math.exp(0.5 * this.logS2[i]));
    const lbSq = n > 20 ? ljungBox(z.map((v) => v * v), 10, 3) : { q: NaN, pValue: NaN, lags: 10 };
    const k = 5;
    return {
      name: 'EGARCH(1,1) 指數型條件異質變異數模型',
      formulaLatex:
        '\\ln\\sigma_t^2=\\omega+\\alpha\\big(|z_{t-1}|-\\sqrt{2/\\pi}\\big)+\\gamma z_{t-1}+\\beta\\ln\\sigma_{t-1}^2',
      params: { mu: this.p.mu, omega: this.p.omega, alpha: this.p.alpha, gamma: this.p.gamma, beta: this.p.beta },
      paramSpecs: this.paramSpecs(),
      useCases: '下跌時波動放大較明顯（槓桿效應，γ < 0）的個股與指數；需要不對稱波動反應的風險區間。',
      failureModes:
        '與 GARCH 相同不預測方向；多步預測需蒙地卡羅（結果依種子與路徑數有微小抽樣誤差）；|β| → 1 時對數變異數近單根、區間外推不穩。',
      derivation:
        '對數變異數形式使 $\\sigma_t^2>0$ 自動成立，無需非負限制；$\\gamma$ 捕捉正負衝擊的不對稱。' +
        '以 $\\beta=0.9999\\tanh(\\theta)$ 確保 $|\\beta|<1$，最大化高斯概似 $\\ell=-\\tfrac12\\sum[\\ln2\\pi+\\ln\\sigma_t^2+\\varepsilon_t^2/\\sigma_t^2]$。' +
        '多步預測模擬 $z_{T+j}\\sim N(0,1)$ 推進 $\\ln\\sigma^2$，取 $E[\\sigma^2_{T+k}]$ 的樣本平均，價格區間 $P_T\\exp(k\\mu\\pm z\\sqrt{\\sum_j E[\\sigma^2_{T+j}]})$。',
      diagnostics: {
        omega: this.p.omega,
        alpha: this.p.alpha,
        gamma: this.p.gamma,
        beta: this.p.beta,
        mu: this.p.mu,
        persistence: this.p.beta,
        leverage: this.p.gamma < 0,
        nextSigmaPct: Math.exp(0.5 * this.logS2Next),
        conditionalSigmaTail: this.logS2.slice(-30).map((v) => Math.exp(0.5 * v)),
        logLik: -this.nll,
        aic: 2 * k + 2 * this.nll,
        bic: k * Math.log(Math.max(n, 1)) + 2 * this.nll,
        ljungBoxSqStdResidP: lbSq.pValue,
        weighted: false,
      },
    };
  }
}
