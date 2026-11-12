#!/usr/bin/env python3
"""檢查各年度內容檔是否混入別的年度的 @know／@adv 卡片（比對標題與內文）。
用法：python3 tools/dupcheck.py"""
import glob, os, re, hashlib, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
seen = collections.defaultdict(list)
for f in sorted(glob.glob(os.path.join(ROOT, 'content', '*.txt'))):
    y = os.path.basename(f)[:3]
    q = '?'
    lines = open(f, encoding='utf-8').read().split('\n')
    i = 0
    while i < len(lines):
        ln = lines[i]
        m = re.match(r'^=== (Q|GROUP) (\S+)', ln)
        if m:
            q = m.group(2)
        m = re.match(r'^@(know|adv)\s+(.*)$', ln)
        if m:
            j = i + 1
            while j < len(lines) and not re.match(r'^(@[a-z]+|=== )', lines[j]):
                j += 1
            body = '\n'.join(x.strip() for x in lines[i + 1:j] if x.strip())
            seen[(m.group(2).strip(), hashlib.md5(body.encode()).hexdigest())].append((y, q, i + 1))
            i = j
            continue
        i += 1
n = 0
for (title, _), locs in seen.items():
    years = {l[0] for l in locs}
    if len(locs) > 1:
        n += 1
        print(('跨年度重複' if len(years) > 1 else '同年度重複'), title, '→', ', '.join(f'{y} Q{q} L{l}' for y, q, l in locs))
print(f'共 {sum(len(v) for v in seen.values())} 張卡片；重複 {n} 組')
