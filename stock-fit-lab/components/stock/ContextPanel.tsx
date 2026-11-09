'use client';
/**
 * 情境脈絡面板：長期歷史 / 新聞與公告 / 財報與方針 / 心理與社會指標（規格第七、十、十一節）。
 *  - 每一筆資料標示來源、資料時間；新聞只顯示標題與連結（外開），不含內文
 *  - 「時點回放」asOf：所有分頁只顯示該日之前已公開的資料（point-in-time）
 *  - 心理指標附公式提示、學術出處與「相關不等於因果」
 * 使用：<ContextPanel symbol={symbol} selection={selection} onAskAi={(q) => …} />
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import EChart from '@/components/EChart';
import type { HistorySummary, OhlcBar } from '@/lib/history/summary';
import type { NewsItem, AuthorityTier, SourceStatus } from '@/lib/news/types';
import type { NewsSearchResult } from '@/lib/news';
import type { FundamentalsResult } from '@/lib/fundamentals';
import type { GuidanceResult } from '@/lib/fundamentals/guidance';
import type { BehavioralResult } from '@/lib/behavioral';
import { fetchJson, fmtNum, fmtTime, UP_COLOR, DOWN_COLOR } from './util';

type TabId = 'history' | 'news' | 'fundamentals' | 'behavioral';
const TABS: { id: TabId; label: string }[] = [
  { id: 'history', label: '長期歷史' },
  { id: 'news', label: '新聞與公告' },
  { id: 'fundamentals', label: '財報與方針' },
  { id: 'behavioral', label: '心理與社會指標' },
];

export const TIER_STYLE: Record<AuthorityTier, { label: string; cls: string }> = {
  official: { label: '官方', cls: 'bg-emerald-600 text-white' },
  wire: { label: '通訊社', cls: 'bg-blue-600 text-white' },
  major: { label: '財經媒體', cls: 'bg-indigo-500 text-white' },
  trade: { label: '產業媒體', cls: 'bg-slate-500 text-white' },
  other: { label: '其他', cls: 'bg-gray-400 text-white' },
};

interface HistoryResp {
  summary: HistorySummary & { stale?: boolean };
  range: { from: string; to: string; granularity: string; points: OhlcBar[]; truncated: boolean; stats: { returnPct: number | null } };
  source: string;
  asOf: string;
}
interface FundResp {
  fundamentals: FundamentalsResult;
  guidance: GuidanceResult | { error: string } | null;
}

function daysAgo(n: number, from?: string): string {
  const d = from ? new Date(from + 'T00:00:00Z') : new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const signColor = (v: number | null | undefined) => (v === null || v === undefined ? undefined : v > 0 ? UP_COLOR : v < 0 ? DOWN_COLOR : undefined);
const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);

function SentimentChip({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return null;
  const label = score >= 0.2 ? '偏正' : score <= -0.2 ? '偏負' : '中性';
  const cls = score >= 0.2 ? 'border-red-400 text-red-600' : score <= -0.2 ? 'border-green-500 text-green-700' : 'muted';
  return (
    <span className={`chip ${cls}`} title={`標題情緒 ${score}（詞典法粗略啟發式，只看標題，可能誤判）`}>
      {label} {score.toFixed(2)}
    </span>
  );
}

export function TierBadge({ tier }: { tier: AuthorityTier }) {
  const t = TIER_STYLE[tier] ?? TIER_STYLE.other;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${t.cls}`}>{t.label}</span>;
}

function SourceList({ sources }: { sources: SourceStatus[] }) {
  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer muted">資料源狀態（{sources.filter((s) => s.ok).length}/{sources.length} 可用）</summary>
      <ul className="ml-4 list-disc">
        {sources.map((s) => (
          <li key={s.name} className={s.ok ? '' : 'text-amber-600'}>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                {s.name}
              </a>
            ) : (
              s.name
            )}
            ：{s.ok ? `${s.count} 筆` : `失敗（${s.error ?? '未知原因'}）`}
            {s.note ? ` · ${s.note}` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Loading() {
  return <div className="h-40 animate-pulse rounded bg-gray-500/10" aria-label="載入中" />;
}

function ErrorBox({ msg }: { msg: string }) {
  return <p className="rounded border border-amber-400/60 bg-amber-500/10 p-2 text-xs">{msg}</p>;
}

export interface ContextPanelProps {
  symbol: string;
  /** 主圖框選區間：新聞 / 歷史分頁預設使用 */
  selection?: { from: string; to: string } | null;
  /** 預設時點（YYYY-MM-DD）；空白為今天 */
  asOf?: string;
  /** 「問 AI」：把問題送到 AI 面板（可選） */
  onAskAi?: (question: string) => void;
  /** 精簡模式（嵌入側欄）：較小的表格與列數 */
  compact?: boolean;
  initialTab?: TabId;
}

export default function ContextPanel({ symbol, selection, asOf: asOfProp, onAskAi, compact = false, initialTab = 'history' }: ContextPanelProps) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [asOf, setAsOf] = useState<string>(asOfProp ?? '');
  const [from, setFrom] = useState<string>(selection?.from ?? '');
  const [to, setTo] = useState<string>(selection?.to ?? '');
  const [minTier, setMinTier] = useState<AuthorityTier>('trade');
  const [query, setQuery] = useState('');
  const [officialOnly, setOfficialOnly] = useState(false);
  const [data, setData] = useState<Partial<Record<TabId, unknown>>>({});
  const [err, setErr] = useState<Partial<Record<TabId, string>>>({});
  const [loading, setLoading] = useState<TabId | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (selection) {
      setFrom(selection.from);
      setTo(selection.to);
    }
  }, [selection]);
  useEffect(() => setAsOf(asOfProp ?? ''), [asOfProp]);
  useEffect(() => {
    setData({});
    setErr({});
  }, [symbol]);

  const url = useMemo(() => {
    const end = to || asOf || '';
    const qs = (o: Record<string, string | undefined>) =>
      Object.entries(o)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
        .join('&');
    switch (tab) {
      case 'history':
        return `/api/context/history?${qs({ symbol, from: from || undefined, to: end || undefined })}`;
      case 'news': {
        const t = end || new Date().toISOString().slice(0, 10);
        return `/api/context/news?${qs({ symbol, from: from || daysAgo(14, t), to: t, asOf: asOf || undefined, minTier, query: query || undefined, officialOnly: officialOnly ? '1' : undefined })}`;
      }
      case 'fundamentals':
        return `/api/context/fundamentals?${qs({ symbol, asOf: asOf || undefined, guidance: '1' })}`;
      case 'behavioral':
        return `/api/context/behavioral?${qs({ symbol, asOf: asOf || undefined })}`;
    }
  }, [tab, symbol, from, to, asOf, minTier, query, officialOnly]);

  const load = useCallback(async () => {
    setLoading(tab);
    setErr((e) => ({ ...e, [tab]: undefined }));
    try {
      const d = await fetchJson<unknown>(url);
      setData((x) => ({ ...x, [tab]: d }));
    } catch (e) {
      setErr((x) => ({ ...x, [tab]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLoading(null);
    }
  }, [tab, url]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, nonce]);

  const ask = onAskAi;

  return (
    <section className="panel space-y-2" aria-label="情境脈絡：長期歷史、新聞、財報、心理社會指標">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="h2 mr-auto">情境脈絡</h2>
        <label className="flex items-center gap-1 text-xs" title="只顯示該日之前已公開的資料（point-in-time 回放）">
          時點
          <input type="date" className="input py-0.5 text-xs" value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-label="時點回放日期" />
        </label>
        {asOf && (
          <button className="btn text-xs" onClick={() => setAsOf('')}>
            回到今天
          </button>
        )}
        <button className="btn text-xs" onClick={() => setNonce((n) => n + 1)} disabled={!!loading}>
          重新整理
        </button>
      </div>
      {asOf && <p className="rounded bg-blue-500/10 p-1.5 text-[11px]">時點回放：只顯示 {asOf}（含）之前已公開的資料；台股季報以法定公告期限判斷是否已公開。</p>}
      <div className="flex flex-wrap gap-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`btn text-xs ${tab === t.id ? 'ring-2 ring-blue-500/50' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {(tab === 'history' || tab === 'news') && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="muted">區間</span>
          <input type="date" className="input py-0.5 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="起日" />
          <span>~</span>
          <input type="date" className="input py-0.5 text-xs" value={to} onChange={(e) => setTo(e.target.value)} aria-label="迄日" />
          {(from || to) && (
            <button
              className="btn text-xs"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              清除
            </button>
          )}
          {tab === 'news' && (
            <>
              <select className="input py-0.5 text-xs" value={minTier} onChange={(e) => setMinTier(e.target.value as AuthorityTier)} aria-label="最低權威等級">
                <option value="official">只要官方</option>
                <option value="wire">通訊社以上</option>
                <option value="major">主要財經媒體以上</option>
                <option value="trade">產業媒體以上</option>
                <option value="other">全部</option>
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={officialOnly} onChange={(e) => setOfficialOnly(e.target.checked)} />
                只看官方公告
              </label>
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery((e.currentTarget.elements.namedItem('q') as HTMLInputElement).value.trim());
                }}
              >
                <input name="q" className="input w-28 py-0.5 text-xs" placeholder="標題關鍵字" defaultValue={query} aria-label="標題關鍵字" />
                <button className="btn text-xs" type="submit">
                  搜尋
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {loading === tab && !data[tab] && <Loading />}
      {err[tab] && <ErrorBox msg={err[tab]!} />}
      {!!data[tab] && (
        <div className={loading === tab ? 'opacity-60' : ''}>
          {tab === 'history' && <HistoryTab d={data.history as HistoryResp} compact={compact} ask={ask} />}
          {tab === 'news' && <NewsTab d={data.news as NewsSearchResult} compact={compact} ask={ask} />}
          {tab === 'fundamentals' && <FundamentalsTab d={data.fundamentals as FundResp} compact={compact} />}
          {tab === 'behavioral' && <BehavioralTab d={data.behavioral as BehavioralResult} />}
        </div>
      )}
      <p className="text-[11px] muted">資料只用於教學與研究；新聞僅取標題與連結（不複製全文），點擊會在新分頁開啟原始來源。指標與新聞與股價的關係屬統計關聯，相關不等於因果，非投資建議。</p>
    </section>
  );
}

// ───────────────────────── 長期歷史 ─────────────────────────

function HistoryTab({ d, compact, ask }: { d: HistoryResp; compact: boolean; ask?: (q: string) => void }) {
  const s = d.summary;
  const option = useMemo(() => {
    const pts = d.range.points;
    return {
      grid: { left: 50, right: 12, top: 16, bottom: 28 },
      tooltip: { trigger: 'axis' as const },
      xAxis: { type: 'category' as const, data: pts.map((p) => p.date) },
      yAxis: { type: 'log' as const, scale: true },
      series: [{ type: 'line' as const, name: '還原收盤', data: pts.map((p) => p.adjClose), showSymbol: false, lineStyle: { width: 1.5 } }],
    };
  }, [d.range.points]);
  const maxAbs = Math.max(1, ...s.yearly.map((y) => Math.abs(y.returnPct ?? 0)));
  return (
    <div className="space-y-2 text-xs">
      <div className="muted">
        來源 {s.source}
        {s.stale ? '（快取）' : ''} · {s.from} ~ {s.to}（{s.years} 年、{s.bars} 筆日線）· 資料時間 {s.asOf} · {s.adjusted ? '還原價' : '未還原'}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="年化報酬 CAGR" value={pct(s.cagrPct)} color={signColor(s.cagrPct)} />
        <Stat label="年化波動" value={pct(s.annVolPct)} />
        <Stat label="最大回撤" value={pct(s.maxDrawdown.maxDrawdownPct)} sub={`${s.maxDrawdown.peakDate ?? ''} → ${s.maxDrawdown.troughDate ?? ''}`} color={DOWN_COLOR} />
        <Stat label="距還原高點" value={pct(s.extremes.fromAdjustedHighPct)} sub={s.extremes.allTimeHigh ? `歷史高 ${fmtNum(s.extremes.allTimeHigh.price)}（${s.extremes.allTimeHigh.date}）` : ''} />
      </div>
      <div>
        <div className="mb-1 font-medium">
          {d.range.from} ~ {d.range.to}（{d.range.granularity}）區間報酬 <span style={{ color: signColor(d.range.stats.returnPct) }}>{pct(d.range.stats.returnPct)}</span>
          {d.range.truncated && <span className="muted">（僅顯示最近 {d.range.points.length} 點）</span>}
        </div>
        <EChart option={option} height={compact ? 160 : 220} />
      </div>
      <details open={!compact}>
        <summary className="cursor-pointer font-medium">逐年報酬 / 波動 / 最大回撤（{s.yearly.length} 年）</summary>
        <div className="max-h-64 overflow-y-auto">
          <table className="table-std text-xs">
            <thead>
              <tr>
                <th>年度</th>
                <th>報酬</th>
                <th className="w-1/3" />
                <th>年化波動</th>
                <th>最大回撤</th>
              </tr>
            </thead>
            <tbody>
              {[...s.yearly].reverse().map((y) => (
                <tr key={y.year}>
                  <td>
                    {y.year}
                    {y.partial ? <span className="muted">*</span> : ''}
                  </td>
                  <td style={{ color: signColor(y.returnPct) }}>{pct(y.returnPct)}</td>
                  <td>
                    <div className="h-2 rounded" style={{ width: `${(Math.abs(y.returnPct ?? 0) / maxAbs) * 100}%`, background: signColor(y.returnPct) ?? '#9ca3af' }} />
                  </td>
                  <td>{pct(y.volPct)}</td>
                  <td style={{ color: DOWN_COLOR }}>{pct(y.maxDrawdownPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">* 不完整年度</p>
        </div>
      </details>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <div className="mb-1 font-medium">單日最大漲跌（還原價）</div>
          <ul className="space-y-0.5">
            {s.topMoves.slice(0, compact ? 6 : 10).map((m) => (
              <li key={m.date} className="flex items-center gap-2">
                <span className="tabular-nums">{m.date}</span>
                <span className="tabular-nums" style={{ color: signColor(m.returnPct) }}>
                  {pct(m.returnPct, 2)}
                </span>
                {m.volumeRatio !== null && <span className="muted">量比 {m.volumeRatio}</span>}
                {ask && (
                  <button className="ml-auto text-[11px] underline" onClick={() => ask(`請用 explain_move 解釋 ${m.date} 的價格變動（只用當時已公開的資料），並區分相關與因果。`)}>
                    問 AI
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 font-medium">回撤事件與收復時間</div>
          <ul className="space-y-0.5">
            {s.drawdowns.map((e) => (
              <li key={e.peakDate}>
                <span style={{ color: DOWN_COLOR }}>{pct(e.depthPct)}</span> {e.peakDate} → {e.troughDate}（{e.barsToTrough} 交易日）· {e.recoveryDate ? `收復 ${e.recoveryDate}（高點起 ${e.daysPeakToRecovery} 天）` : '尚未收復'}
              </li>
            ))}
            {!s.drawdowns.length && <li className="muted">沒有超過 15% 的回撤</li>}
          </ul>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer font-medium">結構區段（PELT）與波動 regime（HMM）</summary>
        <p className="muted">{s.regimes.method}</p>
        <ul className="ml-4 list-disc">
          {s.regimes.segments.map((r) => (
            <li key={r.from}>
              {r.from} ~ {r.to}（{r.weeks} 週）<b>{r.label}</b> · 年化報酬 {pct(r.annReturnPct)} · 年化波動 {pct(r.annVolPct)}
            </li>
          ))}
        </ul>
        {s.regimes.hmm && (
          <p>
            HMM：低波動 {pct(s.regimes.hmm.lowVolAnnPct)} / 高波動 {pct(s.regimes.hmm.highVolAnnPct)}，高波動期間佔 {pct((s.regimes.hmm.highVolShare ?? 0) * 100)}；最新一週高波動機率 {s.regimes.hmm.pHighVolLatest ?? '—'}（描述歷史，非預測）
          </p>
        )}
      </details>
      {s.notes.map((n) => (
        <p key={n} className="muted">
          {n}
        </p>
      ))}
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded border p-1.5" style={{ borderColor: 'var(--border)' }}>
      <div className="muted text-[11px]">{label}</div>
      <div className="text-sm font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
      {sub && <div className="muted text-[10px]">{sub}</div>}
    </div>
  );
}

// ───────────────────────── 新聞與公告 ─────────────────────────

function NewsTab({ d, compact, ask }: { d: NewsSearchResult; compact: boolean; ask?: (q: string) => void }) {
  const byDate = useMemo(() => {
    const m = new Map<string, NewsItem[]>();
    for (const it of d.items) {
      const k = it.publishedAt.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return [...m.entries()];
  }, [d.items]);
  const daily = new Map(d.daily.map((x) => [x.date, x]));
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2 muted">
        <span>
          {d.from} ~ {d.to} · 截止 {d.asOf.length > 10 ? fmtTime(d.asOf) : d.asOf} · 共 {d.total} 則{d.truncated ? `（顯示 ${d.items.length}）` : ''}
        </span>
        {ask && (
          <button className="btn ml-auto text-[11px]" onClick={() => ask(`請用 search_news 整理 ${d.from} ~ ${d.to} 的權威新聞與官方公告（引用來源與日期），並說明與該段走勢可能的關聯（相關不等於因果）。`)}>
            請 AI 整理這段新聞
          </button>
        )}
      </div>
      {d.notes.map((n) => (
        <p key={n} className="text-[11px] text-amber-700 dark:text-amber-400">
          {n}
        </p>
      ))}
      {!d.items.length && <p className="muted">這段期間沒有符合條件的標題（可放寬權威等級或區間）。</p>}
      <ol className={`relative space-y-2 border-l pl-3 ${compact ? 'max-h-72' : 'max-h-[480px]'} overflow-y-auto`} style={{ borderColor: 'var(--border)' }}>
        {byDate.map(([date, items]) => (
          <li key={date}>
            <div className="mb-0.5 flex items-center gap-2 font-medium">
              <span className="absolute -left-1 mt-1 h-2 w-2 rounded-full bg-blue-500" />
              {date}
              {daily.get(date) && <span className="muted font-normal">（{daily.get(date)!.count} 則，平均語氣 {daily.get(date)!.meanScore}）</span>}
            </div>
            <ul className="space-y-1">
              {items.map((it) => (
                <li key={it.id} className="flex flex-wrap items-start gap-1">
                  <TierBadge tier={it.tier} />
                  <span className="muted tabular-nums">{fmtTime(it.publishedAt).slice(-5)}</span>
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 hover:underline">
                      {it.title} <span aria-hidden>↗</span>
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1">{it.title}</span>
                  )}
                  <span className="muted">{it.source}</span>
                  <SentimentChip score={it.sentiment?.score} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="text-[11px] muted">{d.sentimentLabel}</p>
      <SourceList sources={d.sources} />
    </div>
  );
}

// ───────────────────────── 財報與方針 ─────────────────────────

function FundamentalsTab({ d, compact }: { d: FundResp; compact: boolean }) {
  const f = d.fundamentals;
  const g = d.guidance && !('error' in d.guidance) ? d.guidance : null;
  const big = (v: number | null) => (v === null ? '—' : fmtNum(v, 2));
  return (
    <div className="space-y-2 text-xs">
      <div className="muted">
        {f.entityName ? `${f.entityName} · ` : ''}截至 {f.asOf} 已公開 · 幣別 {f.currency} · {f.sources.map((s) => `${s.name}${s.asOf ? `（${s.asOf}）` : ''}`).join('、')}
      </div>
      {f.unavailableReason && <ErrorBox msg={f.unavailableReason} />}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`本益比（TTM，${f.valuation.priceDate ?? '—'} 收盤）`} value={f.valuation.peTtm !== null ? f.valuation.peTtm.toFixed(1) : '—'} sub={f.valuation.peNote ?? (f.ttm ? `EPS TTM ${f.ttm.eps}` : '')} />
        <Stat label="股價淨值比" value={f.valuation.pb !== null ? f.valuation.pb.toFixed(2) : '—'} sub={f.valuation.bookValuePerShare !== null ? `每股淨值 ${f.valuation.bookValuePerShare}` : ''} />
        <Stat label="殖利率（近 12 月）" value={f.valuation.dividendYieldPct !== null ? `${f.valuation.dividendYieldPct}%` : '—'} sub={f.valuation.dividendNote ?? ''} />
        <Stat label="下一期財報" value={f.pendingNext ? f.pendingNext.period : '—'} sub={f.pendingNext ? `${f.pendingNext.knownAt} 才公開` : '無待公開資料'} />
      </div>
      {f.officialValuation && (
        <p>
          官方估值（{f.officialValuation.source}，{f.officialValuation.date}）：本益比 {f.officialValuation.per ?? '—'}、股價淨值比 {f.officialValuation.pbr ?? '—'}、殖利率 {f.officialValuation.dividendYieldPct ?? '—'}%
        </p>
      )}
      {f.quarters.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-std text-xs">
            <thead>
              <tr>
                <th>季度</th>
                <th>公開日</th>
                <th>營收</th>
                <th>YoY</th>
                <th>QoQ</th>
                <th>毛利率</th>
                <th>營益率</th>
                <th>淨利率</th>
                <th>EPS</th>
              </tr>
            </thead>
            <tbody>
              {[...f.quarters].reverse().slice(0, compact ? 4 : 8).map((q) => (
                <tr key={q.periodEnd}>
                  <td title={q.derivedFields.length ? `推導欄位：${q.derivedFields.join(', ')}` : undefined}>
                    {q.label}
                    {q.derivedFields.some((x) => x !== 'shares') ? '†' : ''}
                  </td>
                  <td title={q.basis === 'statutory-deadline' ? '以法定公告期限視為公開日' : '實際申報日'}>
                    {q.knownAt}
                    {q.basis === 'statutory-deadline' ? '§' : ''}
                  </td>
                  <td>{big(q.revenue)}</td>
                  <td style={{ color: signColor(q.revenueYoYPct) }}>{pct(q.revenueYoYPct)}</td>
                  <td style={{ color: signColor(q.revenueQoQPct) }}>{pct(q.revenueQoQPct)}</td>
                  <td>{q.grossMarginPct !== null ? `${q.grossMarginPct}%` : '—'}</td>
                  <td>{q.operatingMarginPct !== null ? `${q.operatingMarginPct}%` : '—'}</td>
                  <td>{q.netMarginPct !== null ? `${q.netMarginPct}%` : '—'}</td>
                  <td>{q.eps ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">† 含由累計值相減推得的欄位　§ 以法定期限視為公開日</p>
        </div>
      )}
      {f.monthlyRevenue.length > 0 && (
        <details open={!compact}>
          <summary className="cursor-pointer font-medium">月營收（最近 {f.monthlyRevenue.length} 個月）</summary>
          <div className="flex flex-wrap gap-1">
            {[...f.monthlyRevenue].reverse().map((m) => (
              <span key={m.month} className="chip" title={`公開日 ${m.knownAt}（${m.basis === 'published' ? '公布日' : '次月 10 日期限'}）`}>
                {m.month} {fmtNum(m.revenueThousand, 0)} 千元 · YoY <span style={{ color: signColor(m.yoyPct) }}>{pct(m.yoyPct)}</span>
              </span>
            ))}
          </div>
        </details>
      )}
      {f.dividends.length > 0 && (
        <p>
          股利：
          {f.dividends
            .slice(-4)
            .reverse()
            .map((x) => `${x.period ?? ''} 現金 ${x.cash ?? 0}${x.stock ? ` / 股票 ${x.stock}` : ''}（除息 ${x.cashExDate ?? '—'}）`)
            .join('；')}
        </p>
      )}
      <p className="muted">{f.lagRule}</p>
      {f.notes.map((n) => (
        <p key={n} className="muted">
          {n}
        </p>
      ))}
      <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
        <div className="mb-1 font-medium">公司方針（官方出處）</div>
        {!d.guidance && <p className="muted">未查詢</p>}
        {d.guidance && 'error' in d.guidance && <ErrorBox msg={d.guidance.error} />}
        {g && (
          <>
            {g.items.length === 0 && <p className="muted">{g.from} ~ {g.to} 沒有找到方針相關的官方公告。</p>}
            <ul className="space-y-1">
              {g.items.map((i) => (
                <li key={`${i.publishedAt}-${i.title}`} className="flex flex-wrap items-start gap-1">
                  <TierBadge tier="official" />
                  <span className="tabular-nums">{i.date}</span>
                  <span className="chip">{i.section}</span>
                  {i.url ? (
                    <a className="min-w-0 flex-1 hover:underline" href={i.url} target="_blank" rel="noopener noreferrer">
                      {i.title} ↗
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1">{i.title}</span>
                  )}
                  {i.exhibits
                    .filter((x) => x.url !== i.url)
                    .slice(0, 3)
                    .map((x) => (
                      <a key={x.url} className="chip hover:underline" href={x.url} target="_blank" rel="noopener noreferrer">
                        {x.label} ↗
                      </a>
                    ))}
                </li>
              ))}
            </ul>
            {g.notes.map((n) => (
              <p key={n} className="muted">
                {n}
              </p>
            ))}
            <SourceList sources={g.sources} />
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── 心理與社會指標 ─────────────────────────

function BehavioralTab({ d }: { d: BehavioralResult }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="muted">時點 {d.asOf} · 計算於 {fmtTime(d.generatedAt)}</div>
      <div className="grid gap-2 md:grid-cols-2">
        {d.indicators.map((x) => (
          <div key={x.id} className={`rounded border p-2 ${x.available ? '' : 'opacity-70'}`} style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start gap-1">
              <b className="mr-auto">{x.name}</b>
              <span className="chip cursor-help" title={`公式：${x.formula}`}>
                ƒ 公式
              </span>
            </div>
            <div className="my-0.5 text-sm font-semibold tabular-nums">
              {x.available ? (
                <>
                  {x.value ?? '—'} <span className="text-[11px] font-normal muted">{x.unit}</span>
                </>
              ) : (
                <span className="text-amber-600 text-xs font-normal">不可用</span>
              )}
            </div>
            <p>{x.reading}</p>
            <details className="mt-1">
              <summary className="cursor-pointer muted">說明、出處與資料來源</summary>
              <p className="mt-1">{x.explanation}</p>
              <p className="mt-1 font-mono text-[10px]">{x.formula}</p>
              {x.details && (
                <p className="mt-1 muted">
                  {Object.entries(x.details)
                    .filter(([, v]) => v !== null && v !== undefined)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </p>
              )}
              <p className="mt-1 italic">{x.reference}</p>
              <p className="mt-1 muted">來源：{x.sources.map((s) => `${s.name}${s.asOf ? `（${s.asOf}）` : ''}`).join('、') || '—'}</p>
            </details>
            <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">相關不等於因果</p>
          </div>
        ))}
      </div>
      {d.macroHeadlines.length > 0 && (
        <div>
          <div className="font-medium">近 7 日總經 / 地緣政治標題</div>
          <ul className="ml-4 list-disc">
            {d.macroHeadlines.map((h) => (
              <li key={h.title}>
                {h.url ? (
                  <a href={h.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {h.title} ↗
                  </a>
                ) : (
                  h.title
                )}{' '}
                <span className="muted">
                  {h.source} · {fmtTime(h.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.notes.map((n) => (
        <p key={n} className="muted">
          {n}
        </p>
      ))}
      <p className="text-[11px] muted">{d.caveat}</p>
    </div>
  );
}
