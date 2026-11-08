"""pytest：python -m pytest services/py -q"""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from main import app, HAS_TORCH

client = TestClient(app)


def _prices(n: int = 300, seed: int = 1) -> list[float]:
    rng = np.random.default_rng(seed)
    r = rng.normal(0.0003, 0.012, n - 1)
    return (100 * np.exp(np.concatenate([[0], np.cumsum(r)]))).tolist()


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok"
    assert "arima" in j["models"]


@pytest.mark.parametrize("model", ["arima", "holtwinters", "garch", "msar", "ucm", "gp"])
def test_fit_models(model):
    h = 7
    r = client.post("/fit", json={"model": model, "y": _prices(), "h": h, "level": 0.9})
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["mean"]) == h and len(j["lower"]) == h and len(j["upper"]) == h
    assert all(lo <= m <= hi for lo, m, hi in zip(j["lower"], j["mean"], j["upper"]))
    assert j["level"] == 0.9


def test_garch_scipy_fallback_and_interval_growth():
    r = client.post("/fit", json={"model": "garch", "y": _prices(400), "h": 10, "params": {"force_scipy": 1}})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["diagnostics"]["engine"] == "scipy"
    assert j["params"]["alpha"] + j["params"]["beta"] < 1
    assert j["upper"][-1] - j["lower"][-1] > j["upper"][0] - j["lower"][0]


def test_ucm_with_exog_recovers_beta():
    rng = np.random.default_rng(3)
    n = 250
    x = rng.normal(0, 1, n)
    ly = np.log(100) + np.cumsum(rng.normal(0, 0.005, n)) + 0.05 * x + rng.normal(0, 0.002, n)
    r = client.post("/fit", json={"model": "ucm", "y": np.exp(ly).tolist(), "h": 5, "exog": [[v] for v in x]})
    assert r.status_code == 200, r.text
    beta = [v for k, v in r.json()["params"].items() if k.startswith("beta")]
    assert abs(beta[0] - 0.05) < 0.01


def test_msar_regime_probs():
    r = client.post("/fit", json={"model": "msar", "y": _prices(400), "h": 5, "params": {"regimes": 2}})
    assert r.status_code == 200, r.text
    probs = r.json()["diagnostics"]["regimeProbs"]
    assert abs(sum(probs) - 1) < 1e-6


def test_lstm_optional():
    r = client.post("/fit", json={"model": "lstm", "y": _prices(), "h": 3, "params": {"epochs": 3}})
    assert r.status_code == (200 if HAS_TORCH else 501)
    if not HAS_TORCH:
        assert "PyTorch" in r.json()["detail"]


def test_tft_placeholder():
    r = client.post("/fit", json={"model": "tft", "y": _prices(), "h": 3})
    assert r.status_code == 501
    assert "pytorch-forecasting" in r.json()["detail"]


def test_validation():
    assert client.post("/fit", json={"model": "arima", "y": [1, 2, -3] * 10, "h": 3}).status_code == 422
    assert client.post("/fit", json={"model": "nope", "y": _prices(), "h": 3}).status_code == 422
    assert client.post("/fit", json={"model": "ucm", "y": _prices(50), "h": 3, "exog": [[1.0]] * 10}).status_code == 422
