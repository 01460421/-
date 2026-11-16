#!/usr/bin/env python3
"""把「逆雨」字型（dev/fonts/NiYu-Regular.otf）做成網站用的檔案。

    pip install fonttools brotli
    python3 dev/fonts.py            # 產生字型檔和 assets/css/fonts.css
    python3 dev/fonts.py --check    # 只檢查：館內用到的字，字型裡有沒有、常用那一份收了沒

整份字型轉成 woff2 是 1.5 MB，每個訪客都下載太重，所以切成兩份：

  niyu-core.woff2   館內頁面實際出現的字，加上拉丁字母與標點。每一頁都會用到。
  niyu-rest.woff2   字型裡其餘的字。只有畫面上出現這些字（多半是訪客自己寫的內容）時，瀏覽器才會去抓。

哪一份負責哪些字，靠 fonts.css 裡的 unicode-range 告訴瀏覽器。
館內的文字改過之後重跑一次，新出現的字才會進到常用那一份；沒重跑也不會缺字，只是那幾個字要多抓一份檔案。
"""
import glob
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'dev', 'fonts', 'NiYu-Regular.otf')
OUT = os.path.join(ROOT, 'assets', 'fonts')
CSS = os.path.join(ROOT, 'assets', 'css', 'fonts.css')
FAMILY = 'NiYu'


def site_chars():
    """館內所有頁面與腳本裡出現過的字。"""
    files = [os.path.join(ROOT, 'index.html')]
    for pat in ('assets/js/*.js', 'assets/js/plus/*.js', 'assets/js/plus/games/*.js'):
        files += glob.glob(os.path.join(ROOT, pat))
    used = set()
    for p in files:
        with open(p, encoding='utf-8') as f:
            used.update(ord(ch) for ch in f.read())
    return used


def ranges(cps):
    u = sorted(cps)
    out, a, b = [], u[0], u[0]
    for c in u[1:]:
        if c == b + 1:
            b = c
        else:
            out.append((a, b))
            a = b = c
    out.append((a, b))
    return ','.join('U+%X' % a if a == b else 'U+%X-%X' % (a, b) for a, b in out)


def main():
    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
    except ImportError:
        sys.exit('需要 fonttools 和 brotli：pip install fonttools brotli')

    have = set(TTFont(SRC, lazy=True).getBestCmap())
    used = site_chars()
    # 常用的一份：漢字以外的全部（拉丁字母、數字、標點），加上館內出現過的漢字
    core = {c for c in have if c < 0x3400 or c >= 0xF900 or c in used}
    rest = have - core
    missing = sorted(c for c in used if c > 0x7F and c not in have)
    han = [chr(c) for c in missing if 0x3400 <= c <= 0x9FFF]
    other = [chr(c) for c in missing if not 0x3400 <= c <= 0x9FFF]
    print('字型共 %d 個字；常用 %d，其餘 %d' % (len(have), len(core), len(rest)))
    print('館內用到、字型裡沒有的漢字 %d 個：%s' % (len(han), ''.join(han)))
    print('館內用到、字型裡沒有的符號 %d 個：%s' % (len(other), ' '.join(other)))

    if '--check' in sys.argv:
        if not os.path.exists(os.path.join(OUT, 'niyu-core.woff2')):
            sys.exit('還沒有產生字型檔：python3 dev/fonts.py')
        built = set(TTFont(os.path.join(OUT, 'niyu-core.woff2'), lazy=True).getBestCmap())
        late = sorted(core - built)
        print('常用那一份還沒收的字 %d 個：%s' % (len(late), ''.join(chr(c) for c in late)))
        sys.exit(1 if late else 0)

    os.makedirs(OUT, exist_ok=True)
    sizes = {}
    for name, cps in (('niyu-core.woff2', core), ('niyu-rest.woff2', rest)):
        o = subset.Options()
        o.flavor = 'woff2'
        o.layout_features = ['*']      # 小型大寫、舊式數字、花飾（ss01）都留著
        o.name_IDs = ['*']             # 名稱表整份保留：著作權與授權聲明跟著檔案走
        o.name_languages = ['*']
        o.notdef_outline = True
        o.glyph_names = False
        font = TTFont(SRC)
        s = subset.Subsetter(o)
        s.populate(unicodes=sorted(cps))
        s.subset(font)
        font.flavor = 'woff2'
        path = os.path.join(OUT, name)
        font.save(path)
        sizes[name] = os.path.getsize(path)
        print('%s　%d 個字　%.0f KB' % (name, len(cps), sizes[name] / 1024))

    # font-weight 寫成 100 900：這個字型只有一個字重，標題要的 900 也用它，瀏覽器就不會自己把筆畫加粗
    face = ('@font-face{font-family:"%s";src:url(../fonts/%s) format("woff2");'
            'font-weight:100 900;font-style:normal;font-display:swap;unicode-range:%s}\n')
    with open(CSS, 'w', encoding='utf-8') as f:
        f.write('/* 逆雨（NiYu）字型。這個檔案由 dev/fonts.py 產生，不要手改。\n'
                '   Copyright 2026 The NiYu Project Authors；中文字形源自 Noto Serif TC（© 2017-2024 Adobe）。\n'
                '   以 SIL Open Font License 1.1 授權：https://openfontlicense.org\n'
                '   core：館內頁面出現的字（每頁都用）。rest：字型裡其餘的字（畫面上出現才下載）。 */\n')
        f.write(face % (FAMILY, 'niyu-core.woff2', ranges(core)))
        f.write(face % (FAMILY, 'niyu-rest.woff2', ranges(rest)))
    print('fonts.css　%.0f KB' % (os.path.getsize(CSS) / 1024))


if __name__ == '__main__':
    main()
