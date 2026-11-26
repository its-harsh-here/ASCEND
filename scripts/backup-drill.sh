#!/usr/bin/env bash
# Restore drill (docs/OPERATIONS.md §5) against the LOCAL Supabase stack only:
#   dump (as the nightly workflow does) → age-encrypt → wipe the database → decrypt → restore → compare.
# Proves a backup can actually be restored, not just that one was taken. Never point this at production.
set -euo pipefail

SUPABASE="${SUPABASE:-npx --yes supabase@2.122.1}"
DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"   # local stack; hard-coded on purpose
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

counts() {
  psql "$DB" -Atc "
    select 'auth.users', count(*) from auth.users
    union all select 'auth.identities', count(*) from auth.identities
    union all select 'profiles', count(*) from public.profiles
    union all select 'synced_records', count(*) from public.synced_records
    union all select 'tombstones', count(*) from public.synced_records where deleted_at is not null
    union all select 'records_checksum', coalesce(sum(hashtext(data::text)::bigint), 0) from public.synced_records
    union all select 'sync_seq', last_value from private.sync_seq
    order by 1"
}

echo "1/5 Counting rows before the backup"
before="$(counts)"
echo "$before"

echo "2/5 Dumping and encrypting (age)"
$SUPABASE db dump --local --data-only -f "$work/data.sql" >/dev/null
tar czf "$work/backup.tgz" -C "$work" data.sql
age-keygen -o "$work/drill-key.txt" 2>/dev/null
age -r "$(age-keygen -y "$work/drill-key.txt")" -o "$work/backup.tgz.age" "$work/backup.tgz"
rm "$work/backup.tgz" "$work/data.sql"
echo "   encrypted backup: $(du -h "$work/backup.tgz.age" | cut -f1)"

echo "3/5 Wiping the database (fresh schema from migrations)"
$SUPABASE db reset >/dev/null

echo "4/5 Decrypting and restoring"
age -d -i "$work/drill-key.txt" -o "$work/backup.tgz" "$work/backup.tgz.age"
tar xzf "$work/backup.tgz" -C "$work"
# The migrations re-seed these reference tables; the dump carries them too.
psql "$DB" -q -v ON_ERROR_STOP=1 -c "truncate private.synced_tables, private.text_fields, private.config, private.reserved_usernames, private.avatar_catalog cascade"
psql "$DB" -q -v ON_ERROR_STOP=1 -f "$work/data.sql" >/dev/null

echo "5/5 Comparing"
after="$(counts)"
if diff <(echo "$before") <(echo "$after"); then
  echo "DRILL PASSED: every count, checksum and the sync cursor match."
else
  echo "DRILL FAILED: restored data differs (see diff above)." >&2
  exit 1
fi
