# 學測模擬考蒐集（gsat-mock-exams）

蒐集網路上**公開**的學測模擬考：國文（國綜、國寫）、英文、數學A／B、自然，以第二、三、四次全國模擬考（全模）與北模／中模為主，附詳解、答案卡、非選參考答案與級距（五標、級分人數、原始分數與級分對照表）。

> **僅供個人私用備考。** 試題著作權屬各出版社（翰林、南一、文昌）與命題學校，本專案只整理已公開分享的檔案，不轉售、不公開散布。
> 需要登入（教師專區、會員、學校帳號）的內容只記錄來源，不下載、不繞過。

## 編號與年份

- 模考用**學年度**編號，學測用**民國年**：113 學年度的模考（2024/7–12）是 114 學測考生考的。
  目錄裡 `year` 一律是學測年，`school_year` 是模考學年度；資料夾是 `files/<學測年>學測/<學年度>-<代號>_<命題單位>/<科目>/`。
- 代號：
  - `E` 翰林：E1 是 7 月的全國模考；E2–E4 是北北基聯合模擬考，113 學年度起「北模」就是這三場。
  - `N` 南一：全國公私立高中聯合模擬考。
  - `W` 文昌。
  - `B` 北模：112 學年度以前臺北區自辦，B1、B2 兩場。
  - `G` 中模：臺中市高中聯合模擬考，目前只找到 111、112 學年度。
- 南模：112–115 學測都沒有找到任何一場（見 `research/regional-summary.md`）。

## 資料夾

| 路徑 | 內容 |
|---|---|
| `INDEX.md` | 依學測年、考次、科目列出所有檔案與下載狀態（自動產生） |
| `catalog/catalog.jsonl` | 合併、去重後的完整目錄（一行一筆） |
| `catalog/download-log.jsonl` | 每筆的下載結果、存放路徑與 SHA-256 |
| `bands/級距總表.md`、`級距總表.xlsx`、`bands.csv` | 各考次各科的級距、五標、到考人數、15 級分門檻（`tools/build_bands.py` 由 `bands/raw/` 產生） |
| `bands/級分門檻.md` | 每場考試 1–15 級分的原始分數下限；有官方對照表照抄，沒有則由級距推算（標 *） |
| `bands/備註.md`、`bands/raw/` | 從 95 張級距圖／PDF 逐張判讀的原始紀錄與判讀備註（放錯資料夾、截圖裁切、網友整理等） |
| `research/*.jsonl`、`*-summary.md` | 各來源的調查結果與說明：出版社、北中南模、各高中、社群／雲端、使用者提供的雲端資料夾與 Notion 資料庫 |
| `tools/` | 蒐集、下載、整理用的腳本 |
| `files/` | 下載的檔案（**不進版控**，repo 是公開的；用下面的步驟在本機重建） |

## 主要來源

- 使用者提供的公開 Google 雲端資料夾（111–115 學年度，南一、翰林、文昌）
- Notion 公開資料庫「Mock Tests for GSAT 學測模擬考」（110–113 學年度，含北模、中模）
- 周逸化學團隊公開雲端（111–115 學年度，各科、級距）
- 國立彰化高中教務處「試題解答」（翰林 E2–E4 原卷與詳解）
- 臺中一中賴老師數學站（數A／數B 試題與詳解）
- 王欣國文、陳蒂國文（國綜、國寫、級距及五標）
- 袋鼠 Blog 雲端、PTT SENIORHIGH 推文連結

## 在本機重建

```bash
python3 -m venv .venv
.venv/bin/pip install requests beautifulsoup4 playwright pypdf
.venv/bin/python -m playwright install chromium   # 雲端硬碟大檔或確認頁需要無頭瀏覽器

# 1. 展開來源（已做好的結果在 research/，通常不必重跑）
.venv/bin/python tools/import_gdrive_folder.py <資料夾ID> research/gdrive-xxx.jsonl
.venv/bin/python tools/import_notion_db.py <notion 公開頁網址> research/notion-xxx.jsonl

# 2. 合併成目錄、下載、解壓、打包
.venv/bin/python tools/build_catalog.py research/*.jsonl
.venv/bin/python tools/fetch.py --workers 16
.venv/bin/python tools/extract_archives.py
.venv/bin/python tools/package.py 115 out/      # 每包 ≤300 MB，內容相同的檔只留一份
```

`tools/fetch.py` 會先用一般 HTTP 下載；Google 雲端硬碟公開檔遇到「無法掃描病毒」確認頁時會帶確認參數重試，仍拿不到才用 Playwright 無頭模式開分享頁下載。若 Chromium 不在 `/opt/pw-browsers`，改 `fetch.py` 裡的 `CHROMIUM` 路徑。

## 已知缺口

- 113–115 學測的英文、自然非選評分原則公開檔很少。
- 南一版國文、英文、自然只在雲端分享看得到，學校官網沒有。
- 翰林試務中心（成績、答案卡影像）、龍騰教師專區、Dcard、FB 社團需登入，未收錄。
- `.rar` 整包檔在雲端環境沒有解壓工具，未解開（內容多半已有單檔）。
