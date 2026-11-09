/**
 * 經驗模態分解（EMD, Huang 1998）+ 分層擬合重組。
 *
 * 篩選（sifting）：對目前訊號 h 找局部極大 / 極小，以自然三次樣條連成上 / 下包絡 e_max、e_min，
 *   m(t) = \tfrac12\big(e_{\max}(t) + e_{\min}(t)\big),\qquad h \leftarrow h - m
 * 直到 Cauchy 型停止準則
 *   SD = \frac{\sum_t (h_{k-1}(t)-h_k(t))^2}{\sum_t h_{k-1}(t)^2} < \varepsilon（預設 0.2）
 * 或達最大篩選次數，得到一個本質模態函數 IMF c_i；殘差 r ← r − c_i，重複直到 r 單調（極值 < 3 個）。
 *   x(t) = \sum_{i=1}^{K} c_i(t) + r_K(t)   （由構造保證恰好相加回原訊號）
 *
 * 端點處理：包絡在兩端各加一個節點，取端點值與最近同類極值的較大（上包絡）/ 較小（下包絡）者。
 *
 * 分組：以平均週期 \bar T_i = n / (#極大值) 分類
 *   \bar T_i < noisePeriod → 雜訊層；\bar T_i > n/3 → 併入趨勢層（連同殘差）；其餘 → 中週期層。
 */
import type { Forecast, ParamSpec } from '../../types';
import { BaseModel } from '../base';
import { naturalCubicSpline } from './spline';
import { fitLayers, forecastLayers, type LayerModel, type Layers } from './multiscale';

export function findExtrema(x: number[]): { maxima: number[]; minima: number[] } {
  const maxima: number[] = [];
  const minima: number[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > x[i - 1] && x[i] >= x[i + 1]) maxima.push(i);
    else if (x[i] < x[i - 1] && x[i] <= x[i + 1]) minima.push(i);
  }
  return { maxima, minima };
}

function envelope(x: number[], idx: number[], upper: boolean): number[] {
  const n = x.length;
  const pick = upper ? Math.max : Math.min;
  const xs = [0, ...idx, n - 1];
  const ys = [pick(x[0], x[idx[0]]), ...idx.map((i) => x[i]), pick(x[n - 1], x[idx[idx.length - 1]])];
  // 去除重複節點（極值恰在端點旁）
  const kx: number[] = [];
  const ky: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (kx.length && xs[i] <= kx[kx.length - 1]) continue;
    kx.push(xs[i]);
    ky.push(ys[i]);
  }
  const s = naturalCubicSpline(kx, ky);
  return Array.from({ length: n }, (_, t) => s.evaluate(t));
}

export interface EmdResult {
  imfs: number[][];
  residue: number[];
  siftCounts: number[];
}

export function emd(x: number[], opts: { maxImfs?: number; maxSift?: number; sdThreshold?: number } = {}): EmdResult {
  const maxImfs = opts.maxImfs ?? 10;
  const maxSift = opts.maxSift ?? 50;
  const sdThr = opts.sdThreshold ?? 0.2;
  const n = x.length;
  let residue = x.slice();
  const imfs: number[][] = [];
  const siftCounts: number[] = [];
  for (let k = 0; k < maxImfs; k++) {
    const ex = findExtrema(residue);
    if (ex.maxima.length < 2 || ex.minima.length < 2) break;
    let h = residue.slice();
    let s = 0;
    for (s = 0; s < maxSift; s++) {
      const e = findExtrema(h);
      if (e.maxima.length < 2 || e.minima.length < 2) break;
      const up = envelope(h, e.maxima, true);
      const lo = envelope(h, e.minima, false);
      const next = h.map((v, t) => v - 0.5 * (up[t] + lo[t]));
      let num = 0;
      let den = 0;
      for (let t = 0; t < n; t++) {
        num += (h[t] - next[t]) ** 2;
        den += h[t] * h[t];
      }
      h = next;
      if (den === 0 || num / den < sdThr) {
        s++;
        break;
      }
    }
    imfs.push(h);
    siftCounts.push(s);
    residue = residue.map((v, t) => v - h[t]);
  }
  return { imfs, residue, siftCounts };
}

export function meanPeriod(imf: number[]): number {
  const nMax = findExtrema(imf).maxima.length;
  return nMax > 0 ? imf.length / nMax : Infinity;
}

export function emdLayers(x: number[], noisePeriod = 8, maxImfs = 10): Layers & { periods: number[]; groups: string[]; imfCount: number } {
  const n = x.length;
  const r = emd(x, { maxImfs });
  const trend = r.residue.slice();
  const mid = new Array<number>(n).fill(0);
  const noise = new Array<number>(n).fill(0);
  const periods: number[] = [];
  const groups: string[] = [];
  for (const imf of r.imfs) {
    const p = meanPeriod(imf);
    periods.push(p);
    const target = p < noisePeriod ? noise : p > n / 3 ? trend : mid;
    groups.push(p < noisePeriod ? 'noise' : p > n / 3 ? 'trend' : 'mid');
    for (let t = 0; t < n; t++) target[t] += imf[t];
  }
  return { trend, mid, noise, periods, groups, imfCount: r.imfs.length };
}

export class EmdModel extends BaseModel {
  readonly id = 'emd' as const;
  readonly version = '1.0.0';

  private layers: ReturnType<typeof emdLayers> | null = null;
  private lm: LayerModel | null = null;

  paramSpecs(): ParamSpec[] {
    return [
      { key: 'noisePeriod', label: '雜訊層平均週期上限（交易日）', min: 2, max: 30, step: 1, default: 8 },
      { key: 'maxImfs', label: '最多 IMF 數', min: 1, max: 12, step: 1, default: 8 },
      { key: 'harmonics', label: '中週期層諧波數 m', min: 0, max: 8, step: 1, default: 3 },
    ];
  }

  protected fitCore(): void {
    const y = this.ys();
    const np = Math.round(this.param('noisePeriod', 8));
    this.layers = emdLayers(y, np, Math.round(this.param('maxImfs', 8)));
    if (this.layers.imfCount === 0) this.degraded = '序列極值不足，無法萃取 IMF，全部視為趨勢層';
    this.lm = fitLayers(y, this.layers, Math.round(this.param('harmonics', 3)), np);
    this.fittedValues = this.lm.fitted.map((v) => this.back(v));
    this.sigma = this.lm.sigmaRes;
  }

  protected predictCore(h: number, level: number): Forecast {
    const f = forecastLayers(this.lm!, h);
    return this.makeForecast(f.mean, f.sd, level);
  }

  getLayers(): Layers {
    const l = this.layers!;
    return { trend: l.trend.slice(), mid: l.mid.slice(), noise: l.noise.slice() };
  }

  protected describeCore() {
    const l = this.layers!;
    const lm = this.lm!;
    return {
      name: '經驗模態分解（EMD）',
      formulaLatex: 'x(t)=\\sum_{i=1}^{K}c_i(t)+r_K(t),\\quad m=\\tfrac12(e_{\\max}+e_{\\min}),\\ h\\leftarrow h-m',
      params: {
        imfCount: l.imfCount,
        imfPeriods: l.periods.map((p) => (Number.isFinite(p) ? p : -1)),
        imfGroups: l.groups.join(','),
        holtAlpha: lm.holt.alpha,
        holtBeta: lm.holt.beta,
        holtPhi: lm.holt.phi,
      },
      paramSpecs: this.paramSpecs(),
      useCases: '非線性、非平穩、週期長度會變動的價格；與小波互為對照（EMD 自適應、不需選基底）。',
      failureModes:
        '模態混疊（同一 IMF 混入不同尺度）；端點效應導致最新端的 IMF 隨新資料改寫；IMF 分組門檻主觀；諧波外推假設週期持續。',
      derivation:
        '篩選以自然三次樣條包絡 $e_{\\max},e_{\\min}$ 的平均 $m$ 反覆扣除，直到 $SD=\\sum(h_{k-1}-h_k)^2/\\sum h_{k-1}^2<0.2$。' +
        'IMF 依平均週期 $\\bar T=n/\\#\\max$ 分組：$\\bar T<$ noisePeriod 為雜訊層（不外推），$\\bar T>n/3$ 與殘差為趨勢層（阻尼 Holt 外推），其餘為中週期層（諧波外推）。' +
        '由構造 $\\sum c_i+r=x$ 精確成立。',
      diagnostics: {
        imfCount: l.imfCount,
        energyTrend: lm.energy.trend,
        energyMid: lm.energy.mid,
        energyNoise: lm.energy.noise,
        sigmaDiff: lm.sigmaDiff,
        weighted: false,
      },
    };
  }
}
