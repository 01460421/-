"""把 files/ 裡下載完成的 .zip 解開到同層「<壓縮檔名>_解壓/」，讓裡面的 PDF 也能去重、打包。

- 只處理 download-log 記錄為完成的 zip；解出的檔案清單寫到 catalog/extracted.json。
- 台灣常見的 zip 檔名是 Big5（cp950），沒有 UTF-8 標記時改用 cp950 解碼。
- 防路徑穿越：只取各層名稱、去掉 .. 與絕對路徑。
- .rar／.7z 這個環境沒有解壓工具，略過並列出。

用法：
    .venv/bin/python tools/extract_archives.py
"""
from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "catalog" / "download-log.jsonl"
OUT = ROOT / "catalog" / "extracted.json"
CODE_IN_NAME = re.compile(r"(1\d\d)[-_ ]?([ENWBG][1-6])")
PROVIDER = {"E": "翰林", "N": "南一", "W": "文昌", "B": "北模", "G": "中模"}


def member_name(info: zipfile.ZipInfo) -> str:
    if info.flag_bits & 0x800:
        return info.filename
    raw = info.filename.encode("cp437", errors="replace")
    for enc in ("utf-8", "cp950"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return info.filename


def safe_parts(name: str) -> list[str]:
    parts = [p for p in PurePosixPath(name.replace("\\", "/")).parts if p not in ("", ".", "..", "/")]
    return [re.sub(r'[:*?"<>|]', "_", p) for p in parts]


def main() -> None:
    finished = [f for line in LOG.read_text(encoding="utf-8").splitlines() if line.strip()
                for f in json.loads(line).get("files", []) if json.loads(line).get("status") == "ok"]
    done = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    skipped = []
    for rel in sorted(set(finished)):
        src = ROOT / rel
        if rel in done or not src.exists():
            continue
        if src.suffix.lower() in (".rar", ".7z"):
            skipped.append(rel)
            continue
        if src.suffix.lower() != ".zip":
            continue
        dest = src.with_name(src.stem + "_解壓")
        # 壓縮檔名寫了代號（例如 113E2第二次…）而所在資料夾是別的考次時，解到正確的考次底下
        if m := CODE_IN_NAME.search(src.stem):
            year_dir = next(a for a in src.parents if a.parent.name == "files")
            dest = year_dir / f"{m.group(1)}-{m.group(2)}_{PROVIDER[m.group(2)[0]]}" / "全科" / (src.stem + "_解壓")
        out = []
        try:
            with zipfile.ZipFile(src) as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    parts = safe_parts(member_name(info))
                    if not parts or parts[0] == "__MACOSX" or parts[-1].startswith("._"):
                        continue
                    target = dest.joinpath(*parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(info) as fin, open(target, "wb") as fout:
                        while chunk := fin.read(1 << 20):
                            fout.write(chunk)
                    out.append(str(target.relative_to(ROOT)))
        except zipfile.BadZipFile as exc:
            print("壞檔", rel, exc)
            continue
        done[rel] = out
        print(f"{rel} → {len(out)} 個檔")
    OUT.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
    if skipped:
        print("沒有工具可解、略過：", *skipped, sep="\n  ")


if __name__ == "__main__":
    main()
