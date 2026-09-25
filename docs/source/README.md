# 116 學測醫學系簡章統整：PDF 原始檔

`../116學測醫學系簡章統整.pdf` 由本目錄的 `index.html` 以 Chromium 列印而成。

## 重新產生 PDF

```bash
npm install @fontsource/noto-sans-tc @fontsource/noto-serif-tc   # 提供 Noto Sans / Serif TC 字型
npm install playwright && npx playwright install chromium        # 若環境尚未安裝
node build.js ../116學測醫學系簡章統整.pdf
```

`render.py` 可把 PDF 每頁輸出成 PNG 以便檢視（需要 `pip install pypdfium2 pillow`）：

```bash
python3 render.py ../116學測醫學系簡章統整.pdf page
```

## 更新內容

- 116 學年度各校醫學系校系分則（名額、檢定、篩選倍率、二階配分）預定於 115 年 11 月 3 日隨簡章公告，屆時請更新 `index.html` 第 05 節表格中的「116」欄位。
- 資料彙整日期與來源列於文件封面與第 07 節。
