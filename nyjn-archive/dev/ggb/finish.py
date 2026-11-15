#!/usr/bin/env python3
"""把 build.cjs 存出來的 .ggb 調成「打開就照順序畫出來」的檔。

build.cjs 給每個物件掛了顯示條件「s ≥ 第幾步」。條件寫在每個物件上，滑桿一動，GeoGebra 會把一萬多條線全部重畫一次，
一步要十幾秒。所以這裡把條件拿掉，改成檔案裡的一小段 JavaScript：滑桿走到第幾步，就只顯示或藏起「這一步多出來或少掉的」那幾個物件。
沒有改到的物件不必重畫，播起來才順。

物件一開始都是藏起來的，打開檔案時才不必先把一萬多條線畫一遍；要靠檔案裡的程式把它們一步一步顯示出來，
所以打開的 GeoGebra 要允許檔案裡的程式（GeoGebra 的網頁版與 Classic 預設都允許）。

用法：python3 finish.py <raw.ggb> <final.ggb> [--speed 0.25]
"""
import re
import sys
import zipfile

src, dst = sys.argv[1], sys.argv[2]
speed = sys.argv[sys.argv.index('--speed') + 1] if '--speed' in sys.argv else '0.25'
zin = zipfile.ZipFile(src)
xml = zin.read('geogebra.xml').decode('utf-8')

# 一、記下每個物件出現在第幾步，再把條件拿掉
steps = {}
for m in re.finditer(r'<element type="[^"]+" label="([cp])_\{(\d+)\}">(.*?)</element>', xml, re.S):
    c = re.search(r'<condition showObject="s ≥ (\d+)"/>', m.group(3))
    steps[(m.group(1), int(m.group(2)))] = int(c.group(1))
xml, n_cond = re.subn(r'\s*<condition showObject="s ≥ \d+"/>', '', xml)
# 物件一開始都藏起來：打開檔案時不必先把一萬多條線畫一遍，程式再照順序一個一個顯示
def hide(m):
    return m.group(0).replace('<show object="true"', '<show object="false"', 1)
xml, n_hide = re.subn(r'<element type="[^"]+" label="[cp]_\{\d+\}">.*?</element>', hide, xml, flags=re.S)
NC = max(k for t, k in steps if t == 'c')
NP = max((k for t, k in steps if t == 'p'), default=0)
order = [steps[('c', k)] for k in range(1, NC + 1)] + [steps[('p', k)] for k in range(1, NP + 1)]
assert all(a <= b for a, b in zip(order, order[1:])), '物件的名字沒有照出現的順序排'

# 二、滑桿：從 0 開始，只往前播一次
i = xml.index('<element type="numeric" label="s">')
j = xml.index('</element>', i)
el = xml[i:j]
smax = int(float(re.search(r'max="([\d.]+)"', el).group(1)))
el2 = re.sub(r'<value val="[^"]*"/>', '<value val="0"/>', el)
el2 = re.sub(r' x="[^"]*" y="[^"]*"', ' x="24" y="40"', el2)
el2 = el2.replace('fixed="false"', 'fixed="true"')
el2 = re.sub(r'<animation[^>]*/>', f'<animation step="1" speed="{speed}" type="3" playing="false"/>', el2)
el2 = el2.replace('<show object="true" label="true"/>', '<show object="true" label="false"/>')
xml = xml[:i] + el2 + xml[j:]

# 三、IDX[v] = 滑桿在 v 的時候，前面幾個物件該顯示
idx, k = [], 0
for v in range(smax + 1):
    while k < len(order) and order[k] <= v:
        k += 1
    idx.append(k)
js = f'''// 照順序畫：滑桿 s 走到第幾步，就顯示前 IDX[s] 個物件（c 是方程式，p 是上色的多邊形）
var NC = {NC}, NP = {NP}, SMAX = {smax};
var IDX = [{",".join(map(str, idx))}];
var shown = 0;
function nameOf(i) {{ return i < NC ? "c_{{" + (i + 1) + "}}" : "p_{{" + (i - NC + 1) + "}}"; }}
function drawTo() {{
  var v = Math.round(ggbApplet.getValue("s"));
  v = Math.max(0, Math.min(SMAX, v));
  var target = IDX[v];
  if (target === shown) return;
  ggbApplet.setRepaintingActive(false);
  while (shown < target) {{ ggbApplet.setVisible(nameOf(shown), true); shown++; }}
  while (shown > target) {{ shown--; ggbApplet.setVisible(nameOf(shown), false); }}
  showText();
  ggbApplet.setRepaintingActive(true);
}}
// 右邊的字：最近畫上去的方程式（照 GeoGebra 自己的寫法）
function showText() {{
  if (!ggbApplet.exists("info")) return;
  var nEq = Math.min(shown, NC);
  var lines = [];
  for (var i = nEq - 1; i >= 0 && lines.length < 44; i--) {{
    var t = ggbApplet.getValueString(nameOf(i));
    lines.push(t.length > 104 ? t.slice(0, 102) + "…" : t);
  }}
  ggbApplet.setTextValue("info", lines.reverse().join("\\n"));
}}
function ggbOnInit() {{
  ggbApplet.setValue("s", 0);
  ggbApplet.setAnimating("s", true);
  ggbApplet.startAnimation();
  try {{ window.drawTo = drawTo; }} catch (e) {{}}
  ggbApplet.registerObjectUpdateListener("s", drawTo);
  drawTo();
}}
'''
zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    if it.filename == 'geogebra.xml':
        zout.writestr(it, xml.encode('utf-8'))
    elif it.filename == 'geogebra_javascript.js':
        zout.writestr(it, js.encode('utf-8'))
    else:
        zout.writestr(it, zin.read(it.filename))
zout.close()
print(f'拿掉條件 {n_cond} 個；方程式 {NC} 條、多邊形 {NP} 個；滑桿 0–{smax}，速度 {speed}；IDX 的頭尾', idx[:3], idx[-3:])
