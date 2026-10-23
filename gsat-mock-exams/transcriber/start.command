#!/bin/bash
# macOS／Linux：雙擊或在終端機執行，第一次會自動建立環境並安裝套件
cd "$(dirname "$0")/.."
[ -d .venv-transcriber ] || python3 -m venv .venv-transcriber
.venv-transcriber/bin/pip install -q -r transcriber/requirements.txt
(sleep 2; open http://127.0.0.1:8765 2>/dev/null || xdg-open http://127.0.0.1:8765 2>/dev/null) &
.venv-transcriber/bin/python -m transcriber.app
