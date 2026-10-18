"""把各來源的調查結果（JSON Lines）合併、正規化、去重，輸出 catalog/catalog.jsonl 與 INDEX.md。

用法：
    .venv/bin/python tools/build_catalog.py research/*.jsonl
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "catalog" / "catalog.jsonl"
INDEX = ROOT / "INDEX.md"

SUBJECTS = {
    "國文": "國文", "國語文": "國文", "國寫": "國寫", "國語文寫作": "國寫", "國文寫作": "國寫",
    "英文": "英文", "英語": "英文",
    "數學a": "數學A", "數a": "數學A", "數學b": "數學B", "數b": "數學B", "數學": "數學",
    "自然": "自然", "社會": "社會", "全科": "全科",
}
DOC_TYPES = ["試題", "答案卡", "答案卷", "解答", "詳解", "非選參考答案", "級距", "其他"]
LOGIN_HINTS = ("需登入", "教師帳號", "會員", "登入後", "需要登入", "限教師")


def norm_subject(s: str | None) -> str:
    key = (s or "全科").strip().lower().replace(" ", "")
    for k, v in SUBJECTS.items():
        if key.startswith(k):
            return v
    return s or "全科"


def norm_doc(s: str | None) -> str:
    s = (s or "").strip()
    for t in DOC_TYPES:
        if t in s:
            return t
    if "答案" in s:
        return "解答"
    if any(k in s for k in ("五標", "級分", "人數百分比", "成績分布", "落點")):
        return "級距"
    return "其他"


CODE_PROVIDER = {"E": "翰林", "N": "南一", "W": "文昌", "B": "北模", "G": "中模"}
CODE_RE = re.compile(r"(?<![A-Za-z])([ENWBG])\s*([1-9])(?!\d)")


def norm_series(series: str, school_year: int | None, *hints: str) -> str:
    """不同來源對同一場考試的寫法統一成「模考學年度-代號_命題單位」，例如 114-E2_翰林。

    只有在名稱或備註裡明確寫出代號（E2、N3…）時才改寫，猜不到就保留原名。
    """
    for text in (series, *hints):
        if school_year and (m := CODE_RE.search(text or "")):
            return f"{school_year}-{m.group(1)}{m.group(2)}_{CODE_PROVIDER[m.group(1)]}"
    # 沒寫代號但寫了「第 X 次」：南一是 N 系列；翰林與 113 學年度起的北北基／北模是翰林 E 系列，
    # 且「第 X 次」照全年的次數算（北北基第一場＝E2），與 E 的編號一致
    m = ROUND_RE.search(series)
    if school_year and m:
        n = ROUND_NUM.get(m.group(1), m.group(1))
        if "南一" in series:
            return f"{school_year}-N{n}_南一"
        if "翰林" in series or (school_year >= 113 and any(k in series for k in ("北北基", "北模"))):
            return f"{school_year}-E{n}_翰林"
        if "文昌" in series and "本校" not in series:
            return f"{school_year}-W{n}_文昌"
        if "北模" in series and "北北基" not in series and school_year <= 112:  # 112 學年度以前臺北區自辦 B1、B2
            return f"{school_year}-B{n}_北模"
    if school_year and ("中模" in series or "中1" in series or "中區" in series) and "合卷" not in series:
        return f"{school_year}-G1_中模"
    return series


ROUND_RE = re.compile(r"第\s*([1-4一二三四])\s*次")
ROUND_NUM = {"一": "1", "二": "2", "三": "3", "四": "4"}


def norm_url(u: str) -> str:
    u = u.strip()
    if m := re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:export=download&)?id=)([A-Za-z0-9_-]{20,})", u):
        return f"https://drive.google.com/file/d/{m.group(1)}/view"
    if m := re.search(r"drive\.google\.com/drive/(?:u/\d+/)?folders/([A-Za-z0-9_-]{10,})", u):
        return f"https://drive.google.com/drive/folders/{m.group(1)}"
    return u


def main(paths: list[str]) -> None:
    merged: dict[str, dict] = {}
    for path in paths:
        source = Path(path).stem
        for n, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                print(f"略過壞行 {path}:{n}", file=sys.stderr)
                continue
            if not raw.get("url"):
                continue
            # year 一律是學測年（民國）；模考學年度＝學測年－1（113 學年度的模考是 114 學測考生考的）
            year = raw.get("year")
            year = int(year) if str(year or "").isdigit() else None
            if year and raw.get("year_basis") == "school_year":
                year += 1
            item = {
                "year": year,
                "school_year": year - 1 if year else None,
                "series": (raw.get("series") or "").strip() or "未知",
                "provider": raw.get("provider") or "未知",
                "round": raw.get("round"),
                "subject": norm_subject(raw.get("subject")),
                "doc_type": norm_doc(raw.get("doc_type")),
                "label": raw.get("label") or "",
                "url": norm_url(raw["url"]),
                "url_type": raw.get("url_type") or "other",
                "source_page": raw.get("source_page"),
                "verified": raw.get("verified") or "unverified",
                "notes": raw.get("notes") or "",
                "found_by": [source],
            }
            item["series"] = norm_series(item["series"], item["school_year"], item["label"])
            if "drive.google.com/drive/folders" in item["url"]:
                item["url_type"] = "gdrive_folder"
            elif "drive.google.com/file" in item["url"]:
                item["url_type"] = "gdrive_file"
            text = item["notes"] + str(item["verified"])
            item["access"] = "login" if any(h in text for h in LOGIN_HINTS) else "public"
            key = item["url"] + "|" + item["subject"] + "|" + item["doc_type"]
            item["id"] = hashlib.sha1(key.encode()).hexdigest()[:10]
            if key in merged:
                old = merged[key]
                old["found_by"] = sorted(set(old["found_by"]) | {source})
                if old["verified"] == "unverified":
                    old["verified"] = item["verified"]
                if item["notes"] and item["notes"] not in old["notes"]:
                    old["notes"] = (old["notes"] + "；" + item["notes"]).strip("；")
            else:
                merged[key] = item

    items = sorted(merged.values(), key=lambda i: (-(i["year"] or 0), i["series"], i["subject"], DOC_TYPES.index(i["doc_type"])))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(json.dumps(i, ensure_ascii=False) + "\n" for i in items), encoding="utf-8")
    write_index(items)
    print(f"{len(items)} 筆 → {OUT.relative_to(ROOT)}、{INDEX.relative_to(ROOT)}")


def write_index(items: list[dict]) -> None:
    downloaded = {}
    log = ROOT / "catalog" / "download-log.jsonl"
    if log.exists():
        for line in log.read_text(encoding="utf-8").splitlines():
            rec = json.loads(line)
            if rec.get("status") == "ok":
                downloaded[rec["id"]] = rec["files"]

    by_year: dict = defaultdict(lambda: defaultdict(list))
    for i in items:
        by_year[i["year"] or "未知"][i["series"]].append(i)

    lines = ["# 學測模擬考資料索引", "",
             "由 `tools/build_catalog.py` 產生，請勿手改。✅＝已下載到 `files/`；🔒＝需登入，只記錄來源；🔗＝網頁（級距等資訊在頁面內）。", ""]
    for year in sorted(by_year, key=lambda y: -y if isinstance(y, int) else 0):
        title = f"{year} 學測（{year - 1} 學年度模考）" if isinstance(year, int) else "年度不明"
        lines += [f"## {title}", ""]
        for series in sorted(by_year[year]):
            lines += [f"### {series}", "", "| 科目 | 類型 | 狀態 | 連結 | 備註 |", "|---|---|---|---|---|"]
            for i in by_year[year][series]:
                if i["id"] in downloaded:
                    state = "✅ " + "<br>".join(f"[{Path(f).name}]({f})" for f in downloaded[i["id"]][:5])
                elif i["access"] == "login":
                    state = "🔒"
                elif i["url_type"] == "html_page":
                    state = "🔗"
                else:
                    state = "⏳ 未下載"
                note = i["notes"].replace("|", "／").replace("\n", " ")[:120]
                lines.append(f"| {i['subject']} | {i['doc_type']} | {state} | [來源]({i['url']}) | {note} |")
            lines.append("")
    INDEX.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
