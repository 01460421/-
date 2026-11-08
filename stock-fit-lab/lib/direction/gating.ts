/**
 * 信心門檻與觀望機制（規格八「漲跌勢判斷為第一優先」第 2 點）。
 *
 *   signal = 看漲（up）   若 P(上漲) ≥ upper（預設 0.65）
 *          = 看跌（down） 若 P(上漲) ≤ lower（預設 0.35）
 *          = 觀望（neutral）其他
 *
 * 計分：
 *   出手比例 actRatio = #(up ∪ down) / n
 *   出手時準確率 hitRate = #(up 且實際漲 ∪ down 且實際跌) / #(up ∪ down)
 *   混淆矩陣 3×2：列 = 訊號（看漲 / 看跌 / 觀望），欄 = 實際（漲 / 跌）
 *   連續判對 / 判錯：只看「有出手」的序列（觀望不中斷也不計入連續次數）
 */
import { binomialTestGreater } from '../math/stats';

export type GateSignal = 'up' | 'down' | 'neutral';

export interface GateThresholds {
  upper: number;
  lower: number;
}

export const DEFAULT_GATE: GateThresholds = { upper: 0.65, lower: 0.35 };

export const SIGNAL_LABEL: Record<GateSignal, string> = { up: '看漲', down: '看跌', neutral: '觀望' };

export function gate(pUp: number, th: GateThresholds = DEFAULT_GATE): GateSignal {
  if (!Number.isFinite(pUp)) return 'neutral';
  if (pUp >= th.upper) return 'up';
  if (pUp <= th.lower) return 'down';
  return 'neutral';
}

export interface GateEvaluation {
  n: number;
  acted: number;
  hits: number;
  /** 出手比例 */
  actRatio: number;
  /** 出手時準確率（未出手時為 NaN） */
  hitRate: number;
  /** 出手準確率是否顯著高於 50%（單尾二項檢定 p 值） */
  binomialP: number;
  /** matrix[訊號][實際]：訊號順序 up, down, neutral；實際順序 up, down */
  confusion: { rows: GateSignal[]; cols: ('up' | 'down')[]; matrix: number[][] };
  longestCorrectStreak: number;
  longestWrongStreak: number;
  /** 目前（最後）的連續狀態 */
  currentStreak: { kind: 'correct' | 'wrong' | 'none'; length: number };
  signals: GateSignal[];
}

/**
 * @param pUps     每個時點的 P(上漲)（必須是樣本外預測）
 * @param outcomes 對應的實際結果，true = 上漲
 */
export function evaluateGate(pUps: number[], outcomes: boolean[], th: GateThresholds = DEFAULT_GATE): GateEvaluation {
  if (pUps.length !== outcomes.length) throw new Error('evaluateGate: pUps 與 outcomes 長度不一致');
  const rows: GateSignal[] = ['up', 'down', 'neutral'];
  const matrix = [
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  let acted = 0;
  let hits = 0;
  let bestC = 0;
  let bestW = 0;
  let curKind: 'correct' | 'wrong' | 'none' = 'none';
  let curLen = 0;
  const signals: GateSignal[] = [];
  for (let i = 0; i < pUps.length; i++) {
    const s = gate(pUps[i], th);
    signals.push(s);
    const r = rows.indexOf(s);
    matrix[r][outcomes[i] ? 0 : 1]++;
    if (s === 'neutral') continue;
    acted++;
    const ok = (s === 'up') === outcomes[i];
    if (ok) hits++;
    const kind = ok ? 'correct' : 'wrong';
    if (kind === curKind) curLen++;
    else {
      curKind = kind;
      curLen = 1;
    }
    if (kind === 'correct') bestC = Math.max(bestC, curLen);
    else bestW = Math.max(bestW, curLen);
  }
  const n = pUps.length;
  return {
    n,
    acted,
    hits,
    actRatio: n ? acted / n : 0,
    hitRate: acted ? hits / acted : NaN,
    binomialP: acted ? binomialTestGreater(hits, acted, 0.5) : 1,
    confusion: { rows, cols: ['up', 'down'], matrix },
    longestCorrectStreak: bestC,
    longestWrongStreak: bestW,
    currentStreak: { kind: curKind, length: curLen },
    signals,
  };
}

/** 門檻掃描：讓使用者在「準度 vs 出手頻率」之間取捨（對稱門檻 upper = 1 − lower） */
export function sweepThresholds(
  pUps: number[],
  outcomes: boolean[],
  uppers: number[] = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8],
): { upper: number; lower: number; hitRate: number; actRatio: number; acted: number }[] {
  return uppers.map((u) => {
    const th = { upper: u, lower: 1 - u };
    const e = evaluateGate(pUps, outcomes, th);
    return { upper: u, lower: 1 - u, hitRate: e.hitRate, actRatio: e.actRatio, acted: e.acted };
  });
}
