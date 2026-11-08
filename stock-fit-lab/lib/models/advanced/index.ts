/**
 * 進階模型註冊表（規格第八節「進階模式」）。
 *
 * Stacking 的預設基礎模型只用 lib/models/poly.ts（其他基礎模型由別的模組並行開發中）；
 * 正式整合時請以 new StackingModel(components) 傳入完整的基礎模型集合。
 */
import type { AdvancedModelId, ForecastModel } from '../../types';
import { PolynomialModel } from '../poly';
import { GarchModel } from './garch';
import { EgarchModel } from './egarch';
import { MsarModel } from './msar';
import { GaussianProcessModel } from './gp';
import { WaveletModel } from './wavelet';
import { EmdModel } from './emd';
import { BstsModel } from './bsts';
import { StackingModel, type StackingComponent } from './stacking';

export { GarchModel, garchFilter, fitGarch, garchVariancePath } from './garch';
export { EgarchModel, egarchFilter, fitEgarch } from './egarch';
export { MsarModel, fitMsar, regimeProbabilities, regimeLabels } from './msar';
export { GaussianProcessModel, compositeKernel, negLogMarginal } from './gp';
export { WaveletModel, dwtForward, dwtInverse, waveletLayers, DB4_H, DB4_G } from './wavelet';
export { EmdModel, emd, emdLayers } from './emd';
export { BstsModel } from './bsts';
export { StackingModel, StackingMeta, type StackingComponent } from './stacking';
export { hurstExponent, hurstDFA, hurstRS, hasLongMemory, fracDiff, fracDiffWeights } from './hurst';
export { naturalCubicSpline } from './spline';
export { fitRemote, pingRemote, type RemoteModel, type RemoteFitResult } from './py-client';

/** 預設 stacking 基礎模型：不同次數的多項式（僅作為可執行的預設，正式使用請傳入完整集合） */
export function defaultStackingComponents(): StackingComponent[] {
  return [1, 2, 3].map((d) => ({ name: `poly${d}`, factory: () => new PolynomialModel(), params: { degree: d } }));
}

export const ADVANCED_FACTORIES: Record<AdvancedModelId, () => ForecastModel> = {
  garch: () => new GarchModel(),
  egarch: () => new EgarchModel(),
  msar: () => new MsarModel(),
  gp: () => new GaussianProcessModel(),
  wavelet: () => new WaveletModel(),
  emd: () => new EmdModel(),
  bsts: () => new BstsModel(),
  stacking: () => new StackingModel(defaultStackingComponents()),
};

export interface AdvancedModelMeta {
  name: string;
  short: string;
  formulaLatex: string;
}

export const ADVANCED_MODEL_META: Record<AdvancedModelId, AdvancedModelMeta> = {
  garch: {
    name: 'GARCH(1,1) 條件異質變異數',
    short: '波動率聚集，條件變異數決定區間寬度',
    formulaLatex: '\\sigma_t^2=\\omega+\\alpha\\varepsilon_{t-1}^2+\\beta\\sigma_{t-1}^2',
  },
  egarch: {
    name: 'EGARCH(1,1) 指數型 GARCH',
    short: '不對稱波動（槓桿效應）',
    formulaLatex: '\\ln\\sigma_t^2=\\omega+\\alpha(|z_{t-1}|-\\sqrt{2/\\pi})+\\gamma z_{t-1}+\\beta\\ln\\sigma_{t-1}^2',
  },
  msar: {
    name: 'Markov 轉換自迴歸（多頭 / 盤整 / 空頭）',
    short: 'regime 機率與各狀態參數',
    formulaLatex: 'r_t=c_{s_t}+\\phi_{s_t}r_{t-1}+\\sigma_{s_t}\\varepsilon_t',
  },
  gp: {
    name: '高斯過程回歸',
    short: 'RBF + 週期 + 線性核，後驗變異數即不確定性',
    formulaLatex: 'f\\sim\\mathcal{GP}(0,k_{RBF}+k_{per}+k_{lin})',
  },
  wavelet: {
    name: '小波多尺度分解（db4）',
    short: '趨勢 / 中週期 / 雜訊三層，雜訊不外推',
    formulaLatex: 'y=A_J+\\sum_{j>q}D_j+\\sum_{j\\le q}D_j',
  },
  emd: {
    name: '經驗模態分解（EMD）',
    short: 'IMF 依週期分組後分層外推',
    formulaLatex: 'x(t)=\\sum_i c_i(t)+r(t)',
  },
  bsts: {
    name: '結構時間序列（BSTS 近似）',
    short: '趨勢 + 季節 + 外生回歸，卡爾曼 + MLE',
    formulaLatex: 'y_t=\\mu_t+\\gamma_t+x_t^\\top\\beta+\\varepsilon_t',
  },
  stacking: {
    name: 'Stacking 集成（ridge）',
    short: '只用走動式樣本外預測訓練的 meta-learner',
    formulaLatex: '\\hat r=b+\\sum_j w_j\\hat r^{(j)}',
  },
};
