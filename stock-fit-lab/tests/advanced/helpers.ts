import { normalGenerator } from '@/lib/math/random';

/** 由百分比對數報酬合成價格 */
export function pricesFromPctReturns(r: number[], p0 = 100): number[] {
  const out = [p0];
  for (const v of r) out.push(out[out.length - 1] * Math.exp(v / 100));
  return out;
}

/** 模擬 GARCH(1,1) 百分比報酬 */
export function simulateGarch(n: number, omega: number, alpha: number, beta: number, mu = 0, seed = 11): number[] {
  const z = normalGenerator(seed);
  let s2 = omega / (1 - alpha - beta);
  let ePrev = 0;
  const r: number[] = [];
  for (let t = 0; t < n + 200; t++) {
    s2 = omega + alpha * ePrev * ePrev + beta * s2;
    const e = Math.sqrt(s2) * z();
    ePrev = e;
    if (t >= 200) r.push(mu + e);
  }
  return r;
}
