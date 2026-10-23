"""依 catalog/catalog.jsonl 下載公開的模擬考檔案，整理到 files/。

只處理公開可存取的來源：一般網址直接下載；Google 雲端硬碟公開分享的檔案先用
requests 走 uc?export=download（含大檔確認頁），失敗再用 Playwright 無頭瀏覽器
開分享頁按「下載」。需要登入的項目（catalog 的 access 為 login）一律略過。

用法：
    .venv/bin/python tools/fetch.py              # 下載尚未下載的項目
    .venv/bin/python tools/fetch.py --only 115   # 只下載某學年度
    .venv/bin/python tools/fetch.py --dry-run
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "catalog" / "catalog.jsonl"
FILES = ROOT / "files"
LOG = ROOT / "catalog" / "download-log.jsonl"
CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0 Safari/537.36")

session = requests.Session()
session.headers["User-Agent"] = UA

GDRIVE_ID = re.compile(r"(?:/d/|[?&]id=)([A-Za-z0-9_-]{20,})")


def safe(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|\s]+', "_", name).strip("_")[:120]


def target_dir(item: dict) -> Path:
    # files/114學測/翰林_全模_E1/英文/（year 是學測年，見 build_catalog.py）
    series = safe(item.get("series") or "未知")
    year = f"{item['year']}學測" if item.get("year") else "年度不明"
    return FILES / year / series / safe(item.get("subject") or "全科")


def ext_from(resp: requests.Response, url: str) -> str:
    cd = resp.headers.get("content-disposition", "")
    m = re.search(r"filename\*?=(?:UTF-8'')?\"?([^\";]+)", cd)
    name = unquote(m.group(1)) if m else unquote(Path(urlparse(url).path).name)
    suffix = Path(name).suffix.lower()
    if suffix in {".pdf", ".zip", ".rar", ".7z", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".xlsx", ".xls", ".odt"}:
        return suffix
    ctype = resp.headers.get("content-type", "")
    for key, ext in (("pdf", ".pdf"), ("zip", ".zip"), ("jpeg", ".jpg"), ("png", ".png"), ("webp", ".webp"),
                     ("wordprocessingml", ".docx"), ("msword", ".doc"), ("spreadsheetml", ".xlsx")):
        if key in ctype:
            return ext
    return ".bin"


def looks_like_html(path: Path) -> bool:
    head = path.read_bytes()[:512].lstrip().lower()
    return head.startswith(b"<!doctype html") or head.startswith(b"<html")


NAME_LOCK = threading.Lock()


def reserve(dest: Path) -> Path:
    """同資料夾已有同名檔就加 _2、_3…，避免不同來源互相覆蓋。"""
    with NAME_LOCK:
        dest.parent.mkdir(parents=True, exist_ok=True)
        n, cand = 1, dest
        while cand.exists():
            n += 1
            cand = dest.with_name(f"{dest.stem}_{n}{dest.suffix}")
        cand.touch()
        return cand


def save_stream(resp: requests.Response, dest_stem: Path, url: str) -> Path:
    dest = reserve(dest_stem.with_suffix(ext_from(resp, url)))
    with open(dest, "wb") as fh:
        for chunk in resp.iter_content(1 << 16):
            fh.write(chunk)
    return dest


def fetch_direct(url: str, dest_stem: Path) -> Path:
    resp = session.get(url, stream=True, timeout=60, allow_redirects=True)
    resp.raise_for_status()
    return save_stream(resp, dest_stem, url)


def fetch_gdrive_requests(file_id: str, dest_stem: Path) -> Path:
    url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download"
    resp = session.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    if "text/html" in resp.headers.get("content-type", ""):
        # 大檔會先回「無法掃描病毒」確認頁，表單帶 confirm 與 uuid
        html = resp.text
        params = dict(re.findall(r'name="(\w+)" value="([^"]*)"', html))
        if "confirm" not in params:
            raise RuntimeError("Google 雲端硬碟回傳網頁而非檔案（可能未公開分享）")
        resp = session.get("https://drive.usercontent.google.com/download",
                           params=params, stream=True, timeout=120)
        resp.raise_for_status()
    return save_stream(resp, dest_stem, url)


BROWSER_LOCK = threading.Lock()  # Playwright 同步 API 一次只開一個瀏覽器


def fetch_gdrive_browser(file_id: str, dest_stem: Path) -> Path:
    from playwright.sync_api import sync_playwright

    with BROWSER_LOCK, sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=CHROMIUM)
        page = browser.new_page(accept_downloads=True, user_agent=UA)
        page.goto(f"https://drive.google.com/file/d/{file_id}/view", timeout=60000)
        with page.expect_download(timeout=120000) as info:
            page.goto(f"https://drive.google.com/uc?export=download&id={file_id}", timeout=60000)
            # 確認頁上的「仍要下載」按鈕
            btn = page.locator("#uc-download-link, form#download-form [type=submit]")
            if btn.count():
                btn.first.click()
        download = info.value
        suffix = Path(download.suggested_filename).suffix.lower() or ".bin"
        dest = reserve(dest_stem.with_suffix(suffix))
        download.save_as(dest)
        browser.close()
    return dest


def list_gdrive_folder(folder_id: str) -> list[tuple[str, str]]:
    """公開資料夾的 (檔名, file id)；子資料夾以 'folder:' 前綴標記。"""
    html = session.get(f"https://drive.google.com/embeddedfolderview?id={folder_id}", timeout=60).text
    out = []
    for href, title in re.findall(
            r'<a href="([^"]+)"[^>]*>.*?<div class="flip-entry-title">([^<]+)</div>', html, re.S):
        if "/folders/" in href:
            out.append((title, "folder:" + href.rsplit("/", 1)[-1].split("?")[0]))
        elif m := GDRIVE_ID.search(href):
            out.append((title, m.group(1)))
    return out


def stem_for(item: dict) -> Path:
    base = f"{item.get('doc_type') or '檔案'}"
    if item.get("label"):
        base += "_" + item["label"]
    return target_dir(item) / safe(base)


def download(item: dict) -> list[Path]:
    url = item["url"]
    kind = item.get("url_type")
    stem = stem_for(item)
    if kind == "gdrive_folder" and (m := re.search(r"folders/([A-Za-z0-9_-]+)|id=([A-Za-z0-9_-]+)", url)):
        paths = []
        for title, fid in list_gdrive_folder(m.group(1) or m.group(2)):
            if fid.startswith("folder:"):
                sub = dict(item, url=f"https://drive.google.com/drive/folders/{fid[7:]}",
                           series=item.get("series"), subject=safe(title))
                paths += download(sub)
                continue
            fstem = target_dir(item) / safe(Path(title).stem)
            paths.append(fetch_gdrive(fid, fstem))
        return paths
    if "drive.google.com" in url or "docs.google.com" in url:
        m = GDRIVE_ID.search(url)
        if not m:
            raise RuntimeError("無法從網址取得 Google 雲端硬碟 file id")
        return [fetch_gdrive(m.group(1), stem)]
    return [fetch_direct(url, stem)]


def fetch_gdrive(file_id: str, stem: Path) -> Path:
    try:
        path = fetch_gdrive_requests(file_id, stem)
        if not looks_like_html(path):
            return path
        path.unlink()
    except Exception:
        pass
    return fetch_gdrive_browser(file_id, stem)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="只下載某學年度")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=6, help="同時下載數")
    args = ap.parse_args()

    done = set()
    by_url: dict[str, list[str]] = {}  # 同一份檔案（例如各科共用的級距表）只下載一次
    if LOG.exists():
        for line in LOG.read_text(encoding="utf-8").splitlines():
            rec = json.loads(line)
            if rec.get("status") == "ok":
                done.add(rec["id"])
                by_url[rec["url"]] = rec["files"]

    items = [json.loads(l) for l in CATALOG.read_text(encoding="utf-8").splitlines() if l.strip()]
    todo: dict[str, list[dict]] = {}  # url → 用到這個網址的項目
    skip = 0
    for item in items:
        if args.only and str(item.get("year")) != args.only:
            continue
        if (item["id"] in done or item.get("access") == "login" or item.get("url_type") == "html_page"
                or not item["url"].startswith("http")):
            skip += 1
            continue
        todo.setdefault(item["url"], []).append(item)
    if args.dry_run:
        for url, group in todo.items():
            print("would fetch", group[0]["id"], url)
        return 0

    def work(group: list[dict]) -> tuple[list[dict], dict]:
        item = group[0]
        if item["url"] in by_url:
            return group, {"status": "ok", "files": by_url[item["url"]], "shared": True}
        try:
            paths = download(item)
            bad = [p for p in paths if looks_like_html(p)]
            if bad:
                raise RuntimeError(f"下載到的是網頁不是檔案：{bad[0].name}")
            return group, {"status": "ok", "files": [str(p.relative_to(ROOT)) for p in paths],
                           "sha256": [hashlib.sha256(p.read_bytes()).hexdigest() for p in paths]}
        except Exception as exc:  # 個別失敗不中斷整批
            return group, {"status": "error", "error": f"{type(exc).__name__}: {exc}"}

    ok = fail = 0
    with open(LOG, "a", encoding="utf-8") as log, ThreadPoolExecutor(args.workers) as pool:
        # 新的學測年先下載，每年之內整包壓縮檔（多半是單檔的重複）排最後
        order = sorted(todo.values(), key=lambda g: (-(g[0].get("year") or 0),
                                                     g[0].get("url_type") == "zip" or g[0].get("doc_type") == "其他"))
        for group, result in map(Future.result, as_completed(pool.submit(work, g) for g in order)):
            for n, item in enumerate(group):  # 同網址的其他項目共用同一份檔案
                rec = {"id": item["id"], "url": item["url"], "time": time.strftime("%Y-%m-%dT%H:%M:%S"), **result}
                if n:
                    rec["shared"] = True
                log.write(json.dumps(rec, ensure_ascii=False) + "\n")
                ok += result["status"] == "ok"
                fail += result["status"] != "ok"
            log.flush()
            if result["status"] == "ok":
                print("ok  ", group[0]["id"], *result["files"], flush=True)
            else:
                print("FAIL", group[0]["id"], result["error"], file=sys.stderr, flush=True)
    print(f"完成：成功 {ok}、失敗 {fail}、略過 {skip}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
