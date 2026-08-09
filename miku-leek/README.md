# 甩蔥歌 / Leek Spin

一支從零算圖產生的甩蔥循環動畫。角色、背景、配樂全部由 `render.py` 用程式畫出來，
沒有使用任何現成的圖片、影片或音樂素材。

| 檔案 | 說明 |
| --- | --- |
| `miku-leek.mp4` | 1280×720、30 fps、19.2 秒，H.264 + AAC，無縫循環 |
| `miku-leek.gif` | 360 px 寬的兩小節短循環版本（方便貼到聊天室） |
| `index.html` | 播放頁面 |
| `render.py` | 產生器：畫影格 → 合成音樂 → 用 ffmpeg 封裝 |

## 內容

- **角色**：原創 Q 版設計（青綠雙馬尾、分離袖），用多邊形與 Catmull–Rom 曲線
  在 2 倍超取樣畫布上逐格畫出來再縮小，所以邊緣是平滑的。
- **動作**：所有律動都是以拍子為週期的正弦函數 —— 上下彈跳、頭部傾斜、
  馬尾延遲甩動、蔥的揮舞加上一點過衝。總長度是偶數拍，所以頭尾完全接得上。
- **配樂**：原創 A 小調波爾卡，150 BPM，用 numpy 直接合成方波主旋律、
  三角波 oom-pah 低音與雜訊打擊樂。

## 重新產生

```bash
pip install pillow numpy imageio-ffmpeg
python3 render.py              # 完整輸出 mp4 + gif
python3 render.py --frame 26   # 只出一張 preview.png，方便微調構圖
```

`render.py` 會把影格暫存在 `_frames/`、音訊暫存在 `_audio.wav`，兩者都在
`.gitignore` 裡，不會進版控。

## 參數

改 `render.py` 最上面那幾個常數就好：`W/H`（解析度）、`FPS`、`BPM`、`BARS`（長度）、
`SS`（超取樣倍率，調高比較平滑但比較慢）。
