# 介紹影片

《逆雨檔案館》的介紹影片（1920×1080，每秒 60 格，約 95 秒）是用這個資料夾裡的東西做出來的。畫面全部來自網站本身，字卡用逆雨字型。成品不放進 repo。

需要：Node、Playwright（含 Chromium）、ffmpeg。先在另一個視窗把網站跑起來：`NYJN_STORE=memory PORT=8899 node dev/server.mjs`。

```bash
cd dev/promo
node cap.cjs all                      # 1. 取材：各房間的靜態畫面（兩倍解析度），和片頭、放映廳、親歷三段動態
node render.cjs info                  # 2. 全片幾格、各段從第幾秒開始
node render.cjs preview 15.5 79.6     #    先抽幾格看版面（存到 preview/）
node render.cjs range 0 5724          # 3. 逐格輸出到 frames/（可以分成幾段同時跑）
# 4. 配樂：放映廳配樂的開頭，頭尾淡入淡出
ffmpeg -ss 0 -t 95.4 -i ../../assets/audio/score.mp4 -vn -af "afade=t=in:st=0:d=1.6,afade=t=out:st=90.6:d=4.8,loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 192k audio.m4a
# 5. 壓成影片
mkdir -p out && ffmpeg -framerate 60 -i frames/%05d.jpg -i audio.m4a -vf "scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=tv,format=yuv420p" -c:v libx264 -preset slow -crf 15 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -c:a copy -movflags +faststart -shortest out/niyu-archive-intro.mp4
```

- `film.html` 是合成頁：每一段的時間、字卡、鏡頭都寫在裡面，`render(T)` 只看時間，所以每一格都算得出來、重跑結果一樣。要改字或調節奏就改這個檔。
- `cap.cjs` 取動態時用的是假時鐘：每截一格，網站的時間才往前走六十分之一秒，並且每一格都強制重畫底片（平常底片每 33 毫秒才畫一次）。
- `title.js` 是館名五個字的外框，由 `glyphs.py` 從字型取出（`python3 glyphs.py <fonttools 的路徑> ../fonts/NiYu-Regular.otf title.json`，再包成 `window.TITLE=`）。「雨」字裡的四滴雨是獨立的外框，片頭才能讓它們一滴一滴升上去。
