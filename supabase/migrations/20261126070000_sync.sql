-- ASCEND 2.0 · Phase 3 · Cloud sync (ADR-017: one owner-scoped record store + one generic merge)
--
-- Every synced client record lives here as validated JSON, keyed by (user_id, tbl, id).
-- The server never trusts these records for anything public: verified XP and leaderboards (Phase 5)
-- are computed into separate, server-owned tables. Security model as in identity.sql:
--   * authenticated: SELECT own rows (RLS); no direct DML.
--   * all writes through sync_push (SECURITY DEFINER, search_path '', per-user advisory lock).

create sequence private.sync_seq;

-- Synced client tables (keep in step with SYNCED_TABLES in src/sync/tables.ts).
create table private.synced_tables (
  name        text primary key,
  insert_only boolean not null default false   -- append-only ledgers: later updates are rejected
);
insert into private.synced_tables (name, insert_only) values
  ('settings', false), ('campaigns', false), ('questlines', false), ('milestones', false), ('quests', false),
  ('subtasks', false), ('recurrences', false), ('timeBlocks', false), ('reviews', false), ('rewards', false),
  ('redemptions', true), ('focusSessions', false), ('xpEvents', false), ('achievements', true),
  ('questCompletionEvents', true);

-- Free-text fields that are never auto-merged: a concurrent edit becomes a conflict with both versions.
create table private.text_fields (tbl text, field text, primary key (tbl, field));
insert into private.text_fields values
  ('quests', 'title'), ('quests', 'description'), ('quests', 'notes'),
  ('campaigns', 'name'), ('campaigns', 'objective'), ('campaigns', 'constraints'),
  ('reviews', 'wins'), ('reviews', 'blockers'), ('reviews', 'lessons'), ('reviews', 'notes');

create table public.synced_records (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  tbl            text        not null references private.synced_tables (name),
  id             text        not null check (char_length(id) between 1 and 128),
  data           jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 65536),
  rev            integer     not null default 1,
  server_seq     bigint      not null,
  first_seen_at  timestamptz not null default now(),  -- server receipt time: anti-cheat input for Phase 5
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,                          -- tombstone (kept so other devices learn of the delete)
  primary key (user_id, tbl, id)
);
create index synced_records_pull_idx on public.synced_records (user_id, server_seq);

alter table public.synced_records enable row level security;
alter table public.synced_records force row level security;
create policy synced_records_owner_read on public.synced_records
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.synced_records from public, anon, authenticated;
grant select on public.synced_records to authenticated;

create function private.sync_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_seq := nextval('private.sync_seq');
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.rev := old.rev + 1;
    new.first_seen_at := old.first_seen_at;
  end if;
  return new;
end $$;
create trigger synced_records_stamp before insert or update on public.synced_records
  for each row execute function private.sync_stamp();

-- Idempotency: a replayed mutation returns its stored result instead of applying twice.
create table private.sync_mutations (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  mutation_id uuid        not null,
  result      jsonb       not null,
  received_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);
create index sync_mutations_age_idx on private.sync_mutations (received_at);

create table private.config (key text primary key, value jsonb not null);
insert into private.config values ('min_client_schema', '1'), ('max_records_per_user', '50000');

-- ───────────────────────── merge ─────────────────────────

-- Apply one mutation. Returns the result object stored in sync_mutations.
--   m = { mutation_id, table, id, op: 'upsert'|'delete', fields: {..}, base: {..}, restore?: bool }
-- Field rules (docs/ASCEND_2_DATABASE.md §4.3, without base_rev — the base values carry the same information):
--   current = base  → apply     (the server hasn't changed it since this device last saw it)
--   current = mine  → no-op     (both sides made the same change)
--   otherwise       → conflict: the server value is kept; text fields return both versions for review.
-- Tombstones win over concurrent edits unless the mutation explicitly restores.
create function private.apply_mutation(uid uuid, m jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  t text := m ->> 'table';
  rid text := m ->> 'id';
  op text := m ->> 'op';
  fields jsonb := coalesce(m -> 'fields', '{}'::jsonb);
  base jsonb := coalesce(m -> 'base', '{}'::jsonb);
  cur public.synced_records;
  ins_only boolean;
  next_data jsonb;
  f text;
  mine jsonb;
  theirs jsonb;
  conflicts jsonb := '[]'::jsonb;
  applied integer := 0;
  n integer;
begin
  select s.insert_only into ins_only from private.synced_tables s where s.name = t;
  if not found then return jsonb_build_object('status', 'rejected', 'reason', 'unknown_table'); end if;
  if rid is null or char_length(rid) not between 1 and 128 then return jsonb_build_object('status', 'rejected', 'reason', 'bad_id'); end if;
  if op not in ('upsert', 'delete') or jsonb_typeof(fields) <> 'object' or jsonb_typeof(base) <> 'object' then
    return jsonb_build_object('status', 'rejected', 'reason', 'bad_mutation');
  end if;
  if fields ? 'id' and fields ->> 'id' is distinct from rid then
    return jsonb_build_object('status', 'rejected', 'reason', 'id_mismatch');
  end if;

  select * into cur from public.synced_records r where r.user_id = uid and r.tbl = t and r.id = rid for update;

  -- ── delete ──
  if op = 'delete' then
    if not found then
      -- Never seen here (created and deleted offline): record the tombstone so other devices converge.
      insert into public.synced_records (user_id, tbl, id, data, deleted_at, server_seq)
      values (uid, t, rid, jsonb_build_object('id', rid), now(), 0);
    elsif cur.deleted_at is null then
      update public.synced_records r set deleted_at = now() where r.user_id = uid and r.tbl = t and r.id = rid;
    end if;
    return jsonb_build_object('status', 'applied');
  end if;

  -- ── insert ──
  if not found then
    select count(*) into n from public.synced_records r where r.user_id = uid;
    if n >= (select (c.value #>> '{}')::integer from private.config c where c.key = 'max_records_per_user') then
      return jsonb_build_object('status', 'rejected', 'reason', 'quota');
    end if;
    insert into public.synced_records (user_id, tbl, id, data, server_seq)
    values (uid, t, rid, jsonb_strip_nulls(fields || jsonb_build_object('id', rid)), 0);
    return jsonb_build_object('status', 'applied');
  end if;

  -- ── update of a deleted record: the tombstone wins unless this is an explicit restore ──
  if cur.deleted_at is not null and not coalesce((m ->> 'restore')::boolean, false) then
    return jsonb_build_object('status', 'conflict', 'conflicts', jsonb_build_array(jsonb_build_object('kind', 'deleted', 'mine', fields)));
  end if;
  if ins_only and cur.deleted_at is null then
    return jsonb_build_object('status', 'applied', 'noop', true); -- append-only: the first write stands
  end if;

  next_data := cur.data;
  for f in select jsonb_object_keys(fields) loop
    continue when f = 'id';
    mine := fields -> f;
    theirs := cur.data -> f;                 -- SQL NULL when absent
    -- Bookkeeping timestamps never conflict: the first createdAt stands, the newest updatedAt wins.
    if f = 'createdAt' and theirs is not null then
      continue;
    elsif f = 'updatedAt' and theirs is not null and cur.deleted_at is null then
      if jsonb_typeof(mine) = 'string' and jsonb_typeof(theirs) = 'string' and mine #>> '{}' > theirs #>> '{}' then
        next_data := jsonb_set(next_data, array[f], mine);
        applied := applied + 1;
      end if;
      continue;
    end if;
    if cur.deleted_at is not null then
      next_data := jsonb_set(next_data, array[f], mine);  -- restore: this device's version wins
      applied := applied + 1;
    elsif theirs is not distinct from mine or (theirs is null and mine = 'null'::jsonb) then
      null; -- same value already
    elsif (theirs is null and (not base ? f or base -> f = 'null'::jsonb)) or theirs = base -> f then
      -- Locked deadline (1.0 rule): moving it needs the same mutation to unlock.
      if f = 'dueDate' and t in ('quests', 'milestones') and coalesce((cur.data ->> 'deadlineLocked')::boolean, false)
         and coalesce((fields ->> 'deadlineLocked')::boolean, true) then
        conflicts := conflicts || jsonb_build_object('field', f, 'kind', 'locked', 'mine', mine, 'theirs', theirs);
      else
        next_data := jsonb_set(next_data, array[f], mine);
        applied := applied + 1;
      end if;
    else
      conflicts := conflicts || jsonb_build_object(
        'field', f,
        'kind', case when exists (select 1 from private.text_fields x where x.tbl = t and x.field = f) then 'text' else 'value' end,
        'mine', mine, 'theirs', theirs);
    end if;
  end loop;

  if applied > 0 or cur.deleted_at is not null then
    update public.synced_records r
       set data = jsonb_strip_nulls(next_data), deleted_at = null
     where r.user_id = uid and r.tbl = t and r.id = rid;
  end if;

  if jsonb_array_length(conflicts) > 0 then
    return jsonb_build_object('status', case when applied > 0 then 'partial' else 'conflict' end, 'conflicts', conflicts);
  end if;
  return jsonb_build_object('status', 'applied');
end $$;

-- ───────────────────────── RPCs ─────────────────────────

create function public.sync_push(client_schema integer, mutations jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.assert_authenticated();
  m jsonb;
  mid uuid;
  res jsonb;
  results jsonb := '[]'::jsonb;
begin
  if client_schema < (select (c.value #>> '{}')::integer from private.config c where c.key = 'min_client_schema') then
    raise exception 'upgrade_required' using errcode = 'P0001';
  end if;
  if jsonb_typeof(mutations) <> 'array' or jsonb_array_length(mutations) > 200 or pg_column_size(mutations) > 524288 then
    raise exception 'batch_too_large' using errcode = 'P0001', hint = 'At most 200 mutations or 512 KB per call.';
  end if;
  perform private.rate_limit('sync_push', 120, interval '1 minute');
  -- One writer per user at a time: server_seq order = commit order for this user, so pulls never skip rows.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  for m in select value from jsonb_array_elements(mutations) loop
    begin
      mid := (m ->> 'mutation_id')::uuid;
    exception when others then
      results := results || jsonb_build_object('mutation_id', m ->> 'mutation_id', 'status', 'rejected', 'reason', 'bad_mutation_id');
      continue;
    end;
    select s.result into res from private.sync_mutations s where s.user_id = uid and s.mutation_id = mid;
    if not found then
      res := private.apply_mutation(uid, m);
      insert into private.sync_mutations (user_id, mutation_id, result) values (uid, mid, res);
    end if;
    res := res || jsonb_build_object('mutation_id', mid);
    -- When the server kept (some of) its own values, send its CURRENT row back so the device resets its
    -- copy: such a record may not change again, so a later pull would never correct it. Computed now,
    -- not stored, so a replayed mutation also gets the current row.
    if res ->> 'status' in ('conflict', 'partial', 'rejected') then
      res := res || coalesce((
        select jsonb_build_object('row', jsonb_build_object('data', r.data, 'deleted', r.deleted_at is not null, 'seq', r.server_seq))
          from public.synced_records r
         where r.user_id = uid and r.tbl = m ->> 'table' and r.id = m ->> 'id'), '{}'::jsonb);
    end if;
    results := results || res;
  end loop;
  return jsonb_build_object('results', results);
end $$;

-- Rows changed after `after_seq`, oldest first. Keyset pagination on the global sequence.
create function public.sync_pull(after_seq bigint, max_rows integer default 500) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.assert_authenticated();
  lim integer := least(greatest(coalesce(max_rows, 500), 1), 1000);
  rows jsonb;
  n integer;
begin
  perform private.rate_limit('sync_pull', 240, interval '1 minute');
  -- The same per-user lock as sync_push: a pull never runs between a push's sequence allocation and commit.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select coalesce(jsonb_agg(jsonb_build_object(
           'table', r.tbl, 'id', r.id, 'data', r.data, 'rev', r.rev, 'seq', r.server_seq,
           'deleted', r.deleted_at is not null) order by r.server_seq), '[]'::jsonb), count(*)
    into rows, n
    from (select * from public.synced_records s
           where s.user_id = uid and s.server_seq > coalesce(after_seq, 0)
           order by s.server_seq limit lim + 1) r;
  if n > lim then
    rows := rows - lim;  -- drop the look-ahead row
  end if;
  return jsonb_build_object(
    'rows', rows,
    'next_seq', coalesce((rows -> -1 ->> 'seq')::bigint, coalesce(after_seq, 0)),
    'has_more', n > lim);
end $$;

create function public.sync_status() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'tables', coalesce((select jsonb_object_agg(tbl, n) from (
        select r.tbl, count(*) n from public.synced_records r
         where r.user_id = (select auth.uid()) and r.deleted_at is null group by r.tbl) x), '{}'::jsonb),
    'records', (select count(*) from public.synced_records r where r.user_id = (select auth.uid()) and r.deleted_at is null),
    'bytes', (select coalesce(sum(pg_column_size(r.data)), 0) from public.synced_records r where r.user_id = (select auth.uid())),
    'max_seq', (select coalesce(max(r.server_seq), 0) from public.synced_records r where r.user_id = (select auth.uid())),
    'quota_records', (select (c.value #>> '{}')::integer from private.config c where c.key = 'max_records_per_user'))
  where (select auth.uid()) is not null
$$;

-- Housekeeping (scheduled in Phase 8 / OPERATIONS): idempotency records older than 30 days,
-- tombstones older than 90 days (a device offline longer than that re-downloads everything).
create function private.sync_purge() returns void
language sql set search_path = '' as $$
  delete from private.sync_mutations where received_at < now() - interval '30 days';
  delete from public.synced_records where deleted_at < now() - interval '90 days';
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.sync_push(integer, jsonb) from public, anon;
revoke execute on function public.sync_pull(bigint, integer) from public, anon;
revoke execute on function public.sync_status() from public, anon;
grant execute on function public.sync_push(integer, jsonb) to authenticated;
grant execute on function public.sync_pull(bigint, integer) to authenticated;
grant execute on function public.sync_status() to authenticated;
