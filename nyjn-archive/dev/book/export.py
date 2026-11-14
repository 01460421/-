#!/usr/bin/env python3
"""《量雨的人》的可編輯檔：把 ms/*.txt 轉成 Word（直排）和純文字。

用法：python3 dev/book/export.py        需要 python-docx（pip install python-docx）
輸出：dev/book/量雨的人.docx、dev/book/量雨的人.txt

稿子的記號和 build.cjs 讀的是同一套（見 README.md）。Word 檔裡的樣式都有名字，改樣式就能整本一起改：
「內文」「問答」「舞台指示」「詩行」「附註」「落款」，以及標題 1（卷）、標題 2（篇）、標題 3（小題）。
"""
import glob
import os
import re

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

DIR = os.path.dirname(os.path.abspath(__file__))
BODY, HEAD = 'Iansui', 'NiYu'            # 內文：芫荽；標題：逆雨。沒有安裝的話 Word 會自己換字型
GOLD, GREY, INK = RGBColor(0x9C, 0x6B, 0x22), RGBColor(0x6B, 0x6B, 0x6B), RGBColor(0x1B, 0x1B, 0x1B)
FW = str.maketrans('0123456789', '０１２３４５６７８９')   # 直排：數字用全形


def parse():
    book = {'front': None, 'vols': [], 'back': None}
    cur = None
    for f in sorted(glob.glob(os.path.join(DIR, 'ms', '*.txt'))):
        for line in open(f, encoding='utf-8').read().split('\n'):
            line = line.rstrip()
            if line.startswith('=FRONT '):
                t, s = (line[7:].split('|') + [''])[:2]
                cur = book['front'] = {'title': t, 'sub': s, 'kind': 'prose', 'lines': []}
            elif line.startswith('=BACK '):
                cur = book['back'] = {'title': line[6:].strip(), 'sub': '', 'kind': 'prose', 'lines': []}
            elif line.startswith('=VOL '):
                no, title, genre, epi = (line[5:].split('|') + ['', '', ''])[:4]
                book['vols'].append({'no': no, 'title': title, 'genre': genre, 'epi': epi.split('/'), 'pieces': []})
                cur = None
            elif line.startswith('=PIECE '):
                t, s, k = (line[7:].split('|') + ['', 'prose'])[:3]
                cur = {'title': t, 'sub': s, 'kind': (k or 'prose').strip(), 'lines': []}
                book['vols'][-1]['pieces'].append(cur)
            elif cur is not None:
                cur['lines'].append(line)
    return book


def blocks(piece):
    """一行一個 (種類, 內容)。種類：p、p0、dl、stage、kn、pl、gap、sub、num、note、sig、br"""
    kind, out = piece['kind'], []
    for line in piece['lines']:
        if line == '':
            if kind == 'poem' and out and out[-1][0] != 'gap':
                out.append(('gap', ''))
            continue
        x = line.translate(FW)
        if line.startswith('>'):
            out.append(('note' if re.search('[。」]$', x) else 'sig', x[1:]))
        elif line == '***':
            out.append(('br', ''))
        elif line.startswith('##'):
            out.append(('sub', x[2:]))
        elif line.startswith('#'):
            out.append(('num', x[1:]))
        elif kind == 'poem':
            out.append(('pl', x))
        elif kind == 'koan':
            m = re.match('〔(.+?)〕(.*)$', x)
            out.append(('kn', (m.group(1), m.group(2))) if m else ('p0', x))
        elif kind in ('dialog', 'play') and '｜' in x and x.index('｜') > 0:
            who, say = x.split('｜', 1)
            out.append(('dl', (who, say)))
        elif kind in ('dialog', 'play') and x.startswith('（'):
            out.append(('stage', x))
        else:
            out.append(('p', x))
    while out and out[-1][0] == 'gap':
        out.pop()
    return out


# ── Word ──────────────────────────────────────────────────────────────
def fonts(obj, name, size=None, color=None, bold=None):
    f = obj.font
    f.name = name
    rpr = obj.element.get_or_add_rPr()
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts')
        rpr.append(rf)
    for a in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
        rf.set(qn(a), name)
    for a in ('w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'):   # 內建標題樣式指向佈景主題字型，不拿掉的話上面設的字型不會生效
        if rf.get(qn(a)) is not None:
            del rf.attrib[qn(a)]
    if size:
        f.size = Pt(size)
    if color is not None:
        f.color.rgb = color
    if bold is not None:
        f.bold = bold


def style(doc, name, base='Normal', font=BODY, size=11, color=INK, indent=0, left=0, before=0, after=0, keep=False, brk=False, align=None):
    try:
        st = doc.styles[name]
    except KeyError:
        st = doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
        st.base_style = doc.styles[base]
    fonts(st, font, size, color, False)
    pf = st.paragraph_format
    pf.first_line_indent = Pt(size * indent) if indent else Pt(0)
    pf.left_indent = Pt(11 * left)
    pf.space_before, pf.space_after = Pt(before), Pt(after)
    pf.line_spacing_rule, pf.line_spacing = WD_LINE_SPACING.MULTIPLE, 1.55
    pf.keep_with_next, pf.page_break_before = keep, brk
    pf.widow_control = False
    if align is not None:
        pf.alignment = align
    return st


def make_docx(book, path):
    doc = Document()
    sec = doc.sections[0]
    sec.orientation = WD_ORIENT.PORTRAIT
    sec.page_width, sec.page_height = Mm(148.5), Mm(210)
    sec.top_margin = sec.bottom_margin = Mm(20)
    sec.left_margin, sec.right_margin = Mm(18), Mm(22)
    td = OxmlElement('w:textDirection')            # 直排，由右而左
    td.set(qn('w:val'), 'tbRl')
    grid = sec._sectPr.find(qn('w:docGrid'))        # 順序有規定：textDirection 要排在 docGrid 前面，不然 Word 會說檔案損毀
    if grid is not None:
        grid.addprevious(td)
    else:
        sec._sectPr.append(td)
    cp = doc.core_properties
    cp.title, cp.author, cp.last_modified_by = '量雨的人', 'Omega', 'Omega'
    cp.subject, cp.comments = '《重返未來：1999》二創小說', ''

    J = WD_ALIGN_PARAGRAPH.JUSTIFY
    style(doc, 'Normal', font=BODY, size=11, align=J)
    doc.styles['Normal'].name = '內文'
    S = {
        'p': style(doc, '內文首行縮排', '內文', indent=2, align=J),
        'p0': doc.styles['內文'],
        'dl': style(doc, '問答', '內文', align=J),
        'stage': style(doc, '舞台指示', '內文', color=RGBColor(0x4A, 0x4A, 0x4A), left=3),
        'kn': style(doc, '語錄', '內文', align=J),
        'pl': style(doc, '詩行', '內文', left=2, align=WD_ALIGN_PARAGRAPH.LEFT),
        'note': style(doc, '附註', '內文', size=9, color=GREY, left=4, before=11),
        'sig': style(doc, '落款', '內文', size=9.5, color=GREY, before=11, align=WD_ALIGN_PARAGRAPH.RIGHT),
        'br': style(doc, '分節', '內文', color=GOLD, before=6, after=6, align=WD_ALIGN_PARAGRAPH.CENTER),
        'num': style(doc, '詩節數字', '內文', font=HEAD, size=14, color=GOLD, left=1, before=11, keep=True),
        'epi': style(doc, '題辭', '內文', size=10.5, color=GREY, left=8),
        'genre': style(doc, '體裁', '內文', size=9.5, color=GREY, left=6, after=11),
        'sub2': style(doc, '副題', '內文', size=9.5, color=GREY, left=5, after=11, keep=True),
        'meta': style(doc, '書前小字', '內文', size=10, color=GREY, left=10),
    }
    h1 = style(doc, 'Heading 1', '內文', font=HEAD, size=26, left=3, before=40, after=11, keep=True, brk=True, align=WD_ALIGN_PARAGRAPH.LEFT)
    h2 = style(doc, 'Heading 2', '內文', font=HEAD, size=20, left=1, after=11, keep=True, brk=True, align=WD_ALIGN_PARAGRAPH.LEFT)
    h3 = style(doc, 'Heading 3', '內文', font=HEAD, size=13.5, left=1, before=11, keep=True, align=WD_ALIGN_PARAGRAPH.LEFT)
    tt = style(doc, 'Title', '內文', font=HEAD, size=44, left=4, before=60, after=22, align=WD_ALIGN_PARAGRAPH.LEFT)

    def para(text, st):
        return doc.add_paragraph(text, style=st)

    def lead(p, label, text, sep='　'):
        r = p.add_run(label + sep)
        fonts(r, BODY, None, GOLD, True)
        p.add_run(text)

    def body(piece):
        for t, x in blocks(piece):
            if t == 'gap':
                para('', S['pl'])
            elif t == 'br':
                para('＊　＊　＊', S['br'])
            elif t == 'sub':
                para(x, h3)
            elif t == 'dl':
                lead(doc.add_paragraph(style=S['dl']), x[0], x[1])
            elif t == 'kn':
                lead(doc.add_paragraph(style=S['kn']), '〔' + x[0] + '〕', x[1], sep='')
            else:
                para(x, S[t])

    # 扉頁
    para('量雨的人', tt)
    para('Omega　著', S['meta'])
    para('重返未來：１９９９　二創小說', S['meta'])
    para('丙午冬月', S['meta'])
    p = para('', S['p0'])
    p.add_run().add_break(WD_BREAK.PAGE)
    for l in ['雨把年份帶走，', '人把東西留下。', '我是盛著那些東西走來的。']:
        para(l, S['epi'])

    # 序
    f = book['front']
    para(f['title'], h2)
    if f['sub']:
        para(f['sub'], S['sub2'])
    body(f)

    for v in book['vols']:
        para(v['no'] + '　' + v['title'], h1)
        para(v['genre'], S['genre'])
        for l in v['epi']:
            para(l, S['epi'])
        for pc in v['pieces']:
            para(pc['title'], h2)
            if pc['sub']:
                para(pc['sub'], S['sub2'])
            body(pc)

    b = book['back']
    para(b['title'], h2)
    body(b)

    para('版權頁', h2)
    for l in ['著者　Omega',
              '所本　《重返未來：１９９９》主線，序幕至第十三章',
              '體例　依《巔峰集》，分八卷',
              '成書　二〇二六年十一月',
              '本書是愛好者的二次創作，不是官方出版品，也不作營利之用。《重返未來：１９９９》的名稱、世界觀與人物，權利屬於深藍互動（Bluepoch）。',
              '全書以司辰的手提箱為敘事者。年份與事件依主線已經寫出的部分；主線留白的地方，本書不代為補寫。幾處添寫，在後記裡一一交代。']:
        para(l, S['p0'])
    doc.save(path)


# ── 純文字 ────────────────────────────────────────────────────────────
def make_txt(book, path):
    o = ['量雨的人', 'Omega　著', '《重返未來：1999》二創小說', '', '雨把年份帶走，', '人把東西留下。', '我是盛著那些東西走來的。', '']

    def body(piece):
        for t, x in blocks(piece):
            x = x if not isinstance(x, str) else x.translate(str.maketrans('０１２３４５６７８９', '0123456789'))
            if t == 'gap':
                o.append('')
            elif t == 'br':
                o.extend(['', '　　　　＊　＊　＊', ''])
            elif t == 'sub':
                o.extend(['', '◎' + x])
            elif t == 'num':
                o.extend(['', x])
            elif t == 'dl':
                o.append(x[0] + '：' + x[1])
            elif t == 'kn':
                o.append('〔' + x[0] + '〕' + x[1])
            elif t == 'stage':
                o.append('　　' + x)
            elif t == 'pl':
                o.append(x)
            elif t == 'note':
                o.extend(['', '（' + x + '）'])
            elif t == 'sig':
                o.extend(['', '　　　　　　　　' + x])
            elif t == 'p0':
                o.append(x)
            else:
                o.append('　　' + x)

    def piece(title, sub, pc):
        o.extend(['', '', '〈' + title + '〉' + ('　' + sub if sub else ''), ''])
        body(pc)

    f = book['front']
    piece(f['title'], f['sub'], f)
    for v in book['vols']:
        o.extend(['', '', '', '════════════════', v['no'] + '　' + v['title'] + '（' + v['genre'] + '）', '════════════════'] + ['　　' + l for l in v['epi']])
        for pc in v['pieces']:
            piece(pc['title'], pc['sub'], pc)
    b = book['back']
    piece(b['title'], '', b)
    o.extend(['', '', '────────────────', '本書是愛好者的二次創作，不是官方出版品，也不作營利之用。', '《重返未來：1999》的名稱、世界觀與人物，權利屬於深藍互動（Bluepoch）。', ''])
    open(path, 'w', encoding='utf-8-sig', newline='\r\n').write('\n'.join(o))


if __name__ == '__main__':
    bk = parse()
    make_docx(bk, os.path.join(DIR, '量雨的人.docx'))
    make_txt(bk, os.path.join(DIR, '量雨的人.txt'))
    n = sum(len(re.findall('[一-鿿]', '\n'.join(pc['lines']))) for v in bk['vols'] for pc in v['pieces'])
    print('量雨的人.docx、量雨的人.txt｜八卷正文漢字', n)
