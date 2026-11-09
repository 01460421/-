/**
 * 即時修正引擎公開入口。
 * 注意：leak-audit 使用 node:crypto，只能在伺服器端引用（前端請改引用 leak-audit-label）。
 */
export * from './types';
export * from './ensemble-weights';
export * from './rolling';
export { CorrectionSession, analyze, analyzeAndSnapshot, barPrice } from './correction';
export type { EngineDeps } from './models';
export { buildSnapshots, writeSnapshots, deepFreeze } from './snapshot';
export { backfillOutcomes, outcomesFor } from './backfill';
export * from './walkforward';
export * from './accuracy';
export * from './convergence';
export { LEAK_LABEL } from './leak-audit-label';
