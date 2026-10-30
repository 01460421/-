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

## 版本

- 第 2 版（2026-10-30）：加入甄選會 115/10/27 公布的 116 學測參採科目（台大醫不變、陽明交大／成大／北醫／長庚採英文、中山醫傳改採社會）、116 學測三日考程、115 各校個人申請與繁星名額完整表、中國醫 115 篩選倍率、115 分發入學錄取分數，並更正公費醫師計畫為「114 年 9 月拍板續辦，三校學士後醫各 30 名公費」。
- 第 1 版（2026-09-25）：初版。

## 更新內容

- 116 學年度各校醫學系校系分則（名額、檢定、篩選倍率、二階配分）預定於 115 年 11 月 3 日隨簡章公告，屆時請更新 `index.html` 第 06 節表格與第 03 節參採組合。
- 資料彙整日期與來源列於文件封面與第 08 節。
