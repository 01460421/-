# stock-fit-lab Python 微服務（FastAPI）

TypeScript 實作（`lib/models/**`）是系統的預設引擎；本服務提供以 statsmodels / arch / PyTorch 寫成的**對照實作**，
用來交叉驗證 TS 模型，以及承載只有 Python 生態才方便做的機器學習對照組（LSTM）。

前端與排程透過 `lib/models/advanced/py-client.ts` 的 `fitRemote()` 呼叫本服務：
未設定 `PY_SERVICE_URL`、逾時、HTTP 錯誤（含 501）時一律回傳 `null`，呼叫端自動退回 TS 實作，不影響主流程。

## 端點

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/health` | 服務狀態、套件版本、選用套件（arch / torch）是否可用 |
| POST | `/fit` | 擬合並預測 |

`POST /fit` 請求：

```json
{
  "model": "arima | holtwinters | garch | msar | ucm | gp | lstm | tft",
  "y": [101.2, 102.5, ...],
  "h": 10,
  "level": 0.9,
  "params": { "max_p": 3 },
  "exog": [[...], ...]
}
```

回應：`{ model, mean[], lower[], upper[], level, params, diagnostics }`，皆為原始價格空間，長度 = `h`。

| model | 實作 | 主要 params |
| --- | --- | --- |
| `arima` | ADF 決定 d，AIC 迴圈搜尋 (p, q)（auto-arima 邏輯），對數價格 | `max_p`, `max_q`, `d` |
| `holtwinters` | 加法（阻尼）趨勢 + 可選季節，模擬路徑分位數作區間 | `season`, `damped`, `paths` |
| `garch` | GARCH(1,1)；有 `arch` 用 arch，否則 scipy MLE；區間由條件變異數路徑決定 | `force_scipy` |
| `msar` | Markov 轉換迴歸（平均與變異數皆切換），回傳當前 regime 機率 | `regimes`（2 / 3） |
| `ucm` | UnobservedComponents：局部線性趨勢 + 季節 + 外生迴歸（MLE / 卡爾曼，**非 MCMC**）；未來外生值以最後一筆持有 | `season` |
| `gp` | 高斯過程，RBF + 週期 + 線性核，L-BFGS-B 最大化邊際概似，最多 250 點 | `max_points` |
| `lstm` | 需要 `torch`（選用），未安裝回 **501** | `lookback`, `hidden`, `epochs`, `seed` |
| `tft` | Temporal Fusion Transformer 需要 pytorch-forecasting，屬規格中的「可選」對照組，本服務固定回 **501** 並說明 | — |

錯誤碼：`422` = 輸入不合法（非正價格、exog 列數不符）或數值擬合失敗；`501` = 選用相依未安裝。

## 本機執行

```bash
cd services/py
python -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt   # 執行期 + pytest/httpx
# 選用：pip install arch torch

uvicorn main:app --reload --port 8000
curl localhost:8000/health
```

在 Next.js 端設定環境變數：

```bash
PY_SERVICE_URL=http://localhost:8000
```

## 測試

```bash
cd services/py
.venv/bin/python -m pytest -q
```

## Docker

```bash
cd services/py
docker build -t stock-fit-lab-py .
# 含選用套件：docker build --build-arg EXTRAS="arch torch" -t stock-fit-lab-py .
docker run --rm -p 8000:8000 stock-fit-lab-py
```

## 注意事項

- 本服務只使用請求中的 `y` / `exog`，不讀取外部資料，因此不會引入未來資訊；走動式回測時由呼叫端確保只傳入預測起點以前的資料。
- 機器學習對照組（LSTM / TFT）只作對照，與數學模型同台接受同一套基準與回顧機制，不作為主要預測。
