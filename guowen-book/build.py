#!/usr/bin/env python3
"""科學班國文歷屆試題詳解集 — 排版引擎
用法：
  python3 build.py                 # 依 content/*.txt 產生 dist/book.html
  python3 build.py --only 115      # 只排某一年（樣張，不含封面目錄）
  python3 build.py --check 115     # 只檢查內容檔格式
PDF 由 render.js 產生（兩階段：先排版取得頁碼，再回填目錄）。
"""
import re, sys, os, json, html, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
CATS = ['形音義', '詞語成語', '語文應用', '國學常識', '白話閱讀', '文言閱讀', '詩詞曲賞析']
CAT_COLOR = {'形音義': '#C8553D', '詞語成語': '#D08C2F', '語文應用': '#5B8E3E', '國學常識': '#2F7F86',
             '白話閱讀': '#3B6FB6', '文言閱讀': '#6B4FA3', '詩詞曲賞析': '#B5477A'}
PEN = {'red': 'red', 'blue': 'blue', 'green': 'green', 'purple': 'purple', 'orange': 'orange'}
ERRORS = []


def err(msg):
    ERRORS.append(msg)


# ---------------------------------------------------------------- 解析
def parse_file(path):
    year = os.path.basename(path).split('.')[0]
    ents, cur, field = [], None, None
    for ln, raw in enumerate(open(path, encoding='utf-8').read().split('\n'), 1):
        line = raw.rstrip()
        if line.startswith('=== '):
            parts = line[4:].split(None, 1)
            cur = {'kind': parts[0], 'arg': parts[1].strip() if len(parts) > 1 else '', 'fields': [], 'line': ln}
            ents.append(cur)
            field = None
            continue
        m = re.match(r'^@([a-z]+)(?:[ \t]+(.*))?$', line)
        if m and cur is not None:
            field = {'name': m.group(1), 'arg': (m.group(2) or '').strip(), 'body': [], 'line': ln}
            cur['fields'].append(field)
            continue
        if field is not None:
            field['body'].append(line)
        elif line.strip() and not line.startswith('#'):
            err(f'{year}:{ln} 內容不屬於任何欄位：{line[:30]}')
    for e in ents:
        for f in e['fields']:
            while f['body'] and not f['body'][-1].strip():
                f['body'].pop()
            while f['body'] and not f['body'][0].strip():
                f['body'].pop(0)
    return year, ents


def first(e, name, default=''):
    for f in e['fields']:
        if f['name'] == name:
            return f['arg'] if f['arg'] else '\n'.join(f['body'])
    return default


def body_of(e, name):
    for f in e['fields']:
        if f['name'] == name:
            return f['body']
    return None


# ---------------------------------------------------------------- 行內標記
INLINE = re.compile(r'\{(y|p|g|b|o|u|ub|c|cb|x|n|nb|ng|np|k):([^{}|]*)(?:\|([^{}]*))?\}')
HL = {'y': 'red', 'p': 'red', 'o': 'orange', 'g': 'green', 'b': 'blue'}


def esc(s):
    return html.escape(s, quote=False)


def inline(s):
    """行內標記 → HTML"""
    out, pos = [], 0
    for m in INLINE.finditer(s):
        out.append(_plain(s[pos:m.start()]))
        t, txt, note = m.group(1), m.group(2), m.group(3)
        txt_h = _plain(txt)
        if t in HL:
            core = f'<mark class="hl hl-{t}">{txt_h}</mark>'
            pen = HL[t]
        elif t in ('u', 'ub'):
            pen = 'blue' if t == 'ub' else 'red'
            core = f'<span class="wavy wavy-{pen}">{txt_h}</span>'
        elif t in ('c', 'cb'):
            pen = 'blue' if t == 'cb' else 'red'
            core = f'<span class="circ circ-{pen}">{txt_h}</span>'
        elif t == 'x':
            pen = 'red'
            core = f'<span class="strike">{txt_h}</span>'
        elif t in ('n', 'nb', 'ng', 'np'):
            pen = {'n': 'red', 'nb': 'blue', 'ng': 'green', 'np': 'purple'}[t]
            out.append(f'<span class="hw ins pen-{pen}">{txt_h}</span>')
            pos = m.end()
            continue
        elif t == 'k':
            out.append(f'<strong class="kw">{txt_h}</strong>')
            pos = m.end()
            continue
        if note:
            out.append(f'<ruby class="an">{core}<rt class="hw pen-{pen}">{_plain(note)}</rt></ruby>')
        else:
            out.append(core)
        pos = m.end()
    out.append(_plain(s[pos:]))
    res = ''.join(out)
    if '{' in res or '}' in res:
        bad = re.search(r'.{0,12}[{}].{0,12}', re.sub(r'<[^>]+>', '', res))
        err(f'行內標記未配對：…{bad.group(0) if bad else res[:30]}…')
    return res


def _plain(s):
    s = esc(s)
    s = re.sub(r'__(.+?)__', r'<span class="ou">\1</span>', s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    return s


def block(lines):
    """區塊標記 → HTML（段落、清單、表格、引文、小標）"""
    out, i = [], 0
    while i < len(lines):
        ln = lines[i].strip()
        if not ln:
            i += 1
            continue
        if ln.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-{2,}:?', c) for c in cells):
                    rows.append(cells)
                i += 1
            h = '<table class="kt"><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in rows[0]) + '</tr></thead><tbody>'
            for r in rows[1:]:
                h += '<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>'
            out.append(h + '</tbody></table>')
            continue
        if ln.startswith('- '):
            items = []
            while i < len(lines) and lines[i].strip().startswith('- '):
                items.append(lines[i].strip()[2:])
                i += 1
            out.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ul>')
            continue
        if ln.startswith('> '):
            items = []
            while i < len(lines) and lines[i].strip().startswith('> '):
                items.append(lines[i].strip()[2:])
                i += 1
            out.append('<blockquote>' + '<br>'.join(inline(x) for x in items) + '</blockquote>')
            continue
        if ln.startswith('## '):
            out.append(f'<h5>{inline(ln[3:])}</h5>')
            i += 1
            continue
        out.append(f'<p>{inline(ln)}</p>')
        i += 1
    return '\n'.join(out)


def text_lines(lines, cls=''):
    """題幹／文本：保留換行"""
    return '<br>'.join(inline(x.strip()) for x in lines if x.strip() != '' or True).replace('<br><br>', '<br>')


# ---------------------------------------------------------------- 版面元件
ARROW = ('<svg class="arr" viewBox="0 0 26 18" aria-hidden="true"><path d="M25 14 C17 15 9 12 3 5" fill="none" '
         'stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2.5 11.5 L2.6 4.6 L9 6.6" fill="none" '
         'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')


def mnotes(notes):
    if not notes:
        return ''
    h = ''
    for color, lines in notes:
        pen = PEN.get(color, 'red')
        body = '<br>'.join(inline(x.strip()) for x in lines if x.strip())
        h += f'<div class="mnote hw pen-{pen}">{ARROW}<span>{body}</span></div>'
    return h


def row(main_html, notes, cls=''):
    return f'<div class="row {cls}"><div class="main">{main_html}</div><aside class="margin">{mnotes(notes)}</aside></div>'


def collect_rows(e):
    """把 stem/box/p/fig/opt 及其後的 note 整理成列"""
    rows, pending = [], []
    for f in e['fields']:
        n = f['name']
        if n in ('stem', 'box', 'p', 'fig', 'table', 'opt', 'src'):
            rows.append({'name': n, 'arg': f['arg'], 'body': f['body'], 'notes': pending})
            pending = []
        elif n == 'note':
            if not rows:
                pending.append((f['arg'] or 'red', f['body']))
                continue
            rows[-1]['notes'].append((f['arg'] or 'red', f['body']))
    return rows


def render_passage_row(r):
    n, arg = r['name'], r['arg']
    if n == 'stem':
        return row(f'<div class="stem">{text_lines(r["body"])}</div>', r['notes'], 'r-stem')
    if n in ('box', 'p'):
        cls = 'poem' if 'poem' in arg else ('prose' if n == 'p' else 'prose')
        label = ''
        m = re.search(r'label=(\S+)', arg)
        if m:
            label = f'<span class="plabel">{esc(m.group(1))}</span>'
        if 'poem' in arg or 'lines' in arg:
            inner = '<br>'.join(inline(x.strip()) for x in r['body'] if x.strip())
        else:
            inner = ''.join(f'<p>{inline(x.strip())}</p>' for x in r['body'] if x.strip())
        wrap = 'qbox' if n == 'box' else 'ptext'
        return row(f'<div class="{wrap} {cls}">{label}{inner}</div>', r['notes'], 'r-' + n)
    if n == 'src':
        return row(f'<div class="psrc">{inline(" ".join(r["body"]) or arg)}</div>', r['notes'], 'r-src')
    if n == 'table':
        return row(f'<div class="qtable">{block(r["body"])}</div>', r['notes'], 'r-table')
    if n == 'fig':
        fn = arg.split()[0]
        if not os.path.exists(os.path.join(ROOT, 'figs', fn)):
            err(f'找不到圖檔 figs/{fn}')
        w = re.search(r'w=(\d+)', arg)
        style = f' style="width:{w.group(1)}%"' if w else ''
        cap = ' '.join(r['body']).strip()
        cap_h = f'<figcaption>{inline(cap)}</figcaption>' if cap else ''
        return row(f'<figure class="qfig"><img src="../figs/{fn}"{style}>{cap_h}</figure>', r['notes'], 'r-fig')
    return ''


def stars(d):
    d = max(1, min(5, int(d or 3)))
    return '<span class="stars">' + '★' * d + '<i>' + '★' * (5 - d) + '</i></span>'


DIFF_LABEL = {1: '易', 2: '中偏易', 3: '中', 4: '中偏難', 5: '難'}


def render_group(year, e):
    gid = e['arg']
    rng = first(e, 'range')
    intro = first(e, 'intro')
    rows = collect_rows(e)
    h = f'<section class="group" id="g{year}-{gid}">'
    h += (f'<header class="gh"><div class="gno">題組</div><div class="gtitle"><b>第 {esc(rng)} 題</b>'
          f'<span>{inline(intro)}</span></div><div class="gid">{year}・閱讀題組</div></header>')
    h += '<div class="paper"><div class="paper-tab"><span>原文重現</span><i>筆記版</i></div>'
    h += ''.join(render_passage_row(r) for r in rows)
    h += '</div>'
    h += extra_blocks(e, group=True)
    h += '</section>'
    return h


def extra_blocks(e, group=False):
    h = ''
    tr = body_of(e, 'translation')
    if tr:
        h += f'<section class="blk trans"><h4><span class="ico">譯</span>語譯</h4><div class="bd">{block(tr)}</div></section>'
    gd = body_of(e, 'guide')
    if gd:
        h += f'<section class="blk guide"><h4><span class="ico">導</span>文本導讀</h4><div class="bd">{block(gd)}</div></section>'
    if group:
        ks = [f for f in e['fields'] if f['name'] == 'know']
        if ks:
            h += know_block(ks)
    return h


def know_block(ks):
    h = '<section class="blk know"><h4><span class="ico">延</span>延伸知識點</h4><div class="kcards">'
    for i, f in enumerate(ks, 1):
        h += (f'<div class="kcard"><div class="kt-title"><b>{i}</b>{inline(f["arg"])}</div>'
              f'<div class="bd">{block(f["body"])}</div></div>')
    return h + '</div></section>'


def score_of(meta, no):
    for rule in meta.get('scoring', []):
        a, b, s = rule
        if a <= no <= b:
            return s
    return ''


def render_question(year, e, meta, qinfo):
    no = int(e['arg'])
    qtype = first(e, 'type')
    cat = first(e, 'cat')
    tags = [t.strip() for t in re.split(r'[,，、]', first(e, 'tags')) if t.strip()]
    diff = int(first(e, 'diff', '3') or 3)
    ans = first(e, 'answer').strip()
    off = meta.get('answers', {}).get(no)
    if cat not in CATS:
        err(f'{year} Q{no}: @cat「{cat}」不在允許清單 {CATS}')
    if off and off != ans:
        err(f'{year} Q{no}: @answer {ans} 與官方答案 {off} 不符')
    rows = collect_rows(e)
    opts = [r for r in rows if r['name'] == 'opt']
    if len(opts) != 4:
        err(f'{year} Q{no}: 選項數 {len(opts)} ≠ 4')
    for req in ('stem', 'key', 'logic'):
        if body_of(e, req) is None:
            err(f'{year} Q{no}: 缺少 @{req}')
    anas = [f for f in e['fields'] if f['name'] == 'ana']
    if len(anas) != 4:
        err(f'{year} Q{no}: @ana 數量 {len(anas)} ≠ 4')
    if not [f for f in e['fields'] if f['name'] == 'know']:
        err(f'{year} Q{no}: 缺少 @know')
    qid = f'{year}-{no:02d}'
    qinfo.append({'year': year, 'no': no, 'id': qid, 'type': qtype, 'cat': cat, 'diff': diff, 'ans': ans,
                  'know': [f['arg'] for f in e['fields'] if f['name'] == 'know']})
    color = CAT_COLOR.get(cat, '#444')

    h = f'<article class="q" id="q{qid}" style="--cat:{color}">'
    h += '<div class="qtop">'
    chips = f'<span class="chip cat">{esc(cat)}</span>' + ''.join(f'<span class="chip">{esc(t)}</span>' for t in tags)
    sc = score_of(meta, no)
    h += (f'<header class="qh"><div class="qno"><small>第</small><b>{no:02d}</b><small>題</small></div>'
          f'<div class="qmeta"><h3>{inline(qtype)}</h3><div class="chips">{chips}</div></div>'
          f'<div class="qright"><div class="qid">{qid}</div><div>{stars(diff)}<em>{DIFF_LABEL[diff]}</em></div>'
          f'<div class="score">配分 {sc} 分</div></div></header>')
    # 原題重現
    h += '<div class="paper"><div class="paper-tab"><span>原題重現</span><i>筆記版</i></div>'
    pre = [r for r in rows if r['name'] != 'opt']
    first_stem = True
    for r in pre:
        if r['name'] == 'stem' and first_stem:
            r = dict(r)
            first_stem = False
            h += row(f'<div class="stem"><span class="sno">{no}.</span>{text_lines(r["body"])}</div>', r['notes'], 'r-stem')
        else:
            h += render_passage_row(r)
    # 選項
    maxlen = max((len(re.sub(r'\{\w+:([^{}|]*)(\|[^{}]*)?\}', r'\1', ' '.join(o['body']))) for o in opts), default=0)
    any_ruby = any('|' in ' '.join(o['body']) for o in opts)
    cols = 4 if maxlen <= 7 else (2 if maxlen <= 17 else 1)
    force = first(e, 'cols')
    if force:
        cols = int(force)

    def opt_html(o):
        k = o['arg'].strip()[:1]
        ok = (k == ans)
        mark = '<span class="hw tick">✓</span>' if ok else ''
        return (f'<div class="opt{" ok" if ok else ""}"><span class="ok-wrap">{mark}<span class="olab">({k})</span></span>'
                f'<span class="otxt">{text_lines(o["body"])}</span></div>')

    if cols == 1:
        for o in opts:
            h += row(opt_html(o), o['notes'], 'r-opt')
    else:
        inner = f'<div class="optgrid c{cols}">' + ''.join(opt_html(o) for o in opts) + '</div>'
        allnotes = [n for o in opts for n in o['notes']]
        h += row(inner, allnotes, 'r-opt')
    h += '</div>'  # paper
    # 答案列
    key = body_of(e, 'key') or []
    h += (f'<div class="ansbar"><div class="ans"><small>答案</small><b>{esc(ans)}</b></div>'
          f'<div class="keyline"><span class="klabel">一句破題</span>{inline(" ".join(x.strip() for x in key))}</div></div>')
    h += '</div>'  # qtop
    # 語譯
    h += extra_blocks(e)
    # 解題邏輯
    lg = body_of(e, 'logic') or []
    steps, cur = [], None
    for ln in lg:
        m = re.match(r'^\s*(\d+)[.、．]\s*(.*)$', ln)
        if m:
            cur = [m.group(2)]
            steps.append(cur)
        elif ln.strip() and cur is not None:
            cur.append(ln.strip())
    h += '<section class="blk logic"><h4><span class="ico">解</span>解題邏輯</h4><ol class="steps">'
    for i, s in enumerate(steps, 1):
        head = s[0]
        m = re.match(r'^【(.+?)】(.*)$', head)
        if m:
            head_h = f'<b class="sttl">{inline(m.group(1))}</b>{inline(m.group(2))}'
        else:
            head_h = inline(head)
        rest = ''.join(f'<p>{inline(x)}</p>' for x in s[1:])
        h += f'<li class="step"><span class="sn">{i}</span><div><p>{head_h}</p>{rest}</div></li>'
    h += '</ol></section>'
    # 選項詳解
    h += '<section class="blk ana"><h4><span class="ico">析</span>選項詳解</h4><div class="anas">'
    for f in anas:
        parts = f['arg'].split()
        k = parts[0] if parts else '?'
        flag = parts[1] if len(parts) > 1 else ''
        is_ans = (k == ans)
        cls = 'pick' if is_ans else 'drop'
        sym = '✓' if flag == 'o' else '✗'
        verdict = ('正解' if is_ans else '不選')
        h += (f'<div class="ana-item {cls}"><div class="ana-k"><b>{esc(k)}</b><span class="sym s-{flag}">{sym}</span>'
              f'<small>{verdict}</small></div><div class="bd">{block(f["body"])}</div></div>')
    h += '</div></section>'
    # 易錯
    tp = body_of(e, 'trap')
    if tp:
        h += f'<section class="blk trap"><h4><span class="ico">!</span>易錯提醒</h4><div class="bd">{block(tp)}</div></section>'
    # 延伸
    ks = [f for f in e['fields'] if f['name'] == 'know']
    if ks:
        h += know_block(ks)
    h += '</article>'
    return h


# ---------------------------------------------------------------- 年度章節
def parse_meta(ents, year):
    meta = {'year': year, 'scoring': [], 'answers': {}}
    for e in ents:
        if e['kind'] != 'META':
            continue
        for f in e['fields']:
            v = f['arg'] or ' '.join(f['body'])
            if f['name'] == 'scoring':
                for m in re.finditer(r'(\d+)-(\d+)=([\d.]+)', v):
                    meta['scoring'].append((int(m.group(1)), int(m.group(2)), m.group(3)))
            elif f['name'] == 'answers':
                s = re.sub(r'[^A-D]', '', v)
                meta['answers'] = {i + 1: c for i, c in enumerate(s)}
            elif f['name'] in ('trend', 'tips', 'fixnote'):
                meta[f['name']] = f['body']
            else:
                meta[f['name']] = v
    return meta


def render_year(year, ents, qinfo_all):
    meta = parse_meta(ents, year)
    qinfo = []
    body = ''
    for e in ents:
        if e['kind'] == 'GROUP':
            body += render_group(year, e)
        elif e['kind'] == 'Q':
            body += render_question(year, e, meta, qinfo)
    nos = [q['no'] for q in qinfo]
    total = int(meta.get('total', 0) or 0)
    if total and sorted(nos) != list(range(1, total + 1)):
        missing = sorted(set(range(1, total + 1)) - set(nos))
        err(f'{year}: 題號不完整，缺 {missing}') if missing else None
    qinfo_all.extend(qinfo)
    # 章名頁
    opener = (f'<section class="opener" id="y{year}"><div class="op-in">'
              f'<div class="op-kicker">國立嘉義高級中學・科學班甄選入學</div>'
              f'<div class="op-year">{year}</div><div class="op-sub">學年度</div>'
              f'<h1 class="op-title">科學能力檢定<br>國文科能力檢定試題詳解</h1>'
              f'<div class="op-meta"><span>單選 {len(qinfo)} 題</span><span>{esc(meta.get("scoretext", ""))}</span>'
              f'<span>滿分 100 分</span></div>'
              f'<div class="op-hw hw">先自己寫一遍，<br>再對照筆記版原題！</div>'
              f'</div></section>')
    # 總覽頁
    ov = f'<section class="overview"><h2 class="ov-h"><b>{year}</b> 學年度　試卷總覽</h2>'
    # 答案表
    ov += '<div class="ov-grid"><div class="ov-card"><h4>官方參考答案速查</h4><div class="anskey">'
    for q in sorted(qinfo, key=lambda x: x['no']):
        ov += f'<div class="ak"><i>{q["no"]}</i><b>{q["ans"]}</b></div>'
    ov += '</div>'
    if meta.get('fixnote'):
        ov += f'<div class="fixnote">{block(meta["fixnote"])}</div>'
    ov += '</div>'
    # 題型配比
    cnt = {c: 0 for c in CATS}
    for q in qinfo:
        if q['cat'] in cnt:
            cnt[q['cat']] += 1
    mx = max(cnt.values()) if qinfo else 1
    ov += '<div class="ov-card"><h4>題型配比</h4><div class="bars">'
    for c in CATS:
        w = cnt[c] / mx * 100 if mx else 0
        ov += (f'<div class="bar"><span class="bl">{c}</span><span class="bt"><i style="width:{w:.0f}%;background:{CAT_COLOR[c]}"></i></span>'
               f'<span class="bn">{cnt[c]} 題</span></div>')
    ov += '</div><h4 class="mt">難度分布</h4><div class="diffs">'
    dc = {i: 0 for i in range(1, 6)}
    for q in qinfo:
        dc[q['diff']] += 1
    for i in range(1, 6):
        ov += f'<div class="dcol"><div class="dbar"><i style="height:{dc[i] / max(1, max(dc.values())) * 100:.0f}%"></i></div><b>{dc[i]}</b><span>{DIFF_LABEL[i]}</span></div>'
    ov += '</div></div></div>'
    if meta.get('trend'):
        ov += f'<div class="ov-card wide"><h4>命題趨勢分析</h4><div class="bd">{block(meta["trend"])}</div></div>'
    if meta.get('tips'):
        ov += f'<div class="ov-card wide tipsbox"><h4>備考建議</h4><div class="bd">{block(meta["tips"])}</div></div>'
    # 題目一覽
    ov += '<div class="ov-card wide qlist-card"><h4>題目一覽</h4><table class="qlist"><thead><tr><th>題號</th><th>考點</th><th>類別</th><th>難度</th><th>答案</th><th>頁碼</th></tr></thead><tbody>'
    for q in sorted(qinfo, key=lambda x: x['no']):
        ov += (f'<tr><td>{q["no"]:02d}</td><td>{inline(q["type"])}</td><td><span class="dot" style="background:{CAT_COLOR.get(q["cat"], "#444")}"></span>{q["cat"]}</td>'
               f'<td>{stars(q["diff"])}</td><td><b>{q["ans"]}</b></td><td class="pg" data-ref="{q["id"]}">—</td></tr>')
    ov += '</tbody></table></div></section>'
    return (f'<div class="year-wrap y{year}">' + opener + f'<div class="year-body" style="page:y{year}">' + ov + body + '</div></div>'), meta


# ---------------------------------------------------------------- 全書
def page_css(years):
    css = ''
    for y in years:
        css += (f'@page y{y} {{ @top-right {{ content: "{y} 學年度　國文科能力檢定"; }} }}\n')
    return css


def build(years=None, sample=False):
    files = sorted(glob.glob(os.path.join(ROOT, 'content', '*.txt')))
    data = {}
    for f in files:
        y, ents = parse_file(f)
        if years and y not in years:
            continue
        data[y] = ents
    order = sorted(data.keys(), reverse=True)
    qinfo = []
    chapters = ''
    metas = {}
    for y in order:
        hy, meta = render_year(y, data[y], qinfo)
        chapters += hy
        metas[y] = meta
    front = back = ''
    if not sample:
        import frontmatter
        front = frontmatter.front(order, qinfo, metas)
        back = frontmatter.back(order, qinfo, metas, CATS, CAT_COLOR)
    fonts = ''.join(f'<link rel="stylesheet" href="../node_modules/{p}">' for p in [
        '@fontsource/iansui/chinese-traditional-400.css', '@fontsource/iansui/latin-400.css',
        '@fontsource/lxgw-wenkai-tc/chinese-traditional-400.css', '@fontsource/lxgw-wenkai-tc/latin-400.css'])
    doc = (f'<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>科學班國文歷屆試題詳解集｜嘉義高中 {order[-1]}–{order[0]} 學年度</title>'
           f'{fonts}<link rel="stylesheet" href="../style.css"><style>{page_css(order)}</style></head><body>'
           f'{front}{chapters}{back}</body></html>')
    out = os.path.join(ROOT, 'dist', f'sample-{order[0]}.html' if sample else 'book.html')
    open(out, 'w', encoding='utf-8').write(doc)
    if not sample:
        json.dump(qinfo, open(os.path.join(ROOT, 'dist', 'qinfo.json'), 'w'), ensure_ascii=False)
    return out, qinfo


if __name__ == '__main__':
    args = sys.argv[1:]
    years = None
    sample = False
    if '--only' in args:
        years = [args[args.index('--only') + 1]]
        sample = True
    if '--check' in args:
        years = [args[args.index('--check') + 1]]
        sample = True
    out, qinfo = build(years, sample)
    print(f'輸出 {out}｜共 {len(qinfo)} 題')
    if ERRORS:
        print(f'\n⚠ 發現 {len(ERRORS)} 個問題：')
        for e in ERRORS:
            print('  -', e)
        sys.exit(1 if '--check' in args else 0)
    else:
        print('✓ 格式檢查通過')
