/**
 * PostgreSQL 儲存實作（postgres.js）。快照表的不可變性由 db/schema.sql 的觸發器在資料庫層強制。
 */
import postgres from 'postgres';
import type { Conversation, PredictionSnapshot, SnapshotOutcome, SystemEvent, WatchlistItem } from '../types';
import type { EventQuery, SnapshotQuery, Store } from './types';

type Row = Record<string, any>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const ymd = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

function rowToSnapshot(r: Row): PredictionSnapshot {
  return {
    id: r.id,
    createdAt: iso(r.created_at),
    symbol: r.symbol,
    modelId: r.model_id,
    modelVersion: r.model_version,
    params: r.params ?? {},
    trainStart: ymd(r.train_start),
    trainEnd: ymd(r.train_end),
    lastPrice: Number(r.last_price),
    targetDates: (r.target_dates ?? []).map(ymd),
    mean: (r.mean ?? []).map(Number),
    lower: (r.lower_bound ?? []).map(Number),
    upper: (r.upper_bound ?? []).map(Number),
    level: Number(r.level),
    pUp: r.p_up ? r.p_up.map(Number) : undefined,
    signal: r.signal ?? undefined,
    benchmarks: r.benchmarks ?? {},
    ensembleWeights: r.ensemble_weights ?? undefined,
    trigger: r.trigger,
    aiPayload: r.ai_payload ?? undefined,
  };
}

export class PostgresStore implements Store {
  readonly kind = 'postgres' as const;
  private sql: postgres.Sql;

  constructor(url: string) {
    this.sql = postgres(url, { max: 3, idle_timeout: 20, prepare: false, ssl: url.includes('localhost') ? false : 'require' });
  }

  async appendSnapshot(s: PredictionSnapshot) {
    await this.appendSnapshots([s]);
  }

  async appendSnapshots(list: PredictionSnapshot[]) {
    if (!list.length) return;
    const sql = this.sql;
    await sql.begin(async (tx) => {
      for (const s of list) {
        await tx`
          insert into prediction_snapshots
            (id, created_at, symbol, model_id, model_version, params, train_start, train_end, last_price,
             target_dates, mean, lower_bound, upper_bound, level, p_up, signal, benchmarks, ensemble_weights, trigger, ai_payload)
          values
            (${s.id}, ${s.createdAt}, ${s.symbol}, ${s.modelId}, ${s.modelVersion}, ${sql.json(s.params as never)},
             ${s.trainStart}, ${s.trainEnd}, ${s.lastPrice}, ${s.targetDates}::date[], ${s.mean}, ${s.lower}, ${s.upper},
             ${s.level}, ${s.pUp ?? null}, ${s.signal ?? null}, ${sql.json(s.benchmarks as never)},
             ${s.ensembleWeights ? sql.json(s.ensembleWeights) : null}, ${s.trigger},
             ${s.aiPayload ? sql.json(s.aiPayload as never) : null})`;
      }
    });
  }

  async getSnapshot(id: string) {
    const rows = await this.sql`select * from prediction_snapshots where id = ${id}`;
    return rows.length ? rowToSnapshot(rows[0]) : null;
  }

  async listSnapshots(q: SnapshotQuery) {
    const sql = this.sql;
    const rows = await sql`
      select s.* from prediction_snapshots s
      where true
        ${q.symbol ? sql`and s.symbol = ${q.symbol}` : sql``}
        ${q.modelId ? sql`and s.model_id = ${q.modelId}` : sql``}
        ${q.from ? sql`and s.created_at >= ${q.from}` : sql``}
        ${q.to ? sql`and s.created_at <= ${q.to.length === 10 ? q.to + 'T23:59:59.999Z' : q.to}` : sql``}
        ${q.pendingOnly ? sql`and (select count(*) from snapshot_outcomes o where o.snapshot_id = s.id) < cardinality(s.target_dates)` : sql``}
      order by s.created_at desc
      limit ${q.limit ?? 5000}`;
    return rows.map(rowToSnapshot);
  }

  async appendOutcomes(list: SnapshotOutcome[]) {
    if (!list.length) return 0;
    let n = 0;
    await this.sql.begin(async (tx) => {
      for (const o of list) {
        const r = await tx`
          insert into snapshot_outcomes (snapshot_id, horizon_index, target_date, actual, error, abs_pct_error, in_interval, direction_correct, filled_at)
          values (${o.snapshotId}, ${o.horizonIndex}, ${o.targetDate}, ${o.actual}, ${o.error}, ${o.absPctError}, ${o.inInterval}, ${o.directionCorrect}, ${o.filledAt})
          on conflict do nothing`;
        n += r.count;
      }
    });
    return n;
  }

  async listOutcomes(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.sql`select * from snapshot_outcomes where snapshot_id = any(${ids}::uuid[])`;
    return rows.map((r) => ({
      snapshotId: r.snapshot_id,
      horizonIndex: r.horizon_index,
      targetDate: ymd(r.target_date),
      actual: Number(r.actual),
      error: Number(r.error),
      absPctError: Number(r.abs_pct_error),
      inInterval: r.in_interval,
      directionCorrect: r.direction_correct,
      filledAt: iso(r.filled_at),
    }));
  }

  async appendEvent(e: SystemEvent) {
    await this.sql`insert into system_events (id, at, kind, symbol, severity, title, detail)
      values (${e.id}, ${e.at}, ${e.kind}, ${e.symbol ?? null}, ${e.severity}, ${e.title}, ${this.sql.json(e.detail as never)})`;
  }

  async listEvents(q: EventQuery) {
    const sql = this.sql;
    const rows = await sql`select * from system_events where true
      ${q.symbol ? sql`and symbol = ${q.symbol}` : sql``}
      ${q.kind ? sql`and kind = ${q.kind}` : sql``}
      ${q.from ? sql`and at >= ${q.from}` : sql``}
      ${q.to ? sql`and at <= ${q.to}` : sql``}
      order by at desc limit ${q.limit ?? 200}`;
    return rows.map((r) => ({ id: r.id, at: iso(r.at), kind: r.kind, symbol: r.symbol ?? undefined, severity: r.severity, title: r.title, detail: r.detail }));
  }

  async listWatchlist(userId: string) {
    const rows = await this.sql`select * from watchlist where user_id = ${userId} order by added_at`;
    return rows.map((r) => ({ userId: r.user_id, symbol: r.symbol, market: r.market, name: r.name ?? undefined, addedAt: iso(r.added_at), source: r.source }));
  }

  async listAllTrackedSymbols() {
    const rows = await this.sql`select distinct symbol from watchlist`;
    return rows.map((r) => r.symbol as string);
  }

  async upsertWatchlist(items: WatchlistItem[]) {
    await this.sql.begin(async (tx) => {
      for (const w of items) {
        await tx`insert into watchlist (user_id, symbol, market, name, added_at, source)
          values (${w.userId}, ${w.symbol}, ${w.market}, ${w.name ?? null}, ${w.addedAt}, ${w.source})
          on conflict (user_id, symbol) do update set name = excluded.name, market = excluded.market`;
      }
    });
  }

  async removeWatchlist(userId: string, symbol: string) {
    await this.sql`delete from watchlist where user_id = ${userId} and symbol = ${symbol}`;
  }

  async saveConversation(c: Conversation) {
    await this.sql`insert into conversations (id, user_id, symbol, created_at, messages, context_snapshot)
      values (${c.id}, ${c.userId}, ${c.symbol}, ${c.createdAt}, ${this.sql.json(c.messages as never)}, ${this.sql.json((c.contextSnapshot ?? null) as never)})
      on conflict (id) do update set messages = excluded.messages, context_snapshot = excluded.context_snapshot`;
  }

  async listConversations(userId: string, symbol?: string) {
    const sql = this.sql;
    const rows = await sql`select * from conversations where user_id = ${userId} ${symbol ? sql`and symbol = ${symbol}` : sql``} order by created_at desc limit 200`;
    return rows.map((r) => ({ id: r.id, userId: r.user_id, symbol: r.symbol, createdAt: iso(r.created_at), messages: r.messages, contextSnapshot: r.context_snapshot }));
  }

  async exportUserData(userId: string) {
    return { watchlist: await this.listWatchlist(userId), conversations: await this.listConversations(userId) };
  }

  async deleteUserData(userId: string) {
    await this.sql`delete from watchlist where user_id = ${userId}`;
    await this.sql`delete from conversations where user_id = ${userId}`;
  }
}
