"""目錄的命名規則改了之後，把 files/ 裡已下載的檔案搬到新位置，並更新 download-log.jsonl。

只搬單一檔案的項目（資料夾展開下載的項目保持原位）。重複執行沒有副作用。

用法：
    .venv/bin/python tools/relocate.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch import CATALOG, FILES, LOG, ROOT, stem_for


def main() -> None:
    items = {i["id"]: i for i in map(json.loads, CATALOG.read_text(encoding="utf-8").splitlines()) if i}
    records = [json.loads(l) for l in LOG.read_text(encoding="utf-8").splitlines() if l.strip()]
    moved: dict[str, str] = {}
    for rec in records:
        if rec.get("status") != "ok" or rec["id"] not in items or len(rec["files"]) != 1:
            continue
        old = rec["files"][0]
        if old in moved:  # 共用檔案已經搬過
            rec["files"] = [moved[old]]
            continue
        src = ROOT / old
        dest = stem_for(items[rec["id"]]).with_suffix(src.suffix)
        if src.exists() and src != dest:
            dest.parent.mkdir(parents=True, exist_ok=True)
            src.rename(dest)
        new = str(dest.relative_to(ROOT))
        moved[old] = new
        rec["files"] = [new]
    LOG.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")
    for d in sorted(FILES.rglob("*"), reverse=True):  # 清掉搬空的資料夾
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()
    print(f"搬移 {sum(1 for o, n in moved.items() if o != n)} 個檔案")


if __name__ == "__main__":
    main()
