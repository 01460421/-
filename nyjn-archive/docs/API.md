# 逆雨檔案館後端 API（v2）

所有端點都在 `/api/*`，回傳 JSON。錯誤一律是：

```json
{ "error": "給人看的中文訊息", "code": "machine_code" }
```

| 狀態 | code | 意思 |
| --- | --- | --- |
| 400 | `bad_request` `bad_channel` `empty` `bad_id` | 參數不對 |
| 403 | `forbidden` `banned` | 不是作者／館主，或已被停權 |
| 404 | `not_found` | 找不到 |
| 405 | `method` | 不支援的方法 |
| 409 | `duplicate` `conflict` `full` | 重複送出、版本衝突、名額已滿 |
| 413 | `too_large` | 內容太長 |
| 429 | `rate_limited` | 太快了（附 `Retry-After` 秒數） |
| 503 | `no_store` | 還沒接上儲存空間 |
| 500 | `server` | 其他錯誤 |

## 身分

沒有帳號。每個瀏覽器自己產生一把 **作者鑰匙** `o`（`/^[a-z0-9]{16,40}$/`），只存在使用者的手提箱裡。

- 後端只保存 `oh = sha256(o)`（十六進位，和 v1 相同，所以舊資料的作者仍然刪得掉自己的段落）。
- 共鳴、回報、投票名單用 `oh` 的前 12 碼（下稱 `oh12`）。
- IP 只保存雜湊：`ih = sha256(HASH_SALT + '|' + ip)` 的前 16 碼。
- 館主：請求帶 `x-admin-key` 標頭，值等於環境變數 `ADMIN_KEY`（用固定時間比較）。

## 頻道

| k | 內容 | 文字上限 | 保留筆數 |
| --- | --- | --- | --- |
| `h33` `wall` `post` `free` | 接龍的四個本子，欄位 `x` | 240 | 500 |
| `gallery` | 展牆，欄位 `w`（作品） | 見下 | 500 |
| `theory` | 未解之謎的公開推測，欄位 `x` 加 `q`（`q1`–`q12`） | 400 | 600 |

作品 `w` 兩種：

```jsonc
{ "kind": "piece", "title": "≤30", "text": "≤1200",
  "ref": null | { "type": "plate", "ch": "c0–c13", "shot": 0 } | { "type": "relay", "k": "≤8", "by": "≤16", "x": "≤240" } }
{ "kind": "card", "name": "≤20 必填", "alias": "≤20", "kind2": "≤20", "era": "≤20", "item": "≤20", "from": "≤20",
  "say": "≤80", "ch": "c0–c13", "shot": 0 }
```

### 一筆資料

存在 Blob 裡的樣子（`board/<k>.json` → `{ "items": [...] }`，新的在後面）：

```jsonc
{
  "id": "mb3k2f9xq1", "t": 1762828800000, "name": "≤16",
  "oh": "<sha256(o)>", "ih": "<ip 雜湊>",          // 不公開
  "x": "…" | "w": { … }, "q": "q3",                // q 只有 theory 有
  "r": { "a": 2, "b": 0, "c": 1 },                 // 共鳴的計數
  "by": { "<oh12>": "a" },                         // 誰按了什麼，不公開
  "fl": ["<oh12>"],                                // 回報的人，不公開
  "hid": 1,                                        // 被隱藏，不公開、也不出現在清單
  "pin": 1                                         // 館方選件
}
```

公開的樣子只有：`id` `t` `name` `x`／`w` `q` `r` `pin`。

---

## `GET /api/health`

不碰儲存空間，前端開機時用它判斷後端在不在。

```json
{ "ok": true, "api": 2, "v": "2.0.0", "store": "blob", "t": 1762828800000,
  "features": ["board", "react", "report", "vote", "pulse", "case", "admin"],
  "limits": { "relay": 240, "theory": 400, "piece": 1200, "items": 500 } }
```

`store` 是 `blob`／`file`／`memory`／`none`。是 `none` 時 `ok` 為 `false`，狀態碼仍是 200。
快取：`public, max-age=0, s-maxage=300, stale-while-revalidate=3600`。

## `GET /api/board?k=<頻道>`

```json
{ "k": "h33", "items": [ { "id": "…", "t": 0, "name": "…", "x": "…", "r": { "a": 1, "b": 0, "c": 0 } } ], "n": 1, "t": 1762828800000 }
```

- 被隱藏的不列出。
- 回應帶 `ETag`；請求帶 `If-None-Match` 且相同時回 304。
- 快取：`public, max-age=0, s-maxage=10, stale-while-revalidate=60`。查詢字串帶 `fresh=<任意值>` 時改成 `no-store`（前端在自己剛寫入後用它跳過 CDN）。

## `POST /api/board`

```jsonc
{ "k": "h33", "o": "<作者鑰匙>", "name": "≤16", "x": "…" }          // 接龍
{ "k": "theory", "o": "…", "name": "…", "q": "q3", "x": "…" }       // 推測
{ "k": "gallery", "o": "…", "name": "…", "w": { … } }               // 展牆
```

- 另有蜜罐欄位 `hp`：有值就回 201 但不寫入。
- 201 → `{ "item": { 公開的樣子 } }`
- 同一位作者在同一頻道十分鐘內送出和自己上一筆完全相同的內容 → 409 `duplicate`。
- 每個 IP 十分鐘 6 筆、每天（UTC）60 筆，跨頻道合計 → 429 `rate_limited`。
- 被停權的作者或 IP → 403 `banned`。
- 請求本體超過 6000 字元 → 413。

## `DELETE /api/board?k=<頻道>&id=<id>`

作者帶 `x-owner: <o>` 標頭（也接受 v1 的 `&o=<o>`），館主帶 `x-admin-key`。
200 → `{ "ok": true }`；403 `forbidden`；404 `not_found`。

## `POST /api/react`

```json
{ "k": "h33", "id": "…", "o": "…", "r": "a" }
```

`r` 是 `a`／`b`／`c`，空字串代表收回。每位作者對每一筆只有一個共鳴，可以改。

200 → `{ "id": "…", "r": { "a": 2, "b": 0, "c": 1 }, "mine": "a" }`

每一筆最多 200 人共鳴，滿了回 409 `full`。每個 IP 每分鐘 30 次（記憶體內計數）。

## `POST /api/report`

```json
{ "k": "h33", "id": "…", "o": "…" }
```

200 → `{ "ok": true, "hidden": false }`。同一個人重複回報只算一次。
不同的人回報滿 `REPORT_HIDE`（預設 3）次就自動隱藏，等館主處理。每個 IP 十分鐘 5 次。

## `GET /api/pulse`

大廳用的全館摘要，一次讀兩份文件。

```jsonc
{
  "t": 1762828800000,
  "totals": { "relay": 12, "works": 3, "theories": 5, "voters": 40 },
  "feed": [ { "k": "h33", "id": "…", "t": 0, "name": "…", "s": "前 40 個字…" } ],   // 最新 24 筆，新的在前
  "poll": { "s1": { "a": 30, "b": 10 }, "s2": { "a": 0, "b": 0 } /* … s8 */ },
  "storms": [0, 0, 3, 0, 0, 0, 5, 2, 1, 4, 6]                                         // 十一場雨各有幾位
}
```

快取：`public, max-age=0, s-maxage=30, stale-while-revalidate=300`。

## `POST /api/vote`

```json
{ "o": "…", "picks": { "s1": "a", "s4": "b" }, "storm": 6 }
```

- `picks` 的值是 `a`／`b`，空字串代表收回；沒帶到的時刻維持原樣。
- `storm` 是 0–10，`-1` 代表收回；沒帶就維持原樣。
- 每位作者一份紀錄，計數依前後差異增減。

200 → `{ "poll": { … }, "storms": [ … ], "voters": 41, "mine": { "picks": { "s1": "a", "s4": "b" }, "storm": 6 } }`

名單上限 20000 人，滿了之後新的人回 409 `full`。每個 IP 每分鐘 20 次。

## 雲端存檔 `/api/case`

前端先用同步碼在瀏覽器裡把手提箱加密（AES-GCM），後端只看到一串密文和一個由同步碼導出的 `id`（64 個十六進位字元），解不開內容。

| 方法 | 請求 | 回應 |
| --- | --- | --- |
| `GET /api/case?id=` | | 200 `{ "rev": 3, "t": 0, "data": "…" }`／404 |
| `PUT /api/case` | `{ "id": "…", "data": "≤300000 字元", "rev": 3, "force": false }` | 200 `{ "rev": 4, "t": 0 }`；雲端的 `rev` 和帶來的不同且沒有 `force` → 409 `conflict`，附 `{ "rev": 雲端的, "t": 雲端的 }` |
| `DELETE /api/case?id=` | | 200 `{ "ok": true }` |

第一次上傳不用帶 `rev`（雲端已有資料時仍會 409）。全部 `no-store`。每個 IP 每分鐘 6 次寫入。

## 館主 `/api/admin`

沒有設定 `ADMIN_KEY` 時整組回 404；鑰匙不對回 403。

- `GET /api/admin?view=ping` → `{ "ok": true }`
- `GET /api/admin?view=queue` → `{ "items": [ { "k": "h33", "id": "…", "t": 0, "name": "…", "x": "…", "fl": 2, "hid": 1, "pin": 0, "oh12": "…", "ih": "…" } ], "bans": { "o": [], "ip": [] } }`（所有被回報或被隱藏的）
- `GET /api/admin?view=export` → 整份備份 `{ "t": 0, "board": { "h33": { "items": [...] } }, "site": { … }, "poll": { … } }`
- `POST /api/admin` `{ "act": "…", "k": "…", "id": "…" }`
  - `hide` `show` `del` `pin` `unpin` `clear`（清掉回報）
  - `ban`：把這一筆的作者（`oh12`）和 IP 雜湊加入停權名單，並隱藏這一筆
  - `unban`：`{ "act": "unban", "target": "<oh12 或 ih>" }`
  - `recount`：重算全館計數
  - 200 → `{ "ok": true }`

## `GET /api/cron/sweep`

每天一次（`vercel.json` 的 `crons`）。清掉 v1 留下的 `rl/*.json`、過期的雲端存檔（`CASE_TTL_DAYS`，預設 365 天沒更新），並重算計數。

授權：設了 `CRON_SECRET` 就要 `Authorization: Bearer <CRON_SECRET>`；沒設但有 `ADMIN_KEY` 就要 `x-admin-key`；兩者都沒設則開放，但同一個執行個體一小時內只做一次。

200 → `{ "ok": true, "removed": { "rl": 0, "cases": 0 }, "totals": { … } }`

## 實作上的補充

規格沒寫到、實作時定下來的細節：

- **回報**：只有在回報人數「跨過」門檻的那一刻自動隱藏。館主放行（`show`）之後，再有人回報只會累計，不會再次隱藏，除非先 `clear`。回報一則已隱藏的內容回 200 `{ "ok": true, "hidden": true }`；對已隱藏的內容共鳴回 404。
- **投票**：`picks` 出現不認得的時刻或值、`storm` 超出範圍，回 400。全部收回的人會從名單上移除。回應裡 `mine.storm` 沒選時是 `-1`。
- **雲端存檔**：雲端還沒有資料時帶 `rev` 上傳也接受，新的 `rev` 是帶來的值加一。刪除不存在的 `id` 回 200。
- **刪除**：沒帶有效的作者鑰匙也沒帶館主鑰匙，直接回 403，不讀儲存空間。
- **動態的摘要 `s`**：最多 40 個字，不加刪節號。題寫取標題（沒有標題取內文），人物檔案取名字。
- **計數**：`totals` 只算看得到的（沒被隱藏的）。計數是逐次加減的，`recount` 和每日清理會重算一次並順便修正動態與投票的總數。
- **匿名**：`POST /api/board` 沒帶有效鑰匙時仍可發表（之後不能自己刪）；重複內容的判定改用 IP 雜湊。
- **額外的頻率限制**（都在記憶體裡）：非館主的刪除每分鐘 30 次、讀雲端存檔每分鐘 60 次、館主鑰匙打錯每分鐘 10 次（超過回 429）。同一個 IP 每分鐘超過 20 次 `fresh=` 讀取時，退回五秒的記憶體快取。
- **清理的授權**：授權失敗回 403；沒設任何密鑰時，一小時內第二次呼叫回 429。
- **其他**：`HEAD` 當成沒有本體的 `GET`；405 會帶 `Allow`；跨來源時 `ETag` 和 `Retry-After` 列在 `Access-Control-Expose-Headers`。
- **儲存的判斷**：有 `BLOB_READ_WRITE_TOKEN` 或 `BLOB_STORE_ID`（OIDC 連線）就用 Blob。Blob store 不存在、被停用或權杖失效時回 503 `no_store`。

---

## 儲存的配置

| 路徑 | 內容 |
| --- | --- |
| `board/<k>.json` | `{ "items": [ … ] }` |
| `sys/site.json` | `{ "v": 2, "rl": { "day": "2026-11-11", "ip": { "<ih>": [時間戳…] } }, "feed": [ … ], "tot": { "relay": 0, "works": 0, "theories": 0 }, "ban": { "o": [], "ip": [] } }` |
| `sys/poll.json` | `{ "v": 2, "poll": { "s1": { "a": 0, "b": 0 } … }, "storms": [11 個數字], "voters": { "<oh12>": "ab-a----6" } }`（前 8 個字元是八個時刻，`-` 代表沒選；第 9 個字元是雨次的 36 進位，`-` 代表沒有） |
| `case/<id>.json` | `{ "rev": 1, "t": 0, "data": "…" }` |

所有「讀 → 改 → 寫」都用 ETag 條件寫入，被別人搶先就重讀重做，最多六次。

## 環境變數

| 名稱 | 用途 | 預設 |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob（連上 store 後自動帶入） | |
| `ADMIN_KEY` | 館主鑰匙 | 沒設就沒有館主功能 |
| `ALLOW_ORIGINS` | 允許的來源，逗號分隔 | `*` |
| `HASH_SALT` | IP 雜湊的鹽 | `nyjn` |
| `CRON_SECRET` | 排程的密鑰 | |
| `RATE_10MIN` `RATE_DAY` | 寫入的頻率上限 | `6` `60` |
| `REPORT_HIDE` | 幾個人回報後自動隱藏 | `3` |
| `CASE_TTL_DAYS` | 雲端存檔保留天數 | `365` |
| `NYJN_STORE` | 強制指定儲存：`blob`／`file`／`memory` | 自動判斷 |
| `NYJN_DATA_DIR` | `file` 模式的資料夾 | `.data` |
