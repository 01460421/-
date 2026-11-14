#!/usr/bin/env python3
"""介紹片的素材：從線裝本的 PDF 切出書頁、把字型縮成片子用得到的字、做紙與布的底圖、剪配樂。

用法：python3 dev/book/film/prepare.py
需要：poppler（pdftoppm）、ImageMagick（convert）、ffmpeg、fonttools 與 brotli（pip install fonttools brotli），
      以及芫荽的字型檔（Iansui-Regular.ttf，SIL OFL 1.1），路徑用環境變數 IANSUI_TTF 指定。
輸出：remotion/public/（書頁、字型、底圖）與 hyperframes/assets/（字型、底圖、配樂）；這兩個資料夾不進 repo。
"""
import glob
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BOOK = os.path.join(HERE, '..')
SITE = os.path.join(BOOK, '..', '..')
PDF = os.path.join(BOOK, '量雨的人-線裝本.pdf')
RM = os.path.join(HERE, 'remotion', 'public')
HF = os.path.join(HERE, 'hyperframes', 'assets')
TMP = os.path.join(HERE, '.tmp')
SPREADS = [2, 4, 6, 17, 28, 39, 46, 50]     # 線裝本 PDF 的頁碼：扉頁、目錄、卷一、問答、新詩、小說、寓言、後記


def run(*a):
    subprocess.run(a, check=True)


def pages():
    os.makedirs(os.path.join(RM, 'book'), exist_ok=True)
    for p in (1, 52):
        run('pdftoppm', '-r', '300', '-f', str(p), '-l', str(p), '-png', PDF, os.path.join(TMP, 'c'))
    run('convert', os.path.join(TMP, 'c-01.png'), '-crop', '1754x2480+995+118', '+repage', '-quality', '92', os.path.join(RM, 'book', 'cover.jpg'))
    run('convert', os.path.join(TMP, 'c-52.png'), '-crop', '1754x2480+995+118', '+repage', '-quality', '92', os.path.join(RM, 'book', 'back.jpg'))
    for p in SPREADS:
        run('pdftoppm', '-r', '200', '-f', str(p), '-l', str(p), '-png', PDF, os.path.join(TMP, 's'))
        src = os.path.join(TMP, 's-%02d.png' % p)
        run('convert', src, '-crop', '1169x1654+79+79', '+repage', '-quality', '90', os.path.join(RM, 'book', 's%02dL.jpg' % p))
        run('convert', src, '-crop', '1170x1654+1248+79', '+repage', '-quality', '90', os.path.join(RM, 'book', 's%02dR.jpg' % p))


def fonts():
    from fontTools import subset
    from fontTools.ttLib import TTFont
    iansui = os.environ.get('IANSUI_TTF')
    if not iansui or not os.path.exists(iansui):
        sys.exit('請用 IANSUI_TTF 指到 Iansui-Regular.ttf')
    text = ''.join(open(p, encoding='utf-8').read() for p in sorted(glob.glob(os.path.join(BOOK, 'ms', '*.txt'))))
    text += open(os.path.join(BOOK, '介紹.txt'), encoding='utf-8').read()
    text += '量雨的人逆雨檔案館著八卷九十八頁直排線裝本二創小說重返未來非官方營利權利屬於深藍互動扉頁目錄散文問答新詩版心在書口一葉對摺魚尾各半題上的一滴是倒著落行就好、，。；：？！「」『』（）《》〈〉｜・·—…　〇一二三四五六七八九十百'
    text = ''.join(sorted(set(text + ''.join(chr(c) for c in range(0x20, 0x7f))) - {'\n', '\r'}))
    os.makedirs(os.path.join(RM, 'fonts'), exist_ok=True)
    for src, dst in ((os.path.join(BOOK, '..', 'fonts', 'NiYu-Regular.otf'), 'NiYu-film.woff2'), (iansui, 'Iansui-film.woff2')):
        opt = subset.Options()
        opt.flavor, opt.layout_features, opt.name_IDs = 'woff2', ['*'], ['*']
        f = TTFont(src)
        s = subset.Subsetter(opt)
        s.populate(text=text)
        s.subset(f)
        f.flavor = 'woff2'
        f.save(os.path.join(RM, 'fonts', dst))
    print('IM Fell English 與 Courier Prime 的 woff2 請從 Google Fonts 取 latin 那一份，放進 remotion/public/fonts/：IMFellEnglish.woff2、IMFellEnglishital1.woff2、CourierPrime.woff2')


def textures():
    os.makedirs(os.path.join(RM, 'tex'), exist_ok=True)
    run('convert', '-size', '1920x1080', 'xc:#f2ebdb',
        '(', '-size', '1920x1080', 'xc:', '+noise', 'Random', '-colorspace', 'Gray', '-blur', '0x7', '-auto-level', '-alpha', 'set', '-channel', 'A', '-evaluate', 'set', '10%', '+channel', ')', '-compose', 'Multiply', '-composite',
        '(', '-size', '1920x1080', 'xc:', '+noise', 'Random', '-colorspace', 'Gray', '-blur', '0x0.7', '-auto-level', '-alpha', 'set', '-channel', 'A', '-evaluate', 'set', '8%', '+channel', ')', '-compose', 'Multiply', '-composite',
        '(', '-size', '1920x1080', 'radial-gradient:#ffffff-#d9d2c2', ')', '-compose', 'Multiply', '-composite', '-quality', '88', os.path.join(RM, 'tex', 'paper.jpg'))
    run('convert', os.path.join(BOOK, 'assets', 'cover-cloth.jpg'), '-resize', '1920x1080^', '-gravity', 'center', '-extent', '1920x1080', '-quality', '88', os.path.join(RM, 'tex', 'cloth.jpg'))
    run('convert', '-size', '512x512', 'xc:', '+noise', 'Random', '-colorspace', 'Gray', '-auto-level', os.path.join(RM, 'tex', 'grain.png'))


def hyperframes():
    os.makedirs(os.path.join(HF, 'fonts'), exist_ok=True)
    for f in glob.glob(os.path.join(RM, 'fonts', '*.woff2')):
        shutil.copy(f, os.path.join(HF, 'fonts'))
    shutil.copy(os.path.join(RM, 'tex', 'cloth.jpg'), HF)
    # 配樂：館內的主題〈逆雨〉，取開頭七十七秒（片長七十四秒，尾巴由 HyperFrames 淡出）
    run('ffmpeg', '-v', 'error', '-y', '-i', os.path.join(SITE, 'assets', 'audio', 'theme', '00-theme.m4a'), '-t', '77', '-c:a', 'aac', '-b:a', '192k', os.path.join(HF, 'music.m4a'))


if __name__ == '__main__':
    os.makedirs(TMP, exist_ok=True)
    pages()
    fonts()
    textures()
    hyperframes()
    shutil.rmtree(TMP, ignore_errors=True)
    print('素材好了')
