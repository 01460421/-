'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * TradingView Advanced Chart 官方嵌入小工具（可收合）。只使用官方 embed script，不抓取任何內容。
 */
export default function TradingViewWidget({ tvSymbol }: { tvSymbol: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !box.current) return;
    box.current.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = '100%';
    box.current.appendChild(inner);
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: 'D',
      timezone: 'Asia/Taipei',
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      style: '1',
      locale: 'zh_TW',
      allow_symbol_change: false,
      studies: ['STD;MACD', 'STD;RSI'],
      support_host: 'https://www.tradingview.com',
    });
    box.current.appendChild(s);
  }, [open, tvSymbol]);

  return (
    <section className="panel">
      <button className="flex w-full items-center justify-between text-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="h2">TradingView 對照圖（官方嵌入小工具）</span>
        <span className="muted">{open ? '收合 ▲' : '展開 ▼'}</span>
      </button>
      {open && (
        <>
          <div ref={box} className="tradingview-widget-container mt-2" style={{ height: 480 }} />
          <p className="mt-1 text-xs muted">圖表由 TradingView 提供，代號 {tvSymbol}；與本站擬合曲線獨立計算。</p>
        </>
      )}
    </section>
  );
}
