'use client';
import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">頁面發生錯誤</h1>
      <p className="mt-2 text-sm muted">可能是資料源暫時無法連線、資料庫未設定或計算過程出錯。請稍後重試；若持續發生，可到系統健康頁查看資料源與排程狀態。</p>
      {error.digest && <p className="mt-1 text-xs muted">錯誤代碼：{error.digest}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <button className="btn-primary" onClick={() => reset()}>
          重試
        </button>
        <Link className="btn" href="/health">
          系統健康
        </Link>
        <Link className="btn" href="/">
          回到首頁
        </Link>
      </div>
    </div>
  );
}
