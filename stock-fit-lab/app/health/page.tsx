import type { Metadata } from 'next';
import { getHealthData } from '@/app/api/health/_data';
import HealthView from '@/components/admin/HealthView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '系統健康' };

export default async function HealthPage() {
  const data = await getHealthData();
  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold">系統健康</h1>
        <p className="text-sm muted">資料源失敗率、排程延遲、API 配額用量、儲存類型與環境設定集中於此；任一資料源連續失敗兩次，收盤排程會自動通知管理者。</p>
      </header>
      <HealthView data={data} />
    </div>
  );
}
