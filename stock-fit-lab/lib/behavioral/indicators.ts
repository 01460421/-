/**
 * 心理與社會面指標（純函式）。輸入必須是 asOf 當時已知的資料（呼叫端負責截斷），
 * 每個指標附公式、繁中說明、學術出處與「相關不等於因果」警語。
 * 這些指標描述的是「市場參與者可能的心理狀態」與歷史上觀察到的統計關聯，不是因果、也不是預測保證。
 */
import type { Bar } from '../types';

export const CAVEAT = '相關不等於因果：學術文獻記錄的是平均而言的統計關聯，個股、個別期間可能完全不成立；僅供解讀模型的背景參考。';

export interface IndicatorMeta {
  id: string;
  name: string;
  formula: string;
  explanation: string;
  reference: string;
}

export interface IndicatorReading extends IndicatorMeta {
  available: boolean;
  value: number | null;
  unit?: string;
  /** 依門檻給的白話解讀（描述狀態，不給方向建議） */
  reading: string;
  details?: Record<string, number | string | null>;
  asOf: string | null;
  sources: { name: string; asOf?: string | null; url?: string }[];
  caveat: string;
  reason?: string;
}

const px = (b: Bar) => (b.adjClose != null && b.adjClose > 0 ? b.adjClose : b.close);
const r4 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function sd(a: number[]): number {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1));
}

/** x 在樣本 arr 中的百分位（0–100，含等於） */
export function percentileRank(arr: number[], x: number): number {
  if (!arr.length) return NaN;
  const below = arr.filter((v) => v < x).length;
  const equal = arr.filter((v) => v === x).length;
  return ((below + 0.5 * equal) / arr.length) * 100;
}

export const META = {
  high52: {
    id: 'high52',
    name: '52 週高點接近度（錨定效應）',
    formula: 'H52 = P_t / max(P_{t−251..t})（還原收盤價）',
    explanation: '投資人常以 52 週高點為「錨」，股價接近高點時對利多反應不足、遠離高點時則可能過度悲觀。數值越接近 1 代表越接近一年高點。',
    reference: 'George, T. J. & Hwang, C.-Y. (2004). The 52-Week High and Momentum Investing. Journal of Finance, 59(5), 2145–2176.',
  },
  attention: {
    id: 'attention',
    name: '異常成交量 / 注意力',
    formula: 'AV = V_t / mean(V_{t−252..t−1})；AV5 = mean(V_{t−4..t}) / mean(V_{t−252..t−5})',
    explanation: '成交量遠高於常態代表注意力集中。散戶傾向買進「吸引注意」的股票（新聞、異常量、極端報酬），淨買入壓力可能使短期價格偏離。',
    reference: 'Barber, B. M. & Odean, T. (2008). All That Glitters: The Effect of Attention and News on the Buying Behavior of Individual and Institutional Investors. Review of Financial Studies, 21(2), 785–818.',
  },
  overreaction: {
    id: 'overreaction',
    name: '短期過度反應 / 反轉 z 分數',
    formula: 'z = (R5_t − mean(R5)) / sd(R5)，R5 = 5 日累積對數報酬，基準為過去 252 日的滾動 R5',
    explanation: '極端的短期漲跌（|z| 大）可能反映對消息的過度反應，文獻記錄過「輸家反彈、贏家回落」的反轉傾向；但也可能是新資訊的合理定價。',
    reference: 'De Bondt, W. F. M. & Thaler, R. (1985). Does the Stock Market Overreact? Journal of Finance, 40(3), 793–805.',
  },
  momentum: {
    id: 'momentum',
    name: '動能 12-1',
    formula: 'MOM = P_{t−21} / P_{t−252} − 1（跳過最近一個月）',
    explanation: '過去 12 個月（排除最近 1 個月）的報酬。文獻發現贏家傾向延續、輸家傾向延續一段時間（動能），常被解釋為投資人對資訊反應不足。',
    reference: 'Jegadeesh, N. & Titman, S. (1993). Returns to Buying Winners and Selling Losers: Implications for Stock Market Efficiency. Journal of Finance, 48(1), 65–91.',
  },
  retailLeverage: {
    id: 'retail_leverage',
    name: '散戶槓桿情緒：融資 vs 法人背離（台股）',
    formula: 'ΔM20 = 融資餘額_t / 融資餘額_{t−20} − 1；融資使用率 = 融資餘額 / 融資限額；F20 = Σ 三大法人買賣超（近 20 日）；背離 = sign(ΔM20) ≠ sign(F20)',
    explanation: '融資多為散戶使用。融資增加而法人賣超，常被市場解讀為「散戶接手、籌碼較亂」；融資使用率偏高代表槓桿擁擠，遇跌可能出現斷頭賣壓。',
    reference: 'Barber, B. M., Lee, Y.-T., Liu, Y.-J. & Odean, T. (2009). Just How Much Do Individual Investors Lose by Trading? Review of Financial Studies, 22(2), 609–632（台灣市場散戶交易行為）。',
  },
  fear: {
    id: 'fear',
    name: '市場恐慌指標（VIX / 台指選擇權 P/C）',
    formula: 'VIX 分位 = rank(VIX_t | 過去 252 日)；P/C ratio = 賣權成交（或未平倉）/ 買權成交（或未平倉）',
    explanation: 'VIX 為 S&P 500 選擇權隱含的 30 日波動預期，被稱為恐慌指數；分位越高代表市場越緊張。台指選擇權 Put/Call ratio 偏高代表避險需求升高（解讀因成交 / 未平倉口徑而異）。',
    reference: 'Whaley, R. E. (2000). The Investor Fear Gauge. Journal of Portfolio Management, 26(3), 12–17.',
  },
  media: {
    id: 'media',
    name: '新聞注意力與媒體悲觀度',
    formula: '注意力 = 近 7 日權威來源標題數；悲觀度 = 負向詞 / (正向詞 + 負向詞)；語氣 = mean((pos − neg)/(pos + neg))',
    explanation: '媒體報導量反映注意力；標題語氣偏負面時，文獻發現短期價格承壓、隨後部分反轉。本系統只用標題詞典法（粗略啟發式），不讀內文。',
    reference: 'Tetlock, P. C. (2007). Giving Content to Investor Sentiment: The Role of Media in the Stock Market. Journal of Finance, 62(3), 1139–1168.',
  },
  marketSentiment: {
    id: 'market_sentiment',
    name: '市場整體情緒代理（簡化 Baker–Wurgler）',
    formula: 'S = 平均( pct(指數 52 週高點接近度), pct(指數成交量比), 1 − pct(VIX) ) × 2 − 1，pct 為過去 756 日的百分位 / 100；可用成分不足 2 項時不計算',
    explanation: 'Baker–Wurgler 以多個情緒代理變數的第一主成分衡量市場情緒。此處只用免費可得的成分（指數相對高點、成交熱度、恐慌指數反向）取百分位平均，−1 偏悲觀、+1 偏樂觀，是高度簡化的版本。',
    reference: 'Baker, M. & Wurgler, J. (2006). Investor Sentiment and the Cross-Section of Stock Returns. Journal of Finance, 61(4), 1645–1680.',
  },
  calendar: {
    id: 'calendar',
    name: '社會 / 行事曆情境',
    formula: '距最近休市日（交易日數）、距財報公布期限 / 財報季、季底作帳窗口、近 7 日總經 / 地緣政治新聞標籤',
    explanation: '長假前後、財報季、季底（法人作帳）與重大總經事件常伴隨成交量與波動的變化（例如假期效應、財報公告前的不確定性）。這裡只列出情境，不推論方向。',
    reference: 'Ariel, R. A. (1990). High Stock Returns before Holidays: Existence and Evidence on Possible Causes. Journal of Finance, 45(5), 1611–1626；Frazzini, A. & Lamont, O. (2007). The Earnings Announcement Premium and Trading Volume. NBER WP 13090.',
  },
} satisfies Record<string, IndicatorMeta>;

function base(meta: IndicatorMeta, asOf: string | null, sources: IndicatorReading['sources']): Omit<IndicatorReading, 'available' | 'value' | 'reading'> {
  return { ...meta, asOf, sources, caveat: CAVEAT };
}

export function unavailable(meta: IndicatorMeta, reason: string, asOf: string | null = null, sources: IndicatorReading['sources'] = []): IndicatorReading {
  return { ...base(meta, asOf, sources), available: false, value: null, reading: `無法計算：${reason}`, reason };
}

// ───────────── 個別指標（純函式） ─────────────

export function high52(bars: Bar[], sources: IndicatorReading['sources'] = []): IndicatorReading {
  if (bars.length < 60) return unavailable(META.high52, '資料少於 60 個交易日', bars.at(-1)?.date ?? null, sources);
  const w = bars.slice(-252);
  const hi = Math.max(...w.map(px));
  const last = px(bars[bars.length - 1]);
  const v = last / hi;
  const reading = v >= 0.97 ? '接近 52 週高點（錨定效應下市場常對利多反應保守）' : v >= 0.85 ? '距 52 週高點不遠' : v >= 0.7 ? '明顯低於 52 週高點' : '遠低於 52 週高點（距高點 30% 以上）';
  return { ...base(META.high52, bars[bars.length - 1].date, sources), available: true, value: r4(v), unit: '倍', reading, details: { high52: r4(hi), lastAdjClose: r4(last), windowBars: w.length } };
}

export function abnormalVolume(bars: Bar[], sources: IndicatorReading['sources'] = []): IndicatorReading {
  if (bars.length < 61) return unavailable(META.attention, '資料少於 61 個交易日', bars.at(-1)?.date ?? null, sources);
  const n = bars.length;
  const hist = bars.slice(Math.max(0, n - 253), n - 1).map((b) => b.volume || 0);
  const avg = mean(hist);
  if (!(avg > 0)) return unavailable(META.attention, '無成交量資料', bars[n - 1].date, sources);
  const av = (bars[n - 1].volume || 0) / avg;
  const hist5 = bars.slice(Math.max(0, n - 257), n - 5).map((b) => b.volume || 0);
  const av5 = mean(bars.slice(-5).map((b) => b.volume || 0)) / mean(hist5);
  const reading = av >= 2.5 ? '成交量為常態的 2.5 倍以上：注意力高度集中' : av >= 1.5 ? '成交量明顯高於常態' : av <= 0.6 ? '成交量明顯低於常態：關注度低' : '成交量接近常態';
  return { ...base(META.attention, bars[n - 1].date, sources), available: true, value: r4(av), unit: '倍', reading, details: { av5: r4(av5), avgVolume252: r4(avg), lastVolume: bars[n - 1].volume } };
}

export function overreactionZ(bars: Bar[], sources: IndicatorReading['sources'] = [], k = 5): IndicatorReading {
  if (bars.length < 120) return unavailable(META.overreaction, '資料少於 120 個交易日', bars.at(-1)?.date ?? null, sources);
  const lp = bars.map((b) => Math.log(px(b)));
  const n = lp.length;
  const rk: number[] = [];
  for (let i = Math.max(k, n - 253); i < n - 1; i++) rk.push(lp[i] - lp[i - k]);
  const cur = lp[n - 1] - lp[n - 1 - k];
  const s = sd(rk);
  const z = s > 0 ? (cur - mean(rk)) / s : 0;
  const reading = z >= 2 ? `近 ${k} 日漲幅極端（z ≥ 2）：可能存在過度反應` : z <= -2 ? `近 ${k} 日跌幅極端（z ≤ −2）：可能存在過度反應` : Math.abs(z) >= 1 ? `近 ${k} 日漲跌幅偏離常態` : `近 ${k} 日漲跌幅在常態範圍`;
  return { ...base(META.overreaction, bars[n - 1].date, sources), available: true, value: r4(z), unit: 'z', reading, details: { returnPct: r4((Math.exp(cur) - 1) * 100), window: k, sampleSize: rk.length } };
}

export function momentum12_1(bars: Bar[], sources: IndicatorReading['sources'] = []): IndicatorReading {
  if (bars.length < 253) return unavailable(META.momentum, '資料少於 253 個交易日', bars.at(-1)?.date ?? null, sources);
  const n = bars.length;
  const v = px(bars[n - 1 - 21]) / px(bars[n - 1 - 252]) - 1;
  const reading = v >= 0.3 ? '過去一年（扣最近一月）大幅上漲：屬動能贏家' : v <= -0.2 ? '過去一年（扣最近一月）明顯下跌：屬動能輸家' : '過去一年（扣最近一月）漲跌溫和';
  return { ...base(META.momentum, bars[n - 1].date, sources), available: true, value: r4(v * 100), unit: '%', reading, details: { from: bars[n - 1 - 252].date, to: bars[n - 1 - 21].date } };
}

export interface MarginRow {
  date: string;
  balance: number | null;
  limit: number | null;
}
export interface InstRow {
  date: string;
  total: number | null;
  foreign: number | null;
}

export function retailLeverage(margin: MarginRow[], inst: InstRow[], sources: IndicatorReading['sources'] = []): IndicatorReading {
  const m = margin.filter((r) => typeof r.balance === 'number').sort((a, b) => a.date.localeCompare(b.date));
  if (m.length < 21) return unavailable(META.retailLeverage, '融資資料少於 21 個交易日', m.at(-1)?.date ?? null, sources);
  const last = m[m.length - 1];
  const prev = m[m.length - 21];
  const dM = prev.balance ? last.balance! / prev.balance - 1 : null;
  const usage = last.limit && last.limit > 0 ? (last.balance! / last.limit) * 100 : null;
  const i = inst.filter((r) => typeof r.total === 'number' && r.date <= last.date).sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
  const f20 = i.length ? i.reduce((s, r) => s + (r.total ?? 0), 0) : null;
  const foreign20 = i.length ? i.reduce((s, r) => s + (r.foreign ?? 0), 0) : null;
  const divergence = dM !== null && f20 !== null && f20 !== 0 && Math.sign(dM) !== Math.sign(f20) && Math.abs(dM) > 0.01;
  let reading = '';
  if (divergence && dM! > 0) reading = '融資增加、法人賣超（背離）：散戶槓桿接手的型態';
  else if (divergence && dM! < 0) reading = '融資減少、法人買超（背離）：籌碼由散戶轉向法人的型態';
  else if (dM !== null && dM > 0.1) reading = '融資餘額近 20 日大增：散戶槓桿升溫';
  else if (dM !== null && dM < -0.1) reading = '融資餘額近 20 日大減：散戶去槓桿';
  else reading = '融資與法人方向一致或變化不大';
  if (usage !== null && usage >= 40) reading += `；融資使用率 ${Math.round(usage)}% 偏高`;
  return {
    ...base(META.retailLeverage, last.date, sources),
    available: true,
    value: r4(dM === null ? null : dM * 100),
    unit: '%（融資 20 日變化）',
    reading,
    details: { marginBalance: last.balance, marginUsagePct: r4(usage), institutional20d: f20, foreign20d: foreign20, divergence: divergence ? 1 : 0 },
  };
}

export function vixGauge(vixBars: Bar[], sources: IndicatorReading['sources'] = []): IndicatorReading {
  if (vixBars.length < 60) return unavailable(META.fear, 'VIX 資料不足', vixBars.at(-1)?.date ?? null, sources);
  const closes = vixBars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const w = closes.slice(-252);
  const pct = percentileRank(w, last);
  const pctAll = percentileRank(closes, last);
  const reading = last >= 30 ? 'VIX ≥ 30：市場處於高度恐慌' : last >= 20 ? 'VIX 20–30：市場偏緊張' : last < 13 ? 'VIX < 13：市場相當平靜（可能自滿）' : 'VIX 13–20：常態水準';
  return { ...base(META.fear, vixBars[vixBars.length - 1].date, sources), available: true, value: r4(last), unit: '點', reading, details: { percentile1y: r4(pct), percentileAll: r4(pctAll), sampleFrom: vixBars[0].date } };
}

/** 選擇權 P/C ratio：從資料表中偵測欄位（put_call_ratio / PCR / pc_ratio…） */
export function putCallFromRows(rows: Record<string, unknown>[]): { date: string; pcr: number; column: string } | null {
  const keys = rows.length ? Object.keys(rows[rows.length - 1]) : [];
  const col = keys.find((k) => /put.?call|^pcr$|pc_?ratio|PutCallRatio|賣買權/i.test(k));
  if (!col) return null;
  const sorted = [...rows].filter((r) => typeof r[col] === 'number' && Number.isFinite(r[col] as number)).sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  return { date: String(last.date ?? ''), pcr: last[col] as number, column: col };
}

export function mediaReading(p: { count: number; meanScore: number | null; pessimism: number | null; from: string; to: string }, sources: IndicatorReading['sources'] = []): IndicatorReading {
  const reading =
    p.count === 0
      ? '近 7 日沒有權威來源標題（注意力低或資料源未涵蓋）'
      : `${p.count} 則標題${p.meanScore === null ? '' : p.meanScore <= -0.2 ? '，語氣偏負面' : p.meanScore >= 0.2 ? '，語氣偏正面' : '，語氣中性'}（詞典法粗略估計）`;
  return { ...base(META.media, p.to, sources), available: true, value: p.count, unit: '則', reading, details: { meanScore: r4(p.meanScore), pessimism: r4(p.pessimism), from: p.from, to: p.to } };
}

/** 簡化 Baker–Wurgler：成分百分位平均 → [−1, 1] */
export function marketSentimentProxy(p: { indexBars: Bar[]; vixBars?: Bar[] | null }, sources: IndicatorReading['sources'] = []): IndicatorReading {
  const comps: Record<string, number | null> = { indexHigh52Pct: null, indexVolumePct: null, vixInversePct: null };
  const ib = p.indexBars;
  const lookback = 756;
  if (ib.length >= 300) {
    const series: number[] = [];
    for (let i = 251; i < ib.length; i++) {
      let hi = -Infinity;
      for (let k = i - 251; k <= i; k++) hi = Math.max(hi, px(ib[k]));
      series.push(px(ib[i]) / hi);
    }
    const recent = series.slice(-lookback);
    comps.indexHigh52Pct = percentileRank(recent, recent[recent.length - 1]) / 100;
    const vols = ib.map((b) => b.volume || 0);
    if (vols.slice(-60).some((v) => v > 0)) {
      const ratios: number[] = [];
      for (let i = 60; i < vols.length; i++) {
        const avg = mean(vols.slice(i - 60, i));
        if (avg > 0) ratios.push(mean(vols.slice(Math.max(0, i - 4), i + 1)) / avg);
      }
      const rr = ratios.slice(-lookback);
      if (rr.length > 100) comps.indexVolumePct = percentileRank(rr, rr[rr.length - 1]) / 100;
    }
  }
  if (p.vixBars && p.vixBars.length > 100) {
    const c = p.vixBars.map((b) => b.close).slice(-lookback);
    comps.vixInversePct = 1 - percentileRank(c, c[c.length - 1]) / 100;
  }
  const vals = Object.values(comps).filter((v): v is number => v !== null && Number.isFinite(v));
  const asOf = ib.at(-1)?.date ?? null;
  if (vals.length < 2) return unavailable(META.marketSentiment, '可用成分不足 2 項（需要指數長期行情或 VIX）', asOf, sources);
  const s = mean(vals) * 2 - 1;
  const reading = s >= 0.5 ? '市場整體情緒偏樂觀（多項成分處於歷史高分位）' : s <= -0.5 ? '市場整體情緒偏悲觀（多項成分處於歷史低分位）' : '市場整體情緒中性';
  return { ...base(META.marketSentiment, asOf, sources), available: true, value: r4(s), unit: '−1 ~ 1', reading, details: Object.fromEntries(Object.entries(comps).map(([k, v]) => [k, r4(v)])) };
}
