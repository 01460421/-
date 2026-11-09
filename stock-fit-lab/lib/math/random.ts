/**
 * 可重現的亂數產生器（蒙地卡羅與測試用合成資料必須固定種子）。
 */

/** mulberry32：32-bit 狀態、速度快、統計品質足以用於模擬 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller 標準常態產生器 */
export function normalGenerator(seed: number): () => number {
  const u = mulberry32(seed);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u1 = 0;
    while (u1 <= 1e-300) u1 = u();
    const u2 = u();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  };
}

/** 合成幾何布朗運動價格路徑（測試與洩漏稽核用；正式分析不得使用合成資料） */
export function simulateGBM(s0: number, mu: number, sigma: number, n: number, seed = 42, dt = 1): number[] {
  const z = normalGenerator(seed);
  const out = [s0];
  for (let i = 1; i < n; i++) {
    out.push(out[i - 1] * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z()));
  }
  return out;
}

/** 純隨機漫步（對數價格），洩漏測試使用 */
export function simulateRandomWalk(s0: number, sigma: number, n: number, seed = 7): number[] {
  return simulateGBM(s0, 0.5 * sigma * sigma, sigma, n, seed);
}
