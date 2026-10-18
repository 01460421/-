"""把 bands/raw/*.jsonl（從級距圖、五標表、原始分數與級分對照表抄出來的資料）合併成總表。

輸出：
- bands/bands.csv：一場考試×一科一列，給 Excel 用
- bands/級距總表.md：依學測年列出各考次各科的級距、五標、到考人數
- bands/級分門檻.md：每科 15 級分的原始分數下限；有官方對照表就用對照表，沒有就由級距推算（標 *）

級分換算（大考中心規則，模考沿用）：級距 a＝前 1% 考生平均原始分數 ÷ 15；
原始分數 x 的級分＝ceil(x ÷ a)，超過 15 以 15 計，0 分為 0 級分。
所以 n 級分的下限是「x > (n−1)·a」，對照表上寫成「(n−1)·a < X ≦ n·a」。

用法：
    .venv/bin/python tools/build_bands.py
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "bands" / "raw"
OUT = ROOT / "bands"

SUBJECT_ORDER = ["國文", "國寫", "英文", "數學A", "數學B", "數學", "自然", "物理", "化學", "生物", "地科"]
FIELDS = ["band", "top", "front", "mean", "back", "bottom", "examinees", "full_score", "exam_date", "title"]
PROVIDER = {"E": "翰林", "N": "南一", "W": "文昌", "B": "北模", "G": "中模"}
EXAM_RE = re.compile(r"(\d{3})-([ENWBG])(\d)")


def exam_label(exam: str) -> str:
    m = EXAM_RE.match(exam)
    if not m:
        return exam
    kind = {"E": "翰林", "N": "南一全模", "W": "文昌", "B": "北模", "G": "中模"}[m.group(2)]
    if m.group(2) == "E" and int(m.group(1)) >= 113 and m.group(3) in "234":
        kind = "翰林（北北基／北模）"
    return f"{m.group(1)}-{m.group(2)}{m.group(3)} {kind} 第{m.group(3)}次"


def sort_key(exam: str) -> tuple:
    m = EXAM_RE.match(exam)
    return (m.group(2), int(m.group(3))) if m else ("Z", 9)


def merge() -> tuple[dict, list]:
    merged: dict[tuple, dict] = {}
    conflicts = []
    records = [json.loads(line) for path in sorted(RAW.glob("*.jsonl"))
               for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    # 官方報表優先：有完整對照表、有到考人數的排前面；網友整理、留言截圖、個人成績單排後面
    unofficial = ("網友", "留言", "非官方", "成績單", "手打", "自製", "截圖", "暫定")
    records.sort(key=lambda r: (any(k in (r.get("notes") or "") for k in unofficial),
                                len(r.get("thresholds") or {}) < 14, not r.get("examinees")))
    for rec in records:
        if True:
            if rec.get("skip") or not rec.get("exam") or not rec.get("subject"):
                continue
            key = (int(rec["gsat_year"]), rec["exam"], rec["subject"])
            cur = merged.setdefault(key, {"sources": [], "notes": []})
            cur["sources"].append(rec.get("source", ""))
            if rec.get("notes"):
                cur["notes"].append(rec["notes"])
            for f in FIELDS + ["thresholds"]:
                if rec.get(f) in (None, "", {}):
                    continue
                if f in cur and cur[f] != rec[f] and f not in ("title", "thresholds"):
                    if same_number(cur[f], rec[f]):  # 只是小數位數不同（5.06725 與 5.07）
                        continue
                    conflicts.append(f"{key[1]} {key[2]} {f}: {cur[f]}（{cur['sources'][0]}） vs {rec[f]}（{rec.get('source')}）")
                    continue
                cur.setdefault(f, rec[f])
    # 網友整理表常只寫「數學」；同一場已有數學A／B 的官方數字時，這列是重複的
    for key in [k for k in merged if k[2] == "數學"]:
        if (key[0], key[1], "數學A") in merged or (key[0], key[1], "數學B") in merged:
            del merged[key]
    return merged, conflicts


def same_number(a, b) -> bool:
    if not all(isinstance(v, (int, float)) for v in (a, b)):
        return False
    digits = min(len(str(v).split(".")[1]) if "." in str(v) else 0 for v in (a, b))
    return round(float(a), digits) == round(float(b), digits) or abs(float(a) - float(b)) < 10 ** -digits


def threshold_row(rec: dict) -> tuple[list[str], bool]:
    """回傳 1–15 級分的原始分數下限（字串）與是否為推算。"""
    table = rec.get("thresholds") or {}
    if len(table) >= 14:
        return [f"{float(table.get(str(n), table.get(n, 0))):.2f}" for n in range(1, 16)], False
    if rec.get("band"):
        a = float(rec["band"])
        return [f"{(n - 1) * a:.2f}" for n in range(1, 16)], True
    return [], False


def main() -> None:
    merged, conflicts = merge()
    years = sorted({k[0] for k in merged}, reverse=True)

    with open(OUT / "bands.csv", "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["學測年", "模考學年度", "考次", "科目", "級距", "頂標", "前標", "均標", "後標", "底標", "到考人數",
                    "滿分", "考試日期"] + [f"{n}級分下限" for n in range(1, 16)] + ["門檻來源", "資料來源檔"])
        for key in sorted(merged, key=lambda k: (-k[0], sort_key(k[1]), SUBJECT_ORDER.index(k[2]) if k[2] in SUBJECT_ORDER else 99)):
            r = merged[key]
            th, computed = threshold_row(r)
            w.writerow([key[0], key[0] - 1, exam_label(key[1]), key[2], r.get("band", ""), r.get("top", ""),
                        r.get("front", ""), r.get("mean", ""), r.get("back", ""), r.get("bottom", ""),
                        r.get("examinees", ""), r.get("full_score", ""), r.get("exam_date", "")]
                       + (th or [""] * 15) + ["由級距推算" if computed else ("對照表" if th else ""), "；".join(r["sources"])])

    md = ["# 學測模擬考級距總表", "",
          "由 `tools/build_bands.py` 依 `bands/raw/` 產生。五標是級分；級距是原始分數的級分組距。",
          "模考學年度＝學測年－1。翰林 E2–E4 在 113 學年度起就是北北基聯合模擬考（北模）。", ""]
    notes_md = ["# 級距資料來源備註", "", "判讀時發現的狀況：檔案放錯資料夾、截圖裁切、網友整理、數學A/B 原表數字相同等。", ""]
    for y in years:
        md += [f"## {y} 學測（{y - 1} 學年度模考）", ""]
        exams = sorted({k[1] for k in merged if k[0] == y}, key=sort_key)
        for exam in exams:
            rows = [(k[2], merged[k]) for k in merged if k[0] == y and k[1] == exam]
            rows.sort(key=lambda t: SUBJECT_ORDER.index(t[0]) if t[0] in SUBJECT_ORDER else 99)
            date = next((r.get("exam_date") for _, r in rows if r.get("exam_date")), "")
            md += [f"### {exam_label(exam)}" + (f"（{date}）" if date else ""), "",
                   "| 科目 | 級距 | 頂標 | 前標 | 均標 | 後標 | 底標 | 到考人數 | 15 級分門檻 |", "|---|---|---|---|---|---|---|---|---|"]
            for subj, r in rows:
                th, computed = threshold_row(r)
                fifteen = (f"> {th[14]}" + ("*" if computed else "")) if th else ""
                md.append(f"| {subj} | {r.get('band', '')} | {r.get('top', '')} | {r.get('front', '')} | {r.get('mean', '')} | "
                          f"{r.get('back', '')} | {r.get('bottom', '')} | {r.get('examinees', '')} | {fifteen} |")
            if any(r["notes"] for _, r in rows):
                md += ["", "> 來源說明見 `備註.md`"]
                notes_md += [f"### {y} 學測 {exam_label(exam)}", ""] + sorted(
                    {f"- {s}：{n}" for s, r in rows for n in r["notes"]}) + [""]
            md.append("")
    md += ["\\* 由級距推算（(n−1)×級距），原始資料沒有附對照表。", ""]
    if conflicts:
        md += ["## 來源之間數字不一致（採官方報表，另一方是個人成績單上的暫定值）", ""] + [f"- {c}" for c in conflicts] + [""]
    (OUT / "級距總表.md").write_text("\n".join(md), encoding="utf-8")
    (OUT / "備註.md").write_text("\n".join(notes_md), encoding="utf-8")

    th_md = ["# 各考次級分門檻（原始分數下限）", "",
             "n 級分＝原始分數 > 表中數字。有官方對照表就照抄，沒有則由級距推算並標 *。", ""]
    for y in years:
        th_md += [f"## {y} 學測", ""]
        for exam in sorted({k[1] for k in merged if k[0] == y}, key=sort_key):
            rows = [(k[2], merged[k]) for k in merged if k[0] == y and k[1] == exam]
            rows = [(s, r) for s, r in rows if threshold_row(r)[0]]
            if not rows:
                continue
            rows.sort(key=lambda t: SUBJECT_ORDER.index(t[0]) if t[0] in SUBJECT_ORDER else 99)
            th_md += [f"### {exam_label(exam)}", "", "| 級分 | " + " | ".join(s + ("*" if threshold_row(r)[1] else "") for s, r in rows) + " |",
                      "|---" * (len(rows) + 1) + "|"]
            cols = [threshold_row(r)[0] for _, r in rows]
            for n in range(15, 0, -1):
                th_md.append(f"| {n} | " + " | ".join(c[n - 1] for c in cols) + " |")
            th_md.append("")
    (OUT / "級分門檻.md").write_text("\n".join(th_md), encoding="utf-8")
    write_xlsx()
    print(f"{len(merged)} 筆（考試×科目），不一致 {len(conflicts)} 處 → bands/")


def write_xlsx() -> None:
    """bands.csv 轉成每個學測年一張工作表的 級距總表.xlsx。"""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
    except ImportError:
        print("沒有 openpyxl，略過 xlsx")
        return
    with open(OUT / "bands.csv", encoding="utf-8-sig") as fh:
        rows = list(csv.reader(fh))
    head, body = rows[0], rows[1:]
    wb = Workbook()
    wb.remove(wb.active)
    for year in sorted({r[0] for r in body}, reverse=True):
        ws = wb.create_sheet(f"{year}學測")
        ws.append(head[:-1])
        for cell in ws[1]:
            cell.font = Font(bold=True)
            cell.fill = PatternFill("solid", fgColor="DDEBF7")
        for r in body:
            if r[0] == year:
                ws.append([float(v) if re.fullmatch(r"-?\d+(\.\d+)?", v) else v for v in r[:-1]])
        ws.freeze_panes = "E2"
        for col, width in zip("ABCD", (8, 10, 30, 8)):
            ws.column_dimensions[col].width = width
    wb.save(OUT / "級距總表.xlsx")


if __name__ == "__main__":
    main()
