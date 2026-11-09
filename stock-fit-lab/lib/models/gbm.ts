/**
 * 幾何布朗運動（GBM）蒙地卡羅
 *
 *   dS_t = μ S_t dt + σ S_t dW_t
 *   ⇒ S_{t+1} = S_t · exp((μ − σ²/2)Δt + σ√Δt · Z),  Z ~ N(0, 1),  Δt = 1 交易日
 *
 * 參數估計（最近 N 筆對數報酬 r_t = ln(P_t/P_{t−1})，N 預設 60，可加權）：
 *   σ̂² = Σw(r − r̄)² / (W − W₂/W)（W = Σw、W₂ = Σw²；未加權時即 /(N−1)），μ̂ = r̄ + σ̂²/2（因 E[r] = μ − σ²/2）
 * 模擬：固定種子（opts.seed，預設 20240607）產生 1000 條路徑，
 *   點預測 = 路徑平均（E[S_h] 的蒙地卡羅估計），區間 = 路徑的 (1−level)/2 與 (1+level)/2 分位數
 *   （level = 0.9 即 5%–95% 分位帶）。
 * 方向機率：P(up) = 第 h 期模擬價格高於最後觀測價的路徑比例（覆寫 direction）。
 *
 * 本模型本質上是對數報酬模型：priceMode 不影響結果。時間以交易日為步長（不使用 τ）。
 * update()：滾動視窗重估 μ̂、σ̂ 並清除模擬快取（成本極低）。
 */
import type { DirectionOutput, Forecast, ParamSpec } from '../types';
import { BaseModel } from './base';
import { normalGenerator } from '../math/random';
import { clamp } from '../math/stats';
import { usableWeights } from './linreg';

const DEFAULT_SEED = 20240607;

export class GBMModel extends BaseModel {
  readonly id = 'gbm' as const;
  readonly version = '1.0.0';

  private mu = 0;
  private sig = 0;
  private lookback = 60;
  private nPaths = 1000;
  /** 模擬快取：paths[p][k] = 第 p 條路徑第 k+1 期價格 */
  private sim: Float64Array[] = [];
  private simH = 0;

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'lookback', label: '估計視窗 N（最近 N 筆對數報酬）', min: 10, max: 1000, step: 1, default: 60 },
      { key: 'paths', label: '模擬路徑數', min: 200, max: 5000, step: 100, default: 1000 },
    ];
  }

  protected fitCore(): void {
    const y = this.y;
    const n = y.length;
    const N = Math.max(2, Math.min(n - 1, Math.round(this.param('lookback', 60))));
    this.lookback = N;
    this.nPaths = Math.max(100, Math.min(20000, Math.round(this.param('paths', 1000))));
    const wAll = usableWeights(this.opts.weights, n);
    const r: number[] = [];
    const w: number[] = [];
    for (let i = n - N; i < n; i++) {
      r.push(Math.log(y[i] / y[i - 1]));
      w.push(wAll ? wAll[i] : 1);
    }
    const W = w.reduce((a, b) => a + b, 0);
    const W2 = w.reduce((a, b) => a + b * b, 0);
    const rbar = r.reduce((s, v, i) => s + w[i] * v, 0) / W;
    let ss = 0;
    for (let i = 0; i < r.length; i++) ss += w[i] * (r[i] - rbar) ** 2;
    // 加權不偏變異數（可靠度權重）：Σw(r−r̄)² / (W − W₂/W)
    const denom = W - W2 / W;
    const s2 = denom > 0 ? ss / denom : 0;
    this.sig = Math.sqrt(Math.max(s2, 0));
    this.mu = rbar + s2 / 2;
    this.sigma = this.sig;
    const g = Math.exp(this.mu);
    this.fittedValues = y.map((v, i) => (i === 0 ? v : y[i - 1] * g));
    this.sim = [];
    this.simH = 0;
  }

  private ensureSim(h: number): void {
    if (this.simH >= h && this.sim.length) return;
    const H = Math.max(h, 60);
    const z = normalGenerator(this.opts.seed ?? DEFAULT_SEED);
    const drift = this.mu - 0.5 * this.sig * this.sig;
    const s0 = this.last();
    this.sim = [];
    for (let p = 0; p < this.nPaths; p++) {
      const path = new Float64Array(H);
      let lnS = Math.log(s0);
      for (let k = 0; k < H; k++) {
        lnS += drift + this.sig * z();
        path[k] = Math.exp(lnS);
      }
      this.sim.push(path);
    }
    this.simH = H;
  }

  private column(k: number): Float64Array {
    const col = new Float64Array(this.sim.length);
    for (let p = 0; p < this.sim.length; p++) col[p] = this.sim[p][k];
    col.sort();
    return col;
  }

  protected predictCore(h: number, level: number): Forecast {
    this.ensureSim(h);
    const qLo = (1 - level) / 2;
    const qHi = (1 + level) / 2;
    const mean: number[] = [];
    const lower: number[] = [];
    const upper: number[] = [];
    const q = (s: Float64Array, a: number) => {
      const pos = (s.length - 1) * a;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return s[lo] + (s[hi] - s[lo]) * (pos - lo);
    };
    for (let k = 0; k < h; k++) {
      const col = this.column(k);
      let m = 0;
      for (const v of col) m += v;
      mean.push(m / col.length);
      lower.push(q(col, qLo));
      upper.push(q(col, qHi));
    }
    return { horizon: h, mean, lower, upper, level };
  }

  /** P(S_h > S_T) = 模擬路徑中第 h 期高於最後價的比例 */
  direction(h: number): DirectionOutput {
    const H = Math.max(1, Math.floor(h));
    this.ensureSim(H);
    const last = this.last();
    let up = 0;
    for (const path of this.sim) if (path[H - 1] > last) up++;
    const pUp = clamp(up / this.sim.length, 0.001, 0.999);
    return { pUp, signal: pUp > 0.5 ? 'up' : pUp < 0.5 ? 'down' : 'neutral' };
  }

  /** 供圖表顯示的樣本路徑（前 count 條，每條 h 期，價格空間） */
  paths(h: number, count = 30): number[][] {
    const H = Math.max(1, Math.floor(h));
    this.ensureSim(H);
    return this.sim.slice(0, Math.max(0, Math.min(count, this.sim.length))).map((p) => Array.from(p.subarray(0, H)));
  }

  /** 估計值（每交易日） */
  getEstimates(): { mu: number; sigma: number; lookback: number } {
    return { mu: this.mu, sigma: this.sig, lookback: this.lookback };
  }

  protected describeCore() {
    return {
      name: '幾何布朗運動蒙地卡羅',
      formulaLatex: 'dS_t=\\mu S_t\\,dt+\\sigma S_t\\,dW_t',
      params: {
        mu: this.mu,
        sigma: this.sig,
        muAnnual: this.mu * 252,
        sigmaAnnual: this.sig * Math.sqrt(252),
        lookback: this.lookback,
        paths: this.nPaths,
        seed: this.opts.seed ?? DEFAULT_SEED,
      },
      paramSpecs: this.paramSpecs(),
      useCases: '描述價格可能落點的機率分布（風險情境、停損停利機率）；作為「無可預測性」的對照基準。',
      failureModes:
        '假設報酬獨立常態、波動固定：低估肥尾與跳空；波動叢聚期區間失準；μ 的估計誤差極大（N=60 時標準誤約 σ/√60），' +
        '方向機率幾乎只反映近期漂移。',
      derivation:
        '由 Itô 引理 $d\\ln S_t=(\\mu-\\tfrac12\\sigma^2)dt+\\sigma dW_t$，故對數報酬 $r_t\\sim N(\\mu-\\tfrac12\\sigma^2,\\sigma^2)$。' +
        '以最近 $N$ 筆報酬估計 $\\hat\\sigma^2=\\widehat{\\mathrm{Var}}(r)$、$\\hat\\mu=\\bar r+\\tfrac12\\hat\\sigma^2$，' +
        '模擬 $S_{t+1}=S_t\\exp((\\hat\\mu-\\tfrac12\\hat\\sigma^2)+\\hat\\sigma Z)$ 共 1000 條路徑（固定種子可重現），' +
        '取路徑平均為點預測、分位數為區間，$P(\\text{up})$ 為第 $h$ 期高於現價的路徑比例。',
      diagnostics: {
        lookback: this.lookback,
        paths: this.nPaths,
        logSpaceModel: true,
        muStdErr: this.sig / Math.sqrt(this.lookback),
      },
    };
  }
}
