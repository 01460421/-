/**
 * 卡爾曼濾波：局部線性趨勢模型（即時修正的核心引擎，規格第四節第 3 層）
 *
 *   狀態  x_t = [ℓ_t, b_t]ᵀ（水準、斜率；斜率單位 = 每交易日）
 *   x_t = F x_{t−1} + η_t ,  F = [[1,1],[0,1]] ,  η_t ~ N(0, Q·q_scale) ,  Q = diag(q_ℓ, q_b)
 *   y_t = H x_t + ε_t ,      H = [1, 0] ,         ε_t ~ N(0, R)
 *
 * 每個新觀測執行「預測—更新」兩步：
 *   預測：x̂_{t|t−1} = F x̂_{t−1} ,  P_{t|t−1} = F P_{t−1} Fᵀ + Q·q_scale
 *   新息：v_t = y_t − H x̂_{t|t−1} ,  S_t = H P_{t|t−1} Hᵀ + R
 *   增益：K_t = P_{t|t−1} Hᵀ S_t⁻¹      ← K 越大代表模型越「相信新資料」
 *   更新：x̂_t = x̂_{t|t−1} + K_t v_t ,  P_t = (I − K_t H) P_{t|t−1}
 *
 * 變異數估計：未指定時以最大概似（預測誤差分解）估計
 *   −ln L = ½ Σ_t w_t (ln S_t + v_t² / S_t)
 * 在 ln(q_ℓ/v₀), ln(q_b/v₀), ln(R/v₀) 上以 Nelder–Mead 搜尋（v₀ = Var(Δy) 做尺度正規化，使參數與價格量級無關）。
 * 使用者可用 q_level、q_slope、r（以 Var(Δy) 為單位的比例，−1 = 自動）固定任一變異數。
 *
 * 結構性變化規則：若 |v_t| > 2√S_t 連續 3 期 → 發出警示，並把過程雜訊放大（q_scale = 10）：
 *   q_ℓ,eff = q_ℓ + (q_scale − 1)·max(q_ℓ, 0.05R) ,  q_b,eff = q_scale·q_b
 * （水準項以 max(q_ℓ, 0.05R) 為放大基底：MLE 在平滑趨勢上常把 q_ℓ 估得趨近 0，單純 ×10 會毫無作用；
 *   q_scale = 1 時完全等於原模型，且對 q_scale 連續）。
 * 之後每期以 q_scale ← 1 + 0.8(q_scale − 1) 衰減回 1（讓濾波器先快速追上新水準、再恢復平滑）。
 *
 * 時間軸：狀態空間以交易日為步長（不使用 τ）；換算為 τ 單位的斜率 = b·(n−1)/2。
 * 價格空間：priceMode = 'log' 時在 ln y 上濾波（斜率即每日連續報酬率）。
 * update(newPoint) 為真正的單步預測—更新，不重新擬合，也不重估變異數。
 */
import type { Forecast, ParamSpec } from '../types';
import { BaseModel } from './base';
import { nelderMead } from '../math/optim';
import { variance, diff } from '../math/stats';
import { usableWeights } from './linreg';

export interface KalmanTraceEntry {
  /** 觀測索引（0 = 訓練視窗第一筆；update 的點接續編號） */
  step: number;
  /** 卡爾曼增益 [K_level, K_slope] */
  gain: [number, number];
  /** 新息 v_t = y_t − ŷ_{t|t−1}（模型空間） */
  innovation: number;
  /** √S_t */
  innovationSd: number;
  level: number;
  slope: number;
  /** 此步預測時使用的 Q 放大倍數 */
  qScale: number;
}

export interface KalmanAlert {
  step: number;
  message: string;
  /** 警示後設定的 Q 放大倍數 */
  qScale: number;
}

interface FilterState {
  x0: number;
  x1: number;
  P00: number;
  P01: number;
  P11: number;
}

const TRACE_CAP = 5000;

export class KalmanModel extends BaseModel {
  readonly id = 'kalman' as const;
  readonly version = '1.0.0';

  private st: FilterState = { x0: 0, x1: 0, P00: 1, P01: 0, P11: 1 };
  private ql = 0;
  private qs = 0;
  private R = 0;
  private v0 = 1;
  private qScale = 1;
  private run = 0;
  private stepIndex = 0;
  private trace: KalmanTraceEntry[] = [];
  private alerts: KalmanAlert[] = [];
  private logLik = 0;
  private estimated = { ql: true, qs: true, r: true };

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'q_level', label: '水準過程雜訊 q_ℓ / Var(Δy)（−1 = MLE 自動）', min: -1, max: 10, step: 0.001, default: -1, auto: true },
      { key: 'q_slope', label: '斜率過程雜訊 q_b / Var(Δy)（−1 = MLE 自動）', min: -1, max: 1, step: 0.0001, default: -1, auto: true },
      { key: 'r', label: '觀測雜訊 R / Var(Δy)（−1 = MLE 自動）', min: -1, max: 10, step: 0.001, default: -1, auto: true },
      { key: 'breakZ', label: '結構性變化門檻（倍 √S）', min: 1, max: 5, step: 0.1, default: 2 },
      { key: 'breakRun', label: '連續超標期數', min: 1, max: 10, step: 1, default: 3 },
      { key: 'qInflate', label: '警示後 Q 放大倍數', min: 1, max: 100, step: 1, default: 10 },
      { key: 'qDecay', label: 'Q 放大倍數衰減率', min: 0, max: 0.99, step: 0.01, default: 0.8 },
    ];
  }

  private initState(y0: number): FilterState {
    return { x0: y0, x1: 0, P00: 1e4 * this.v0, P01: 0, P11: 1e2 * this.v0 };
  }

  /** 單步預測—更新（純函數版本，MLE 使用） */
  private static step(s: FilterState, yv: number, ql: number, qs: number, R: number, floor: number) {
    const px0 = s.x0 + s.x1;
    const px1 = s.x1;
    const P00 = s.P00 + 2 * s.P01 + s.P11 + ql;
    const P01 = s.P01 + s.P11;
    const P11 = s.P11 + qs;
    const v = yv - px0;
    const S = Math.max(P00 + R, floor);
    const K0 = P00 / S;
    const K1 = P01 / S;
    const next: FilterState = {
      x0: px0 + K0 * v,
      x1: px1 + K1 * v,
      P00: Math.max(P00 - K0 * K0 * S, 0),
      P01: P01 - K0 * K1 * S,
      P11: Math.max(P11 - K1 * K1 * S, 0),
    };
    return { next, pred: px0, v, S, K0, K1 };
  }

  private negLogLik(y: number[], w: number[] | undefined, ql: number, qs: number, R: number): number {
    let s = this.initState(y[0]);
    const floor = 1e-12 * this.v0;
    let nll = 0;
    for (let t = 0; t < y.length; t++) {
      const r = KalmanModel.step(s, y[t], ql, qs, R, floor);
      s = r.next;
      if (t >= 2) nll += (w ? w[t] : 1) * 0.5 * (Math.log(r.S) + (r.v * r.v) / r.S);
    }
    return Number.isFinite(nll) ? nll : Infinity;
  }

  /** 依放大倍數計算有效過程雜訊（q_scale = 1 時即 Q 本身） */
  private qEff(scale: number): { ql: number; qs: number } {
    return { ql: this.ql + (scale - 1) * Math.max(this.ql, 0.05 * this.R), qs: this.qs * scale };
  }

  /** 含結構性變化規則的單步濾波（fit 的最終回放與 update 共用），回傳一步預測值 */
  private filterStep(yv: number): number {
    const used = this.qScale;
    const q = this.qEff(used);
    const r = KalmanModel.step(this.st, yv, q.ql, q.qs, this.R, 1e-12 * this.v0);
    this.st = r.next;
    const sd = Math.sqrt(r.S);
    const t = this.stepIndex;
    const zLim = this.param('breakZ', 2);
    const runLim = Math.max(1, Math.round(this.param('breakRun', 3)));
    // 第一筆（t = 0）是初始化，不計入
    if (t > 0 && Math.abs(r.v) > zLim * sd) this.run++;
    else this.run = 0;
    if (this.run >= runLim) {
      this.qScale = Math.max(1, this.param('qInflate', 10));
      this.alerts.push({
        step: t,
        message: `結構性變化警示：新息連續 ${runLim} 期超過 ${zLim}σ（最新 v=${r.v.toPrecision(4)}，√S=${sd.toPrecision(4)}），過程雜訊 Q 放大 ${this.qScale} 倍`,
        qScale: this.qScale,
      });
      this.run = 0;
    } else {
      const decay = Math.min(Math.max(this.param('qDecay', 0.8), 0), 0.999);
      this.qScale = 1 + (this.qScale - 1) * decay;
    }
    this.trace.push({
      step: t,
      gain: [r.K0, r.K1],
      innovation: r.v,
      innovationSd: sd,
      level: this.st.x0,
      slope: this.st.x1,
      qScale: used,
    });
    if (this.trace.length > TRACE_CAP) this.trace.shift();
    this.stepIndex++;
    return r.pred;
  }

  protected fitCore(): void {
    const y = this.ys();
    const n = y.length;
    const w = usableWeights(this.opts.weights, n);
    const dv = variance(diff(y));
    const scaleFloor = 1e-12 * (y.reduce((s, v) => s + Math.abs(v), 0) / n) ** 2 + 1e-300;
    this.v0 = Number.isFinite(dv) && dv > scaleFloor ? dv : Math.max(scaleFloor, 1e-12);

    const fixed = {
      ql: this.param('q_level', -1),
      qs: this.param('q_slope', -1),
      r: this.param('r', -1),
    };
    this.estimated = { ql: !(fixed.ql >= 0), qs: !(fixed.qs >= 0), r: !(fixed.r >= 0) };
    const keys = (['ql', 'qs', 'r'] as const).filter((k) => this.estimated[k]);
    const LO = -30;
    const HI = 5;
    const unpack = (z: number[]) => {
      const get = (k: 'ql' | 'qs' | 'r') => {
        const i = keys.indexOf(k);
        if (i < 0) return fixed[k] * this.v0;
        return Math.exp(Math.min(HI, Math.max(LO, z[i]))) * this.v0;
      };
      return { ql: get('ql'), qs: get('qs'), r: get('r') };
    };
    let best = unpack([]);
    if (keys.length) {
      const starts: Record<'ql' | 'qs' | 'r', number>[] = [
        { ql: Math.log(0.5), qs: Math.log(1e-3), r: Math.log(0.5) },
        { ql: Math.log(0.05), qs: Math.log(1e-5), r: Math.log(0.9) },
      ];
      let bestF = Infinity;
      for (const s0 of starts) {
        const z0 = keys.map((k) => s0[k]);
        const res = nelderMead(
          (z) => {
            const p = unpack(z);
            return this.negLogLik(y, w, p.ql, p.qs, p.r);
          },
          z0,
          { maxIter: 300, tol: 1e-9, step: keys.map(() => 1.5) },
        );
        if (res.fx < bestF) {
          bestF = res.fx;
          best = unpack(res.x);
        }
      }
    }
    this.ql = best.ql;
    this.qs = best.qs;
    this.R = best.r;
    this.logLik = -this.negLogLik(y, w, this.ql, this.qs, this.R);

    // 最終回放（含結構性變化規則與逐步紀錄）
    this.st = this.initState(y[0]);
    this.qScale = 1;
    this.run = 0;
    this.stepIndex = 0;
    this.trace = [];
    this.alerts = [];
    const fitted: number[] = [];
    for (let t = 0; t < n; t++) fitted.push(this.back(this.filterStep(y[t])));
    this.fittedValues = fitted;
    this.sigma = Math.sqrt(this.R + this.st.P00);
  }

  /** 真正的線上預測—更新步，不重擬合 */
  update(newPoint: number): this {
    if (!this.y.length) throw new Error('kalman: 尚未擬合');
    if (!(newPoint > 0) || !Number.isFinite(newPoint)) throw new Error('kalman: 價格必須為正有限數');
    const yv = this.priceMode === 'log' ? Math.log(newPoint) : newPoint;
    const pred = this.filterStep(yv);
    this.y.push(newPoint);
    this.fittedValues.push(this.back(pred));
    this.sigma = Math.sqrt(this.R + this.st.P00);
    return this;
  }

  protected predictCore(h: number, level: number): Forecast {
    const decay = Math.min(Math.max(this.param('qDecay', 0.8), 0), 0.999);
    let { P00, P01, P11 } = this.st;
    let scale = this.qScale;
    const mean: number[] = [];
    const sd: number[] = [];
    for (let k = 1; k <= h; k++) {
      const q = this.qEff(scale);
      const n00 = P00 + 2 * P01 + P11 + q.ql;
      const n01 = P01 + P11;
      const n11 = P11 + q.qs;
      P00 = n00;
      P01 = n01;
      P11 = n11;
      scale = 1 + (scale - 1) * decay;
      mean.push(this.st.x0 + k * this.st.x1);
      sd.push(Math.sqrt(Math.max(P00 + this.R, 0)));
    }
    return this.makeForecast(mean, sd, level);
  }

  getTrace(): KalmanTraceEntry[] {
    return this.trace.map((t) => ({ ...t, gain: [t.gain[0], t.gain[1]] as [number, number] }));
  }

  getAlerts(): KalmanAlert[] {
    return this.alerts.map((a) => ({ ...a }));
  }

  /** 目前狀態（模型空間） */
  getState(): { level: number; slope: number; P: number[][]; qScale: number } {
    const { x0, x1, P00, P01, P11 } = this.st;
    return { level: x0, slope: x1, P: [[P00, P01], [P01, P11]], qScale: this.qScale };
  }

  /** 估計 / 指定的變異數（模型空間） */
  getVariances(): { qLevel: number; qSlope: number; r: number } {
    return { qLevel: this.ql, qSlope: this.qs, r: this.R };
  }

  protected describeCore() {
    const last = this.trace[this.trace.length - 1];
    const n = this.axis.n;
    return {
      name: '卡爾曼濾波（局部線性趨勢）',
      formulaLatex:
        '\\begin{aligned}x_t&=\\begin{bmatrix}1&1\\\\0&1\\end{bmatrix}x_{t-1}+\\eta_t,\\;\\eta_t\\sim N(0,Q)\\\\' +
        'y_t&=\\begin{bmatrix}1&0\\end{bmatrix}x_t+\\varepsilon_t,\\;\\varepsilon_t\\sim N(0,R)\\\\' +
        'K_t&=P_{t|t-1}H^\\top(HP_{t|t-1}H^\\top+R)^{-1}\\end{aligned}',
      params: {
        qLevel: this.ql,
        qSlope: this.qs,
        r: this.R,
        level: this.st.x0,
        slope: this.st.x1,
        slopePerTau: (this.st.x1 * (n - 1)) / 2,
        qScale: this.qScale,
      },
      paramSpecs: this.paramSpecs(),
      useCases: '即時追蹤價格的水準與斜率（趨勢強度）、逐筆修正預測；量化模型對新資料的信任程度（增益 K）。',
      failureModes:
        '假設雜訊常態且變異數固定：跳空或波動突增時新息過大；Q 過小時追不上轉折、過大時預測接近隨機漫步；' +
        '斜率外推為直線，長期預測區間快速變寬。',
      derivation:
        '預測：$\\hat x_{t|t-1}=F\\hat x_{t-1}$、$P_{t|t-1}=FP_{t-1}F^\\top+Q$；新息 $v_t=y_t-H\\hat x_{t|t-1}$、$S_t=HP_{t|t-1}H^\\top+R$；' +
        '更新：$K_t=P_{t|t-1}H^\\top S_t^{-1}$、$\\hat x_t=\\hat x_{t|t-1}+K_tv_t$、$P_t=(I-K_tH)P_{t|t-1}$。' +
        '變異數以預測誤差分解最大概似 $-\\ln L=\\tfrac12\\sum_t(\\ln S_t+v_t^2/S_t)$ 估計。' +
        '當 $|v_t|>2\\sqrt{S_t}$ 連續 3 期即觸發結構性變化警示並把 $Q$ 放大 10 倍（水準項以 $\\max(q_\\ell,0.05R)$ 為基底）後逐期衰減。',
      diagnostics: {
        logLik: this.logLik,
        qLevelEstimated: this.estimated.ql,
        qSlopeEstimated: this.estimated.qs,
        rEstimated: this.estimated.r,
        signalToNoise: this.R > 0 ? this.ql / this.R : -1,
        gainLevel: last ? last.gain[0] : 0,
        gainSlope: last ? last.gain[1] : 0,
        alerts: this.alerts.length,
        lastAlertStep: this.alerts.length ? this.alerts[this.alerts.length - 1].step : -1,
        qScale: this.qScale,
        steps: this.stepIndex,
      },
    };
  }
}
