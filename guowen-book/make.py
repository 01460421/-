#!/usr/bin/env python3
"""一鍵產生全套 PDF（每冊兩階段：排版 → 取得頁碼 → 回填目錄與索引 → 再排版）
用法：
  python3 make.py        產出三冊
  python3 make.py 3      只產出第三冊
  python3 make.py --year 115   只產出單一年度樣張
成品：dist/科學班國文歷屆試題詳解集_第X冊_起-迄.pdf
"""
import subprocess, re, os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
sys.path.insert(0, ROOT)
import build


def run(*a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout, r.stderr)
        sys.exit(1)
    return r.stdout


def two_pass(out, pdf, tmp):
    """排版兩次：第一次取得各錨點頁碼，回填後再排一次"""
    run('node', 'render.js', out, tmp)
    ref = {}
    for m in re.finditer(r'^\s*(\d+)\s+\[.*?\]\s+"([^"]+)"', run('pdfinfo', '-dests', tmp), re.M):
        name = m.group(2)
        ref[name[1:] if name.startswith('q') else name] = int(m.group(1))
    n1 = int(re.search(r'Pages:\s+(\d+)', run('pdfinfo', tmp)).group(1))
    html = open(out, encoding='utf-8').read()
    miss = set()

    def fill(m):
        k = m.group(1)
        if k not in ref:
            miss.add(k)
            return m.group(0)
        return f'data-ref="{k}">{ref[k]}<'

    html = re.sub(r'data-ref="([^"]+)">—<', fill, html)
    open(out, 'w', encoding='utf-8').write(html)
    if miss:
        print('  ⚠ 未找到頁碼：', sorted(miss))
    run('node', 'render.js', out, pdf)
    n2 = int(re.search(r'Pages:\s+(\d+)', run('pdfinfo', pdf)).group(1))
    os.remove(tmp)
    return n2, ('頁數一致 ✓' if n1 == n2 else '⚠ 頁數不同，請再執行一次')


def make(vol):
    build.ERRORS.clear()
    out, qinfo = build.build(vol=vol)
    if not qinfo:
        print(f'{vol["name"]}：尚無內容，略過')
        return
    for e in build.ERRORS:
        print('  ⚠', e)
    yrs = sorted(vol['years'])
    pdf = f'dist/科學班國文歷屆試題詳解集_{vol["name"]}_{yrs[0]}-{yrs[-1]}.pdf'
    n2, ok = two_pass(out, pdf, f'dist/pass1-v{vol["no"]}.pdf')
    print(f'{vol["name"]}：{len(qinfo)} 題、{n2} 頁（{ok}）→ {pdf}')


def make_year(y):
    """單一年度樣張（不含封面、目錄、附錄）"""
    build.ERRORS.clear()
    out, qinfo = build.build(years=[y], sample=True)
    for e in build.ERRORS:
        print('  ⚠', e)
    pdf = f'dist/科學班國文詳解_{y}學年度_單年樣張.pdf'
    n2, ok = two_pass(out, pdf, f'dist/pass1-y{y}.pdf')
    print(f'{y} 學年度：{len(qinfo)} 題、{n2} 頁（{ok}）→ {pdf}')


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--year':
        make_year(sys.argv[2])
        sys.exit(0)
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for v in build.VOLUMES:
        if only and str(v['no']) != only:
            continue
        make(v)
