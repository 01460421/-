'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 手動觸發單一代號分析並寫入快照（POST /api/analyze { symbol, snapshot: true }） */
export default function AnalyzeTrigger({ symbols }: { symbols: string[] }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(symbols[0] ?? '2330.TW');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: symbol.trim(), snapshot: true }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMsg({ ok: true, text: `已完成 ${symbol} 分析並寫入快照。` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: `分析失敗：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input className="input w-32" list="dash-syms" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="代號" />
      <datalist id="dash-syms">
        {symbols.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button className="btn-primary" onClick={run} disabled={busy || !symbol.trim()}>
        {busy ? '分析中…' : '立即分析並寫入快照'}
      </button>
      {msg && <span className={msg.ok ? 'text-blue-600' : 'text-red-500'}>{msg.text}</span>}
    </div>
  );
}
