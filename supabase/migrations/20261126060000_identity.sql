-- ASCEND 2.0 · Phase 2 · Identity (docs/ASCEND_2_DATABASE.md §3.1, ADR-006/007)
--
-- Security model:
--   * anon: nothing.
--   * authenticated: SELECT its own profile row (RLS). No direct INSERT/UPDATE/DELETE.
--   * All writes go through SECURITY DEFINER RPCs with search_path = '' and fully qualified names.
--   * Helpers and reference tables live in schema `private`, which PostgREST does not expose.
--   * Email is never copied out of auth.users.

create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ───────────────────────── reference data ─────────────────────────

create table private.reserved_usernames (name extensions.citext primary key);
insert into private.reserved_usernames (name) values
  ('admin'), ('administrator'), ('root'), ('support'), ('help'), ('ascend'), ('moderator'), ('mod'),
  ('system'), ('null'), ('undefined'), ('api'), ('auth'), ('login'), ('logout'), ('signin'), ('signup'),
  ('settings'), ('profile'), ('u'), ('me'), ('leaderboards'), ('leaderboard'), ('friends'), ('guilds'),
  ('today'), ('campaigns'), ('board'), ('timeline'), ('calendar'), ('skills'), ('focus'), ('achievements'),
  ('analytics'), ('reviews'), ('archive'), ('new'), ('anonymous'), ('guest'), ('official'), ('staff');

-- Mirrors AVATARS in src/components/game/Avatar.tsx.
create table private.avatar_catalog (id text primary key);
insert into private.avatar_catalog (id) values
  ('sigil-blade'), ('sigil-shield'), ('sigil-arcane'), ('sigil-compass'),
  ('sigil-quill'), ('sigil-circuit'), ('sigil-ember'), ('sigil-lunar');

-- Sliding-window rate limiting for RPCs.
create table private.rate_hits (
  user_id uuid        not null,
  bucket  text        not null,
  hit_at  timestamptz not null default now()
);
create index rate_hits_lookup on private.rate_hits (user_id, bucket, hit_at);

-- ───────────────────────── helpers ─────────────────────────

create function private.assert_authenticated() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return uid;
end $$;

-- Raises SQLSTATE PT429 (PostgREST → HTTP 429) when the caller exceeds `max_hits` in `win`.
create function private.rate_limit(bucket text, max_hits integer, win interval) returns void
language plpgsql set search_path = '' as $$
declare uid uuid := private.assert_authenticated(); n integer;
begin
  delete from private.rate_hits r where r.user_id = uid and r.bucket = rate_limit.bucket and r.hit_at < now() - win;
  select count(*) into n from private.rate_hits r where r.user_id = uid and r.bucket = rate_limit.bucket;
  if n >= max_hits then
    raise exception 'rate_limited' using errcode = 'PT429', hint = 'Too many requests. Try again in a minute.';
  end if;
  insert into private.rate_hits (user_id, bucket) values (uid, rate_limit.bucket);
end $$;

-- Trim, strip control/format characters, collapse whitespace, cap length.
create function private.clean_display_name(raw text) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(raw, ''), '[[:cntrl:]​-‏‪-‮⁦-⁩﻿]', '', 'g'), '\s+', ' ', 'g')), 40), '')
$$;

-- ───────────────────────── profiles ─────────────────────────

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  -- Stored lowercase: citext's ~ is case-insensitive, so compare the text form.
  username            extensions.citext unique check (username::text ~ '^[a-z0-9_]{3,20}$'),
  display_name        text not null default 'Adventurer' check (char_length(display_name) between 1 and 40),
  avatar_id           text not null default 'sigil-compass' references private.avatar_catalog (id),
  leaderboard_opt_in  boolean not null default false,
  username_changed_at timestamptz,
  created_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

-- 'available' | 'taken' | 'reserved' | 'invalid' — no side effects, no rate limit (used by the trigger too).
create function private.username_status(candidate text, for_user uuid) returns text
language sql stable set search_path = '' as $$
  select case
    when candidate is null or candidate !~ '^[a-z0-9_]{3,20}$' then 'invalid'
    when exists (select 1 from private.reserved_usernames r where r.name = candidate::extensions.citext) then 'reserved'
    when exists (select 1 from public.profiles p where p.username = candidate::extensions.citext and p.id is distinct from for_user) then 'taken'
    else 'available'
  end
$$;

-- Defence in depth: the same rules hold even for writes that bypass the RPCs (e.g. the dashboard).
create function private.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.display_name := coalesce(private.clean_display_name(new.display_name), 'Adventurer');
  if new.username is not null and (tg_op = 'INSERT' or new.username is distinct from old.username) then
    new.username := lower(new.username::text)::extensions.citext;
    if exists (select 1 from private.reserved_usernames r where r.name = new.username) then
      raise exception 'username_reserved' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before insert or update on public.profiles
  for each row execute function private.profiles_guard();

-- Every new auth user gets a profile; the username is claimed later (UsernameClaim.tsx).
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      private.clean_display_name(new.raw_user_meta_data ->> 'full_name'),
      private.clean_display_name(new.raw_user_meta_data ->> 'name'),
      'Adventurer'
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ───────────────────────── RPCs ─────────────────────────

create function public.check_username_available(name text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.assert_authenticated();
begin
  perform private.rate_limit('username', 30, interval '1 minute');
  return private.username_status(lower(btrim(name)), uid);
end $$;

-- First claim only. Changing a username (30-day cooldown) arrives in Phase 4.
create function public.claim_username(name text, display_name text default null, leaderboard_opt_in boolean default false)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.assert_authenticated();
  wanted text := lower(btrim(name));
  st text;
  result public.profiles;
begin
  perform private.rate_limit('username', 30, interval '1 minute');
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  if exists (select 1 from public.profiles p where p.id = uid and p.username is not null) then
    raise exception 'username_already_set' using errcode = 'P0001';
  end if;
  st := private.username_status(wanted, uid);
  if st <> 'available' then
    raise exception 'username_%', st using errcode = 'P0001';
  end if;

  begin
    update public.profiles p
       set username = wanted::extensions.citext,
           display_name = coalesce(private.clean_display_name(claim_username.display_name), p.display_name),
           leaderboard_opt_in = coalesce(claim_username.leaderboard_opt_in, false)
     where p.id = uid
     returning p.* into result;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001'; -- lost a race with another claim
  end;

  if result.id is null then
    raise exception 'profile_missing' using errcode = 'P0001';
  end if;
  return result;
end $$;

-- Functions are executable by PUBLIC by default in Postgres: lock everything down, then grant explicitly.
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.check_username_available(text) from public, anon;
revoke execute on function public.claim_username(text, text, boolean) from public, anon;
grant execute on function public.check_username_available(text) to authenticated;
grant execute on function public.claim_username(text, text, boolean) to authenticated;
