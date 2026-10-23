"""模考轉錄小工具網站（本機執行）。

    python -m transcriber.app [--port 8765]

瀏覽器開 http://localhost:8765，拖進 PDF（可多檔、可放總集大檔）或輸入本機資料夾路徑，
完成後下載 zip：每份 PDF 一個資料夾、每回一個 exam.json ＋ images/（題目附圖）＋ pages/（掃描頁整頁圖）。
檔案只在你自己的電腦上處理，不會上傳到其他地方。
"""
from __future__ import annotations

import argparse
import json
import shutil
import tempfile
import threading
import time
import uuid
import zipfile
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file

from .core import HAS_OCR, SCHEMA, Options, transcribe_many

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 ** 3  # 總集大檔也收（8 GB）
WORK = Path(tempfile.gettempdir()) / "gsat-transcriber"
WORK.mkdir(exist_ok=True)
JOBS: dict[str, dict] = {}
LOCK = threading.Lock()


def run_job(job_id: str, files: list[tuple[str, Path]], opts: Options) -> None:
    job = JOBS[job_id]

    def progress(name: str, done: int, total: int, title: str) -> None:
        with LOCK:
            f = job["files"][name]
            f.update(done=done, total=total, current=title, status="處理中")

    def inputs():
        for name, path in files:
            yield name, path
            with LOCK:
                job["files"][name]["status"] = "完成"

    try:
        index = transcribe_many(inputs(), job["zip"], opts, progress)
        with LOCK:
            for entry in index["files"]:
                f = job["files"][entry["file"]]
                if "error" in entry:
                    f.update(status="失敗", error=entry["error"])
                else:
                    f.update(status="完成", exams=entry["exams"])
            job.update(status="done", finished=time.time())
    except Exception as exc:  # noqa: BLE001
        with LOCK:
            job.update(status="error", error=f"{type(exc).__name__}: {exc}")
    finally:
        shutil.rmtree(job["upload_dir"], ignore_errors=True)


@app.post("/api/jobs")
def create_job():
    job_id = uuid.uuid4().hex[:12]
    upload_dir = WORK / job_id / "in"
    upload_dir.mkdir(parents=True)
    files: list[tuple[str, Path]] = []
    for fs in request.files.getlist("files"):
        name = Path(fs.filename or "upload.pdf").name
        if not name.lower().endswith(".pdf"):
            continue
        dest = upload_dir / f"{len(files):03d}_{name}"
        fs.save(dest)
        files.append((name, dest))
    folder = (request.form.get("folder") or "").strip()
    if folder:  # 本機資料夾：遞迴收 *.pdf，不複製檔案
        root = Path(folder).expanduser()
        if not root.exists():
            return jsonify(error=f"找不到資料夾或檔案：{folder}"), 400
        for p in (sorted(root.rglob("*.pdf")) if root.is_dir() else [root]):
            files.append((str(p.relative_to(root.parent)) if root.is_dir() else p.name, p))
    if not files:
        shutil.rmtree(WORK / job_id, ignore_errors=True)
        return jsonify(error="沒有收到 PDF。請拖進 .pdf 檔，或輸入含有 PDF 的資料夾路徑。"), 400
    names = {}
    for name, path in files:  # 同名檔加編號，避免結果互相覆蓋
        key, n = name, 2
        while key in names:
            key = f"{Path(name).stem}_{n}{Path(name).suffix}"
            n += 1
        names[key] = path
    files = list(names.items())
    opts = Options(
        ocr=request.form.get("ocr", "1") == "1",
        force_ocr=request.form.get("force_ocr") == "1",
        ocr_lang=request.form.get("lang") or "eng+chi_tra",
        split_bookmarks=request.form.get("split", "1") == "1",
        page_images=request.form.get("page_images") or "scanned",
    )
    JOBS[job_id] = {
        "id": job_id, "status": "running", "created": time.time(), "zip": WORK / job_id / "transcription.zip",
        "upload_dir": upload_dir, "options": opts.__dict__,
        "files": {name: {"file": name, "status": "排隊中", "done": 0, "total": 0, "current": ""} for name, _ in files},
    }
    threading.Thread(target=run_job, args=(job_id, files, opts), daemon=True).start()
    return jsonify(id=job_id)


@app.get("/api/jobs/<job_id>")
def job_status(job_id: str):
    job = JOBS.get(job_id) or abort(404)
    with LOCK:
        return jsonify({k: (str(v) if isinstance(v, Path) else v) for k, v in job.items() if k != "upload_dir"}
                       | {"files": list(job["files"].values())})


@app.get("/api/jobs/<job_id>/download")
def download(job_id: str):
    job = JOBS.get(job_id) or abort(404)
    if job["status"] != "done":
        abort(409)
    return send_file(job["zip"], as_attachment=True, download_name=f"transcription-{job_id}.zip")


@app.get("/api/jobs/<job_id>/file")
def zipped_file(job_id: str):
    """從結果 zip 讀單一檔案（預覽 exam.json 或附圖）。"""
    job = JOBS.get(job_id) or abort(404)
    path = request.args.get("path", "")
    with zipfile.ZipFile(job["zip"]) as zf:
        if path not in zf.namelist():
            abort(404)
        data = zf.read(path)
    mime = "application/json" if path.endswith(".json") else "image/png"
    return app.response_class(data, mimetype=mime)


@app.get("/api/info")
def info():
    return jsonify(ocr=HAS_OCR, schema=SCHEMA)


@app.get("/")
def index():
    return app.send_static_file("index.html")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    print(f"模考轉錄工具：http://{args.host}:{args.port}  （OCR {'可用' if HAS_OCR else '未安裝，掃描頁只附整頁圖'}）")
    app.run(host=args.host, port=args.port, threaded=True)


if __name__ == "__main__":
    main()
