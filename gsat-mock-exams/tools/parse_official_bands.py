"""讀官方「原始分數與級分對照表」（B200，PDF 文字層或 xls／xlsx），輸出 bands/raw/official.jsonl。

每個科目一行：級距、各級分的原始分數下限、滿分、考試日期與標題。這份表是成績統計（事實資料），
社會科也一起讀。與 bands/raw 其他判讀檔一起交給 build_bands.py 合併；有完整對照表的這份會優先採用。

用法：
    .venv/bin/python tools/parse_official_bands.py
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "bands" / "raw" / "official.jsonl"
SUBJECTS = ["國文", "英文", "數學A", "數學B", "數學", "自然", "社會"]
SERIES_RE = re.compile(r"^\d{3}-[ENWBG]\d_")


def from_rows(rows: list[list[str]], meta: dict) -> list[dict]:
    """rows：表格每列的儲存格文字。找出科目標題列、0–15 級分列、級距列。"""
    head = next((r for r in rows if r and str(r[0]).strip() == "級分"), None)
    if not head:
        return []
    # 標題列可能把「數學A」拆成「數學 A」或用全形字母，先正規化再依序找科目名
    header = unicodedata.normalize("NFKC", " ".join(str(c) for c in head[1:]))
    subjects = [s.replace(" ", "") for s in re.findall(r"國文|英文|數學\s*[AB]|數學|自然|社會", header)]
    lows: dict[str, dict[int, float]] = {s: {} for s in subjects}
    highs: dict[str, float] = {}
    band: dict[str, float] = {}
    for r in rows:
        first = str(r[0]).strip()
        nums = [float(x) for x in re.findall(r"\d+\.\d+|\d+", " ".join(str(c) for c in r[1:]))]
        if first in ("級距",) and len(nums) >= len(subjects):
            band = dict(zip(subjects, nums))
            continue
        if not re.fullmatch(r"\d{1,2}(\.0)?", first):
            continue
        level = int(float(first))
        if level == 0 or level > 15:
            continue
        pairs = nums[:2 * len(subjects)]
        if len(pairs) < 2 * len(subjects):
            continue
        for k, s in enumerate(subjects):
            lows[s][level] = pairs[2 * k]
            if level == 15:
                highs[s] = pairs[2 * k + 1]
    out = []
    for s in subjects:
        if len(lows[s]) < 14:
            continue
        rec = {**meta, "subject": s, "thresholds": {str(k): v for k, v in sorted(lows[s].items())}}
        if s in band:
            rec["band"] = band[s]
        elif 2 in lows[s]:
            rec["band"] = lows[s][2]  # 沒有級距列時，2 級分下限＝級距（兩位小數）
        if s in highs:
            rec["full_score"] = highs[s]
        out.append(rec)
    return out


def meta_from_text(text: str, path: Path) -> dict:
    title = next((ln.strip() for ln in text.splitlines() if "模擬考試" in ln or "複習考試" in ln), "")
    date = re.search(r"考試日期[:：]\s*(\d{4}/\d{1,2}/\d{1,2})", text)
    return {"exam": path.parts[path.parts.index("files") + 2], "gsat_year": int(path.parts[path.parts.index("files") + 1][:3]),
            "title": title, "exam_date": date.group(1) if date else None,
            "source": str(path.relative_to(ROOT)), "notes": "官方原始分數與級分對照表（B200）"}


def parse_pdf(path: Path) -> list[dict]:
    with pdfplumber.open(path) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    rows = []
    for ln in text.splitlines():
        parts = ln.split()
        if parts:
            rows.append([parts[0], " ".join(parts[1:])])
            if parts[0] == "級分":
                rows[-1] = parts
    return from_rows(rows, meta_from_text(text, path))


def parse_excel(path: Path) -> list[dict]:
    if path.suffix.lower() == ".xls":
        import xlrd
        sh = xlrd.open_workbook(str(path)).sheet_by_index(0)
        rows = [[str(v).strip() for v in sh.row_values(i)] for i in range(sh.nrows)]
    else:
        import openpyxl
        sh = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
        rows = [["" if v is None else str(v).strip() for v in r] for r in sh.iter_rows(values_only=True)]
    text = "\n".join(" ".join(r) for r in rows)
    # 標題列（科目名）中間有空欄，壓成一格一科
    fixed = []
    for r in rows:
        if r and r[0] == "級分":
            fixed.append(["級分"] + [c for c in r[1:] if c])
        else:
            fixed.append([r[0] if r else "", " ".join(c for c in r[1:] if c and c != "＜X≦" and c != "X=")])
    return from_rows(fixed, meta_from_text(text, path))


def main() -> None:
    log = [json.loads(l) for l in open(ROOT / "catalog/download-log.jsonl", encoding="utf-8")]
    files = {ROOT / f for r in log if r["status"] == "ok" for f in r["files"]}
    extracted = json.loads((ROOT / "catalog/extracted.json").read_text(encoding="utf-8"))
    files |= {ROOT / f for fs in extracted.values() for f in fs}
    out, seen = [], set()
    for p in sorted(files):
        name = p.name
        if not p.exists() or not ("對照表" in name or "B200" in name):
            continue
        if p.suffix.lower() not in (".pdf", ".xls", ".xlsx"):
            continue
        rel = p.relative_to(ROOT)
        if len(rel.parts) < 4 or not SERIES_RE.match(rel.parts[2]):
            continue
        try:
            recs = parse_pdf(p) if p.suffix.lower() == ".pdf" else parse_excel(p)
        except Exception as exc:  # noqa: BLE001
            print("無法讀取", rel, exc)
            continue
        for r in recs:
            key = (r["exam"], r["subject"])
            if key in seen:
                continue
            seen.add(key)
            out.append(r)
    OUT.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in out), encoding="utf-8")
    exams = sorted({r["exam"] for r in out})
    print(f"{len(out)} 筆（{len(exams)} 場考試）→ {OUT.relative_to(ROOT)}")
    print("考次：", " ".join(exams))


if __name__ == "__main__":
    main()
