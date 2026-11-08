import type { Metadata } from 'next';
import { getStore } from '@/lib/storage';
import { getUserId } from '@/lib/user';
import PrivacyActions from '@/components/admin/PrivacyActions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '個人資料' };

export default async function PrivacyPage() {
  const userId = getUserId();
  const store = await getStore();
  let counts = { watchlist: 0, conversations: 0 };
  let err: string | null = null;
  try {
    const d = await store.exportUserData(userId);
    counts = { watchlist: d.watchlist.length, conversations: d.conversations.length };
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  const anon = userId !== process.env.DEFAULT_USER_ID && userId !== 'demo';
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold">個人資料</h1>
        <p className="text-sm muted">您的自選股與 AI 對話紀錄屬於個人資料，預設只存於您的帳號（目前以瀏覽器 Cookie 中的匿名識別碼區分）之下，並可隨時一鍵匯出或刪除。</p>
      </header>

      <section className="panel space-y-2 text-sm">
        <h2 className="h2">目前儲存的個人資料</h2>
        {err ? (
          <p className="text-red-500">讀取失敗：{err}</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            <li>
              自選股：<b>{counts.watchlist}</b> 筆（代號、市場、名稱、加入時間、匯入來源）
            </li>
            <li>
              AI 對話紀錄：<b>{counts.conversations}</b> 則（對話內容與當時引用的資料情境摘要）
            </li>
          </ul>
        )}
        <p className="text-xs muted">
          識別碼：{anon ? `匿名 ID ${userId.slice(0, 8)}…（httpOnly Cookie，一年有效）` : '共用示範帳號（尚未取得個人匿名 ID）'} · 儲存：{store.kind === 'postgres' ? 'PostgreSQL' : '記憶體'}
        </p>
      </section>

      <section className="panel space-y-3">
        <h2 className="h2">匯出與刪除</h2>
        <PrivacyActions counts={counts} />
      </section>

      <section className="panel space-y-2 text-sm">
        <h2 className="h2">哪些不是個人資料</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>預測快照</b>：系統排程與分析時寫入的模型預測（代號、模型、參數、區間、基準值），不含任何個人資訊；為確保歷史準度回顧沒有前視偏誤，快照採 append-only 設計，建立後不可修改或刪除。
          </li>
          <li>
            <b>回填結果與事件日誌</b>：實際收盤價、誤差、排程執行與偵測紀錄，屬系統稽核資料。
          </li>
          <li>
            <b>行情資料</b>：來自各資料源的公開市場資料，依其授權條款快取使用。
          </li>
        </ul>
        <p className="text-xs muted">本工具為數學擬合與統計方法的教學與研究用途，不構成任何投資建議。</p>
      </section>
    </div>
  );
}
