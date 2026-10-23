"""依 books/selection/*.json 把各科第二、三、四次模考裝訂成冊。

每科三本（第二、三、四次），每本：封面 → 目錄 → 每回（扉頁含五標級距 → 試題 → 詳解）→ 封底，並加 PDF 書籤。
國文＝國綜＋國寫；數學A／B 若該回沒分卷，改用「數學」合卷並在扉頁註明。

用法：
    .venv/bin/python books/build_books.py [--only 英文] [--round 3] OUT_DIR
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tools"))
import design  # noqa: E402
from build_bands import merge as merge_bands  # noqa: E402

SUBJECTS = {
    "國文": [["國文", "國綜"], ["國寫"]],
    "英文": [["英文"]],
    "數學A": [["數學A", "數學"]],
    "數學B": [["數學B", "數學"]],
    "自然": [["自然"]],
}
PROVIDER_NAME = {"E": "翰林", "N": "南一", "B": "北模", "G": "中模"}
SERIES_RE = re.compile(r"(\d{3})-([ENBG])(\d)_")
# 區域聯模依考試月份排進對應的冊：9 月→第二次、10 月→第三次、12 月→第四次
REGIONAL_ROUND = {"111-B1": 2, "111-G1": 3, "111-B2": 4, "112-G1": 3, "112-B1": 4}
SCHOOL_YEARS = range(111, 115)  # 112–115 學測
SOURCE_HINTS = [("chsh.chc", "國立彰化高中"), ("1h03KZ", "周逸化學團隊雲端"), ("notion", "Notion Mock Tests for GSAT"),
                ("1li7cmz", "使用者提供雲端資料夾"), ("tcfsh", "臺中一中賴老師數學站"), ("wangstar", "王欣國文"),
                ("cross-reading", "陳蒂國文")]


def load_selection() -> dict[tuple[str, str], dict]:
    """後讀的檔優先（zz_archive.json 排最後）；後者沒有的欄位才沿用前者。"""
    sel: dict[tuple[str, str], dict] = {}
    for path in sorted((HERE / "selection").glob("*.json")):
        for rec in json.loads(path.read_text(encoding="utf-8")):
            key = (rec["series"], rec["subject"])
            old = sel.get(key, {})
            merged = {**old, **{k: v for k, v in rec.items() if v not in ([], "", None)}}
            if rec.get("q") and not rec.get("a") and not rec.get("combined") and old.get("a"):
                merged["a"] = old["a"]  # 例如總資料夾缺自然詳解，用代理挑的補
            sel[key] = merged
    return sel


def book_round(series: str) -> int | None:
    m = SERIES_RE.match(series)
    if not m or int(m.group(1)) not in SCHOOL_YEARS:
        return None
    if m.group(2) in "BG":
        return REGIONAL_ROUND.get(series[:6])
    return int(m.group(3)) if m.group(3) in "234" else None


def exam_meta(series: str) -> dict:
    m = SERIES_RE.match(series)
    sy, code, rnd = int(m.group(1)), m.group(2), int(m.group(3))
    return {"series": series, "school_year": sy, "gsat": sy + 1, "code": code, "round": rnd,
            "provider": PROVIDER_NAME[code]}


def subtitle(meta: dict, rec_list: list[dict]) -> str:
    kind = {"N": "全國公私立高中聯合模擬考", "B": "臺北市高中聯合模擬考", "G": "中區（臺中市）高中聯合模擬考"}.get(
        meta["code"], "北北基聯合模擬考" if meta["school_year"] >= 113 else "全國聯合模擬考")
    date = next((r.get("exam_date") for r in rec_list if r.get("exam_date")), "")
    return "　".join(x for x in (f"{meta['school_year']} 學年度", kind, date) if x)


def pages_of(spec: str) -> list:
    """「路徑」或「路徑#3-6」（只取第 3–6 頁，從 1 起算）。"""
    path, _, rng = spec.partition("#")
    r = PdfReader(str(ROOT / path))
    if r.is_encrypted:
        r.decrypt("")
    pages = list(r.pages)
    if rng:
        a, _, b = rng.partition("-")
        pages = pages[int(a) - 1:int(b or a)]
    return pages


def page_count(files: list[str]) -> int:
    return sum(len(pages_of(f)) for f in files)


def build(subject: str, rnd: int, sel: dict, bands: dict, out_dir: Path) -> Path | None:
    entries = []
    series_all = sorted({s for s, _ in sel if book_round(s) == rnd},
                        key=lambda s: (-int(s[:3]), "ENBG".index(s[4])))
    for series in series_all:
        meta = exam_meta(series)
        q, a, recs, notes = [], [], [], []
        for part in SUBJECTS[subject]:
            rec = next((sel[(series, s)] for s in part if (series, s) in sel and (sel[(series, s)]["q"] or sel[(series, s)]["a"])), None)
            if not rec:
                continue
            recs.append(rec)
            q += rec["q"]
            if not rec.get("combined"):  # 合訂檔已含詳解，不再另外附一份
                a += [f for f in rec["a"] if f not in rec["q"]]
            if rec["subject"] == "數學" and subject in ("數學A", "數學B"):
                notes.append("本回數學未分 A／B 卷")
        if not q and not a:
            continue
        stat_subject = "國文" if subject == "國文" else subject
        band = bands.get((meta["gsat"], series, stat_subject)) or (
            bands.get((meta["gsat"], series, "數學")) if subject.startswith("數學") else None)
        entries.append({"meta": meta, "q": q, "a": a, "recs": recs, "band": band,
                        "combined": any(r.get("combined") for r in recs),
                        "title": f"{meta['gsat']} 學測　{meta['provider']} {meta['code']}{meta['round']}",
                        "sub": subtitle(meta, recs) + ("　（" + "；".join(notes) + "）" if notes else "")})
    if not entries:
        return None

    # 先算頁碼：封面 1、目錄 1，之後每回 扉頁 + 試題 + 詳解
    page = 3
    for i, e in enumerate(entries):
        e["i"] = i
        e["divider_page"] = page
        e["q_page"] = page + 1 if e["q"] else None
        nq = page_count(e["q"])
        e["a_page"] = page + 1 + nq if e["a"] else None
        page += 1 + nq + page_count(e["a"])

    sources = sorted({name for e in entries for f in e["q"] + e["a"] for key, name in SOURCE_HINTS if key in f} or {"公開分享之雲端與學校網站"})
    designed = [design.cover(subject, rnd, f"{entries[-1]['meta']['gsat']}–{entries[0]['meta']['gsat']}", [e["meta"] for e in entries]),
                design.toc(subject, rnd, entries)]
    designed += [design.divider(subject, e, e["band"]) for e in entries]
    designed.append(design.back(subject, rnd, sources))
    out_dir.mkdir(parents=True, exist_ok=True)
    deco_pdf = out_dir / f".deco-{subject}-{rnd}.pdf"
    design.render(designed, deco_pdf)
    deco = PdfReader(str(deco_pdf))

    w = PdfWriter()
    w.add_page(deco.pages[0])
    w.add_page(deco.pages[1])
    for i, e in enumerate(entries):
        w.add_page(deco.pages[2 + i])
        parent = w.add_outline_item(e["title"], len(w.pages) - 1)
        for label, files in (("試題", e["q"]), ("詳解", e["a"])):
            if not files:
                continue
            start = len(w.pages)
            for f in files:
                for pg in pages_of(f):
                    w.add_page(pg)
            w.add_outline_item(label, start, parent=parent)
    w.add_page(deco.pages[-1])
    w.add_metadata({"/Title": f"{subject} 學測模擬考 {design.ROUND_NAME[rnd]} 試題與詳解", "/Subject": "個人備考用"})
    w.page_mode = "/UseOutlines"
    w.compress_identical_objects()
    out = out_dir / f"{subject}_{design.ROUND_NAME[rnd]}模擬考_試題與詳解.pdf"
    with open(out, "wb") as fh:
        w.write(fh)
    deco_pdf.unlink()
    print(f"{out.name}: {len(entries)} 回、{len(w.pages)} 頁、{out.stat().st_size / 1e6:.0f} MB")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--only")
    ap.add_argument("--round", type=int)
    args = ap.parse_args()
    sel = load_selection()
    merged, _ = merge_bands()
    bands = {k: v for k, v in merged.items()}
    for subject in SUBJECTS:
        if args.only and subject != args.only:
            continue
        for rnd in (2, 3, 4):
            if args.round and rnd != args.round:
                continue
            build(subject, rnd, sel, bands, args.out)


if __name__ == "__main__":
    main()
