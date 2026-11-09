/**
 * 全部模型的統一入口：基礎模型（第三節）+ 進階模型（第八節，「進階模式」）。
 */
import type { AdvancedModelId, BasicModelId, ForecastModel, ModelId } from '../types';
import { BASIC_FACTORIES, BASIC_MODEL_META, createEnsemble } from './registry';
import { ADVANCED_FACTORIES, ADVANCED_MODEL_META, StackingModel } from './advanced';

export const BASIC_IDS: BasicModelId[] = ['poly', 'exp', 'log', 'logistic', 'fourier', 'linchannel', 'holtwinters', 'arima', 'gbm', 'kalman', 'ensemble'];
export const ADVANCED_IDS: AdvancedModelId[] = ['garch', 'egarch', 'msar', 'gp', 'wavelet', 'emd', 'bsts', 'stacking'];
export const ALL_MODEL_IDS: ModelId[] = [...BASIC_IDS, ...ADVANCED_IDS];

export function isAdvanced(id: string): id is AdvancedModelId {
  return (ADVANCED_IDS as string[]).includes(id);
}

export function createModel(id: ModelId): ForecastModel {
  if (id === 'ensemble') return createEnsemble();
  if (id === 'stacking')
    return new StackingModel(
      (['kalman', 'holtwinters', 'arima', 'linchannel', 'gbm'] as const).map((c) => ({ name: c, factory: BASIC_FACTORIES[c] })),
    );
  if (isAdvanced(id)) return ADVANCED_FACTORIES[id]();
  const f = BASIC_FACTORIES[id as Exclude<BasicModelId, 'ensemble'>];
  if (!f) throw new Error(`未知模型 ${id}`);
  return f();
}

export const MODEL_META: Record<ModelId, { name: string; short: string; formulaLatex: string; advanced: boolean }> = {
  ...(Object.fromEntries(Object.entries(BASIC_MODEL_META).map(([k, v]) => [k, { ...v, advanced: false }])) as Record<BasicModelId, { name: string; short: string; formulaLatex: string; advanced: boolean }>),
  ...(Object.fromEntries(Object.entries(ADVANCED_MODEL_META).map(([k, v]) => [k, { name: v.name, short: v.short, formulaLatex: v.formulaLatex, advanced: true }])) as Record<AdvancedModelId, { name: string; short: string; formulaLatex: string; advanced: boolean }>),
};

export { createEnsemble, BASIC_FACTORIES, ADVANCED_FACTORIES };
