/**
 * Stacking 集成：以 ridge 迴歸作為 meta-learner 組合多個基礎模型的預測。
 *
 *   \hat r^{stack}_{H} = b + \sum_j w_j\,\hat r^{(j)}_{H},\qquad
 *   (w,b) = \arg\min \sum_t\big(r_{t,H} - b - \sum_j w_j\hat r^{(j)}_{t,H}\big)^2 + \lambda\|w\|_2^2
 * 封閉解（欄位置中後）：w = (X_c^\top X_c + \lambda I)^{-1} X_c^\top y_c，b = \bar y - \bar x^\top w。
 *
 * ⚠ 規格八-7：meta-learner 的訓練資料「只能」是各基礎模型的走動式（walk-forward）樣本外預測——
 *   在每個預測起點 t 只用 y_0..y_t 擬合基礎模型、預測 t+H，再與實際 y_{t+H} 配對。
 *   嚴禁使用樣本內擬合值（fitted()），否則過擬合的模型會被 meta-learner 給予過高權重，且產生資料洩漏。
 *
 * 本檔在「報酬空間」組合：特徵 = 各模型預測的 H 期對數報酬 ln(\hat P^{(j)}_{t+H}/P_t)，
 * 目標 = 實際 ln(P_{t+H}/P_t)。價格水準高度共線，在報酬空間做 ridge 條件數好得多。
 */
import type { DirectionOutput, FitOptions, Forecast, ForecastModel, ModelFactory, ParamSpec } from '../../types';
import { BaseModel } from '../base';
import { cholesky, choleskySolve } from '../../math/linalg';
import { zForLevel, normalCdf, clamp, std } from '../../math/stats';
import { signalOf } from './common';

/**
 * Ridge meta-learner。
 *
 * **訓練資料必須是 walk-forward 樣本外預測（oosPreds[t][j] = 模型 j 在時點 t 只用過去資料做出的預測），
 * 絕不可使用樣本內擬合值。** 本類別無法自行檢查這一點，責任在呼叫端。
 */
export class StackingMeta {
  weights: number[] = [];
  intercept = 0;
  lambda = 0;
  /** meta 對應的預測期數（StackingModel 用於把權重套到 1..h 期） */
  horizon?: number;
  /** 訓練殘差標準差（輸入為樣本外預測，故近似樣本外誤差） */
  residualStd = 0;
  nTrain = 0;

  /**
   * @param oosPreds 列 = 時間、欄 = 模型的「走動式樣本外」預測
   * @param actual   對應的實際值
   * @param lambda   L2 懲罰；省略時取 1e-3 · tr(X_cᵀX_c)/p（相對尺度）
   * @param opts.intercept 是否估計截距（不受懲罰），預設 true
   */
  fit(oosPreds: number[][], actual: number[], lambda?: number, opts: { intercept?: boolean; horizon?: number } = {}): this {
    const n = oosPreds.length;
    if (n === 0 || n !== actual.length) throw new Error('StackingMeta: oosPreds 與 actual 長度不一致或為空');
    const p = oosPreds[0].length;
    const useIntercept = opts.intercept ?? true;
    const xm = new Array<number>(p).fill(0);
    let ym = 0;
    if (useIntercept) {
      for (let t = 0; t < n; t++) {
        for (let j = 0; j < p; j++) xm[j] += oosPreds[t][j] / n;
        ym += actual[t] / n;
      }
    }
    const A = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const b = new Array<number>(p).fill(0);
    for (let t = 0; t < n; t++) {
      const yc = actual[t] - ym;
      for (let i = 0; i < p; i++) {
        const xi = oosPreds[t][i] - xm[i];
        b[i] += xi * yc;
        for (let j = 0; j < p; j++) A[i][j] += xi * (oosPreds[t][j] - xm[j]);
      }
    }
    const tr = A.reduce((s, r, i) => s + r[i], 0);
    const lam = lambda ?? (1e-3 * tr) / Math.max(p, 1);
    for (let i = 0; i < p; i++) A[i][i] += Math.max(lam, 1e-12 * (tr / p || 1));
    const L = cholesky(A, 1e-12);
    this.weights = choleskySolve(L, b);
    this.intercept = useIntercept ? ym - this.weights.reduce((s, w, j) => s + w * xm[j], 0) : 0;
    this.lambda = lam;
    this.horizon = opts.horizon ?? this.horizon;
    this.nTrain = n;
    const res = actual.map((a, t) => a - this.predict(oosPreds[t]));
    this.residualStd = n > 1 ? Math.sqrt(res.reduce((s, v) => s + v * v, 0) / Math.max(n - p - (useIntercept ? 1 : 0), 1)) : 0;
    return this;
  }

  predict(row: number[]): number {
    let s = this.intercept;
    for (let j = 0; j < this.weights.length; j++) s += this.weights[j] * row[j];
    return s;
  }
}

export interface StackingComponent {
  name: string;
  factory: ModelFactory;
  /** 傳給該基礎模型 fit() 的參數 */
  params?: Record<string, number>;
}

export class StackingModel extends BaseModel {
  readonly id = 'stacking' as const;
  readonly version = '1.0.0';

  private comps: StackingComponent[];
  private externalMeta: StackingMeta | null;
  private meta: StackingMeta = new StackingMeta();
  private models: (ForecastModel | null)[] = [];
  private H = 5;
  private sigmaH = 0;
  private oosRows = 0;
  private oosFailures = 0;
  private oosRmse = NaN;
  private naiveRmse = NaN;

  constructor(components: StackingComponent[], meta?: StackingMeta) {
    super();
    if (!components.length) throw new Error('stacking: 至少需要一個基礎模型');
    this.comps = components;
    this.externalMeta = meta ?? null;
  }

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'horizon', label: 'meta-learner 訓練期數 H', min: 1, max: 60, step: 1, default: 5 },
      { key: 'folds', label: '走動式樣本外起點數上限', min: 10, max: 200, step: 5, default: 30 },
      { key: 'minTrainFrac', label: '最小訓練視窗比例', min: 0.3, max: 0.9, step: 0.05, default: 0.5 },
      { key: 'lambda', label: 'ridge λ（0 = 相對尺度自動）', min: 0, max: 10, step: 0.001, default: 0 },
    ];
  }

  private compOpts(c: StackingComponent): FitOptions {
    return { priceMode: this.opts.priceMode, seed: this.opts.seed, params: c.params };
  }

  /** 單一模型在序列 y 上擬合後的 1..h 期預測對數報酬；失敗回傳 null */
  private compReturns(c: StackingComponent, y: number[], h: number): number[] | null {
    try {
      const m = c.factory().fit(y, this.compOpts(c));
      const f = m.predict(h, 0.9);
      const last = y[y.length - 1];
      const r = f.mean.map((v) => Math.log(Math.max(v, 1e-12) / last));
      return r.every(Number.isFinite) ? r : null;
    } catch {
      return null;
    }
  }

  /**
   * 內部走動式樣本外預測：每個起點 t 只用 y_0..y_t（嚴格過去）擬合各基礎模型。
   */
  buildOos(y: number[], H: number): { X: number[][]; target: number[] } {
    const n = y.length;
    const minTrain = Math.max(30, Math.floor(n * this.param('minTrainFrac', 0.5)));
    const lastOrigin = n - 1 - H;
    const X: number[][] = [];
    const target: number[] = [];
    this.oosFailures = 0;
    if (lastOrigin < minTrain - 1) return { X, target };
    const folds = Math.max(2, Math.round(this.param('folds', 30)));
    const span = lastOrigin - (minTrain - 1);
    const count = Math.min(folds, span + 1);
    for (let f = 0; f < count; f++) {
      const t = minTrain - 1 + (count === 1 ? 0 : Math.round((span * f) / (count - 1)));
      const train = y.slice(0, t + 1);
      const row = this.comps.map((c) => {
        const r = this.compReturns(c, train, H);
        if (!r) {
          this.oosFailures++;
          return 0;
        }
        return r[H - 1];
      });
      X.push(row);
      target.push(Math.log(y[t + H] / y[t]));
    }
    return { X, target };
  }

  protected fitCore(): void {
    const y = this.y;
    const p = this.comps.length;
    this.models = this.comps.map((c) => {
      try {
        return c.factory().fit(y, this.compOpts(c));
      } catch {
        return null;
      }
    });
    if (this.externalMeta) {
      this.meta = this.externalMeta;
      this.H = this.externalMeta.horizon ?? Math.round(this.param('horizon', 5));
      this.sigmaH = this.externalMeta.residualStd;
      this.oosRows = this.externalMeta.nTrain;
    } else {
      this.H = Math.max(1, Math.round(this.param('horizon', 5)));
      const { X, target } = this.buildOos(y, this.H);
      this.oosRows = X.length;
      if (X.length < 2 * (p + 1)) {
        this.meta = new StackingMeta();
        this.meta.weights = new Array<number>(p).fill(1 / p);
        this.meta.intercept = 0;
        this.meta.horizon = this.H;
        this.degraded = `樣本外起點只有 ${X.length} 個，不足以訓練 ridge，改用等權平均`;
        const rets: number[] = [];
        for (let i = this.H; i < y.length; i++) rets.push(Math.log(y[i] / y[i - this.H]));
        this.sigmaH = rets.length > 2 ? std(rets) : 0.02;
      } else {
        const lam = this.param('lambda', 0);
        this.meta = new StackingMeta().fit(X, target, lam > 0 ? lam : undefined, { intercept: true, horizon: this.H });
        this.sigmaH = this.meta.residualStd || std(target) || 0.02;
        const pred = X.map((r) => this.meta.predict(r));
        this.oosRmse = Math.sqrt(pred.reduce((s, v, i) => s + (target[i] - v) ** 2, 0) / X.length);
        this.naiveRmse = Math.sqrt(target.reduce((s, v) => s + v * v, 0) / target.length);
      }
    }
    if (this.models.some((m) => m === null)) this.degraded = (this.degraded ? this.degraded + '；' : '') + '部分基礎模型在全樣本擬合失敗，其預測以 0 報酬代入';
    // 顯示用擬合值：以 |w| 正規化權重組合各模型樣本內擬合值（僅供視覺化，不參與訓練）
    const w = this.meta.weights.map(Math.abs);
    const sw = w.reduce((a, b) => a + b, 0);
    const ww = sw > 1e-9 ? w.map((v) => v / sw) : w.map(() => 1 / p);
    this.fittedValues = y.map((v, i) => {
      let s = 0;
      let tw = 0;
      this.models.forEach((m, j) => {
        if (!m) return;
        s += ww[j] * m.fitted()[i];
        tw += ww[j];
      });
      return tw > 0 ? s / tw : v;
    });
    this.sigma = this.sigmaH / Math.sqrt(this.H);
  }

  private combined(h: number): { r: number[]; sd: number[] } {
    const last = this.last();
    const compR = this.models.map((m) => {
      if (!m) return new Array<number>(h).fill(0);
      try {
        return m.predict(h, 0.9).mean.map((v) => Math.log(Math.max(v, 1e-12) / last));
      } catch {
        return new Array<number>(h).fill(0);
      }
    });
    const r: number[] = [];
    const sd: number[] = [];
    for (let k = 1; k <= h; k++) {
      let s = (this.meta.intercept * k) / this.H;
      for (let j = 0; j < compR.length; j++) s += (this.meta.weights[j] ?? 0) * compR[j][k - 1];
      r.push(s);
      sd.push(Math.max(this.sigmaH, 1e-6) * Math.sqrt(k / this.H));
    }
    return { r, sd };
  }

  protected predictCore(h: number, level: number): Forecast {
    const { r, sd } = this.combined(h);
    const z = zForLevel(level);
    const last = this.last();
    return {
      horizon: h,
      mean: r.map((v) => last * Math.exp(v)),
      lower: r.map((v, i) => last * Math.exp(v - z * sd[i])),
      upper: r.map((v, i) => last * Math.exp(v + z * sd[i])),
      level,
    };
  }

  direction(h: number): DirectionOutput {
    const hh = Math.max(1, Math.floor(h));
    const { r, sd } = this.combined(hh);
    const pUp = clamp(normalCdf(r[hh - 1] / sd[hh - 1]), 0.001, 0.999);
    return { pUp, signal: signalOf(pUp) };
  }

  getMeta(): StackingMeta {
    return this.meta;
  }

  protected describeCore() {
    return {
      name: 'Stacking 集成（ridge meta-learner）',
      formulaLatex: '\\hat r_H=b+\\sum_j w_j\\hat r^{(j)}_H,\\quad w=(X_c^\\top X_c+\\lambda I)^{-1}X_c^\\top y_c',
      params: {
        components: this.comps.map((c) => c.name).join(','),
        weights: this.meta.weights,
        intercept: this.meta.intercept,
        lambda: this.meta.lambda,
        horizon: this.H,
      },
      paramSpecs: this.paramSpecs(),
      useCases: '多個基礎模型各有擅長情境時，以資料決定組合權重；權重可解讀為「樣本外貢獻度」。',
      failureModes:
        '樣本外起點太少時權重不穩（已以 ridge 收縮並在不足時退回等權）；市場狀態改變後歷史權重失效；基礎模型高度相關時個別權重難解讀（僅總和有意義）。',
      derivation:
        '訓練資料為走動式樣本外預測：起點 $t$ 只用 $y_{0..t}$ 擬合各基礎模型並預測 $H$ 期報酬 $\\hat r^{(j)}_{t,H}$，與實際 $r_{t,H}=\\ln(P_{t+H}/P_t)$ 配對；' +
        '**嚴禁使用樣本內擬合值**。Ridge 封閉解 $w=(X_c^\\top X_c+\\lambda I)^{-1}X_c^\\top y_c$、$b=\\bar y-\\bar x^\\top w$。' +
        '第 $k$ 期預測 $\\hat r_k=b\\,k/H+\\sum_jw_j\\hat r^{(j)}_k$，區間標準差 $\\sigma_H\\sqrt{k/H}$（$\\sigma_H$ 為 meta 的樣本外殘差標準差）。',
      diagnostics: {
        oosRows: this.oosRows,
        oosFailures: this.oosFailures,
        metaFitRmseOnOos: this.oosRmse,
        naiveZeroReturnRmse: this.naiveRmse,
        sigmaH: this.sigmaH,
        externalMeta: !!this.externalMeta,
        trainingData: 'walk-forward out-of-sample only',
        weighted: false,
      },
    };
  }
}
