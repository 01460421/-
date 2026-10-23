"""學測英文模擬考 PDF → 結構化 JSON ＋ 題目附圖。

流程：
1. 切卷：有書籤的總集（例如 books/ 產生的冊子）依第一層書籤切成多回，第二層「試題／詳解」再分題本與解析；
   沒有書籤就整份當一回，並用「參考答案／詳解」標題自動找出解析從哪一頁開始。
2. 取字：有文字層的頁直接取行與座標；文字太少的頁（掃描檔）用 Tesseract OCR，沒有 Tesseract 就標記 needs_ocr。
3. 取圖：嵌入的圖片與向量圖表依位置裁切成 PNG（整頁掃描背景不算），掛到最近的題目或題組。
4. 解析：依大考題型標題分大題（詞彙、綜合測驗、文意選填、篇章結構、閱讀測驗、混合題、翻譯、作文），
   「第 X 至 Y 題為題組」分題組，題號與 (A)–(J) 選項拆成題幹與選項；解析部分找出各題答案與解說。

只處理使用者自己提供的檔案；輸出供個人整理使用。
"""
from __future__ import annotations

import io
import json
import re
import unicodedata
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

import pymupdf

SCHEMA = "gsat-mock-transcription/v1"

try:  # OCR 是選配：沒有 pytesseract 或 tesseract 執行檔時，掃描頁只標記 needs_ocr
    import pytesseract
    from PIL import Image

    pytesseract.get_tesseract_version()
    HAS_OCR = True
except Exception:  # noqa: BLE001
    HAS_OCR = False


# ── 資料結構 ────────────────────────────────────────────────────────────

@dataclass
class Line:
    text: str
    page: int          # 原始 PDF 的頁碼（0 起算）
    y0: float
    y1: float
    x0: float
    part: str = "q"    # q＝題本、a＝解析


@dataclass
class Figure:
    page: int
    y: float           # 圖的中心高度，用來找最近的題目
    path: str          # 壓縮檔內的相對路徑
    width: int
    height: int
    kind: str          # embedded＝嵌入圖片、vector＝向量圖表


@dataclass
class ExamSpec:
    title: str
    q_pages: list[int]
    a_pages: list[int]


@dataclass
class Options:
    ocr: bool = True                 # 文字太少的頁要不要 OCR
    force_ocr: bool = False          # 每頁都 OCR（文字層亂碼時用）
    ocr_lang: str = "eng+chi_tra"
    split_bookmarks: bool = True
    page_images: str = "scanned"     # none／scanned（只輸出掃描頁）／all
    dpi: int = 200


# ── 正規化與題型標題 ────────────────────────────────────────────────────

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("　", " ").replace(" ", " ")
    s = re.sub(r"[ \t]+", " ", s).strip()
    # OCR 會在中文字、全形標點之間插空白；中文與中文、中文與括號之間的空白都拿掉
    s = re.sub(rf"(?<=[{CJK}]) (?=[{CJK}])", "", s)
    return re.sub(rf"(?<=[{CJK}]) (?=[()\[\]])|(?<=[()\[\]]) (?=[{CJK}])", "", s)


CJK = "　-〿一-鿿＀-￯【】「」『』"
NON_CHOICE = {"translation", "composition", "non_choice"}
PAGE_NO_RE = re.compile(r"[-－–\s]*\d{1,3}[-－–\s]*|第\s*\d{1,3}\s*頁(?:\s*[,，/]?\s*共\s*\d{1,3}\s*頁)?|\d{1,3}\s*/\s*\d{1,3}")


ENUM = r"(?:第\s*[壹貳參肆伍一二三四五]\s*部分\s*[、:：.]?\s*|[一二三四五六七八九十]+\s*[、.]\s*|[壹貳參肆伍]\s*[、.]\s*)"
SECTION_TYPES = [
    ("vocabulary", r"詞彙|字彙"),
    ("cloze", r"綜合測驗"),
    ("fill_in", r"文意選填"),
    ("structure", r"篇章結構"),
    ("reading", r"閱讀測驗"),
    ("mixed", r"混合題"),
    ("translation", r"中譯英|翻譯"),
    ("composition", r"英文作文|作文"),
    ("non_choice", r"非選擇題"),
]
SECTION_RE = [(t, re.compile(rf"^{ENUM}?.{{0,6}}(?:{k})")) for t, k in SECTION_TYPES]
GROUP_RE = re.compile(r"第\s*(\d{1,2})\s*(?:題)?\s*[至到~～\-－–]\s*(?:第\s*)?(\d{1,2})\s*題\s*為\s*題組")
RANGE_RE = re.compile(r"第\s*(\d{1,2})\s*(?:題)?\s*[至到~～\-－–]\s*(?:第\s*)?(\d{1,2})\s*題")
QNUM_RE = re.compile(r"^(\d{1,2})\s*[.．、]\s*(?!\d)(.*)$")
OPTION_RE = re.compile(r"\(\s*([A-J])\s*\)")
ANSWER_HEAD_RE = re.compile(r"^(參考答案|答案|解答|詳解|解析|試題解析|參考答案暨詳解)")
ANSWER_INLINE_RE = re.compile(r"(?<!\d)(\d{1,2})\s*[.．、:：]?\s*[(（]\s*([A-J]{1,5})\s*[)）]")
ANSWER_TAG_RE = re.compile(r"(?:答案|正解|Ans(?:wer)?)\s*[:：】\]]?\s*[(（]?\s*([A-J]{1,5})\b")


def section_type(text: str) -> str | None:
    if len(text) > 60:
        return None
    for t, rx in SECTION_RE:
        if rx.search(text):
            return t
    return None


# ── 取字（文字層或 OCR） ───────────────────────────────────────────────

def text_lines(page: pymupdf.Page) -> list[tuple[str, float, float, float, float]]:
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for ln in b["lines"]:
            t = "".join(sp["text"] for sp in ln["spans"])
            if t.strip():
                x0, y0, x1, y1 = ln["bbox"]
                out.append((t, x0, y0, x1, y1))
    return out


def ocr_lines(page: pymupdf.Page, lang: str, dpi: int = 300) -> list[tuple[str, float, float, float, float]]:
    scale = dpi / 72
    pix = page.get_pixmap(dpi=dpi)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    data = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
    groups: dict[tuple, list[int]] = {}
    for i, word in enumerate(data["text"]):
        if word.strip() and float(data["conf"][i]) >= 0:
            groups.setdefault((data["block_num"][i], data["par_num"][i], data["line_num"][i]), []).append(i)
    out = []
    for idx in groups.values():
        words = [data["text"][i] for i in idx]
        # 中文字之間 Tesseract 會插空白，英文字之間要保留
        text = re.sub(r"(?<=[一-鿿]) (?=[一-鿿])", "", " ".join(words))
        x0 = min(data["left"][i] for i in idx) / scale
        y0 = min(data["top"][i] for i in idx) / scale
        x1 = max(data["left"][i] + data["width"][i] for i in idx) / scale
        y1 = max(data["top"][i] + data["height"][i] for i in idx) / scale
        out.append((text, x0, y0, x1, y1))
    return out


def reading_order(raw: list[tuple[str, float, float, float, float]], width: float) -> list[tuple[str, float, float, float, float]]:
    """雙欄版面先排左欄再排右欄；橫跨兩欄的行（大題標題）照高度插在前面。"""
    mid = width / 2
    narrow_right = sum(1 for _, x0, _, x1, _ in raw if x0 > mid - 8 and x1 - x0 < width * 0.48)
    if raw and narrow_right / len(raw) > 0.25:
        def col(r):
            _, x0, _, x1, _ = r
            return 1 if x0 > mid - 8 else (0 if x1 < mid + 12 else -1)
        spans = sorted((r for r in raw if col(r) == -1), key=lambda r: r[2])
        cols = [sorted((r for r in raw if col(r) == c), key=lambda r: (round(r[2]), r[1])) for c in (0, 1)]
        return spans + cols[0] + cols[1] if not spans else sorted(spans + cols[0], key=lambda r: r[2]) + cols[1]
    return sorted(raw, key=lambda r: (round(r[2] / 3), r[1]))


# ── 取圖 ────────────────────────────────────────────────────────────────

def merge_rects(rects: list[pymupdf.Rect], gap: float = 6) -> list[tuple[pymupdf.Rect, int]]:
    groups: list[tuple[pymupdf.Rect, int]] = []
    for r in sorted(rects, key=lambda r: (r.y0, r.x0)):
        grown = pymupdf.Rect(r.x0 - gap, r.y0 - gap, r.x1 + gap, r.y1 + gap)
        for i, (g, n) in enumerate(groups):
            if g.intersects(grown):
                groups[i] = (g | r, n + 1)
                break
        else:
            groups.append((pymupdf.Rect(r), 1))
    return groups


def figure_rects(page: pymupdf.Page) -> list[tuple[pymupdf.Rect, str]]:
    area = page.rect.width * page.rect.height
    found = []
    for img in page.get_images(full=True):
        for r in page.get_image_rects(img[0]):
            r = r & page.rect
            if r.width > 30 and r.height > 30 and r.width * r.height < 0.8 * area:
                found.append((r, "embedded"))
    # 向量圖表：一群彼此相連、含填色或曲線的繪圖物件；單純的底線、框線不算
    shapes = [d for d in page.get_drawings() if d["rect"].width < page.rect.width * 0.9]
    rich = [d["rect"] for d in shapes if d.get("fill") is not None or any(it[0] == "c" for it in d["items"])]
    for rect, n in merge_rects([d["rect"] for d in shapes]):
        if n >= 8 and rect.width * rect.height > 2500 and rect.width * rect.height < 0.7 * area \
                and any(rect.contains(r) for r in rich) and not any(rect.intersects(f) for f, _ in found):
            found.append((rect, "vector"))
    return found


# ── 切卷 ────────────────────────────────────────────────────────────────

def exam_specs(doc: pymupdf.Document, opts: Options, name: str = "") -> list[ExamSpec]:
    toc = doc.get_toc(simple=True) if opts.split_bookmarks else []
    tops = [(i, t) for i, t in enumerate(toc) if t[0] == 1]
    n = doc.page_count
    if len(tops) >= 2:
        specs = []
        for k, (i, (_, title, page)) in enumerate(tops):
            end = (tops[k + 1][1][2] - 1) if k + 1 < len(tops) else n
            children = []
            for t in toc[i + 1:]:
                if t[0] == 1:
                    break
                if t[0] == 2:
                    children.append(t)
            q, a = [], []
            if children:
                for c, (_, ctitle, cpage) in enumerate(children):
                    cend = (children[c + 1][2] - 1) if c + 1 < len(children) else end
                    rng = list(range(cpage - 1, cend))
                    (a if any(k2 in ctitle for k2 in ("詳解", "解析", "解答", "答案")) else q).extend(rng)
            else:
                q = list(range(page - 1, end))
            specs.append(ExamSpec(norm(title), q, a))
        return specs
    return [ExamSpec(Path(name).stem if name else "exam", list(range(n)), [])]


def find_answer_start(lines: list[Line]) -> int | None:
    """沒有書籤時：第一個頁首附近出現「參考答案／詳解」的頁，從那頁起當解析。"""
    seen_q = False
    for ln in lines:
        if QNUM_RE.match(ln.text):
            seen_q = True
        if seen_q and ln.y0 < 160 and ANSWER_HEAD_RE.match(ln.text):
            return ln.page
    return None


# ── 解析題目 ────────────────────────────────────────────────────────────

def split_options(text: str) -> tuple[str, dict[str, str]]:
    parts = OPTION_RE.split(text)
    if len(parts) < 5:  # 少於兩個選項就不當選擇題拆
        return text.strip(), {}
    stem, opts = parts[0].strip(), {}
    for k in range(1, len(parts) - 1, 2):
        opts[parts[k]] = parts[k + 1].strip()
    return stem, opts


def new_question(no: int, ln: Line) -> dict:
    return {"no": no, "stem": "", "options": {}, "answer": None, "explanation": None,
            "images": [], "page": ln.page + 1, "_y": ln.y0, "_buf": []}


def parse_questions(lines: list[Line]) -> tuple[list[dict], list[str]]:
    sections: list[dict] = []
    unparsed: list[str] = []
    sec = grp = q = None
    last_no = 0

    def open_section(kind: str, title: str, ln: Line):
        nonlocal sec, grp, q
        close_q()
        sec = {"type": kind, "title": title, "instructions": "", "groups": [], "page": ln.page + 1}
        sections.append(sec)
        grp = None
        rm = RANGE_RE.search(title)
        sec["range"] = [int(rm.group(1)), int(rm.group(2))] if rm else None

    def open_group(start: int | None, end: int | None, ln: Line):
        nonlocal grp
        if sec is None:
            open_section("unknown", "", ln)
        grp = {"range": [start, end] if start else None, "passage": "", "options": {}, "questions": [],
               "images": [], "page": ln.page + 1, "_y": ln.y0, "_page": ln.page, "_buf": []}
        sec["groups"].append(grp)

    def close_q():
        nonlocal q
        if q is not None:
            q["stem"], q["options"] = split_options(" ".join(q.pop("_buf")))
            q = None

    for ln in lines:
        t = ln.text
        kind = section_type(t)
        if kind and not QNUM_RE.match(t):
            open_section(kind, t, ln)
            if kind in NON_CHOICE:
                last_no = 0  # 非選擇題的題號從 1 重新開始
            continue
        gm = GROUP_RE.search(t)
        if gm and not QNUM_RE.match(t):
            close_q()
            open_group(int(gm.group(1)), int(gm.group(2)), ln)
            grp["_buf"].append(t)
            continue
        qm = QNUM_RE.match(t)
        if qm:
            no = int(qm.group(1))
            if sec is None:
                open_section("unknown", "", ln)
            if last_no == 0 or no == last_no + 1 or (grp and grp["range"] and grp["range"][0] <= no <= grp["range"][1]):
                close_q()
                # 沒有題組、或題號跑出目前題組範圍時，開一個不帶範圍的題組收單題
                if grp is None or (grp["range"] and not grp["range"][0] <= no <= grp["range"][1]):
                    open_group(None, None, ln)
                q = new_question(no, ln)
                q["_page"] = ln.page
                q["_buf"].append(qm.group(2))
                grp["questions"].append(q)
                last_no = no
                continue
        if q is not None:
            q["_buf"].append(t)
        elif grp is not None:
            grp["_buf"].append(t)
        elif sec is not None:
            sec["instructions"] = (sec["instructions"] + " " + t).strip()
        else:
            unparsed.append(t)
    close_q()

    for s in sections:
        for g in s["groups"]:
            body = " ".join(g.pop("_buf"))
            # 文意選填、篇章結構的選項列在文章前後，屬於整個題組
            passage, opts = split_options(body) if s["type"] in ("fill_in", "structure") else (body, {})
            g["passage"], g["options"] = passage.strip(), opts
        if s["type"] in ("fill_in", "structure", "cloze") and s.get("range"):
            # 這幾種題型常沒有逐題的題號行：依大題範圍補上空白題
            have = {q["no"] for g in s["groups"] for q in g["questions"]}
            if not s["groups"]:
                s["groups"].append({"range": s["range"], "passage": s["instructions"], "options": {}, "questions": [],
                                    "images": [], "page": s["page"], "_y": 0, "_page": s["page"] - 1})
                s["instructions"] = ""
            for no in range(s["range"][0], s["range"][1] + 1):
                if no not in have:
                    s["groups"][-1]["questions"].append({"no": no, "stem": "", "options": {}, "answer": None,
                                                         "explanation": None, "images": [], "page": s["page"],
                                                         "_y": 0, "_page": s["page"] - 1})
            s["groups"][-1]["questions"].sort(key=lambda q: q["no"])
    return sections, unparsed


def number_run(t: str) -> list[int]:
    """答案表的題號列：「1 2 3 … 8」或 OCR 黏在一起的「12345678」「2122232425」，至少 5 題連號。"""
    if not re.fullmatch(r"[\d\s]+", t):
        return []
    tokens = t.split()
    if len(tokens) >= 5:
        nums = [int(x) for x in tokens]
        return nums if all(b == a + 1 for a, b in zip(nums, nums[1:])) else []
    s = t.replace(" ", "")
    for width in (1, 2):  # 從第一個題號的位數試起，接出來的連號字串要剛好等於原字串
        if len(s) < width:
            continue
        start, seq, n = int(s[:width]), "", 0
        while len(seq) < len(s):
            seq += str(start + n)
            n += 1
        if seq == s and n >= 5:
            return list(range(start, start + n))
    return []


def letter_run(t: str) -> list[str]:
    """答案列：「B A A C」或黏在一起的「BAAC」（黏在一起時每個字母算一題）。"""
    if not re.fullmatch(r"[A-J\s]+", t):
        return []
    tokens = t.split()
    return tokens if len(tokens) > 1 else list(t.strip())


def parse_answers(lines: list[Line]) -> tuple[dict[int, str], dict[int, str]]:
    """解析部分：先找「1.(B)」與「題號列／答案列」對照表，再把「題號. ……」之後的文字當成該題解說。"""
    answers: dict[int, str] = {}
    texts = [ln.text for ln in lines]
    for t in texts:
        for no, ans in ANSWER_INLINE_RE.findall(t):
            answers.setdefault(int(no), ans)
    for i in range(len(texts) - 1):
        nums, letters = number_run(texts[i]), letter_run(texts[i + 1])
        if nums and len(nums) == len(letters):
            for no, ans in zip(nums, letters):
                answers.setdefault(no, ans)
    explanations: dict[int, list[str]] = {}
    current = None
    last = 0
    for t in texts:
        m = QNUM_RE.match(t)
        if m and (last == 0 or int(m.group(1)) in (last + 1, last + 2)):
            current = last = int(m.group(1))
            explanations[current] = [m.group(2)]
            tag = ANSWER_TAG_RE.search(t)
            if tag:
                answers.setdefault(current, tag.group(1))
            continue
        if current is not None:
            explanations[current].append(t)
            tag = ANSWER_TAG_RE.search(t)
            if tag and current not in answers:
                answers[current] = tag.group(1)
    return answers, {k: " ".join(v).strip() for k, v in explanations.items()}


def attach_figures(sections: list[dict], figures: list[Figure]) -> list[str]:
    """每張圖掛到同一頁中、起點在圖上方最近的題目；題組文章裡的圖掛題組；都找不到就留在 loose。"""
    anchors = []
    for s in sections:
        for g in s["groups"]:
            anchors.append((g["_page"], g["_y"], g))
            for q in g["questions"]:
                anchors.append((q.get("_page", g["_page"]), q["_y"], q))
    anchors.sort(key=lambda a: (a[0], a[1]))
    loose = []
    for f in figures:
        before = [a for a in anchors if (a[0], a[1]) <= (f.page, f.y)]
        if before:
            before[-1][2]["images"].append(f.path)
        else:
            loose.append(f.path)
    return loose


def clean(obj):
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [clean(v) for v in obj]
    return obj


# ── 主流程 ──────────────────────────────────────────────────────────────

def slug(s: str) -> str:
    return re.sub(r"[\\/:*?\"<>|\s]+", "_", s).strip("_")[:80] or "exam"


def transcribe_pdf(src: Path | bytes, name: str, zf: zipfile.ZipFile, prefix: str, opts: Options,
                   progress: Callable[[int, int, str], None] = lambda *a: None) -> list[dict]:
    """處理一份 PDF，把每一回的 exam.json 與圖檔寫進 zf，回傳每回的摘要。"""
    doc = pymupdf.open(stream=src, filetype="pdf") if isinstance(src, bytes) else pymupdf.open(src)
    specs = exam_specs(doc, opts, name)
    total = sum(len(s.q_pages) + len(s.a_pages) for s in specs)
    done = 0
    summaries = []
    used = set()
    for spec in specs:
        base = slug(spec.title)
        while base in used:
            base += "_"
        used.add(base)
        root = f"{prefix}/{base}" if prefix else base
        lines: list[Line] = []
        figures: list[Figure] = []
        ocr_pages, needs_ocr = [], []
        for part, pages in (("q", spec.q_pages), ("a", spec.a_pages)):
            for p in pages:
                page = doc[p]
                raw = text_lines(page)
                scanned = sum(len(r[0].strip()) for r in raw) < 40
                if (scanned and opts.ocr) or opts.force_ocr:
                    if HAS_OCR:
                        raw = ocr_lines(page, opts.ocr_lang)
                        ocr_pages.append(p + 1)
                    else:
                        needs_ocr.append(p + 1)
                for t, x0, y0, x1, y1 in reading_order(raw, page.rect.width):
                    t = norm(t)
                    if t and not PAGE_NO_RE.fullmatch(t):  # 去掉頁碼（答案表的長串數字要保留）
                        lines.append(Line(t, p, y0, y1, x0, part))
                if part == "q" and not scanned:
                    for k, (rect, kind) in enumerate(figure_rects(page)):
                        pix = page.get_pixmap(clip=rect, dpi=opts.dpi)
                        path = f"images/p{p + 1:04d}_{k + 1}.png"
                        zf.writestr(f"{root}/{path}", pix.tobytes("png"))
                        figures.append(Figure(p, (rect.y0 + rect.y1) / 2, path, pix.width, pix.height, kind))
                if opts.page_images == "all" or (opts.page_images == "scanned" and scanned):
                    pix = page.get_pixmap(dpi=opts.dpi)
                    zf.writestr(f"{root}/pages/p{p + 1:04d}.png", pix.tobytes("png"))
                done += 1
                progress(done, total, spec.title)

        q_lines = [ln for ln in lines if ln.part == "q"]
        a_lines = [ln for ln in lines if ln.part == "a"]
        if not spec.a_pages:
            start = find_answer_start(q_lines)
            if start is not None:
                a_lines = [ln for ln in q_lines if ln.page >= start]
                q_lines = [ln for ln in q_lines if ln.page < start]
        sections, unparsed = parse_questions(q_lines)
        answers, explanations = parse_answers(a_lines)
        n_q = n_ans = 0
        for s in sections:
            choice = s["type"] not in NON_CHOICE
            for g in s["groups"]:
                for q in g["questions"]:
                    q["kind"] = "choice" if choice else "non_choice"
                    if choice:  # 解析的題號是選擇題的題號；非選擇題（翻譯、作文）不套用
                        n_q += 1
                        q["answer"] = answers.get(q["no"])
                        q["explanation"] = explanations.get(q["no"])
                        n_ans += q["answer"] is not None
        loose = attach_figures(sections, figures)
        exam = {
            "schema": SCHEMA,
            "title": spec.title,
            "source": {"file": name, "question_pages": [p + 1 for p in spec.q_pages],
                       "answer_pages": [p + 1 for p in spec.a_pages] or
                       sorted({ln.page + 1 for ln in a_lines})},
            "sections": clean(sections),
            "figures": [{"path": f.path, "page": f.page + 1, "kind": f.kind, "width": f.width, "height": f.height}
                        for f in figures],
            "loose_figures": loose,
            "unparsed_text": unparsed,
            "ocr": {"ocr_pages": ocr_pages, "needs_ocr_pages": needs_ocr, "engine": "tesseract" if ocr_pages else None},
            "stats": {"sections": len(sections), "questions": n_q, "answers_found": n_ans, "figures": len(figures)},
            "warnings": warnings_for(sections, n_q, n_ans, needs_ocr),
        }
        zf.writestr(f"{root}/exam.json", json.dumps(exam, ensure_ascii=False, indent=2))
        summaries.append({"title": spec.title, "path": f"{root}/exam.json", **exam["stats"],
                          "ocr_pages": len(ocr_pages), "needs_ocr_pages": len(needs_ocr), "warnings": exam["warnings"]})
    doc.close()
    return summaries


def warnings_for(sections: list[dict], n_q: int, n_ans: int, needs_ocr: list[int]) -> list[str]:
    w = []
    if needs_ocr:
        w.append(f"{len(needs_ocr)} 頁是掃描檔但沒有 OCR 引擎，文字沒有轉出來（已附整頁圖）")
    if not sections:
        w.append("找不到大題標題，題目可能沒有正確切開")
    if n_q and n_ans < n_q * 0.5:
        w.append(f"只對到 {n_ans}/{n_q} 題答案，解析格式可能不同")
    nos = sorted(q["no"] for s in sections if s["type"] not in NON_CHOICE for g in s["groups"] for q in g["questions"])
    gaps = [b for a, b in zip(nos, nos[1:]) if b != a + 1]
    if gaps:
        w.append(f"題號不連續（在 {', '.join(map(str, gaps[:5]))} 附近），請對照原檔")
    return w


def transcribe_many(inputs: Iterable[tuple[str, Path | bytes]], out: Path | io.BytesIO, opts: Options,
                    progress: Callable[[str, int, int, str], None] = lambda *a: None) -> dict:
    """多份 PDF 一起處理，打包成一個 zip：每份一個資料夾、每回一個子資料夾，最上層有 index.json。"""
    index = {"schema": SCHEMA, "files": []}
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, src in inputs:
            try:
                exams = transcribe_pdf(src, name, zf, slug(Path(name).stem), opts,
                                       lambda d, t, title, n=name: progress(n, d, t, title))
                index["files"].append({"file": name, "exams": exams})
            except Exception as exc:  # noqa: BLE001  單檔失敗不影響其他檔
                index["files"].append({"file": name, "error": f"{type(exc).__name__}: {exc}"})
        zf.writestr("index.json", json.dumps(index, ensure_ascii=False, indent=2))
    return index
