"""命令列批次轉錄：PDF 檔或資料夾（遞迴找 *.pdf）→ 一個 zip。

用法：
    python -m transcriber.cli 檔案或資料夾 [...] -o 輸出.zip [--no-ocr] [--force-ocr]
          [--no-split] [--page-images none|scanned|all] [--lang eng+chi_tra]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .core import HAS_OCR, Options, transcribe_many


def collect(paths: list[str]) -> list[Path]:
    out = []
    for p in map(Path, paths):
        out += sorted(p.rglob("*.pdf")) if p.is_dir() else [p]
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="學測模擬考 PDF → JSON＋附圖（zip）")
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("-o", "--out", default="transcription.zip")
    ap.add_argument("--no-ocr", action="store_true", help="掃描頁不做 OCR")
    ap.add_argument("--force-ocr", action="store_true", help="每頁都 OCR")
    ap.add_argument("--no-split", action="store_true", help="不依書籤切成多回")
    ap.add_argument("--page-images", choices=["none", "scanned", "all"], default="scanned")
    ap.add_argument("--lang", default="eng+chi_tra")
    args = ap.parse_args()

    files = collect(args.inputs)
    if not files:
        print("找不到 PDF", file=sys.stderr)
        return 1
    if not HAS_OCR and not args.no_ocr:
        print("提醒：沒有偵測到 Tesseract，掃描頁會標記 needs_ocr 並附整頁圖", file=sys.stderr)
    opts = Options(ocr=not args.no_ocr, force_ocr=args.force_ocr, ocr_lang=args.lang,
                   split_bookmarks=not args.no_split, page_images=args.page_images)

    def progress(name, done, total, title):
        print(f"\r{name}  {done}/{total} 頁  {title[:30]:<30}", end="", file=sys.stderr, flush=True)

    index = transcribe_many(((f.name, f) for f in files), Path(args.out), opts, progress)
    print(file=sys.stderr)
    for f in index["files"]:
        if "error" in f:
            print(f"✗ {f['file']}：{f['error']}")
            continue
        for e in f["exams"]:
            print(f"✓ {f['file']} › {e['title']}：{e['questions']} 題、答案 {e['answers_found']}、圖 {e['figures']}"
                  + (f"、OCR {e['ocr_pages']} 頁" if e["ocr_pages"] else "")
                  + ("".join(f"\n    ! {w}" for w in e["warnings"])))
    print(f"→ {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
