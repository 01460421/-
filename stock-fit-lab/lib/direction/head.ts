/**
 * 方向分類頭（規格八「漲跌勢判斷為第一優先」第 1 點）：每個模型另訓練一個 logistic 分類頭，
 * 損失以方向錯誤為主、幅度為輔。
 *
 *   P(\text{up}\mid x) = \sigma(b + x^\top\beta)
 *   \mathcal L(\beta,b) = -\frac{1}{\sum_i w_i}\sum_i w_i\big[o_i\ln p_i + (1-o_i)\ln(1-p_i)\big] + \frac\lambda2\|\beta\|^2
 *   w_i = 1 + c\cdot\frac{|r_i|}{\overline{|r|}}
 *
 * 也就是說：損失本身只懲罰「方向錯誤」（交叉熵），而「幅度」只透過樣本權重進來——
 * 漲跌幅越大的樣本判錯代價越高（c 預設 1，c = 0 退化為純方向損失）。
 * 以 IRLS（牛頓法）求解，截距不受 L2 懲罰；特徵以訓練樣本的平均 / 標準差標準化（只用訓練資料）。
 *
 * 特徵（全部只用預測起點以前的資料）：
 *   模型預測報酬的 z 值、logit(模型 pUp)、5 / 20 日動能 z 值、ln(20 日波動)、Hurst − 0.5、ADX / 100
 */
import { sigmoid, std } from '../math/stats';
import { solve } from '../math/linalg';
import { hurstDFA } from '../models/advanced/hurst';
import { adx as adxSeries, type OHLC } from './filters';

export interface DirectionSample {
  features: number[];
  up: boolean;
  /** 實現報酬的絕對值（用於幅度權重） */
  absRet: number;
  /** 預測起點索引（walk-forward 用） */
  t?: number;
}

export interface DirectionHeadOptions {
  /** L2 懲罰 λ（預設 1e-2） */
  l2?: number;
  /** 幅度權重係數 c（預設 1） */
  magnitudeWeight?: number;
  maxIter?: number;
  tol?: number;
}

export interface DirectionHead {
  predict(features: number[]): number;
  /** 標準化空間的係數（不含截距） */
  coef: number[];
  intercept: number;
  featureMean: number[];
  featureStd: number[];
  iterations: number;
  converged: boolean;
  trainLoss: number;
}

export function trainDirectionHead(samples: DirectionSample[], opts: DirectionHeadOptions = {}): DirectionHead {
  const n = samples.length;
  if (!n) throw new Error('trainDirectionHead: 沒有樣本');
  const p = samples[0].features.length;
  const lam = opts.l2 ?? 1e-2;
  const c = opts.magnitudeWeight ?? 1;
  const maxIter = opts.maxIter ?? 50;
  const tol = opts.tol ?? 1e-8;

  // 標準化（只用訓練樣本）
  const mu = new Array<number>(p).fill(0);
  const sd = new Array<number>(p).fill(1);
  for (let j = 0; j < p; j++) {
    const col = samples.map((s) => (Number.isFinite(s.features[j]) ? s.features[j] : 0));
    mu[j] = col.reduce((a, b) => a + b, 0) / n;
    const v = n > 1 ? std(col) : 0;
    sd[j] = v > 1e-12 ? v : 1;
  }
  const X = samples.map((s) => [1, ...s.features.map((v, j) => ((Number.isFinite(v) ? v : 0) - mu[j]) / sd[j])]);
  const o = samples.map((s) => (s.up ? 1 : 0));
  const meanAbs = samples.reduce((a, s) => a + Math.abs(s.absRet), 0) / n || 1;
  const w = samples.map((s) => 1 + c * (Math.abs(s.absRet) / meanAbs));
  const sw = w.reduce((a, b) => a + b, 0);
  const d = p + 1;

  const lossOf = (beta: number[]) => {
    let L = 0;
    for (let i = 0; i < n; i++) {
      let z = 0;
      for (let j = 0; j < d; j++) z += X[i][j] * beta[j];
      // 穩定的 log(1+e^z)
      const sp = z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z));
      L += w[i] * (sp - o[i] * z);
    }
    let pen = 0;
    for (let j = 1; j < d; j++) pen += beta[j] * beta[j];
    return L / sw + 0.5 * lam * pen;
  };

  let beta = new Array<number>(d).fill(0);
  let loss = lossOf(beta);
  let it = 0;
  let converged = false;
  for (it = 0; it < maxIter; it++) {
    const g = new Array<number>(d).fill(0);
    const H = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    for (let i = 0; i < n; i++) {
      let z = 0;
      for (let j = 0; j < d; j++) z += X[i][j] * beta[j];
      const q = sigmoid(z);
      const r = (w[i] * (q - o[i])) / sw;
      const hw = (w[i] * Math.max(q * (1 - q), 1e-10)) / sw;
      for (let a = 0; a < d; a++) {
        g[a] += r * X[i][a];
        for (let b = a; b < d; b++) H[a][b] += hw * X[i][a] * X[i][b];
      }
    }
    for (let a = 0; a < d; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
    for (let j = 1; j < d; j++) {
      g[j] += lam * beta[j];
      H[j][j] += lam;
    }
    H[0][0] += 1e-10;
    const delta = solve(H, g);
    // 回溯線搜尋確保損失下降
    let step = 1;
    let next = beta;
    let nextLoss = loss;
    for (let k = 0; k < 20; k++) {
      const cand = beta.map((v, j) => v - step * delta[j]);
      const cl = lossOf(cand);
      if (cl <= loss + 1e-15) {
        next = cand;
        nextLoss = cl;
        break;
      }
      step /= 2;
    }
    const improvement = loss - nextLoss;
    beta = next;
    loss = nextLoss;
    if (improvement < tol) {
      converged = true;
      break;
    }
  }
  const coef = beta.slice(1);
  const intercept = beta[0];
  return {
    coef,
    intercept,
    featureMean: mu,
    featureStd: sd,
    iterations: it,
    converged,
    trainLoss: loss,
    predict(features: number[]) {
      let z = intercept;
      for (let j = 0; j < p; j++) z += coef[j] * (((Number.isFinite(features[j]) ? features[j] : 0) - mu[j]) / sd[j]);
      return sigmoid(z);
    },
  };
}

// ───────────────────────── 特徵工程（只用過去資料） ─────────────────────────

export const DIRECTION_FEATURE_NAMES = ['modelRetZ', 'modelPUpLogit', 'mom5Z', 'mom20Z', 'logVol20', 'hurstMinusHalf', 'adx'] as const;

export interface FeatureInput {
  /** 預測起點以前（含）的價格 */
  past: number[];
  h: number;
  /** 模型預測的 h 期對數報酬 */
  modelPredReturn?: number;
  /** 模型的 P(上漲) */
  modelPUp?: number;
  hurst?: number;
  adx?: number;
}

const logit = (p: number) => {
  const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4);
  return Math.log(q / (1 - q));
};

export function directionFeatures(inp: FeatureInput): number[] {
  const y = inp.past;
  const n = y.length;
  const rets: number[] = [];
  for (let i = Math.max(1, n - 20); i < n; i++) rets.push(Math.log(y[i] / y[i - 1]));
  const vol = rets.length > 2 ? std(rets) || 1e-4 : 1e-2;
  const mom = (k: number) => (n > k ? Math.log(y[n - 1] / y[n - 1 - k]) / (vol * Math.sqrt(k)) : 0);
  return [
    inp.modelPredReturn !== undefined ? inp.modelPredReturn / (vol * Math.sqrt(Math.max(inp.h, 1))) : 0,
    inp.modelPUp !== undefined ? logit(inp.modelPUp) : 0,
    mom(5),
    mom(20),
    Math.log(vol),
    inp.hurst !== undefined && Number.isFinite(inp.hurst) ? inp.hurst - 0.5 : 0,
    inp.adx !== undefined && Number.isFinite(inp.adx) ? inp.adx / 100 : 0,
  ];
}

export interface BuildSamplesOptions {
  /** 模型介面：給定過去價格與 h，回傳預測報酬與 pUp（每個起點只看過去） */
  model?: (past: number[], h: number) => { predReturn: number; pUp: number };
  /** 第一個起點（預設 60） */
  start?: number;
  /** 起點間距（預設 1） */
  step?: number;
  /** 計算 Hurst 的視窗（報酬數，預設 250；0 = 不算） */
  hurstWindow?: number;
  /** 提供 OHLC 時加入 ADX(14) 特徵；長度需與 prices 相同 */
  bars?: OHLC[];
}

/**
 * 以 walk-forward 方式建立方向樣本：起點 t 的特徵只用 prices[0..t]，標籤為 prices[t+h] > prices[t]。
 */
export function buildDirectionSamples(prices: number[], h: number, opts: BuildSamplesOptions = {}): DirectionSample[] {
  const start = Math.max(opts.start ?? 60, 21);
  const step = Math.max(1, opts.step ?? 1);
  const hw = opts.hurstWindow ?? 250;
  const adxAll = opts.bars && opts.bars.length === prices.length ? adxSeries(opts.bars).adx : null; // 因果遞迴，取第 t 點無前視
  const out: DirectionSample[] = [];
  for (let t = start; t + h < prices.length; t += step) {
    const past = prices.slice(0, t + 1);
    let modelPredReturn: number | undefined;
    let modelPUp: number | undefined;
    if (opts.model) {
      const m = opts.model(past, h);
      modelPredReturn = m.predReturn;
      modelPUp = m.pUp;
    }
    let hurst: number | undefined;
    if (hw > 0 && t >= 60) {
      const seg = past.slice(-hw - 1);
      const r: number[] = [];
      for (let i = 1; i < seg.length; i++) r.push(Math.log(seg[i] / seg[i - 1]));
      hurst = hurstDFA(r).H;
    }
    const features = directionFeatures({ past, h, modelPredReturn, modelPUp, hurst, adx: adxAll ? adxAll[t] : undefined });
    const ret = Math.log(prices[t + h] / prices[t]);
    out.push({ features, up: ret > 0, absRet: Math.abs(ret), t });
  }
  return out;
}

/**
 * 分類頭的走動式樣本外預測：預測樣本 j 時，只用「標籤已實現」的過去樣本訓練
 * （起點 t_i ≤ t_j − h，避免 h 期標籤重疊造成的洩漏），每 refitEvery 個樣本重訓一次。
 * 回傳與 samples 對齊的 pUp（訓練樣本不足處為 NaN）。
 */
export function walkForwardHeadPredictions(
  samples: DirectionSample[],
  h: number,
  opts: DirectionHeadOptions & { minTrain?: number; refitEvery?: number } = {},
): number[] {
  const minTrain = opts.minTrain ?? 100;
  const every = Math.max(1, opts.refitEvery ?? 20);
  const out = new Array<number>(samples.length).fill(NaN);
  let head: DirectionHead | null = null;
  let lastFit = -Infinity;
  for (let j = 0; j < samples.length; j++) {
    const tj = samples[j].t ?? j;
    if (!head || j - lastFit >= every) {
      const train = samples.filter((s, i) => i < j && (s.t ?? i) + h <= tj);
      if (train.length >= minTrain) {
        head = trainDirectionHead(train, opts);
        lastFit = j;
      }
    }
    if (head) out[j] = head.predict(samples[j].features);
  }
  return out;
}
