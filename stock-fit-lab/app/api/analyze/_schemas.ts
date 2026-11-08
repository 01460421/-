/** 共用 zod 輸入驗證（分析設定） */
import { z } from 'zod';
import { ALL_MODEL_IDS } from '@/lib/models';

export const modelId = z.enum(ALL_MODEL_IDS as [string, ...string[]]);

export const ConfigSchema = z
  .object({
    window: z.number().int().min(10).max(5000),
    lambda: z.number().min(0.5).max(1),
    horizon: z.number().int().min(1).max(60),
    level: z.number().min(0.5).max(0.999),
    models: z.array(modelId).min(1).max(ALL_MODEL_IDS.length),
    params: z.record(modelId, z.record(z.string(), z.number().finite())),
    priceMode: z.enum(['raw', 'log']),
    layers: z.object({ rollingRefit: z.boolean(), rls: z.boolean(), kalman: z.boolean(), ensembleReweight: z.boolean() }).partial(),
    eta: z.number().min(1e-4).max(1),
    errorWindow: z.number().int().min(2).max(250),
    customBenchmark: z
      .object({ targetPrice: z.number().positive(), steps: z.number().int().positive().optional(), mode: z.enum(['linear', 'flat']).optional(), label: z.string().max(40).optional() })
      .nullable(),
    seed: z.number().int(),
  })
  .partial();

