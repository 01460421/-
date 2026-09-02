
## area
worker/ 後端（Cloudflare Worker + D1 + Durable Object）：認證、API、AI 助手、排程、偵測、寄信、管理後台

## summary
這是一套「帳號＋雲端設定＋AI 助手＋排程＋通知＋後台」的通用骨架，只有極少數地方綁死 Project SEKAI。入口 index.js 分流：/auth/* → auth.js、/api/* → api.js、/admin/* → admin.js（再分流 dashboard.js），其餘全丟給 Durable Object（逐局追蹤，讀書站用不到，可整段拿掉）。

Session 不進資料庫：cookie 放 base64url(payload).HMAC-SHA256，payload 只有 {u:userId, e:到期}，效期 30 天。代價是 cookie 本身撤不掉（改 SESSION_SECRET＝全站登出），但每個請求 currentUser() 都會回 D1 讀 users，所以停權／降權是即時生效的。

D1 共 12 張表：users / prefs（key-value JSON，後端完全不解讀）/ watches / events / admin_log / tasks / tool_log / chats / chat_messages / ai_credits / ai_orders。prefs 這種設計對「學習進度」極合適——前端新增欄位不必動 schema。

AI 部分最值錢：Worker 只代理 Anthropic API＋記帳＋稽核，工具全部在瀏覽器執行（app.html 有 66 支工具、12 輪迴圈）。額度三層（個人／試用／全站）＋點數扣款，prompt caching 已調校。改成「解題助教」只需換 system prompt 與工具集，後端幾乎不動。

## key_files
[
 {
  "path": "/home/user/Project-sekai-center/worker/src/index.js",
  "role": "入口分流 + Durable Object（15 秒 alarm 逐局追蹤，讀書站無用）+ scheduled() 每分鐘 cron 帶動 runWatches / runDueTasks / flushMail",
  "size": "321 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/src/auth.js",
  "role": "Google/Discord OAuth、HMAC 簽章 session cookie、state 防 CSRF、bounce 頁面（所有插值都跳脫、跳轉只收同源相對路徑）",
  "size": "218 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/src/api.js",
  "role": "使用者 API：/api/me、/api/prefs（雲端同步）、/api/watches、/api/events、/api/chat（AI 代理＋額度）、/api/credits、/api/apply*（申請與所有權驗證）",
  "size": "585 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/src/db.js",
  "role": "D1 存取層，全站唯一寫 SQL 的地方（dashboard.js 例外）。大量條件式 UPDATE 當鎖（claimTask/spendCredit/saveApplication/confirmOrder）",
  "size": "393 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/src/chats.js",
  "role": "AI 對話持久化 /api/chats*。兩張表拆分、seq 唯一索引、額度檢查併進 UPDATE 的 WHERE、每支查詢都寫死 AND user_id=?",
  "size": "318 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/src/admin.js",
  "role": "管理後台 API＋Anthropic 代理核心 chatClaude()／validateChat()／PROFILES 模型白名單／prompt caching 斷點／403 診斷端點",
  "size": "684 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/src/dashboard.js",
  "role": "唯讀儀表板 /admin/dash/*：overview、series（台北日界）、users、user/:id、watches、ai 稽核、health。有 readOnly() 機械防線只准 SELECT",
  "size": "574 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/src/watch.js",
  "role": "偵測引擎：共用快照、last_state 邊緣判斷、冷卻期不寫狀態、WATCH_KINDS 規格給前端動態產生表單",
  "size": "748 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/src/mail.js",
  "role": "Resend 寄信佇列 flushMail()：每輪 20 封、逐封 await、Idempotency-Key、transient/永久錯誤分流、深色模式 HTML 樣板",
  "size": "258 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/src/review.js",
  "role": "申請自動審核。sanitizeNote()（不可見字元清洗＋記 dropped）、tool_choice 強制結構化判定、AI 只能讓判定變嚴格、永不自動拒絕",
  "size": "421 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/src/cors.js",
  "role": "CORS 白名單：SITE_BASE ＋ www 變體 ＋ localhost/127.0.0.1；帶 credentials 不能用 *，所以回具名 Origin ＋ Vary: Origin",
  "size": "39 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/wrangler.toml",
  "role": "綁定與非機密設定：AI_MODEL、AI_CAP_USER/ADMIN/SITE/AUTO、AUTO_APPROVE、AI_PLANS、MAIL_FROM、custom_domain route、cron",
  "size": "79 行"
 },
 {
  "path": "/home/user/Project-sekai-center/worker/sql/schema.sql",
  "role": "基礎 8 張表；002–008 為增量 migration（審核欄位、tasks 租約、chats、read_at、ai_credits/ai_orders）",
  "size": "94 行 + 7 支 migration"
 },
 {
  "path": "/home/user/Project-sekai-center/app.html",
  "role": "前端單檔（1.27 MB）。AI_SYSTEM 提示詞、AI_TOOLS 66 支工具定義、aiSend() 12 輪工具迴圈、pullCloud/pushCloud 同步都在這裡",
  "size": "約 1.27 MB"
 }
]

## reusable
[
 {
  "thing": "HMAC 簽章 cookie session（auth.js signToken/verifyToken/safeEq/currentUser）",
  "how_to_reuse": "整段照抄。Google OAuth 換 redirect_uri 與 OAUTH_BASE 即可；Discord 綁定那半段讀書站用不到可刪。SESSION_DAYS=30 可視需求縮短。",
  "effort": "照抄"
 },
 {
  "thing": "users 表 ＋ 核准制（pending/approved/rejected ＋ ADMIN_EMAIL bootstrap）",
  "how_to_reuse": "讀書站若要開放註冊即用，把 upsertGoogleUser 的 status 預設從 'pending' 改成 'approved'，並把 api.js 第 333 行那道 pending_approval 檢查改成放行；想保留邀請制就完全不動。apply_uid/game_uid/verify_nonce 等遊戲驗證欄位整組刪掉。",
  "effort": "小改"
 },
 {
  "thing": "prefs 表 ＋ /api/prefs 雲端同步",
  "how_to_reuse": "存學習進度的最佳載體：k 用 'progress:math'、'wrongbook'、'srs-deck' 這種命名，v 是任意 JSON。後端不解讀，前端改 schema 不必動 migration。上限 256KB／200 keys 對題庫進度略緊，建議提到 1MB／500 keys 並改成單鍵 PATCH。",
  "effort": "小改"
 },
 {
  "thing": "AI 代理 chatClaude()（admin.js 290–367）＋ validateChat()",
  "how_to_reuse": "這是「AI 家教」的核心，後端幾乎不用改：模型由 env.AI_MODEL 控、PROFILES 是伺服器端白名單（前端只能指名代號，不能送 model）、prompt caching 斷點下在最後一個 tool 與 system、403 錯誤已翻成可行動的中文。改家教＝換前端的 system prompt 與工具集。",
  "effort": "照抄"
 },
 {
  "thing": "/api/chats 對話持久化（chats.js 全檔）",
  "how_to_reuse": "照抄。兩表拆分讓追加是純 INSERT；seq 唯一索引防並發錯亂；額度檢查併進 UPDATE 的 WHERE 防競態；每支查詢寫死 user_id 防 IDOR。學生的解題對話紀錄直接用它，要加「科目」就在 chats 表加一欄 subject 並在列表加篩選。",
  "effort": "照抄"
 },
 {
  "thing": "三層額度控制（AI_CAP_USER / ADMIN / AUTO ＋ AI_CAP_SITE）",
  "how_to_reuse": "直接沿用，但務必重估數字：現值是以 Opus 5、每次 in 2 萬 tokens 算的（$0.14/次）。家教問答的 context 小很多（沒有 66 支工具定義），換 Sonnet 後每次約 $0.01–0.02，AI_CAP_USER 可放寬到 100–200。計數來源是 admin_log 的 COUNT，換題型不必改。",
  "effort": "小改"
 },
 {
  "thing": "AI 點數方案 credits（008 migration ＋ /api/credits* ＋ /admin/credits/*）",
  "how_to_reuse": "不接金流、站外收款、管理員手動入帳、confirm_token 讓入帳冪等——對學生付費補充額度這個場景剛好合用。AI_PLANS 用環境變數設定，改方案不動程式碼。單價下限要重算（家教模式成本低很多，可以賣得便宜）。",
  "effort": "照抄"
 },
 {
  "thing": "tasks 排程器（003 + 007 的 lease_until ＋ index.js runDueTasks）",
  "how_to_reuse": "白名單 action ＋ 租約搶佔 ＋ repeat_s 週期。讀書站直接新增 action：'review_reminder'（間隔複習提醒）、'daily_quiz'（每日一題）、'weekly_report'（進度週報）。cron 已是每分鐘，粒度夠。注意一輪只撈 10 筆，使用者一多要調大或分片。",
  "effort": "小改"
 },
 {
  "thing": "events 站內通知 ＋ read_at 已讀 ＋ /api/events",
  "how_to_reuse": "照抄。addEvent 的 no_mail 旗標讓「只要站內看得到」的通知不吃 Resend 額度，複習提醒正好用這個。",
  "effort": "照抄"
 },
 {
  "thing": "mail.js Resend 寄信佇列",
  "how_to_reuse": "照抄 sendMail/flushMail 的錯誤分流與 Idempotency-Key 邏輯；renderEvent 的 HTML 樣板換文案與配色即可當「每週進度報告」信。BATCH=20/輪、免費額度 100 封/日是硬限制，人數上去要付費升級。",
  "effort": "小改"
 },
 {
  "thing": "watch.js 偵測引擎骨架（activeWatches → detect → fires → addEvent，含冷卻期不寫狀態的邊緣判斷）",
  "how_to_reuse": "遊戲榜線的四種 kind 全部刪掉，但「共用快照、last_state 比對邊緣、cooldown、WATCH_KINDS 規格驅動前端表單」這套結構值得留：可改成偵測「某章節七天沒複習」「錯題累積超過 N 題」「模擬考成績下滑」。",
  "effort": "大改"
 },
 {
  "thing": "dashboard.js 唯讀儀表板（含 readOnly() 防線、台北日界 series、safe() 容錯）",
  "how_to_reuse": "overview/series/users/user/:id/health 五段幾乎可原樣沿用，把 watches 那段換成「題庫題數／待審題目數」，ai 稽核那段換成「哪個學生用最兇」。readOnly() 那道機械防線一定要保留。",
  "effort": "小改"
 },
 {
  "thing": "review.js 的 AI 審核模式（結構化 tool_choice ＋ AI 只能讓判定變嚴格 ＋ 永不自動拒絕）",
  "how_to_reuse": "改成「題目投稿自動預審」：判斷投稿題目是否為廣告／亂填／抄襲片段／注入，程式碼負責硬性檢查（有沒有答案、選項數、學科分類合法），AI 只加嚴。sanitizeNote() 的不可見字元清洗＋記 dropped 直接照抄，那是防注入最有效的一招。",
  "effort": "小改"
 },
 {
  "thing": "cors.js",
  "how_to_reuse": "把 SITE_BASE 換成新站網域即可。若前後端同網域（Pages Functions／同一 zone）就整支可以省掉。",
  "effort": "照抄"
 },
 {
  "thing": "Durable Object GameTracker（index.js 51–226）＋ /games /status /ensure /stop 路由 ＋ wrangler.toml 的 durable_objects/migrations 區塊",
  "how_to_reuse": "讀書站完全用不到，整段刪除。刪掉後 cron 可從每分鐘改成每 5 分鐘，Workers 用量與費用都降。若之後要 sub-minute 排程再回來抄 alarm 自我重排＋看門狗那套。",
  "effort": "重寫"
 },
 {
  "thing": "app.html 的 aiSend() 12 輪工具迴圈 ＋ 前端工具白名單模式",
  "how_to_reuse": "骨架照抄，AI_TOOLS 66 支遊戲工具全換：搜尋題庫、取出某題與解析、查學生錯題本、記錄作答、產生同類題、查考古題年份分佈。工具在瀏覽器執行、Worker 不執行模型產生的程式碼——這個安全邊界要原封不動保留。",
  "effort": "大改"
 }
]

## gotchas
[
 "CORS 白名單是寫死在 cors.js 的 allowOrigin()：只放行 SITE_BASE、它的 www/非 www 變體，以及 localhost / 127.0.0.1（任意 port、http 或 https）。新站上線一定要改 SITE_BASE，否則前端每支 /api 請求都會被瀏覽器擋掉，而且錯誤長得像「登入失敗」不像 CORS。帶 credentials 時 Allow-Origin 不能用 *，別為了圖方便改成萬用字元。",
 "COOKIE_DOMAIN 是 .project-sekai-center.com，cookie 不會跨到新網域。學測站要嘛用新網域的自己一組 secret 與 COOKIE_DOMAIN，要嘛掛在同一個父網域下的子網域；跨根網域是不可能共用 session 的。",
 "session cookie 撤不掉：30 天內只要 cookie 沒過期就一直能通過驗簽。但 currentUser() 每個請求都回 D1 讀 users，所以「停權／降管理員權」是即時生效的——真正撤不掉的只有「這張 cookie 代表這個 user_id」這件事。緊急情況唯一手段是換 SESSION_SECRET（全站登出）。",
 "額度算的是「請求數」不是「問題數」。前端 aiSend() 一次提問最多跑 12 輪工具迴圈，每輪都是一次 /api/chat＝一次額度＋一次計費。AI_CAP_USER=400 看起來很多，實際上大約只夠 33 個複雜問題；反過來，一個人卡在迴圈裡就能一天燒掉 $55。做家教站前一定要重新換算，並考慮把「一次提問」而不是「一次請求」當計費單位。",
 "AI_CAP_SITE 的預設值三個地方不一致：wrangler.toml 設 1500、api.js 是 `+env.AI_CAP_SITE || 6000`、review.js 是 1500 且特別處理了 0。api.js 那個 `|| 6000` 會把 0 換成 6000，也就是「設成 0 想關閉 AI」在 /api/chat 這條路上關不掉。",
 "aiUsedToday() 用的是 created_at >= now-86400（滾動 24 小時），dashboard.js 的 today 卻是台北自然日。兩個數字永遠對不起來，別拿儀表板的數字去反推使用者剩多少額度。",
 "prefs 沒有版本／時間戳衝突解決，也沒有刪除端點。setPrefs 是整個 key 覆蓋（last-writer-wins），而前端 pullCloud() 只補「本機沒有」的鍵——所以在 A 裝置刪掉一筆進度，同步後在 B 裝置還在，而且會被推回雲端。學習進度比遊戲設定敏感得多，一定要自己加 updated_at 比較或 CRDT 式合併，並補一支刪除端點。",
 "prefs 上限：整包 256KB、最多 200 個 key（MAX_PREFS / MAX_PREF_KEYS）。一整套學測題庫的作答紀錄很容易撞到，要嘛提高上限，要嘛改成每個 key 單獨 PATCH、進度另開正規化的表。",
 "IDOR 防線靠的是「每支查詢都寫死 AND user_id=?」這個紀律，不是框架保證。chat_messages 甚至刻意冗餘存了 user_id 就為了不必 JOIN。新增任何端點時，查得到但不是本人的一律回 not_found，不要先查出來再比對。",
 "dashboard.js 是全站唯一允許自己寫 SQL 的檔案，代價是有 readOnly() 正則強制只能 SELECT。在那裡加任何 INSERT/UPDATE 會在第一次執行就拋錯——這是刻意的，不要繞過它。",
 "prompt injection 有三道刻意的防線，改題庫／討論功能時很容易破功：(1) 後台助手的快照只有聚合數字與程式碼產生的字串，零個外來字串欄位；(2) events.title 一律由程式碼樣板產生，且審核類事件用 'apply:' 前綴讓 recentEventTitles 整段排除；(3) review.js 用 tool_choice 強制結構化輸出、把外來文字包在 <applicant_text> 裡、且 AI 只能讓判定變嚴格永遠不能單獨放行。如果讀書站要做「討論區」而管理員後台又有 AI 助手，使用者貼的文字絕不能流進那份快照，否則就是二階注入。",
 "不可見字元是主要注入載體：sanitizeNote() 移除 Unicode Tags (U+E0000–E007F)、\\p{Cf} 零寬與 bidi、控制字元，並把「清掉了多少」存進 apply_note_dropped。關鍵是這個數字要在收件當下存下來，事後重算必然是 0，訊號會整個消失。學生投稿題目要照抄這套。",
 "D1 沒有跨 await 的交易。全站的並發安全都靠「條件式 UPDATE ＋ 看 meta.changes」達成（claimTask、spendCredit、saveApplication、issueNonce、bumpVerifyTry、autoApprove、confirmOrder、chats.js 的額度 gate）。任何「先 SELECT 再判斷再寫」的新程式碼在並發下都是壞的。",
 "tasks 的租約：cron 每分鐘一次，但打 AI 動輒十幾秒到一分鐘以上。沒有 claimTask 的條件式搶佔，下一輪會撈到同一批 pending 的列，同一件事做兩次（雙倍費用、雙倍通知）。reclaimStaleTasks 負責把卡在 running 的放回去。週期任務跑完要回 pending 不是 done，這點在 finishTask 裡有處理，別改壞。",
 "Resend 免費額度 3000 封/月、100 封/日，且 MAIL_FROM 的網域必須在 Resend 後台完成 DKIM/SPF/MX 驗證，沒驗證每一封都回 403 validation_error——那是 DNS 問題不是程式問題。flushMail 撞到 429 quota 會 break 收工而不是硬送。",
 "從 Cloudflare Workers 打 Anthropic API 有已知的 403 問題（admin.js 有一整段 /admin/diag/anthropic 二分法診斷程式碼在追這件事）。新站部署後第一件事就是打那支端點確認通得過，不要假設本機測得過就沒事。",
 "個資最小化是刻意的設計：google_sub 永不外流（shapeUser 與 dashboard 的 SELECT 都明列欄位、不用 SELECT *）；送進 AI 的快照沒有任何 email／OAuth id／玩家 uid；AI 用量排行榜連 user_id 都不帶只帶 name。學測站的學生多半未成年，這條紀律只能更嚴不能放鬆。",
 "部署後有 1～2 分鐘傳播期，立刻 curl 可能還是舊行為，別當成 bug（SETUP.md 明講）。",
 "wrangler.toml 會進 git，所有機密一律用 `wrangler secret put`。目前的 secret 是 GOOGLE_CLIENT_SECRET / DISCORD_CLIENT_SECRET / RESEND_API_KEY / ANTHROPIC_API_KEY / SESSION_SECRET。"
]

## authoring_recipe
【A. 從零把這套骨架搬成學測站的後端】

1. 複製 worker/ 目錄，改 wrangler.toml：
   - name 改新名（例如 exam-center）
   - 刪掉整個 [[durable_objects.bindings]] 與 [[migrations]] 區塊
   - [triggers] crons 從 "* * * * *" 改成 "*/5 * * * *"（沒有 alarm 看門狗要救了）
   - [[routes]] pattern 改新網域，custom_domain = true（zone 必須在同一個 Cloudflare 帳號，它會自動建 DNS 記錄並簽憑證）
   - [vars] 改 SITE_BASE / OAUTH_BASE / COOKIE_DOMAIN / MAIL_FROM，重估 AI_MODEL 與四個 AI_CAP_*
2. 刪 src/index.js 的 GameTracker class（51–226 行）與 /games /status /ensure /stop 路由，scheduled() 裡的 stub.fetch('/ensure') 也一起拿掉。
3. 建新 D1：`npx wrangler d1 create exam-users`，把回傳的 database_id 填回 wrangler.toml。
4. 依序套用 SQL：`npx wrangler d1 execute exam-users --remote --file sql/schema.sql`，然後 002→008 逐支跑（每支都是 IF NOT EXISTS / ALTER，可重複執行）。007 的遊戲驗證欄位（apply_uid/game_uid/verify_*）不需要就整支跳過，但 tasks.lease_until 那一行要留。
5. 設 secret：`npx wrangler secret put SESSION_SECRET`（隨機 32+ bytes）、GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、ANTHROPIC_API_KEY、RESEND_API_KEY，以及 [vars] 裡的 ADMIN_EMAIL（也可以放 secret）。
6. Google Cloud Console 的 OAuth 用戶端要把 `https://<新網域>/auth/google/callback` 加進「已授權的重新導向 URI」，否則登入會直接被 Google 擋。
7. Resend 後台加入新網域，照它給的 TXT（DKIM/SPF）與 MX 設進 DNS，等後台顯示 verified。
8. `npx wrangler deploy`，然後打 GET /admin/dash/health 確認 capabilities 全綠、GET /admin/diag/anthropic 確認 Anthropic 通得過。

【B. 新增一支 API 端點（例如 /api/progress）】

1. SQL 寫在 src/db.js，匯出具名函式（唯一例外是 dashboard.js 的唯讀報表）。每支查詢都要帶 `AND user_id = ?`，寫入用條件式 UPDATE 並看 `r.meta.changes` 判斷成敗，不要「先 SELECT 再寫」。
2. 在 src/api.js 的 handleApi 裡加分支。位置很重要：要登入的放在第 212 行 `if (!user) return 401` 之後；要核准的放在第 333 行 `if (user.status !== 'approved')` 之後。
3. body 一律用 readJson(req, 上限) 讀，回傳 { value } / { tooBig } / { bad } 三種分別對應 200 / 413 / 400。
4. 回應一律用 out()（＝json() ＋ corsHeaders ＋ cache-control: no-store），不要自己 new Response，否則 CORS 標頭會漏掉，前端連讀都讀不到。
5. 對外形狀用 shapeXxx() 函式明列欄位，不要把資料列整包丟出去。

【C. 新增一張表】

1. 在 sql/ 新增 009_xxx.sql，全部用 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / ALTER TABLE，讓它可以重複執行。
2. 檔頭寫「為什麼這樣設計」的註解——這個 repo 的所有 migration 都這樣寫，是它最大的資產。
3. 索引照「實際查詢的形狀」開，不是照欄位開（例如列表固定是 user_id ＋ updated_at DESC 就開那個複合索引）。
4. 不宣告 FOREIGN KEY ... ON DELETE CASCADE（要靠 PRAGMA foreign_keys，不在 migration 掌控內）；連帶刪除改用 db.batch() 明確刪兩張表，batch 是單一交易。
5. 跑：`npx wrangler d1 execute <db> --remote --file sql/009_xxx.sql`。dashboard.js 對後加的表要用 safe(...) 包起來，讓沒跑過 migration 的環境不會整頁 500。

【D. 新增一個排程動作（複習提醒／每日一題／週報）】

1. 在 index.js 的 runDueTasks() 加一個 `else if (t.action === 'review_reminder') { ... }` 分支，做完呼叫 finishTask(env.DB, t, true, 結果字串)。
2. 在 admin.js 的 TASK_ACTIONS 陣列（第 665 行）把新代號加進白名單，否則後台建得起來、到期才失敗。
3. 建任務：createTask(db, userId, { title, action, params, run_at, repeat_s })。repeat_s 最小 300 秒；週期任務跑完會自動排下一次而不是標 done。
4. 動作內容要在 5 分鐘租約內做得完（claimTask 預設 300 秒），會打 AI 的動作要自己控制批次大小。
5. 通知走 addEvent(db, { watch_id: 'task:'+id, user_id, title, body, no_mail: 1 })——no_mail=1 就只在站內顯示、不吃 Resend 額度。

【E. 把站內助手改成「AI 家教／解題助教」】

後端只有四處要動，其餘照抄：
1. wrangler.toml 的 AI_MODEL 從 claude-opus-5 換成 claude-sonnet-5（家教問答不需要 Opus 的規劃深度，成本降到約四分之一），並依新成本重估 AI_CAP_USER / AI_CAP_SITE 與 AI_PLANS 的單價下限。
2. admin.js 的 PROFILES 加一個 'tutor' 設定檔（模型、thinking、effort 一組），前端只能送代號 'tutor'，不能送模型名稱——這道白名單一定要保留，不然「花多少錢」就交給任何能打這支 API 的人了。
3. admin.js 的 SYSTEM 常數（後台助手用的）不必動；家教的 system prompt 由前端送，validateChat 會截到 8000 字。
4. 若要「同一題多輪追問」的計費更合理，把 api.js 的額度扣點從「每次 /api/chat 請求」改成「每個對話回合」——現行 12 輪迴圈會扣 12 次。

前端（app.html）改動比較大：
5. 換掉 AI_SYSTEM（查證紀律那段的精神可留：不准憑印象給數字、算完回頭對一次、不確定就說查不到——這對解題助教同樣關鍵）。
6. 換掉 AI_TOOLS 全部 66 支：改成 search_questions / get_question / get_solution / list_wrong_answers / record_attempt / generate_similar / year_distribution 等。工具總量有兩道上限：最多 100 支、JSON 序列化後 160 KB。
7. aiSend() 的 12 輪迴圈與 aiRun() 的分派結構照抄，只換工具實作。工具在瀏覽器跑、Worker 不執行任何模型產生的程式碼——這個安全邊界不要改。
8. /api/chats 的存檔流程（saveChat / loadChat / newChat）完全不動即可用。

【F. 本機測試】

`npx wrangler dev` 起本地，前端指向 http://127.0.0.1:8787（cors.js 已放行 localhost 與 127.0.0.1 的任意 port）。查線上狀態用 `npx wrangler tail`、`npx wrangler secret list`、`npx wrangler d1 execute <db> --remote --command "SELECT ..."`。
