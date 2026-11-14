# 《量雨的人》介紹片

六十九秒，1920×1080、30 fps。四段：

| 段 | 長度 | 用什麼做 | 內容 |
| --- | --- | --- | --- |
| 片頭 | 6 秒 | HyperFrames + GSAP | 深色書布上，雨由一條線往上落；書名由上往下顯出來；蓋上藍色郵戳；紙由下往上蓋過畫面 |
| 手繪四幅 | 34 秒 | Remotion | 封底那首短文一節一幅：線稿一筆一筆畫出來，顏色由左而右顯影，字一句一欄；幅與幅之間翻頁 |
| 書 | 20 秒 | Remotion | 書衣（關燈、聚光、推近、浮起、光束描邊、落回）→ 翻五次頁 → 近看三處 → 拉遠 |
| 片尾 | 9 秒 | HyperFrames + GSAP | 書名、署名、規格、下載頁的網址、權利聲明 |

配樂是館內的主題〈逆雨〉開頭的部分（`assets/audio/theme/00-theme.m4a`）。HyperFrames 的總時間軸把四段和配樂接在一起，輸出成一個 MP4。

## 用到的工具與取法

| 工具 | 在這支片子裡的用處 |
| --- | --- |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | 片頭、片尾的場景；總時間軸；最後的算圖與混音 |
| [GSAP](https://gsap.com) 與 [gsap-skills](https://github.com/greensock/gsap-skills) | HyperFrames 場景裡的時間軸：`fromTo`、位置參數、只動 transform 與 opacity |
| [Remotion](https://www.remotion.dev) | 手繪四幅與書的鏡頭 |
| [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) | 書的鏡頭照它的配方：`spotlight-hero-card`（關燈、聚光、推近、浮起、光束兩圈、落回後真的靜止）、`card-flip-reveal`；相機是它的 `PageCam` 算法，放大用 CSS `zoom`，字才不會糊 |
| [story-to-handdrawn-video](https://github.com/gnipbao/story-to-handdrawn-video) | 手繪段的做法：字 → 線稿 → 顏色，一層一層由左而右顯影；翻頁的捲邊。它只出 3:4、插畫靠影像模型生成；這裡改成 16:9，插畫是自己用 SVG 畫的 |
| [pixel2motion](https://github.com/nolangz/pixel2motion) | 筆畫與標誌的規矩：每一筆 `pathLength=1`、照書寫方向畫、圓頭虛線用 `1 1.2`；印章只誇張落下的那一拍，不擠壓 |
| [motion-design-skill](https://github.com/LottieFiles/motion-design-skill) | 時間與緩動的數字：進場用減速，退場比進場短，一次只有一個主角在動，落定之後留時間給人讀 |

這些 repo 的授權：video-shotcraft 是 Apache-2.0，其餘是 MIT。它們附的音效與音樂沒有用。Remotion 自己的授權對個人與小團隊免費，公司使用要另外看它的條款。

## 重做

```
python3 dev/book/film/prepare.py                 # 素材：書頁、字型、底圖、配樂
cd dev/book/film/remotion && npm install
npx remotion render src/index.ts Handdrawn out/handdrawn.mp4 --codec=h264 --crf=15 --pixel-format=yuv420p --muted
npx remotion render src/index.ts BookShots out/book.mp4 --codec=h264 --crf=15 --pixel-format=yuv420p --muted
cp out/handdrawn.mp4 out/book.mp4 ../hyperframes/assets/
cd ../hyperframes && node gen.cjs               # 產生 index.html 與兩個場景檔
npx hyperframes@0.9.43 check && npx hyperframes@0.9.43 render --output liangyu-film.mp4 --fps 30 --quality delivery
```

沒有顯示卡的機器上，兩邊都要指到 chrome-headless-shell：Remotion 用 `--browser-executable=<路徑>`，HyperFrames 用環境變數 `HYPERFRAMES_BROWSER_PATH`。不想送遙測就設 `DO_NOT_TRACK=1`。

素材（`remotion/public/`、`hyperframes/assets/`）和成品都不進 repo。
