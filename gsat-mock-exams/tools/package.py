"""把某個學測年的檔案打包成 zip，內容相同的重複檔只留一份，並附上該年的目錄。

用法：
    .venv/bin/python tools/package.py 115 OUT_DIR [--max-mb 300]

超過 --max-mb 會拆成 _part1、_part2…（依考次資料夾切）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARCHIVES = {".zip", ".rar", ".7z"}
FILES = ROOT / "files"


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("year", type=int)
    ap.add_argument("out", type=Path)
    ap.add_argument("--max-mb", type=int, default=300)
    args = ap.parse_args()

    base = FILES / f"{args.year}學測"
    if not base.exists():
        print(f"沒有 {base}", file=sys.stderr)
        return 1
    # 只收下載紀錄裡完成的檔案（下載中的半截檔不收）
    log = ROOT / "catalog" / "download-log.jsonl"
    finished = {ROOT / f for line in log.read_text(encoding="utf-8").splitlines() if line.strip()
                for f in json.loads(line).get("files", []) if json.loads(line).get("status") == "ok"}
    extracted = ROOT / "catalog" / "extracted.json"
    if extracted.exists():  # tools/extract_archives.py 從 zip 解出來的檔案
        finished |= {ROOT / f for files in json.loads(extracted.read_text(encoding="utf-8")).values() for f in files}

    def wanted(p: Path) -> bool:
        # 壓縮檔本身不收（內容已解開另外去重）；分科測驗模擬考與社會科不在本專案範圍
        return (p.is_file() and p in finished and p.suffix.lower() not in ARCHIVES
                and not any(k in str(p.relative_to(base)) for k in ("分科", "社會")))

    # 檔名短、路徑淺的優先當代表，其他同內容的視為重複
    paths = sorted((p for p in base.rglob("*") if wanted(p)), key=lambda p: (len(p.parts), len(p.name), str(p)))
    seen: dict[str, Path] = {}
    dups: dict[Path, list[Path]] = defaultdict(list)
    for p in paths:
        digest = sha(p)
        if digest in seen:
            dups[seen[digest]].append(p)
        else:
            seen[digest] = p
    keep = sorted(seen.values())

    # 依考次資料夾分組，再裝箱成不超過 max-mb 的幾個 zip
    groups: dict[str, list[Path]] = defaultdict(list)
    for p in keep:
        groups[p.relative_to(base).parts[0]].append(p)
    limit = args.max_mb * 1024 * 1024
    # 一包放幾個考次；單一考次本身就超過上限時，照檔案切成幾段
    bins: list[list[tuple[str, list[Path]]]] = [[]]
    size = 0
    for series in sorted(groups):
        chunks: list[list[Path]] = [[]]
        csize = 0
        for p in groups[series]:
            if chunks[-1] and csize + p.stat().st_size > limit:
                chunks.append([])
                csize = 0
            chunks[-1].append(p)
            csize += p.stat().st_size
        for chunk in chunks:
            gsize = sum(p.stat().st_size for p in chunk)
            if bins[-1] and size + gsize > limit:
                bins.append([])
                size = 0
            bins[-1].append((series, chunk))
            size += gsize

    args.out.mkdir(parents=True, exist_ok=True)
    outputs = []
    for n, series_list in enumerate(bins, 1):
        name = f"{args.year}學測模擬考" + (f"_part{n}" if len(bins) > 1 else "") + ".zip"
        dest = args.out / name
        index = [f"# {args.year} 學測（{args.year - 1} 學年度模考）" + (f" 第 {n}/{len(bins)} 包" if len(bins) > 1 else ""), "",
                 "代號：E＝翰林（E2–E4 為北北基聯合模擬考／北模）、N＝南一、W＝文昌、B＝北模（臺北區）、G＝中模。",
                 "編號開頭是模考學年度，例如 114-E3＝114 學年度第 3 次翰林＝115 學測考生考的。", ""]
        with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_STORED) as zf:
            for series, chunk in series_list:
                index.append(f"## {series}")
                for p in chunk:
                    arc = Path(f"{args.year}學測") / p.relative_to(base)
                    zf.write(p, arc)
                    extra = f"（另有 {len(dups[p])} 份相同內容的副本未重複收錄）" if dups.get(p) else ""
                    index.append(f"- {p.relative_to(base / series)}{extra}")
                index.append("")
            zf.writestr(f"{args.year}學測/目錄.md", "\n".join(index))
        outputs.append(dest)
        print(dest, f"{dest.stat().st_size / 1e6:.0f} MB")
    print(json.dumps({"unique": len(keep), "duplicates": sum(len(v) for v in dups.values()), "zips": [str(o) for o in outputs]},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
