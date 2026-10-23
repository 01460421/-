"""從使用者的歷年模考總資料夾（research/gdrive-archive-1jy.jsonl、gdrive-user-14YW.jsonl）自動產生成冊選檔，
寫到 books/selection/zz_archive.json。檔名排在代理挑選的 g1xx.json 之後，build_books 會優先採用這份，
這份缺的欄位（例如某科沒有詳解）才用代理挑的補。

這兩個資料夾的檔案是出版社電子檔、按科目分好，所以用檔名規則判斷就夠：
- 「題目／內頁／封面／科.pdf」是題本，「解答／詳解」是詳解
- 南一一科一檔（「…與詳解」或「第N次模擬考-科目」）視為題本＋詳解合訂（combined）
- 從 zip 解出的檔（113-E4、112-B1）依檔名再分一次
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from import_archive_folder import subject_of  # noqa: E402

SOURCES = ("1jy-k5u6Jwq0ksT5byGAG7zsjoAGudK4O", "14YWPUeu68OJ_4N6tiM2wvf28tgB8V45v")
# 使用者最早給的雲端資料夾：只在上面兩個都沒有該科時才用（目前用來補南一的社會科）
FALLBACK = "1li7cmzCMYTE0HKneDxi2otTZ2BUCndJL"
SKIP = ("R1", "高二", "英聽", "聽力", "探究", "合科", "封底")


def kind(name: str) -> str:
    if any(k in name for k in ("與詳解", "含詳解", "含解答", "試題&詳解", "試題＆詳解")):
        return "combined"
    if any(k in name for k in ("解答", "詳解")):
        return "a"
    return "q"


def main() -> None:
    cat = {json.loads(l)["id"]: json.loads(l) for l in open(ROOT / "catalog/catalog.jsonl", encoding="utf-8")}
    files: list[tuple[str, str, str]] = []  # (series, 檔名, 路徑)
    for line in open(ROOT / "catalog/download-log.jsonl", encoding="utf-8"):
        r = json.loads(line)
        c = cat.get(r["id"])
        src = c.get("source_page") or "" if c else ""
        if r["status"] != "ok" or not c or not any(s in src for s in SOURCES + (FALLBACK,)):
            continue
        for f in r["files"]:
            files.append((c["series"], Path(f).name, f, FALLBACK in src))
    extracted = json.loads((ROOT / "catalog/extracted.json").read_text(encoding="utf-8"))
    archive_zips = {f for _, _, f, _ in files if f.endswith(".zip")}
    for z, inner in extracted.items():
        if z in archive_zips:
            series = Path(z).parts[2]
            files += [(series, Path(f).name, f, False) for f in inner]

    slots: dict[tuple[str, str], dict] = defaultdict(lambda: {"q": [], "a": [], "combined": False})
    primary = {(s, subject_of(n) or subject_of(Path(p).parts[3] if len(Path(p).parts) > 4 else ""))
               for s, n, p, fb in files if not fb}
    for series, name, path, fallback in sorted(set(files)):
        if not path.lower().endswith(".pdf") or any(k in name for k in SKIP):
            continue
        folder = Path(path).parts[3] if len(Path(path).parts) > 4 else ""
        subject = subject_of(name) or subject_of(folder)
        if not subject or subject == "全科":
            continue
        if fallback and (series, subject) in primary:
            continue
        k = kind(name)
        slot = slots[(series, subject)]
        if k == "combined" or (series[4] == "N" and k == "q" and "題目" not in name and "內頁" not in name):
            slot["q"].append(path)
            slot["combined"] = True
        else:
            slot[k].append(path)
    out = []
    for (series, subject), s in sorted(slots.items()):
        # 同一格另有詳解檔時，題本就不是合訂檔；答案卡排在題本後面
        s["combined"] = s["combined"] and not s["a"]
        s["q"].sort(key=lambda f: ("答案卡" in f, f))
        out.append({"series": series, "subject": subject, "q": s["q"], "a": s["a"], "combined": s["combined"],
                    "quality": "原始PDF", "notes": "使用者提供之歷年模考總資料夾"})
    dest = ROOT / "books/selection/zz_archive.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)} 筆 → {dest.relative_to(ROOT)}")
    for o in out:
        if not o["q"] or (not o["a"] and not o["combined"]) or len(o["q"]) > 1 or len(o["a"]) > 1:
            print("  檢查：", o["series"], o["subject"], "q", [Path(x).name for x in o["q"]], "a", [Path(x).name for x in o["a"]])


if __name__ == "__main__":
    main()
