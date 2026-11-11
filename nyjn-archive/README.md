# 逆雨檔案館 v2

非官方的《重返未來：1999》粉絲檔案館。靜態網站加上一組 Vercel Functions，資料存在 Vercel Blob。

沒有建置步驟：把整個資料夾放上 Vercel 就能跑。沒有後端時，網站照樣能用，只是所有東西都存在各自的裝置上。

## 這一版多了什麼

**館內**

- **放映廳**（`#film`）：紀錄片《逆雨紀年》直接在館內放，二十七分鐘。畫面是即時繪製的底片，旁白逐句浮現，配樂是原版紀錄片的那一條音軌；可以暫停、調速、跳章、全螢幕，點逐字稿的任何一句就從那裡放起，配樂會跟著跳。瀏覽器有中文語音時可以開朗讀。
- **入館考核**（`#quiz`）：十道題，從年表、章節、底片、名詞索引和抉擇裡即時出題。
- **全館搜尋**（`/` 或 `Ctrl/⌘ + K`）：房間、章節、每一句旁白、名詞、謎題、暴雨，都搜得到，直接跳到那一張底片。
- **名詞連結**：旁白裡出現索引裡的詞，點一下就看說明；遇見過的詞會在索引標出來。
- **展間**：自動翻頁、點底片左右翻頁、手機左右滑、每張底片有自己的網址（`#c3/4`）、章節卡片顯示看過幾張。
- **大廳**：游標所到之處撐開一把傘；每天一張今日底片；連續來訪天數。
- **年表**：十一場雨連播、在圖上拖曳、方向鍵。
- **手提箱**：二十三枚徽記、五個階級、記錄員證與各種紀錄可以存成圖卡、存檔可下載成檔案。
- **聲音**：館內的雨聲和音效全部即時合成，預設關閉。放映廳的配樂是唯一的音檔（約 19 MB），開始放映時才下載；載不到時改用即時合成的環境音。
- **設定**：白晝／暗房、字級、減少動態。
- **離線**：裝過一次之後，沒有網路也能讀（service worker）。

**接上後端之後**

- 接龍、展牆、推測都能「共鳴」（撐傘／記下／想看下去）和回報。
- 未解之謎可以公開自己的推測、看別人的。
- 司辰的抉擇揭曉時，顯示同好選甲選乙的比例；「你的暴雨」和年表顯示十一場雨的人數分佈。
- 大廳多一塊「館內動態」。
- 雲端同步：一組同步碼把手提箱帶到另一台裝置。內容在瀏覽器裡先加密，後端看不到。
- 館主模式：處理回報、隱藏、刪除、停權、設選件、下載備份。

## 檔案

```
index.html              頁面骨架
assets/css/base.css     原本的樣式
assets/css/plus.css     這一版新增的樣式
assets/js/config.js     可以自己改的設定（後端網址、版本）
assets/js/paint.js      底片的畫家（程式繪圖）
assets/js/film.js       紀錄片的腳本：鏡頭與旁白
assets/js/data.js       年表、名詞、謎題、抉擇等資料
assets/js/app.js        核心：手提箱、路由、原有的九個房間
assets/js/plus/*.js     新增的模組，一個檔案一件事
assets/audio/score.mp4  放映廳的配樂（原版紀錄片的音軌）
assets/js/boot.js       最後才開機
sw.js                   離線快取
api/*.js                後端的入口（每個檔案一個端點）
lib/*.js                後端的邏輯
dev/server.mjs          本機開發用的伺服器
test/                   後端測試
dev/smoke.cjs           前端冒煙測試
dev/score.cjs           配樂同步的情境測試
dev/live-check.py       部署後對真正的網址做的實機檢查
docs/API.md             API 規格
docs/ARCHITECTURE.md    整體設計與取捨
vercel.json             安全標頭、快取、每日排程
```

## 放上 Vercel

1. 這個資料夾就是專案的根目錄。如果它在某個 repo 的子資料夾裡，到 Vercel 專案的 **Settings → Build and Deployment → Root Directory** 填 `nyjn-archive`。Framework Preset 選 **Other**，不需要 build 指令。
2. 到專案的 **Storage** 建一個 **Private** 的 Blob store，連到這個專案（會自動加上 `BLOB_READ_WRITE_TOKEN`）。
3. 重新部署。打開 `/api/health`，看到 `"ok": true, "store": "blob"` 就是通了。

已經在跑 v1 的話，直接蓋上去即可：舊的接龍和展牆資料格式不變，作者仍然刪得掉自己的段落。

### 環境變數（都可以不設）

| 名稱 | 用途 |
| --- | --- |
| `ADMIN_KEY` | 館主鑰匙。設了之後，手提箱的「館主入口」輸入同一個值就能進館主模式。 |
| `ALLOW_ORIGINS` | 允許呼叫後端的網址，逗號分隔。沒設就是全部允許。 |
| `HASH_SALT` | IP 雜湊用的鹽。建議設一串隨機字。 |
| `CRON_SECRET` | 設了之後，每日排程會帶著它來，別人就不能手動觸發清理。 |
| `RATE_10MIN` `RATE_DAY` | 每個 IP 的寫入上限，預設 6 和 60。 |
| `REPORT_HIDE` | 幾個人回報後自動隱藏，預設 3。 |
| `CASE_TTL_DAYS` | 雲端存檔多久沒更新就清掉，預設 365。 |

完整的端點和資料格式在 [`docs/API.md`](docs/API.md)，設計上的取捨在 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 在自己的電腦上跑

```bash
npm install
npm run dev        # http://localhost:8787 ，資料寫在 .data/
npm test           # 後端測試（164 項）
npm run smoke      # 前端冒煙測試（86 項，需要另外裝 Playwright，見 dev/smoke.cjs 開頭）
npm run score      # 配樂同步的情境測試（慢裝置、跳章、卡頓、片尾、朗讀……），同樣需要 Playwright
npm run live -- https://你的網域   # 部署後的實機檢查（32 項，會發幾則測試內容再自己刪掉）
```

本機伺服器會套用 `vercel.json` 裡的標頭，所以內容安全政策（CSP）在本機就驗得到。
只想看前端的話，用任何靜態伺服器打開這個資料夾也行，會自動進入單機模式。

## 常改的地方

- **改了任何檔案**：把 `assets/js/config.js` 的 `SITE_VERSION` 和 `index.html` 裡每個 `?v=` 一起往上加，瀏覽器和離線快取才會換新。
- **網站和後端不在同一個網域**：`config.js` 的 `API_URL` 填後端網址；後端的 `ALLOW_ORIGINS` 填網站網址；`vercel.json` 的 `connect-src` 加上後端網址。
- **換網域**：`index.html` 的 `og:url` 和 `og:image` 寫的是 `https://reverse-1999-art.vercel.app`。換成自己的網域時一起改，社群平台的預覽圖才會指到新的位址。
- **放映廳的配樂**：音檔在 `assets/audio/score.mp4`，要換檔案就改 `config.js` 的 `SCORE_URL`。配樂是照影片的時間軸剪的，而時間軸的算法寫在 `assets/js/plus/cinema.js` 開頭（每句幾秒、長句怎麼拆、鏡頭前後留多少空白）。這兩樣是一對：改了旁白或算法，音軌就會對不上章節。播放時是影片跟著配樂的時間走，音軌只在跳轉時定位一次（每定位一次就會聽到一次斷點），改這一段之後請跑 `npm run score`。
- **展間自動翻頁的節奏**：`assets/js/plus/reader.js` 的 `cueSec`。
- **徽記**：`assets/js/plus/rank.js` 的 `ACH`。
- **接龍的提示卡**：`assets/js/plus/social.js` 的 `PROMPTS`。

## 權利聲明

《重返未來：1999》及其角色、名稱與世界觀，著作權與商標屬深藍互動（Bluepoch）所有。本館與官方無關，文字是重新撰寫的劇情摘要，畫面全部由程式繪製。
