'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 一鍵匯出 / 刪除個人資料（刪除需二次確認） */
export default function PrivacyActions({ counts }: { counts: { watchlist: number; conversations: number } }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const del = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/privacy/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: typed.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMsg({ ok: true, text: `已刪除自選股 ${j.deleted?.watchlist ?? 0} 筆、AI 對話 ${j.deleted?.conversations ?? 0} 筆。` });
      setConfirming(false);
      setTyped('');
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: `刪除失敗：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a className="btn-primary" href="/api/privacy/export">
          一鍵匯出個人資料（JSON）
        </a>
        <button className="btn" style={{ color: '#dc2626', borderColor: '#dc2626' }} onClick={() => setConfirming(true)} disabled={busy}>
          一鍵刪除個人資料
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-blue-600' : 'text-red-500'}`}>{msg.text}</p>}
      {confirming && (
        <div role="dialog" aria-modal="true" aria-labelledby="del-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setConfirming(false)}>
          <div className="panel w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 id="del-title" className="h2">
              確認刪除個人資料？
            </h2>
            <p className="text-sm">
              將永久刪除您的 <b>自選股 {counts.watchlist} 筆</b> 與 <b>AI 對話紀錄 {counts.conversations} 筆</b>，此動作無法復原。建議先匯出備份。
            </p>
            <p className="text-xs muted">預測快照為不含個人資訊的系統資料，依 append-only 設計不會被刪除。</p>
            <label className="block text-sm">
              請輸入 <code>DELETE</code> 以確認：
              <input className="input mt-1 w-full" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>
                取消
              </button>
              <button className="btn-primary" style={{ background: '#dc2626' }} onClick={del} disabled={busy || typed.trim() !== 'DELETE'}>
                {busy ? '刪除中…' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
