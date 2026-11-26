-- Phase 3 sync: isolation, idempotency, each merge policy, tombstones, pagination, limits.
begin;
select plan(51);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@example.test');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
-- One mutation, pushed alone; returns its result object.
create function pg_temp.push1(m jsonb) returns jsonb language sql as $$
  select (public.sync_push(1, jsonb_build_array(m)) -> 'results') -> 0
$$;
create function pg_temp.mut(mid text, tbl text, rid text, op text, fields jsonb, base jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('mutation_id', mid, 'table', tbl, 'id', rid, 'op', op, 'fields', fields, 'base', base)
$$;
create function pg_temp.rec(tbl text, rid text) returns jsonb language sql as $$
  select r.data from public.synced_records r where r.tbl = tbl and r.id = rid
$$;

-- ── privileges ──
select ok(not has_table_privilege('authenticated', 'public.synced_records', 'insert'), 'no direct INSERT');
select ok(not has_table_privilege('authenticated', 'public.synced_records', 'update'), 'no direct UPDATE');
select ok(not has_table_privilege('authenticated', 'public.synced_records', 'delete'), 'no direct DELETE');
select ok(not has_table_privilege('anon', 'public.synced_records', 'select'), 'anon cannot read');
select ok(not has_function_privilege('anon', 'public.sync_push(integer, jsonb)', 'execute'), 'anon cannot push');
select ok(not has_function_privilege('anon', 'public.sync_pull(bigint, integer)', 'execute'), 'anon cannot pull');
select ok(not has_function_privilege('authenticated', 'private.apply_mutation(uuid, jsonb)', 'execute'), 'merge internals not callable');

-- ── insert + idempotency ──
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000001', 'quests', 'q1', 'upsert',
  '{"id":"q1","title":"Learn SQL","notes":"base notes","difficulty":"medium","priority":"low","dueDate":"2026-12-01","deadlineLocked":false}')) ->> 'status',
  'applied', 'insert applied');
select is((select rev from public.synced_records where id = 'q1'), 1, 'new record rev 1');
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000001', 'quests', 'q1', 'upsert', '{"title":"REPLAYED"}', '{"title":"x"}')) ->> 'status',
  'applied', 'replayed mutation returns the stored result');
select is(pg_temp.rec('quests', 'q1') ->> 'title', 'Learn SQL', 'replayed mutation did not apply twice');
reset role;
select is((select count(*)::int from private.sync_mutations), 1, 'one idempotency record');

-- ── isolation ──
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.synced_records), 0, 'user B cannot see user A rows');
select is(jsonb_array_length(public.sync_pull(0) -> 'rows'), 0, 'user B pulls nothing of A');
select is(pg_temp.push1(pg_temp.mut('20000000-0000-0000-0000-000000000001', 'quests', 'q1', 'upsert', '{"title":"B owns q1 too"}')) ->> 'status',
  'applied', 'same id for another user is a separate record');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(pg_temp.rec('quests', 'q1') ->> 'title', 'Learn SQL', 'A''s record untouched by B');

-- ── field merge policies ──
-- 1. current = base → apply
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000002', 'quests', 'q1', 'upsert',
  '{"priority":"high"}', '{"priority":"low"}')) ->> 'status', 'applied', 'non-conflicting edit applies');
select is(pg_temp.rec('quests', 'q1') ->> 'priority', 'high', 'value updated');
select is((select rev from public.synced_records where id = 'q1'), 2, 'rev bumped');
-- 2. a concurrent edit to a different field merges cleanly (device 2 still has the old priority as base)
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000003', 'quests', 'q1', 'upsert',
  '{"difficulty":"hard"}', '{"difficulty":"medium"}')) ->> 'status', 'applied', 'disjoint concurrent edits both apply');
select results_eq($$ select pg_temp.rec('quests','q1') ->> 'priority', pg_temp.rec('quests','q1') ->> 'difficulty' $$,
  $$ values ('high', 'hard') $$, 'both fields kept');
-- 3. same change on both sides → no-op, no conflict
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000004', 'quests', 'q1', 'upsert',
  '{"priority":"high"}', '{"priority":"low"}')) ->> 'status', 'applied', 'identical concurrent change is not a conflict');
-- 4. scalar conflict → server keeps its value, conflict returned
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000005', 'quests', 'q1', 'upsert',
  '{"priority":"critical"}', '{"priority":"low"}')) -> 'conflicts' -> 0 ->> 'kind', 'value', 'scalar conflict reported');
select is(pg_temp.rec('quests', 'q1') ->> 'priority', 'high', 'first writer wins for scalars');
-- 5. text fields are never auto-merged; both versions come back
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000006', 'quests', 'q1', 'upsert',
  '{"notes":"device 1 notes"}', '{"notes":"base notes"}')) ->> 'status', 'applied', 'first notes edit applies');
select results_eq($$ select r ->> 'status', r -> 'conflicts' -> 0 ->> 'kind', r -> 'conflicts' -> 0 ->> 'mine', r -> 'conflicts' -> 0 ->> 'theirs'
    from (select pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000007', 'quests', 'q1', 'upsert',
      '{"notes":"device 2 notes"}', '{"notes":"base notes"}')) r) x $$,
  $$ values ('conflict', 'text', 'device 2 notes', 'device 1 notes') $$, 'concurrent notes edit → text conflict with both versions');
-- 6. partial: one field applies, one conflicts
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000008', 'quests', 'q1', 'upsert',
  '{"title":"Learn Postgres","notes":"stale"}', '{"title":"Learn SQL","notes":"base notes"}')) ->> 'status', 'partial', 'mixed result is partial');
select is(pg_temp.rec('quests', 'q1') ->> 'title', 'Learn Postgres', 'the clean field applied');
-- 7. removing a field (null) when unchanged on the server
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000009', 'quests', 'q1', 'upsert',
  '{"dueDate":null}', '{"dueDate":"2026-12-01"}')) ->> 'status', 'applied', 'clearing a field applies');
select ok(not (pg_temp.rec('quests', 'q1') ? 'dueDate'), 'null fields are stripped');

-- 8. bookkeeping timestamps never conflict (two devices created the same deterministic record)
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000021', 'quests', 'q1', 'upsert',
  '{"createdAt":"2030-01-01T00:00:00Z","updatedAt":"2030-01-02T00:00:00Z"}', '{}')) ->> 'status', 'applied', 'timestamps are not conflicts');
select pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000022', 'quests', 'q1', 'upsert', '{"createdAt":"2031-05-05T00:00:00Z","updatedAt":"2029-01-01T00:00:00Z"}', '{}'));
select is(pg_temp.rec('quests', 'q1') ->> 'createdAt', '2030-01-01T00:00:00Z', 'createdAt: the first value stands');
select is(pg_temp.rec('quests', 'q1') ->> 'updatedAt', '2030-01-02T00:00:00Z', 'updatedAt: the newest wins (an older one is ignored)');

-- ── locked deadline ──
select pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000010', 'milestones', 'm1', 'upsert', '{"title":"M","dueDate":"2026-12-10","deadlineLocked":true}'));
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000011', 'milestones', 'm1', 'upsert',
  '{"dueDate":"2026-12-20"}', '{"dueDate":"2026-12-10"}')) -> 'conflicts' -> 0 ->> 'kind', 'locked', 'moving a locked deadline is rejected');
select is(pg_temp.rec('milestones', 'm1') ->> 'dueDate', '2026-12-10', 'locked deadline unchanged');
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000012', 'milestones', 'm1', 'upsert',
  '{"dueDate":"2026-12-20","deadlineLocked":false}', '{"dueDate":"2026-12-10","deadlineLocked":true}')) ->> 'status', 'applied', 'unlock + move in one mutation is allowed');

-- ── tombstones ──
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000013', 'quests', 'q1', 'delete', '{}')) ->> 'status', 'applied', 'delete applied');
select isnt((select deleted_at from public.synced_records where id = 'q1' and user_id = '00000000-0000-0000-0000-0000000000a1'), null, 'tombstone kept, not removed');
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000014', 'quests', 'q1', 'upsert',
  '{"priority":"low"}', '{"priority":"high"}')) -> 'conflicts' -> 0 ->> 'kind', 'deleted', 'edit after delete → deleted conflict (tombstone wins)');
select isnt((select deleted_at from public.synced_records where id = 'q1' and user_id = '00000000-0000-0000-0000-0000000000a1'), null, 'still deleted');
select is(pg_temp.push1(jsonb_build_object('mutation_id', '10000000-0000-0000-0000-000000000015', 'table', 'quests', 'id', 'q1', 'op', 'upsert',
  'restore', true, 'fields', '{"id":"q1","title":"Restored","priority":"low"}'::jsonb, 'base', '{}'::jsonb)) ->> 'status', 'applied', 'explicit restore');
select is((select deleted_at from public.synced_records where id = 'q1' and user_id = '00000000-0000-0000-0000-0000000000a1'), null, 'restore clears the tombstone');
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000016', 'subtasks', 'never-synced', 'delete', '{}')) ->> 'status', 'applied', 'delete of an unknown id leaves a tombstone');

-- ── insert-only ledgers ──
select pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000017', 'questCompletionEvents', 'e1', 'upsert', '{"questId":"q1","kind":"complete","occurredAt":"2026-11-26T10:00:00Z"}'));
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000018', 'questCompletionEvents', 'e1', 'upsert', '{"kind":"reopen"}', '{"kind":"complete"}')) ->> 'noop', 'true', 'append-only rows ignore later updates');
select is(pg_temp.rec('questCompletionEvents', 'e1') ->> 'kind', 'complete', 'event unchanged');

-- ── validation ──
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000019', 'activity', 'x', 'upsert', '{}')) ->> 'reason', 'unknown_table', 'unsynced tables rejected');
select is(pg_temp.push1(pg_temp.mut('10000000-0000-0000-0000-000000000020', 'quests', 'q9', 'upsert', '{"id":"other"}')) ->> 'reason', 'id_mismatch', 'id in data must match');
select throws_ok($$ select public.sync_push(0, '[]') $$, 'P0001', 'upgrade_required', 'old clients told to upgrade');
select throws_ok($$ select public.sync_push(1, (select jsonb_agg(g) from generate_series(1, 201) g)) $$, 'P0001', 'batch_too_large', 'batch limit');

-- ── pull pagination ──
select results_eq($$ select (p ->> 'has_more')::boolean, jsonb_array_length(p -> 'rows') from (select public.sync_pull(0, 2) p) x $$,
  $$ values (true, 2) $$, 'first page capped, has_more');
select is((with p1 as (select public.sync_pull(0, 2) p),
               p2 as (select public.sync_pull((select (p ->> 'next_seq')::bigint from p1), 1000) p)
          select jsonb_array_length((select p -> 'rows' from p1)) + jsonb_array_length((select p -> 'rows' from p2))),
  (select count(*)::int from public.synced_records), 'two pages cover every row exactly once (tombstones included)');

select * from finish();
rollback;
