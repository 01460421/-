# 模考轉錄台

把學測英文模擬考 PDF 轉成結構化 JSON，題目裡的圖片與圖表一起裁切出來，整包下載成 zip。
可一次放多份 PDF，也可以直接放有書籤的總集大檔（例如 `books/` 產生的各科冊子），會依書籤切成每一回。

所有處理都在你自己的電腦上進行，檔案不會上傳到別的地方。請只用在你有權使用的檔案上，輸出供個人整理與備考。

## 啟動

**最簡單**：把整個 `gsat-mock-exams` 資料夾放在電腦上，雙擊

- macOS／Linux：`transcriber/start.command`
- Windows：`transcriber/start.bat`

第一次會自動建立 Python 環境並安裝套件，接著瀏覽器會打開 <http://127.0.0.1:8765>。

**手動**（需要 Python 3.10 以上）：

```bash
cd gsat-mock-exams
python3 -m venv .venv-transcriber
.venv-transcriber/bin/pip install -r transcriber/requirements.txt
.venv-transcriber/bin/python -m transcriber.app          # 網站
.venv-transcriber/bin/python -m transcriber.cli 檔案或資料夾 -o 結果.zip   # 命令列批次
```

### OCR（掃描檔需要）

有文字層的 PDF 不需要 OCR。掃描成圖片的 PDF 要安裝 Tesseract 才能轉出文字；沒裝的話，這些頁會標記 `needs_ocr`，並附上整頁圖。

- macOS：`brew install tesseract tesseract-lang`
- Windows：安裝 [UB Mannheim 版 Tesseract](https://github.com/UB-Mannheim/tesseract/wiki)，安裝時勾選 Chinese (Traditional)，並把安裝路徑加進 PATH
- Ubuntu：`sudo apt install tesseract-ocr tesseract-ocr-chi-tra`

網站右上角會顯示 OCR 是否可用。

## 網站用法

1. 把 PDF 拖進左側方框（可多份），或在下面輸入電腦上的資料夾路徑。資料夾會遞迴找所有 PDF，大量或很大的檔案用路徑就不必上傳。
2. 選項：
   - **依書籤切成多回**：總集大檔用。第一層書籤是一回，第二層名稱含「詳解／解析／答案」的是解析部分。
   - **掃描頁自動 OCR**：文字少於 40 字的頁才 OCR。
   - **每頁都 OCR**：文字層是亂碼時用。
   - **整頁圖**：只附掃描頁、每頁都附，或不附。
3. 按「開始轉錄」，右側會顯示每份檔的進度。完成後可以點每一回預覽題目，正確答案會標成綠色；也可以切到原始 JSON。
4. 按「下載 zip」。

## 命令列

```bash
python -m transcriber.cli a.pdf b.pdf 某資料夾/ -o 結果.zip
  --no-ocr                不做 OCR
  --force-ocr             每頁都 OCR
  --no-split              不依書籤切
  --page-images none|scanned|all
  --lang eng+chi_tra      OCR 語言
```

## 輸出

```
結果.zip
├── index.json                 每份 PDF 切出幾回、每回的題數與警告
└── <PDF 檔名>/
    └── <回名>/
        ├── exam.json
        ├── images/p0003_1.png  題目附圖（p＝原 PDF 頁碼）
        └── pages/p0005.png     掃描頁整頁圖
```

`exam.json`（`schema: gsat-mock-transcription/v1`）：

```jsonc
{
  "title": "115 學測　翰林 E3",
  "source": { "file": "英文_第三次….pdf", "question_pages": [4, 5, …], "answer_pages": [16, …] },
  "sections": [
    {
      "type": "vocabulary",        // vocabulary｜cloze｜fill_in｜structure｜reading｜mixed｜translation｜composition｜non_choice｜unknown
      "title": "一、詞彙題（占 10 分）",
      "instructions": "說明：…",
      "range": [1, 10],            // 大題標題寫了題號範圍才有
      "groups": [
        {
          "range": [21, 24],       // 「第 21 至 24 題為題組」
          "passage": "文章或題組說明",
          "options": { "A": "…" }, // 文意選填、篇章結構的共用選項
          "images": ["images/p0007_1.png"],
          "questions": [
            {
              "no": 21, "kind": "choice",   // choice｜non_choice
              "stem": "題幹",
              "options": { "A": "…", "B": "…", "C": "…", "D": "…" },
              "answer": "B",                // 從解析對到的答案，多選題如 "ACD"；對不到為 null
              "explanation": "解析文字",
              "images": [], "page": 7
            }
          ]
        }
      ]
    }
  ],
  "figures": [ { "path": "images/p0007_1.png", "page": 7, "kind": "embedded|vector", "width": 640, "height": 360 } ],
  "loose_figures": [],            // 找不到對應題目的圖
  "unparsed_text": [],            // 第一個大題標題之前的文字（封面、作答須知）
  "ocr": { "ocr_pages": [3, 4], "needs_ocr_pages": [] },
  "stats": { "sections": 6, "questions": 46, "answers_found": 46, "figures": 3 },
  "warnings": ["題號不連續（在 33 附近），請對照原檔"]
}
```

### 怎麼判斷的

- **大題**：行首是「一、」「第貳部分」這類編號，後面接題型名稱（詞彙、綜合測驗、文意選填、篇章結構、閱讀測驗、混合題、中譯英、英文作文）。
- **題組**：「第 X 至 Y 題為題組」。
- **題目**：行首「21.」，題號要接續上一題。非選擇題的題號從 1 重新算。
- **選項**：`(A)`–`(J)`。少於兩個選項就不拆。
- **答案**：
  - 「1.(B)」寫法
  - 「題號列＋答案列」對照表，含 OCR 黏成「12345678／BAAC…」的情況
  - 「【答案】(B)」
- **解析**：從解析裡「題號.」開始到下一題之前的文字。
- **附圖**：嵌入圖片，以及含填色或曲線的向量圖群組（底線、框線不算），掛到同一頁、圖上方最近的題目或題組。

### 已知限制

- 雙欄排版用簡單規則判斷左右欄。版面複雜時，閱讀順序可能交錯。
- 掃描檔的底線空格、表格框線，OCR 不一定保留。
- 文意選填、篇章結構的空格題沒有題幹，`stem` 為空；文章裡的空格以原文的 `__21__` 等標記呈現。
- 每回的 `warnings` 會列出對不到答案、題號不連續、需要 OCR 等情況，請對照原檔確認。
