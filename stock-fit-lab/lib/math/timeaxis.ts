/**
 * 時間軸標準化：所有模型擬合前先把索引 0..n−1 線性映射到 [−1, 1]。
 *   τ(i) = 2i/(n−1) − 1
 * 外推第 n−1+k 期時沿用同一映射，τ 會超出 1（這正是外推風險的來源）。
 * 標準化只依賴「訓練視窗長度」，不使用任何價格統計量，因此不會引入前視偏誤。
 */
export interface TimeAxis {
  n: number;
  /** 索引 → 標準化時間 */
  tau: (i: number) => number;
  /** 訓練期標準化時間陣列 */
  train: number[];
  /** 未來 h 期的標準化時間 */
  future: (h: number) => number[];
}

export function makeTimeAxis(n: number): TimeAxis {
  const denom = Math.max(n - 1, 1);
  const tau = (i: number) => (2 * i) / denom - 1;
  return {
    n,
    tau,
    train: Array.from({ length: n }, (_, i) => tau(i)),
    future: (h: number) => Array.from({ length: h }, (_, k) => tau(n - 1 + k + 1)),
  };
}

/** 價格空間轉換 */
export function toModelSpace(y: number[], mode: 'raw' | 'log' = 'raw'): number[] {
  return mode === 'log' ? y.map((v) => Math.log(v)) : y.slice();
}

export function fromModelSpace(v: number, mode: 'raw' | 'log' = 'raw'): number {
  return mode === 'log' ? Math.exp(v) : v;
}

/** 指數衰減權重 w_i = λ^(T−i)，i = 0..T（最新一筆權重為 1） */
export function decayWeights(n: number, lambda = 0.97): number[] {
  return Array.from({ length: n }, (_, i) => Math.pow(lambda, n - 1 - i));
}
