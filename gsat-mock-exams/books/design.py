"""成冊用的封面、目錄、考次扉頁、封底（HTML → A4 PDF，Playwright 無頭 Chromium）。

幾何色塊依科目配色，用書名當亂數種子，同一本每次產生的版面都一樣、不同本各有變化。
"""
from __future__ import annotations

import html
import random
from pathlib import Path

FONTS = Path(__file__).resolve().parent / "fonts"
CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

# 每科：深色（主色）、亮色、輔色、點綴、紙色
PALETTES = {
    "國文": ["#7a1f2b", "#c8553d", "#e9b44c", "#2d3047", "#f6efe4"],
    "英文": ["#14315c", "#2a9d8f", "#f4a261", "#e76f51", "#f1f5f9"],
    "數學A": ["#2b2d6e", "#5b5fc7", "#f2b134", "#ef6f6c", "#f4f3fb"],
    "數學B": ["#1d4d3a", "#4f9d69", "#d9c26a", "#e07a5f", "#f2f6ef"],
    "自然": ["#0b4f6c", "#01baef", "#20bf55", "#fbb13c", "#eef8fb"],
}
ROUND_NAME = {2: "第二次", 3: "第三次", 4: "第四次"}

BASE_CSS = f"""
@font-face {{ font-family: Sans; src: url('file://{FONTS}/NotoSansTC.ttf'); font-weight: 100 900; }}
@font-face {{ font-family: Serif; src: url('file://{FONTS}/NotoSerifTC.ttf'); font-weight: 200 900; }}
@page {{ size: A4; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 210mm; }}
body {{ font-family: Sans, sans-serif; color: #1f2430; }}
.page {{ width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; }}
.page:last-child {{ page-break-after: auto; }}
svg.bg {{ position: absolute; inset: 0; width: 100%; height: 100%; }}
"""


def shapes(seed: str, pal: list[str], density: int, region: tuple[float, float, float, float],
           opacity: tuple[float, float] = (0.85, 1.0)) -> str:
    """在 region（x0, y0, x1, y1，單位 mm）內隨機擺幾何色塊：方塊、圓、半圓、三角、斜條、點陣。"""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    grid = 21  # 對齊 21mm 格線，色塊排起來比較整齊
    for _ in range(density):
        c = rnd.choice(pal[:4])
        op = rnd.uniform(*opacity)
        x = x0 + rnd.randrange(0, max(1, int((x1 - x0) // grid))) * grid
        y = y0 + rnd.randrange(0, max(1, int((y1 - y0) // grid))) * grid
        s = grid * rnd.choice([1, 1, 2, 2, 3])
        kind = rnd.choice(["rect", "circle", "half", "tri", "stripe", "ring", "dots", "quarter"])
        if kind == "rect":
            out.append(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{c}" opacity="{op:.2f}"/>')
        elif kind == "circle":
            out.append(f'<circle cx="{x + s / 2}" cy="{y + s / 2}" r="{s / 2}" fill="{c}" opacity="{op:.2f}"/>')
        elif kind == "ring":
            out.append(f'<circle cx="{x + s / 2}" cy="{y + s / 2}" r="{s / 2 - 2}" fill="none" stroke="{c}" stroke-width="3" opacity="{op:.2f}"/>')
        elif kind == "half":
            rot = rnd.choice([0, 90, 180, 270])
            out.append(f'<path d="M{x},{y + s} A{s / 2},{s / 2} 0 0 1 {x + s},{y + s} Z" fill="{c}" opacity="{op:.2f}" '
                       f'transform="rotate({rot} {x + s / 2} {y + s * 0.75})"/>')
        elif kind == "quarter":
            rot = rnd.choice([0, 90, 180, 270])
            out.append(f'<path d="M{x},{y} L{x + s},{y} A{s},{s} 0 0 1 {x},{y + s} Z" fill="{c}" opacity="{op:.2f}" '
                       f'transform="rotate({rot} {x + s / 2} {y + s / 2})"/>')
        elif kind == "tri":
            rot = rnd.choice([0, 90, 180, 270])
            out.append(f'<path d="M{x},{y + s} L{x + s},{y + s} L{x},{y} Z" fill="{c}" opacity="{op:.2f}" '
                       f'transform="rotate({rot} {x + s / 2} {y + s / 2})"/>')
        elif kind == "stripe":
            lines = "".join(f'<line x1="{x + i * 4}" y1="{y + s}" x2="{x + i * 4 + s / 2}" y2="{y}" stroke="{c}" stroke-width="1.6"/>'
                            for i in range(int(s // 4)))
            out.append(f'<g opacity="{op:.2f}"><clipPath id="c{len(out)}"><rect x="{x}" y="{y}" width="{s}" height="{s}"/></clipPath>'
                       f'<g clip-path="url(#c{len(out)})">{lines}</g></g>')
        else:  # dots
            dots = "".join(f'<circle cx="{x + 3 + i * 5}" cy="{y + 3 + j * 5}" r="1.1" fill="{c}"/>'
                           for i in range(int(s // 5)) for j in range(int(s // 5)))
            out.append(f'<g opacity="{op:.2f}">{dots}</g>')
    return "\n".join(out)


def mosaic(seed: str, pal: list[str], region: tuple[float, float, float, float], cell: float = 21,
           fill: float = 1.0) -> str:
    """不重疊的幾何拼貼：每格一個底色加一個圖形，偶爾合併成 2×2 大格；fill<1 時隨機留白。"""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    cols, rows = int((x1 - x0) // cell), int((y1 - y0) // cell)
    used = [[False] * cols for _ in range(rows)]
    colors = pal[:4] + [pal[4]]
    out = []
    for r in range(rows):
        for c in range(cols):
            if used[r][c]:
                continue
            big = (r + 1 < rows and c + 1 < cols and not used[r][c + 1] and not used[r + 1][c]
                   and not used[r + 1][c + 1] and rnd.random() < 0.18)
            n = 2 if big else 1
            for dr in range(n):
                for dc in range(n):
                    used[r + dr][c + dc] = True
            if rnd.random() > fill:
                continue
            x, y, s = x0 + c * cell, y0 + r * cell, cell * n
            bg, fg = rnd.sample(colors, 2)
            out.append(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{bg}"/>')
            kind = rnd.choice(["circle", "half", "quarter", "tri", "stripe", "dots", "ring", "none", "quarter"])
            rot = rnd.choice([0, 90, 180, 270])
            t = f'transform="rotate({rot} {x + s / 2} {y + s / 2})"'
            if kind == "circle":
                out.append(f'<circle cx="{x + s / 2}" cy="{y + s / 2}" r="{s * 0.38}" fill="{fg}"/>')
            elif kind == "ring":
                out.append(f'<circle cx="{x + s / 2}" cy="{y + s / 2}" r="{s * 0.32}" fill="none" stroke="{fg}" stroke-width="{s * 0.1}"/>')
            elif kind == "half":
                out.append(f'<path d="M{x},{y + s / 2} A{s / 2},{s / 2} 0 0 1 {x + s},{y + s / 2} Z" fill="{fg}" {t}/>')
            elif kind == "quarter":
                out.append(f'<path d="M{x},{y} L{x + s},{y} A{s},{s} 0 0 1 {x},{y + s} Z" fill="{fg}" {t}/>')
            elif kind == "tri":
                out.append(f'<path d="M{x},{y + s} L{x + s},{y + s} L{x},{y} Z" fill="{fg}" {t}/>')
            elif kind == "stripe":
                k = 6
                out.append("".join(f'<rect x="{x}" y="{y + i * s / k}" width="{s}" height="{s / (2 * k)}" fill="{fg}" {t}/>'
                                   for i in range(k)))
            elif kind == "dots":
                k = 4
                out.append("".join(f'<circle cx="{x + (i + .5) * s / k}" cy="{y + (j + .5) * s / k}" r="{s / (k * 4.5)}" fill="{fg}"/>'
                                   for i in range(k) for j in range(k)))
    return "\n".join(out)


def svg(content: str, bg: str) -> str:
    return (f'<svg class="bg" viewBox="0 0 210 297" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'
            f'<rect width="210" height="297" fill="{bg}"/>{content}</svg>')


def cover(subject: str, rnd_: int, years: str, exams: list[dict]) -> str:
    pal = PALETTES[subject]
    seed = f"cover-{subject}-{rnd_}"
    blocks = mosaic(seed, pal, (0, 0, 210, 168))
    band = f'<rect x="0" y="168" width="210" height="129" fill="{pal[0]}"/>'
    accent = f'<rect x="18" y="176" width="42" height="4" fill="{pal[2]}"/>'
    providers = "、".join(sorted({e["provider"] for e in exams}))
    return f"""<div class="page">{svg(blocks + band + accent, pal[4])}
  <div style="position:absolute;left:18mm;top:186mm;right:18mm;color:#fff">
    <div style="font-family:Serif;font-weight:900;font-size:56pt;line-height:1.05;letter-spacing:2pt">{html.escape(subject)}</div>
    <div style="font-weight:700;font-size:22pt;margin-top:5mm;letter-spacing:3pt">學測模擬考　{ROUND_NAME[rnd_]}　試題與詳解</div>
    <div style="font-size:12pt;margin-top:7mm;opacity:.9;line-height:1.7">{years} 學測　·　{providers}　·　共 {len(exams)} 回<br>
      試題卷　·　完整詳解　·　級距與五標</div>
  </div>
  <div style="position:absolute;right:18mm;bottom:14mm;color:#fff;font-size:9pt;opacity:.75">個人備考用　非賣品</div>
  <div style="position:absolute;right:18mm;top:186mm;color:{pal[2]};font-weight:900;font-size:13pt;letter-spacing:3pt">VOL.{rnd_ - 1}</div>
</div>"""


def toc(subject: str, rnd_: int, entries: list[dict]) -> str:
    pal = PALETTES[subject]
    deco = mosaic(f"toc-{subject}-{rnd_}", pal, (147, 0, 210, 42), fill=0.8)
    rows = []
    for e in entries:
        rows.append(f"""<tr><td style="padding:2.6mm 0;border-bottom:.3mm solid #d8dce3">
          <span style="display:inline-block;width:9mm;height:9mm;background:{pal[e['i'] % 4]};color:#fff;text-align:center;line-height:9mm;font-weight:800;margin-right:4mm">{e['i'] + 1}</span>
          <span style="font-weight:700">{html.escape(e['title'])}</span>
          <span style="color:#6b7280;font-size:9.5pt;margin-left:2mm">{html.escape(e['sub'])}</span></td>
          <td style="text-align:right;border-bottom:.3mm solid #d8dce3;color:#374151;font-size:10pt;white-space:nowrap">{('試題＋詳解 p.' + str(e['q_page'])) if e.get('combined') and not e['a_page'] else ('試題 p.' + str(e['q_page'] or '—') + '　詳解 p.' + str(e['a_page'] or '—'))}</td></tr>""")
    return f"""<div class="page">{svg(deco, '#ffffff')}
  <div style="position:absolute;left:18mm;top:20mm;right:18mm">
    <div style="font-size:10pt;color:{pal[0]};font-weight:800;letter-spacing:3pt">CONTENTS</div>
    <div style="font-family:Serif;font-size:28pt;font-weight:900;color:{pal[0]};margin:2mm 0 8mm">目錄</div>
    <table style="width:100%;border-collapse:collapse;font-size:11pt">{''.join(rows)}</table>
  </div>
</div>"""


def divider(subject: str, entry: dict, band: dict | None) -> str:
    pal = PALETTES[subject]
    c = pal[entry["i"] % 4]
    deco = mosaic(f"div-{subject}-{entry['title']}", pal, (84, 0, 210, 126), fill=0.7)
    side = f'<rect x="0" y="0" width="14" height="297" fill="{c}"/>'
    stats = ""
    if band:
        cells = "".join(
            f'<div style="flex:1;text-align:center"><div style="font-size:8.5pt;color:#6b7280">{k}</div>'
            f'<div style="font-size:18pt;font-weight:800;color:{pal[0]}">{band.get(f, "—") if band.get(f) not in (None, "") else "—"}</div></div>'
            for k, f in (("頂標", "top"), ("前標", "front"), ("均標", "mean"), ("後標", "back"), ("底標", "bottom")))
        extra = []
        if band.get("band"):
            extra.append(f"級距 {band['band']}")
            extra.append(f"15 級分門檻：原始分數 > {float(band['band']) * 14:.2f}")
        if band.get("examinees"):
            extra.append(f"到考 {int(band['examinees']):,} 人")
        stats = f"""<div style="margin-top:14mm;border-top:.6mm solid {pal[0]};padding-top:5mm">
      <div style="font-size:10pt;font-weight:800;color:{pal[0]};letter-spacing:2pt;margin-bottom:3mm">成績統計</div>
      <div style="display:flex;gap:2mm">{cells}</div>
      <div style="margin-top:4mm;font-size:10pt;color:#374151">{'　·　'.join(extra)}</div></div>"""
    return f"""<div class="page">{svg(deco + side, '#ffffff')}
  <div style="position:absolute;left:28mm;top:140mm;right:22mm">
    <div style="font-size:60pt;font-weight:900;color:{c};line-height:1">{entry['i'] + 1:02d}</div>
    <div style="font-family:Serif;font-size:26pt;font-weight:900;margin-top:4mm;color:{pal[0]}">{html.escape(entry['title'])}</div>
    <div style="font-size:12pt;color:#4b5563;margin-top:3mm">{html.escape(entry['sub'])}</div>
    {stats}
  </div>
</div>"""


def back(subject: str, rnd_: int, sources: list[str]) -> str:
    pal = PALETTES[subject]
    blocks = mosaic(f"back-{subject}-{rnd_}", pal, (0, 210, 210, 294))
    top = f'<rect x="0" y="0" width="210" height="10" fill="{pal[0]}"/>'
    src = "　".join(html.escape(s) for s in sources)
    return f"""<div class="page">{svg(top + blocks, pal[4])}
  <div style="position:absolute;left:24mm;right:24mm;top:58mm;text-align:center">
    <div style="font-family:Serif;font-size:20pt;font-weight:900;color:{pal[0]}">{html.escape(subject)}　學測模擬考　{ROUND_NAME[rnd_]}</div>
    <div style="width:30mm;height:1.2mm;background:{pal[2]};margin:6mm auto"></div>
    <div style="font-size:10pt;color:#374151;line-height:1.9">
      本冊收錄公開分享的模擬考試題卷與詳解，依學測年由新到舊排列。<br>
      試題著作權屬各命題單位所有，僅供個人備考使用，請勿轉售或散布。<br>
      級距與五標取自各考次公布之成績統計；15 級分門檻＝級距 × 14。</div>
    <div style="font-size:8.5pt;color:#6b7280;margin-top:10mm;line-height:1.7">資料來源：{src}</div>
  </div>
</div>"""


def render(pages: list[str], out: Path) -> None:
    from playwright.sync_api import sync_playwright

    doc = f"<!doctype html><html><head><meta charset='utf-8'><style>{BASE_CSS}</style></head><body>{''.join(pages)}</body></html>"
    tmp = out.with_suffix(".html")
    tmp.write_text(doc, encoding="utf-8")
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, executable_path=CHROMIUM)
        pg = b.new_page()
        pg.goto(tmp.as_uri(), wait_until="load")
        pg.evaluate("document.fonts.ready")
        pg.pdf(path=str(out), format="A4", print_background=True, prefer_css_page_size=True)
        b.close()
    tmp.unlink()
