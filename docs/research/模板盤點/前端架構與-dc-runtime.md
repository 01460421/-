
## area
前端頁面架構：app.html（單檔 SPA）＋ support.js（dc-runtime）＋ index.html/js/core.js（經典版與 iframe 面板）

## summary
全站是「一個 DC 元件」：app.html 的 `<x-dc>`（15–3438 行）是模板，`<script type="text/x-dc" data-dc-script>`（3439 行起）是唯一的 `class Component extends DCLogic`。support.js 在 head 同步載入，先注入 `x-dc{display:none}` 防閃，再載 vendor React、把模板編譯成 React builders，掛到 `#dc-root`。模板語法刻意極簡（只有 `{{ 路徑 }}`、`<sc-if>`、`<sc-for>`、`<helmet>`），所有判斷、格式化、配色都在 `renderVals()`（14010–16400+）算成扁平物件送進模板。路由不用 hash 也不用 History，而是 `state.page` 字串配 29 個頂層 `<sc-if value="{{ isXxx }}">`，切頁走 `go(p)`（13725）順便觸發該頁的懶載入；深連結只支援 `?page=`。狀態全在 `this.state`（3787）＋ localStorage（`sekai-*` 前綴），BK_KEYS 白名單負責匯出／匯入備份。

## key_files
[
 {
  "path": "/home/user/Project-sekai-center/app.html",
  "role": "整個 App 版 SPA。1–13 行 head（防閃主題腳本、__resources React 對映、support.js）；15–3438 <x-dc> 模板（含 16–178 <helmet> 內的全站 CSS 變數與樣式）；3439–17097 <script data-dc-script> 內的 class Component extends DCLogic（常數表→state→生命週期→資料載入→計算→go/renderVals→事件）",
  "size": "1.27MB / 17097 行 / 1853 處 {{ }} 插值"
 },
 {
  "path": "/home/user/Project-sekai-center/support.js",
  "role": "dc-runtime（GENERATED，勿手改）。parse.ts 解析 <x-dc>/data-dc-script/data-props；compile.ts 把模板編成 builder；expr.ts 是極簡表達式求值器；logic.ts 的 StreamableLogic 就是 DCLogic；component.ts 用 React class 元件包住 logic 並當 error boundary；registry/runtime 管熱更新與 sibling fetch",
  "size": "68KB / 1911 行"
 },
 {
  "path": "/home/user/Project-sekai-center/index.html",
  "role": "經典版單頁（hash 錨點導覽 #calendar/#gacha…），同時是 13 種 ?embed= 內嵌面板的來源（calc/ministudio/deck/gacha/gachasim/gachacalc/cardlib/dolls/bonuscards/lookup/distribution/shop/b30）。20 行與 1286–1346 行是 embed 模式的 body class 切換、分頁列注入與 postMessage 高度回報",
  "size": "104KB / 1346 行"
 },
 {
  "path": "/home/user/Project-sekai-center/js/core.js",
  "role": "index.html 抽出的共用邏輯，全域大物件模組（DarkMode:6、NavUI:58、ChartUtil:211、EventModule:679、CardModule:2130、PowerEngine:2432、RunStudio:3237、GachaSim:4035、ShopAnalyzer:4519、GlobalSearch:5845…），五個以上 embed 面板共享同一份。48 行接收 app.html 發來的 sekaiTheme 訊息",
  "size": "492KB / 6086 行"
 },
 {
  "path": "/home/user/Project-sekai-center/css/core.css",
  "role": "經典版共用樣式與設計 token（--bg/--card/--accent/--shadow-*/--r-*/六種 tone）。注意深色用 :root.dark，與 app.html 的 :root.theme-dark 是兩套類名",
  "size": "92KB / 971 行"
 },
 {
  "path": "/home/user/Project-sekai-center/data/*.js",
  "role": "純資料分片，每個檔 export const。sekai-data(GACHAS,DOLLS)、ep-songs(EP_SONGS)、tutorial-data(TUT_QA)、cards-index(CARDS…)、card-chara、collection-assets、card-sigs 用 dynamic import()；billing/borders-db/b30-consts 是非 module，用 <script> 注入",
  "size": "合計 6.6MB"
 },
 {
  "path": "/home/user/Project-sekai-center/tools/stamp-assets.py",
  "role": "對 js/ css/ data/ vendor/ 與 support.js 算 sha256 前 10 碼，改寫四個 HTML 裡的 ?v= 版本戳。冪等，改完資源必跑",
  "size": "70 行"
 },
 {
  "path": "/home/user/Project-sekai-center/vercel.json",
  "role": "快取策略與路由：*.html must-revalidate、js/css/vendor/support.js/data 一年 immutable（billing、b30-consts、borders-db 例外）、/ 與所有未知路徑 rewrite 到 app.html",
  "size": "3.3KB"
 }
]

## reusable
[
 {
  "thing": "support.js（dc-runtime）整份",
  "how_to_reuse": "直接複製到新專案根目錄，head 裡 <script src=\"./support.js\"></script>（同步、不要 defer）。它會自動找 document 裡第一個 <x-dc> 當根元件，元件名取自檔名（app.html → 「app」）。想不依賴 unpkg 就照 app.html 第 11 行放一份 window.__resources 把兩個 React CDN 網址對映到自帶的 /vendor 檔",
  "effort": "照抄"
 },
 {
  "thing": "單檔 SPA 骨架：head 防閃腳本 → <x-dc><helmet>CSS</helmet> 版面 </x-dc> → <script data-dc-script>class Component extends DCLogic",
  "how_to_reuse": "複製 app.html 的 1–19 行與 3439–3440 行當空殼，中間替換自己的版面。學測站可直接沿用同樣的三段式：head 同步套主題 class、helmet 掛 CSS 變數、模板純標記＋renderVals 出資料",
  "effort": "照抄"
 },
 {
  "thing": "CSS 設計 token 系統（app.html 20–177 行）",
  "how_to_reuse": "--bg/--card/--text/--accent/--border/--sh-* 一套，深色用 @media(prefers-color-scheme:dark){:root:not(.theme-light){…}} ＋ :root.theme-dark 兩份同值，再疊六種 tone-* 只覆蓋強調色。學測站把配色數值換掉即可，結構不動；記得保留 color-scheme 宣告與 select option 的明確配色（164–176 行）",
  "effort": "小改"
 },
 {
  "thing": "page 字串路由：PAGES 表 ＋ go(p) ＋ 頂層 sc-if",
  "how_to_reuse": "PAGES（3521）改成科目/單元表，go(p)（13725）改成各頁的懶載入 switch，模板照樣一頁一個 <sc-if value=\"{{ isXxx }}\">。?page= 深連結（3913）自動生效",
  "effort": "小改"
 },
 {
  "thing": "navGroups / dockSpec 導覽產生器（renderVals 14019–14046）",
  "how_to_reuse": "把 navSpec 陣列改成自己的分組（[群組名, [[id, 顯示名, 圓點色]…]]），選中態的 bg/fg 在 map 裡算好。桌機側欄、手機 bottom sheet、底部 dock 三處共用同一份 navGroups，加一頁只改一個陣列",
  "effort": "小改"
 },
 {
  "thing": "BK_KEYS 備份／還原機制（3448–3490）",
  "how_to_reuse": "把 [key, 中文說明] 清單換成自己的鍵，bkCollect/bkExport/bkImport 三個方法原封不動抄。匯入用 allow Set 白名單擋掉不認得的鍵，還原後 location.reload()。學測站拿來存做題紀錄、錯題本、進度非常合適",
  "effort": "照抄"
 },
 {
  "thing": "⌘K 指令面板（openCmd 13743、buildCmd 13967、onCmdKey 16310、模板 3414）",
  "how_to_reuse": "buildCmd() 回傳 [{tag,tagBg,main,sub,run}]，第一段先掃 PAGES 產生「前往」項，後面再接自己的資料源（卡池/歌曲/教學 → 換成 考點/題目/講義）。鍵盤處理與上下選取邏輯照抄",
  "effort": "小改"
 },
 {
  "thing": "分頁 + 漸進展開的清單策略（14374–14403、bdbN/sysMore/tutMore）",
  "how_to_reuse": "filteredXxx() 回完整陣列 → renderVals 內 slice((p-1)*PER, p*PER) 只算當頁 → 模板 sc-for。要「顯示更多」就存一個 N 到 state，按鈕做 N+=60。整套不需要虛擬列表就能撐住數千筆",
  "effort": "照抄"
 },
 {
  "thing": "高頻更新繞過重繪：直接寫 DOM（componentDidMount 3959–3965 的 #liveCd 倒數）",
  "how_to_reuse": "任何每秒更新的東西（考試倒數、計時器）都照這個寫：setInterval 裡 getElementById + textContent，不要 setState。同理，快取放 this._xxx 私有欄位而非 state",
  "effort": "照抄"
 },
 {
  "thing": "圖表：renderVals 算 path d，互動用 document 級事件委派（wireCharts 4401、mkChart 4482）",
  "how_to_reuse": "SVG 用 data-chart=\"key\" 標記、讀數容器用 data-readout=\"key\"，一次性掛 pointerdown/move 到 document，命中後直接改 SVG 屬性。含 Android setPointerCapture 與長按選單抑制的處理，成績趨勢圖可原樣沿用",
  "effort": "小改"
 },
 {
  "thing": "首屏防閃爍三件套",
  "how_to_reuse": "(1) head 內同步 <script> 讀 localStorage 打 theme/tone class（app.html 7–9）；(2) support.js 開頭 hideRawTemplate() 注入 x-dc{display:none!important}（support.js 1818）；(3) helmet 裡 <link> 字型用 display=swap。三者缺一都會閃",
  "effort": "照抄"
 },
 {
  "thing": "iframe 內嵌面板協定（?embed=xxx ＋ postMessage sekaiCalcHeight / sekaiTheme / sekaiGoto）",
  "how_to_reuse": "子頁靠 body class 隱藏無關區塊、ResizeObserver 回報高度給父頁自適應；父頁 _frameMsg（3978）依 id 白名單設 height，syncFrames（4117）把主題推給所有 iframe。要把舊的獨立工具頁收進新站時很好用",
  "effort": "小改"
 },
 {
  "thing": "stamp-assets.py 版本戳工具",
  "how_to_reuse": "改 HTML/ASSET_DIRS 兩個常數即可用在任何專案，搭配 vercel.json 的 immutable 快取規則一起抄",
  "effort": "小改"
 },
 {
  "thing": "js/core.js 那種「全域大物件模組」寫法",
  "how_to_reuse": "如果新站不打算全走 DC runtime，可沿用這種 const XxxModule = { init(), render() } 的無打包寫法（單檔 <script>，靠 ?v= 雜湊快取）。但不建議當主架構——6086 行單檔已經很難維護",
  "effort": "大改"
 },
 {
  "thing": "renderVals 一次算 29 頁的做法",
  "how_to_reuse": "這是本專案最大的技術債，別照抄。新站應該在 renderVals 開頭依 s.page 分派到 pageVals_xxx()，或至少把重運算包成 if (s.page === 'x') 才算",
  "effort": "重寫"
 }
]

## gotchas
[
 "模板表達式極弱：support.js 的 resolve()（205–294 行）只支援 識別字路徑、.屬性、[索引]、前置 !、===/!==/==/!=、括號、數字/字串/true/false/null 字面量。沒有算術、沒有三元、沒有 && ||、不能呼叫函式。所有邏輯一律得在 renderVals() 先算好——這是整個架構的鐵律，違反時不會報錯，只會靜靜渲染成空白。",
 "沒有 sc-else。要 A/B 二選一就準備兩個互補布林開兩個 sc-if（本專案就是 songList / songEmpty / songBusy 這種寫法）。",
 "{{ 打錯字 }} 不會噴錯：resolve 回 undefined → 文字節點渲染成空、console.warn 一次（walkText 583–595）就沒了。加新欄位務必同時檢查 console。",
 "改完 js/ css/ data/ vendor/ 或 support.js，提交前一定要跑 python3 tools/stamp-assets.py。這些檔案吃一年 immutable 快取，沒重戳使用者會拿到「新 HTML 配舊 JS」。",
 "data/history/*.json 只能新增、不能刪改（README 有整節警告）：那是 GitHub Actions 每 30 分鐘累積的榜線時序，刪掉補不回來。要測腳本請複製到別的目錄。",
 "renderVals() 每次 setState 都全量重算 29 個頁面的資料（約 2400 行），沒有依 page 短路。所以每秒更新的倒數是直接寫 DOM（3959–3965），任何高頻更新都不能走 setState。",
 "文字插值會被包成 <span class=\"sc-interp\">…</span>，不是純文字節點。寫 CSS 的 :first-child、inline 排版、white-space 時要記得多一層 span。",
 "style-hover / style-active / style-focus 產生的規則會被 importantify() 加上 !important（pseudo.ts 1542–1565），優先權高過 inline style；style-before/after 例外不加。",
 "元件邏輯的 class 名字必須叫 Component：evalDcLogic 只 return `typeof Component!=='undefined' && Component`（support.js 848）。改名就整頁變成空模板，錯誤訊息在 r.logicError。",
 "<script> 一定要帶 data-dc-script 屬性，parseDcDocument 用 querySelector('script[data-dc-script]') 找它；type=\"text/x-dc\" 只是讓瀏覽器別執行。",
 "React 走 window.__resources 對映到 /vendor（app.html 第 11 行）。改 vendor 檔或版本戳時，這行的網址也要同步更新，否則 fallback 去 unpkg 帶 SRI，離線／被牆時就白畫面。",
 "主題類名兩套不一致：app.html 用 :root.theme-dark / .theme-light，index.html + css/core.css 用 :root.dark，但共用同一個 sekai-theme localStorage 鍵。改主題邏輯要兩邊一起改，否則 iframe 面板在深色 App 裡會是白的。",
 "所有 localStorage 存取都必須包 try/catch —— 無痕模式與部分 iOS 設定會直接丟例外，本專案每一處都包了。",
 "<table>/<tr>/<td>/<select> 在模板裡會先被改名成 <sc-raw-table> 等別名再還原（encode.ts RAW_WRAP 303–316）。這是為了讓 <sc-if>/<sc-for> 待在表格裡不被 HTML parser 提出去；自己新增 raw-wrap 標籤要改 support.js（GENERATED，不該手改）。",
 "新增 iframe 面板時，id 必須加進 componentDidMount 的 _frameMsg 白名單（3978）才會自適應高度，並加進 syncFrames（4117）才會跟著換主題。",
 "所有外部圖片一律要 referrerpolicy=\"no-referrer\"（index.html 還在 head 下了文件級 <meta name=\"referrer\">）：storage.sekai.best 有防盜連，帶 Referer 直接 403。",
 "vercel.json 最後一條把所有未知路徑 rewrite 到 app.html，所以 404 不會出現、拼錯的網址會靜靜開首頁。",
 "sc-for 沒有 key 機制，用陣列 index 當 key（walkFor 635–642）。列表若會重新排序，React 會重用錯的 DOM（輸入框游標、動畫會跳）。",
 "x-dc 只認 document 裡的第一個；模板區與邏輯區必須在同一個 HTML 檔內（除非走 sibling fetch 的 ./{name}.dc.html 慣例）。"
]

## authoring_recipe
在 app.html 這套模板上新增一個全新頁面「exam」（以下行號皆為現況位置，實作時請用附近的關鍵字搜尋定位）：

【第 1 步｜註冊頁面】app.html:3521 `PAGES = {` 內加一行：
  exam: ['模擬考', '歷屆試題與作答紀錄'],
加進去之後，`?page=exam` 深連結（componentDidMount:3913）與 ⌘K 指令面板的「前往」項（buildCmd:13979–13982）會自動生效，不必另外註冊。

【第 2 步｜state 欄位】app.html:3787 `state = {` 內加該頁需要的欄位，命名跟現有慣例一致（清單 `examList`、載入中 `examLoad`、錯誤 `examErr`、搜尋 `eq`、頁碼 `ep`、篩選 `eu`）：
  examList: [], examLoad: false, examErr: '', eq: '', eu: 'all', ep: 1,

【第 3 步｜資料懶載入】
 (a) 新資料放 `data/exam.js`，用 `export const EXAM = [...]`（照 data/sekai-data.js 的形狀）。
 (b) 在 Component 裡加載入方法（仿 loadEpSongs:13707）：
   loadExam() {
     if (this._examLoading || (this.state.examList || []).length) return;
     this._examLoading = true;
     import('./data/exam.js').then(m => this.setState({ examList: m.EXAM || [] }))
       .catch(() => this.setState({ examErr: '題庫載入失敗，點此重試' }))
       .finally(() => { this._examLoading = false; });
   }
   重點：防重入旗標放 `this._examLoading`（底線私有欄位，不進 state 就不會觸發重繪）。
 (c) app.html:13725 `go(p)` 內加一行：`if (p === 'exam') this.loadExam();`

【第 4 步｜篩選函式】在 filteredSongs（13935）旁邊加同型的 `filteredExam()`，只回傳完整陣列，不做分頁。

【第 5 步｜renderVals 出資料】app.html:14010 起的 renderVals，在 return 物件（14566 起）內加：
  isExam: s.page === 'exam',
  ...(() => {
    const all = this.filteredExam(), PER = 30;
    const pages = Math.max(1, Math.ceil(all.length / PER));
    const p = Math.min(s.ep, pages);
    return {
      eq: s.eq,
      examEmpty: !s.examLoad && all.length === 0,
      examBusy: s.examLoad,
      examCount: '共 ' + this.n(all.length) + ' 題',
      examPager: Array.from({length: pages}, (_, i) => ({ p: i+1,
        bg: i+1 === p ? 'var(--cta)' : 'var(--card)', fg: i+1 === p ? '#fff' : 'var(--text-2)' })),
      examRows: all.slice((p-1)*PER, p*PER).map(x => ({
        id: x.id, title: x.title,
        lvBg: x.hard ? 'var(--lim-bg)' : 'var(--nm-bg)',   // 顏色在這裡算完
        lvFg: x.hard ? 'var(--lim-fg)' : 'var(--nm-fg)',
        cols: s.mobile ? '1fr' : '80px 1fr 120px'          // RWD 也在這裡算
      }))
    };
  })(),
鐵律：模板只吃 `{{ 路徑 }}`，任何三元、字串串接、數字格式化、顏色判斷都必須在這裡做完。

【第 6 步｜事件處理器】app.html:16213 `/* 事件 */` 區塊內加（都是 `on` 開頭的箭頭函式，參數靠 `e.currentTarget.dataset` 傳）：
  onExamPage: e => this.setState({ ep: +e.currentTarget.dataset.p }),
  onExamOpen: e => this.setState({ examId: +e.currentTarget.dataset.id }),
搜尋框可直接複用既有的通用 `onField`（16318），只要在 dataset 放 `data-k=\"eq\"`，並在 onField 內加一行 `if (d.k === 'eq') patch.ep = 1;` 讓改搜尋時回第一頁。

【第 7 步｜模板區塊】在 <main> 的內容容器裡（app.html:247 的 div 之內、3103 的 `</main>` 之前），照現有頁面順序插入：
  <!-- ========== 模擬考 ========== -->
  <sc-if value="{{ isExam }}">
  <div style="animation:pageIn var(--anim) cubic-bezier(.32,.72,.24,1);display:flex;flex-direction:column;gap:16px">
    <input value="{{ eq }}" onInput="{{ onField }}" data-k="eq" placeholder="搜尋題目…"
      style="padding:10px 14px;border:1px solid var(--border);border-radius:14px;background:var(--card);color:var(--text)">
    <div style="font-size:11.5px;color:var(--text-3)">{{ examCount }}</div>
    <sc-for list="{{ examRows }}" as="x" hint-placeholder-count="10">
      <button type="button" onClick="{{ onExamOpen }}" data-id="{{ x.id }}"
        style="display:grid;grid-template-columns:{{ x.cols }};gap:10px;min-height:48px;padding:12px 15px;border:1px solid var(--border);border-radius:16px;background:var(--card);color:var(--text);cursor:pointer;text-align:left"
        style-hover="border-color:var(--border-2);transform:translateY(-2px)" style-active="transform:scale(.97)">
        <span style="background:{{ x.lvBg }};color:{{ x.lvFg }};border-radius:999px;padding:2px 9px;font-size:11px;font-weight:800">{{ x.id }}</span>
        <span style="font-size:13.5px;font-weight:700;color:var(--ink)">{{ x.title }}</span>
      </button>
    </sc-for>
    <sc-if value="{{ examBusy }}"><div style="padding:40px;text-align:center;color:var(--text-3)">載入中…</div></sc-if>
    <sc-if value="{{ examEmpty }}"><div style="padding:40px;text-align:center;color:var(--text-3)">沒有符合的題目</div></sc-if>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
      <sc-for list="{{ examPager }}" as="g" hint-placeholder-count="5">
        <button type="button" onClick="{{ onExamPage }}" data-p="{{ g.p }}"
          style="min-width:36px;min-height:36px;border:1px solid var(--border);border-radius:10px;background:{{ g.bg }};color:{{ g.fg }};cursor:pointer">{{ g.p }}</button>
      </sc-for>
    </div>
  </div>
  </sc-if>
注意：沒有 sc-else，忙碌／空狀態各開一個互補的 sc-if；hint-placeholder-count 只影響串流時的骨架數量，寫個大概值即可。

【第 8 步｜掛上導覽】app.html:14019 `navSpec` 陣列，在合適的群組加 `['exam', '模擬考', '#7fb4f7']`。
桌機側欄（模板 195–201）、手機 bottom sheet（模板 3182–3190）都吃這同一份 navGroups，不必再改模板。
若要進手機底部 5 鍵 dock，另外改 14041 的 `dockSpec`（只有 5 格，加一個就得拿掉一個）。

【第 9 步｜選配的交叉引用】
 - 首頁快捷卡：15843 `quickLinks` 加 `{ id: 'exam', name: '模擬考', sub: '…', dot: '#7fb4f7' }`
 - 功能介紹頁：3649 `CHANGELOG` 加 `{ date:'學習', title:'模擬考', desc:'…', to:'exam', cta:'前往模擬考' }`
 - 脈絡教學：4881 `PAGE_TUT` 加 `exam: ['關鍵字1','關鍵字2']`
 - 若新增 localStorage 鍵：務必加進 3448 `BK_KEYS`，否則使用者匯出備份時會漏掉這份資料
 - 若站內助手要能查這頁：3556 `ALIASES` 加一列 [正式名稱, 工具名, '頁面id', '別名|別名']

【第 10 步｜需要複用經典版引擎時（可選）】
 (a) index.html:20 與 1293 兩處 embed switch 各加一個 `_e==='exam'` 分支加 body class
 (b) css/core.css 加 `.embed-exam` 的顯示/隱藏規則
 (c) js/core.js 加 `const ExamModule = { ... }`；index.html 尾端加 `if(mode==='exam'){ ExamModule.ensure(); }`
 (d) app.html 該頁模板放 `<iframe id="examFrame" src="./index.html?embed=exam" scrolling="no" …>`
 (e) app.html:3978 的 _frameMsg id 白名單加 'examFrame'（高度自適應）
 (f) app.html:4117 的 syncFrames id 陣列加 'examFrame'（主題同步）

【第 11 步｜收尾】
  python3 tools/stamp-assets.py     # 有動 data/ js/ css/ vendor/ support.js 就必跑
  python3 -m http.server 8899       # 本地預覽 http://localhost:8899/app.html?page=exam
驗收清單：切到該頁 console 沒有 `[dc-runtime] … never resolved` 警告、側欄與手機 sheet 都出現入口、⌘K 打「模擬考」能跳、重新整理帶 ?page=exam 直達、深/淺色與六種 tone 都不破、手機 900px 以下版面正確。
