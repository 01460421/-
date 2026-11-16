#!/usr/bin/env python3
"""把 build.cjs 存出來的 .ggb 調成「打開就照順序畫出來」的檔。

一、build.cjs 給每個物件掛了顯示條件「s ≥ 第幾步」。條件寫在每個物件上，滑桿一動，GeoGebra 會把一萬多條線全部重新計算，
    一步要十幾秒。這裡把條件拿掉，改成檔案裡的一小段 JavaScript：滑桿走到第幾步，就只顯示或藏起這一步多出來或少掉的物件。
二、步數加細：墨線、細線、上色三段各分成很多小步（預設共 1320 步，每秒 15 步約 88 秒），每一步只多出幾個物件，播起來才慢而順。
三、每一條方程式的 LaTeX 寫法放進程式裡；右邊那一欄顯示最近畫上去的方程式，用 GeoGebra 的 LaTeX 排版。
四、線改成不透明（GeoGebra 預設 70%），上了色之後線才看得清楚。

物件一開始都藏著，打開檔案時才不必先把一萬多條線畫一遍；要靠檔案裡的程式一步一步顯示出來，
所以打開的 GeoGebra 要允許檔案裡的程式。

用法：python3 finish.py <raw.ggb> <stage.ggb> --data <fit.py 的 json> [--steps 720,210,390] [--hold 10] [--speed 0.113] [--rows 30]
"""
import json
import re
import sys
import zipfile


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


src, dst = sys.argv[1], sys.argv[2]
data = json.load(open(arg('--data', '')))
SA, SB, SC = (int(v) for v in arg('--steps', '720,210,390').split(','))
HOLD = int(arg('--hold', '10'))
speed = arg('--speed', '0.113')
zin = zipfile.ZipFile(src)
xml = zin.read('geogebra.xml').decode('utf-8')


# ── 順序：和 build.cjs 一模一樣（墨線一組一組，鏈依高度由上往下；接著細線；色塊照檔案裡的順序） ──
def order(curves):
    groups = {}
    for c in curves:
        groups.setdefault(c['g'], []).append(c)
    gs = sorted(groups.values(), key=lambda g: -max(c['y'] for c in g))
    return [c for g in gs for c in g]


A = order([c for c in data['curves'] if c['k'] in ('ink', 'out')])
B = order([c for c in data['curves'] if c['k'] in ('tone', 'tex')])
curves = A + B
NC, NP = len(curves), len(data['fills'])

# 核對：檔案裡第 k 條方程式的種類（與函數的定義域）要和這裡排出來的第 k 條相同
types = {}
for m in re.finditer(r'<element type="([^"]+)" label="c_\{(\d+)\}">', xml):
    types[int(m.group(2))] = m.group(1)
doms = {int(m.group(1)): (m.group(2), m.group(3)) for m in re.finditer(r'<expression label="c_\{(\d+)\}" exp="c_\{\d+\}\(x\) = If\[([-\d.]+) ≤ x ≤ ([-\d.]+),', xml)}
assert len(types) == NC, f'檔案裡有 {len(types)} 條方程式，資料裡有 {NC} 條'
bad = checked = 0
for k, c in enumerate(curves, 1):
    want = 'conic' if c['imp'] else 'function' if c['cmd'].startswith('Function(') else 'curvecartesian'
    if types[k] != want:
        bad += 1
    elif want == 'function' and k in doms:
        a, b = re.search(r', ([-\d.]+), ([-\d.]+)\)$', c['cmd']).groups()
        checked += 1
        if abs(float(doms[k][0]) - float(a)) > 1e-3 or abs(float(doms[k][1]) - float(b)) > 1e-3:
            bad += 1
assert bad == 0, f'{bad} 條方程式對不上，順序有誤'


# ── 步數：墨線佔第 1–SA 步，細線 SA+1–SA+SB 步，上色 SA+SB+1–SA+SB+SC 步；最後再停 HOLD 步 ──
def spread(n, a, b):
    return [a + (k * (b - a + 1)) // n for k in range(n)] if n else []


steps = spread(len(A), 1, SA) + spread(len(B), SA + 1, SA + SB) + spread(NP, SA + SB + 1, SA + SB + SC)
smax = SA + SB + SC + HOLD
idx, k = [], 0
for v in range(smax + 1):
    while k < len(steps) and steps[k] <= v:
        k += 1
    idx.append(k)


# ── LaTeX ──
def tex(eq):
    s = eq.replace('−', '-').replace('²', '^{2}').replace('³', '^{3}')
    s = re.sub(r'(cos|sin) (\d+)θ', r'\\\1 \2\\theta', s)
    s = re.sub(r'(cos|sin) θ', r'\\\1\\theta', s)
    s = s.replace('θ', '\\theta').replace('π', '\\pi').replace('≤', '\\le ')
    s = s.replace('，', ',\\quad ').replace('極點', '\\text{極點}')
    return s


TEX = [tex(c['eq']) for c in curves]

# ── 拿掉條件；物件先藏起來；線改成不透明 ──
xml, n_cond = re.subn(r'\s*<condition showObject="s ≥ \d+"/>', '', xml)


def fix(m):
    el = m.group(0).replace('<show object="true"', '<show object="false"', 1)
    if m.group(1) == 'c':
        el = el.replace('opacity="178"', 'opacity="255"')
    return el


xml, n_el = re.subn(r'<element type="[^"]+" label="([cp])_\{\d+\}">.*?</element>', fix, xml, flags=re.S)

# ── 滑桿：從 0 開始，只往前播一次；不顯示名稱 ──
i = xml.index('<element type="numeric" label="s">')
j = xml.index('</element>', i)
el = xml[i:j]
el2 = re.sub(r'<value val="[^"]*"/>', '<value val="0"/>', el)
el2 = re.sub(r' max="[^"]*"', f' max="{smax}"', el2)
el2 = re.sub(r' x="[^"]*" y="[^"]*"', ' x="24" y="40"', el2)
el2 = el2.replace('fixed="false"', 'fixed="true"')
el2 = re.sub(r'<animation[^>]*/>', f'<animation step="1" speed="{speed}" type="3" playing="false"/>', el2)
el2 = el2.replace('<show object="true" label="true"/>', '<show object="true" label="false"/>')
xml = xml[:i] + el2 + xml[j:]

JS = '''// 照順序畫：滑桿 s 走到第幾步，就顯示前 IDX[s] 個物件（c 是方程式，p 是上色的多邊形）
var NC = @NC@, NP = @NP@, SMAX = @SMAX@;
var IDX = @IDX@;
var TEX = @TEX@;
var shown = 0;
function nameOf(i) { return i < NC ? "c_{" + (i + 1) + "}" : "p_{" + (i - NC + 1) + "}"; }
function drawTo() {
  var v = Math.round(ggbApplet.getValue("s"));
  v = Math.max(0, Math.min(SMAX, v));
  var target = IDX[v];
  if (target === shown) return;
  ggbApplet.setRepaintingActive(false);
  while (shown < target) { ggbApplet.setVisible(nameOf(shown), true); shown++; }
  while (shown > target) { shown--; ggbApplet.setVisible(nameOf(shown), false); }
  showText();
  ggbApplet.setRepaintingActive(true);
}
// 右邊那一欄：最近畫上去的方程式，LaTeX
var ROWS = @ROWS@;
function showText() {
  if (!ggbApplet.exists("info")) return;
  var n = Math.min(shown, NC), rows = [];
  for (var i = Math.max(0, n - ROWS); i < n; i++) rows.push(TEX[i]);
  ggbApplet.setTextValue("info", rows.length ? "\\\\begin{array}{l}" + rows.join(" \\\\\\\\ ") + "\\\\end{array}" : " ");
}
function ggbOnInit() {
  ggbApplet.setValue("s", 0);
  ggbApplet.setAnimating("s", true);
  ggbApplet.startAnimation();
  ggbApplet.registerObjectUpdateListener("s", drawTo);
  drawTo();
}
'''
js = (JS.replace('@NC@', str(NC)).replace('@NP@', str(NP)).replace('@SMAX@', str(smax)).replace('@IDX@', json.dumps(idx, separators=(',', ':')))
      .replace('@TEX@', json.dumps(TEX, ensure_ascii=False, separators=(',', ':'))).replace('@ROWS@', arg('--rows', '30')))
zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    if it.filename == 'geogebra.xml':
        zout.writestr(it, xml.encode('utf-8'))
    elif it.filename == 'geogebra_javascript.js':
        zout.writestr(it, js.encode('utf-8'))
    else:
        zout.writestr(it, zin.read(it.filename))
zout.close()
print(f'核對順序：{NC} 條方程式的種類全部相符，其中 {checked} 條函數的定義域也相符；拿掉條件 {n_cond} 個；多邊形 {NP} 個；滑桿 0–{smax}，速度 {speed}')
print('LaTeX 範例：', TEX[0][:110], '｜', next(t for t in TEX if 'cos' in t)[:110])
