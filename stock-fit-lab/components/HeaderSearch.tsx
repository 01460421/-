'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Hit {
  symbol: string;
  market: string;
  name?: string;
}

/** 頂部搜尋列：支援 2330.TW、2330、AAPL、台積電 等格式，台股美股自動分流 */
export default function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/symbols?q=${encodeURIComponent(q.trim())}`);
        if (r.ok) setHits((await r.json()).results ?? []);
      } catch {
        setHits([]);
      }
    }, 250);
  }, [q]);

  const go = (sym: string) => {
    setOpen(false);
    setQ('');
    router.push(`/stock/${encodeURIComponent(sym)}`);
  };

  return (
    <div className="relative min-w-[220px] flex-1 max-w-md">
      <input
        className="input w-full"
        placeholder="輸入代號或公司名：2330、台積電、AAPL"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (hits[0]) go(hits[0].symbol);
            else if (q.trim()) go(q.trim().toUpperCase());
          }
        }}
        aria-label="搜尋股票代號"
      />
      {open && hits.length > 0 && (
        <ul className="panel absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto p-1 shadow-lg">
          {hits.map((h) => (
            <li key={h.symbol}>
              <button className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5" onMouseDown={() => go(h.symbol)}>
                <span className="font-mono">{h.symbol}</span>
                <span className="muted">
                  {h.name ?? ''} <span className="chip ml-1">{h.market === 'US' ? '美股' : h.market === 'TWO' ? '上櫃' : '上市'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
