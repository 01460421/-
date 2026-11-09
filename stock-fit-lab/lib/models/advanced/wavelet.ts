/**
 * 小波多尺度分解（Daubechies db4，8 個濾波係數、4 個消失動量）+ 分層擬合重組。
 *
 * 正交濾波器組（h = 尺度濾波器，g = 小波濾波器，L = 8）：
 *   g_k = (-1)^k\,h_{L-1-k}
 * 週期延伸的單層分析（N 為偶數；奇數長度先複製最後一點補成偶數並記錄原長）：
 *   a_i = \sum_{k} h_k\,x_{(2i+k)\bmod N},\qquad d_i = \sum_k g_k\,x_{(2i+k)\bmod N}
 * 合成（正交 ⇒ 合成 = 分析的轉置，完美重建）：
 *   x_{(2i+k)\bmod N} \mathrel{+}= h_k a_i + g_k d_i
 *
 * 分層：先做對稱延伸 x̃ = [x, reverse(x)]（消除週期延伸在最新端的跳躍），分解 J 層，
 *   趨勢層 = 只保留 a_J 重建；中週期層 = 只保留 d_{q+1..J}；雜訊層 = 只保留 d_{1..q}（q = noiseLevels）；
 *   取前 n 點。由線性與完美重建，三層相加恰等於原序列。
 * 各層擬合與外推見 multiscale.ts（趨勢 Holt、中週期諧波、雜訊不外推）。
 */
import type { Forecast, ParamSpec } from '../../types';
import { BaseModel } from '../base';
import { fitLayers, forecastLayers, type LayerModel, type Layers } from './multiscale';

/** db4 尺度濾波器（重建低通，正規化使 Σh = √2、Σh² = 1） */
export const DB4_H = [
  0.23037781330885523, 0.7148465705525415, 0.6308807679295904, -0.02798376941698385, -0.18703481171888114,
  0.030841381835986965, 0.032883011666982945, -0.010597401784997278,
];
export const DB4_G = DB4_H.map((_, k) => (k % 2 === 0 ? 1 : -1) * DB4_H[DB4_H.length - 1 - k]);

export interface DwtResult {
  approx: number[];
  /** details[0] = 第 1 層（最細尺度） */
  details: number[][];
  /** 每層分解前的原始長度（用於重建時截斷補點） */
  lengths: number[];
}

function analyze(x: number[]): { a: number[]; d: number[] } {
  const N = x.length;
  const half = N / 2;
  const a = new Array<number>(half).fill(0);
  const d = new Array<number>(half).fill(0);
  const L = DB4_H.length;
  for (let i = 0; i < half; i++) {
    let sa = 0;
    let sd = 0;
    for (let k = 0; k < L; k++) {
      const v = x[(2 * i + k) % N];
      sa += DB4_H[k] * v;
      sd += DB4_G[k] * v;
    }
    a[i] = sa;
    d[i] = sd;
  }
  return { a, d };
}

function synthesize(a: number[], d: number[]): number[] {
  const N = 2 * a.length;
  const x = new Array<number>(N).fill(0);
  const L = DB4_H.length;
  for (let i = 0; i < a.length; i++) {
    for (let k = 0; k < L; k++) {
      const idx = (2 * i + k) % N;
      x[idx] += DB4_H[k] * a[i] + DB4_G[k] * d[i];
    }
  }
  return x;
}

/** 最大可分解層數：每層分解前長度需 ≥ 濾波器長度 */
export function maxDwtLevel(n: number): number {
  let J = 0;
  let len = n;
  while (len >= DB4_H.length) {
    len = Math.ceil(len / 2);
    J++;
  }
  return Math.max(J, 0);
}

/** 多層 db4 DWT（週期延伸） */
export function dwtForward(x: number[], levels: number): DwtResult {
  const J = Math.min(levels, maxDwtLevel(x.length));
  let cur = x.slice();
  const details: number[][] = [];
  const lengths: number[] = [];
  for (let j = 0; j < J; j++) {
    lengths.push(cur.length);
    if (cur.length % 2 === 1) cur = [...cur, cur[cur.length - 1]];
    const { a, d } = analyze(cur);
    details.push(d);
    cur = a;
  }
  return { approx: cur, details, lengths };
}

/** 逆 DWT：完美重建 */
export function dwtInverse(r: DwtResult): number[] {
  let cur = r.approx.slice();
  for (let j = r.details.length - 1; j >= 0; j--) {
    cur = synthesize(cur, r.details[j]).slice(0, r.lengths[j]);
  }
  return cur;
}

/**
 * 以 db4 把序列拆成趨勢 / 中週期 / 雜訊三層（對稱延伸以降低邊界效應）。
 */
export function waveletLayers(x: number[], levels = 0, noiseLevels = 2): Layers & { levels: number } {
  const n = x.length;
  const ext = [...x, ...x.slice().reverse()];
  const auto = Math.min(6, Math.max(1, maxDwtLevel(ext.length) - 1));
  const J = Math.max(1, Math.min(levels > 0 ? levels : auto, maxDwtLevel(ext.length)));
  const q = Math.min(Math.max(0, noiseLevels), J);
  const dec = dwtForward(ext, J);
  const zeroDetails = () => dec.details.map((d) => d.map(() => 0));
  const rec = (keepApprox: boolean, keep: (j: number) => boolean) => {
    const details = zeroDetails();
    dec.details.forEach((d, j) => {
      if (keep(j)) details[j] = d.slice();
    });
    const approx = keepApprox ? dec.approx.slice() : dec.approx.map(() => 0);
    return dwtInverse({ approx, details, lengths: dec.lengths }).slice(0, n);
  };
  const trend = rec(true, () => false);
  const noise = rec(false, (j) => j < q);
  const mid = rec(false, (j) => j >= q);
  return { trend, mid, noise, levels: dec.details.length };
}

export class WaveletModel extends BaseModel {
  readonly id = 'wavelet' as const;
  readonly version = '1.0.0';

  private layers: Layers & { levels: number } = { trend: [], mid: [], noise: [], levels: 0 };
  private lm: LayerModel | null = null;

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'levels', label: '分解層數 J（0 = 自動）', min: 0, max: 8, step: 1, default: 0, auto: true },
      { key: 'noiseLevels', label: '歸為雜訊的最細層數 q', min: 0, max: 4, step: 1, default: 2 },
      { key: 'harmonics', label: '中週期層諧波數 m', min: 0, max: 8, step: 1, default: 3 },
    ];
  }

  protected fitCore(): void {
    const y = this.ys();
    if (y.length < 16) {
      this.degraded = '資料 < 16 筆，小波分解層數不足，全部視為趨勢層';
      this.layers = { trend: y.slice(), mid: y.map(() => 0), noise: y.map(() => 0), levels: 0 };
    } else {
      this.layers = waveletLayers(y, Math.round(this.param('levels', 0)), Math.round(this.param('noiseLevels', 2)));
    }
    const q = Math.round(this.param('noiseLevels', 2));
    this.lm = fitLayers(y, this.layers, Math.round(this.param('harmonics', 3)), Math.pow(2, q + 1));
    this.fittedValues = this.lm.fitted.map((v) => this.back(v));
    this.sigma = this.lm.sigmaRes;
  }

  protected predictCore(h: number, level: number): Forecast {
    const f = forecastLayers(this.lm!, h);
    return this.makeForecast(f.mean, f.sd, level);
  }

  /** 三層分解結果（模型空間） */
  getLayers(): Layers {
    return { trend: this.layers.trend.slice(), mid: this.layers.mid.slice(), noise: this.layers.noise.slice() };
  }

  protected describeCore() {
    const lm = this.lm!;
    return {
      name: '小波多尺度分解（db4）',
      formulaLatex:
        'y_t=\\underbrace{A_J(t)}_{\\text{趨勢}}+\\underbrace{\\sum_{j=q+1}^{J}D_j(t)}_{\\text{中週期}}+\\underbrace{\\sum_{j=1}^{q}D_j(t)}_{\\text{雜訊}}',
      params: {
        levels: this.layers.levels,
        noiseLevels: Math.round(this.param('noiseLevels', 2)),
        holtAlpha: lm.holt.alpha,
        holtBeta: lm.holt.beta,
        holtPhi: lm.holt.phi,
        harmonicPeriods: lm.harm.omegas.map((w) => (2 * Math.PI) / w),
      },
      paramSpecs: this.paramSpecs(),
      useCases: '價格同時含長期趨勢與數週至數月的循環；想看「去除雜訊後」的結構；雜訊層不外推可避免追逐短期噪音。',
      failureModes:
        '邊界效應：最新端的分解受延伸方式影響，新資料進來時最後幾點的分層會被改寫（重繪）；諧波外推假設週期持續；趨勢層的 Holt 斜率在轉折點落後。',
      derivation:
        'db4 正交濾波器組 $g_k=(-1)^kh_{7-k}$，單層 $a_i=\\sum_kh_kx_{2i+k}$、$d_i=\\sum_kg_kx_{2i+k}$，正交性保證完美重建。' +
        '先對稱延伸 $[x,\\mathrm{rev}(x)]$ 再分解，降低最新端的人為跳躍。趨勢層 $A_J$ 以阻尼 Holt 外推、中週期層以週期圖挑頻率後最小平方諧波外推、雜訊層 $\\sum_{j\\le q}D_j$ 預測為 0。' +
        '區間 $\\mathrm{sd}_k=\\sqrt{\\sigma_{res}^2+k\\sigma_{\\Delta}^2}$。',
      diagnostics: {
        levels: this.layers.levels,
        energyTrend: lm.energy.trend,
        energyMid: lm.energy.mid,
        energyNoise: lm.energy.noise,
        noiseStd: this.layers.noise.length > 1 ? Math.sqrt(this.layers.noise.reduce((s, v) => s + v * v, 0) / this.layers.noise.length) : 0,
        sigmaDiff: lm.sigmaDiff,
        weighted: false,
      },
    };
  }
}
