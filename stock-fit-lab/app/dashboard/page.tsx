import type { Metadata } from 'next';
import Link from 'next/link';
import { getDashboardData } from '@/app/api/dashboard/_data';
import DashboardTable from '@/components/admin/DashboardTable';
import AnalyzeTrigger from '@/components/admin/AnalyzeTrigger';
import { fmtTime } from '@/components/accuracy/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '追蹤儀表板' };

export default async function DashboardPage() {
  const data = await getDashboardData();
  const withSnap = data.rows.filter((r) => r.latest).length;
  const run = (m: 'TW' | 'US') => {
    const r = data.lastCloseRuns[m];
    return r ? `${fmtTime(r.at)}（成功 ${r.ok}、失敗 ${r.failed}）` : '尚無紀錄';
  };
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold">追蹤儀表板</h1>
          <p className="text-sm muted">所有追蹤中代號的最新預測方向、近 20 筆準度、最近偵測事件與資料新鮮度。點欄位標題可排序。方向為數學外推的機率判斷，不構成投資建議。</p>
        </div>
        <a className="btn" href="/api/dashboard" target="_blank" rel="noreferrer">
          JSON
        </a>
      </header>

      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel">
          <div className="text-xs muted">追蹤代號</div>
          <div className="text-lg font-semibold">{data.symbols.length}</div>
          <div className="text-xs muted">自選清單 {data.sources.tracked} 檔 ∪ TRACK_SYMBOLS {data.sources.env.length} 檔</div>
        </div>
        <div className="panel">
          <div className="text-xs muted">已有快照</div>
          <div className="text-lg font-semibold">
            {withSnap} / {data.rows.length}
          </div>
          <div className="text-xs muted">儲存：{data.storeKind === 'postgres' ? 'PostgreSQL' : '記憶體'}</div>
        </div>
        <div className="panel">
          <div className="text-xs muted">台股收盤排程（最近）</div>
          <div className="text-sm">{run('TW')}</div>
        </div>
        <div className="panel">
          <div className="text-xs muted">美股收盤排程（最近）</div>
          <div className="text-sm">{run('US')}</div>
        </div>
      </div>

      <section className="panel">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <h2 className="h2">追蹤清單</h2>
          <span className="text-xs muted">
            資料：最新集成快照（P(上漲) 門檻 {data.thresholds.up} / {data.thresholds.down}）、回填結果、事件日誌 · 產生於 {fmtTime(data.generatedAt)}
          </span>
        </div>
        {withSnap === 0 && (
          <div className="mb-3 rounded-md border border-dashed p-4 text-sm" style={{ borderColor: 'var(--border)' }}>
            <p className="font-medium">尚無任何預測快照</p>
            <p className="mt-1 muted">
              儀表板的資料由收盤後排程（台股 14:10、美股收盤後；見 <Link className="underline" href="/health">系統健康</Link>）自動產生：對所有追蹤代號重擬合、寫入快照、回填實際值並執行偵測器。部署後第一次排程執行前此處會是空的，你也可以先手動分析一檔：
            </p>
            <div className="mt-2">
              <AnalyzeTrigger symbols={data.symbols} />
            </div>
          </div>
        )}
        <DashboardTable rows={data.rows} />
        {withSnap > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer muted">手動觸發單一代號分析</summary>
            <div className="mt-2">
              <AnalyzeTrigger symbols={data.symbols} />
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
