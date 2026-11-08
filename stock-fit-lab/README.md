# 📐 股價數學擬合實驗台（Stock Fit Lab）

> 可解釋的數學擬合 · 即時修正 · 基準對照 · 歷史準度回顧
>
> **本工具為數學擬合與統計方法的教學與研究用途，所有預測與 AI 分析均為基於歷史資料的數學外推，不構成任何投資建議；過去擬合表現不代表未來結果。**

這不是黑箱 AI 選股工具。每條擬合曲線背後的公式、參數、殘差與誤差指標都能在介面上看見、調整與驗證；每一次預測都寫入**不可修改的快照**，事後以真實結果回填，讓「模型到底比基準好多少」可以被誠實地檢驗。

---

## 目錄

1. [架構](#架構)
2. [資料流程](#資料流程)
3. [資料庫 schema](#資料庫-schema)
4. [模型與數學說明](#模型與數學說明)
5. [即時修正四層機制](#即時修正四層機制)
6. [基準、指標與無前視偏誤的回顧](#基準指標與無前視偏誤的回顧)
7. [環境變數](#環境變數)
8. [本機開發](#本機開發)
9. [部署到 Vercel](#部署到-vercel)
10. [降級行為](#降級行為)
11. [測試](#測試)
12. [參考文獻](#參考文獻)
13. [已知限制與下一步](#已知限制與下一步)

---

## 架構

```
┌──────────────────────────── 瀏覽器（Next.js App Router, React, ECharts, KaTeX） ────────────────────────────┐
│ /stock/[symbol] 主分析頁   /accuracy 歷史準度回顧   /dashboard 追蹤儀表板   /events 事件日誌   /health 健康 │
│  K 線 + 擬合曲線 + 預測帶 + 基準 │ 殘差面板 │ 即時修正時間軸 │ 基準對照表 │ 參數工作區 │ AI 互動面板（串流） │
└──────────────┬──────────────────────────────────────────────────────────────────────────────────────────────┘
               │ fetch / NDJSON stream
┌──────────────▼───────────────────── Next.js Route Handlers（Node runtime, Vercel Serverless） ────────────────┐
│ /api/analyze  /api/walkforward  /api/accuracy  /api/snapshots  /api/dataset  /api/ai/chat  /api/ai/advice ... │
│ /api/cron/close  /api/cron/intraday  /api/cron/backfill   ← Vercel Cron（vercel.json）                          │
└──────┬──────────────────┬──────────────────────┬──────────────────────┬───────────────────────┬──────────────┘
       │                  │                      │                      │                       │
┌──────▼──────┐  ┌────────▼────────┐  ┌──────────▼──────────┐  ┌────────▼────────┐   ┌──────────▼─────────┐
│ lib/data-   │  │ lib/engine      │  │ lib/models (TS)     │  │ lib/detectors   │   │ lib/ai             │
│ adapters    │  │ 四層即時修正     │  │ 10 基礎 + 8 進階     │  │ z/CUSUM/PELT/   │   │ Claude（SDK）       │
│ FinMind     │  │ 快照/回填        │  │ lib/direction       │  │ BOCPD/HMM/量能/  │   │ 結構化建議 + 工具   │
│ TWSE/TPEx   │  │ 走動式驗證       │  │ 方向頭/門檻/校準      │  │ Page–Hinkley    │   │ 呼叫 + 每日配額     │
│ Yahoo/AV/   │  │ 洩漏稽核/計分卡   │  │        │            │  └─────────────────┘   └────────────────────┘
│ Polygon/    │  └────────┬────────┘  │        │ 可選 PY_SERVICE_URL                         lib/notify
│ Finnhub     │           │           └────────┼────────────┘                              Discord/LINE/Email
│ + KV 快取   │           │                    ▼
└─────────────┘           │         services/py（FastAPI: numpy/scipy/statsmodels，可選 arch/torch）
                          ▼
              lib/storage → Postgres（快照 append-only，觸發器拒絕 UPDATE/DELETE）或記憶體備援
```

### 目錄

| 路徑 | 內容 |
|---|---|
| `app/` | 頁面與 API（Route Handlers、Cron 端點） |
| `lib/types.ts` | 跨模組型別合約（ForecastModel 介面、快照、事件…） |
| `lib/math/` | 純 TS 數值核心：Householder QR、Jacobi SVD、Cholesky、分布函數、ACF/PACF、Ljung–Box、LM、Nelder–Mead、亂數 |
| `lib/models/` | 每個模型一個檔，皆實作 `fit()`、`predict(h)`、`update(newPoint)`、`direction(h)`、`describe()` |
| `lib/models/advanced/` | 進階模型（GARCH、EGARCH、MS-AR、GP、小波、EMD、BSTS、Stacking、Hurst）與 Python 服務客戶端 |
| `lib/direction/` | 方向分類頭、信心門檻、多時間尺度共識、趨勢過濾、機率校準 |
| `lib/benchmarks/` `lib/metrics/` | 基準與評估指標（含 Theil's U、Diebold–Mariano） |
| `lib/engine/` | 即時修正引擎、快照、回填、走動式驗證、洩漏稽核、準度回顧 |
| `lib/detectors/` | 異常與變化偵測器 |
| `lib/data-adapters/` | 資料源 Adapter（統一 OHLCV + 來源 + 時間戳 + 延遲） |
| `lib/integrations/` | 外部網站連結、自選股 CSV 匯入、TradingView 代號、深層連結 |
| `lib/notify/` | Discord / LINE Messaging API / Email（Resend） |
| `lib/ai/` | LLM 供應商、提示、結構化建議、串流工具呼叫、配額 |
| `lib/storage/` | Postgres 與記憶體儲存實作 |
| `jobs/` | 排程工作（收盤全量、盤中輕量、回填） |
| `services/py/` | FastAPI 數值微服務 |
| `db/schema.sql` | 資料庫 schema |
| `config/external-links.json` | 外部連結模板（可自行新增） |

---

## 資料流程

1. **抽取**：`getMarketData().getHistory(symbol)` 依市場走備援鏈 —— 台股 FinMind（還原價）→ TWSE / TPEx → Yahoo；美股 Yahoo → Polygon → Alpha Vantage → Finnhub。每個 Adapter 有令牌桶速率限制、429/5xx 指數退避重試、逾時與回應驗證；結果寫入 KV 快取。全部失敗時回傳快取並標記 `stale: true`，介面顯示「快取資料」與資料時間。缺值以前值填補並標記 `filled`。
2. **擬合**：引擎取最近 N 筆（預設 120），以 `w_i = λ^(T−i)` 加權，所有模型先把時間軸映射到 [−1, 1]。
3. **快照**：每次修正為每個模型寫入一筆 `prediction_snapshots`（含參數向量、訓練視窗起訖、目標交易日、預測值、區間、當時基準值、當時集成權重）。
4. **回填**：排程在目標日收盤後把實際值與誤差寫入 `snapshot_outcomes`（快照本身永不修改）。
5. **偵測 + 通知**：偵測器掃描殘差、價格、成交量與模型誤差；觸發、權重大幅重分配、預測與基準差距過大時推播，訊息附直連分析頁 URL。全部寫入 `system_events`。
6. **回顧**：計分卡、趨勢圖、回放與月報**只讀取快照與回填表**，從不事後重算。

---

## 資料庫 schema

完整 DDL 見 [`db/schema.sql`](db/schema.sql)。

| 表 | 用途 | 重點 |
|---|---|---|
| `prediction_snapshots` | 預測快照 | append-only；`BEFORE UPDATE OR DELETE` 觸發器直接 raise exception |
| `snapshot_outcomes` | 實際值回填 | 主鍵 `(snapshot_id, horizon_index)`，`on conflict do nothing`，同樣不可修改 |
| `system_events` | 事件日誌 / 稽核軌跡 | 排程執行、偵測觸發、AI 建議、通知發送、洩漏疑慮、資料源錯誤 |
| `watchlist` | 自選股 | `(user_id, symbol)`；屬個人資料，可一鍵匯出 / 刪除 |
| `conversations` | AI 對話 | 訊息 + 當時引用的情境快照；屬個人資料 |

---

## 模型與數學說明

所有模型擬合前把索引 `i = 0..n−1` 映射為 `τ = 2i/(n−1) − 1 ∈ [−1, 1]`，外推沿用同一映射（τ > 1）。價格可選原始價或對數價；輸出一律回到原始價格空間。每個模型的 `describe()` 提供 LaTeX 公式、推導、適用與失效情境，介面的「模型說明抽屜」直接渲染。

### 基礎模型（第三節）

| 模型 | 公式 | 求解 | 線上更新 |
|---|---|---|---|
| 多項式最小平方 | $P_n(t)=\sum_{k=0}^{n} a_k t^k$，n ∈ 1–6 | 加權 Householder QR；條件數 > 1e12 改 SVD 截斷偽逆；BIC 自動選次數（同時回報 AIC） | RLS（遺忘因子、記錄增益向量） |
| 指數 | $y=a e^{bt}$ | 對 ln y 線性回歸 | RLS |
| 對數 | $y=a+b\ln s$，$s=(i+1)/n$ | 線性回歸 | RLS |
| Logistic | $y=\frac{L}{1+e^{-k(t-t_0)}}$ | Levenberg–Marquardt；失敗降級為線性 | 重擬合 |
| 傅立葉 | $r(t)=\sum_{j=1}^{m}(b_j\cos\omega_j t+c_j\sin\omega_j t)$，m 預設 3、上限 8 | 線性去趨勢 → 週期圖選頻 → 聯合最小平方 | 重擬合 |
| 線性回歸通道 | $\hat y \pm k\sigma_\varepsilon$，k 預設 2 | 回歸 | RLS |
| Holt–Winters | 水準 / 趨勢 / 季節三分量（加法） | α、β、γ 以 Nelder–Mead（logit 空間）最小化 SSE | 單步平滑 |
| ARIMA(p,d,q) | $\phi(B)(1-B)^d y_t=\theta(B)\varepsilon_t$ | KPSS 定 d；AICc 逐步搜尋 p、q；ψ 權重求預測變異；ACF / PACF / Ljung–Box | 重擬合 |
| 幾何布朗運動 | $dS_t=\mu S_t\,dt+\sigma S_t\,dW_t$ | 最近 N 日對數報酬估 μ、σ；1000 條種子固定路徑；5%–95% 分位帶 | 重擬合 |
| 卡爾曼（局部線性趨勢） | 狀態 [水準, 斜率]，$F=\begin{bmatrix}1&1\\0&1\end{bmatrix}$ | 變異數以 MLE；真正的預測—更新；連續 3 期 > 2σ 觸發結構性變化警示並放大 Q | 預測—更新 |
| 加權集成 | $w_m=\frac{\bar e_m^{-2}}{\sum_j \bar e_j^{-2}}$ | 見下節 | 權重再分配 |

### 進階模型（第八節，「進階模式」）

| 模型 | 說明 |
|---|---|
| GARCH(1,1) / EGARCH | 對 100·對數報酬做 MLE；預測的條件變異數路徑直接決定信賴區間寬度（非固定 σ） |
| Markov 轉換 AR | 2–3 個 regime（多頭 / 盤整 / 空頭），Hamilton 濾波 + EM，輸出當前 regime 機率 |
| 高斯過程回歸 | RBF + 週期核 + 線性核，Cholesky + 邊際概似最大化；最多取最近 250 點 |
| 小波（db4）/ EMD | 拆成趨勢、中週期、雜訊三層；趨勢以阻尼 Holt、中週期以諧波外推，雜訊層不外推 |
| BSTS（近似） | 局部線性趨勢 + 季節 + 外生變數回歸，以 Kalman 濾波 + MLE（**非 MCMC**） |
| Hurst / 分數差分 | R/S 與 DFA；H > 0.55 才視為具長記憶、允許趨勢外推類模型發出訊號 |
| Stacking | Ridge meta-learner，訓練資料**只能**是走動式樣本外預測 |
| LSTM / TFT（可選對照組） | 在 Python 服務中；未安裝 torch 時回傳 501 並說明 |

### 方向導向設計（第八節）

- **方向分類頭** `lib/direction/head.ts`：logistic 迴歸，損失以方向錯誤為主、幅度為輔（樣本權重 1 + c·|報酬|）。
- **信心門檻與觀望**：P(上漲) ≥ 0.65 看漲、≤ 0.35 看跌，其餘觀望；門檻可調。計分卡同時呈現出手準確率與出手比例。
- **多時間尺度共識**：日 / 週 / 月三個尺度一致才給高信心，否則降為觀望。
- **趨勢過濾**：ADX、Hurst、regime 機率；盤整 regime 下不發出趨勢方向。
- **校準**：Brier score、可靠度圖、Platt / Isotonic 校準器。

---

## 即時修正四層機制

| 層 | 內容 | 可在介面開關 |
|---|---|---|
| 1 滾動視窗重擬合 | 新資料進場時以最近 N 筆重擬合，權重 $w_i=\lambda^{T-i}$ | ✅ |
| 2 RLS | 多項式 / 線性類模型線上更新，記錄遺忘因子與增益向量 | ✅ |
| 3 卡爾曼 | 預測—更新兩步，顯示增益 $K_t$；殘差連續三期 > 2σ → 警示 + 放大 Q | ✅ |
| 4 集成權重再分配 | $\bar e_m^{(t)}=\eta|y_t-\hat y_{m,t}|+(1-\eta)\bar e_m^{(t-1)}$，η = 0.1；方向準確率 < 50% 連續 10 期 → 權重暫時歸零並標示 | ✅ |

每次修正都寫入快照（`trigger` 欄位記錄由哪一層觸發）。

---

## 基準、指標與無前視偏誤的回顧

**基準**：Naive（明日 = 今日）、漂移隨機漫步、SMA20、SMA60、買進持有、使用者自訂目標價。

**指標**：MAE、RMSE、MAPE、方向準確率（含二項檢定 p 值）、Theil's U（U < 1 才優於 naive）、90% 區間覆蓋率、Brier score；全部以「模型 vs. 基準」差值與相對改善百分比呈現，並以 Diebold–Mariano 檢定判斷顯著性。

**走動式前向驗證**：每個預測起點只使用當時已知的價格（含當時的滾動視窗與標準化），逐日產生預測再與真值比對。

**洩漏稽核**：樣本外方向準確率 > 70% 或 Theil's U < 0.5 自動標記「疑似資料洩漏」並檢查：(a) 起點與目標日的時間對齊、(b) 還原股價是否引入未來分割資訊、(c) 截斷資料重擬合後視窗內擬合值必須完全相同（標準化只用視窗統計量）、(d) 快照內容雜湊未被改寫。未通過前該結果不顯示在計分卡。

**隨機漫步洩漏測試**（`tests/engine/leak.test.ts`）：5 個種子 × 600 點、每模型 2700 個一步起點，所有基礎模型方向準確率皆落在 50% ± 3%（實測 48.7%–51.6%）。

---

## 環境變數

完整範本見 [`.env.example`](.env.example)。全部選填 —— 沒有任何金鑰時網站仍可運作（台股走 FinMind 免費額度、儲存走記憶體、AI 面板顯示未啟用）。

| 變數 | 用途 |
|---|---|
| `DATABASE_URL` / `POSTGRES_URL` | Postgres（Vercel Postgres / Supabase / Neon） |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel KV / Upstash 行情快取 |
| `FINMIND_TOKEN` | FinMind（選填，提高額度） |
| `ALPHAVANTAGE_API_KEY`, `POLYGON_API_KEY`, `FINNHUB_API_KEY` | 美股備援與盤中、事件資料 |
| `PY_SERVICE_URL` | Python 數值微服務 |
| `ANTHROPIC_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_EFFORT` | AI 分析助理（預設 `claude-opus-5-5`） |
| `LLM_DAILY_REQUEST_LIMIT`, `LLM_DAILY_COST_LIMIT_USD` | AI 每日配額與費用上限 |
| `LLM_FALLBACKS` | `off` 關閉伺服器端拒答備援（預設開啟 `fallbacks: "default"`） |
| `CRON_SECRET` | 保護 `/api/cron/*` |
| `TRACK_SYMBOLS` | 排程固定追蹤代號 |
| `WEIGHT_SHIFT_ALERT`, `FORECAST_GAP_ALERT_PCT` | 通知閾值（預設 0.25、15%） |
| `DISCORD_WEBHOOK_URL`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_TO`, `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` | 通知 |
| `NEXT_PUBLIC_SITE_URL` | 通知中的直連 URL |

---

## 本機開發

```bash
cd stock-fit-lab
npm install
cp .env.example .env.local     # 全部可留空
npm run dev                    # http://localhost:3000/stock/2330.TW
npm test                       # vitest 單元 + 整合 + 洩漏測試
npm run typecheck
npm run job:close              # 手動跑一次收盤全量（寫快照、回填、偵測）
```

沒有 `DATABASE_URL` 時，本機會把快照持久化到 `.data/store.json`，重啟後仍可回顧。

Python 微服務（選用）：

```bash
cd services/py
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000   # 然後設定 PY_SERVICE_URL=http://localhost:8000
```

---

## 部署到 Vercel

1. 在 Vercel 匯入此 repository，**Root Directory 設為 `stock-fit-lab`**，Framework 選 Next.js。
2. Storage → 建立 Postgres（或連接 Supabase / Neon）並取得 `DATABASE_URL`；建立 KV（選填）。
3. 於本機執行 `DATABASE_URL=... npm run db:migrate` 套用 schema（含 append-only 觸發器）。
4. 於 Project Settings → Environment Variables 填入需要的變數（至少建議 `DATABASE_URL`、`CRON_SECRET`、`NEXT_PUBLIC_SITE_URL`）。
5. 部署。`vercel.json` 已設定排程：
   - 台股收盤後 `10 6 * * 1-5`（UTC，= 台北 14:10）
   - 美股收盤後 `20 22 * * 1-5`（UTC；夏令時間 = 美東 18:20、冬令 = 17:20，皆在收盤後）
   - 盤中每 15 分鐘輕量偵測（台股 `*/15 1-5`、美股 `*/15 13-21`，端點內再以交易日曆判斷是否開盤）
   - 每日回填 `40 23 * * *`
   > Vercel Hobby 方案的 Cron 每日僅能觸發一次且精度為小時；盤中排程需 Pro 方案或改用外部排程器（GitHub Actions / cron-job.org 呼叫同一端點並帶 `Authorization: Bearer $CRON_SECRET`）。
6. （選用）把 `services/py` 以 Dockerfile 部署到 Fly.io / Render / Cloud Run，設定 `PY_SERVICE_URL`。

---

## 降級行為

| 狀況 | 行為 |
|---|---|
| 資料源失敗 | 走備援鏈 → 仍失敗則回傳快取並標示「快取資料」與資料時間 |
| 未設定付費金鑰 | 對應 Adapter `isConfigured()=false` 被略過，使用免費替代源 |
| 非線性求解失敗 | Logistic 降級為線性；條件數過大改用 SVD；`describe().diagnostics.degraded` 說明原因 |
| 未設定 `DATABASE_URL` | 記憶體儲存（本機持久化到 `.data/`；Vercel 上僅單一 lambda 生命週期，健康頁會警告） |
| 未設定 `PY_SERVICE_URL` | 全部使用 TypeScript 實作 |
| 未設定 `ANTHROPIC_API_KEY` | AI 面板顯示未啟用；其餘功能不受影響 |
| AI 配額或費用達上限 | 當日拒絕新的 AI 呼叫並提示 |

---

## 測試

```bash
npm test
```

| 類別 | 位置 | 重點 |
|---|---|---|
| 模型單元測試 | `tests/models`, `tests/advanced` | 已知解析解：$y=2t^2+3t+1$ 還原係數、模擬 GBM 還原 μ/σ、AR(1) 還原 φ、GARCH 還原 α/β、db4 完美重建… |
| 效能 | `tests/models/perf.test.ts` | 500 點基礎模型全量重算 < 1 秒（實測約 0.35–0.47 秒） |
| 即時修正整合 | `tests/engine/integration.test.ts` | 逐筆餵入：快照寫入且不可變、權重更新、回填、卡爾曼結構性變化事件 |
| 洩漏測試 | `tests/engine/leak.test.ts` | 純隨機漫步下所有模型方向準確率 50% ± 3%；人工洩漏管線被稽核抓出 |
| 資料 / 偵測 / 整合 | `tests/data`, `tests/detectors`, `tests/integrations` | 以 mock fetch 測 Adapter 解析、備援鏈、重試；偵測器以合成資料注入突波、均值位移、波動 regime |
| Python | `services/py/test_main.py` | `pytest` |

---

## 參考文獻

- Golub, G. H., & Van Loan, C. F. (2013). *Matrix Computations* (4th ed.). — Householder QR、Jacobi SVD
- Hyndman, R. J., & Athanasopoulos, G. (2021). *Forecasting: Principles and Practice* (3rd ed.). — Holt–Winters、ARIMA、預測區間
- Hyndman, R. J., & Khandakar, Y. (2008). Automatic time series forecasting: the forecast package for R. *JSS* 27(3). — auto-ARIMA 逐步搜尋
- Kwiatkowski, D., Phillips, P., Schmidt, P., & Shin, Y. (1992). Testing the null hypothesis of stationarity. *J. Econometrics* 54. — KPSS
- Ljung, G. M., & Box, G. E. P. (1978). On a measure of lack of fit in time series models. *Biometrika* 65(2).
- Durbin, J., & Koopman, S. J. (2012). *Time Series Analysis by State Space Methods* (2nd ed.). — 卡爾曼濾波、局部線性趨勢、結構時間序列
- Haykin, S. (2002). *Adaptive Filter Theory* (4th ed.). — RLS
- Bollerslev, T. (1986). Generalized autoregressive conditional heteroskedasticity. *J. Econometrics* 31. — GARCH
- Nelson, D. B. (1991). Conditional heteroskedasticity in asset returns: a new approach. *Econometrica* 59(2). — EGARCH
- Hamilton, J. D. (1989). A new approach to the economic analysis of nonstationary time series. *Econometrica* 57(2). — Markov 轉換
- Rasmussen, C. E., & Williams, C. K. I. (2006). *Gaussian Processes for Machine Learning*. MIT Press.
- Daubechies, I. (1992). *Ten Lectures on Wavelets*. SIAM. — db4
- Huang, N. E., et al. (1998). The empirical mode decomposition and the Hilbert spectrum. *Proc. R. Soc. A* 454. — EMD
- Scott, S. L., & Varian, H. R. (2014). Predicting the present with Bayesian structural time series. *IJMMNO* 5(1). — BSTS
- Hurst, H. E. (1951); Peng, C.-K., et al. (1994). Mosaic organization of DNA nucleotides. *Phys. Rev. E* 49. — R/S、DFA
- Hosking, J. R. M. (1981). Fractional differencing. *Biometrika* 68(1).
- Wolpert, D. H. (1992). Stacked generalization. *Neural Networks* 5(2).
- Killick, R., Fearnhead, P., & Eckley, I. A. (2012). Optimal detection of changepoints with a linear computational cost. *JASA* 107. — PELT
- Adams, R. P., & MacKay, D. J. C. (2007). Bayesian online changepoint detection. arXiv:0710.3742. — BOCPD
- Page, E. S. (1954). Continuous inspection schemes. *Biometrika* 41. — CUSUM / Page–Hinkley
- Theil, H. (1966). *Applied Economic Forecasting*. — Theil's U
- Diebold, F. X., & Mariano, R. S. (1995). Comparing predictive accuracy. *JBES* 13(3).
- Brier, G. W. (1950). Verification of forecasts expressed in terms of probability. *Monthly Weather Review* 78.
- Wilder, J. W. (1978). *New Concepts in Technical Trading Systems*. — ADX

---

## 已知限制與下一步

見 [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md)。
