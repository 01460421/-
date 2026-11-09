import { describe, it, expect } from 'vitest';
import { HoltWintersModel } from '@/lib/models/holtwinters';
import { normalGenerator } from '@/lib/math/random';

describe('HoltWintersModel', () => {
  const z = normalGenerator(10);
  const season = [1.5, -0.5, 0.8, -1.2, -0.6];
  const y = Array.from({ length: 300 }, (_, i) => 100 + 0.08 * i + 2 * season[i % 5] + 0.3 * z());

  it('趨勢 + 季節序列：一步 SSE 明顯低於 naive', () => {
    const m = new HoltWintersModel().fit(y);
    const d = m.describe().diagnostics;
    expect(d.seasonal).toBe(true);
    expect(d.sseRatioVsNaive as number).toBeLessThan(0.3);
    const p = m.describe().params;
    for (const k of ['alpha', 'beta', 'gamma']) {
      expect(p[k] as number).toBeGreaterThan(0);
      expect(p[k] as number).toBeLessThan(1);
    }
  });

  it('預測延續季節型態與趨勢，區間隨期數變寬', () => {
    const m = new HoltWintersModel().fit(y);
    const f = m.predict(10);
    for (let k = 1; k <= 10; k++) {
      const i = 299 + k;
      const truth = 100 + 0.08 * i + 2 * season[i % 5];
      expect(Math.abs(f.mean[k - 1] - truth)).toBeLessThan(1.2);
    }
    expect(f.upper[9] - f.lower[9]).toBeGreaterThan(f.upper[0] - f.lower[0]);
  });

  it('資料不足兩季時退化為 Holt 並標示；update 為單步遞迴', () => {
    const short = y.slice(0, 8);
    const m = new HoltWintersModel().fit(short, { params: { season: 5 } });
    expect(m.describe().diagnostics.seasonal).toBe(false);
    expect(typeof m.describe().diagnostics.degraded).toBe('string');
    const full = new HoltWintersModel().fit(y.slice(0, 290));
    const before = full.describe().params.alpha;
    for (let i = 290; i < 300; i++) full.update(y[i]);
    expect(full.describe().params.alpha).toBe(before);
    expect(full.fitted().length).toBe(300);
  });
});
