/**
 * 儲存層合約。實作：
 *  - PostgresStore（DATABASE_URL：Vercel Postgres / Supabase / Neon 皆可）
 *  - MemoryStore（無資料庫時的備援；本機開發會同步寫入 .data/*.json）
 *
 * 快照表為 append-only：介面刻意「不提供」update / delete 快照的方法。
 * 實際值回填寫入獨立的 outcomes 表，(snapshot_id, horizon_index) 唯一，重複回填被忽略。
 */
import type { Conversation, PredictionSnapshot, SnapshotOutcome, SystemEvent, WatchlistItem } from '../types';

export interface SnapshotQuery {
  symbol?: string;
  modelId?: string;
  from?: string; // createdAt >= from（ISO 或 YYYY-MM-DD）
  to?: string; // createdAt <= to
  limit?: number;
  /** 只取「尚有目標日未回填」的快照 */
  pendingOnly?: boolean;
}

export interface EventQuery {
  symbol?: string;
  kind?: SystemEvent['kind'];
  from?: string;
  to?: string;
  limit?: number;
}

export interface Store {
  readonly kind: 'postgres' | 'memory';

  // 快照（只增不改）
  appendSnapshot(s: PredictionSnapshot): Promise<void>;
  appendSnapshots(s: PredictionSnapshot[]): Promise<void>;
  getSnapshot(id: string): Promise<PredictionSnapshot | null>;
  listSnapshots(q: SnapshotQuery): Promise<PredictionSnapshot[]>;

  // 回填
  appendOutcomes(o: SnapshotOutcome[]): Promise<number>; // 回傳實際新增筆數
  listOutcomes(snapshotIds: string[]): Promise<SnapshotOutcome[]>;

  // 事件日誌
  appendEvent(e: SystemEvent): Promise<void>;
  listEvents(q: EventQuery): Promise<SystemEvent[]>;

  // 自選股
  listWatchlist(userId: string): Promise<WatchlistItem[]>;
  listAllTrackedSymbols(): Promise<string[]>;
  upsertWatchlist(items: WatchlistItem[]): Promise<void>;
  removeWatchlist(userId: string, symbol: string): Promise<void>;

  // 對話
  saveConversation(c: Conversation): Promise<void>;
  listConversations(userId: string, symbol?: string): Promise<Conversation[]>;

  // 個資：一鍵匯出 / 刪除（只刪使用者個人資料：自選股與對話；快照為系統資料不刪）
  exportUserData(userId: string): Promise<{ watchlist: WatchlistItem[]; conversations: Conversation[] }>;
  deleteUserData(userId: string): Promise<void>;
}
