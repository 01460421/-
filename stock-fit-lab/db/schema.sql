-- ═══════════════════════════════════════════════════════════════════
-- Stock Fit Lab 資料庫 schema（PostgreSQL 14+；Vercel Postgres / Supabase / Neon）
-- 執行：npm run db:migrate（讀取 DATABASE_URL）
-- ═══════════════════════════════════════════════════════════════════

-- ─── 預測快照表（append-only）──────────────────────────────────────
create table if not exists prediction_snapshots (
  id               uuid primary key,
  created_at       timestamptz not null,
  symbol           text not null,
  model_id         text not null,
  model_version    text not null,
  params           jsonb not null default '{}'::jsonb,
  train_start      date not null,
  train_end        date not null,
  last_price       double precision not null,
  target_dates     date[] not null,
  mean             double precision[] not null,
  lower_bound      double precision[] not null,
  upper_bound      double precision[] not null,
  level            double precision not null default 0.9,
  p_up             double precision[],
  signal           text[],
  benchmarks       jsonb not null default '{}'::jsonb,
  ensemble_weights jsonb,
  trigger          text not null,
  ai_payload       jsonb,
  inserted_at      timestamptz not null default now()
);
create index if not exists idx_snap_symbol_created on prediction_snapshots (symbol, created_at desc);
create index if not exists idx_snap_model on prediction_snapshots (model_id, created_at desc);

-- 不可覆寫或刪除：以觸發器拒絕 UPDATE / DELETE（連資料庫管理者誤操作也會被擋）
create or replace function forbid_snapshot_mutation() returns trigger as $$
begin
  raise exception 'prediction_snapshots is append-only (% rejected)', tg_op;
end;
$$ language plpgsql;

drop trigger if exists trg_snapshot_immutable on prediction_snapshots;
create trigger trg_snapshot_immutable
  before update or delete on prediction_snapshots
  for each row execute function forbid_snapshot_mutation();

-- ─── 實際值回填（與快照分表，快照本身永不修改）──────────────────────
create table if not exists snapshot_outcomes (
  snapshot_id       uuid not null references prediction_snapshots(id),
  horizon_index     int  not null,
  target_date       date not null,
  actual            double precision not null,
  error             double precision not null,
  abs_pct_error     double precision not null,
  in_interval       boolean not null,
  direction_correct boolean,
  filled_at         timestamptz not null default now(),
  primary key (snapshot_id, horizon_index)
);
create index if not exists idx_outcome_target on snapshot_outcomes (target_date);

drop trigger if exists trg_outcome_immutable on snapshot_outcomes;
create trigger trg_outcome_immutable
  before update or delete on snapshot_outcomes
  for each row execute function forbid_snapshot_mutation();

-- ─── 事件表（稽核軌跡）────────────────────────────────────────────
create table if not exists system_events (
  id        uuid primary key,
  at        timestamptz not null,
  kind      text not null,
  symbol    text,
  severity  text not null,
  title     text not null,
  detail    jsonb not null default '{}'::jsonb
);
create index if not exists idx_event_at on system_events (at desc);
create index if not exists idx_event_symbol on system_events (symbol, at desc);
create index if not exists idx_event_kind on system_events (kind, at desc);

-- ─── 自選股表 ─────────────────────────────────────────────────────
create table if not exists watchlist (
  user_id   text not null,
  symbol    text not null,
  market    text not null,
  name      text,
  added_at  timestamptz not null default now(),
  source    text not null default 'manual',
  primary key (user_id, symbol)
);

-- ─── 對話表（AI 助理對話 + 當時引用的資料快照）───────────────────────
create table if not exists conversations (
  id               uuid primary key,
  user_id          text not null,
  symbol           text not null,
  created_at       timestamptz not null,
  messages         jsonb not null,
  context_snapshot jsonb
);
create index if not exists idx_conv_user on conversations (user_id, created_at desc);

-- ─── 一般使用者唯讀（Supabase RLS 範例；Vercel Postgres 以應用層權限控管）──
-- alter table prediction_snapshots enable row level security;
-- create policy snapshots_read on prediction_snapshots for select using (true);
-- （不建立 insert/update/delete policy → anon/authenticated 角色無法寫入，只有 service role 可寫）
