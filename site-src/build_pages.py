#!/usr/bin/env python3
"""Build the GitHub Pages site into /home/user/-/docs (portal + science + matrix)."""
import json, glob, os, re, shutil
APP = '/tmp/claude-0/zhw/sci/app'
DOCS = '/home/user/-/docs'
eng = open(f'{APP}/engine.html', encoding='utf-8').read()
simcss = open(f'{APP}/sims/sim.css', encoding='utf-8').read()
js = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
HEAD = '<!doctype html>\n<html lang="zh-Hant">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
KATEX = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.css">'
MX_SIMS = ['calc', 'lt', 'markov']

def sims_bundle(names, dst):
    parts = []
    for n in names:
        f = f'{APP}/sims/{n}.js'
        if os.path.exists(f):
            parts.append(f'/* {n} */\n' + open(f, encoding='utf-8').read())
    open(dst, 'w', encoding='utf-8').write('\n'.join(parts))
    return [n for n in names if os.path.exists(f'{APP}/sims/{n}.js')]

def page(title, idx, inline):
    out = eng.replace('/*SITE_TITLE*/', title).replace('/*KATEX_CSS*/', KATEX).replace('/*SIM_CSS*/', simcss)
    out = out.replace('/*SIMS_JS*/', '<script src="sims.js"></script>').replace('/*INDEX_JSON*/', js(idx)).replace('/*INLINE_UNITS*/', js(inline))
    out = out.replace('/*EXTRA_CSS*/', '').replace('<!--EXTRA_VIEWS-->', '').replace('<!--EXTRA_SCRIPT-->', '')
    return HEAD + out

os.makedirs(f'{DOCS}/science/data', exist_ok=True); os.makedirs(f'{DOCS}/matrix', exist_ok=True)
open(f'{DOCS}/.nojekyll', 'w').close()

# science
idx = json.load(open(f'{APP}/site/index.json', encoding='utf-8'))
books = json.load(open('/tmp/claude-0/zhw/pkg/ziran/books30.json', encoding='utf-8'))['vols']
for b in idx['books']:
    b['noLabel'] = books[str(b['no'])]['no']
simnames = set()
for f in sorted(glob.glob(f'{APP}/site/data/*.json')):
    u = os.path.basename(f)[:-5]
    d = json.load(open(f, encoding='utf-8'))
    idx['units'][u]['qids'] = [q['id'] for q in d['questions']]
    idx['units'][u]['nsim'] = sum(len(s.get('sims', [])) for s in d['secs'])
    for s in d['secs']:
        for n, _ in s.get('sims', []):
            simnames.add(n)
    shutil.copy(f, f'{DOCS}/science/data/{u}.json')
idx['site'] = {'title': '學測自然知識庫', 'sub': '穹理書房・QIONGLI STUDIO', 'key': 'sci',
               'hero': '物理、化學、生物、地科，邊讀邊動手',
               'lead': '每個單元都是互動講義：讀到觀念就能操作模擬、一步步拆解例題、判斷迷思的對錯，讀完一節馬上做隨堂練習，答錯自動收進錯題本。'}
have = sims_bundle(sorted(simnames - set(MX_SIMS)), f'{DOCS}/science/sims.js')
open(f'{DOCS}/science/index.html', 'w', encoding='utf-8').write(page('學測自然知識庫', idx, {}))
print('science sims', len(have), '/', len(simnames - set(MX_SIMS)), 'missing', sorted(simnames - set(MX_SIMS) - set(have)))

# matrix
M = f'{APP}/mx'
midx = json.load(open(f'{M}/index.json', encoding='utf-8'))
midx['books'][0]['noLabel'] = '學測數學'
units = {}
for u in midx['units']:
    d = json.load(open(f'{M}/data/{u}.json', encoding='utf-8'))
    units[u] = d
    midx['units'][u]['qids'] = [q['id'] for q in d['questions']]
midx['site'] = {'title': '矩陣互動學習', 'sub': '穹理書房・學測數學第四冊A', 'key': 'mx3',
                'hero': '矩陣：運算、線性變換、轉移矩陣',
                'lead': '講義每一節都能動手：在矩陣乘法旁直接算 AB 與 BA，在旋轉、鏡射旁拖動矩陣看圖形怎麼變，在穩定狀態旁調整轉移機率；讀完一節就做隨堂練習。'}
sims_bundle(MX_SIMS, f'{DOCS}/matrix/sims.js')
open(f'{DOCS}/matrix/index.html', 'w', encoding='utf-8').write(page('矩陣互動學習', midx, units))
os.system(f'du -sh {DOCS} {DOCS}/science {DOCS}/matrix')

# portal
nsci = len(idx['units']); qsci = sum(len(u['qids']) for u in idx['units'].values())
ssci = sum(u.get('nsim', 0) for u in idx['units'].values() if True)
smx = sum(len(s.get('sims', [])) for d in units.values() for s in d['secs'])
portal = open(f'{APP}/portal.html', encoding='utf-8').read()
for k, v in {'SCI_UNITS': nsci, 'SCI_SIMS': ssci, 'SCI_Q': f'{qsci:,}', 'MX_UNITS': len(units), 'MX_SIMS': smx, 'MX_Q': sum(len(d['questions']) for d in units.values())}.items():
    portal = portal.replace(f'/*{k}*/', str(v))
open(f'{DOCS}/index.html', 'w', encoding='utf-8').write(portal)
print('portal', nsci, ssci, qsci, len(units), smx)
