/**
 * 方向層（規格八「漲跌勢判斷為第一優先」）：
 *  - head.ts：每個模型的 logistic 方向分類頭（方向損失為主、幅度權重為輔）
 *  - gating.ts：信心門檻 / 觀望機制與出手準確率、混淆矩陣、連續判對錯
 *  - consensus.ts：日 / 週 / 月多時間尺度共識
 *  - filters.ts：ADX、Hurst、regime 趨勢濾網
 *  - calibration.ts：Brier、可靠度圖、Platt / 等滲校準
 */
export * from './head';
export * from './gating';
export * from './consensus';
export * from './filters';
export * from './calibration';
