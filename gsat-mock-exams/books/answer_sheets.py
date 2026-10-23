"""擬真的學測模擬考答案卡（選擇題劃記）與答案卷（混合題、非選擇題作答區），A4 可直接列印練習。

版面仿照劃記式答案卡的慣例：紅色（光學閱讀機不讀的 dropout 色）框線與圓圈、黑色定位格（timing marks）、
准考證號碼劃記區、劃記範例；答案卷有題號作答框、橫線，國寫用方格稿紙。
僅供練習，不使用大考中心標誌與名稱。題數、選項範圍依新式學測題型設定在 SPECS，可自行調整。

用法：
    .venv/bin/python books/answer_sheets.py OUT_DIR [--subject 英文] [--title "115 學測 第三次模擬考"]
"""
from __future__ import annotations

import argparse
import html
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import design  # noqa: E402

INK = "#d2475a"       # 答案卡紅（dropout color）
INK_SOFT = "#f6d9de"
MARK = "#111111"

ABCD = "ABCD"
ABCDE = "ABCDE"
AJ = "ABCDEFGHIJ"
NUM5 = "12345"
FILL = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "−", "±"]

# 每科：選擇題區段（起訖題號、選項）、選填題、答案卷作答區
SPECS: dict[str, dict] = {
    "國綜": {
        "choice": [(1, 25, ABCD), (26, 34, ABCDE)],
        "sheet": [("混合題", [(35, 5), (36, 5), (37, 6)])],
    },
    "國寫": {
        "choice": [],
        "sheet": [],
        "essay": [("第一題", 18, 20), ("第二題", 30, 20)],   # (題目, 列數, 每列格數)
    },
    "英文": {
        "choice": [(1, 20, ABCD), (21, 30, AJ), (31, 34, ABCDE), (35, 46, ABCD)],
        "sheet": [("混合題", [(47, 2), (48, 2), (49, 3), (50, 3)]),
                  ("非選擇題　一、中譯英", [("1", 3), ("2", 3)]),
                  ("非選擇題　二、英文作文", [("作文", 26)])],
    },
    "數學A": {
        "choice": [(1, 6, NUM5), (7, 11, NUM5)],
        "fill": [("12", 3), ("13", 2), ("14", 3), ("15", 2), ("16", 3), ("17", 2)],
        "sheet": [("混合題或非選擇題", [(18, 6), (19, 9), (20, 9)])],
    },
    "數學B": {
        "choice": [(1, 6, NUM5), (7, 11, NUM5)],
        "fill": [("12", 3), ("13", 2), ("14", 3), ("15", 2), ("16", 3), ("17", 2)],
        "sheet": [("混合題或非選擇題", [(18, 6), (19, 9), (20, 9)])],
    },
    "自然": {
        "choice": [(1, 54, ABCDE)],
        "sheet": [("混合題或非選擇題", [(55, 4), (56, 4), (57, 5), (58, 4), (59, 5), (60, 5)])],
    },
    "社會": {
        "choice": [(1, 54, ABCD), (55, 62, ABCDE)],
        "sheet": [("混合題或非選擇題", [(63, 4), (64, 4), (65, 5), (66, 5), (67, 4), (68, 5)])],
    },
}
PALETTE = {"國綜": "國文", "國寫": "國文"}

CSS = f"""
.card {{ font-family: Sans; color: {INK}; }}
.frame {{ position:absolute; border: .5mm solid {INK}; }}
.lbl {{ font-size: 7pt; color: {INK}; }}
.bubble {{ display:inline-flex; align-items:center; justify-content:center; width:4.9mm; height:3.4mm;
  border:.3mm solid {INK}; border-radius: 1.9mm; font-size:6.3pt; margin-right:.9mm; color:{INK}; line-height:1; }}
.qrow {{ display:flex; align-items:center; height:5.3mm; }}
.qno {{ width:7mm; text-align:right; padding-right:1.4mm; font-size:7pt; font-weight:700; color:{INK}; font-variant-numeric:tabular-nums; }}
.qrow:nth-child(5n) {{ border-bottom:.2mm dashed {INK}; }}
.sheet {{ font-family: Serif; color:#1b1b1b; }}
.box {{ border:.4mm solid #222; margin-bottom:4mm; position:relative; }}
.box-h {{ display:flex; justify-content:space-between; font-family:Sans; font-size:9pt; font-weight:700; padding:1.2mm 2.5mm;
  border-bottom:.3mm solid #222; background:#f2f2f2; }}
.lines {{ background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 7.6mm, #9aa0a6 7.6mm, #9aa0a6 7.9mm); }}
"""


def timing_marks(n: int = 34) -> str:
    """右側與下緣的黑色定位格，讀卡機用來對位；擬真用。"""
    marks = "".join(f'<div style="position:absolute;right:4mm;top:{14 + i * 7.9:.1f}mm;width:5mm;height:2mm;background:{MARK}"></div>'
                    for i in range(n))
    marks += "".join(f'<div style="position:absolute;bottom:4mm;left:{16 + i * 9.4:.1f}mm;width:2mm;height:4mm;background:{MARK}"></div>'
                     for i in range(19))
    return marks


def bubbles(opts: str) -> str:
    return "".join(f'<span class="bubble">{o}</span>' for o in opts)


def id_grid(digits: int = 8) -> str:
    cols = []
    for _ in range(digits):
        cells = "".join(f'<div style="height:3.6mm;display:flex;align-items:center;justify-content:center">'
                        f'<span class="bubble" style="margin:0">{d}</span></div>' for d in range(10))
        cols.append(f'<div style="width:5.6mm;border-right:.2mm solid {INK_SOFT}">'
                    f'<div style="height:5mm;border:.3mm solid {INK};margin:0 .4mm 1mm"></div>{cells}</div>')
    return f'<div style="display:flex">{"".join(cols)}</div>'


def header(subject: str, title: str, kind: str) -> str:
    field = lambda label, w: (f'<div style="display:flex;border:.35mm solid {INK};height:8mm;align-items:stretch;width:{w}">'
                              f'<div style="background:{INK};color:#fff;font-size:8pt;font-weight:700;padding:0 2mm;display:flex;align-items:center">{label}</div>'
                              f'<div style="flex:1"></div></div>')
    return f"""
  <div style="position:absolute;left:12mm;top:9mm;right:14mm;display:flex;justify-content:space-between;align-items:flex-end">
    <div>
      <div style="font-size:8pt;letter-spacing:1pt">{html.escape(title)}　模擬練習用</div>
      <div style="font-size:19pt;font-weight:900;letter-spacing:3pt;line-height:1.25">{html.escape(subject)}考科　{kind}</div>
    </div>
    <div style="text-align:right;font-size:7pt;line-height:1.5">請用 2B 鉛筆劃記<br>修正時用橡皮擦擦拭乾淨</div>
  </div>
  <div style="position:absolute;left:12mm;top:27mm;right:14mm;display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:2mm">
    {field("姓　名", "auto")}{field("班　級", "auto")}{field("座　號", "auto")}
  </div>"""


def answer_card(subject: str, title: str) -> str:
    spec = SPECS[subject]
    rows = [(q, opts) for start, end, opts in spec["choice"] for q in range(start, end + 1)]
    room = 150 if spec.get("fill") else 160          # 選擇題區可用高度（mm）
    per_col = max(10, min(25, int(room // 5.3)))
    if spec.get("fill"):
        per_col = min(per_col, 6)                    # 數學只有 11 題，排兩欄留空間給選填
    cols = [rows[i:i + per_col] for i in range(0, len(rows), per_col)]
    grid = "".join(
        f'<div style="width:{max(len(o) for _, o in c) * 5.8 + 9:.1f}mm">'
        + "".join(f'<div class="qrow"><span class="qno">{q}</span>{bubbles(o)}</div>' for q, o in c) + "</div>"
        for c in cols)

    fill = ""
    if spec.get("fill"):
        blocks = []
        for no, n in spec["fill"]:
            sub = "".join(
                f'<div class="qrow"><span class="qno" style="width:10mm">{no}-{k + 1}</span>{bubbles("".join(FILL))}</div>'
                for k in range(n))
            blocks.append(f'<div style="margin-bottom:2mm">{sub}</div>')
        fill = f"""<div style="margin-top:3mm">
      <div style="font-size:8.5pt;font-weight:900;border-bottom:.4mm solid {INK};margin-bottom:1.5mm">選填題（每一格劃記一個數字或符號）</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:5mm">{''.join(blocks)}</div></div>"""

    sample = (f'<span class="bubble" style="background:{MARK};border-color:{MARK}"></span> 正確　'
              f'<span class="bubble">✓</span><span class="bubble">✕</span><span class="bubble" style="background:linear-gradient(90deg,{MARK} 50%,transparent 50%)"></span> 錯誤')
    has_sheet = bool(spec.get("sheet") or spec.get("essay"))
    return f"""<div class="page card">
  {timing_marks()}
  {header(subject, title, "答案卡")}
  <div style="position:absolute;left:12mm;top:39mm;right:14mm;display:flex;gap:5mm">
    <div class="frame" style="position:relative;padding:2mm 2.5mm">
      <div style="font-size:8pt;font-weight:900;margin-bottom:1mm">准考證號碼</div>{id_grid()}
    </div>
    <div style="flex:1;display:grid;gap:2mm;align-content:start">
      <div class="frame" style="position:relative;padding:2mm 3mm;font-size:7.5pt;line-height:1.7">
        <b>劃記範例</b>　{sample}
      </div>
      <div class="frame" style="position:relative;padding:2mm 3mm;font-size:7pt;line-height:1.65">
        <b>注意事項</b><br>
        1. 選擇題答案必須劃記在本答案卡上，劃記須塗滿圓圈、不可超出框線。<br>
        2. 多選題依題目說明可劃記多個選項；單選題只能劃記一個。<br>
        {"3. 選填題每一格只能劃記一個數字或符號，未用到的格子留白。<br>" if spec.get("fill") else ""}
        {"3. " if not spec.get("fill") else "4. "}{"混合題與非選擇題請在答案卷上作答，並標明題號。" if has_sheet else "本考科僅有選擇題。"}<br>
        請保持答案卡清潔，勿折疊、勿污損。
      </div>
    </div>
  </div>
  <div style="position:absolute;left:12mm;top:{100 if spec['choice'] else 100}mm;right:14mm">
    <div style="font-size:9pt;font-weight:900;border-bottom:.5mm solid {INK};margin-bottom:2mm;display:flex;justify-content:space-between">
      <span>選擇題作答區</span><span style="font-weight:400;font-size:7pt">每五題以虛線分隔</span></div>
    <div style="display:flex;gap:4mm;flex-wrap:wrap">{grid}</div>
    {fill}
  </div>
  <div style="position:absolute;left:12mm;bottom:11mm;font-size:6.5pt;color:{INK}">模擬練習用答案卡・非正式考試用紙</div>
</div>"""


def sheet_pages(subject: str, title: str) -> list[str]:
    spec = SPECS[subject]
    blocks: list[str] = []
    for section, items in spec.get("sheet", []):
        blocks.append(f'<div style="font-family:Sans;font-size:10pt;font-weight:900;margin:1mm 0 2.5mm;border-left:2mm solid #222;padding-left:2mm">{html.escape(section)}</div>')
        for no, nlines in items:
            label = f"第 {no} 題" if str(no).isdigit() else html.escape(str(no))
            blocks.append(f"""<div class="box"><div class="box-h"><span>{label}</span><span style="font-weight:400">得分：　　　</span></div>
              <div class="lines" style="height:{nlines * 7.9:.1f}mm;margin:0 3mm"></div></div>""")
    for name, rows, cols_n in spec.get("essay", []):
        cell = 160 / cols_n
        cells = "".join(f'<div style="border-right:.25mm solid #b9b9b9;border-bottom:.25mm solid #b9b9b9;height:{cell:.2f}mm"></div>'
                        for _ in range(rows * cols_n))
        blocks.append(f"""<div class="box"><div class="box-h"><span>{name}</span><span style="font-weight:400">每格一字，標點占一格。得分：　　　</span></div>
          <div style="margin:3mm auto;width:160mm;display:grid;grid-template-columns:repeat({cols_n},1fr);border-left:.25mm solid #b9b9b9;border-top:.25mm solid #b9b9b9">{cells}</div></div>""")
    # 粗估每塊高度，裝頁（A4 可用約 240mm）
    pages, cur, used = [], [], 0.0
    pending = None                                   # 大題標題先暫存，跟著下一個作答框一起放
    for b in blocks:
        if "border-left:2mm" in b:
            pending = b
            continue
        h = _block_height(b) + 12 + (12 if pending else 0)
        if cur and used + h > 236:
            pages.append(cur)
            cur, used = [], 0.0
        if pending:
            cur.append(pending)
            pending = None
        cur.append(b)
        used += h
    if cur:
        pages.append(cur)
    out = []
    for i, content in enumerate(pages, 1):
        out.append(f"""<div class="page sheet">
  <div style="position:absolute;left:14mm;right:14mm;top:10mm;display:flex;justify-content:space-between;align-items:flex-end;border-bottom:.6mm solid #222;padding-bottom:1.5mm;font-family:Sans">
    <div><div style="font-size:8pt">{html.escape(title)}　模擬練習用</div>
      <div style="font-size:16pt;font-weight:900;letter-spacing:2pt">{html.escape(subject)}考科　答案卷</div></div>
    <div style="font-size:9pt;display:flex;gap:4mm"><span>姓名＿＿＿＿＿＿</span><span>班級＿＿＿</span><span>座號＿＿＿</span></div>
  </div>
  <div style="position:absolute;left:14mm;right:14mm;top:31mm">{''.join(content)}</div>
  <div style="position:absolute;left:0;right:0;bottom:8mm;text-align:center;font-family:Sans;font-size:8.5pt">第 {i} 頁，共 {len(pages)} 頁</div>
</div>""")
    return out


def _block_height(b: str) -> float:
    import re
    m = re.search(r"height:([\d.]+)mm;margin:0 3mm", b)
    if m:
        return float(m.group(1))
    m = re.search(r"repeat\((\d+),", b)
    if m:
        cols_n = int(m.group(1))
        n = b.count("border-right:.25mm") // cols_n
        return n * 160 / cols_n + 6
    return 20.0


def build(subject: str, title: str, out_dir: Path) -> Path:
    pages = []
    if SPECS[subject]["choice"]:
        pages.append(answer_card(subject, title))
    pages += sheet_pages(subject, title)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{subject}_答案卡與答案卷.pdf"
    old_css = design.BASE_CSS
    design.BASE_CSS = old_css + CSS
    try:
        design.render(pages, out)
    finally:
        design.BASE_CSS = old_css
    print(f"{out.name}: {len(pages)} 頁")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--subject", choices=list(SPECS))
    ap.add_argument("--title", default="學科能力測驗模擬考")
    args = ap.parse_args()
    for subject in SPECS:
        if args.subject and subject != args.subject:
            continue
        build(subject, args.title, args.out)


if __name__ == "__main__":
    main()
