# 用方程式畫角色（GeoGebra）

把一張角色立繪擬合成一萬多條方程式，再上色，存成 GeoGebra 的 `.ggb`。打開檔案，滑桿往前走，圖就照順序畫出來：先是墨線（由上往下），再是細線，最後鋪上顏色。畫面上只有圖和方程式：圖在左，右邊一欄列出最近畫上去的方程式（GeoGebra 自己的寫法）。

這個資料夾只放工具。原圖、模型權重、擬合結果和成品都不進 repo（見 `.gitignore`）。

## 方程式的形式

每一筆線都找一個「最簡單又夠準」的方程式（`forms.py`），誤差上限 0.4 像素：

| 形式 | GeoGebra 裡的寫法 |
| --- | --- |
| 直線 | `Function(m x + b, x₀, x₁)`，太陡的改寫成 `x = m y + b` |
| 圓弧 | `Curve(h + r cos(t), k + r sin(t), t, θ₀, θ₁)` |
| 拋物線 | `y = a(x − x₀)² + b(x − x₀) + c`，或 `x = a(y − y₀)² + …` |
| 三次函數 | `y = f(x)` 或 `x = g(y)`，三次多項式 |
| 圓、橢圓 | 隱式方程式，例如 `(x − h)² + (y − k)² = r²` |
| 極座標傅立葉級數 | `r(θ) = a₀ + Σ(aₙ cos nθ + bₙ sin nθ)`，閉合的形狀 |
| 三次參數曲線 | `x(t)`、`y(t)` 都是 t 的三次式，上面幾種都不行的時候才用 |

多項式都以區間的起點為中心展開（`x − x₀`），係數才不會大到失去精度。

## 步驟

```
python3 fit.py <原圖.png> out/x.json --prep [--height 2400]                     # 裁好、鋪上白底
python3 lineart.py out/x-src.png out/x-anime.png --weights models/netG.pth --model anime
python3 lineart.py out/x-src.png out/x-info.png --weights models/sk_model.pth --model info
python3 fit.py <原圖.png> out/x.json --height 2400 --lines out/x-anime.png --lines2 out/x-info.png --name 名字
node build.cjs out/x.json out/x-raw.ggb --title 名字       # GeoGebra 自己建出每一條方程式與色塊
python3 finish.py out/x-raw.ggb out/x-stage.ggb           # 換成照順序顯示的程式、滑桿從 0 開始
node post.cjs out/x-stage.ggb out/x.ggb --title 名字      # 橫的畫面：圖在左，右邊是正在畫的方程式
node record.cjs out/x.ggb rec/                            # 在 GeoGebra 裡一步一步截圖（錄影時把滑桿藏起來）
```

`run.sh` 把上面幾步串成一個指令（`bash run.sh 名字 原圖`）。`edit.py` 把幾段錄影剪成一支，段與段之間用「往上落的雨」轉場：畫好的整張圖切成直條往上升，拖出金色的雨，露出下一段的空白畫面；每一段配一次音樂。

`weave/` 是另一支設計動畫《交織》：把 6 和 37 的兩段錄影放進兩座金框拱門，金藍兩條緞帶在中間編織（見 `weave/README.md`）。

`preview2.py` 把方程式畫回點陣圖和原圖並排比對；`anim.py` 不經過 GeoGebra，直接用擬合的結果做一支示意影片；`verify.cjs` 打開成品檢查物件數、播放與每一步顯示的物件。

### 線怎麼來

1. **墨線**：先用公開的線稿模型把彩圖轉成線稿，再找線稿的「脊線」（Steger 的方法），相鄰兩三個像素的線也分得開，位置準到小數像素。外輪廓取自透明度，併在同一層。
   - `netG.pth`：Anime2Sketch（Xiang 等，MIT）
   - `sk_model.pth`：Informative Drawings（Chan 等，MIT）
   - 兩個權重都取自 Hugging Face 的 `lllyasviel/Annotators`。`lineart.py` 照兩個專案公開的程式重寫了網路結構，載入時 `strict=True`。
2. **色界**：把畫面分成幾十種顏色的色塊，取色塊之間的界線（陰影的形狀、花紋）。
3. **紋理**：前兩層沒有涵蓋到的顏色邊緣（Canny）。

每一層都細化成一個像素寬、連成鏈、在轉角處斷開，先試整條能不能用一個簡單的形式表示，不行就用 Schneider 的演算法切成幾段三次貝茲，每一段再試一次簡單的形式。

### 上色

上色的色塊來自同一次分色：每一塊取外框化成多邊形，填它在原圖裡的平均色，往外多一個像素免得接縫露白。由大到小疊上去，放在線的底下（GeoGebra 的圖層 0；線在圖層 2）。

### 照順序畫

最初的做法是給每個物件掛「顯示條件 s ≥ 第幾步」，但滑桿一動，GeoGebra 會把一萬多條線全部重新計算一次，一步要十幾秒。現在改成檔案裡的一小段 JavaScript（`finish.py` 產生）：滑桿走到第幾步，就只顯示或藏起這一步多出來或少掉的物件，沒有變的不必重畫。

物件一開始都藏著，打開檔案時才不必先把一萬多條線畫一遍；所以打開的 GeoGebra 要允許檔案裡的程式。

## 已知的限制

- 我們的測試環境（無頭的 Chromium 加 GeoGebra 網頁版 5.4.920）不執行檔案裡的程式；錄影與檢查是把檔案裡那段程式原封不動放到頁面上，讓 GeoGebra 用頁面的 `ggbOnInit` 呼叫。實際用 GeoGebra Classic 或 geogebra.org 打開時會不會自動播，還沒有驗證；不會的話，畫面會是空的，拖動滑桿也不會出現東西。
- GeoGebra 畫一萬多條曲線很吃 CPU。軟體繪圖的環境裡，打開要二十多秒，播的時候一秒走一兩步。
- 原圖取自《重返未來：1999》陸版官方網站，權利屬於深藍互動（Bluepoch）。成品是非官方、非營利的二次創作。
