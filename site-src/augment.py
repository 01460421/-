#!/usr/bin/env python3
"""Attach section quizzes (by text similarity) and simulations to each lesson section. usage: augment.py <data_dir>"""
import json, glob, re, math, sys, os
from collections import Counter
SIMMAP = json.load(open('/tmp/claude-0/zhw/sci/app/simmap.json', encoding='utf-8'))
CONCEPT = re.compile(r'^(（進階）)?[一二三四五六七八九十]+、')
SKIP = re.compile(r'重點總整理|題型整理|重點回顧|使用說明')

def text(h):
    h = re.sub(r'<svg[\s\S]*?</svg>', ' ', h); h = re.sub(r'src="data:[^"]+"', '', h)
    return re.sub(r'\s+', '', re.sub(r'<[^>]+>', ' ', h))

def grams(t):
    t = re.sub(r'[\W\d_a-zA-Z]+', '|', t)
    return Counter(t[i:i + 2] for i in range(len(t) - 1) if '|' not in t[i:i + 2])

for f in sorted(glob.glob(sys.argv[1] + '/*.json')):
    u = os.path.basename(f)[:-5]
    d = json.load(open(f, encoding='utf-8'))
    secs = d['secs']
    cidx = [i for i, s in enumerate(secs) if CONCEPT.match(s['t']) and not SKIP.search(s['t'])]
    for s in secs:
        s.pop('qs', None); s.pop('sims', None)
    # simulations
    for pref, name, opt in SIMMAP.get(u, []):
        for s in secs:
            if s['t'].startswith(pref):
                s.setdefault('sims', []).append([name, opt]); break
    # section quizzes
    if cidx and d['questions']:
        docs = {i: Counter({g: 4 * n for g, n in grams(secs[i]['t']).items()}) + grams(text(secs[i]['h'])) for i in cidx}
        df = Counter(g for v in docs.values() for g in v)
        N = len(docs)
        idf = {g: math.log((N + 1) / (c + 0.5)) for g, c in df.items()}
        def vec(c):
            v = {g: (1 + math.log(n)) * idf.get(g, 0) for g, n in c.items() if g in idf}
            nn = math.sqrt(sum(x * x for x in v.values())) or 1
            return {g: x / nn for g, x in v.items()}
        sv = {i: vec(c) for i, c in docs.items()}
        best = {}
        for q in d['questions']:
            if q['set'] not in ('分級測驗', '科學班入學考題精選', '歷屆學測精選'):
                continue
            qv = vec(grams(text(q['stem'] + ' '.join(o['h'] for o in q['opts']) + (q.get('ctx') or '') + q.get('sol', '')[:400])))
            sc = sorted(((sum(qv.get(g, 0) * w for g, w in sv[i].items()), i) for i in cidx), reverse=True)
            if sc and sc[0][0] > 0.08:
                best.setdefault(sc[0][1], []).append((q, sc[0][0]))
        lv = {'基礎題': 0, '進階題': 1, '挑戰題': 2}
        for i, lst in best.items():
            lst.sort(key=lambda x: (x[0]['set'] != '分級測驗', lv.get(x[0]['level'], 1), -x[1]))
            secs[i]['qs'] = [q['id'] for q, _ in lst[:3]]
    json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    nq = sum(len(s.get('qs', [])) for s in secs); ns = sum(len(s.get('sims', [])) for s in secs)
    print(u, 'concept', len(cidx), 'with-quiz', sum(1 for s in secs if s.get('qs')), 'qs', nq, 'sims', ns)
