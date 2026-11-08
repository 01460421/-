import Link from 'next/link';
import { ADVANCED_IDS, BASIC_IDS, MODEL_META } from '@/lib/models';
import { BENCHMARK_META } from '@/lib/benchmarks';
import Tex from '@/components/Tex';
import { t } from '@/lib/i18n';

const POPULAR: { symbol: string; name: string; market: string }[] = [
  { symbol: '2330.TW', name: '台積電', market: '上市' },
  { symbol: '0050.TW', name: '元大台灣50', market: '上市 ETF' },
  { symbol: '2454.TW', name: '聯發科', market: '上市' },
  { symbol: '6488.TWO', name: '環球晶', market: '上櫃' },
  { symbol: 'AAPL', name: 'Apple', market: '美股' },
  { symbol: 'NVDA', name: 'NVIDIA', market: '美股' },
  { symbol: 'MSFT', name: 'Microsoft', market: '美股' },
];

const STEPS: { title: string; body: string }[] = [
  { title: '1. 只用當時已知的資料', body: '每次擬合只使用訓練視窗內（截至當日收盤）的價格；標準化、還原價與特徵都只用視窗內統計量，嚴禁讀取未來值。' },
  { title: '2. 寫入不可修改的快照', body: '每一次修正都寫入預測快照：時間戳、模型與版本、參數向量、訓練視窗起訖、各目標日預測值、信賴區間、當時的基準值與集成權重。快照 append-only，不能覆寫或刪除。' },
  { title: '3. 目標日到了才回填', body: '目標日收盤價出現後，排程把實際值與誤差寫入獨立的回填表，快照本身維持原狀，形成完整的預測—實現配對紀錄。' },
  { title: '4. 回顧只讀快照', body: '計分卡、趨勢圖、回放與月報全部讀取當時寫入的快照與回填值，不用現在的模型事後重算，因此沒有前視偏誤；方向準確率 > 70% 或 Theil’s U < 0.5 會被標為疑似資料洩漏並在稽核通過前隱藏。' },
];

function ModelCard({ id }: { id: keyof typeof MODEL_META }) {
  const m = MODEL_META[id];
  return (
    <li className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{m.name}</span>
        <code className="text-xs muted">{id}</code>
      </div>
      {m.advanced && <p className="text-xs muted">{m.short}</p>}
      <div className="mt-1 overflow-x-auto py-1">
        <Tex tex={m.formulaLatex} />
      </div>
    </li>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="panel space-y-3 p-5">
        <h1 className="text-2xl font-semibold tracking-tight">{t.appName}</h1>
        <p className="text-base">
          一個<b>可解釋的數學擬合實驗台</b>：把多項式、指數、傅立葉、Holt–Winters、ARIMA、GBM、卡爾曼濾波到 GARCH、高斯過程等模型攤在陽光下，逐一擬合台股與美股的價格，公開每個模型的公式、參數、殘差與樣本外誤差，並與 naive 等基準並排比較。
        </p>
        <p className="text-sm muted">這不是黑箱選股工具，也不提供買賣建議；它是讓你看清楚「數學外推能做到什麼、做不到什麼」的實驗台。所有預測與 AI 分析均為基於歷史資料的數學外推，不構成投資建議。</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link className="btn-primary" href="/stock/2330.TW">
            從 2330.TW 開始
          </Link>
          <Link className="btn" href="/accuracy">
            歷史準度回顧
          </Link>
          <Link className="btn" href="/dashboard">
            追蹤儀表板
          </Link>
        </div>
      </section>

      <section className="panel">
        <h2 className="h2 mb-2">熱門代號</h2>
        <p className="mb-2 text-xs muted">也可以在頂部搜尋列輸入 2330、2330.TW、台積電、AAPL 等格式，台股（上市 .TW / 上櫃 .TWO）與美股會自動分流。</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {POPULAR.map((p) => (
            <Link key={p.symbol} href={`/stock/${encodeURIComponent(p.symbol)}`} className="rounded-md border p-2 transition hover:opacity-80" style={{ borderColor: 'var(--border)' }}>
              <div className="font-medium">{p.symbol}</div>
              <div className="text-xs muted">
                {p.name} · {p.market}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel space-y-2">
        <h2 className="h2">準確度目標：可驗證地優於基準，而不是高命中率</h2>
        <p className="text-sm">
          股價方向接近隨機漫步，近乎完美的方向預測在數學上與實證上都不成立。本專案的目標是<b>「可驗證地優於基準，且不確定性校準正確」</b>：
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>方向準確率：樣本外至少 250 個交易日，1 日期顯著高於 50%（二項檢定 p &lt; 0.05）；5–20 日趨勢期目標 55%–60%。</li>
          <li>
            Theil&apos;s U &lt; 1，且 RMSE 相對 naive 基準改善至少 5%：<Tex tex={'U=\\sqrt{\\frac{\\sum_t\\left(\\frac{\\hat y_{t}-y_{t}}{y_{t-h}}\\right)^2}{\\sum_t\\left(\\frac{y_{t}-y_{t-h}}{y_{t-h}}\\right)^2}}'} />
          </li>
          <li>90% 信賴區間的實測覆蓋率落在 88%–92%。</li>
          <li>
            以校準過的 P(上漲) 取代單一方向判斷，回報 Brier score 與可靠度圖：<Tex tex={'\\mathrm{Brier}=\\tfrac1n\\sum_i (p_i-o_i)^2'} />；只在 P ≥ 0.65 或 ≤ 0.35 時出手，其餘觀望，並同時公布出手準確率與出手比例。
          </li>
          <li>樣本外方向準確率 &gt; 70% 或 Theil&apos;s U &lt; 0.5 會被視為「疑似資料洩漏」，自動稽核並在通過前隱藏。</li>
        </ul>
      </section>

      <section className="panel">
        <h2 className="h2 mb-2">基礎模型（{BASIC_IDS.length - 1} 個 + 集成）</h2>
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {BASIC_IDS.map((id) => (
            <ModelCard key={id} id={id} />
          ))}
        </ul>
        <p className="mt-2 text-xs muted">
          集成權重：<Tex tex={'w_m=\\frac{\\bar e_m^{-2}}{\\sum_j \\bar e_j^{-2}},\\ \\bar e_m^{(t)}=\\eta|y_t-\\hat y_{m,t}|+(1-\\eta)\\bar e_m^{(t-1)}'} />；方向準確率連續 10 期低於 50% 的模型權重暫時歸零。
        </p>
      </section>

      <section className="panel">
        <h2 className="h2 mb-2">進階模型（{ADVANCED_IDS.length} 個，進階模式開啟）</h2>
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {ADVANCED_IDS.map((id) => (
            <ModelCard key={id} id={id} />
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="h2 mb-2">基準（所有模型都必須與之並排比較）</h2>
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(BENCHMARK_META).map(([id, b]) => (
            <li key={id} className="rounded-md border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
              <div className="font-medium">{b.name}</div>
              <div className="overflow-x-auto py-1">
                <Tex tex={b.formula} />
              </div>
              <p className="text-xs muted">{b.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="h2 mb-2">預測快照與「不偷看未來」</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-md border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-1 font-medium">{s.title}</div>
              <p className="muted">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm">
          想知道過去的預測到底準不準？到 <Link className="underline" href="/accuracy">歷史準度回顧</Link> 查看計分卡、準度趨勢、預測回放與月度報告；系統排程與偵測紀錄在 <Link className="underline" href="/events">事件日誌</Link>。
        </p>
      </section>
    </div>
  );
}
