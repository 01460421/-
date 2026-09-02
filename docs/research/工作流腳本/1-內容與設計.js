export const meta = {
  name: 'gsat-site-plan',
  description: '盤點 PJSK center 模板、學測各科範圍與人性化設計，產出學測複習網站的完整建置計畫',
  phases: [
    { title: '盤點模板', detail: '前端 dc-runtime / 資產與部署 / Worker 後端 三路並行讀碼' },
    { title: '學科範圍', detail: '國文、英文、數學AB、社會、自然、考招制度 六路並行整理' },
    { title: '設計理念', detail: '學習科學與考生心理 / 資訊架構與功能 / 技術與內容工程' },
    { title: '彙整批判', detail: '合成分期建置計畫，再由批判者找缺口' },
  ],
}

const REPO = '/home/user/Project-sekai-center'

const SURVEY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'summary', 'key_files', 'reusable', 'gotchas', 'authoring_recipe'],
  properties: {
    area: { type: 'string' },
    summary: { type: 'string', description: '這一塊的架構重點，繁體中文，300字內' },
    key_files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'role'],
        properties: { path: { type: 'string' }, role: { type: 'string' }, size: { type: 'string' } },
      },
    },
    reusable: {
      type: 'array',
      description: '對「學測複習網站」可直接沿用或小改沿用的東西',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['thing', 'how_to_reuse', 'effort'],
        properties: {
          thing: { type: 'string' },
          how_to_reuse: { type: 'string' },
          effort: { type: 'string', enum: ['照抄', '小改', '大改', '重寫'] },
        },
      },
    },
    gotchas: { type: 'array', items: { type: 'string' }, description: '不照做就會壞掉的陷阱（快取戳記、CORS、資料不可刪…）' },
    authoring_recipe: { type: 'string', description: '在這個模板上「新增一個頁面 / 一份資料」的具體步驟，要能照著做' },
  },
}

const SUBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'exam_format', 'units', 'content_volume', 'site_features'],
  properties: {
    subject: { type: 'string' },
    exam_format: { type: 'string', description: '學測該科題型、題數、時間、計分方式' },
    units: {
      type: 'array',
      description: '依 108 課綱拆到「可以做成一張複習卡 / 一個章節頁」的顆粒度',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'subtopics', 'high_yield', 'common_traps'],
        properties: {
          name: { type: 'string' },
          subtopics: { type: 'array', items: { type: 'string' } },
          high_yield: { type: 'array', items: { type: 'string' }, description: '歷年高頻考點' },
          common_traps: { type: 'array', items: { type: 'string' }, description: '常見錯誤與陷阱' },
        },
      },
    },
    content_volume: { type: 'string', description: '若要做到完整整理，估計的條目數量級與工作量' },
    site_features: { type: 'array', items: { type: 'string' }, description: '這一科特別需要的網站功能（如公式表、字根查詢、地圖、實驗題庫）' },
  },
}

const DESIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'principles', 'features', 'risks'],
  properties: {
    title: { type: 'string' },
    principles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'rationale', 'concrete_ui'],
        properties: {
          name: { type: 'string' },
          rationale: { type: 'string', description: '為什麼——最好扣到學習科學或考生真實處境' },
          concrete_ui: { type: 'string', description: '在介面上具體長什麼樣，不能只講抽象原則' },
        },
      },
    },
    features: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why', 'priority'],
        properties: {
          name: { type: 'string' },
          why: { type: 'string' },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          notes: { type: 'string' },
        },
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['site_concept', 'name_ideas', 'information_architecture', 'design_system', 'content_pipeline', 'data_model', 'phases', 'reuse_map', 'open_questions'],
  properties: {
    site_concept: { type: 'string', description: '一段話講清楚這個網站是什麼、給誰、跟坊間的差別' },
    name_ideas: { type: 'array', items: { type: 'string' } },
    information_architecture: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['route', 'name', 'purpose'],
        properties: { route: { type: 'string' }, name: { type: 'string' }, purpose: { type: 'string' }, key_ui: { type: 'string' } },
      },
    },
    design_system: { type: 'string', description: '色彩／字體／間距／動效／深淺色與六種色調如何從模板延伸到學科語彙' },
    content_pipeline: { type: 'string', description: '學科內容用什麼格式撰寫、怎麼建置成前端可用資料、怎麼校對' },
    data_model: { type: 'string', description: '前端 localStorage 與後端 D1 各存什麼，如何同步' },
    phases: {
      type: 'array',
      description: '分期建置計畫，每期要能單獨交付且可見成果',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'goal', 'deliverables', 'files'],
        properties: {
          title: { type: 'string' },
          goal: { type: 'string' },
          deliverables: { type: 'array', items: { type: 'string' } },
          files: { type: 'array', items: { type: 'string' } },
          depends_on: { type: 'string' },
        },
      },
    },
    reuse_map: { type: 'array', items: { type: 'string' }, description: '模板的哪個檔案 → 新站的哪個東西' },
    open_questions: { type: 'array', items: { type: 'string' }, description: '真的需要問使用者才能決定的事（不要問可以自己決定的）' },
  },
}

/* ---------- 1. 盤點模板（三路） ---------- */
const SURVEY_TASKS = [
  {
    key: 'frontend',
    label: 'survey:前端 dc-runtime',
    prompt: `你在 ${REPO}（Project SEKAI 資源中心，一個台服手遊的資訊整合站）。

任務：徹底搞懂 **前端頁面架構**，讓別人能在同一套模板上從零長出一個全新主題的大型網站。

必讀：
- app.html（約 1.27MB）：注意 <x-dc> 模板區、<style> 區（第 20–177 行）、以及第 3439 行開始的 <script type="text/x-dc"> 內是一個 \`class Component extends DCLogic\`。
- support.js（dc-runtime，GENERATED）：它怎麼解析 x-dc、怎麼編譯那段 script、DCLogic 提供什麼（state、生命週期、事件綁定、模板語法）、props 從 data-props 怎麼進來。
- index.html（經典版，含五個內嵌面板）與 js/core.js、css/core.css 的關係。

要回答清楚：
1. 這套 runtime 的模板語法到底怎麼寫（列出實際語法範例，例如條件、迴圈、事件、插值），以及 render 與 DCLogic 的介面。
2. app.html 的頁面切換／路由是怎麼做的（startPage、nav、hash 或 state），有幾個頁面、各自的元件邊界在哪。
3. 狀態管理與 localStorage 的用法（鍵名慣例、備份/還原 BK_KEYS 機制）。
4. 效能手法：懶載入、虛擬列表、資料分片、首屏 FOUC 防閃爍。
5. 無障礙與 RWD 的既有做法（focus-visible、色彩對比、觸控、手機導覽）。
6. authoring_recipe：一步一步寫「要新增一個全新頁面／面板」該改哪些檔案的哪些位置。

用 Read/Grep/Bash 實際讀檔驗證，不要臆測。所有敘述用繁體中文（台灣用語）。`,
  },
  {
    key: 'assets',
    label: 'survey:資產/部署/資料管線',
    prompt: `你在 ${REPO}。

任務：搞懂 **設計系統、資產快取、部署與資料建置管線**。

必讀：
- css/core.css（971 行）：CSS 變數、深/淺色、六種色調 tone-*、元件類別、動效 easing。
- app.html 第 20–177 行的 <style>（另一套同名但獨立的 token）。
- vercel.json：路由與 cache-control 策略（immutable vs must-revalidate）。
- tools/stamp-assets.py：?v= 雜湊戳記怎麼算、為什麼不戳會壞。
- 其他 tools/*.py：資料從哪來、產出成 data/*.js 的格式長什麼樣（挑 2–3 支細看，例如 build-cards-index.py、build-tutorial.py）。
- data/*.js 的模組格式（ES module？全域變數？怎麼被 HTML 載入）。
- .github/workflows/*.yml：排程、防呆、[skip ci] 慣例。
- README.md 裡「data/history 只能增加不能刪改」那條規矩背後的工程原則。

要回答清楚：
1. 完整的設計 token 清單（色彩、陰影、圓角、字體、動效），以及深淺色＋六色調的組合機制。
2. 一份靜態資料從「原始來源 → python 建置腳本 → data/*.js → 前端載入」的完整鏈路與檔案格式範本。
3. 部署與快取的規則，以及新增檔案時 vercel.json 要同步改什麼。
4. authoring_recipe：新增一份資料檔＋一支建置腳本＋讓它被頁面吃到的完整步驟（含 stamp-assets）。

實際讀檔驗證。繁體中文（台灣用語）。`,
  },
  {
    key: 'backend',
    label: 'survey:Worker 後端',
    prompt: `你在 ${REPO}/worker（Cloudflare Worker + D1 + Durable Object）。

任務：盤點 **後端能力**，判斷哪些可以直接搬去支撐一個「學測複習網站」（會員、學習進度雲端同步、AI 助教、討論、管理後台）。

必讀：src/index.js, auth.js, api.js, db.js, chats.js, admin.js, dashboard.js, review.js, watch.js, mail.js, cors.js；sql/schema.sql 與 002–008 的所有 migration；wrangler.toml；README.md；SETUP.md。

要回答清楚：
1. 認證流程（Google/Discord OAuth、HMAC 簽章 cookie session、30 天效期、無法即時撤銷的取捨）。
2. 資料表全貌與各表用途；prefs 這種 key-value JSON 的彈性設計為何適合（或不適合）存學習進度。
3. AI 助手的完整實作：/api/chats 持久化、額度控制（AI_CAP_USER/ADMIN/SITE）、模型設定、prompt injection 的防線、點數方案 credits。**特別評估：改成「AI 家教／解題助教」需要動哪些地方。**
4. tasks 排程器、watch 偵測引擎、mail 寄信佇列 —— 對讀書站的可能用途（複習提醒、每日一題、進度週報）。
5. 管理後台與儀表板可以怎麼變成「內容管理／題目審核」後台。
6. 成本與部署現況（Workers Paid、D1、Resend、Anthropic API），以及新站上線需要哪些新的 secret / DNS / 環境變數。
7. gotchas：CORS 具體來源、IDOR 防線、個資最小化原則、額度爆掉的風險。

實際讀檔驗證。繁體中文（台灣用語）。`,
  },
]

/* ---------- 2. 學科範圍（六路） ---------- */
const SUBJECT_TASKS = [
  {
    key: 'chinese',
    label: 'subject:國文',
    prompt: `整理台灣「大學入學學科能力測驗（學測）」**國文考科**的完整複習架構，供一個複習整合網站建置內容用。

涵蓋：國語文綜合能力測驗（選擇題）與國語文寫作能力測驗（國寫，知性題＋情意題）。
依 108 課綱與近年（111 學年度新課綱以後）實際命題趨勢，拆出：
- 形音義、成語與詞語辨析、應用文與書信用語
- 文法修辭、語法結構、句意判讀
- 古典韻文與散文（先秦到明清）的重要作家、流派、選文與必考典故
- 現代文學（台灣現代小說、散文、新詩）
- 文化基本教材（論孟學庸）核心章句與思想
- 文意理解／跨領域長文閱讀／圖表與非連續文本
- 國寫：知性題（資料判讀、立場論證）與情意題（生命經驗書寫）的評分規準、結構模板、常見失分

每個 unit 要拆到「能做成一個章節頁或一組複習卡」的顆粒度，附高頻考點與常見陷阱。
估計若要做到完整整理，條目的數量級。並指出這一科在網站上特別需要的功能。
繁體中文（台灣用語）。若能用 WebSearch 查證近年題型與命題趨勢就查，查不到就以既有知識為準並在敘述中誠實標示不確定處。`,
  },
  {
    key: 'english',
    label: 'subject:英文',
    prompt: `整理台灣學測**英文考科**的完整複習架構，供複習整合網站建置內容用。

依大考中心參考詞彙表（第 1–4 級約 4500 字為學測範圍）與近年題型，拆出：
- 詞彙與片語（分級、字根字首字尾、易混淆字、搭配詞 collocation）
- 文法（時態、語態、關係子句、假設語氣、對等與從屬連接、分詞構句、倒裝、名詞子句…）
- 綜合測驗（克漏字）、文意選填、篇章結構的解題策略
- 閱讀測驗題型分類（主旨、細節、推論、字義猜測、圖表題）
- 翻譯（中譯英）常考句型與評分
- 英文作文（看圖說故事／主題寫作）結構、評分規準、常見錯誤
- 學測特有的跨領域素養題、混合題型

每個 unit 拆到可做成章節頁或複習卡的顆粒度，附高頻考點與常見陷阱。
估計完整整理的條目數量級（詞彙表本身怎麼處理？）。指出這科特別需要的網站功能（單字卡、間隔重複、字根樹、聽讀…）。
繁體中文（台灣用語）。可用 WebSearch 查證。`,
  },
  {
    key: 'math',
    label: 'subject:數學A/B',
    prompt: `整理台灣學測**數學A 與 數學B**的完整複習架構，供複習整合網站建置內容用。

先講清楚兩者的差別（範圍、對象、難度、題型與計分），再依 108 課綱高一必修＋高二必修（數A 含較多）拆出：
- 數與式、多項式函數、指數與對數
- 三角（比、函數、正餘弦定理）
- 直線與圓、平面向量、空間向量與空間中的平面直線（注意數A/數B 差異）
- 矩陣與線性變換（新課綱調整處要標明）
- 數列與級數、極限概念
- 排列組合、機率、統計（含數據分析、期望值、信賴區間）
- 素養導向的情境題與混合題型（非選擇題）

每個 unit 要列出：核心定義與公式、必背結論、經典題型、常見陷阱與計算錯誤。
特別標註「數A 有但數B 沒有」與「兩科都有但深度不同」的單元。
估計完整整理的條目數量級。指出這科特別需要的網站功能（公式速查、LaTeX 呈現、互動圖形、逐步詳解、計算機工具）。
繁體中文（台灣用語）。可用 WebSearch 查證新課綱範圍調整。`,
  },
  {
    key: 'social',
    label: 'subject:社會（史地公）',
    prompt: `整理台灣學測**社會考科**（歷史、地理、公民與社會）的完整複習架構，供複習整合網站建置內容用。

依 108 課綱（歷史採「台灣、東亞、世界」主題式分域；地理含系統地理與區域地理、地理資訊；公民含個人與社會、政治、法律、經濟四大領域），拆出：
- 歷史：台灣史（原住民、荷西、明鄭、清領、日治、戰後）、中國與東亞史（主題式，如國家與人民、社會經濟、國際互動）、世界史（古典文明、近代轉型、當代世界），以及史料閱讀與史學方法題型
- 地理：地圖與地理資訊系統、地形、氣候、水文、土壤生態、人口、聚落、產業、交通、環境議題；區域地理（台灣、中國、東亞、東南亞、南亞、西亞、非洲、歐洲、美洲、大洋洲）
- 公民：自我與社會、文化與多元、族群性別、國家與民主、憲政與人權、政府體制、選舉、國際關係；法律基本理念、民法刑法行政法基本概念、司法制度；經濟學基本概念、市場、貨幣金融、政府經濟角色、國際貿易、永續發展

強調學測社會的**跨科整合題組**與**時事素養題**特性。
每個 unit 拆到可做成章節頁或複習卡的顆粒度，附高頻考點與常見陷阱（易混淆的年代、圖表判讀、法律概念誤用…）。
估計完整整理的條目數量級。指出這科特別需要的網站功能（時間軸、互動地圖、圖表判讀練習、法條速查、概念比較表）。
繁體中文（台灣用語）。可用 WebSearch 查證。`,
  },
  {
    key: 'science',
    label: 'subject:自然（理化生地科）',
    prompt: `整理台灣學測**自然考科**（物理、化學、生物、地球科學）的完整複習架構，供複習整合網站建置內容用。

依 108 課綱：自然科學領域「探究與實作」＋各科必修（學測範圍原則上是必修部分），拆出：
- 物理：運動學與力學、牛頓運動定律、功與能、動量、萬有引力、波動與聲光、電磁基本現象、近代物理（量子、原子、核）
- 化學：物質組成與原子結構、週期表、化學鍵、化學計量與莫耳、溶液與濃度、反應速率與平衡、酸鹼中和、氧化還原與電化學、有機化合物基礎、常見物質與應用
- 生物：生命的化學組成、細胞構造與運作、酵素、能量（光合/呼吸）、遺傳與分子生物、演化、生物多樣性與分類、植物與動物的構造功能（含人體恆定、循環呼吸消化神經內分泌免疫）、生態系與環境
- 地球科學：地球的組成與結構、板塊與地質作用、地質年代與化石、大氣、海洋、天氣與氣候變遷、天文（太陽系、恆星、宇宙）、防災

**特別處理「探究與實作」題型**：實驗設計、變因控制、數據判讀、圖表分析、誤差討論——這是學測自然的關鍵題型。
每個 unit 拆到可做成章節頁或複習卡的顆粒度，附高頻考點、必背公式/數值、常見迷思概念（misconception）與陷阱。
估計完整整理的條目數量級。指出這科特別需要的網站功能（互動模擬、週期表、單位換算、公式表、實驗流程圖）。
繁體中文（台灣用語）。可用 WebSearch 查證。`,
  },
  {
    key: 'system',
    label: 'subject:考招制度與備考節奏',
    prompt: `整理台灣現行**大學考招制度**與高三備考時程，供一個學測複習網站的「制度／規劃」模組使用。

要涵蓋（以近年、112 學年度以後的制度為準；不確定處要誠實標示）：
- 學測考科（國、英、數A、數B、社、自）與「最多採計四科」的規則、各校系採計組合
- 級分制怎麼算（15 級分、級距＝頂標？實際是全體到考生前 1% 平均的 1/15）、五標（頂標/前標/均標/後標/底標）的定義
- 三種主要入學管道：繁星推薦、個人申請（含分發比序、第二階段甄試、學習歷程檔案）、分發入學（含分科測驗）
- 分科測驗的角色與科目
- 學習歷程檔案（課程學習成果、多元表現）與備審資料
- 完整年度時程：高三上（模考、學習歷程上傳截止）、1 月學測、2 月成績與繁星、3–5 月個人申請與二階、7 月分科、8 月分發
- 落點分析、篩選倍率、同分參酌的邏輯

unit 請用「制度模組」的方式拆（每個 unit 是網站上的一個功能或說明頁）。
high_yield 請填「學生最容易搞錯／最常問的問題」，common_traps 填「制度上的常見誤解與踩雷」。
指出這個模組特別需要的網站功能（時程倒數、級分換算器、落點試算、檢核清單、通知提醒）。
**重要**：制度細節逐年會變，請明確標出哪些數字／規則必須由網站「標註年度＋提供官方連結」而不是寫死。
繁體中文（台灣用語）。盡量用 WebSearch 查證最新制度。`,
  },
]

/* ---------- 3. 設計理念（三路） ---------- */
const DESIGN_TASKS = [
  {
    key: 'ux',
    label: 'design:學習科學與考生心理',
    prompt: `為一個「學測各科複習整合」網站，寫出**人性化設計理念**。使用者是台灣高中生（高一到高三重考生），在焦慮、時間破碎、注意力被手機分走的狀態下使用。

請以學習科學與人因為根據，不要寫空泛的口號。至少涵蓋：
- 主動回憶（active recall）、間隔重複（spaced repetition，SM-2/FSRS 的取捨）、交錯練習（interleaving）、測驗效應、避免「熟悉感錯覺」
- 認知負荷理論在版面上的落實（分塊、漸進揭露、一次一件事）
- 動機與情緒：不用羞辱式指標、不做連續天數斷掉就歸零的懲罰性設計、允許「今天只讀 5 分鐘」也算數、失敗回饋要具體可行動
- 破碎時間的設計：3 分鐘也能讀完的最小單位、隨時可中斷可續讀、離線可用
- 手機優先：單手可及的操作區、深夜使用的暗色與護眼、通勤時的低頻寬
- 無障礙：色彩對比 WCAG AA、字級可調、鍵盤可操作、螢幕閱讀器、色盲友善、prefers-reduced-motion
- 隱私與信任：不逼登入才能讀、資料本機優先、清楚說明 AI 生成內容的不確定性、不做暗黑模式（dark pattern）
- 誠實原則：內容標註來源與更新日期、AI 產生的解析要標示、制度資訊標註年度

每一條原則都要給出「在介面上具體長什麼樣」（元件、互動、文案語氣的實際例子），文案請給繁體中文（台灣高中生會覺得自然的口吻）範例。
另外列出建議功能（含 P0/P1/P2）與風險。
繁體中文（台灣用語）。`,
  },
  {
    key: 'ia',
    label: 'design:資訊架構與功能地圖',
    prompt: `為一個「學測各科複習整合」超大型網站設計**資訊架構與功能地圖**。

背景：要沿用 ${REPO}（Project SEKAI 資源中心）的技術模板——單檔 HTML ＋ 自製 dc-runtime（React）＋ data/*.js 靜態資料 ＋ Cloudflare Worker（OAuth、D1、AI 助手、排程、寄信）。請先花幾分鐘用 Read/Glob 看一下 app.html 的頁面切換與 index.html 的面板結構，理解可用的頁面形態。

要產出：
1. 完整站點地圖：首頁、六個考科（國/英/數A/數B/社/自）各自的科目首頁與章節頁、跨科工具（級分換算、落點試算、倒數、讀書計畫、錯題本、複習卡、模考成績追蹤、考古題索引）、制度指南、AI 助教、個人儀表板、社群／討論、關於與資料來源。
2. 每個路由的 URL 設計（要能深連結到「某科某章某節」，要 SEO 友善、可分享、可加書籤）。
3. 導覽策略：六科的視覺區辨（模板本來就有 6 個團體各自的主題色，正好對應六科）、麵包屑、全站搜尋、最近閱讀、跳轉回上次進度。
4. 「複習卡／章節／題目／錯題／計畫」這五種核心物件的關係，以及一個學生的完整使用旅程（第一次來 → 每天用 → 考前一週）。
5. 大型內容網站的效能策略：內容分片載入、搜尋索引、離線快取。
6. 哪些功能一定要登入、哪些不必——原則是「讀內容永遠不用登入」。

principles 欄位請填架構決策與理由；features 填功能與優先序。
繁體中文（台灣用語）。`,
  },
  {
    key: 'content',
    label: 'design:內容工程與技術決策',
    prompt: `為一個「學測各科複習整合」超大型網站，設計**內容撰寫格式與技術實作方案**。

背景：沿用 ${REPO} 的技術棧。請務必先實際讀：support.js（dc-runtime 的模板語法與編譯方式）、app.html 的 <script type="text/x-dc"> 區、data/*.js 的資料模組格式、tools/*.py 的建置腳本、tools/stamp-assets.py 的快取戳記、vercel.json。

要回答：
1. 學科內容用什麼源格式撰寫？（Markdown + front-matter？JSON？直接寫 JS？）比較各方案在「量大、要數學式、要圖、要交叉引用、要版本控管、要多人協作」下的取捨，給出建議與理由。
2. 建置管線：源檔 → python/node 腳本 → data/*.js 分片 → 前端載入。要處理數學式（KaTeX/MathJax 還是預渲染 SVG？離線與 CSP 限制怎麼辦）、圖表、表格。
3. 全站搜尋怎麼做（純前端索引？分片倒排索引？中文斷詞怎麼處理？）。
4. 複習卡的排程演算法（SM-2 vs FSRS）與資料結構，本機優先＋登入後同步到 D1 prefs 的合併策略（衝突怎麼解）。
5. 內容量大時的載入策略與初次進站體積預算。
6. 品質控管：內容校對流程、如何標註來源與年度、如何處理「AI 產生的解析」的正確性風險、勘誤回報機制。
7. 這套 dc-runtime 在「幾十萬字內容 ＋ 上百個頁面」的規模下會不會撐不住？誠實評估，若有疑慮請提出替代方案（例如改用多檔案 HTML＋共用 core.js，或走 index.html 那種面板模式）。

principles 填技術決策與理由，features 填要建的工具與基礎設施。
繁體中文（台灣用語）。`,
  },
]

/* 三個階段彼此獨立，一次全部並行送出；合成階段確實需要全部結果，屏障是對的 */
phase('盤點模板')
const [surveys, subjects, designs] = await Promise.all([
  parallel(SURVEY_TASKS.map(t => () => agent(t.prompt, { label: t.label, phase: '盤點模板', schema: SURVEY_SCHEMA, effort: 'high' }))),
  parallel(SUBJECT_TASKS.map(t => () => agent(t.prompt, { label: t.label, phase: '學科範圍', schema: SUBJECT_SCHEMA, effort: 'high' }))),
  parallel(DESIGN_TASKS.map(t => () => agent(t.prompt, { label: t.label, phase: '設計理念', schema: DESIGN_SCHEMA, effort: 'high' }))),
])

const okSurveys = surveys.filter(Boolean)
const okSubjects = subjects.filter(Boolean)
const okDesigns = designs.filter(Boolean)
log(`盤點 ${okSurveys.length}/${SURVEY_TASKS.length}、學科 ${okSubjects.length}/${SUBJECT_TASKS.length}、設計 ${okDesigns.length}/${DESIGN_TASKS.length}`)

phase('彙整批判')
const dossier = JSON.stringify({ 模板盤點: okSurveys, 學科範圍: okSubjects, 設計理念: okDesigns })

const plan = await agent(
  `你是這個專案的總架構師。下面是三組研究代理的完整產出（JSON）：模板盤點（Project SEKAI 資源中心的前端 runtime、資產部署管線、Cloudflare Worker 後端）、學測六大範圍（國文/英文/數學AB/社會/自然/考招制度）、以及設計理念（學習科學與考生心理／資訊架構／內容工程）。

${dossier}

任務：把它們合成**一份可執行的分期建置計畫**，用來從零打造一個「學測各科複習整理整合資訊」的超大型網站，技術上沿用 ${REPO} 這個模板（可自行讀檔確認細節）。

要求：
- site_concept：一段話說清楚做什麼、給誰、跟坊間補習班網站與筆記共享站的差別在哪。
- information_architecture：完整路由表，要涵蓋六科 × 章節、跨科工具、制度指南、AI 助教、個人儀表板。
- design_system：怎麼把模板既有的 6 團體主題色／深淺色／六色調，轉譯成六個考科的視覺語彙；字體、間距、動效與無障礙的具體規格。
- content_pipeline：源檔格式、建置腳本、數學式與圖表、搜尋索引、校對與勘誤流程。
- data_model：localStorage 鍵名規劃、D1 表結構增修、本機優先與雲端同步的合併策略。
- phases：**每一期都要能單獨交付、看得到成果**，第一期要小到能立刻開工。標明每期的檔案清單（沿用哪些、新增哪些）。內容量龐大，請務必說明「先做一科的樣板章節、驗證管線，再量產」的策略。
- reuse_map：模板檔案 → 新站對應物的對照。
- open_questions：**只列真的需要使用者拍板的**（例如網域、要不要保留登入與 AI、內容自己寫還是先做骨架、要不要沿用同一個 repo），不要問你自己能決定的事。

務實、具體、可執行；不要寫成行銷文案。繁體中文（台灣用語）。`,
  { label: 'synth:總體計畫', phase: '彙整批判', schema: PLAN_SCHEMA, effort: 'max' }
)

const critique = await agent(
  `以下是一份「學測複習整合網站」的建置計畫（JSON），底下另附產出它的原始研究資料。

計畫：
${JSON.stringify(plan)}

原始研究：
${dossier}

任務：當一個嚴格的批判者。找出這份計畫的缺口與錯誤，具體指出：
1. 哪些學科範圍被漏掉或拆得太粗（對照原始研究逐科檢查）。
2. 哪些技術決策有風險或根本行不通（特別是：把幾十萬字內容塞進單檔 HTML 的 dc-runtime、中文全文搜尋、數學式渲染、離線、D1 免費額度、AI 成本）。
3. 分期計畫是否真的「每期可交付」？第一期是否夠小？有沒有隱藏的相依性？
4. 有沒有法律／版權風險被忽略（考古題與課本內容的著作權——大考中心試題的使用規範、出版社教材不能照抄）。
5. 有沒有違背「人性化設計」的地方（強制登入、資料鎖死、暗黑模式、AI 幻覺沒有標示）。
6. 工作量估計是否誠實？

只講真正的問題，每一條都要附上「怎麼修」。不要客套。繁體中文（台灣用語）。
回傳純文字（條列即可），這是給總架構師看的，不是給使用者的。`,
  { label: 'critic:找缺口', phase: '彙整批判', effort: 'max' }
)

return { plan, critique, surveys: okSurveys, subjects: okSubjects, designs: okDesigns }
