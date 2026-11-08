'use client';
import { useEffect, useMemo, useState } from 'react';
import type { AccuracyResponse } from './types';
import { fmtTime } from './format';
import Scorecard from './Scorecard';
import TrendChart from './TrendChart';
import DirectionPanel from './DirectionPanel';
import ReplayPanel from './ReplayPanel';
import SnapshotList from './SnapshotList';
import MonthlyReport from './MonthlyReport';
import AiHistory from './AiHistory';

export interface AccuracyFilters {
  symbol: string;
  model: string;
  horizon: string;
  period: string;
  from: string;
  to: string;
  up: string;
  down: string;
}

const SECTIONS = [
  ['scorecard', '準度計分卡'],
  ['trend', '準度趨勢'],
  ['direction', '混淆矩陣與校準'],
  ['replay', '預測回放'],
  ['snapshots', '快照列表'],
  ['report', '月度報告'],
  ['ai', 'AI 建議歷史'],
] as const;

function Section({ id, title, children, extra, source }: { id: string; title: string; children: React.ReactNode; extra?: React.ReactNode; source?: React.ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-20">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className="h2">{title}</h2>
        {source && <span className="text-xs muted">{source}</span>}
        <span className="flex-1" />
        {extra}
      </div>
      {children}
    </section>
  );
}

export default function AccuracyClient({ initial, modelOptions, symbolOptions, names }: { initial: AccuracyFilters; modelOptions: string[]; symbolOptions: string[]; names: Record<string, string> }) {
  const [f, setF] = useState<AccuracyFilters>(initial);
  const [symDraft, setSymDraft] = useState(initial.symbol);
  const [data, setData] = useState<AccuracyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (f.symbol) q.set('symbol', f.symbol);
    if (f.model) q.set('model', f.model);
    if (f.horizon) q.set('horizon', f.horizon);
    q.set('period', f.period);
    if (f.period === 'custom') {
      if (f.from) q.set('from', f.from);
      if (f.to) q.set('to', f.to);
    }
    if (f.up && f.up !== '0.65') q.set('up', f.up);
    if (f.down && f.down !== '0.35') q.set('down', f.down);
    return q.toString();
  }, [f]);

  useEffect(() => {
    try {
      window.history.replaceState(null, '', `/accuracy?${qs}${window.location.hash}`);
    } catch {
      /* 忽略 */
    }
    if (f.period === 'custom' && (!f.from || !f.to)) {
      setError('自訂區間請選擇起日與迄日');
      return;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/accuracy?${qs}`)
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? '讀取失敗');
          return j as AccuracyResponse;
        })
        .then((j) => {
          if (!alive) return;
          setData(j);
          setError(null);
        })
        .catch((e) => alive && setError(e.message))
        .finally(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [qs, f.period, f.from, f.to]);

  const set = (k: keyof AccuracyFilters, v: string) => setF((s) => ({ ...s, [k]: v }));
  const applySymbol = () => {
    const v = symDraft.trim().toUpperCase();
    if (v !== f.symbol) set('symbol', v);
  };
  const th = data?.query.thresholds ?? { up: Number(f.up) || 0.65, down: Number(f.down) || 0.35 };
  const replaySymbol = f.symbol || data?.counts.symbols[0] || symbolOptions[0] || null;
  const src = data ? `資料：預測快照 ${data.counts.snapshots} 筆（${data.counts.withOutcomes} 筆已回填）· 期間 ${data.range.from} ～ ${data.range.to.slice(0, 10)} · 計算於 ${fmtTime(data.generatedAt)}` : null;

  return (
    <div className="space-y-4">
      {/* 篩選列 */}
      <div className="panel z-20 flex lg:sticky lg:top-[52px] flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col text-xs">
          <span className="muted">代號</span>
          <input
            className="input w-32"
            list="acc-symbols"
            placeholder="全部"
            value={symDraft}
            onChange={(e) => setSymDraft(e.target.value)}
            onBlur={applySymbol}
            onKeyDown={(e) => e.key === 'Enter' && applySymbol()}
          />
          <datalist id="acc-symbols">
            {symbolOptions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">模型</span>
          <select className="input" value={f.model} onChange={(e) => set('model', e.target.value)}>
            <option value="">全部模型</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {names[m] ?? m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">期數</span>
          <select className="input" value={f.horizon} onChange={(e) => set('horizon', e.target.value)}>
            <option value="">1 / 5 / 10 / 20 日</option>
            {['1', '5', '10', '20'].map((h) => (
              <option key={h} value={h}>
                {h} 日
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="muted">期間</span>
          <select className="input" value={f.period} onChange={(e) => set('period', e.target.value)}>
            <option value="1m">近 1 個月</option>
            <option value="3m">近 3 個月</option>
            <option value="6m">近 6 個月</option>
            <option value="12m">近 12 個月</option>
            <option value="custom">自訂區間</option>
          </select>
        </label>
        {f.period === 'custom' && (
          <>
            <label className="flex flex-col text-xs">
              <span className="muted">起日</span>
              <input type="date" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} />
            </label>
            <label className="flex flex-col text-xs">
              <span className="muted">迄日</span>
              <input type="date" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} />
            </label>
          </>
        )}
        <label className="flex flex-col text-xs" title="P(上漲) ≥ 此值才算「看漲」出手">
          <span className="muted">看漲門檻</span>
          <input type="number" className="input w-20" min={0.5} max={1} step={0.01} value={f.up} onChange={(e) => set('up', e.target.value)} />
        </label>
        <label className="flex flex-col text-xs" title="P(上漲) ≤ 此值才算「看跌」出手">
          <span className="muted">看跌門檻</span>
          <input type="number" className="input w-20" min={0} max={0.5} step={0.01} value={f.down} onChange={(e) => set('down', e.target.value)} />
        </label>
        <span className="flex-1" />
        {loading && <span className="text-xs muted">計算中…</span>}
        <nav className="flex w-full flex-wrap gap-2 text-xs">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="chip hover:underline">
              {label}
            </a>
          ))}
        </nav>
      </div>

      {error && <div className="panel border-red-400 text-sm text-red-500">⚠ {error}</div>}
      {data?.storeKind === 'memory' && <p className="text-xs muted">儲存：記憶體模式（未設定資料庫）。正式環境請設定 DATABASE_URL，快照才能長期累積。</p>}

      <Section
        id="scorecard"
        title="準度計分卡"
        source={src}
        extra={
          <div className="flex gap-2">
            <a className="btn text-xs" href={`/api/accuracy?${qs}&format=csv`}>
              匯出 CSV
            </a>
            <a className="btn text-xs" href={`/api/accuracy?${qs}`} target="_blank" rel="noreferrer">
              JSON
            </a>
          </div>
        }
      >
        {!data && loading ? <p className="muted py-6 text-center text-sm">載入中…</p> : data && <Scorecard rows={data.scorecard} names={names} thresholds={th} />}
        <p className="mt-2 text-xs muted">
          疑似資料洩漏（樣本 ≥ 20 且方向準確率 &gt; 70% 或 Theil&apos;s U &lt; 0.5）的列在洩漏稽核通過前以「疑似資料洩漏，稽核中」取代。股價方向接近隨機漫步，合理的長期方向準確率多在 50%–60%。
        </p>
      </Section>

      <Section id="trend" title="準度趨勢圖" source={src}>
        {data ? <TrendChart trend={data.trend} names={names} horizon={data.query.horizon} /> : <p className="muted py-6 text-center text-sm">載入中…</p>}
      </Section>

      <Section id="direction" title="方向評估：混淆矩陣與機率校準" source={data ? `模型：${data.direction.model ? (names[data.direction.model] ?? data.direction.model) : '—'}（未選模型時預設集成）· 第 ${data.direction.horizon} 期 · ${src}` : null}>
        {data ? <DirectionPanel direction={data.direction} names={names} thresholds={th} /> : <p className="muted py-6 text-center text-sm">載入中…</p>}
      </Section>

      <Section id="replay" title={`預測回放${replaySymbol ? ` · ${replaySymbol}` : ''}`} source="價格：日線資料源；預測：當時寫入的快照">
        <ReplayPanel symbol={replaySymbol} model={f.model || null} names={names} />
      </Section>

      <Section id="snapshots" title="快照列表" source="資料：預測快照表（append-only，唯讀）與回填結果表">
        <SnapshotList symbol={f.symbol || null} model={f.model || null} names={names} />
      </Section>

      <Section id="report" title="月度準度報告">
        <MonthlyReport symbol={f.symbol || null} names={names} />
      </Section>

      <Section id="ai" title="AI 建議歷史" source="AI 分析，非投資建議 · 資料：modelId = ai 的快照">
        <AiHistory symbol={f.symbol || null} names={names} />
      </Section>
    </div>
  );
}
