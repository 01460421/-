'use client';
/**
 * 自選股側欄（規格第二節 2、第六節 7）：台股 / 美股分群，每檔附最近一次預測方向與近 20 日準度徵章；
 * 支援 Yahoo Finance / TradingView 匯出清單匯入（檔案或貼上）、移除、加入目前代號。
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { WatchlistItem } from '@/lib/types';
import { SIGNAL_COLOR, SIGNAL_TEXT, fetchJson, fmtPct } from './util';

interface Enriched extends WatchlistItem {
  latest: { pUp: number | null; signal: 'up' | 'down' | 'neutral'; issuedAt: string; trainEnd: string; horizon: number } | null;
  accuracy20: { directionAccuracy: number | null; n: number };
}
interface Resp {
  tw: Enriched[];
  us: Enriched[];
  note: string;
}

export default function WatchlistPanel({ symbol, name }: { symbol: string; name?: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchJson<Resp>('/api/watchlist')
      .then((d) => (setData(d), setErr(null)))
      .catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const post = async (body: unknown) => {
    setBusy(true);
    try {
      const r = await fetchJson<{ added: string[]; unrecognized?: string[]; format?: string; duplicates?: number }>('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setMsg(`已加入 ${r.added.length} 檔${r.format ? `（格式：${r.format}）` : ''}${r.unrecognized?.length ? `；無法辨識：${r.unrecognized.slice(0, 8).join('、')}` : ''}`);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: string) => {
    try {
      await fetchJson(`/api/watchlist?symbol=${encodeURIComponent(s)}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200_000) return setErr('檔案過大（上限 200KB）');
    await post({ csv: await f.text() });
  };

  const inList = data && [...data.tw, ...data.us].some((x) => x.symbol === symbol);

  const group = (title: string, items: Enriched[]) => (
    <div>
      <h3 className="mb-1 text-xs font-medium muted">
        {title}（{items.length}）
      </h3>
      {items.length === 0 ? (
        <p className="text-xs muted">尚無</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.symbol} className={`flex items-center gap-1.5 text-sm ${it.symbol === symbol ? 'font-semibold' : ''}`}>
              <Link href={`/stock/${encodeURIComponent(it.symbol)}`} className="min-w-0 flex-1 truncate hover:underline" title={it.name}>
                {it.symbol} <span className="text-xs muted">{it.name}</span>
              </Link>
              {it.latest ? (
                <span className="chip" style={{ color: SIGNAL_COLOR[it.latest.signal], borderColor: SIGNAL_COLOR[it.latest.signal] }} title={`P(上漲) ${fmtPct(it.latest.pUp)}，h=${it.latest.horizon}，發出 ${it.latest.issuedAt}`}>
                  {SIGNAL_TEXT[it.latest.signal]}
                </span>
              ) : (
                <span className="chip muted" title="尚無快照">—</span>
              )}
              <span className="chip" title={`近 20 日 1 日期方向準確率（n=${it.accuracy20.n}）`}>
                {it.accuracy20.n ? fmtPct(it.accuracy20.directionAccuracy, 0) : '無紀錄'}
              </span>
              <button className="text-xs muted hover:text-red-500" onClick={() => remove(it.symbol)} aria-label={`移除 ${it.symbol}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="panel space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <h2 className="h2 mr-auto">自選股</h2>
        {!inList && (
          <button className="btn text-xs" disabled={busy} onClick={() => post({ symbol, name })}>
            ＋ 加入 {symbol}
          </button>
        )}
        <label className="btn cursor-pointer text-xs">
          匯入檔案
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button className="btn text-xs" onClick={() => setPaste((v) => !v)}>
          貼上
        </button>
      </div>
      {paste && (
        <div className="space-y-1">
          <textarea className="input h-20 w-full text-xs" placeholder={'貼上 Yahoo Finance CSV 或 TradingView 清單，例如：\nTWSE:2330,NASDAQ:AAPL,2454.TW'} value={text} onChange={(e) => setText(e.target.value)} aria-label="貼上自選清單" />
          <button className="btn-primary text-xs" disabled={!text.trim() || busy} onClick={() => post({ csv: text }).then(() => (setText(''), setPaste(false)))}>
            匯入
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-emerald-600">{msg}</p>}
      {err && <p className="text-xs text-red-500">{err}</p>}
      {!data && !err && <div className="h-16 animate-pulse rounded bg-gray-500/10" />}
      {data && (
        <>
          {group('台股', data.tw)}
          {group('美股', data.us)}
          <p className="text-[11px] muted">{data.note} 自選清單屬個人資料，只存於你的匿名帳號下。</p>
        </>
      )}
    </section>
  );
}
