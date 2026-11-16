#!/usr/bin/env python3
"""Extract every science unit into data/<unit>.json (lesson sections, questions, guided items) + index.json."""
import re, json, os, io, base64, sys
from PIL import Image

P = os.environ.get('SRC', '/tmp/claude-0/zhw/sci/parts')
IMG = '/tmp/claude-0/zhw/sci/kbank/img'
OUT = os.environ.get('OUT', '/tmp/claude-0/zhw/sci/app/site')
os.makedirs(OUT + '/data', exist_ok=True)
BOOKS = json.load(open(os.environ.get('BOOKS', '/tmp/claude-0/zhw/pkg/ziran/books30.json'), encoding='utf-8'))
_imgcache = {}


def match_div(s, i):
    depth = 0
    for m in re.finditer(r'<div\b|</div>', s[i:]):
        if m.group(0) == '</div>':
            depth -= 1
            if depth == 0:
                return i + m.end()
        else:
            depth += 1
    raise ValueError('unbalanced at %d' % i)


def strip_tags(x):
    return re.sub(r'<[^>]+>', '', x)


def webp(path):
    if path in _imgcache:
        return _imgcache[path]
    f = os.path.join(IMG, path)
    if not os.path.exists(f):
        _imgcache[path] = None
        return None
    im = Image.open(f)
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    if im.mode == 'RGBA':
        bg = Image.new('RGB', im.size, (255, 255, 255)); bg.paste(im, mask=im.split()[3]); im = bg
    if im.width > 1000:
        im = im.resize((1000, round(im.height * 1000 / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=74, method=6)
    uri = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    _imgcache[path] = uri
    return uri


missing = []


def fix_imgs(h):
    def rep(m):
        uri = webp(m.group(1))
        if not uri:
            missing.append(m.group(1)); return m.group(0)
        return 'src="' + uri + '" loading="lazy"'
    return re.sub(r'src="img/([^"]+)"', rep, h)


def sections(body):
    body = re.sub(r'^.*?<h2>[^<]*</h2>', '', body, flags=re.S)
    body = re.sub(r'</section>\s*$', '', body.strip())
    parts = re.split(r'(<h3>[^<]*</h3>)', body)
    out = []
    head = parts[0].strip()
    if strip_tags(head).strip():
        out.append(('導言', head))
    for i in range(1, len(parts), 2):
        out.append((strip_tags(parts[i]).strip(), parts[i + 1].strip()))
    return out


def parse_ans(ans):
    res = {}
    for m in re.finditer(r'<div class="ans"><span class="exid">([A-Z]+\d+-[\w]+)</span>', ans):
        st = m.start(); e = match_div(ans, st); block = ans[st:e]
        inner = block[block.index('</span>') + 7: block.rindex('</div>')]
        wm = re.search(r'<span class="why">', inner)
        if wm:
            key = inner[:wm.start()].strip(); why = inner[wm.end(): inner.rindex('</span>')]
        else:
            key, why = inner.strip(), ''
        res[m.group(1)] = (key, why)
    return res


def classify(opts, key, stem):
    letters = re.findall(r'\(([A-J1-9])\)', key)
    k = strip_tags(key).replace('答案：', '').replace('答案:', '')
    is_choice = bool(opts) and bool(letters) and re.fullmatch(r'(\s*\([A-J1-9]\)\s*[、，,]?\s*)+', k) is not None
    multi = is_choice and (len(letters) > 1 or '多選' in strip_tags(stem))
    if is_choice:
        return ('multi' if multi else 'single'), letters
    return ('fill' if ('選填' in strip_tags(stem) or '_____' in stem) else 'open'), []


def parse_questions(sec_html, unit, setname, ansmap):
    qs = []; pos = 0; ctx = ''; remaining = 0; n = 0
    for m in re.finditer(r'<div class="ex"(?: id="([^"]+)")?>', sec_html):
        if m.start() < pos:
            continue
        gap = sec_html[pos:m.start()]
        e = match_div(sec_html, m.start()); ex = sec_html[m.start():e]; pos = e
        sol_html = ''
        rest = sec_html[pos:]
        if re.match(r'\s*<div class="xsol', rest):
            xs = pos + (len(rest) - len(rest.lstrip())); xe = match_div(sec_html, xs)
            sol_html = sec_html[xs:xe]; sol_html = sol_html[sol_html.index('>') + 1: sol_html.rindex('</div>')]
            pos = xe
        g = re.sub(r'<h4[^>]*>.*?</h4>', '', gap, flags=re.S).strip()
        gt = strip_tags(g)
        pre = ''
        if '題組' in gt or (re.search(r'class="(passage|grp)"', g) is not None):
            mm = re.search(r'(\d+)\s*[–\-~～—]\s*(\d+)\s*題', gt)
            remaining = (int(mm.group(2)) - int(mm.group(1)) + 1) if mm else 3
            ctx = g
        elif gt.strip() or '<img' in g or '<svg' in g:
            if re.search(r'<img|<svg|<table', g) and remaining <= 0:
                ctx = g; remaining = 1   # figure/table lead-in for the next question
            else:
                pre = g                  # instructions for this set
        elif remaining <= 0:
            ctx = ''
        level = ''
        hm = re.findall(r'<h4 class="exset">([^<（(]*)', sec_html[:m.start()])
        if hm:
            level = hm[-1].strip()
        n += 1
        qid = m.group(1) or f'{unit}-{"K" if "精選" in setname else "Q"}{n:02d}'
        inner = ex[ex.index('>') + 1: ex.rindex('</div>')]
        inner = re.sub(r'<span class="exid">[^<]*</span>', '', inner, count=1)
        src = ''
        sm = re.search(r'<span class="hand no">([^<]*)</span>', inner) or re.search(r'<p class="src">([\s\S]*?)</p>', inner)
        if sm:
            src = strip_tags(sm.group(1)).strip(); inner = inner.replace(sm.group(0), '', 1)
        opts = []; stem = inner
        om = re.search(r'<div class="opts[^"]*">', inner)
        if om:
            oe = match_div(inner, om.start()); ohtml = inner[om.start():oe]
            stem = inner[:om.start()] + inner[oe:]
            body = ohtml[ohtml.index('>') + 1: ohtml.rindex('</div>')]
            for piece in re.split(r'(?=<span>\s*\([A-J1-9]\))', body):
                pm = re.match(r'<span>\s*\(([A-J1-9])\)\s*([\s\S]*)</span>\s*$', piece.strip())
                if pm:
                    opts.append({'k': pm.group(1), 'h': pm.group(2).strip()})
        if len(opts) == 1:
            rm = re.match(r'\s*[～~\-–—至到]\s*\(([A-J])\)\s*([\s\S]*)', opts[0]['h'])
            if rm:
                note = rm.group(2).strip()
                opts = [{'k': chr(c), 'h': f'選項 ({chr(c)})' + ('（見上圖）' if '圖' in note else '')} for c in range(ord(opts[0]['k']), ord(rm.group(1)) + 1)]
        stem = re.sub(r'<div class="lines"[^>]*></div>', '', stem).strip()
        if sol_html:
            km = re.search(r'<p class="xa">([\s\S]*?)</p>', sol_html)
            key = re.sub(r'^\s*答案[：:]\s*', '', km.group(1)).strip() if km else ''
            sol = re.sub(r'<p class="xa">[\s\S]*?</p>', '', sol_html, count=1)
        else:
            key, sol = ansmap.get(qid, ('', ''))
        qtype, letters = classify(opts, key, stem)
        steps = extract_steps(sol)
        qs.append({'id': qid, 'unit': unit, 'set': setname, 'level': level, 'src': src, 'ctx': ctx, 'pre': pre,
                   'stem': stem, 'opts': opts, 'type': qtype, 'ans': letters, 'key': key, 'sol': sol, 'steps': steps})
        remaining = max(0, remaining - 1)
        if remaining == 0:
            ctx = ''
    return qs


def extract_steps(sol):
    m = re.search(r'<ol class="steps">([\s\S]*?)</ol>', sol)
    if not m:
        return []
    return [x.strip() for x in re.findall(r'<li>([\s\S]*?)</li>', m.group(1))]


def examples(h):
    out = []
    for m in re.finditer(r'<div class="example">', h):
        e = match_div(h, m.start()); blk = h[m.start():e]
        inner = blk[blk.index('>') + 1: blk.rindex('</div>')]
        sm = re.search(r'<div class="sol">', inner)
        if not sm:
            continue
        se = match_div(inner, sm.start()); sol = inner[sm.start():se]; sol = sol[sol.index('>') + 1: sol.rindex('</div>')]
        q = (inner[:sm.start()] + inner[se:]).strip()
        tm = re.match(r'\s*<p><strong>([^<]+)</strong>\s*([\s\S]*)', q)
        title = ''
        if tm:
            title = tm.group(1).strip(); q = '<p>' + tm.group(2)
        steps = extract_steps(sol)
        after = re.sub(r'<ol class="steps">[\s\S]*?</ol>', '', sol).strip() if steps else ''
        out.append({'title': title, 'q': q, 'steps': steps, 'after': after, 'sol': sol})
    return out


def misconceptions(h):
    out = []
    for m in re.finditer(r'<p class="bad"><span class="mark">[^<]*</span>([\s\S]*?)</p>\s*<p class="good"><span class="mark">[^<]*</span>([\s\S]*?)</p>', h):
        out.append({'bad': m.group(1).strip(), 'good': m.group(2).strip()})
    return out


def checklist(h):
    m = re.search(r'<ul class="check">([\s\S]*?)</ul>', h)
    return [x.strip() for x in re.findall(r'<li>([\s\S]*?)</li>', m.group(1))] if m else []


QSETS = {'分級測驗', '科學班入學考題精選', '試題與詳解', '試題', '歷屆學測精選', '題組解題示範', '模擬試題'}
SUBJ = {'P': '物理', 'C': '化學', 'B': '生物', 'E': '地球科學', 'X': '探究與跨科', 'K': '科學班入學考', 'M': '數學', 'T': '數學', 'S': '數學'}
index = {'books': [], 'units': {}}
units_in_books = []
for no, v in sorted(BOOKS['vols'].items(), key=lambda kv: int(kv[0])):
    ids = [i for p in v['parts'] for i in p['ids']]
    index['books'].append({'no': int(no), 'title': v['title'], 'tag': v['tag'], 'ids': ids,
                           'parts': [{'title': p['title'], 'sub': p.get('sub', ''), 'ids': p['ids']} for p in v['parts']]})
    units_in_books += ids

only = sys.argv[1:] or units_in_books
stats = []
for u in only:
    body = open(f'{P}/{u}.body.html', encoding='utf-8').read()
    tm = re.search(r'<h2>[A-Z]+\d+\s*[　 ]\s*([^<]+)</h2>', body)
    title = tm.group(1).strip() if tm else u
    ansf = f'{P}/{u}.ans.html'
    ansmap = parse_ans(open(ansf, encoding='utf-8').read()) if os.path.exists(ansf) else {}
    srcm = re.search(r'<p class="src">([\s\S]*?)</p>', body.split('<h3>')[0])
    secs, qs, exs, mis, chk = [], [], [], [], []
    for t, h in sections(body):
        h = fix_imgs(h)
        fm = re.search(r'<div class="ex"[ >]', h)
        if fm:
            if t in QSETS or '試題' in t or '測驗' in t:
                qs += parse_questions(h, u, t, ansmap)
                continue
            cut = fm.start()
            pm = None
            for pm in re.finditer(r'<p><strong>第\s*\d+', h[:cut]):
                pass
            if pm and cut - pm.start() < 3000:
                cut = pm.start()
            hm = None
            for hm in re.finditer(r'<h4[^>]*>[^<]*(試題|練習|題組|演練)[^<]*</h4>', h[:cut]):
                pass
            if hm:
                cut = min(cut, hm.start())
            sub = parse_questions(h[cut:], u, t, ansmap)
            qs += sub
            h = h[:cut] + (f'<p class="qlink" data-q="{sub[0]["id"]}">本節有 {len(sub)} 題練習（{sub[0]["id"]}～{sub[-1]["id"]}），到「練習」分頁作答。</p>' if sub else '')
        secs.append({'t': t, 'h': h})
        exs += examples(h); mis += misconceptions(h); chk += checklist(h)
    d = {'id': u, 'title': title, 'subject': SUBJ[re.match(r'[A-Z]+', u).group(0)],
         'src': strip_tags(srcm.group(1)).strip() if srcm else '', 'secs': secs, 'questions': qs,
         'examples': exs, 'mis': mis, 'check': chk}
    s = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
    open(f'{OUT}/data/{u}.json', 'w', encoding='utf-8').write(s)
    index['units'][u] = {'title': title, 'nq': len(qs), 'nex': len(exs), 'nmis': len(mis), 'nsec': len(secs),
                         'nguided': len(exs) + sum(1 for q in qs if q['steps'])}
    nokey = [q['id'] for q in qs if not q['key']]
    stats.append((u, len(secs), len(qs), len(exs), len(mis), len(chk), round(len(s) / 1e6, 2), len(nokey), nokey[:3]))

if not sys.argv[1:]:
    json.dump(index, open(f'{OUT}/index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for r in stats:
    print(*r)
print('missing imgs', len(missing), missing[:5])
