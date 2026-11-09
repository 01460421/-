/**
 * 貝氏結構時間序列（BSTS）近似：局部線性趨勢 + 季節 + 外生變數回歸，以卡爾曼濾波 + 最大概似估計變異數。
 *
 * ⚠ 誠實聲明：真正的 BSTS（Scott & Varian 2014）以 MCMC 抽樣變異數與 spike-and-slab 變數選擇；
 *   本實作是「同一個狀態空間模型」的頻率學派近似：變異數以 MLE（預測誤差分解 + Nelder–Mead）估計，
 *   狀態以卡爾曼濾波求後驗平均與共變異數，迴歸係數視為無雜訊的靜態狀態（擴散先驗）。不做變數選擇。
 *
 * 觀測方程：  y_t = \mu_t + \gamma_t + x_t^\top\beta + \varepsilon_t,\quad \varepsilon_t\sim N(0,\sigma_\varepsilon^2)
 * 狀態方程：
 *   \mu_{t+1} = \mu_t + \delta_t + \eta_t,\quad \eta_t\sim N(0,\sigma_\eta^2)
 *   \delta_{t+1} = \delta_t + \zeta_t,\quad \zeta_t\sim N(0,\sigma_\zeta^2)
 *   \gamma_{t+1} = -\sum_{j=1}^{s-1}\gamma_{t+1-j} + \omega_t,\quad \omega_t\sim N(0,\sigma_\omega^2)
 *   \beta_{t+1} = \beta_t
 *
 * 集中化概似（令 H = 1、Q = q·σ_ε²，σ_ε² 解析消去）：
 *   \ln L_c = -\tfrac{n-d}{2}\big(\ln 2\pi + 1 + \ln\hat\sigma_\varepsilon^2\big) - \tfrac12\sum_{t\ge d}\ln F_t,
 *   \hat\sigma_\varepsilon^2 = \tfrac1{n-d}\sum_{t\ge d} v_t^2/F_t
 * d = 狀態維度（擴散初始化期間不計入概似）。
 *
 * 外生變數：opts.exog 的列必須與 y 對齊（同長度）。預測未來需要未來的外生值；
 * 若未提供（predict 只有 h），則「持有最後一筆外生值不變」——這是假設，不是預測，介面需揭露。
 * 規格建議的外生變數：大盤指數、VIX、美元指數、美債殖利率；台股另加三大法人買賣超與融資餘額（由資料層提供）。
 */
import type { Forecast, ParamSpec } from '../../types';
import { BaseModel } from '../base';
import { nelderMead } from '../../math/optim';
import { mean, std } from '../../math/stats';

interface SsmSpec {
  season: number; // s（≤ 1 代表無季節）
  k: number; // 外生變數數
  m: number; // 狀態維度
}

function specOf(season: number, k: number): SsmSpec {
  const s = season > 1 ? season : 0;
  return { season: s, k, m: 2 + (s > 1 ? s - 1 : 0) + k };
}

/** 以結構化方式套用轉移矩陣 T 到向量（O(m)） */
function applyT(sp: SsmSpec, v: Float64Array | number[], out: Float64Array): void {
  out[0] = v[0] + v[1];
  out[1] = v[1];
  let off = 2;
  if (sp.season > 1) {
    const ns = sp.season - 1;
    let s = 0;
    for (let j = 0; j < ns; j++) s += v[off + j];
    out[off] = -s;
    for (let j = 1; j < ns; j++) out[off + j] = v[off + j - 1];
    off += ns;
  }
  for (let j = 0; j < sp.k; j++) out[off + j] = v[off + j];
}

interface FilterOut {
  ll: number;
  sigma2: number;
  a: Float64Array; // 最後一期濾波狀態 a_{T|T}
  P: Float64Array; // 最後一期濾波共變異數（H = 1 尺度）
  fitted: number[]; // Z_t a_{t|t}
  states: Float64Array[];
}

/**
 * 卡爾曼濾波（H = 1，Q = diag(q)），回傳集中化對數概似。
 * y、X 皆已標準化。
 */
function kalman(sp: SsmSpec, y: number[], X: number[][] | null, q: number[], keepStates = false): FilterOut {
  const m = sp.m;
  const n = y.length;
  const kappa = 1e6;
  let a = new Float64Array(m);
  let P = new Float64Array(m * m);
  for (let i = 0; i < m; i++) P[i * m + i] = kappa;
  const Qd = new Float64Array(m);
  Qd[0] = q[0];
  Qd[1] = q[1];
  if (sp.season > 1) Qd[2] = q[2];
  const Z = new Float64Array(m);
  const PZ = new Float64Array(m);
  const tmpIn = new Float64Array(m);
  const tmpOut = new Float64Array(m);
  const TP = new Float64Array(m * m);
  const xOff = 2 + (sp.season > 1 ? sp.season - 1 : 0);
  const d = m;
  let sumV2F = 0;
  let sumLogF = 0;
  let cnt = 0;
  const fitted: number[] = new Array(n);
  const states: Float64Array[] = [];
  let aF = new Float64Array(m);
  let PF = new Float64Array(m * m);
  for (let t = 0; t < n; t++) {
    Z.fill(0);
    Z[0] = 1;
    if (sp.season > 1) Z[2] = 1;
    if (X) for (let j = 0; j < sp.k; j++) Z[xOff + j] = X[t][j];
    // PZ = P Zᵀ, F = Z P Zᵀ + 1
    let F = 1;
    let za = 0;
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let j = 0; j < m; j++) s += P[i * m + j] * Z[j];
      PZ[i] = s;
      F += Z[i] * s;
      za += Z[i] * a[i];
    }
    const v = y[t] - za;
    if (t >= d) {
      sumV2F += (v * v) / F;
      sumLogF += Math.log(F);
      cnt++;
    }
    // 濾波更新
    aF = new Float64Array(m);
    PF = new Float64Array(m * m);
    for (let i = 0; i < m; i++) aF[i] = a[i] + (PZ[i] * v) / F;
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) PF[i * m + j] = P[i * m + j] - (PZ[i] * PZ[j]) / F;
    let fz = 0;
    for (let i = 0; i < m; i++) fz += Z[i] * aF[i];
    fitted[t] = fz;
    if (keepStates) states.push(aF.slice());
    // 預測：a = T aF，P = T PF Tᵀ + Q
    const aN = new Float64Array(m);
    applyT(sp, aF, aN);
    a = aN;
    // TP = T·PF（逐欄套用 T）
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) tmpIn[i] = PF[i * m + j];
      applyT(sp, tmpIn, tmpOut);
      for (let i = 0; i < m; i++) TP[i * m + j] = tmpOut[i];
    }
    // P = TP·Tᵀ（逐列套用 T）
    const PN = new Float64Array(m * m);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) tmpIn[j] = TP[i * m + j];
      applyT(sp, tmpIn, tmpOut);
      for (let j = 0; j < m; j++) PN[i * m + j] = tmpOut[j];
    }
    for (let i = 0; i < m; i++) PN[i * m + i] += Qd[i];
    // 對稱化避免數值漂移
    for (let i = 0; i < m; i++)
      for (let j = i + 1; j < m; j++) {
        const s = 0.5 * (PN[i * m + j] + PN[j * m + i]);
        PN[i * m + j] = s;
        PN[j * m + i] = s;
      }
    P = PN;
  }
  const c = Math.max(cnt, 1);
  const sigma2 = Math.max(sumV2F / c, 1e-12);
  const ll = -0.5 * c * (Math.log(2 * Math.PI) + 1 + Math.log(sigma2)) - 0.5 * sumLogF;
  return { ll, sigma2, a: aF, P: PF, fitted, states };
}

export class BstsModel extends BaseModel {
  readonly id = 'bsts' as const;
  readonly version = '1.0.0';

  private sp: SsmSpec = specOf(0, 0);
  private q: number[] = [0.1, 0.001, 0.01];
  private sigma2 = 1;
  private a = new Float64Array(0);
  private P = new Float64Array(0);
  private yMean = 0;
  private yStd = 1;
  private xMean: number[] = [];
  private xStd: number[] = [];
  private lastX: number[] | null = null;
  private ll = 0;
  private hasExog = false;
  private states: Float64Array[] = [];

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'season', label: '季節週期 s（0 = 無季節；5 = 週內效應）', min: 0, max: 30, step: 1, default: 5 },
      { key: 'estimate', label: '以 MLE 估計變異數（1）/ 使用預設比例（0）', min: 0, max: 1, step: 1, default: 1 },
    ];
  }

  protected fitCore(): void {
    const yRaw = this.ys();
    const n = yRaw.length;
    const exog = this.opts.exog;
    let k = 0;
    this.hasExog = false;
    if (exog && exog.length) {
      if (exog.length !== n || exog.some((r) => r.length !== exog[0].length || r.some((v) => !Number.isFinite(v)))) {
        this.degraded = `外生變數列數（${exog.length}）與 y（${n}）不一致或含缺值，已忽略外生變數`;
      } else {
        k = exog[0].length;
        this.hasExog = k > 0;
      }
    }
    let season = Math.round(this.param('season', 5));
    if (season > 1 && n < 3 * season + 10) season = 0;
    this.sp = specOf(season, k);
    if (n < this.sp.m + 10) {
      this.sp = specOf(0, 0);
      this.hasExog = false;
      this.degraded = '資料過短，退化為無季節、無外生變數的局部線性趨勢';
    }
    this.yMean = mean(yRaw);
    this.yStd = std(yRaw) || 1;
    const y = yRaw.map((v) => (v - this.yMean) / this.yStd);
    let X: number[][] | null = null;
    if (this.hasExog) {
      const E = exog!;
      this.xMean = Array.from({ length: k }, (_, j) => mean(E.map((r) => r[j])));
      this.xStd = Array.from({ length: k }, (_, j) => std(E.map((r) => r[j])) || 1);
      X = E.map((r) => r.map((v, j) => (v - this.xMean[j]) / this.xStd[j]));
      this.lastX = E[n - 1].slice();
    } else {
      this.xMean = [];
      this.xStd = [];
      this.lastX = null;
    }
    const nq = this.sp.season > 1 ? 3 : 2;
    const qInit = [0.1, 0.001, 0.01].slice(0, nq);
    let q = qInit;
    if (this.param('estimate', 1) === 1) {
      const obj = (z: number[]) => {
        const qq = z.map((v) => Math.exp(Math.min(Math.max(v, -25), 10)));
        return -kalman(this.sp, y, X, qq).ll;
      };
      const res = nelderMead(obj, qInit.map(Math.log), { maxIter: 300 * nq, tol: 1e-9, step: new Array(nq).fill(1.5) });
      q = res.x.map((v) => Math.exp(Math.min(Math.max(v, -25), 10)));
      if (!Number.isFinite(res.fx) || res.fx > 1e299) {
        q = qInit;
        this.degraded = '變異數 MLE 失敗，使用預設比例';
      }
    }
    while (q.length < 3) q.push(0);
    this.q = q;
    const out = kalman(this.sp, y, X, q, true);
    this.ll = out.ll - n * Math.log(this.yStd);
    this.sigma2 = out.sigma2;
    this.a = out.a;
    this.P = out.P;
    this.states = out.states;
    this.fittedValues = out.fitted.map((v) => this.back(this.yMean + this.yStd * v));
    this.sigma = Math.sqrt(out.sigma2) * this.yStd;
  }

  /** 線上更新：單步卡爾曼（超參數固定）。未提供新外生值時持有最後一筆。 */
  update(newPoint: number): this {
    return this.updateWithExog(newPoint, this.lastX ?? undefined);
  }

  updateWithExog(newPoint: number, xRow?: number[]): this {
    if (!(newPoint > 0) || !Number.isFinite(newPoint)) throw new Error('bsts: 價格必須為正有限數');
    const sp = this.sp;
    const m = sp.m;
    const yv = ((this.priceMode === 'log' ? Math.log(newPoint) : newPoint) - this.yMean) / this.yStd;
    const xOff = 2 + (sp.season > 1 ? sp.season - 1 : 0);
    // 先由 a_{T|T} 預測到 T+1
    const { a: aP, P: PP } = this.stepAhead(this.a, this.P);
    const Z = new Float64Array(m);
    Z[0] = 1;
    if (sp.season > 1) Z[2] = 1;
    const xr = xRow ?? this.lastX;
    if (this.hasExog && xr) for (let j = 0; j < sp.k; j++) Z[xOff + j] = (xr[j] - this.xMean[j]) / this.xStd[j];
    const PZ = new Float64Array(m);
    let F = 1;
    let za = 0;
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let j = 0; j < m; j++) s += PP[i * m + j] * Z[j];
      PZ[i] = s;
      F += Z[i] * s;
      za += Z[i] * aP[i];
    }
    const v = yv - za;
    const aF = new Float64Array(m);
    const PF = new Float64Array(m * m);
    for (let i = 0; i < m; i++) aF[i] = aP[i] + (PZ[i] * v) / F;
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) PF[i * m + j] = PP[i * m + j] - (PZ[i] * PZ[j]) / F;
    this.a = aF;
    this.P = PF;
    this.states.push(aF.slice());
    let fz = 0;
    for (let i = 0; i < m; i++) fz += Z[i] * aF[i];
    this.y.push(newPoint);
    this.fittedValues.push(this.back(this.yMean + this.yStd * fz));
    if (xRow) this.lastX = xRow.slice();
    return this;
  }

  private stepAhead(a: Float64Array, P: Float64Array): { a: Float64Array; P: Float64Array } {
    const sp = this.sp;
    const m = sp.m;
    const aN = new Float64Array(m);
    applyT(sp, a, aN);
    const TP = new Float64Array(m * m);
    const tin = new Float64Array(m);
    const tout = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) tin[i] = P[i * m + j];
      applyT(sp, tin, tout);
      for (let i = 0; i < m; i++) TP[i * m + j] = tout[i];
    }
    const PN = new Float64Array(m * m);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) tin[j] = TP[i * m + j];
      applyT(sp, tin, tout);
      for (let j = 0; j < m; j++) PN[i * m + j] = tout[j];
    }
    PN[0] += this.q[0];
    PN[m + 1] += this.q[1];
    if (sp.season > 1) PN[2 * m + 2] += this.q[2];
    return { a: aN, P: PN };
  }

  protected predictCore(h: number, level: number): Forecast {
    const sp = this.sp;
    const m = sp.m;
    const xOff = 2 + (sp.season > 1 ? sp.season - 1 : 0);
    const Z = new Float64Array(m);
    Z[0] = 1;
    if (sp.season > 1) Z[2] = 1;
    if (this.hasExog && this.lastX) for (let j = 0; j < sp.k; j++) Z[xOff + j] = (this.lastX[j] - this.xMean[j]) / this.xStd[j];
    let a = this.a;
    let P = this.P;
    const meanM: number[] = [];
    const sdM: number[] = [];
    for (let k = 0; k < h; k++) {
      const s = this.stepAhead(a, P);
      a = s.a;
      P = s.P;
      let za = 0;
      let zpz = 0;
      for (let i = 0; i < m; i++) {
        za += Z[i] * a[i];
        let r = 0;
        for (let j = 0; j < m; j++) r += P[i * m + j] * Z[j];
        zpz += Z[i] * r;
      }
      meanM.push(this.yMean + this.yStd * za);
      sdM.push(this.yStd * Math.sqrt(Math.max((zpz + 1) * this.sigma2, 0)));
    }
    return this.makeForecast(meanM, sdM, level);
  }

  /** 迴歸係數（原始單位）與標準誤 */
  regressionCoefficients(): { beta: number[]; se: number[] } {
    const sp = this.sp;
    if (!this.hasExog) return { beta: [], se: [] };
    const m = sp.m;
    const xOff = 2 + (sp.season > 1 ? sp.season - 1 : 0);
    const beta: number[] = [];
    const se: number[] = [];
    for (let j = 0; j < sp.k; j++) {
      const f = this.yStd / this.xStd[j];
      beta.push(this.a[xOff + j] * f);
      se.push(Math.sqrt(Math.max(this.P[(xOff + j) * m + xOff + j] * this.sigma2, 0)) * f);
    }
    return { beta, se };
  }

  /** 濾波後的分量序列（模型空間）：水準、斜率、季節 */
  components(): { level: number[]; slope: number[]; seasonal: number[] } {
    const ys = this.yStd;
    return {
      level: this.states.map((s) => this.yMean + ys * s[0]),
      slope: this.states.map((s) => ys * s[1]),
      seasonal: this.states.map((s) => (this.sp.season > 1 ? ys * s[2] : 0)),
    };
  }

  protected describeCore() {
    const { beta, se } = this.regressionCoefficients();
    const s2 = this.sigma2 * this.yStd * this.yStd;
    const nHyper = this.sp.season > 1 ? 4 : 3;
    const n = this.y.length;
    return {
      name: '貝氏結構時間序列（BSTS 近似：卡爾曼 + MLE）',
      formulaLatex:
        'y_t=\\mu_t+\\gamma_t+x_t^\\top\\beta+\\varepsilon_t,\\ \\mu_{t+1}=\\mu_t+\\delta_t+\\eta_t,\\ \\delta_{t+1}=\\delta_t+\\zeta_t,\\ \\gamma_{t+1}=-\\sum_{j=1}^{s-1}\\gamma_{t+1-j}+\\omega_t',
      params: {
        season: this.sp.season,
        sigmaEps2: s2,
        sigmaEta2: this.q[0] * s2,
        sigmaZeta2: this.q[1] * s2,
        sigmaOmega2: this.q[2] * s2,
        beta,
        betaSe: se,
        estimation: 'MLE（卡爾曼預測誤差分解），非 MCMC',
      },
      paramSpecs: this.paramSpecs(),
      useCases: '想把價格拆成趨勢、季節與「外生因子解釋的部分」（大盤、VIX、匯率、利率、法人籌碼）；需要可解釋的迴歸係數與分量圖。',
      failureModes:
        '未來外生值未知時以最後一筆持有，等同假設外生因子不變；外生變數與價格同期相關不代表可預測；變異數 MLE 可能落在邊界（某分量變異數 → 0）；不含 MCMC 的參數不確定性與 spike-and-slab 變數選擇，區間略窄。',
      derivation:
        '狀態 $\\alpha_t=(\\mu_t,\\delta_t,\\gamma_t,\\dots,\\gamma_{t-s+2},\\beta)$，卡爾曼濾波：$v_t=y_t-Z_ta_t$、$F_t=Z_tP_tZ_t^\\top+1$、$a_{t|t}=a_t+P_tZ_t^\\top v_t/F_t$、$a_{t+1}=Ta_{t|t}$、$P_{t+1}=TP_{t|t}T^\\top+Q$。' +
        '令 $Q=q\\,\\sigma_\\varepsilon^2$ 後集中化概似 $\\ln L_c=-\\tfrac{n-d}{2}(\\ln2\\pi+1+\\ln\\hat\\sigma^2)-\\tfrac12\\sum\\ln F_t$，以 Nelder–Mead 在 $\\ln q$ 上最大化（擴散初始化 $P_0=10^6I$，前 $d$ 期不計入）。' +
        '$\\beta$ 為無雜訊靜態狀態，$a_{T|T}$ 中的 $\\beta$ 即其 GLS 估計。此為頻率學派近似，非 MCMC 後驗抽樣。',
      diagnostics: {
        logLik: this.ll,
        aic: 2 * (nHyper + this.sp.m) - 2 * this.ll,
        stateDim: this.sp.m,
        exogCount: this.sp.k,
        exogFutureAssumption: this.hasExog ? '未來外生值 = 最後一筆持有' : '無外生變數',
        lastSlope: this.a.length > 1 ? this.a[1] * this.yStd : 0,
        weighted: false,
      },
    };
  }
}
