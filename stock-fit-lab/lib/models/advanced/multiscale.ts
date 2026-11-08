/**
 * 多尺度「分層擬合 → 重組」預測器（小波 db4 與 EMD 共用）。
 *
 *   y_t = T_t（趨勢層）+ C_t（中週期層）+ N_t（雜訊層）
 *
 *  - 趨勢層：Holt 線性平滑外推  \hat T_{n-1+k} = \ell_{n-1} + k\,b_{n-1}
 *  - 中週期層：週期圖選前 m 個頻率後最小平方諧波擬合，外推
 *      \hat C_{n-1+k} = c_0 + \sum_j b_j\cos\omega_j(n-1+k) + c_j\sin\omega_j(n-1+k)
 *  - 雜訊層：不外推（預測為 0），只貢獻不確定性
 *
 * 區間（模型空間）：sd_k = \sqrt{\sigma_{res}^2 + k\,\sigma_\Delta^2}
 *   σ_res = 重組殘差（y − T − Ĉ）標準差，σ_Δ = 一階差分 Δy 的標準差（隨機漫步式擴張，避免平滑層低估風險）。
 */
import { holtFit, harmonicFit, type HoltFit, type HarmonicFit } from './common';
import { std, diff } from '../../math/stats';

export interface Layers {
  trend: number[];
  mid: number[];
  noise: number[];
}

export interface LayerModel {
  holt: HoltFit;
  harm: HarmonicFit;
  fitted: number[];
  sigmaRes: number;
  sigmaDiff: number;
  n: number;
  energy: { trend: number; mid: number; noise: number };
}

export function fitLayers(y: number[], layers: Layers, harmonics = 3, minPeriod = 4): LayerModel {
  const n = y.length;
  const holt = holtFit(layers.trend);
  const harm = harmonicFit(layers.mid, harmonics, minPeriod);
  const fitted = layers.trend.map((t, i) => t + harm.fitted[i]);
  const res = y.map((v, i) => v - fitted[i]);
  const ss = (a: number[]) => a.reduce((s, v) => s + v * v, 0);
  const tc = layers.trend.map((v) => v - layers.trend.reduce((a, b) => a + b, 0) / n);
  const tot = ss(tc) + ss(layers.mid) + ss(layers.noise) || 1;
  return {
    holt,
    harm,
    fitted,
    sigmaRes: std(res) || 0,
    sigmaDiff: n > 2 ? std(diff(y)) || 0 : 0,
    n,
    energy: { trend: ss(tc) / tot, mid: ss(layers.mid) / tot, noise: ss(layers.noise) / tot },
  };
}

export function forecastLayers(m: LayerModel, h: number): { mean: number[]; sd: number[]; trend: number[]; mid: number[] } {
  const trend: number[] = [];
  const mid: number[] = [];
  const mean: number[] = [];
  const sd: number[] = [];
  for (let k = 1; k <= h; k++) {
    const t = m.holt.level + k * m.holt.trend;
    const c = m.harm.evalAt(m.n - 1 + k);
    trend.push(t);
    mid.push(c);
    mean.push(t + c); // 雜訊層不外推
    sd.push(Math.sqrt(m.sigmaRes * m.sigmaRes + k * m.sigmaDiff * m.sigmaDiff));
  }
  return { mean, sd, trend, mid };
}
