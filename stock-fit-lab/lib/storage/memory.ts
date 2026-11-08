/**
 * 記憶體儲存（無 DATABASE_URL 時的備援）。
 * 本機開發（非 Vercel）會把狀態持久化到 .data/store.json，讓快照在重啟後仍可回顧。
 * Vercel Serverless 的檔案系統唯讀，此時僅存在單一 lambda 生命週期內 → 介面會提示「未設定資料庫」。
 */
import type { Conversation, PredictionSnapshot, SnapshotOutcome, SystemEvent, WatchlistItem } from '../types';
import type { EventQuery, SnapshotQuery, Store } from './types';

interface State {
  snapshots: PredictionSnapshot[];
  outcomes: SnapshotOutcome[];
  events: SystemEvent[];
  watchlist: WatchlistItem[];
  conversations: Conversation[];
}

const empty = (): State => ({ snapshots: [], outcomes: [], events: [], watchlist: [], conversations: [] });

function canPersist(): boolean {
  return typeof process !== 'undefined' && !process.env.VERCEL && process.env.NODE_ENV !== 'test' && !process.env.VITEST;
}

async function loadFile(): Promise<State | null> {
  if (!canPersist()) return null;
  try {
    const fs = await import('node:fs/promises');
    const raw = await fs.readFile(`${process.cwd()}/.data/store.json`, 'utf8');
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private state: State = empty();
  private loaded: Promise<void>;

  constructor(private persist = canPersist()) {
    this.loaded = persist
      ? loadFile().then((s) => {
          if (s) this.state = s;
        })
      : Promise.resolve();
  }

  private async ready() {
    await this.loaded;
  }

  private schedulePersist() {
    if (!this.persist) return;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(async () => {
      try {
        const fs = await import('node:fs/promises');
        await fs.mkdir(`${process.cwd()}/.data`, { recursive: true });
        await fs.writeFile(`${process.cwd()}/.data/store.json`, JSON.stringify(this.state));
      } catch {
        /* 忽略：唯讀檔案系統 */
      }
    }, 200);
  }

  async appendSnapshot(s: PredictionSnapshot) {
    await this.appendSnapshots([s]);
  }

  async appendSnapshots(list: PredictionSnapshot[]) {
    await this.ready();
    const ids = new Set(this.state.snapshots.map((s) => s.id));
    for (const s of list) {
      if (ids.has(s.id)) throw new Error(`snapshot ${s.id} already exists (append-only)`);
      // 深拷貝並凍結：任何事後修改都會在 strict mode 下拋錯
      this.state.snapshots.push(deepFreeze(structuredClone(s)));
    }
    this.schedulePersist();
  }

  async getSnapshot(id: string) {
    await this.ready();
    return this.state.snapshots.find((s) => s.id === id) ?? null;
  }

  async listSnapshots(q: SnapshotQuery) {
    await this.ready();
    let out = this.state.snapshots.filter(
      (s) =>
        (!q.symbol || s.symbol === q.symbol) &&
        (!q.modelId || s.modelId === q.modelId) &&
        (!q.from || s.createdAt >= q.from) &&
        (!q.to || s.createdAt <= q.to + (q.to.length === 10 ? 'T23:59:59.999Z' : '')),
    );
    if (q.pendingOnly) {
      const done = new Map<string, number>();
      for (const o of this.state.outcomes) done.set(o.snapshotId, (done.get(o.snapshotId) ?? 0) + 1);
      out = out.filter((s) => (done.get(s.id) ?? 0) < s.targetDates.length);
    }
    out = [...out].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return q.limit ? out.slice(0, q.limit) : out;
  }

  async appendOutcomes(list: SnapshotOutcome[]) {
    await this.ready();
    const key = (o: SnapshotOutcome) => `${o.snapshotId}:${o.horizonIndex}`;
    const seen = new Set(this.state.outcomes.map(key));
    let n = 0;
    for (const o of list) {
      if (seen.has(key(o))) continue;
      seen.add(key(o));
      this.state.outcomes.push(Object.freeze({ ...o }));
      n++;
    }
    if (n) this.schedulePersist();
    return n;
  }

  async listOutcomes(ids: string[]) {
    await this.ready();
    const set = new Set(ids);
    return this.state.outcomes.filter((o) => set.has(o.snapshotId));
  }

  async appendEvent(e: SystemEvent) {
    await this.ready();
    this.state.events.push(e);
    if (this.state.events.length > 20000) this.state.events.splice(0, this.state.events.length - 20000);
    this.schedulePersist();
  }

  async listEvents(q: EventQuery) {
    await this.ready();
    const out = this.state.events
      .filter((e) => (!q.symbol || e.symbol === q.symbol) && (!q.kind || e.kind === q.kind) && (!q.from || e.at >= q.from) && (!q.to || e.at <= q.to))
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    return out.slice(0, q.limit ?? 200);
  }

  async listWatchlist(userId: string) {
    await this.ready();
    return this.state.watchlist.filter((w) => w.userId === userId);
  }

  async listAllTrackedSymbols() {
    await this.ready();
    return [...new Set(this.state.watchlist.map((w) => w.symbol))];
  }

  async upsertWatchlist(items: WatchlistItem[]) {
    await this.ready();
    for (const it of items) {
      const i = this.state.watchlist.findIndex((w) => w.userId === it.userId && w.symbol === it.symbol);
      if (i >= 0) this.state.watchlist[i] = { ...this.state.watchlist[i], ...it };
      else this.state.watchlist.push(it);
    }
    this.schedulePersist();
  }

  async removeWatchlist(userId: string, symbol: string) {
    await this.ready();
    this.state.watchlist = this.state.watchlist.filter((w) => !(w.userId === userId && w.symbol === symbol));
    this.schedulePersist();
  }

  async saveConversation(c: Conversation) {
    await this.ready();
    const i = this.state.conversations.findIndex((x) => x.id === c.id);
    if (i >= 0) this.state.conversations[i] = c;
    else this.state.conversations.push(c);
    this.schedulePersist();
  }

  async listConversations(userId: string, symbol?: string) {
    await this.ready();
    return this.state.conversations.filter((c) => c.userId === userId && (!symbol || c.symbol === symbol)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async exportUserData(userId: string) {
    return { watchlist: await this.listWatchlist(userId), conversations: await this.listConversations(userId) };
  }

  async deleteUserData(userId: string) {
    await this.ready();
    this.state.watchlist = this.state.watchlist.filter((w) => w.userId !== userId);
    this.state.conversations = this.state.conversations.filter((c) => c.userId !== userId);
    this.schedulePersist();
  }
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}
