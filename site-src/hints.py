#!/usr/bin/env python3
"""Add guided hints to questions that have no numbered steps (elimination / reasoning hints)."""
import json, glob, re, sys
strip = lambda x: re.sub(r'<[^>]+>', '', x)

def opt_segments(sol):
    # positions of (A)..(J) markers outside tags and outside math spans
    clean = re.sub(r'<span class="m">.*?</span>', lambda m: '\0' * len(m.group(0)), sol)
    marks = [(m.start(), m.group(1)) for m in re.finditer(r'\(([A-J])\)(?!\s*\()', clean)]
    seg = {}
    for i, (p, k) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(sol)
        txt = sol[p + 3:end]
        txt = re.sub(r'^\s*[：:、，,]?\s*', '', txt)
        # cut at block end to keep fragment well-formed
        txt = re.split(r'</p>|<div|<ol|<table|<figure', txt)[0]
        t = strip(txt).strip(' ；;，,')
        if len(t) >= 4 and k not in seg:
            seg[k] = re.sub(r'(<br>|\s)+$', '', txt.strip().rstrip('；;，, '))
    return seg

def balanced(h):
    return all(h.count(f'<{t}') == h.count(f'</{t}>') for t in ('span', 'sub', 'sup', 'strong', 'em', 'u'))

def add(q):
    if q.get('steps'):
        return 0
    sol = q.get('sol') or ''
    if q['type'] in ('single', 'multi') and len(q['opts']) > 1:
        seg = opt_segments(sol)
        keys = [o['k'] for o in q['opts']]
        if q['type'] == 'single':
            wrong = [k for k in keys if k not in q['ans'] and k in seg]
            pick = wrong[:max(0, min(3, len(keys) - 2))]
            hints = [f'先排除 ({k})：{seg[k]}' for k in pick]
        else:
            pick = [k for k in keys if k in seg][:2]
            hints = [f'先判斷 ({k})：{seg[k]}' for k in pick]
        hints = [h for h in hints if balanced(h)]
        if hints:
            q['steps'] = hints; q['hk'] = 'hint'; return 1
        return 0
    if q['type'] in ('open', 'fill') and sol and not re.search(r'<(table|figure|svg|div|ol|ul|img)', sol):
        text = re.sub(r'</?p>', '\n', sol)
        sents = [s.strip() for s in re.split(r'(?<=。)', text) if strip(s).strip()]
        sents = [s for s in sents if balanced(s)]
        if len(sents) >= 2:
            q['steps'] = sents[:min(3, len(sents) - 1)]; q['hk'] = 'hint'; return 1
    return 0

tot = got = 0
for f in sys.argv[1:]:
    d = json.load(open(f, encoding='utf-8'))
    for q in d['questions']:
        if not q.get('steps'):
            tot += 1; got += add(q)
    json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('no-step questions', tot, 'hinted', got)
