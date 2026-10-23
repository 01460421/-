"""列出成冊用的候選 PDF：翰林 E2–E4、南一 N2–N4，112–115 學測，國英數自。
每個檔記下頁數、第一頁文字開頭、內容雜湊，供挑選題本與詳解。"""
import hashlib, json, re, sys
from pathlib import Path
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parent.parent
cat = {json.loads(l)["id"]: json.loads(l) for l in open(ROOT / "catalog/catalog.jsonl")}
rows = {}
for line in open(ROOT / "catalog/download-log.jsonl"):
    r = json.loads(line)
    if r["status"] == "ok" and r["id"] in cat:
        c = cat[r["id"]]
        for f in r["files"]:
            rows[f] = (c["series"], c["subject"], c["doc_type"])
for files in json.load(open(ROOT / "catalog/extracted.json")).values():
    for f in files:
        rows.setdefault(f, (Path(f).parts[2], "?", "?"))

seen, out = {}, []
for f, (series, subject, doc) in sorted(rows.items()):
    p = ROOT / f
    m = re.match(r"(\d{3})-([EN])([234])_", series)
    if not (p.suffix.lower() == ".pdf" and p.exists() and m and 111 <= int(m.group(1)) <= 114):
        continue
    if subject in ("社會",) or "社會" in f or "分科" in f:
        continue
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    if h in seen:
        out[seen[h]]["dups"].append(f)
        continue
    try:
        doc_ = pdfium.PdfDocument(str(p))
        pages = len(doc_)
        text = doc_[0].get_textpage().get_text_range()[:200].replace("\n", " ") if pages else ""
    except Exception as e:
        pages, text = 0, f"ERR {e}"
    seen[h] = len(out)
    out.append({"file": f, "series": series, "subject": subject, "doc_type": doc, "pages": pages,
                "mb": round(p.stat().st_size / 1e6, 1), "text": text.strip(), "sha": h[:12], "dups": []})
json.dump(out, open(ROOT / "books/candidates.json", "w"), ensure_ascii=False, indent=1)
print(len(out), "unique candidates")
