/**
 * 基礎模型註冊表：工廠函式、集成建構與前端顯示用中繼資料。
 * 進階模型（lib/models/advanced）由主程式另行接入，本檔不依賴它。
 */
import type { BasicModelId, ForecastModel } from '../types';
import { PolynomialModel } from './poly';
import { ExponentialModel } from './exp';
import { LogarithmicModel } from './log';
import { LogisticModel } from './logistic';
import { FourierModel } from './fourier';
import { LinearChannelModel } from './linchannel';
import { HoltWintersModel } from './holtwinters';
import { ArimaModel } from './arima';
import { GBMModel } from './gbm';
import { KalmanModel } from './kalman';
import { EnsembleModel, type EnsembleComponent } from './ensemble';

export type BasicComponentId = Exclude<BasicModelId, 'ensemble'>;

export const BASIC_FACTORIES: Record<BasicComponentId, () => ForecastModel> = {
  poly: () => new PolynomialModel(),
  exp: () => new ExponentialModel(),
  log: () => new LogarithmicModel(),
  logistic: () => new LogisticModel(),
  fourier: () => new FourierModel(),
  linchannel: () => new LinearChannelModel(),
  holtwinters: () => new HoltWintersModel(),
  arima: () => new ArimaModel(),
  gbm: () => new GBMModel(),
  kalman: () => new KalmanModel(),
};

export const BASIC_COMPONENT_IDS = Object.keys(BASIC_FACTORIES) as BasicComponentId[];

/**
 * 建立集成模型。
 * @param ids 成分模型 id（預設全部基礎模型）；未知 id 會被忽略
 * @param weights 初始權重（未給則等權）
 */
export function createEnsemble(ids?: string[], weights?: Record<string, number>): EnsembleModel {
  const list = (ids ?? BASIC_COMPONENT_IDS).filter((id): id is BasicComponentId => id in BASIC_FACTORIES);
  const components: EnsembleComponent[] = list.map((id) => ({ id, factory: BASIC_FACTORIES[id] }));
  const e = new EnsembleModel(components);
  if (weights) e.setWeights(weights);
  return e;
}

export function createBasicModel(id: BasicModelId): ForecastModel {
  if (id === 'ensemble') return createEnsemble();
  const f = BASIC_FACTORIES[id];
  if (!f) throw new Error(`未知的基礎模型：${id}`);
  return f();
}

export const BASIC_MODEL_META: Record<BasicModelId, { name: string; short: string; formulaLatex: string }> = {
  poly: { name: '多項式最小平方擬合', short: '多項式', formulaLatex: 'P_n(t)=\\sum_{k=0}^{n} a_k t^k' },
  exp: { name: '指數擬合', short: '指數', formulaLatex: 'y=a\\,e^{b\\tau}' },
  log: { name: '對數擬合', short: '對數', formulaLatex: 'y=a+b\\ln s' },
  logistic: { name: 'Logistic 成長曲線', short: 'Logistic', formulaLatex: 'y=\\frac{L}{1+e^{-k(t-t_0)}}' },
  fourier: {
    name: '傅立葉級數擬合',
    short: '傅立葉',
    formulaLatex: 'r(t)=\\sum_{j=1}^{m}\\left(b_j\\cos\\omega_j t + c_j\\sin\\omega_j t\\right)',
  },
  linchannel: { name: '線性回歸通道', short: '回歸通道', formulaLatex: '\\hat y=a+b\\tau\\pm k\\,\\sigma_e' },
  holtwinters: {
    name: 'Holt–Winters 三參數指數平滑',
    short: 'Holt–Winters',
    formulaLatex: '\\hat y_{t+h|t}=\\ell_t+h\\,b_t+s_{t+h-m}',
  },
  arima: {
    name: 'ARIMA 自迴歸整合移動平均',
    short: 'ARIMA',
    formulaLatex: '\\phi(B)(1-B)^d y_t=c+\\theta(B)\\varepsilon_t',
  },
  gbm: { name: '幾何布朗運動蒙地卡羅', short: 'GBM', formulaLatex: 'dS_t=\\mu S_t\\,dt+\\sigma S_t\\,dW_t' },
  kalman: {
    name: '卡爾曼濾波（局部線性趨勢）',
    short: '卡爾曼',
    formulaLatex: 'x_t=Fx_{t-1}+\\eta_t,\\;y_t=Hx_t+\\varepsilon_t',
  },
  ensemble: {
    name: '加權集成模型',
    short: '集成',
    formulaLatex: '\\hat y=\\sum_m w_m \\hat y_m,\\quad w_m=\\frac{\\bar e_m^{-2}}{\\sum_j \\bar e_j^{-2}}',
  },
};
