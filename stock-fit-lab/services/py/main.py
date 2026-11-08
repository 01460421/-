"""
stock-fit-lab Python 微服務（FastAPI）

TypeScript 實作是預設引擎；本服務提供 statsmodels / arch / PyTorch 的「對照實作」，
由 lib/models/advanced/py-client.ts 以 PY_SERVICE_URL 呼叫，失敗時前端自動退回 TS 實作。

端點：
  GET  /health  → 服務狀態與選用套件是否可用
  POST /fit     → {model, y, h, level, params, exog?} → {mean, lower, upper, level, params, diagnostics}

模型：
  arima        auto-ARIMA（ADF 決定 d，AIC 迴圈搜尋 p、q），對數價格
  holtwinters  加法趨勢（+ 可選季節）指數平滑，模擬路徑分位數作為區間，對數價格
  garch        GARCH(1,1)；有 `arch` 套件用 arch，否則 scipy MLE 後備
  msar         Markov 轉換迴歸（regime 平均與變異數皆切換），statsmodels MarkovRegression
  ucm          結構時間序列（局部線性趨勢 + 季節 + 外生迴歸），statsmodels UnobservedComponents（MLE/卡爾曼，非 MCMC）
  gp           高斯過程（RBF + 週期 + 線性核），numpy + scipy 最大化邊際概似
  lstm         需要 torch（選用）；未安裝回 501
  tft          Temporal Fusion Transformer 需要 pytorch-forecasting，屬選用對照組，本服務回 501

所有輸出皆在原始價格空間；只使用請求中的 y（不讀任何外部或未來資料）。
"""
from __future__ import annotations

import math
import warnings
from typing import Any, Literal, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from scipy import optimize, stats

warnings.filterwarnings("ignore")

try:  # 選用：arch
    from arch import arch_model  # type: ignore

    HAS_ARCH = True
except Exception:  # pragma: no cover - 依環境而定
    HAS_ARCH = False

try:  # 選用：torch
    import torch  # type: ignore

    HAS_TORCH = True
except Exception:  # pragma: no cover
    HAS_TORCH = False

app = FastAPI(title="stock-fit-lab py service", version="1.0.0")

ModelName = Literal["arima", "holtwinters", "garch", "msar", "ucm", "gp", "lstm", "tft"]


class FitRequest(BaseModel):
    model: ModelName
    y: list[float] = Field(..., min_length=10)
    h: int = Field(10, ge=1, le=250)
    level: float = Field(0.9, gt=0.0, lt=1.0)
    params: dict[str, float] = Field(default_factory=dict)
    exog: Optional[list[list[float]]] = None

    @field_validator("y")
    @classmethod
    def _positive(cls, v: list[float]) -> list[float]:
        if any((not math.isfinite(x)) or x <= 0 for x in v):
            raise ValueError("價格必須為正有限數")
        return v

    @model_validator(mode="after")
    def _exog_aligned(self) -> "FitRequest":
        if self.exog is not None:
            if len(self.exog) != len(self.y):
                raise ValueError("exog 列數必須與 y 相同")
            k = len(self.exog[0]) if self.exog else 0
            if any(len(r) != k for r in self.exog):
                raise ValueError("exog 每列長度必須一致")
        return self


class FitResponse(BaseModel):
    model: str
    mean: list[float]
    lower: list[float]
    upper: list[float]
    level: float
    params: dict[str, Any]
    diagnostics: dict[str, Any]


def _z(level: float) -> float:
    return float(stats.norm.ppf(0.5 + level / 2))


def _clean(d: dict[str, Any]) -> dict[str, Any]:
    """把 numpy 型別轉成可 JSON 序列化的 Python 型別。"""
    out: dict[str, Any] = {}
    for k, v in d.items():
        if isinstance(v, np.ndarray):
            out[k] = [float(x) for x in v.ravel()]
        elif isinstance(v, (np.floating, np.integer)):
            out[k] = float(v)
        elif isinstance(v, float) and not math.isfinite(v):
            out[k] = None
        elif isinstance(v, (list, tuple)):
            out[k] = [float(x) if isinstance(x, (np.floating, np.integer, float, int)) else x for x in v]
        else:
            out[k] = v
    return out


def _cum_return_forecast(last: float, mu: np.ndarray, var: np.ndarray, level: float):
    """百分比對數報酬的逐期平均 / 變異數 → 累積價格預測與區間。"""
    z = _z(level)
    cm = np.cumsum(mu) / 100.0
    cv = np.cumsum(np.maximum(var, 0)) / 1e4
    sd = np.sqrt(cv)
    return last * np.exp(cm), last * np.exp(cm - z * sd), last * np.exp(cm + z * sd)


# ─────────────────────────────── ARIMA ───────────────────────────────


def fit_arima(y: np.ndarray, h: int, level: float, params: dict[str, float]):
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.stattools import adfuller
    from statsmodels.stats.diagnostic import acorr_ljungbox

    ly = np.log(y)
    max_p = int(params.get("max_p", 3))
    max_q = int(params.get("max_q", 3))
    d = int(params["d"]) if "d" in params else None
    if d is None:
        d = 0
        series = ly
        while d < 2:
            try:
                pval = adfuller(series, autolag="AIC")[1]
            except Exception:
                pval = 1.0
            if pval < 0.05:
                break
            d += 1
            series = np.diff(series)
    best = None
    tried = []
    for p in range(max_p + 1):
        for q in range(max_q + 1):
            trend = "c" if d == 0 else ("t" if d == 1 else "n")
            try:
                res = ARIMA(ly, order=(p, d, q), trend=trend).fit()
                tried.append({"p": p, "q": q, "aic": float(res.aic)})
                if best is None or res.aic < best[0].aic:
                    best = (res, p, q)
            except Exception:
                continue
    if best is None:
        raise HTTPException(status_code=422, detail="ARIMA 所有階數皆擬合失敗")
    res, p, q = best
    fc = res.get_forecast(h)
    mean = np.asarray(fc.predicted_mean)
    ci = np.asarray(fc.conf_int(alpha=1 - level))
    lb = acorr_ljungbox(res.resid[d:], lags=[min(10, len(ly) // 5)], return_df=True)
    return (
        np.exp(mean),
        np.exp(ci[:, 0]),
        np.exp(ci[:, 1]),
        {"order": [p, d, q], **{n: float(v) for n, v in zip(res.model.param_names, res.params)}},
        {"aic": float(res.aic), "bic": float(res.bic), "ljungBoxP": float(lb["lb_pvalue"].iloc[0]), "candidates": len(tried)},
    )


# ─────────────────────────────── Holt–Winters ───────────────────────────────


def fit_holtwinters(y: np.ndarray, h: int, level: float, params: dict[str, float]):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    ly = np.log(y)
    season = int(params.get("season", 0))
    seasonal = "add" if season > 1 and len(ly) >= 2 * season + 10 else None
    model = ExponentialSmoothing(
        ly,
        trend="add",
        damped_trend=bool(params.get("damped", 1)),
        seasonal=seasonal,
        seasonal_periods=season if seasonal else None,
        initialization_method="estimated",
    )
    res = model.fit(optimized=True)
    mean = np.asarray(res.forecast(h))
    reps = int(params.get("paths", 1000))
    try:  # statsmodels ≥ 0.15 使用 rng，舊版使用 random_state
        sims = np.asarray(res.simulate(h, repetitions=reps, error="add", anchor="end", rng=np.random.default_rng(42)))
    except TypeError:
        sims = np.asarray(res.simulate(h, repetitions=reps, error="add", anchor="end", random_state=42))
    a = (1 - level) / 2
    lo = np.quantile(sims, a, axis=1)
    hi = np.quantile(sims, 1 - a, axis=1)
    p = {k: float(v) for k, v in res.params.items() if np.isscalar(v) and v is not None and np.isfinite(v)}
    return np.exp(mean), np.exp(lo), np.exp(hi), p, {"sse": float(res.sse), "aic": float(res.aic), "seasonal": seasonal or "none"}


# ─────────────────────────────── GARCH ───────────────────────────────


def _garch_nll(theta: np.ndarray, r: np.ndarray) -> float:
    mu, omega, alpha, beta = theta
    if omega <= 0 or alpha < 0 or beta < 0 or alpha + beta >= 0.9999:
        return 1e12
    e = r - mu
    s2 = np.empty_like(r)
    s2[0] = np.var(r)
    for t in range(1, len(r)):
        s2[t] = omega + alpha * e[t - 1] ** 2 + beta * s2[t - 1]
    return float(0.5 * np.sum(np.log(2 * np.pi) + np.log(s2) + e**2 / s2))


def fit_garch(y: np.ndarray, h: int, level: float, params: dict[str, float]):
    r = 100 * np.diff(np.log(y))
    if len(r) < 30:
        raise HTTPException(status_code=422, detail="GARCH 至少需要 30 筆報酬")
    if HAS_ARCH and not params.get("force_scipy"):
        res = arch_model(r, mean="Constant", vol="GARCH", p=1, q=1, dist="normal", rescale=False).fit(disp="off")
        mu = float(res.params["mu"])
        omega, alpha, beta = (float(res.params[k]) for k in ("omega", "alpha[1]", "beta[1]"))
        var = np.asarray(res.forecast(horizon=h, reindex=False).variance.values[-1])
        engine = "arch"
        ll = float(res.loglikelihood)
    else:
        v = np.var(r)
        x0 = np.array([np.mean(r), 0.1 * v, 0.08, 0.88])
        opt = optimize.minimize(_garch_nll, x0, args=(r,), method="Nelder-Mead", options={"maxiter": 4000, "xatol": 1e-8, "fatol": 1e-8})
        mu, omega, alpha, beta = (float(v_) for v_ in opt.x)
        e = r - mu
        s2 = np.var(r)
        for t in range(1, len(r)):
            s2 = omega + alpha * e[t - 1] ** 2 + beta * s2
        s2_next = omega + alpha * e[-1] ** 2 + beta * s2
        pers = alpha + beta
        lr = omega / (1 - pers)
        var = lr + pers ** np.arange(h) * (s2_next - lr)
        engine = "scipy"
        ll = -float(opt.fun)
    mean, lo, hi = _cum_return_forecast(float(y[-1]), np.full(h, mu), var, level)
    return (
        mean,
        lo,
        hi,
        {"mu": mu, "omega": omega, "alpha": alpha, "beta": beta},
        {"engine": engine, "persistence": alpha + beta, "logLik": ll, "varianceForecast": var},
    )


# ─────────────────────────────── MS 迴歸 ───────────────────────────────


def fit_msar(y: np.ndarray, h: int, level: float, params: dict[str, float]):
    from statsmodels.tsa.regime_switching.markov_regression import MarkovRegression

    r = 100 * np.diff(np.log(y))
    k = 2 if int(params.get("regimes", 3)) == 2 else 3
    if len(r) < 30 * k:
        k = 2
    mod = MarkovRegression(r, k_regimes=k, trend="c", switching_variance=True)
    res = None
    for reps in (20, 50):
        try:
            res = mod.fit(search_reps=reps, disp=False)
            break
        except Exception:
            continue
    if res is None:
        raise HTTPException(status_code=422, detail="Markov 轉換模型擬合失敗")
    names = list(res.model.param_names)
    pv = dict(zip(names, np.asarray(res.params, dtype=float)))
    mu = np.array([pv[f"const[{i}]"] for i in range(k)])
    s2 = np.array([pv[f"sigma2[{i}]"] for i in range(k)])
    P = np.asarray(res.regime_transition)[:, :, -1]  # P[i, j] = P(s_t = i | s_{t-1} = j)
    probs = np.asarray(res.filtered_marginal_probabilities)[-1]
    order = np.argsort(mu)
    labels = ["空頭", "盤整", "多頭"] if k == 3 else ["空頭", "多頭"]
    m_steps = np.empty(h)
    v_steps = np.empty(h)
    pi = probs.copy()
    for t in range(h):
        pi = P @ pi
        m = float(pi @ mu)
        m_steps[t] = m
        v_steps[t] = float(pi @ (s2 + mu**2) - m**2)
    mean, lo, hi = _cum_return_forecast(float(y[-1]), m_steps, v_steps, level)
    return (
        mean,
        lo,
        hi,
        {"regimes": k, "mu": mu[order], "sigma": np.sqrt(s2[order]), "transition": P[np.ix_(order, order)].T.ravel()},
        {"regimeLabels": labels, "regimeProbs": probs[order], "logLik": float(res.llf), "aic": float(res.aic)},
    )


# ─────────────────────────────── UCM（BSTS 近似） ───────────────────────────────


def fit_ucm(y: np.ndarray, h: int, level: float, params: dict[str, float], exog: Optional[np.ndarray]):
    from statsmodels.tsa.statespace.structural import UnobservedComponents

    ly = np.log(y)
    season = int(params.get("season", 0))
    mod = UnobservedComponents(
        ly,
        level="local linear trend",
        seasonal=season if season > 1 else None,
        exog=exog,
    )
    res = mod.fit(disp=False, maxiter=500)
    fut = None
    if exog is not None:
        fut = np.tile(exog[-1], (h, 1))  # 未來外生值未知：持有最後一筆（假設，需揭露）
    fc = res.get_forecast(h, exog=fut)
    mean = np.asarray(fc.predicted_mean)
    ci = np.asarray(fc.conf_int(alpha=1 - level))
    return (
        np.exp(mean),
        np.exp(ci[:, 0]),
        np.exp(ci[:, 1]),
        {n: float(v) for n, v in zip(res.model.param_names, res.params)},
        {
            "aic": float(res.aic),
            "estimation": "MLE（卡爾曼濾波），非 MCMC",
            "exogFutureAssumption": "hold last" if exog is not None else "none",
        },
    )


# ─────────────────────────────── GP ───────────────────────────────


def _gp_kernel(a: np.ndarray, b: np.ndarray, th: np.ndarray) -> np.ndarray:
    sr, lr, sp, lp, per, sl = np.exp(th[:6])
    d = a[:, None] - b[None, :]
    rbf = sr**2 * np.exp(-(d**2) / (2 * lr**2))
    pk = sp**2 * np.exp(-2 * np.sin(np.pi * np.abs(d) / per) ** 2 / lp**2)
    return rbf + pk + sl**2 * a[:, None] * b[None, :]


def _gp_nlml(th: np.ndarray, x: np.ndarray, y: np.ndarray) -> float:
    sn = np.exp(th[6])
    K = _gp_kernel(x, x, th) + (sn**2 + 1e-8) * np.eye(len(x))
    try:
        L = np.linalg.cholesky(K)
    except np.linalg.LinAlgError:
        return 1e10
    alpha = np.linalg.solve(L.T, np.linalg.solve(L, y))
    return float(0.5 * y @ alpha + np.sum(np.log(np.diag(L))) + 0.5 * len(x) * np.log(2 * np.pi))


def fit_gp(y: np.ndarray, h: int, level: float, params: dict[str, float]):
    n = len(y)
    max_pts = int(params.get("max_points", 250))
    off = max(0, n - max_pts)
    tau_all = 2 * np.arange(n + h) / max(n - 1, 1) - 1
    x = tau_all[off:n]
    ys = y[off:]
    m, s = ys.mean(), ys.std() or 1.0
    yz = (ys - m) / s
    step = max(1, int(np.ceil(len(x) / 150)))
    xi, yi = x[::-1][::step][::-1], yz[::-1][::step][::-1]
    bounds = [(-7, 2.3), (-4.6, 1.6), (-9, 1.6), (-2.3, 2.3), (np.log(0.04), np.log(2)), (-9, 2.3), (-7, 0.7)]
    best = None
    for per in (0.5, 0.25, 1.0):
        th0 = np.log([1.0, 0.3, 0.3, 1.0, per, 0.5, 0.1])
        r = optimize.minimize(_gp_nlml, th0, args=(xi, yi), method="L-BFGS-B", bounds=bounds)
        if best is None or r.fun < best.fun:
            best = r
    th = best.x
    sn = np.exp(th[6])
    K = _gp_kernel(x, x, th) + (sn**2 + 1e-8) * np.eye(len(x))
    L = np.linalg.cholesky(K)
    alpha = np.linalg.solve(L.T, np.linalg.solve(L, yz))
    xs = tau_all[n:]
    Ks = _gp_kernel(xs, x, th)
    mu = Ks @ alpha
    v = np.linalg.solve(L, Ks.T)
    var = np.maximum(np.diag(_gp_kernel(xs, xs, th)) - np.sum(v**2, axis=0), 0) + sn**2
    z = _z(level)
    mean = m + s * mu
    sd = s * np.sqrt(var)
    names = ["sr", "lr", "sp", "lp", "period", "sl", "sn"]
    return (
        mean,
        np.maximum(mean - z * sd, 1e-9),
        mean + z * sd,
        {k: float(np.exp(t)) for k, t in zip(names, th)},
        {"logMarginalLikelihood": -float(_gp_nlml(th, x, yz)), "usedPoints": len(x)},
    )


# ─────────────────────────────── LSTM / TFT（選用） ───────────────────────────────


def fit_lstm(y: np.ndarray, h: int, level: float, params: dict[str, float]):
    if not HAS_TORCH:
        raise HTTPException(
            status_code=501,
            detail="LSTM 對照組需要 PyTorch（選用相依）。請 `pip install torch` 後重啟服務；前端會自動退回數學模型。",
        )
    torch.manual_seed(int(params.get("seed", 42)))
    r = np.diff(np.log(y))
    mu_r, sd_r = r.mean(), r.std() or 1.0
    rz = (r - mu_r) / sd_r
    look = int(params.get("lookback", 20))
    if len(rz) <= look + 10:
        raise HTTPException(status_code=422, detail="資料太短，無法訓練 LSTM")
    X = np.stack([rz[i : i + look] for i in range(len(rz) - look)])[:, :, None]
    Y = rz[look:]

    class Net(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.lstm = torch.nn.LSTM(1, int(params.get("hidden", 16)), batch_first=True)
            self.out = torch.nn.Linear(int(params.get("hidden", 16)), 1)

        def forward(self, x):
            o, _ = self.lstm(x)
            return self.out(o[:, -1, :]).squeeze(-1)

    net = Net()
    opt = torch.optim.Adam(net.parameters(), lr=1e-2)
    xt = torch.tensor(X, dtype=torch.float32)
    yt = torch.tensor(Y, dtype=torch.float32)
    for _ in range(int(params.get("epochs", 30))):
        opt.zero_grad()
        loss = torch.mean((net(xt) - yt) ** 2)
        loss.backward()
        opt.step()
    with torch.no_grad():
        resid_sd = float(torch.std(net(xt) - yt)) * sd_r
        window = list(rz[-look:])
        preds = []
        for _ in range(h):
            p = float(net(torch.tensor(np.array(window[-look:])[None, :, None], dtype=torch.float32)))
            preds.append(p * sd_r + mu_r)
            window.append(p)
    preds_pct = 100 * np.array(preds)
    var = np.full(h, (100 * resid_sd) ** 2)
    mean, lo, hi = _cum_return_forecast(float(y[-1]), preds_pct, var, level)
    return mean, lo, hi, {"lookback": look}, {"trainMse": float(loss), "note": "機器學習對照組，與數學模型同台受同一套基準檢驗"}


def fit_tft(*_: Any, **__: Any):
    raise HTTPException(
        status_code=501,
        detail=(
            "Temporal Fusion Transformer 是規格中的「可選」機器學習對照組，需要 pytorch-forecasting + lightning "
            "與 GPU 等級的訓練時間，未包含在本服務的預設安裝中。請改用 LSTM 對照組或數學模型。"
        ),
    )


# ─────────────────────────────── 路由 ───────────────────────────────


@app.get("/health")
def health() -> dict[str, Any]:
    import scipy
    import statsmodels

    return {
        "status": "ok",
        "versions": {"numpy": np.__version__, "scipy": scipy.__version__, "statsmodels": statsmodels.__version__},
        "optional": {"arch": HAS_ARCH, "torch": HAS_TORCH, "pytorch_forecasting": False},
        "models": ["arima", "holtwinters", "garch", "msar", "ucm", "gp", "lstm", "tft"],
    }


@app.post("/fit", response_model=FitResponse)
def fit(req: FitRequest) -> FitResponse:
    y = np.asarray(req.y, dtype=float)
    exog = np.asarray(req.exog, dtype=float) if req.exog else None
    dispatch = {
        "arima": lambda: fit_arima(y, req.h, req.level, req.params),
        "holtwinters": lambda: fit_holtwinters(y, req.h, req.level, req.params),
        "garch": lambda: fit_garch(y, req.h, req.level, req.params),
        "msar": lambda: fit_msar(y, req.h, req.level, req.params),
        "ucm": lambda: fit_ucm(y, req.h, req.level, req.params, exog),
        "gp": lambda: fit_gp(y, req.h, req.level, req.params),
        "lstm": lambda: fit_lstm(y, req.h, req.level, req.params),
        "tft": lambda: fit_tft(),
    }
    try:
        mean, lo, hi, params, diag = dispatch[req.model]()
    except HTTPException:
        raise
    except Exception as e:  # 數值失敗 → 422，讓 TS 端退回自身實作
        raise HTTPException(status_code=422, detail=f"{req.model} 擬合失敗：{e}") from e
    mean = np.asarray(mean, dtype=float)
    lo = np.minimum(np.asarray(lo, dtype=float), mean)
    hi = np.maximum(np.asarray(hi, dtype=float), mean)
    if not (np.all(np.isfinite(mean)) and np.all(np.isfinite(lo)) and np.all(np.isfinite(hi))):
        raise HTTPException(status_code=422, detail=f"{req.model} 產生非有限值")
    return FitResponse(
        model=req.model,
        mean=mean.tolist(),
        lower=lo.tolist(),
        upper=hi.tolist(),
        level=req.level,
        params=_clean(params),
        diagnostics=_clean(diag),
    )
