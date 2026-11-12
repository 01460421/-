# 把館名五個字的外框從字型裡取出來，存成 SVG 路徑；「雨」字裡的四滴雨各自獨立，之後才能讓它們一滴一滴升上去。
# 用法：python3 -I glyphs.py <pylib> <font.otf> <out.json>
import sys, json
sys.path.insert(0, sys.argv[1])
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

f = TTFont(sys.argv[2]); gs = f.getGlyphSet(); cmap = f.getBestCmap()
def contours(ch):
    rec = RecordingPen(); gs[cmap[ord(ch)]].draw(rec)
    out, cur = [], []
    for op, args in rec.value:
        cur.append((op, args))
        if op in ('closePath', 'endPath'): out.append(cur); cur = []
    res = []
    for c in out:
        sp = SVGPathPen(gs); bp = BoundsPen(gs)
        for op, args in c: getattr(sp, op)(*args); getattr(bp, op)(*args)
        res.append({'d': sp.getCommands(), 'b': [round(v) for v in bp.bounds]})
    return res
data = {'upm': f['head'].unitsPerEm, 'asc': f['hhea'].ascent, 'desc': f['hhea'].descent, 'glyphs': []}
for ch in '逆雨檔案館':
    cs = contours(ch); adv = gs[cmap[ord(ch)]].width
    data['glyphs'].append({'ch': ch, 'adv': adv, 'contours': cs})
    print(ch, 'adv', adv, 'contours', len(cs), [c['b'] for c in cs] if ch == '雨' else '')
json.dump(data, open(sys.argv[3], 'w'), ensure_ascii=False)
# 影片裡會用到的字，字型裡有沒有
text = open(sys.argv[4], encoding='utf-8').read() if len(sys.argv) > 4 else ''
miss = sorted({c for c in text if ord(c) > 0x20 and ord(c) not in cmap})
print('missing in font:', ' '.join(miss) if miss else 'none')
