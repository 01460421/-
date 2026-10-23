@echo off
rem Windows：雙擊執行，第一次會自動建立環境並安裝套件
cd /d "%~dp0\.."
if not exist .venv-transcriber python -m venv .venv-transcriber
.venv-transcriber\Scripts\pip install -q -r transcriber\requirements.txt
start "" http://127.0.0.1:8765
.venv-transcriber\Scripts\python -m transcriber.app
