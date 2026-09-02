export const meta = {
  name: 'exam-superapp-plan',
  description: '研究跨平台原生 App 架構、台灣與國際考試版圖、智慧自適應練習系統，產出超大型考試準備 App 的技術與產品計畫',
  phases: [
    { title: '平台架構', detail: 'iOS/Android/Desktop/Web 共用策略、離線同步、後端擴充' },
    { title: '考試版圖', detail: '會考、學測、分科、統測、語言與證照、完整備考流程' },
    { title: '智慧練習', detail: '自適應出題、知識追蹤、AI 家教、題庫工程、動機設計' },
    { title: '彙整批判', detail: '合成產品與技術藍圖，再由批判者找缺口' },
  ],
}

const REPO = '/home/user/Project-sekai-center'

const ARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'recommendation', 'rationale', 'options', 'architecture', 'risks', 'effort'],
  properties: {
    area: { type: 'string' },
    recommendation: { type: 'string', description: '一句話結論：選什麼' },
    rationale: { type: 'string', description: '為什麼，扣住「小團隊、內容量大、要離線、要原生體感、已有 HTML/React 資產」的處境' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'pros', 'cons', 'verdict'],
        properties: {
          name: { type: 'string' },
          pros: { type: 'array', items: { type: 'string' } },
          cons: { type: 'array', items: { type: 'string' } },
          verdict: { type: 'string', enum: ['採用', '備案', '不建議'] },
        },
      },
    },
    architecture: { type: 'string', description: '具體架構：目錄結構、模組邊界、共用什麼不共用什麼、資料流' },
    risks: { type: 'array', items: { type: 'string' } },
    effort: { type: 'string', description: '誠實的工作量與時程量級估計' },
  },
}

const EXAM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scope', 'exams', 'shared_model', 'priority', 'notes'],
  properties: {
    scope: { type: 'string' },
    exams: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'audience', 'subjects', 'format', 'scoring', 'timeline', 'app_features'],
        properties: {
          name: { type: 'string' },
          audience: { type: 'string' },
          subjects: { type: 'array', items: { type: 'string' } },
          format: { type: 'string', description: '題型、題數、時間、是否含非選/寫作/聽力' },
          scoring: { type: 'string', description: '計分與分級方式，以及升學怎麼用這個分數' },
          timeline: { type: 'string', description: '一年之中的完整時程節點' },
          app_features: { type: 'array', items: { type: 'string' }, description: '這個考試在 App 裡需要的專屬功能' },
          volatility: { type: 'string', description: '哪些資訊逐年會變、必須標年度與官方來源' },
        },
      },
    },
    shared_model: { type: 'string', description: '不同考試之間可以共用的抽象（科目、知識點、題型、計分），資料模型該怎麼設計才不會為每個考試各寫一套' },
    priority: { type: 'array', items: { type: 'string' }, description: '建議的上線順序與理由' },
    notes: { type: 'array', items: { type: 'string' } },
  },
}

const SYSTEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'summary', 'algorithms', 'data_structures', 'implementation', 'pitfalls'],
  properties: {
    area: { type: 'string' },
    summary: { type: 'string' },
    algorithms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'what', 'why_here', 'cost'],
        properties: {
          name: { type: 'string' },
          what: { type: 'string', description: '演算法本身在做什麼，要具體到能實作（公式、參數、更新規則）' },
          why_here: { type: 'string', description: '為什麼適合這個情境' },
          cost: { type: 'string', description: '資料需求、冷啟動、運算成本、可解釋性' },
          verdict: { type: 'string', enum: ['第一版就做', '第二版再做', '不建議'] },
        },
      },
    },
    data_structures: { type: 'string', description: '需要的資料表/欄位/索引，以及裝置端與雲端各存什麼' },
    implementation: { type: 'string', description: '分階段實作路徑：最小可行版本長什麼樣，怎麼演進' },
    pitfalls: { type: 'array', items: { type: 'string' } },
  },
}

const BLUEPRINT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['product_concept', 'platform_decision', 'monorepo_layout', 'core_flows', 'intelligent_engine', 'exam_catalog_strategy', 'backend', 'phases', 'cost_model', 'legal_compliance', 'open_questions'],
  properties: {
    product_concept: { type: 'string' },
    platform_decision: { type: 'string', description: 'iOS/Android/桌面/網頁各用什麼技術、共用多少程式碼，以及為什麼' },
    monorepo_layout: { type: 'string', description: '實際的目錄結構樹' },
    core_flows: {
      type: 'array',
      description: '完整備考流程的每個階段做成什麼功能',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['stage', 'user_need', 'feature', 'platform'],
        properties: {
          stage: { type: 'string' },
          user_need: { type: 'string' },
          feature: { type: 'string' },
          platform: { type: 'string', description: '哪些平台需要／哪些平台不需要' },
        },
      },
    },
    intelligent_engine: { type: 'string', description: '智慧練習系統的完整設計：出題、評估、複習排程、AI 家教如何串起來' },
    exam_catalog_strategy: { type: 'string', description: '如何用一套資料模型容納會考／學測／分科／統測／語言檢定等，並能持續新增' },
    backend: { type: 'string', description: '後端架構與服務選型，含既有 Cloudflare Worker 資產怎麼併入' },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'goal', 'deliverables', 'exit_criteria'],
        properties: {
          title: { type: 'string' },
          goal: { type: 'string' },
          deliverables: { type: 'array', items: { type: 'string' } },
          exit_criteria: { type: 'string', description: '怎樣才算這一期完成' },
          rough_effort: { type: 'string' },
        },
      },
    },
    cost_model: { type: 'string', description: '基礎設施＋AI 推論的成本結構與量級估算，以及可能的收費模式' },
    legal_compliance: { type: 'array', items: { type: 'string' }, description: '著作權、個資、未成年、App Store/Play 政策' },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
}

/* ---------- A. 平台架構（四路） ---------- */
const ARCH_TASKS = [
  {
    key: 'crossplatform',
    label: 'arch:跨平台技術選型',
    prompt: `為一個「超大型考試準備 App」做**跨平台技術選型**。要同時出 iOS、Android、桌面（macOS/Windows）與網頁四個版本，使用者要求「原生版」——也就是要有原生的手感、效能與系統整合，不是把網頁包一層殼就交差。

現有資產：${REPO} 是一個 Vercel 靜態站＋Cloudflare Worker 後端的專案，前端是自製的 dc-runtime（support.js，內含 React 18 UMD，模板語法是 <sc-if>/<sc-for>/{{ }}），設計系統寫在 css/core.css 與 app.html 的 <style>。請實際讀 support.js 與 app.html 開頭，判斷這套 runtime 在新架構裡該保留、改寫還是丟棄。

請認真比較（每個都要給實測級別的具體理由，不要只列教科書優缺點）：
- React Native（Expo，含 New Architecture / Fabric / expo-router / EAS）
- Flutter（含 desktop 與 web 的成熟度）
- Kotlin Multiplatform + Compose Multiplatform（含 iOS 現況）
- 完全原生（SwiftUI + Jetpack Compose）＋ 共用 Rust/C++ 核心
- Capacitor / Tauri 這類 WebView 方案
- PWA only

判斷準則要涵蓋：內容密集型（大量文字、數學式、圖表）的渲染效能與捲動流暢度、離線能力、應用體積、背景任務與推播、系統整合（Widget、Apple Pencil/手寫、分享、Siri/App Intents、深色模式、動態字級與無障礙）、數學式排版（KaTeX/MathJax 在原生端怎麼辦）、CJK 字體、團隊規模與維護成本、上架審查風險、以及「網頁版與 App 版能共用多少程式碼」。

architecture 欄位請給出具體的專案結構：哪些是共用核心（領域模型、練習引擎、同步層），哪些必須各平台各自實作（UI shell、系統整合）。
誠實估工作量。繁體中文（台灣用語）。可用 WebSearch 查證各框架 2026 年的現況。`,
  },
  {
    key: 'offline',
    label: 'arch:離線優先與同步',
    prompt: `為一個「跨平台（iOS/Android/桌面/網頁）超大型考試準備 App」設計**離線優先的本地資料與跨裝置同步架構**。

情境：學生在通勤、宿舍、學校（沒網路或訊號差）都要能完整練習；答題紀錄、複習排程、筆記、錯題本、學習計畫必須在多裝置間同步；題庫與教材內容量可能到數 GB（含圖）。

要設計：
1. 裝置端儲存：SQLite（各平台的綁定：iOS GRDB/SQLite.swift、Android Room、桌面、網頁的 wa-sqlite/OPFS 或 IndexedDB）、或跨平台方案（SQLDelight、WatermelonDB、Realm、PowerSync、ElectricSQL、Turso embedded replicas）。比較並給建議。
2. 內容分發：題庫與教材怎麼打包下載（依考試/科目分包）、增量更新（delta）、版本控制、完整性驗證、儲存空間管理、使用者可選擇下載哪些科目。
3. 同步協定：使用者資料的雙向同步。比較 last-write-wins ＋ 版本向量、operation log（事件溯源）、CRDT（Yjs/Automerge）三種路線，針對「答題紀錄是 append-only 事件」「複習排程是可重算的衍生狀態」「筆記是需要合併的文字」各自給建議。
4. 衝突解決的具體規則，以及「離線做了三天的題，上線後怎麼合併」的實際流程。
5. 背景同步：iOS BGTaskScheduler、Android WorkManager、桌面與網頁 Service Worker 的差異與退路。
6. 加密與隱私：本機資料要不要加密、傳輸、可否完全不上傳（純本機模式）。

architecture 給出具體的表結構與同步時序（誰先誰後、冪等怎麼保證、如何避免重複計分）。
繁體中文（台灣用語）。可用 WebSearch 查證。`,
  },
  {
    key: 'backend',
    label: 'arch:後端與基礎設施擴充',
    prompt: `評估一個「超大型考試準備 App」的**後端架構**，並判斷既有資產能沿用多少。

既有資產請實際讀 ${REPO}/worker：Cloudflare Worker + D1（SQLite）+ Durable Object，已實作 Google/Discord OAuth（HMAC 簽章 cookie session）、使用者審核、prefs key-value、AI 對話持久化與額度控制（chats.js/admin.js）、tasks 排程器、watch 偵測引擎、Resend 寄信、管理後台儀表板。讀 worker/sql/*.sql 與 wrangler.toml。

要回答：
1. 這套 Cloudflare 架構撐不撐得住：數十萬使用者、每人每天數百筆答題事件、數十萬題的題庫、全文與語意搜尋、AI 推論。**逐項對照 D1 的實際限制**（資料庫大小、每次查詢的 rows read/written、並發、region）並給出量化判斷。
2. 需要補上的服務：物件儲存（R2）、KV、Queues、Vectorize 或其他向量檢索、Analytics Engine、Hyperdrive+Postgres、或者根本該換成別的（Supabase、Neon、PlanetScale、自架）。給選型建議與遷移路徑。
3. 原生 App 的認證要怎麼改：cookie session 在原生端不適用，要改 OAuth PKCE + refresh token；**Apple 規定有第三方登入就必須提供 Sign in with Apple**；還要考慮未成年帳號、無帳號可用（訪客模式）、帳號合併。
4. 推播：APNs / FCM / Web Push 的統一抽象，與既有 tasks 排程器如何串接成「複習提醒」。
5. AI 推論的服務化：既有 chats.js 的額度控制與 prompt injection 防線可以沿用多少？要不要加 RAG（題庫檢索）、要不要分模型分級（便宜模型做批改、貴模型做解題）、串流回應在原生端怎麼做。
6. 內容 CDN 與離線包分發。
7. 觀測性、備份、災難復原。

architecture 給具體服務拓撲與資料流。effort 要誠實。繁體中文（台灣用語）。可用 WebSearch 查證 Cloudflare 各服務 2026 年的限制與定價。`,
  },
  {
    key: 'shell',
    label: 'arch:設計系統與原生體感',
    prompt: `為一個跨 iOS / Android / 桌面 / 網頁的「考試準備 App」設計**共用設計系統與各平台原生體感的平衡點**。

現有設計語言請實際讀 ${REPO}/css/core.css 與 app.html 第 20–177 行的 <style>：一套 CSS 變數（色彩、陰影 sh-xs~lg、圓角 r-sm~lg、easing、字體 Huninn / M PLUS Rounded 1c）、深淺色雙主題、六種色調（sakura/jade/wisteria/amber/ink/aurora）、彩虹漸層強調。這是一套溫柔圓潤的風格，要判斷它適不適合「長時間讀書」的場景，該保留什麼、該調整什麼。

要產出：
1. 設計 token 如何跨平台共用（Design Token 標準格式 → 產生 Swift / Kotlin / CSS / Dart 的建置管線）。
2. 哪些東西必須尊重平台慣例而不能硬統一：導覽（iOS Tab Bar vs Android Navigation Bar vs 桌面側邊欄）、返回手勢、捲動回彈、觸覺回饋、字體（iOS 系統中文字體 vs Android Noto Sans TC vs 自訂字體的授權與體積）、動態字級、鍵盤快捷鍵（桌面）。
3. 長時間閱讀與作答的排版規格：行高、字級階層、行寬、對比度、夜間閱讀、護眼色溫、避免純黑背景的 OLED 拖影。
4. 數學式、化學式、程式碼、圖表在四個平台的一致呈現方案。
5. 無障礙：WCAG 2.2 AA、VoiceOver / TalkBack、動態字級、reduce motion、色盲友善、鍵盤全操作。
6. 手寫作答與拍照解題的 UI（Apple Pencil、觸控筆、相機取景）。
7. 建議的元件清單（設計系統的 primitives 與 patterns），標明哪些是共用邏輯、哪些各平台各自實作。

繁體中文（台灣用語）。architecture 欄位放「token 管線與元件庫的實際結構」。`,
  },
]

/* ---------- B. 考試版圖（四路） ---------- */
const EXAM_TASKS = [
  {
    key: 'cap',
    label: 'exam:國中教育會考',
    prompt: `完整整理台灣**國中教育會考（會考）**，供一個考試準備 App 建置內容與功能。

要涵蓋：
- 考科：國文、英語（含閱讀與聽力）、數學（含非選擇題）、社會、自然、寫作測驗
- 各科題型、題數、作答時間、範圍（依 108 課綱國中階段）
- **等級制計分**：精熟 A / 基礎 B / 待加強 C，以及 A++ A+ A、B++ B+ B 的標示規則；寫作測驗六級分；各科等級對應的答對題數區間逐年會變
- **免試入學超額比序**：各就學區的比序項目（會考成績、多元學習表現、志願序…）差異很大，App 要怎麼處理各區規則
- 特色招生、直升、五專優先免試、技優
- 完整時程：九年級一整年（模考、志願選填、會考、放榜、分發、報到）
- 與學測的銜接：國中三年怎麼準備才不會在高中掉隊

exams 陣列請把「會考」拆成各科目一筆（每筆填 subjects/format/scoring/timeline/app_features）。
shared_model 請思考：會考、學測、分科測驗這些考試在資料模型上怎麼共用一套抽象。
特別標出哪些資訊逐年會變、必須標註年度與官方來源（心測中心、各就學區教育局）。
繁體中文（台灣用語）。盡量用 WebSearch 查證最新規則。`,
  },
  {
    key: 'tw-exams',
    label: 'exam:台灣升學考試全景',
    prompt: `盤點台灣**除了會考與學測之外**的主要升學與入學考試，供一個考試準備 App 規劃考試版圖。

至少涵蓋：
- 分科測驗（原指考）：考科、範圍、計分（45 級分制）、分發入學怎麼用
- 四技二專統一入學測驗（統測）：20 個群類別、專業科目、技專校院招生管道
- 二技統一入學測驗、四技二專甄選入學、技優入學
- 高中職特色招生考試分發入學
- 私立中學入學考（國中會考體系外的入學競爭）
- 五專聯合免試與五專優先免試
- 警專、軍校（正期班）、海巡、國防大學
- 大學轉學考、學士後醫學系
- 研究所考試（跨考、統測研究所）
- 國家考試概覽（高普考、初等考、教師檢定與教甄）——只需要判斷是否納入版圖與優先序

每個考試填 name/audience/subjects/format/scoring/timeline/app_features/volatility。
priority 請給出**建議的上線順序**與理由（考量：使用者規模、內容製作成本、付費意願、競爭對手、內容可重用性）。
shared_model 請設計一套能容納全部的抽象（考試 → 考科 → 範圍 → 知識點 → 題型 → 計分規則），要能不改 schema 就新增一個考試。
繁體中文（台灣用語）。可用 WebSearch 查證。`,
  },
  {
    key: 'intl',
    label: 'exam:語言檢定與國際考試',
    prompt: `盤點台灣學生會考的**語言檢定與國際考試**，供一個考試準備 App 評估擴充版圖。

至少涵蓋：
- 英語：全民英檢 GEPT（初中高級的聽說讀寫）、多益 TOEIC（含口說寫作）、托福 TOEFL iBT、雅思 IELTS、劍橋英檢
- 日語：JLPT N5–N1、J.TEST
- 其他外語：韓語 TOPIK、德語、法語檢定
- 國際課程：SAT、ACT、AP、IB、A-Level（台灣學生申請海外大學用）
- 中文與其他：華語文能力測驗
- 資訊與專業證照：TQC、ITE、AWS/Google/Microsoft 認證等（只需判斷是否納入）

每個填 name/audience/subjects/format/scoring/timeline/app_features/volatility。
特別要處理：**聽力與口說**在 App 裡的技術需求（音檔串流與離線、錄音、發音評分、ASR）、**寫作**的 AI 批改（與人工批改的差異與風險）。
priority 給建議的上線順序與理由，並誠實指出哪些市場已經有很強的競品、切進去不划算。
shared_model 思考語言檢定與升學考試能共用什麼、不能共用什麼。
繁體中文（台灣用語）。可用 WebSearch 查證。`,
  },
  {
    key: 'journey',
    label: 'exam:完整備考流程設計',
    prompt: `設計一個考試準備 App 的**完整備考流程**——從使用者第一次打開 App，到考完放榜的每一步，都要有對應的功能。

以「國三生準備會考」與「高三生準備學測」兩條主線為例，設計完整旅程：
1. **入門診斷**：怎麼在 15 分鐘內測出一個學生的真實程度（不能用 100 題把人嚇跑）；如何設定目標（想上的學校 → 需要的分數 → 需要的能力）
2. **計畫生成**：從「今天距離考試還有 N 天」與「目前程度」自動排出讀書計畫；計畫要能被打亂後自動重排（生病、段考、補習）；如何避免「計畫做得很漂亮但沒人照著做」
3. **每日循環**：今天要做什麼（一眼看懂）、新知識學習、練習、複習到期項目、每日一題；破碎時間與整塊時間的不同模式
4. **練習與檢討**：作答體驗（含手寫、計算紙、標記、跳題、計時）、即時回饋 vs 交卷後回饋、錯題的根因分析與再練
5. **模擬考**：全真模考（時間壓力、答案卡、跨科組合）、成績分析、與歷屆標準的對照、落點推估
6. **考前衝刺**：最後 30 天／7 天／1 天的不同策略、重點濃縮、心態管理、應考當天的檢核清單
7. **考後**：對答案、成績查詢、志願選填與落點分析、放榜、經驗傳承
8. **長線**：非考生（國一、高一）的日常學習模式；重考生的模式

每個階段填 stage/user_need/feature/platform（哪些平台需要）。
另外要處理：家長與老師的角色（要不要做家長端？監督與隱私的界線在哪）、同儕與社群（讀書會、排行榜的風險）、跨考試的使用者（國中生畢業後變高中生，資料要延續）。
exams 欄位請放「不同考生類型」而非考試（audience 填角色，app_features 填該角色需要的功能）。
繁體中文（台灣用語）。`,
  },
]

/* ---------- C. 智慧練習系統（四路） ---------- */
const SYS_TASKS = [
  {
    key: 'adaptive',
    label: 'sys:自適應出題與能力評估',
    prompt: `設計一個考試準備 App 的**自適應練習與能力評估引擎**。要具體到能實作，不是名詞介紹。

要涵蓋：
1. **能力估計**：項目反應理論 IRT（1PL/2PL/3PL 各自的參數與適用情境）、Elo-style 線上更新（像 Duolingo/Khan Academy 的做法）、貝氏知識追蹤 BKT、深度知識追蹤 DKT/AKT/SAKT。給出每一種的更新公式、資料需求、冷啟動策略、以及**在裝置端就能算 vs 必須上雲**的區分。
2. **電腦化適性測驗 CAT**：選題規則（最大訊息量、曝光控制、內容平衡）、停止規則、如何用在「15 分鐘診斷」上。
3. **題目校準**：新題沒有難度參數怎麼辦？冷啟動用什麼先驗？多少作答數才穩定？如何偵測壞題（鑑別度過低、答案有誤）。
4. **間隔重複**：SM-2 vs FSRS（給 FSRS 的實際參數與記憶模型公式）、如何與「知識點掌握度」而非「單卡」結合、如何處理「考試日期是硬截止」的排程（傳統 SRS 假設無限期記憶，備考不是）。
5. **知識點圖譜**：先備知識 DAG、如何從「這題錯了」回推「哪個先備概念沒學會」、如何自動推薦補救路徑。
6. **出題策略**：交錯練習 interleaving、可欲難度 desirable difficulty、避免連續挫敗、如何在「該練弱項」與「不要讓人放棄」之間取平衡。
7. **錯題根因分析**：把錯誤分類（概念不懂／計算失誤／題意誤解／時間不夠／粗心），怎麼判定，怎麼給不同的處方。

algorithms 每一筆都要有可實作的細節與 verdict（第一版就做／第二版再做／不建議）。
data_structures 給實際表結構。implementation 給「第一版最小可行的引擎長什麼樣」。
pitfalls 要包含「資料太少時所有花俏演算法都不如簡單規則」這類誠實的警告。
繁體中文（台灣用語）。可用 WebSearch 查證 FSRS 與現代知識追蹤的最新做法。`,
  },
  {
    key: 'ai-tutor',
    label: 'sys:AI 家教與自動批改',
    prompt: `設計一個考試準備 App 的 **AI 家教與自動批改系統**。

背景：既有專案 ${REPO}/worker/src 已有 chats.js（AI 對話持久化、額度控制）、admin.js（Claude 呼叫與 prompt injection 防線）、review.js（AI 輔助審核的安全模型：「AI 只讓判定變嚴格，不能單獨放行」）。請實際讀這三支，評估可以沿用的部分。

要設計：
1. **解題輔導**：蘇格拉底式引導（不直接給答案）vs 直接詳解，什麼時候該用哪種；如何確保引導不會變成無效的來回；如何讓 AI 知道學生「卡在哪一步」。
2. **拍照／手寫解題**：相機取景與 OCR、數學式辨識（手寫公式）、辨識錯誤的容錯 UI、在裝置端做還是上雲、成本與延遲。
3. **自動批改**：選擇題（不需要 AI）、填空與計算題（答案等價判定：3/6 = 0.5 = ½）、國文與英文寫作（依大考中心／心測中心的評分規準給分並指出具體問題）、翻譯題。**要明確區分「AI 批改可信」與「AI 批改只能當參考」的界線**，以及怎麼向學生誠實揭露。
4. **自動出題**：從教材生成練習題的可行性與品質風險；為什麼「AI 生成的題目」不能直接當正式題庫；人審流程怎麼設計；變式題（同一考點換數字換情境）的安全做法。
5. **幻覺防線**：RAG 檢索題庫與教材、引用來源、拒答策略、學生回報錯誤的機制、以及「AI 說錯會直接害到考生」這個高風險情境的處理原則。
6. **成本模型**：以 Claude 系列的實際定價估算每位使用者每月的推論成本；分級用模型（便宜模型做什麼、貴模型做什麼）、快取、批次；免費額度與付費方案的界線。
7. **prompt injection 與濫用**：學生輸入不可信、題目文字也不可信；額度耗盡攻擊；未成年安全（不當內容、情緒風險與求助資源）。

algorithms 欄位放「各項 AI 功能的具體做法與 verdict」。
繁體中文（台灣用語）。若要查 Claude 模型與定價，請以專案內的 claude-api skill 或官方文件為準，不要憑記憶。`,
  },
  {
    key: 'itembank',
    label: 'sys:題庫與內容工程',
    prompt: `設計一個「多考試、超大型」考試準備 App 的**題庫與教材內容工程**。

要涵蓋：
1. **題目資料模型**：一題需要哪些欄位（題幹、圖、選項、答案、詳解、知識點標籤多對多、難度參數、鑑別度、題型、來源、年份、考試、科目、認知層次 Bloom、預估作答秒數、常見錯誤選項的診斷意義…）。要能容納：單選、多選、填空、計算、非選、閱讀題組、聽力、寫作、圖表判讀、跨科題組。
2. **內容撰寫格式**：Markdown+front-matter？自訂 DSL？資料庫直編？比較在「數學式、化學式、圖、表格、題組共用題幹、多語」情境下的取捨，給建議與範例檔。
3. **建置管線**：源檔 → 驗證 → 打包成離線包（依考試/科目分片）→ 各平台載入。含數學式的處理策略（預渲染 vs 執行期渲染，在原生端怎麼做）。
4. **著作權**：**這是關鍵風險**。大考中心、心測中心歷屆試題的使用規範到底允許什麼？教科書出版社的內容？補習班講義？請具體說明合法的做法（自製原創題、引用官方公開試題的界線、標註來源、避免重製教材）與明確不能做的事。若有不確定，請標示需要法律諮詢。
5. **品質控管**：審題流程、雙人校對、上線後的統計監控（答對率異常、鑑別度為負 → 自動下架）、勘誤回報。
6. **規模估計**：若要涵蓋會考六科＋學測六科，做到「每個知識點有足夠練習量」，需要多少題？多少字的教材？以每題製作成本估算總工作量與費用。**要誠實**。
7. **知識點體系**：跨考試共用的知識點樹（國中數學的「二次函數」與高中的「二次函數」是同一個節點的不同深度嗎？），版本管理（課綱改版怎麼辦）。
8. **多媒體**：圖、聽力音檔、影片講解的儲存、壓縮、CDN、離線與版權。

繁體中文（台灣用語）。可用 WebSearch 查證試題著作權規範。`,
  },
  {
    key: 'motivation',
    label: 'sys:動機設計與人性化守則',
    prompt: `為一個考試準備 App 設計**動機系統與人性化守則**。使用者是 12–18 歲的台灣學生，長期處於升學壓力下。

要涵蓋：
1. **不做什麼**：明確列出這個 App 拒絕採用的暗黑模式（punishing streak、無限捲動、製造 FOMO 的推播、排行榜羞辱、付費才能看自己的錯題、假的社交壓力、變動獎勵的成癮設計）。每一條都要說明為什麼在「未成年 ＋ 高壓」的情境下特別有害。
2. **正向動機**：進度可見性、小勝利、自我對照而非同儕對照、可原諒的連續紀錄（凍結、補簽、只算「有出現」不算「達標」）、內在動機優先於外在獎勵、成長心態的文案。
3. **推播策略**：什麼時候可以打擾、什麼時候絕對不行（深夜、考試當天）、如何讓使用者自訂、iOS/Android 的權限請求時機、通知內容的語氣範例（繁體中文）。
4. **壓力與心理健康**：偵測到過度使用或深夜長時間使用怎麼辦、焦慮情緒的處理、**AI 對話中出現自傷或崩潰訊號時的處置與求助資源（台灣的資源）**、不要把成績當成人的價值。
5. **家長端的界線**：家長想看什麼 vs 學生的隱私權；建議的預設值與可協商項目；「監視」與「支持」的差別在介面上長什麼樣。
6. **無障礙與包容**：學習障礙（閱讀障礙的字體與行距選項、ADHD 的專注模式）、資源落差（低階手機、流量有限、沒有網路）、經濟弱勢（免費層必須足夠有用）。
7. **文案語氣**：給出 20 條實際的介面文案範例（繁體中文、台灣高中生會覺得自然不做作），涵蓋：答錯時、連續答錯時、久沒回來時、達成目標時、模考失常時、考前一天。

algorithms 欄位放「動機機制與其行為科學依據，以及 verdict」。
pitfalls 放「常見的、看起來很棒但實際有害的設計」。
繁體中文（台灣用語）。`,
  },
]

phase('平台架構')
const [archs, exams, systems] = await Promise.all([
  parallel(ARCH_TASKS.map(t => () => agent(t.prompt, { label: t.label, phase: '平台架構', schema: ARCH_SCHEMA, effort: 'high' }))),
  parallel(EXAM_TASKS.map(t => () => agent(t.prompt, { label: t.label, phase: '考試版圖', schema: EXAM_SCHEMA, effort: 'high' }))),
  parallel(SYS_TASKS.map(t => () => agent(t.prompt, { label: t.label, phase: '智慧練習', schema: SYSTEM_SCHEMA, effort: 'high' }))),
])

const okA = archs.filter(Boolean), okE = exams.filter(Boolean), okS = systems.filter(Boolean)
log(`架構 ${okA.length}/${ARCH_TASKS.length}、考試 ${okE.length}/${EXAM_TASKS.length}、系統 ${okS.length}/${SYS_TASKS.length}`)

phase('彙整批判')
const dossier = JSON.stringify({ 平台架構: okA, 考試版圖: okE, 智慧練習: okS })

const blueprint = await agent(
  `你是這個專案的總架構師。下面是十二個研究代理的完整產出（JSON）：平台架構（跨平台選型、離線同步、後端擴充、設計系統）、考試版圖（會考、台灣升學考試全景、語言與國際考試、完整備考流程）、智慧練習（自適應引擎、AI 家教、題庫工程、動機設計）。

${dossier}

背景：專案要從 ${REPO}（Project SEKAI 資源中心，Vercel 靜態站＋Cloudflare Worker/D1 後端，自製 dc-runtime 前端）出發，做成一個涵蓋國中會考、高中學測與其他大型考試的跨平台（iOS / Android / 桌面 / 網頁）原生 App，具備完整備考流程與智慧練習系統。必要時自行讀專案檔案確認細節。

任務：合成**一份可執行的產品與技術藍圖**。

硬性要求：
- phases 必須是「每一期都能單獨交付、看得到成果」的分期。**第一期要小到能立刻開工**，而且必須是「一個考試、一個科目、一個章節、走完整條路（內容 → 練習 → 評估 → 複習）」的垂直切片，不是「先做完後端再做前端」的水平切法。每期要有明確的 exit_criteria。
- platform_decision 必須明講「第一版要不要就上四個平台」——如果不建議，要說清楚順序與理由。
- 誠實面對規模：這是一個正常情況下需要團隊數年的專案。請在 cost_model 與 phases 裡誠實反映，不要假裝三個月能做完。同時要指出「一個人 ＋ AI 協作」在這個專案裡實際能做到什麼、做不到什麼。
- legal_compliance 要具體：試題著作權、個資法與未成年、App Store/Play 的教育類與訂閱政策。
- open_questions **只列真的需要使用者拍板的**（例如：先做哪個考試、要不要收費、內容自製或授權、四平台的優先序、要不要沿用現有 repo 與網域），不要問你自己能決定的事。

務實、具體、可執行，不要行銷文案。繁體中文（台灣用語）。`,
  { label: 'synth:產品技術藍圖', phase: '彙整批判', schema: BLUEPRINT_SCHEMA, effort: 'max' }
)

const critique = await agent(
  `以下是一份「跨平台超大型考試準備 App」的產品與技術藍圖（JSON），以及產出它的原始研究資料。

藍圖：
${JSON.stringify(blueprint)}

原始研究：
${dossier}

任務：當一個嚴格且務實的批判者，找出這份藍圖會讓專案失敗的地方。逐項檢查：
1. **範圍失控**：哪些部分是「聽起來很好但第一版根本不該做」？如果只能留三個功能，該留哪三個？
2. **技術風險**：跨平台選型是否經得起「內容密集 ＋ 離線 ＋ 數學式 ＋ 原生體感」的實測？離線同步的設計有沒有會造成資料遺失或重複計分的漏洞？Cloudflare D1 的限制是否被低估？
3. **內容才是真正的瓶頸**：題庫與教材的工作量估計是否誠實？沒有題庫的話，再聰明的引擎也沒用——藍圖有沒有正視這件事？有沒有可行的冷啟動策略？
4. **智慧練習系統的空轉風險**：使用者少、作答資料少的時候，IRT/知識追蹤全部失效。第一版是否有「資料稀少時也能用」的退路？
5. **法律**：試題著作權的處理是否過於樂觀？有沒有可能一上線就收到存證信函？
6. **AI 成本與正確性**：成本估算是否樂觀？AI 教錯學生的責任風險有沒有被正視？
7. **分期是否真的可交付**：第一期是否夠小？有沒有隱藏的相依性讓第一期其實要三個月？
8. **一個人做得完嗎**：誠實評估，並指出最務實的縮減版本是什麼。

每一條都要附「怎麼修」的具體建議。不要客套，不要平衡報導。繁體中文（台灣用語）。
回傳純文字條列，這是給總架構師看的。`,
  { label: 'critic:找致命問題', phase: '彙整批判', effort: 'max' }
)

return { blueprint, critique, archs: okA, exams: okE, systems: okS }
