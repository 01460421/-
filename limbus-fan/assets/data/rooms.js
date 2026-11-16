// 房間（選單、搜尋、總站的路線圖都用這份）與車票簿上的成就章。
window.LB.rooms = [
  { id: 'hall', name: '總站', desc: '今天的乘客、最近的班次、你蓋過幾枚章。', c: 'var(--amber)', quick: false },
  { id: 'roster', name: '乘客名冊', desc: '十三位乘客的座位表，點進去看每個人的個人頁。', c: 'var(--wrath)', quick: true },
  { id: 'route', name: '路線圖', desc: '序章到最新一章，每一章的主角、地點與劇情。', c: 'var(--lust)', quick: true },
  { id: 'city', name: '都市', desc: '翼、五指、協會與收尾人的等級：這個世界怎麼運作。', c: 'var(--sloth)', quick: true },
  { id: 'terms', name: '車上用語', desc: '一百個左右的名詞，可以搜尋，也可以照類別看。', c: 'var(--gluttony)', quick: true },
  { id: 'library', name: '書房', desc: '乘客名字出處的十三部作品，附上你的書單。', c: 'var(--gloom)', quick: true },
  { id: 'timeline', name: '年表', desc: 'Project Moon 的三部遊戲，與《邊獄巴士》每一季的時間。', c: 'var(--pride)', quick: false },
  { id: 'clash', name: '拼點教室', desc: '照遊戲的規則擲硬幣，算出拼點的勝率。', c: 'var(--envy)', quick: true },
  { id: 'quiz', name: '乘車測驗', desc: '十道題，每次從手冊裡的資料重新出題。', c: 'var(--wrath)', quick: false },
  { id: 'arcade', name: '遊戲車廂', desc: '出處配對、章節排序、拼點對決三個小遊戲。', c: 'var(--lust)', quick: false },
  { id: 'tickets', name: '車票簿', desc: '逛過的頁面和做過的事都會蓋章，可以做成一張車票。', c: 'var(--sloth)', quick: false },
  { id: 'about', name: '關於', desc: '這本手冊的來源、譯名與權利。', c: 'var(--muted)', quick: false },
];

// 成就章：test 會在每次蓋章之後檢查一次
(function () {
  const LB = window.LB;
  const has = (s, pre, n) => Object.keys(s).filter(k => k.startsWith(pre)).length >= n;
  LB.achievements = [
    { id: 'progress-set', name: '報上進度', desc: '設定自己看到第幾章。' },
    { id: 'all-sinners', name: '全員點名', desc: '十三位乘客的個人頁都看過。', test: s => LB.sinners.concat(LB.crew.filter(p => p.no)).every(p => s['sinner-' + p.id]) },
    { id: 'all-cantos', name: '全線走完', desc: '每一章的頁面都看過。', test: s => LB.cantos.filter(c => !c.side).every(c => s['canto-' + c.no]) },
    { id: 'all-rooms', name: '全站巡禮', desc: '每一個房間都去過。', test: s => LB.rooms.every(r => s['room-' + r.id]) },
    { id: 'terms-20', name: '辭典常客', desc: '點開二十個名詞的解釋。', test: s => has(s, 'term-', 20) },
    { id: 'library-5', name: '書房常客', desc: '在書房裡標記讀過五本書。' },
    { id: 'clash-10', name: '拼點十次', desc: '在拼點教室裡擲十次。' },
    { id: 'quiz-pass', name: '順利上車', desc: '乘車測驗答對七題以上。' },
    { id: 'quiz-perfect', name: '滿分乘客', desc: '乘車測驗十題全對。' },
    { id: 'arcade-match', name: '對號入座', desc: '完成出處配對。' },
    { id: 'arcade-order', name: '照時刻表', desc: '完成章節排序。' },
    { id: 'arcade-duel', name: '贏下對決', desc: '在拼點對決裡獲勝。' },
    { id: 'streak-3', name: '三日通勤', desc: '連續三天來到手冊。' },
  ];
})();

// 關於這本手冊
window.LB.about = {
  sections: [
    { h: '這是什麼', p: '一本給《邊獄巴士》（Limbus Company）玩家看的非官方、非營利手冊，和 Project Moon 沒有任何關係。每一個房間是一站：乘客的個人頁、每一章的路線、都市的地圖、拼點教室、書房、年表、測驗、小遊戲和車票簿。' },
    { h: '劇透', p: '右上角的設定可以告訴手冊你看到第幾章。之後章節的劇情、乘客的過去、和原著的對照，都會先遮起來；想看的時候按「仍要顯示」，只會打開那一段。進度只存在這台裝置。' },
    { h: '資料從哪裡來', p: '遊戲的事實對照了 limbuscompany.wiki.gg、libraryofruina.wiki.gg、英文維基百科、Steam 上的官方公告，以及遊戲文本本身（透過玩家翻譯計畫 LLC 公開的檔案）。只有一個來源能確認的內容，會在那一段寫明；查不到的就不寫。劇情摘要、人物介紹和文學作品的介紹，都是手冊用自己的話寫的。\n\n拼點教室的規則照遊戲內教學與 wiki 的公式：擲出正面的機率是 50% 加上理智值，攻擊等級每高 3 級拼點威力加 1，平手重擲。勝率是把每一種硬幣的結果都算進去的精確值，不是隨機模擬。' },
    { h: '譯名', p: '遊戲沒有官方中文。角色、章節和名詞的中文名稱，參考玩家自發的翻譯計畫：都市零協會漢化組 LLC（簡體）與 LTM（繁體，以 LLC 為底本），轉成繁體字形；LLC 和 LTM 的譯文採用 CC BY-NC-SA 4.0 授權。文學作品的書名用台灣出版常見的譯名。書房裡的開頭引文，是手冊自己從原文譯的，只引已經進入公有領域的作品。' },
    { h: '權利', p: '《邊獄巴士》的名稱、角色、世界觀都屬於 Project Moon。手冊沒有使用遊戲的圖片、音樂或檔案；乘客的小圖示照各人名字出處的作品自己畫，版面和配色也是自己設計的。Project Moon 的同人創作指引允許非營利的同好網站，並希望標明是同人作品。' },
    { h: '你的紀錄', p: '車票簿的印章、測驗成績、書單和劇透進度都只存在這台裝置的瀏覽器裡，手冊沒有後端，也不收集任何資料。設定裡可以一次清掉。' },
  ],
};
