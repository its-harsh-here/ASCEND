# ASCEND — Operations Guide

Setup and operating procedures for the ASCEND 2.0 cloud features. Only the project owner can do these steps, because they involve accounts and secrets.

> **Never share secrets in chat or commit them.**
> - Public values (Supabase URL, anon/publishable key) may be shared or stored as GitHub **variables**.
> - Secrets (Google client secret, Supabase `service_role` key, database password, access tokens) go only into the Supabase dashboard or GitHub **secrets**.

**Project:**

| | |
|---|---|
| Supabase project URL | `https://elzeoihdahambhqbfveh.supabase.co` |
| Project ref | `elzeoihdahambhqbfveh` |
| Live site | `https://its-harsh-here.github.io/ASCEND/` |

---

## 1. Public Supabase configuration (needed for Phase 2) — ✅ done 2026-11-26

1. Supabase dashboard → **Project Settings → API Keys**. Copy the **anon / publishable** key. It is public by design: Row Level Security protects data, not this key.
2. GitHub → repository **Settings → Secrets and variables → Actions → Variables** tab → **New repository variable**:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://elzeoihdahambhqbfveh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon/publishable key |

Use the *Variables* tab, not Secrets: these values end up in the public JavaScript bundle anyway.

**Do not** copy the `service_role` / secret key anywhere in this repo.

## 2. Google sign-in (ADR-006: the only account method)

### 2.1 Google Cloud OAuth client

1. Open https://console.cloud.google.com → create a project (e.g. "ASCEND").
2. **Google Auth Platform → Branding** (the OAuth consent screen):
   - App name: `ASCEND`; user support email: yours.
   - App home page: `https://its-harsh-here.github.io/ASCEND/`.
   - Authorized domains: `github.io` and `supabase.co`.
3. **Audience:** User type **External**. With only the basic scopes below, you can publish the app to **In production** so any Google user can sign in. In *Testing*, only listed test users can sign in, and their sessions expire after 7 days.
4. **Data access (scopes):** `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` only. These are non-sensitive, so no Google verification review is required.
5. **Clients → Create client** → Application type **Web application**:
   - **Authorized JavaScript origins:**
     - `https://its-harsh-here.github.io`
     - `http://localhost:4173`
     - `http://localhost:5173`
   - **Authorized redirect URIs:** `https://elzeoihdahambhqbfveh.supabase.co/auth/v1/callback`
6. Copy the **Client ID** and **Client secret**.

### 2.2 Supabase Auth settings

1. **Authentication → Sign In / Providers → Google:** enable it, paste the Client ID and Client secret, and save. The secret stays in Supabase; never share it.
2. **Authentication → Sign In / Providers → Email:** **disable** (ADR-006). The repo's `supabase/config.toml` enables email only for the *local* test stack.
3. **Authentication → URL Configuration:**
   - Site URL: `https://its-harsh-here.github.io/ASCEND/`
   - Redirect URLs, exactly these three, no wildcards:
     - `https://its-harsh-here.github.io/ASCEND/?auth=callback`
     - `http://localhost:4173/?auth=callback`
     - `http://localhost:5173/?auth=callback`

## 3. Database migrations (needed before the first Phase 2 migration reaches production)

Production migrations run only from a manually triggered workflow, never on every merge. Add these as GitHub **Secrets**:

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → Generate new token |
| `SUPABASE_DB_PASSWORD` | the database password you set when creating the project (Project Settings → Database to reset it) |

And one more **variable** (not a secret): `SUPABASE_PROJECT_REF` = `elzeoihdahambhqbfveh`.

Then: GitHub → **Actions → "Supabase — apply migrations and functions" → Run workflow**.
- First run with **Apply** unchecked: a dry run that only lists the pending migrations.
- Then run again with **Apply** checked: it applies `supabase/migrations/*` and deploys the `delete-account` Edge Function.

## 4. Turning accounts on (Phase 2 — after §2 and §3)

Accounts ship **off**. A build without the flag is exactly the guest-only app, so nothing changes for anyone until you do this:

1. Complete §2 (Google + Supabase Auth settings) and §3 (migrations applied).
2. Add the repository **variable** `VITE_ENABLE_ACCOUNTS` = `true`.
3. Actions → **Deploy to GitHub Pages → Run workflow** (or merge any PR).
4. On the live site: Settings → Account → **Continue with Google**. You should come back signed in, at "Choose your username".

To turn accounts off again, delete the variable (or set it to `false`) and redeploy. Guest data is never touched: guests keep the 1.0 database `ascend`, and each account gets its own `ascend-u-<id>` database on the device.

## 5. Backups (Phase 3, owner-approved)

The free plan has no automatic backups. `.github/workflows/backup.yml` runs every night at 02:47 IST, and on demand from Actions:

1. It dumps roles, schema and data with `supabase db dump`.
2. It encrypts them with [age](https://age-encryption.org) to **your public key**.
3. It keeps the encrypted file as a private workflow artifact for 90 days. Plaintext never leaves the runner.

Until it's configured, the workflow skips with a notice.

### Setup

1. Generate a key pair **on your own machine**:

   ```bash
   age-keygen -o ascend-backup.key
   ```

   Keep `ascend-backup.key` (the private key) offline, e.g. in your password manager. Only it can decrypt the backups. If you lose it, the backups are unreadable.
2. Add the printed **public** key (`age1…`) as the repository **variable** `BACKUP_AGE_RECIPIENT`. It's a public key, so a variable is fine.
3. The workflow also uses the §3 secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) and the `SUPABASE_PROJECT_REF` variable.

### Restoring

1. Actions → *Nightly encrypted backup* → pick a run → download the artifact, then unzip it to get `ascend-<date>.tgz.age`.
2. Decrypt and unpack it:

   ```bash
   age -d -i ascend-backup.key ascend-<date>.tgz.age | tar xz
   ```

   This gives you `roles.sql`, `schema.sql` and `data.sql`.
3. Into a **fresh** project (or a local stack), apply the migrations (§3), then:

   ```bash
   psql "$DB_URL" -c "truncate private.synced_tables, private.text_fields, private.config, private.reserved_usernames, private.avatar_catalog cascade"
   ```

   ```bash
   psql "$DB_URL" -v ON_ERROR_STOP=1 -f data.sql
   ```

   The migrations re-seed those reference tables, and the dump carries them too, hence the truncate. The dump disables triggers while loading, so server sequence numbers and timestamps are restored exactly. Devices keep syncing from where they were.

### Restore drill

`scripts/backup-drill.sh` runs the whole cycle against the **local** stack:

1. counts the rows
2. dumps the data the same way the workflow does
3. age-encrypts it
4. wipes the database
5. decrypts and restores
6. compares row counts, a checksum of every synced record, and the sync cursor

```bash
bash scripts/backup-drill.sh
```

**Last run: 2026-11-26.** PASSED: 61 auth users, 61 profiles, 124 synced records (3 tombstones) and `sync_seq` 8361, all identical after restore. The encrypted backup was 80 KB. Run the drill again whenever the schema changes.

### Housekeeping

`private.sync_purge()` deletes idempotency records older than 30 days and tombstones older than 90 days. A device that was offline for more than 90 days would then miss deletions; it re-downloads after signing in again. Scheduling it arrives with the Phase 8 keep-alive. Until then, run it monthly from the SQL editor:

```sql
select private.sync_purge();
```

## 6. Keep-alive (owner-approved)

Free projects pause after 7 days without activity. A weekly workflow calls a read-only `health()` RPC with the public anon key. If the project is paused anyway, resume it from the Supabase dashboard. The app keeps working offline from IndexedDB in the meantime.

## 7. Local development and testing

Everything runs against a local Supabase stack in Docker. These are the CLI's **well-known demo keys**, never production ones.

```bash
npx supabase@2.122.1 start -x studio,imgproxy,logflare,vector,supavisor,realtime,storage-api,mailpit,postgres-meta
```

```bash
npx supabase@2.122.1 test db
```

```bash
eval "$(npx supabase@2.122.1 status -o env | sed 's/^/export SBX_/')"
SB_ANON_KEY="$SBX_ANON_KEY" SB_SERVICE_ROLE_KEY="$SBX_SERVICE_ROLE_KEY" npx playwright test -c playwright.accounts.config.ts
```

1. The first command starts Postgres, Auth, the API gateway and the Edge Functions runtime.
2. The second runs the pgTAP tests in `supabase/tests/`.
3. The third builds the app with accounts enabled against the local stack (port 4174) and runs `e2e/auth.spec.ts` plus the 1.0 guest journeys on that build.

The local stack enables the email provider **only** as a test seam, so tests can create sessions without Google. CI runs the same steps in the `database` job of `.github/workflows/ci.yml`.

To try the accounts UI by hand: `VITE_ENABLE_ACCOUNTS=true VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<local ANON_KEY> npm run dev`. Google sign-in won't work locally unless you configure a Google client in `supabase/config.toml`.
