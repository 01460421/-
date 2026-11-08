import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStore } from '@/lib/storage';
import { snapshotDetail } from '@/lib/engine/accuracy';
import { BENCHMARK_META } from '@/lib/benchmarks';
import { modelNames } from '@/app/api/accuracy/_lib';
import { aiHistoryItem, type Advice } from '@/app/api/accuracy/ai/_item';
import SnapshotChart from '@/components/accuracy/SnapshotChart';
import { BETTER_COLOR, DOWN_COLOR, UP_COLOR, WORSE_COLOR, TRIGGER_TEXT, fmtNum, fmtPct, fmtPctRaw, fmtSigned, fmtTime, isNum } from '@/components/accuracy/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '單次預測詳情' };

const safe = (v: number | null | undefined) => (isNum(v) ? v : null);

export default async function SnapshotPage({ params }: { params: { id: string } }) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(params.id)) notFound();
  const store = await getStore();
  const d = await snapshotDetail(store, params.id);
  if (!d) notFound();
  const s = d.snapshot;
  const names = modelNames();
  const isAi = s.modelId === 'ai';
  const ai = isAi ? await aiHistoryItem(store, s) : null;
  const advice = (s.aiPayload ?? {}) as Advice & { generatedAt?: string };
  const outBy = new Map(d.outcomes.map((o) => [o.horizonIndex, o]));
  const benchIds = Object.keys(s.benchmarks).filter((k) => (s.benchmarks as Record<string, number[] | undefined>)[k]?.length);
  const modelMae = d.outcomes.length ? d.outcomes.reduce((a, o) => a + Math.abs(o.error), 0) / d.outcomes.length : NaN;
  const weights = Object.entries(s.ensembleWeights ?? {}).sort((a, b) => b[1] - a[1]);
  const benchNames = Object.fromEntries(Object.entries(BENCHMARK_META).map(([k, v]) => [k, v.name]));

  return (
    <div className="space-y-4">
      <header className="panel">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-xl font-semibold">
            單次預測詳情 · {s.symbol} · {names[s.modelId] ?? s.modelId}
          </h1>
          <span className="chip">{isAi ? s.modelVersion : `v${s.modelVersion}`}</span>
          <span className="chip">觸發：{TRIGGER_TEXT[s.trigger] ?? s.trigger}</span>
          <span className="chip">唯讀快照（append-only，建立後不可修改或刪除）</span>
        </div>
        <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="muted">快照寫入：</span>
            {fmtTime(s.createdAt)}
          </div>
          <div>
            <span className="muted">訓練視窗：</span>
            {s.trainStart} ～ {s.trainEnd}
          </div>
          <div>
            <span className="muted">發出時最後已知價：</span>
            {fmtNum(s.lastPrice)}
          </div>
          <div>
            <span className="muted">信賴水準：</span>
            {Math.round(s.level * 100)}%
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link className="underline" href={`/accuracy?symbol=${encodeURIComponent(s.symbol)}#snapshots`}>
            ← 回到快照列表
          </Link>
          <Link className="underline" href={`/stock/${encodeURIComponent(s.symbol)}`}>
            {s.symbol} 分析頁
          </Link>
          <a className="underline" href={`/api/snapshots/${s.id}`} target="_blank" rel="noreferrer">
            匯出 JSON
          </a>
        </div>
        <p className="mt-1 text-xs muted">ID {s.id} · 資料來源：預測快照表與排程回填結果表（實際值於目標日收盤後回填，與快照分表存放）</p>
      </header>

      {isAi && ai && (
        <section className="panel">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="h2">AI 當時說了什麼 vs 之後實際</h2>
            <span className="chip">{advice.label ?? 'AI 分析，非投資建議'}</span>
            <span className="text-xs muted">
              模型 {advice.model ?? s.modelVersion}
              {advice.generatedAt ? ` · 產生於 ${fmtTime(advice.generatedAt)}` : ''}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <p>
                最可信模型：<b>{advice.most_credible_model?.model_id ? (names[advice.most_credible_model.model_id] ?? advice.most_credible_model.model_id) : '—'}</b>
                {advice.most_credible_model?.reason && <span className="muted">（{advice.most_credible_model.reason}）</span>}
              </p>
              {advice.plain_summary && <p>{advice.plain_summary}</p>}
              {!!advice.reliability_warnings?.length && (
                <div>
                  <div className="text-xs font-medium muted">不可靠警語</div>
                  <ul className="list-disc pl-5" style={{ color: WORSE_COLOR }}>
                    {advice.reliability_warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!!advice.parameter_suggestions?.length && (
                <div>
                  <div className="text-xs font-medium muted">參數建議</div>
                  <ul className="list-disc pl-5">
                    {advice.parameter_suggestions.map((p, i) => (
                      <li key={i}>
                        {names[p.model_id] ?? p.model_id} · {p.parameter}：{p.suggestion} <span className="muted">（{p.reason}）</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!!advice.cited_fields?.length && <p className="text-xs muted">引用資料欄位：{advice.cited_fields.join('、')}</p>}
            </div>
            <div className="space-y-2 text-sm">
              {ai.pending ? (
                <p className="muted">目標日尚未到來，等待排程回填實際值。</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1">
                    {ai.realized.map((r) => (
                      <span key={r.horizon} className="chip" style={{ color: r.changePct > 0 ? UP_COLOR : r.changePct < 0 ? DOWN_COLOR : undefined }}>
                        t+{r.horizon}（{r.targetDate}）：{fmtNum(r.actual)}，{fmtSigned(r.changePct, 2, '%')}
                      </span>
                    ))}
                  </div>
                  {ai.credible ? (
                    <p>
                      AI 認定的模型事後 MAPE {fmtPctRaw(safe(ai.credible.mape))} vs naive {fmtPctRaw(safe(ai.credible.naiveMape))}；當日 {ai.credible.of} 個模型中排第 {ai.credible.rank ?? '—'}。{' '}
                      <Link className="underline" href={`/snapshot/${ai.credible.snapshotId}`}>
                        查看該模型快照
                      </Link>
                    </p>
                  ) : (
                    <p className="muted">找不到同一訓練迄日的對應模型快照。</p>
                  )}
                  {ai.bestModel && (
                    <p className="text-xs muted">
                      事後 MAPE 最低：{names[ai.bestModel.modelId] ?? ai.bestModel.modelId}（{fmtPctRaw(safe(ai.bestModel.mape))}）
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {s.mean.length > 0 && (
        <section className="panel">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <h2 className="h2">當時預測 vs 實際結果</h2>
            <span className="text-xs muted">已回填 {d.outcomes.length}/{s.targetDates.length} 期 · 虛線 = 當時記錄的基準值</span>
          </div>
          <SnapshotChart
            trainEnd={s.trainEnd}
            lastPrice={s.lastPrice}
            targetDates={s.targetDates}
            mean={s.mean.map(safe)}
            lower={s.lower.map(safe)}
            upper={s.upper.map(safe)}
            level={s.level}
            actual={d.outcomes.map((o) => ({ date: o.targetDate, value: o.actual }))}
            benchmarks={Object.fromEntries(benchIds.filter((k) => k !== 'buyhold').map((k) => [k, ((s.benchmarks as Record<string, number[]>)[k] ?? []).map(safe)]))}
            benchmarkNames={benchNames}
            modelName={names[s.modelId] ?? s.modelId}
          />
        </section>
      )}

      {s.mean.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel">
            <h2 className="h2 mb-2">誤差分解</h2>
            {d.decomposition.n ? (
              <table className="table-std">
                <tbody>
                  <tr>
                    <td className="muted">已回填期數 n</td>
                    <td>{d.decomposition.n}</td>
                  </tr>
                  <tr>
                    <td className="muted">平均誤差（偏差，實際 − 預測）</td>
                    <td>{fmtSigned(safe(d.decomposition.bias))}</td>
                  </tr>
                  <tr>
                    <td className="muted">MSE</td>
                    <td>{fmtNum(safe(d.decomposition.mse))}</td>
                  </tr>
                  <tr>
                    <td className="muted">偏差²</td>
                    <td>{fmtNum(safe(d.decomposition.biasSq))}</td>
                  </tr>
                  <tr>
                    <td className="muted">變異</td>
                    <td>{fmtNum(safe(d.decomposition.variance))}</td>
                  </tr>
                  <tr>
                    <td className="muted">偏差占 MSE 比例</td>
                    <td>{fmtPct(safe(d.decomposition.biasShare))}</td>
                  </tr>
                  <tr>
                    <td className="muted">區間覆蓋率</td>
                    <td>{fmtPct(safe(d.coverage))}</td>
                  </tr>
                  <tr>
                    <td className="muted">方向判對</td>
                    <td>
                      {d.directionHits}/{d.directionN}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="muted text-sm">尚未回填任何目標日。</p>
            )}
            <p className="mt-2 text-xs muted">MSE = 偏差² + 變異：偏差占比高代表系統性高估 / 低估，變異占比高代表路徑抖動。</p>
          </section>
          <section className="panel">
            <h2 className="h2 mb-2">基準對照（當時記錄的基準值）</h2>
            <table className="table-std">
              <thead>
                <tr>
                  <th>對象</th>
                  <th>MAE</th>
                  <th>vs 模型</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">{names[s.modelId] ?? s.modelId}</td>
                  <td>{fmtNum(safe(modelMae))}</td>
                  <td>—</td>
                </tr>
                {Object.entries(d.benchmarkErrors).map(([k, v]) => {
                  const better = isNum(modelMae) && isNum(v?.mae) ? modelMae < v!.mae : null;
                  return (
                    <tr key={k}>
                      <td>{benchNames[k] ?? k}</td>
                      <td>{fmtNum(safe(v?.mae))}</td>
                      <td style={{ color: better === null ? undefined : better ? BETTER_COLOR : WORSE_COLOR }}>{better === null ? '—' : better ? '模型較佳' : '基準較佳'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <section className="panel">
            <h2 className="h2 mb-2">當時集成權重</h2>
            {weights.length ? (
              <ul className="space-y-1 text-sm">
                {weights.map(([k, w]) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate">{names[k] ?? k}</span>
                    <span className="h-2 rounded" style={{ width: `${Math.max(1, w * 100) * 1.4}px`, background: w > 0 ? '#2563eb' : '#94a3b8' }} />
                    <span className="tabular-nums">{fmtPct(w)}</span>
                    {w === 0 && <span className="text-xs muted">（暫時歸零）</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-sm">此快照未記錄集成權重。</p>
            )}
          </section>
        </div>
      )}

      {s.mean.length > 0 && (
        <section className="panel">
          <h2 className="h2 mb-2">逐期明細</h2>
          <div className="overflow-x-auto">
            <table className="table-std">
              <thead>
                <tr>
                  <th>期</th>
                  <th>目標日</th>
                  <th>預測</th>
                  <th>區間</th>
                  <th>P(上漲)</th>
                  <th>實際</th>
                  <th>誤差</th>
                  <th>APE</th>
                  <th>落在區間</th>
                  <th>方向</th>
                  {benchIds.map((k) => (
                    <th key={k}>{benchNames[k] ?? k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.targetDates.map((dt, i) => {
                  const o = outBy.get(i);
                  return (
                    <tr key={dt}>
                      <td>t+{i + 1}</td>
                      <td>{dt}</td>
                      <td>{fmtNum(safe(s.mean[i]))}</td>
                      <td className="whitespace-nowrap muted">
                        [{fmtNum(safe(s.lower[i]))}, {fmtNum(safe(s.upper[i]))}]
                      </td>
                      <td style={{ color: isNum(s.pUp?.[i]) ? (s.pUp![i] >= 0.65 ? UP_COLOR : s.pUp![i] <= 0.35 ? DOWN_COLOR : undefined) : undefined }}>{fmtPct(safe(s.pUp?.[i]))}</td>
                      <td>{o ? fmtNum(o.actual) : <span className="muted">待回填</span>}</td>
                      <td>{o ? fmtSigned(o.error) : '—'}</td>
                      <td>{o ? fmtPctRaw(safe(o.absPctError)) : '—'}</td>
                      <td>{o ? (o.inInterval ? '是' : <span style={{ color: WORSE_COLOR }}>否</span>) : '—'}</td>
                      <td>{o ? (o.directionCorrect === null ? '持平' : o.directionCorrect ? <span style={{ color: BETTER_COLOR }}>判對</span> : <span style={{ color: WORSE_COLOR }}>判錯</span>) : '—'}</td>
                      {benchIds.map((k) => (
                        <td key={k}>{fmtNum(safe((s.benchmarks as Record<string, number[]>)[k]?.[i]))}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <details>
          <summary className="cursor-pointer h2">當時參數（含引擎設定）</summary>
          <pre className="mt-2 max-h-[420px] overflow-auto rounded p-2 text-xs" style={{ background: 'var(--bg)' }}>
            {JSON.stringify(s.params, null, 2)}
          </pre>
        </details>
        {isAi && (
          <details className="mt-2">
            <summary className="cursor-pointer h2">AI 原始結構化內容</summary>
            <pre className="mt-2 max-h-[420px] overflow-auto rounded p-2 text-xs" style={{ background: 'var(--bg)' }}>
              {JSON.stringify(s.aiPayload, null, 2)}
            </pre>
          </details>
        )}
      </section>
    </div>
  );
}
