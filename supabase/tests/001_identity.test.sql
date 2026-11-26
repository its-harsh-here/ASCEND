-- Phase 2 identity: profiles, RLS, RPC-only writes, username rules, rate limiting.
begin;
select plan(34);

-- Users are created the way GoTrue does it: a row in auth.users fires on_auth_user_created.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', '{"full_name":"  Ada \u0007 Lovelace  "}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', '{"name":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.test', '{}');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;

-- ── profile creation ──
select results_eq($$ select display_name, username::text from public.profiles where id = '00000000-0000-0000-0000-00000000000a' $$,
  $$ values ('Ada Lovelace', null::text) $$, 'profile auto-created; display name trimmed and control chars stripped; no username yet');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'Bob', 'falls back to "name" metadata');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), 'Adventurer', 'default display name');
select hasnt_column('public', 'profiles', 'email', 'email is never copied into profiles');

-- ── schema hardening ──
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use schema private');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use schema private');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'insert'), 'no direct INSERT');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'update'), 'no direct UPDATE');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'delete'), 'no direct DELETE');
select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'anon cannot read profiles');
select ok(not has_function_privilege('anon', 'public.claim_username(text, text, boolean)', 'execute'), 'anon cannot claim');
select ok(not has_function_privilege('anon', 'public.check_username_available(text)', 'execute'), 'anon cannot check');
select ok(not has_function_privilege('authenticated', 'private.rate_limit(text, integer, interval)', 'execute'), 'helpers are not callable');
select is((select relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass), true, 'RLS forced');

-- ── RLS: only your own row ──
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select results_eq($$ select id::text from public.profiles $$, $$ values ('00000000-0000-0000-0000-00000000000a') $$, 'user A sees only their own profile');
select throws_ok($$ update public.profiles set display_name = 'x' $$, '42501', null, 'direct update denied');
select throws_ok($$ insert into public.profiles (id) values (gen_random_uuid()) $$, '42501', null, 'direct insert denied');

-- ── username availability ──
select is(public.check_username_available('ab'), 'invalid', 'too short');
select is(public.check_username_available('has space'), 'invalid', 'bad characters');
select is(public.check_username_available('Admin'), 'reserved', 'reserved, case-insensitive');
select is(public.check_username_available('  Ada_99  '), 'available', 'trimmed + lowercased before checking');

-- ── claiming ──
select is((public.claim_username('Ada_99', 'Countess Ada', true)).username::text, 'ada_99', 'claim stores lowercase');
select results_eq($$ select display_name, leaderboard_opt_in from public.profiles $$, $$ values ('Countess Ada', true) $$, 'claim sets display name and opt-in');
select throws_ok($$ select public.claim_username('another') $$, 'P0001', 'username_already_set', 'cannot claim twice (changes come in P4)');
select throws_ok($$ select public.claim_username('root') $$, 'P0001', 'username_already_set', 'already-set check runs first');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is(public.check_username_available('ADA_99'), 'taken', 'taken, case-insensitive');
select throws_ok($$ select public.claim_username('ADA_99') $$, 'P0001', 'username_taken', 'cannot take a claimed name in another case');
select throws_ok($$ select public.claim_username('moderator') $$, 'P0001', 'username_reserved', 'reserved name rejected');
select throws_ok($$ select public.claim_username('x!') $$, 'P0001', 'username_invalid', 'invalid name rejected');

-- ── rate limit: 30 per minute per user (B has used 4 above) ──
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select lives_ok($$ select public.check_username_available('free_name_' || g) from generate_series(1, 30) g $$, '30 checks allowed');
select throws_ok($$ select public.check_username_available('one_more') $$, 'PT429', 'rate_limited', '31st check in a minute is rejected');

-- ── anon ──
select pg_temp.act_as_anon();
select throws_ok($$ select public.check_username_available('anything') $$, '42501', null, 'anon cannot call RPCs');

-- ── trigger guards bypass attempts (as the table owner) ──
reset role;
select throws_ok($$ update public.profiles set username = 'Support' where id = '00000000-0000-0000-0000-00000000000c' $$,
  'P0001', 'username_reserved', 'reserved names blocked even for direct owner writes');

-- ── account deletion cascades ──
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 0, 'deleting the auth user removes the profile');

select * from finish();
rollback;
