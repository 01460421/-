"""把公開分享的 Google 雲端硬碟資料夾樹展開成調查結果（JSON Lines），交給 build_catalog.py 合併。

資料夾名稱若是「113-E2 北模 (翰林)」這種格式，會解析出模考學年度（113 學年度＝114 學測）、次數、考試名稱與命題單位；
檔名用來判斷科目與文件類型。

用法：
    .venv/bin/python tools/import_gdrive_folder.py FOLDER_ID research/gdrive-xxx.jsonl
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch import list_gdrive_folder  # noqa: E402

FOLDER_NAME = re.compile(r"(?P<year>1\d\d)-(?P<code>[A-Z])(?P<round>\d)\s*(?P<kind>\S+)?\s*(?:\((?P<provider>[^)]+)\))?")
SUBJECT_KEYS = [("國寫", "國寫"), ("國綜", "國文"), ("國文", "國文"), ("數學A", "數學A"), ("數A", "數學A"),
                ("數學B", "數學B"), ("數B", "數學B"), ("數學", "數學"), ("英", "英文"), ("自然", "自然"),
                ("社會", "社會")]


def subject_of(name: str) -> str:
    for key, subj in SUBJECT_KEYS:
        if key in name:
            return subj
    return "全科"


def doc_type_of(name: str) -> tuple[str, str]:
    """回傳 (doc_type, label)。label 保留原檔名特徵，讓同類多檔不互相覆蓋。"""
    if any(k in name for k in ("級距", "五標", "級分", "對照表", "統計")):
        return "級距", ""
    if "答案卡" in name:
        return "答案卡", ""
    if "答案卷" in name or "作答卷" in name:
        return "答案卷", ""
    if "更正" in name:
        return "其他", "答案更正"
    if "含詳解" in name or ("試題" in name and "詳解" in name):
        return "試題", "含詳解"
    if "詳解" in name or "解析" in name:
        return "詳解", "補充" if "補充" in name else ""
    if "解答" in name or "答案" in name:
        return "解答", ""
    return "試題", ""


def walk(folder_id: str, ctx: dict, out: list, source_page: str) -> None:
    for title, fid in list_gdrive_folder(folder_id):
        title = html.unescape(title)
        if fid.startswith("folder:"):
            sub = dict(ctx)
            if m := FOLDER_NAME.match(title):
                sub.update(year=int(m["year"]), round=int(m["round"]), code=m["code"] + m["round"],
                           kind=m["kind"] or "", provider=m["provider"] or "未知")
            walk(fid[7:], sub, out, source_page)
            continue
        subject = subject_of(title)
        doc_type, label = doc_type_of(title)
        if ctx.get("year"):
            # 與 Notion 資料庫同一套編號：113-E2_翰林（模考學年度-代號_命題單位）
            series = f"{ctx['year']}-{ctx['code']}_{ctx['provider']}"
        else:
            series = "未知"
        out.append({
            "year": ctx.get("year"), "series": series, "provider": ctx.get("provider", "未知"),
            "round": ctx.get("round"), "subject": subject, "doc_type": doc_type,
            "label": label or Path(title).stem,
            "url": f"https://drive.google.com/file/d/{fid}/view", "url_type": "gdrive_file",
            "year_basis": "school_year",
            "source_page": source_page, "verified": "公開資料夾列出", "notes": f"原檔名：{title}；資料夾標示：{ctx.get('kind', '')}",
        })


def main() -> None:
    folder_id, dest = sys.argv[1], Path(sys.argv[2])
    out: list = []
    walk(folder_id, {}, out, f"https://drive.google.com/drive/folders/{folder_id}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in out), encoding="utf-8")
    print(f"{len(out)} 筆 → {dest}")


if __name__ == "__main__":
    main()
