import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="text-5xl font-semibold muted">404</div>
      <h1 className="mt-2 text-xl font-semibold">找不到這個頁面</h1>
      <p className="mt-2 text-sm muted">網址可能有誤，或這筆快照 / 代號不存在。預測快照建立後不會被刪除，若是從舊連結進入，請確認 ID 是否完整。</p>
      <div className="mt-4 flex justify-center gap-2">
        <Link className="btn-primary" href="/">
          回到首頁
        </Link>
        <Link className="btn" href="/accuracy">
          歷史準度回顧
        </Link>
        <Link className="btn" href="/dashboard">
          追蹤儀表板
        </Link>
      </div>
    </div>
  );
}
