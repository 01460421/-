#!/bin/bash
# 排出某一年的樣張並轉成頁面圖片：tools/preview.sh 114  → dist/sample-114.pdf、dist/prev/114-NN.png
cd "$(dirname "$0")/.." && python3 build.py --only $1; node render.js dist/sample-$1.html dist/sample-$1.pdf && mkdir -p dist/prev && rm -f dist/prev/$1-*.png && pdftoppm -r 90 -png dist/sample-$1.pdf dist/prev/$1 && pdfinfo dist/sample-$1.pdf | grep Pages
