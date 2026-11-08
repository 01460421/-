'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AiHistoryItem } from './types';
import { BETTER_COLOR, DOWN_COLOR, UP_COLOR, WORSE_COLOR, fmtNum, fmtPctRaw, fmtSigned, fmtTime, isNum } from './format';

/** AI 建議歷史：AI 當時說了什麼 vs 之後實際發生什麼 */
export default function AiHistory({ symbol, names }: { symbol: string | null; names: Record<string, string> }) {
  const [items, setItems] = useState<AiHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    fetch(`/api/accuracy/ai${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? '讀取失敗');
        return j.items as AiHistoryItem[];
      })
      .then((j) => alive && setItems(j))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [symbol]);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!items) return <p className="muted text-sm">載入中…</p>;
  if (!items.length) return <p className="muted py-4 text-center text-sm">尚無 AI 建議紀錄。於個股分析頁呼叫「AI 分析助理」後，每則建議都會寫入快照，可在此回顧。</p>;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((it) => {
        const nm = (id: string | null | undefined) => (id ? (names[id] ?? id) : '—');
        const beat = it.credible && isNum(it.credible.mape) && isNum(it.credible.naiveMape) ? it.credible.mape < it.credible.naiveMape : null;
        return (
          <div key={it.id} className="rounded-md border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <b>{it.symbol}</b>
              <span className="text-xs muted">
                {fmtTime(it.createdAt)} · 訓練迄 {it.trainEnd} · 當時價 {fmtNum(it.lastPrice)}
              </span>
              <span className="chip">{it.label}</span>
              <Link href={`/snapshot/${it.id}`} className="ml-auto text-xs underline">
                快照詳情
              </Link>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium muted">AI 當時說</div>
                <p>
                  最可信模型：<b>{nm(it.credibleModel)}</b>
                  {it.credibleReason && <span className="muted">（{it.credibleReason}）</span>}
                </p>
                {it.summary && <p className="mt-1">{it.summary}</p>}
                {it.warnings.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: WORSE_COLOR }}>
                    {it.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-xs font-medium muted">之後實際</div>
                {it.pending ? (
                  <p className="muted">目標日尚未到來，等待排程回填。</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {it.realized.map((r) => (
                        <span key={r.horizon} className="chip" style={{ color: isNum(r.changePct) ? (r.changePct > 0 ? UP_COLOR : r.changePct < 0 ? DOWN_COLOR : undefined) : undefined }} title={`${r.targetDate} 收盤 ${fmtNum(r.actual)}`}>
                          t+{r.horizon}：{fmtSigned(r.changePct, 2, '%')}
                        </span>
                      ))}
                    </div>
                    {it.credible ? (
                      <p className="mt-1">
                        {nm(it.credibleModel)} 事後 MAPE {fmtPctRaw(it.credible.mape)} vs naive {fmtPctRaw(it.credible.naiveMape)}
                        {beat !== null && <b style={{ color: beat ? BETTER_COLOR : WORSE_COLOR }}>（{beat ? '優於' : '未優於'} naive）</b>}
                        {it.credible.rank ? (
                          <span className="muted">
                            ；當日 {it.credible.of} 個模型中排第 {it.credible.rank}
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="mt-1 muted">找不到同一訓練迄日的「{nm(it.credibleModel)}」快照可對照。</p>
                    )}
                    {it.bestModel && (
                      <p className="text-xs muted">
                        事後 MAPE 最低：{nm(it.bestModel.modelId)}（{fmtPctRaw(it.bestModel.mape)}）
                      </p>
                    )}
                    {it.ensemble && it.ensemble.dirN > 0 && (
                      <p className="text-xs muted">
                        同日集成方向判對 {it.ensemble.dirHits}/{it.ensemble.dirN} 期
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
