"""把公開的 Notion 資料庫（例如「Mock Tests for GSAT 學測模擬考」）轉成調查結果（JSON Lines）。

Notion 公開頁面的表格只渲染畫面上的列，所以直接呼叫公開頁面本身使用的 api/v3（不需登入）
取得完整資料列。每列的「Exam Paper／Ans. & Sol.／Scores Stats」欄位各轉成一筆。

用法：
    .venv/bin/python tools/import_notion_db.py https://xxx.notion.site/<page id>?v=... research/notion-xxx.jsonl
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests

COLUMNS = {"Exam Paper": "試題", "Ans. & Sol.": "詳解", "Scores Stats": "級距"}
SUBJECTS = {"數A": "數學A", "數B": "數學B", "數學": "數學", "國綜": "國文", "國寫": "國寫",
            "英文": "英文", "自然": "自然", "社會": "社會"}
CODE = re.compile(r"(1\d\d)-([A-Z]\d)")


def dashed(hex32: str) -> str:
    h = hex32.replace("-", "")
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"


def unwrap(rec: dict) -> dict:
    v = rec["value"]
    return v.get("value", v)


def rich(prop) -> tuple[str, list[str]]:
    """Notion rich text → (純文字, 連結清單)。"""
    text, links = "", []
    for seg in prop or []:
        text += seg[0]
        for ann in seg[1] if len(seg) > 1 else []:
            if ann[0] == "a":
                links.append(ann[1])
    if not links:
        links = re.findall(r"https?://\S+", text)
    # 「見題本最後」之類的說明文字不是連結
    return text, [link for link in links if link.startswith("http")]


def main() -> None:
    page_url, dest = sys.argv[1], Path(sys.argv[2])
    u = urlparse(page_url)
    base = f"{u.scheme}://{u.netloc}/api/v3/"
    page_id = dashed(re.search(r"([0-9a-f]{32})", u.path).group(1))
    s = requests.Session()
    s.headers["User-Agent"] = "Mozilla/5.0"

    blk = unwrap(s.post(base + "syncRecordValuesMain", json={
        "requests": [{"pointer": {"table": "block", "id": page_id}, "version": -1}]}).json()["recordMap"]["block"][page_id])
    body = {
        "source": {"type": "collection", "id": blk["collection_id"], "spaceId": blk["space_id"]},
        "collectionView": {"id": blk["view_ids"][0], "spaceId": blk["space_id"]},
        "loader": {"type": "reducer", "reducers": {"collection_group_results": {"type": "results", "limit": 5000}},
                   "searchQuery": "", "userTimeZone": "Asia/Taipei"},
    }
    data = s.post(base + "queryCollection", json=body).json()
    rm = data["recordMap"]
    col = unwrap(next(iter(rm["collection"].values())))
    names = {k: v["name"] for k, v in col["schema"].items()}
    row_ids = data["result"]["reducerResults"]["collection_group_results"]["blockIds"]

    out = []
    for rid in row_ids:
        props = {names.get(k, k): v for k, v in unwrap(rm["block"][rid]).get("properties", {}).items()}
        name = rich(props.get("Name"))[0]
        subject = SUBJECTS.get(rich(props.get("Subject"))[0].strip(), rich(props.get("Subject"))[0].strip() or "全科")
        if subject == "社會":
            continue
        provider = rich(props.get("Type"))[0].strip() or "未知"
        year_txt = rich(props.get("Academic Year"))[0]
        rnd = rich(props.get("No."))[0]
        m = CODE.search(name)
        year = int(m.group(1)) if m else (int(year_txt) if year_txt.strip().isdigit() else None)
        code = m.group(2) if m else ""
        short = provider.split("（")[0]
        for col_name, doc_type in COLUMNS.items():
            text, links = rich(props.get(col_name))
            for link in links:
                out.append({
                    "year": year, "series": f"{year}-{code}_{short}" if code else short, "provider": provider,
                    "round": int(rnd) if rnd.strip().isdigit() else None, "subject": subject,
                    "doc_type": doc_type, "label": f"{name}_{doc_type}",
                    "url": link, "url_type": "gdrive_folder" if "/folders/" in link else
                    ("gdrive_file" if "drive.google.com" in link else "direct"),
                    "year_basis": "school_year",
                    "source_page": page_url, "verified": "Notion 公開資料庫列出",
                    "notes": f"Notion 列：{name}；類型：{provider}" + (f"；欄位文字：{text}" if text and "http" not in text else ""),
                })
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in out), encoding="utf-8")
    print(f"{len(row_ids)} 列 → {len(out)} 筆 → {dest}")


if __name__ == "__main__":
    main()
