-- P0-03 smoke test: proves the local Supabase Postgres + pgTAP pipeline works in CI.
begin;
select plan(3);
select has_schema('public', 'public schema exists');
select has_schema('auth', 'Supabase auth schema exists');
select ok(
  (select count(*) from pg_extension where extname = 'pgtap') = 1,
  'pgTAP extension is available'
);
select * from finish();
rollback;
