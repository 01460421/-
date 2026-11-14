// 全館共用的常數與環境變數。
// 環境變數一律在「用到的當下」才讀（env 的 getter），這樣測試可以在執行中途改設定。

export const API_VERSION = '2.0.0';
export const API_MAJOR = 2;

export const FEATURES = ['board', 'react', 'report', 'vote', 'pulse', 'case', 'admin'];

// 頻道：kind 決定欄位（relay/theory 用 x，gallery 用 w），keep 是保留筆數
export const CHANNELS = {
  h33: { kind: 'relay', text: 240, keep: 500 },
  wall: { kind: 'relay', text: 240, keep: 500 },
  post: { kind: 'relay', text: 240, keep: 500 },
  free: { kind: 'relay', text: 240, keep: 500 },
  gallery: { kind: 'gallery', keep: 500 },
  theory: { kind: 'theory', text: 400, keep: 600 },
};
export const CHANNEL_KEYS = Object.keys(CHANNELS);

const range = (prefix, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

export const SCENES = range('s', 1, 8); // 投票的八個時刻
export const STORM_COUNT = 11; // 十一場雨，索引 0..10
export const QUESTIONS = new Set(range('q', 1, 12)); // 未解之謎
export const CHAPTERS = new Set(range('c', 0, 13)); // 章節
export const REACTIONS = ['a', 'b', 'c'];

export const LIMITS = {
  name: 16,
  relay: 240,
  theory: 400,
  piece: 1200,
  pieceTitle: 30,
  cardField: 20,
  cardSay: 80,
  items: 500,
  body: 6000, // 一般請求本體的字元上限
  caseData: 300000, // 雲端存檔密文的字元上限
  caseBody: 620000, // 存檔請求本體的字元上限：密文若有需要跳脫的字元，JSON 會比原文長，所以抓寬一點
  reactors: 200, // 每一筆最多幾個人共鳴
  reports: 50, // 每一筆最多記幾個回報的人
  voters: 20000,
  bans: 2000,
  feed: 24,
  snippet: 40,
  dupWindowMs: 10 * 60 * 1000,
};

// 記憶體內的頻率限制（每個執行個體各算各的）：[次數, 毫秒]
export const MEM_RATES = {
  // docs/API.md 明列的
  react: [30, 60_000],
  report: [5, 600_000],
  vote: [20, 60_000],
  caseWrite: [6, 60_000],
  sweepOpen: [1, 3_600_000], // 沒設任何密鑰時，sweep 一小時只做一次
  // API.md 沒有列、為了保護 Blob 的讀取額度與館主鑰匙另外加的寬鬆上限
  caseRead: [60, 60_000],
  boardDelete: [30, 60_000],
  freshRead: [20, 60_000], // 超過不會回錯誤，只是改讀記憶體快取
  adminFail: [10, 60_000], // 館主鑰匙連續猜錯
};

export const READ_CACHE_MS = 5000; // 讀取端點的記憶體快取
export const MUTATE_TRIES = 6;

export const PATHS = {
  board: (k) => `board/${k}.json`,
  site: 'sys/site.json',
  poll: 'sys/poll.json',
  case: (id) => `case/${id}.json`,
};

export const CACHE = {
  none: 'no-store',
  health: 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
  board: 'public, max-age=0, s-maxage=10, stale-while-revalidate=60',
  pulse: 'public, max-age=0, s-maxage=30, stale-while-revalidate=300',
};

function intEnv(name, fallback, min = 1, max = 1_000_000) {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

const strEnv = (name) => (process.env[name] ?? '').trim();

export const env = {
  get rate10min() {
    return intEnv('RATE_10MIN', 6);
  },
  get rateDay() {
    return intEnv('RATE_DAY', 60);
  },
  get reportHide() {
    return intEnv('REPORT_HIDE', 3);
  },
  get caseTtlDays() {
    return intEnv('CASE_TTL_DAYS', 365, 1, 36500);
  },
  get hashSalt() {
    return process.env.HASH_SALT || 'nyjn';
  },
  get adminKey() {
    return process.env.ADMIN_KEY || '';
  },
  get cronSecret() {
    return process.env.CRON_SECRET || '';
  },
  /** 允許的來源清單；沒設定就是 ['*'] */
  get allowOrigins() {
    const list = (process.env.ALLOW_ORIGINS || '*')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? list : ['*'];
  },
  get storeOverride() {
    return strEnv('NYJN_STORE').toLowerCase();
  },
  get dataDir() {
    return strEnv('NYJN_DATA_DIR') || '.data';
  },
  /** 連上 Blob store 的跡象：傳統的讀寫權杖，或 OIDC 模式用的 store id */
  get hasBlobCredentials() {
    return Boolean(strEnv('BLOB_READ_WRITE_TOKEN') || strEnv('BLOB_STORE_ID'));
  },
  get onVercel() {
    return Boolean(strEnv('VERCEL'));
  },
};

const STORE_KINDS = ['blob', 'file', 'memory', 'none'];
let warnedBadOverride = false;

/**
 * 現在該用哪一種儲存：blob／file／memory／none。
 * 放在這裡而不是 lib/store.js，是為了讓 /api/health 不必為了回答這一題而載入整個 Blob SDK。
 */
export function storeKind() {
  const forced = env.storeOverride;
  if (forced) {
    if (STORE_KINDS.includes(forced)) return forced;
    if (!warnedBadOverride) {
      warnedBadOverride = true;
      console.warn(`[nyjn] NYJN_STORE="${forced}" 不是 blob/file/memory，改用自動判斷`);
    }
  }
  if (env.hasBlobCredentials) return 'blob';
  // 在 Vercel 上卻沒接 Blob：那裡的檔案系統是唯讀的，寧可明講「還沒接上」
  if (env.onVercel) return 'none';
  return 'file';
}
