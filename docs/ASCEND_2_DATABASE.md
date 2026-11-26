# ASCEND 2.0 — Database Design

> Status: **APPROVED (2026-11-25).** Nothing has been created yet; tables are introduced phase by phase. Target: Supabase PostgreSQL (free tier), managed with Supabase CLI migrations.

## 1. Principles

1. **Mirror, don't redesign.** The cloud tables mirror the existing Dexie tables in `src/db/schema.ts` (`SCHEMA_V2`) and the Zod schemas in `src/domain/types.ts`, so sync is a mapping, not a translation layer.
2. **Composite ownership keys.** Every user-owned row has `primary key (user_id, id)`. Local IDs are mostly UUIDs, but some are deterministic text:
   - `rec:<rule>:<date>` from `recurringInstanceId`
   - `'settings'`
   - `daily:YYYY-MM-DD` from `reviewId`
   - achievement slugs

   So `id` is `text`. Composite foreign keys `(user_id, x_id)` make it **structurally impossible** to link a row to another user's row, even if a policy were wrong.
3. **Writes go through RPCs.** The `authenticated` role gets `SELECT` (RLS-filtered) on synced tables but **no direct `INSERT/UPDATE/DELETE`**. All writes go through `SECURITY DEFINER` functions (`sync_push`, profile and social RPCs). Those functions enforce idempotency, revisions, ordering and XP rules.
4. **The server owns derived truth.** Verified XP, verified achievements, ranks and levels shown publicly are computed server-side. Client-submitted totals are never stored.
5. **Phase the schema.** Each table is introduced in the phase that needs it (§8). Nothing is created speculatively.

## 2. Conventions

```sql
-- every synced table carries this column set
user_id        uuid        not null references auth.users(id) on delete cascade,
id             text        not null check (char_length(id) between 1 and 128),
rev            integer     not null default 1,          -- bumped by trigger on every change
server_seq     bigint      not null,                    -- from sequence sync_seq, set by trigger
created_at     timestamptz not null default now(),      -- server clock
updated_at     timestamptz not null default now(),      -- server clock
client_updated_at timestamptz,                          -- client clock (advisory only)
deleted_at     timestamptz,                             -- tombstone; row kept 90 days then purged
primary key (user_id, id)
```

Shared trigger `trg_sync_stamp` runs `BEFORE INSERT OR UPDATE`. It sets `server_seq = nextval('sync_seq')`, `rev = old.rev + 1` and `updated_at = now()`.

Shared index on every synced table: `create index on <t> (user_id, server_seq);` This serves the pull query.

All `SECURITY DEFINER` functions:

- `set search_path = ''` and fully qualified names
- start with `perform private.assert_authenticated();`
- take `pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0))` before writing (ARCHITECTURE §4.3)

Helper functions live in schema `private`, which is not exposed through PostgREST.

## 3. Phase 2 — Identity

### 3.1 `profiles` (public-facing identity)

| Column | Type | Constraints / notes |
|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users(id)` on delete cascade |
| `username` | `citext` | `unique`, `check (username ~ '^[a-z0-9_]{3,20}$')`, not in `private.reserved_usernames` |
| `display_name` | `text` | 1–40 chars, trimmed, control characters stripped by trigger |
| `avatar_id` | `text` | must exist in `private.avatar_catalog` (mirrors `AVATARS` in `src/components/game/Avatar.tsx`) |
| `frame_id`, `equipped_title_id` | `text` null | must be unlocked (checked in RPC) |
| `bio` | `text` null | ≤ 280 chars |
| `country` | `char(2)` null | ISO-3166 alpha-2 |
| `timezone` | `text` | IANA name, validated against `pg_timezone_names`; change cooldown 30 days (streak integrity) |
| `profile_visibility` | `enum ('public','friends','private')` | default `'friends'` |
| `discoverable` | `boolean` | default `false` (search opt-in) |
| `leaderboard_opt_in` | `boolean` | default `false` (explicit opt-in) |
| `friend_requests_from` | `enum ('everyone','nobody')` | default `'everyone'` |
| `stat_visibility` | `jsonb` | allow-list of `{level, xp, streak, quests, focus, achievements}`; validated keys |
| `showcase_achievements` | `text[]` | ≤ 5, only verified unlocks (checked in RPC) |
| `username_changed_at` | `timestamptz` null | 30-day cooldown |
| `created_at` | `timestamptz` | |

- Indexes: `unique(username)`; `profiles_search_idx gin (username gin_trgm_ops) where discoverable`.
- RLS on `SELECT`: own row, **or** (`profile_visibility='public'` and not blocked either way), **or** (`'friends'` and an accepted friendship exists). Hidden statistics are nulled by the `get_profile(username)` RPC, not by RLS, because RLS is row-level.
- Writes: `update_profile(patch jsonb)` and `change_username(new citext)` only.
- **Email is never stored here.** It lives only in `auth.users`.

### 3.2 `user_settings` (synced preferences)

`user_id uuid PK`, `settings jsonb not null`, `rev`, `server_seq`, `updated_at`.

- The payload is the **synced subset** of `settingsSchema`, and the same Zod schema validates it on pull.
- Device-local keys are excluded: `ai.*`, `focus.volume`, `focus.sound`, `reducedMotion`, and the `theme` override when the device is set to *follow account*.
- Merge policy: per-key last-writer-wins by `client_updated_at`.

## 4. Phase 3 — Synced user content

> **Superseded in implementation by ADR-017 (2026-11-26):** records are stored as validated JSON in one owner-scoped table, `public.synced_records`, with one generic merge (`private.apply_mutation`). The merge rules below (§4.3) are implemented as written, minus `base_rev`; the per-table DDL is not. See `supabase/migrations/20261126070000_sync.sql`.

Every table below uses the §2 conventions. Columns mirror the Zod schemas one-to-one (snake_case).

| Table | Mirrors (Dexie / Zod) | Notable columns and constraints | Merge policy |
|---|---|---|---|
| `campaigns` | `campaigns` / `campaignSchema` | `status` enum; `start_date date`, `end_date date check (end_date >= start_date)`; `hours_per_day numeric(4,2) check (> 0 and <= 16)`; `workdays smallint[]` | field-level 3-way merge; text fields → conflict record |
| `questlines` | `questlines` | FK `(user_id, campaign_id) → campaigns` | field LWW |
| `milestones` | `milestones` | FK `(user_id, questline_id)`; `deadline_locked bool` | field LWW; **locked deadline wins** over unlocked edits |
| `quests` | `quests` / `questSchema` | all quest fields; `server_first_seen_at timestamptz not null default now()` (**anti-cheat input**); FK `(user_id, campaign_id)` etc. nullable | 3-way field merge; `notes`/`description` → conflict preview; `status` derived from completion events |
| `quest_dependencies` | `quest.dependencies[]` | PK `(user_id, quest_id, depends_on_id)`; both columns are composite FKs → `quests(user_id, id)`; `check (quest_id <> depends_on_id)`; cycle check in RPC | replaced as a set inside the quest mutation |
| `subtasks` | `subtasks` | FK `(user_id, quest_id)` | row LWW |
| `recurrences` | `recurrences` | | field LWW |
| `quest_completion_events` | new local table `questCompletionEvents` | `event_id uuid` PK with `user_id`; `quest_id`; `kind enum('complete','reopen')`; `occurred_at timestamptz` (client); `received_at` (server) | **append-only, idempotent**; quest status = latest event by `(occurred_at, event_id)` |
| `focus_sessions` | `focusSessions` | `started_at`, `ended_at`, `actual_minutes numeric check (>= 0)`; **`exclude using gist (user_id with =, tstzrange(started_at, ended_at) with &&)`**: no overlapping sessions | insert-only; deletes are tombstones |
| `time_blocks` | `timeBlocks` | `check (end_time > start_time)` | row LWW |
| `reviews` | `reviews` | id like `daily:2026-11-25` | text fields → conflict preview |
| `rewards`, `redemptions` | same | `cost int check (> 0)` | LWW / insert-only |
| `local_xp_events` | `xpEvents` | `unique (user_id, source_key)`; **untrusted local ledger**, used only so other devices show the same *local* XP | insert-once; `revoked` = latest by event time |
| `achievement_unlocks` | `achievements` | local unlocks; untrusted | insert-once |
| `sync_mutations` | — | PK `(user_id, mutation_id uuid)`; `result jsonb`; `received_at`; purged after 30 days | idempotency record |

**Not synced:**

- `activity`: a device-local log; it would cost storage for little value.
- The device-local settings keys.
- The `cloudCache`, `outbox`, `syncState` and `syncConflicts` client tables.

### 4.1 `quests` DDL (representative)

```sql
create table public.quests (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128),
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '' check (char_length(description) <= 10000),
  category public.quest_category not null default 'main',
  difficulty public.difficulty not null default 'medium',
  priority public.priority not null default 'medium',
  status public.quest_status not null default 'todo',          -- derived; maintained by RPC
  estimated_minutes integer not null default 60 check (estimated_minutes between 0 and 100000),
  actual_minutes integer not null default 0 check (actual_minutes between 0 and 1000000),
  xp_reward integer check (xp_reward between 0 and 100000),     -- LOCAL display only; ignored by verified XP
  due_date date, scheduled_date date, scheduled_time time,
  deadline_locked boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 20000),
  tags text[] not null default '{}' check (cardinality(tags) <= 30),
  links jsonb not null default '[]',                            -- validated: [{label,url}] with https?/mailto
  skill_ids text[] not null default '{}',
  campaign_id text, questline_id text, milestone_id text, recurrence_id text,
  recurrence_date date, deliverable text, optional boolean not null default false,
  origin public.quest_origin not null default 'manual', template_key text,
  user_edited boolean not null default false, "order" double precision not null default 0,
  completed_at timestamptz, archived_at timestamptz,
  server_first_seen_at timestamptz not null default now(),
  rev integer not null default 1, server_seq bigint not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  client_updated_at timestamptz, deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, campaign_id)  references public.campaigns  (user_id, id),
  foreign key (user_id, questline_id) references public.questlines (user_id, id),
  foreign key (user_id, milestone_id) references public.milestones (user_id, id)
);
create index quests_pull_idx on public.quests (user_id, server_seq);
create index quests_campaign_idx on public.quests (user_id, campaign_id) where deleted_at is null;
alter table public.quests enable row level security;
create policy quests_owner_read on public.quests for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.quests from authenticated, anon;
```

`(select auth.uid())` is wrapped in a subquery so Postgres evaluates it once per statement (initplan), not once per row. This is Supabase's documented RLS performance practice.

### 4.2 Sync RPCs

| Function | Signature | Behaviour |
|---|---|---|
| `sync_push` | `(client_schema int, mutations jsonb) returns jsonb` | Rejects `client_schema` below the minimum with `upgrade_required`. Takes the per-user advisory lock. For each mutation: skip if `sync_mutations` already has it (return the stored result); validate its shape with `jsonb_matches_schema`-style checks or explicit casts; apply the table policy; record the result. Max 200 mutations or 512 KB per call. |
| `sync_pull` | `(after_seq bigint, max_rows int default 500) returns jsonb` | For `auth.uid()`: rows from each synced table with `server_seq > after_seq`, merged and ordered by `server_seq`, capped. Returns `{rows, next_seq, has_more}`. Tombstones are included. |
| `sync_status` | `() returns jsonb` | Row counts per table, max `server_seq`, storage estimate for the user. Feeds the Settings → Cloud sync panel. |

### 4.3 Three-way merge for quests and campaigns

Each push of an `update` carries `base_rev`, the changed `fields` and their `base` values (the pre-image captured by the middleware). Server algorithm, per changed field *f*:

1. If `current.rev = base_rev`, apply.
2. Else if `current.f = base.f` (the server hasn't touched *f* since the base), apply. This is a non-conflicting concurrent edit.
3. Else if `current.f = fields.f`, it's a no-op (both sides made the same change).
4. Else, **conflict**:
   - scalar fields: server value kept by default (first writer wins), with a conflict record returned to the client;
   - `notes`, `description`, `title`: never auto-merged; both versions returned for the **conflict preview** UI.

Locked-deadline rule: an incoming change to `due_date` on a row with `deadline_locked = true` is rejected unless the same mutation sets `deadline_locked = false`. That mirrors 1.0's "never move locked deadlines without explicit confirmation".

**Deletes.** A tombstone always wins over a concurrent edit. The losing edit is returned as a conflict offering **Restore**, which pushes a new revision that clears `deleted_at`. Deleted rows therefore never silently reappear.

## 5. Phase 5 — Verified XP and leaderboards

### 5.1 Canonical rules (server constants)

`private.xp_rules`:

```
difficulty → base XP: trivial 10, easy 25, medium 50, hard 100, boss 250, legendary 500
```

These equal `DEFAULT_SETTINGS.difficultyXp` in `src/domain/types.ts`. User multipliers and `xp_reward` overrides are ignored. A shared JSON fixture (`supabase/tests/fixtures/xp_rules.json`) is asserted by both Vitest and pgTAP so client and server can't drift.

### 5.2 `verified_xp_ledger`

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` | FK auth.users, cascade |
| `id` | `bigint generated always as identity` | |
| `source_kind` | `enum ('quest','focus','bonus')` | `bonus` = verified campaign completion (Phase 5b) |
| `source_id` | `text` | quest id / focus session id |
| `amount` | `integer check (amount between 0 and 500)` | |
| `occurred_at` | `timestamptz` | client-claimed, clamped to `[server_first_seen_at, received_at]` |
| `received_at` | `timestamptz default now()` | |
| `week_start` | `date` | `date_trunc('week', occurred_at at time zone 'UTC')` |
| `month_start` | `date` | |
| `status` | `enum ('credited','revoked','capped','rejected')` | |
| `reason` | `text` null | e.g. `quest_too_new`, `daily_cap`, `stale_offline` |

- **`unique (user_id, source_kind, source_id)`.** This is *the* duplicate-reward guarantee. The credit function uses `insert … on conflict do update set status = 'credited' where ledger.status = 'revoked'`, so re-completion restores rather than duplicates.
- RLS: owner can `SELECT` (to explain "why didn't this count?"). No writes.
- Indexes: `(user_id, received_at)` for daily-cap checks.

### 5.3 Credit rules, applied inside `sync_push` when a `complete` event arrives

1. Quest exists, is owned, isn't deleted, and `origin` isn't `revision`. Revision quests earn **no verified XP**: auto-generated filler.
2. `received_at - server_first_seen_at >= interval '10 minutes'`. This blocks create-and-complete spam. A quest created offline counts from when the server first saw it.
3. `occurred_at >= now() - interval '7 days'`. Older completions are credited locally only, with reason `stale_offline`.
4. Caps per UTC day: **1,500 verified quest XP**, **≤ 3 boss**, **≤ 1 legendary per ISO week**. Excess is `capped`, with an amount of 0.
5. Account age ≥ 24 h and email verified (or OAuth) for leaderboard *visibility*. Credits still accrue.
6. Focus: verified focus minutes per day are capped at 8 h. A session must not overlap another (the exclusion constraint) and must have `ended_at <= received_at`. Focus XP is **not** part of leaderboard XP; focus has its own capped board metric.

### 5.4 `leaderboard_scores` (precomputed, atomic)

```sql
create table public.leaderboard_scores (
  period_kind  public.period_kind not null,    -- 'week' | 'month' | 'all'
  period_start date not null,                  -- '1970-01-01' for 'all'
  user_id uuid not null references auth.users(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  quests integer not null default 0,
  focus_minutes integer not null default 0,
  reached_at timestamptz not null default now(),   -- when xp last increased → tie-break
  eligible boolean not null default false,          -- = profile opted in and not flagged (denormalized, P0-04)
  primary key (period_kind, period_start, user_id)
);
-- Partial covering index: rank counts become index-only scans (spike P0-04: p95 17.6 ms at 100k users).
create index lb_rank_idx on public.leaderboard_scores
  (period_kind, period_start, xp desc, reached_at asc, user_id) where eligible;
```

- Updated in the **same transaction** as each ledger change (`+= delta`, `reached_at = now()` when the delta is positive).
- **Ties:** equal XP is ranked by `reached_at` ascending (whoever got there first), then by `user_id` for total determinism.
- `eligible` is updated by a trigger on `profiles` when `leaderboard_opt_in` or `flagged` changes. That's a rare write; it avoids joining `profiles` in every rank count.
- **Reads** go through `get_leaderboard(kind, metric, period_start, after_xp, after_reached_at, after_user, limit)` (keyset pagination) and `get_rank_around_me(kind, metric, period_start)`. The rank number is `1 + count(*) of strictly better rows`, which the `lb_rank_idx` index serves. Both are `SECURITY DEFINER`, filter to `leaderboard_opt_in and not flagged and not blocked`, and return `{rank, username, display_name, avatar_id, title, xp, rank_delta}` only.
- No direct `SELECT` for `authenticated`.

### 5.5 `leaderboard_snapshots` and period close

- `leaderboard_snapshots(period_kind, period_start, snapshot_date, user_id, rank, xp)`, PK `(period_kind, period_start, snapshot_date, user_id)`.
- pg_cron runs daily at 00:05 UTC. It snapshots the **top 500** of each current period plus every friend-graph member. That gives the rank delta (`rank_delta` = yesterday's rank − today's) without unbounded growth.
- Weekly and monthly close jobs freeze the final standings into snapshots. Old period rows are kept for 12 months, then purged.

### 5.6 `audit_events` and anomaly flags

- `audit_events(id bigint identity, user_id uuid null, actor uuid null, kind text, detail jsonb, created_at)`. It is append-only. Only the service role can read it. It is purged after 180 days.
- Recorded events: cap hits, rejected credits, username changes, profile visibility changes, reports, blocks, account deletion requests.
- `profiles.flagged boolean`. It is set automatically when a user hits the daily cap on 5 of 7 days, or when z-score(daily verified XP) > 4 against their own 30-day history. While flagged, the user is hidden from public boards; their own view shows "Under automated review". Unflagging is manual via the dashboard; this is documented as an operational limitation.

## 6. Phase 6 — Social

| Table | Key columns | Constraints | RLS |
|---|---|---|---|
| `friend_requests` | `id uuid`, `from_user`, `to_user`, `status enum('pending','accepted','declined','cancelled')`, `created_at` | `check (from_user <> to_user)`; partial unique `(least(from,to), greatest(from,to)) where status='pending'` | parties can `SELECT`; writes via `send_friend_request`, `respond_friend_request` (checks `friend_requests_from`, blocks, ≤ 20 pending outgoing, ≤ 50 sends/day) |
| `friendships` | `user_low uuid`, `user_high uuid`, `since` | PK `(user_low, user_high)`, `check (user_low < user_high)` (canonical ordering → one row per pair) | members `SELECT`; delete via `remove_friend` |
| `user_blocks` | `blocker`, `blocked`, `created_at` | PK `(blocker, blocked)` | blocker only; blocking deletes friendship and pending requests in the same transaction |
| `notifications` | `id uuid`, `user_id`, `kind`, `payload jsonb`, `read_at`, `created_at` | index `(user_id, created_at desc)`; purged after 60 days | owner `SELECT`, `mark_notifications_read(ids)` |
| `abuse_reports` | `id`, `reporter`, `subject_user`, `reason enum`, `detail` ≤ 500, `created_at` | ≤ 10/day per reporter | insert via RPC; service role reads |

**Friends leaderboard:** `get_friends_leaderboard(kind, period_start)` joins `friendships` and `leaderboard_scores`, includes the caller, and ignores `leaderboard_opt_in`. Friends see each other unless one has `profile_visibility = 'private'`.

## 7. Phase 7 — Guilds (later)

| Table | Notes |
|---|---|
| `guilds` | `id uuid`, `slug citext unique`, `name`, `description`, `owner_id`, `visibility`, `max_members int default 30`, `created_at` |
| `guild_members` | PK `(guild_id, user_id)`; `role enum('owner','moderator','member')`; `joined_at`; **one guild per user** (`unique (user_id)`) |
| `guild_membership_log` | append-only join/leave history (anti-hopping evidence) |
| `guild_challenges` | `guild_id`, `title`, `metric`, `target`, `starts_on`, `ends_on`; created by owner or moderator |
| `guild_period_scores` | PK `(guild_id, period_kind, period_start)`; `xp`; updated from verified credits |

**Anti-exploit rules:**

- Only XP credited **while a member** and **at least 72 h after joining** counts for a guild.
- Contributions stay with the guild for that period when a member leaves. They are not transferable.
- After leaving, there is a 7-day cooldown before joining another guild.
- Guild scores are a sum of member credits; they can't be set or transferred.

## 8. Table-by-phase summary (what is genuinely needed)

| Phase | New tables |
|---|---|
| 2 Auth | `profiles`, `user_settings`, `private.reserved_usernames`, `private.avatar_catalog` |
| 3 Sync | `campaigns`, `questlines`, `milestones`, `quests`, `quest_dependencies`, `subtasks`, `recurrences`, `quest_completion_events`, `focus_sessions`, `time_blocks`, `reviews`, `rewards`, `redemptions`, `local_xp_events`, `achievement_unlocks`, `sync_mutations` |
| 4 Profiles | none (columns added to `profiles`); `verified_achievements` view/function |
| 5 Leaderboards | `verified_xp_ledger`, `leaderboard_scores`, `leaderboard_snapshots`, `audit_events` |
| 6 Social | `friend_requests`, `friendships`, `user_blocks`, `notifications`, `abuse_reports` |
| 7 Guilds | `guilds`, `guild_members`, `guild_membership_log`, `guild_challenges`, `guild_period_scores` |

**Rejected from the prompt's candidate list:**

- `user_progress`: level and XP are derived from the ledger; storing them would create a second source of truth. A cached column can be added later if profiling demands it.
- `achievements`: definitions stay in code (`ACHIEVEMENTS`). A server copy is only the `verifiable` subset as a SQL function.
- `sync_operations`: replaced by `sync_mutations`, which serves as the idempotency record.

## 9. Client-side (Dexie) schema v3

Add to `src/db/schema.ts` as `SCHEMA_V3 = { ...SCHEMA_V2, ... }` with an `upgrade` that touches no existing rows:

| Table | Index spec | Purpose |
|---|---|---|
| `outbox` | `++seq, &mutationId, table, createdAt` | captured mutations awaiting push |
| `syncState` | `key` | `lastSeq`, `lastSyncAt`, `userId`, `clientSchema` |
| `syncConflicts` | `id, table, recordId, createdAt` | unresolved conflicts for the review UI |
| `questCompletionEvents` | `eventId, questId, occurredAt` | append-only completion/reopen events |
| `cloudCache` | `key` | last leaderboard/profile responses for offline viewing |

Synced records gain an optional `syncRev?: number` (the server revision last seen). The Zod schemas get `.passthrough()`-safe optional fields so v1/v2 backups still validate.

## 10. Migration strategy

- **Tooling:** Supabase CLI. Migrations live in `supabase/migrations/<UTC timestamp>_<name>.sql`, forward-only and reviewed in PRs.
- **CI:** start the local stack (`supabase start`), apply all migrations from zero, run `supabase test db` (pgTAP), then run the sync and leaderboard E2E specs against it.
- **Production:** apply with `supabase db push` from a manually dispatched workflow using `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` secrets, never on every merge. Back up first with `pg_dump`; the free plan has no automatic backups (COST §5).
- **Expand/contract:** add columns as nullable or defaulted first, ship the client, backfill, then add constraints. `sync_push` rejects clients older than `min_client_schema` (stored in `private.config`) with `upgrade_required`, which triggers the existing PWA "Update available" prompt.
- **Local Dexie:** v3 is additive. Rolling back the client (older deploy) leaves v3 tables unused. Dexie refuses to open a newer DB with older code, so `deploy.yml` should never deploy a client older than the DB version it created. Recorded as risk R-7 in IMPLEMENTATION.
