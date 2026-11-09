'use client';
import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

/** 首次進入時的免責對話框（規格第十一節） */
export default function Disclaimer() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem('sfl-disclaimer-v1')) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="disc-title">
      <div className="panel max-w-lg space-y-3 p-5 shadow-xl">
        <h2 id="disc-title" className="text-lg font-semibold">{t.disclaimerTitle}</h2>
        <p className="text-sm leading-relaxed">{t.disclaimer}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm muted">
          <li>股價方向接近隨機漫步，本系統目標是「可驗證地優於基準、且不確定性校準正確」，而非高命中率。</li>
          <li>所有歷史準度回顧數據皆來自當時寫入、不可修改的預測快照。</li>
          <li>自選股與對話紀錄僅存於您的帳號下，可隨時一鍵匯出或刪除。</li>
        </ul>
        <div className="flex justify-end">
          <button
            className="btn-primary"
            onClick={() => {
              try {
                localStorage.setItem('sfl-disclaimer-v1', new Date().toISOString());
              } catch {}
              setOpen(false);
            }}
          >
            {t.disclaimerAccept}
          </button>
        </div>
      </div>
    </div>
  );
}
