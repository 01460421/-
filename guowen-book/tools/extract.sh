#!/bin/bash
# 把官網下載的試卷 PDF 轉成「左欄→右欄」順序的文字檔與頁面圖片。
# 先把檔案放到 source/pdf/年度_q.pdf（試題）、年度_ans.pdf（答案）、年度_ans_fix.pdf（修正答案，如有）
# 用法：tools/extract.sh 110
cd "$(dirname "$0")/.." && mkdir -p source/text source/img
y=$1; f=source/pdf/${y}_q.pdf
n=$(pdfinfo $f | awk '/Pages/{print $2}')
read w h < <(pdfinfo $f | awk '/Page size/{print int($3), int($5)}')
rot=$(pdfinfo $f | awk '/Page rot/{print $3}')
if [ "$rot" = "90" ] || [ "$rot" = "270" ]; then t=$w; w=$h; h=$t; fi
half=$((w/2)); : > source/text/$y.txt
for p in $(seq 1 $n); do
  echo "########## 第 $p 頁 左欄 ##########" >> source/text/$y.txt
  pdftotext -f $p -l $p -x 0 -y 0 -W $half -H $h -layout $f - | cat -s >> source/text/$y.txt
  echo "########## 第 $p 頁 右欄 ##########" >> source/text/$y.txt
  pdftotext -f $p -l $p -x $half -y 0 -W $half -H $h -layout $f - | cat -s >> source/text/$y.txt
done
echo "===== 官方參考答案 =====" >> source/text/$y.txt
for a in source/pdf/${y}_ans.pdf source/pdf/${y}_ans_fix.pdf; do [ -f $a ] && { echo "--- $a"; pdftotext -layout $a - | cat -s; } >> source/text/$y.txt; done
pdftoppm -r 115 -png $f source/img/${y}_p
echo "$y：$n 頁 → source/text/$y.txt、source/img/${y}_p-*.png"
