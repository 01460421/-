"""匯入使用者提供的歷年模考總資料夾（1jy-k5u6Jwq0ksT5byGAG7zsjoAGudK4O），111–115 學年度學測部分。

這個資料夾的子資料夾名稱沒有統一代號，所以用對照表把每個子資料夾指定到考次；
檔名判斷科目（國綜／國寫／英文／數學A／數學B／數學／自然）與題本或解答。
高二 R1、英聽、社會、探究與實作、合科解答不收。

用法：
    .venv/bin/python tools/import_archive_folder.py research/gdrive-archive-1jy.jsonl
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch import list_gdrive_folder  # noqa: E402

ROOT_ID = "1jy-k5u6Jwq0ksT5byGAG7zsjoAGudK4O"
YEAR_FOLDERS = {"111學測模擬考題": 111, "112學測模擬考題": 112, "113學測模擬考題": 113, "114學測模考題": 114, "115學測模考題": 115}
# (學年度, 子資料夾名稱關鍵字) → 考次代號；依序比對，先符合者為準
EXAM_MAP = [
    (111, "08月份第一次", "E1"), (111, "全國09月第一次", "E2"), (111, "全國11月第二次", "E3"), (111, "全國12月第三次", "E4"),
    (111, "北市09月", "B1"), (111, "北市12月", "B2"), (111, "中模10月", "G1"),
    (112, "08月份第一次", "E1"), (112, "09月份第二次", "E2"), (112, "10月份第三次", "E3"), (112, "北市", "B1"),
    (112, "中聯", "G1"), (112, "南模", "N4"),
    (113, "08月份第一次", "E1"), (113, "09月開學第二次", "E2"), (113, "10月份第三次", "E3"), (113, "12月份第四次", "E4"),
    (113, "南模-10月", "N3"), (113, "南模-12月", "N4"),
    (114, "E1", "E1"), (114, "第二次E2", "E2"), (114, "第三次E3", "E3"), (114, "第四次E4", "E4"),
    (114, "模一", "N1"), (114, "模二", "N2"), (114, "模三", "N3"), (114, "模四", "N4"),
    (115, "E1", "E1"), (115, "E2", "E2"), (115, "公私立第二次", "N2"),
]
PROVIDER = {"E": "翰林", "N": "南一", "B": "北模", "G": "中模"}
SKIP = ("R1", "高二", "英聽", "聽力", "社會", "探究", "合科", "歷史", "地理", "公民")


def subject_of(name: str) -> str | None:
    if "國寫" in name or "寫作" in name:
        return "國寫"
    if "國綜" in name or "國文" in name or "國語文綜合" in name:
        return "國文"
    if "英" in name:
        return "英文"
    if re.search(r"數學?A|數A", name):
        return "數學A"
    if re.search(r"數學?B|數B", name):
        return "數學B"
    if "數學" in name:
        return "數學"
    if "自然" in name:
        return "自然"
    return None


def doc_type_of(name: str) -> str:
    if name.lower().endswith(".zip"):
        return "其他"
    if any(k in name for k in ("詳解", "解答")):
        return "詳解"
    if any(k in name for k in ("級分", "五標", "對照表", "統計")):
        return "級距"
    return "試題"


def main() -> None:
    dest = Path(sys.argv[1])
    out = []

    def walk(fid: str, series: str, top: str, path: str) -> None:
        for title, i in list_gdrive_folder(fid):
            name = re.sub(r"^\d{15,}_|^[0-9A-F]{40}_", "", html.unescape(title))
            if any(k in name for k in SKIP):
                continue
            if i.startswith("folder:"):
                walk(i[7:], series, top, f"{path}/{name}")
                continue
            doc = doc_type_of(name)
            subject = subject_of(path.rsplit("/", 1)[-1] + " " + name) if doc != "級距" else "全科"
            if not subject and doc != "其他":
                continue
            out.append({
                "year": int(series[:3]), "year_basis": "school_year", "series": series,
                "provider": series.split("_")[1], "round": int(series[5]), "subject": subject or "全科",
                "doc_type": doc, "label": name.rsplit(".", 1)[0],
                "url": f"https://drive.google.com/file/d/{i}/view", "url_type": "gdrive_file",
                "source_page": f"https://drive.google.com/drive/folders/{ROOT_ID}", "verified": "公開資料夾列出",
                "notes": f"原檔名：{name}；資料夾：{top}{path}", "priority": "archive",
            })

    for title, fid in list_gdrive_folder(ROOT_ID):
        title = html.unescape(title)
        sy = YEAR_FOLDERS.get(title)
        if not sy or not fid.startswith("folder:"):
            continue
        for sub, sid in list_gdrive_folder(fid[7:]):
            sub = html.unescape(sub)
            code = next((c for y, key, c in EXAM_MAP if y == sy and key in sub), None)
            if not code or not sid.startswith("folder:") or any(k in sub for k in ("R1", "高二", "探究")):
                print("略過", title, sub)
                continue
            series = f"{sy}-{code}_{PROVIDER[code[0]]}"
            walk(sid[7:], series, f"{title}/{sub}", "")
    dest.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in out), encoding="utf-8")
    print(f"{len(out)} 筆 → {dest}")


if __name__ == "__main__":
    main()
