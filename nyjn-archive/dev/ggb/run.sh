#!/bin/bash
# 一張圖從頭做到尾：裁圖 → 線稿 → 擬合 → GeoGebra 建檔 → 照順序畫 → 版面 → 在 GeoGebra 裡錄製
# 用法：bash run.sh <名字> <原圖> [高度]
set -e
N=$1; SRC=$2; HT=${3:-2400}
S=/tmp/claude-0/-home-user/90271277-d3e4-55ce-83e8-c6d3a7ca4bfa/scratchpad
export PYTHONPATH=$S/torchlib:$S/pylib:$S/ggb
cd $S/ggb
echo "[$(date +%T)] 裁圖"; python3 fit.py "$SRC" out/$N.json --height $HT --prep
echo "[$(date +%T)] 線稿"; python3 lineart.py out/$N-src.png out/$N-anime.png --weights models/netG.pth --model anime --size $HT; python3 lineart.py out/$N-src.png out/$N-info.png --weights models/sk_model.pth --model info --size $HT
echo "[$(date +%T)] 擬合"; python3 fit.py "$SRC" out/$N.json --height $HT --lines out/$N-anime.png --lines2 out/$N-info.png --name $N
python3 preview2.py out/$N.json out/$N-cmp.jpg
echo "[$(date +%T)] GeoGebra 建檔"; node build.cjs out/$N.json out/$N-raw.ggb --title $N 2>&1 | grep -v "cookie\|parser-blocking"
echo "[$(date +%T)] 照順序畫"; python3 finish.py out/$N-raw.ggb out/$N-stage.ggb --data out/$N.json --steps 720,210,390 --hold 10 --speed 0.113 --rows 30
WH=$(python3 -c "import json;d=json.load(open('out/$N.json'))['stats'];print(d['width']/d['unit_px'], d['height']/d['unit_px'])")
echo "[$(date +%T)] 版面 $WH"; node post.cjs out/$N-stage.ggb out/$N.ggb --w $(echo $WH | cut -d' ' -f1) --h $(echo $WH | cut -d' ' -f2) 2>&1 | grep -v cookie
echo "[$(date +%T)] 錄製"; rm -rf rec-$N; node record.cjs out/$N.ggb rec-$N 2>&1 | grep -v "cookie\|parser-blocking"
echo "[$(date +%T)] 全部完成 $N"
