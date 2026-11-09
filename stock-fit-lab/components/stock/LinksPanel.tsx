'use client';
/**
 * 外部追蹤網站連結面板（規格第二節 1）：模板集中於 config/external-links.json，
 * 使用者自訂模板存在瀏覽器 localStorage（佔位符 {code} {symbol} {exchange} {yahoo} {tv}）。
 */
import { useEffect, useState } from 'react';
import type { ExternalLink, LinkTemplate } from '@/lib/integrations/links';
import { fetchJson, readLocal, writeLocal } from './util';

const KEY = 'sfl-link-templates';

export default function LinksPanel({ symbol }: { symbol: string }) {
  const [templates, setTemplates] = useState<LinkTemplate[]>([]);
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [market, setMarket] = useState<'ALL' | 'TW' | 'US'>('ALL');

  useEffect(() => setTemplates(readLocal<LinkTemplate[]>(KEY, [])), []);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ symbol });
    if (templates.length) q.set('templates', JSON.stringify(templates));
    fetchJson<{ links: ExternalLink[] }>(`/api/links?${q}`)
      .then((d) => alive && (setLinks(d.links), setErr(null)))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [symbol, templates]);

  const save = (t: LinkTemplate[]) => {
    setTemplates(t);
    writeLocal(KEY, t);
  };

  const add = () => {
    if (!label.trim() || !/^https?:\/\//i.test(url.trim())) {
      setErr('請輸入名稱與 http(s) 開頭的網址模板');
      return;
    }
    save([...templates, { id: `u${Date.now()}`, label: label.trim().slice(0, 40), url: url.trim(), market }]);
    setLabel('');
    setUrl('');
    setAdding(false);
  };

  return (
    <section className="panel space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="h2">外部連結</h2>
        <button className="btn text-xs" onClick={() => setAdding((v) => !v)}>
          {adding ? '取消' : '＋ 自訂'}
        </button>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <ul className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <li key={l.id} className="flex items-center">
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="chip hover:underline" title={l.url}>
              {l.label} ↗
            </a>
            {l.custom && (
              <button className="ml-0.5 text-xs muted hover:text-red-500" aria-label={`移除 ${l.label}`} onClick={() => save(templates.filter((t) => (t.id ?? t.label) !== l.id))}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {adding && (
        <div className="space-y-1 text-xs">
          <input className="input w-full" placeholder="名稱，例如 我的券商" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="連結名稱" />
          <input className="input w-full" placeholder="https://example.com/q?s={code}" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="網址模板" />
          <div className="flex items-center gap-2">
            <select className="input" value={market} onChange={(e) => setMarket(e.target.value as 'ALL' | 'TW' | 'US')} aria-label="適用市場">
              <option value="ALL">全部市場</option>
              <option value="TW">台股</option>
              <option value="US">美股</option>
            </select>
            <button className="btn-primary text-xs" onClick={add}>
              儲存
            </button>
          </div>
          <p className="muted">佔位符：{'{code}'} 代號、{'{symbol}'} 完整代號、{'{exchange}'} 交易所、{'{yahoo}'} Yahoo 代號、{'{tv}'} TradingView 代號。只存在本機瀏覽器。</p>
        </div>
      )}
      <p className="text-[11px] muted">外部網站僅以連結呈現，不抓取或複製其內容。</p>
    </section>
  );
}
