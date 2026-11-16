# 交織（6 與 37）

把 6 和 37 兩段在 GeoGebra 裡錄下來的繪製過程，放進同一支設計動畫（Remotion，1920×1080，30 格／秒，94.76 秒，配樂的長度）。

- 兩個人各在一座金框的拱門裡，畫面照錄影一步一步畫出來：先是墨線，再是細線，最後上色。
- 金、藍兩條緞帶在兩座拱門之間編織，在交叉處一上一下；緞帶從金框上面越過，再鑽到畫的後面，所以不會擋到人。另有一對細的金線與藍線擺得更開，從拱頂上面、底座下面繞過去，往反方向流。
- 中段兩座拱門繞著彼此轉半圈換位，過一陣子再轉回來；退到後面的那一座蒙上一層深青、微微失焦。
- 鏡頭推近 6 的臉，再移到 37 的臉，上色的時候拉遠。
- 上色完成時一道光斜斜掃過兩張畫；最後兩座拱門靠攏，背後一金一藍兩個圓環扣在一起。
- 背景是深青色的地、慢慢轉的金色放射線與同心圓、往上落的金色雨，還有 GeoGebra 排出來的方程式（反白成淡淡的金色）。

```
python3 prepare.py --rec6 ../rec-c6 --rec37 ../rec-c37 --music 音樂.wav --fonts 字型資料夾 --grain grain.png
npm install
npx remotion still src/index.ts Weave out/f.png --frame=1450
npx remotion render src/index.ts Weave out/weave.mp4 --codec=h264 --crf=18 --pixel-format=yuv420p
```

`public/`、`out/` 不進 repo：裡面是取自官方立繪的畫面和配樂。錄影怎麼來，見上一層的 README。
