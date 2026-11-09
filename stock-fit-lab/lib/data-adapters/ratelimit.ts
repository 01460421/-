/**
 * 每個 Adapter 一個 token bucket 速率限制器，另外以滑動一小時視窗統計配額用量
 * （健康儀表板顯示 quotaUsed / quotaLimit）。
 */

export interface RateLimiterOptions {
  /** 桶容量（允許的瞬間突發請求數） */
  capacity: number;
  /** 每秒補充的 token 數 */
  refillPerSec: number;
  /** 每小時配額上限（僅用於顯示 / 預警；不強制） */
  hourlyQuota?: number;
}

export class TokenBucket {
  readonly capacity: number;
  readonly refillPerSec: number;
  readonly hourlyQuota?: number;
  private tokens: number;
  private last: number;
  private readonly calls: number[] = [];

  constructor(opts: RateLimiterOptions, private readonly now: () => number = () => Date.now()) {
    this.capacity = Math.max(1, opts.capacity);
    this.refillPerSec = Math.max(1e-6, opts.refillPerSec);
    this.hourlyQuota = opts.hourlyQuota;
    this.tokens = this.capacity;
    this.last = this.now();
  }

  private refill(): void {
    const t = this.now();
    const dt = (t - this.last) / 1000;
    if (dt > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + dt * this.refillPerSec);
      this.last = t;
    }
  }

  /** 立即嘗試取得一個 token；成功回傳 true */
  tryTake(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.record();
      return true;
    }
    return false;
  }

  /** 需要等待多少毫秒才有下一個 token */
  waitMs(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
  }

  /** 等到有 token 才回傳（最多等 maxWaitMs，超過則丟出錯誤避免請求無限排隊） */
  async take(maxWaitMs = 30_000): Promise<void> {
    const start = this.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.tryTake()) return;
      const w = this.waitMs();
      if (this.now() - start + w > maxWaitMs) throw new Error(`rate limiter: wait ${w}ms exceeds ${maxWaitMs}ms`);
      await new Promise((r) => setTimeout(r, Math.max(5, w)));
    }
  }

  private record(): void {
    const t = this.now();
    this.calls.push(t);
    const cutoff = t - 3600_000;
    while (this.calls.length && this.calls[0] < cutoff) this.calls.shift();
  }

  /** 最近一小時的請求數 */
  usedLastHour(): number {
    const cutoff = this.now() - 3600_000;
    while (this.calls.length && this.calls[0] < cutoff) this.calls.shift();
    return this.calls.length;
  }
}

/** 各 Adapter 的預設速率（依各家免費方案公開說明保守設定） */
export const DEFAULT_LIMITS: Record<string, RateLimiterOptions> = {
  // FinMind：未帶 token 每小時 300 次，帶 token 600 次
  finmind: { capacity: 5, refillPerSec: 0.5, hourlyQuota: 300 },
  // TWSE：官方建議 5 秒內不超過 3 次
  twse: { capacity: 3, refillPerSec: 0.6 },
  tpex: { capacity: 3, refillPerSec: 1 },
  // Yahoo 非官方，保守
  yahoo: { capacity: 4, refillPerSec: 1 },
  // Alpha Vantage 免費：每分鐘 5 次、每日 25 次
  alphavantage: { capacity: 1, refillPerSec: 5 / 60, hourlyQuota: 25 },
  // Polygon 免費：每分鐘 5 次
  polygon: { capacity: 2, refillPerSec: 5 / 60 },
  // Finnhub 免費：每分鐘 60 次
  finnhub: { capacity: 10, refillPerSec: 1 },
};

const registry = new Map<string, TokenBucket>();

export function getLimiter(id: string, opts?: RateLimiterOptions): TokenBucket {
  let b = registry.get(id);
  if (!b) {
    b = new TokenBucket(opts ?? DEFAULT_LIMITS[id] ?? { capacity: 5, refillPerSec: 1 });
    registry.set(id, b);
  }
  return b;
}

/** 測試用：重設所有限制器 */
export function resetLimiters(): void {
  registry.clear();
}
