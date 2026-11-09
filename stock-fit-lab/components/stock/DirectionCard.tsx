'use client';
/**
 * 方向卡（規格第八節「漲跌勢判斷」）：集成 P(上漲)、信心門檻閘門（看漲 / 看跌 / 觀望）、
 * 多時間尺度共識與趨勢濾網。一律以機率與不確定性表述。
 */
import type { AnalyzePayload } from './types';
import { SIGNAL_COLOR, SIGNAL_TEXT, fmtNum, gateSignal } from './util';

const SCALE_TEXT: Record<string, string> = { daily: '日', weekly: '週', monthly: '月' };
const DIR_TEXT: Record<string, string> = { up: '偏漲', down: '偏跌', flat: '持平', unavailable: '資料不足', mixed: '不一致' };

export default function DirectionCard({
  payload,
  thresholds,
  onThresholds,
}: {
  payload: AnalyzePayload;
  thresholds: { upper: number; lower: number };
  onThresholds: (t: { upper: number; lower: number }) => void;
}) {
  const d = payload.direction;
  const p = d.pUp;
  const raw = gateSignal(p, thresholds);
  const blocked = raw !== 'neutral' && d.filters.blockedBy.length > 0;
  const consensusBlock = raw !== 'neutral' && !blocked && d.consensus && (!d.consensus.agree || d.consensus.direction !== raw);
  const signal = blocked || consensusBlock ? 'neutral' : raw;
  const pct = p === null ? null : Math.round(p * 1000) / 10;

  return (
    <section className="panel space-y-2" aria-label="方向判斷">
      <div className="flex items-baseline justify-between">
        <h2 className="h2">未來 {d.horizon} 日方向</h2>
        <span className="text-xs muted">集成模型 · 機率輸出</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-3xl font-bold tabular-nums" style={{ color: SIGNAL_COLOR[signal] }}>
          {SIGNAL_TEXT[signal]}
        </div>
        <div className="text-sm">
          P(上漲) = <b className="tabular-nums">{pct === null ? '—' : `${pct}%`}</b>
          <div className="text-xs muted">門檻：≥ {Math.round(thresholds.upper * 100)}% 看漲、≤ {Math.round(thresholds.lower * 100)}% 看跌，其餘觀望</div>
        </div>
      </div>
      {p !== null && (
        <div className="relative h-2 rounded-full bg-gradient-to-r from-emerald-500/60 via-gray-400/40 to-rose-500/60" aria-hidden>
          <div className="absolute top-[-3px] h-3.5 w-1 rounded bg-current" style={{ left: `calc(${p * 100}% - 2px)` }} />
          <div className="absolute top-0 h-2 w-px bg-gray-500" style={{ left: `${thresholds.lower * 100}%` }} />
          <div className="absolute top-0 h-2 w-px bg-gray-500" style={{ left: `${thresholds.upper * 100}%` }} />
        </div>
      )}
      <div className="flex justify-between text-[10px] muted">
        <span>0%（偏跌，綠）</span>
        <span>100%（偏漲，紅）</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label>
          看漲門檻 {Math.round(thresholds.upper * 100)}%
          <input type="range" className="w-full" min={0.5} max={0.95} step={0.01} value={thresholds.upper} onChange={(e) => onThresholds({ ...thresholds, upper: Number(e.target.value) })} aria-label="看漲門檻" />
        </label>
        <label>
          看跌門檻 {Math.round(thresholds.lower * 100)}%
          <input type="range" className="w-full" min={0.05} max={0.5} step={0.01} value={thresholds.lower} onChange={(e) => onThresholds({ ...thresholds, lower: Number(e.target.value) })} aria-label="看跌門檻" />
        </label>
      </div>
      {blocked && <p className="text-xs text-amber-600">門檻已通過（{SIGNAL_TEXT[raw]}），但被趨勢濾網擋下 → 觀望：{d.filters.reasons.join('；')}</p>}
      {consensusBlock && <p className="text-xs text-amber-600">門檻已通過（{SIGNAL_TEXT[raw]}），但多時間尺度共識不支持 → 觀望</p>}

      {d.consensus && (
        <div className="text-xs">
          <div className="font-medium">多時間尺度共識（卡爾曼趨勢估計）</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {d.consensus.scales.map((s) => (
              <span key={s.scale} className="chip" title={`n=${s.n}, h=${s.h}`}>
                {SCALE_TEXT[s.scale]}：{DIR_TEXT[s.direction] ?? s.direction}
                {s.pUp !== null ? `（${fmtNum(s.pUp * 100, 0)}%）` : ''}
              </span>
            ))}
          </div>
          <p className="mt-1 muted">{d.consensus.reason}</p>
        </div>
      )}
      <div className="text-xs">
        <div className="font-medium">趨勢濾網</div>
        <ul className="mt-1 space-y-0.5">
          <li>
            ADX：{fmtNum(d.filters.adx, 1)} {d.filters.blockedBy.includes('adx') ? <span className="text-amber-600">（&lt; 20 趨勢不足）</span> : <span className="muted">（通過）</span>}
          </li>
          <li>
            Hurst：{fmtNum(d.filters.hurst, 3)} {d.filters.blockedBy.includes('hurst') ? <span className="text-amber-600">（≤ 0.55 無長記憶）</span> : <span className="muted">（通過）</span>}
          </li>
          {d.filters.regime && (
            <li>
              Regime：{d.filters.regime.labels.map((l, i) => `${l} ${Math.round(d.filters.regime!.probs[i] * 100)}%`).join(' · ')}
              {d.filters.blockedBy.includes('regime') && <span className="text-amber-600">（盤整機率過高）</span>}
            </li>
          )}
        </ul>
      </div>
      {d.notes.map((n, i) => (
        <p key={i} className="text-xs text-amber-600">
          {n}
        </p>
      ))}
      <p className="text-[11px] leading-snug muted">
        這是由歷史價格數學外推得到的機率估計，並非確定結果。股價短期走勢接近隨機漫步，任何模型都可能判斷錯誤；請參考下方基準對照表與歷史準度回顧檢視實測表現。不構成投資建議。
      </p>
    </section>
  );
}
