# ASCEND 2.0 — Architecture Decision Records

> Status legend: **Accepted** (approved by the project owner, 2026-11-25) · **Rejected** (alternative recorded for context).

| ADR | Decision | Status |
|---|---|---|
| 001 | Keep IndexedDB/Dexie as the working DB; Postgres is a synced replica | Accepted |
| 002 | Supabase as the backend (Auth + Postgres + one Edge Function) | Accepted |
| 003 | Capture sync mutations with a Dexie DBCore middleware, not per-service code | **Accepted, confirmed by spike P0-01** |
| 004 | OAuth PKCE with `detectSessionInUrl: false` and a pre-router callback handler | Accepted (confirm in spike P0-02) |
| 005 | Account-scoped local databases with reload-on-switch | Accepted |
| 006 | **Google + guest only.** No email/password, no password reset, no email delivery | **Accepted** |
| 007 | **No username login.** Usernames are for display and search | **Accepted** |
| 008 | Two XP ledgers: local (configurable) vs verified (server rules) | Accepted |
| 009 | No retroactive verified XP for imported guest history | Accepted |
| 010 | Sync `local_xp_events` (option A) | Accepted by default: not one of the 8 owner questions; recommendation adopted, easy to change before P3 |
| 011 | Leaderboards on precomputed period scores in Postgres; no Redis | **Accepted, confirmed by spike P0-04** (with denormalized `eligible`) |
| 012 | **Stay on GitHub Pages** | **Accepted** (owner delegated the choice) |
| 013 | **Keep WebLLM**, self-hosting its library so CSP `script-src 'self'` holds | **Accepted** |
| 014 | Predefined avatars and frames only; no uploads | Accepted |
| 015 | UTC periods for leaderboards; local-time display | Accepted |
| 016 | Per-table conflict policies (no global last-write-wins) | Accepted |
| 017 | Writes only through `SECURITY DEFINER` RPCs; no direct DML grants | Accepted |
| 018 | Guilds deferred to Phase 7; no chat | Accepted |

---

### ADR-001 — IndexedDB stays primary
**Context.** All 1.0 screens read Dexie through live queries (`src/hooks/data.ts`). Offline-first is a hard requirement.
**Decision.** Keep Dexie as the UI's source of truth. Add a background sync to Postgres.
**Alternatives.**
- Supabase as primary with an offline cache. *Rejected:* it would rewrite every hook and service and lose instant writes.
- A CRDT library (Yjs/Automerge). *Rejected:* heavy and opaque for relational data, and it complicates server-side validation of XP.

**Consequences.** Sync logic is ours to build and test, and it is the most valuable portfolio component. Conflict handling is explicit.

### ADR-002 — Supabase
**Context.** The requirements are managed auth (no custom password storage), real constraints and transactions for XP integrity, and ₹0.
**Decision.** Supabase free plan.
**Alternatives.** Firebase, Appwrite, Cloudflare D1, self-hosting. See COST §7.
**Consequences.** Limits are 500 MB, pausing and no backups. Mitigated in COST §5. All logic stays portable SQL.

### ADR-003 — DBCore middleware capture
**Context.** There are about 50 mutation functions across `src/services/*.ts`. Adding sync calls to each is error-prone, and new code would forget it.
**Decision.** A `db.use({ stack: 'dbcore', name: 'sync-capture', create })` middleware intercepts `mutate` requests (`add`, `put`, `delete`, `deleteRange`) on synced tables. It writes `outbox` rows **inside the same transaction**. Pre-images for field-level merge come from a `getMany` inside the middleware.
**Alternatives.** Dexie hooks (`creating`/`updating`/`deleting`). *Rejected:* the deleting hook is not invoked by `Table.clear()` (used by `restoreBackup`), so deletions would be missed. DBCore middleware sees every low-level mutation, including range deletes. Verify both behaviours with a spike test before committing (CHECKLIST P3-01).
**Risks.** Middleware bugs affect every write. Mitigations: an exhaustive unit test that runs **every existing service test** with the middleware enabled and asserts the outbox contents; disabled for guest and demo DBs.

### ADR-004 — OAuth on GitHub Pages with a hash router
**Context.** `HashRouter` routes look like `#/campaigns`. supabase-js's implicit-flow detection can misread hash fragments, and there is a known issue where routes containing `#access_token=` are treated as callbacks.
**Decision.**
- Use the PKCE flow with `redirectTo = <origin><BASE>?auth=callback`. The code arrives in the **query string**, before `#`.
- `src/cloud/callback.ts` runs in `main.tsx` before React mounts. It calls `exchangeCodeForSession`, then `history.replaceState` to `<BASE>#/`.
- `detectSessionInUrl: false`.

**Alternatives.** Switching to `BrowserRouter` plus a `404.html` redirect hack on Pages. *Rejected:* it is fragile with the service worker and changes every URL.
**Verification.** E2E test against the local Supabase stack's OAuth emulation, or a mocked token endpoint.

### ADR-005 — Account-scoped local databases
**Decision.** DB names are `ascend` (guest), `ascend-demo`, and `ascend-u-<uid>`. Switching reloads the page. This mirrors the proven `setDemoMode` mechanism (`src/db/schema.ts`).
**Why.** `db` is a module-level import in every service. Threading a handle through would touch every file. A reload guarantees no stale handles or live queries.
**Trade-off.** Sign-in and sign-out cost a page reload; measure it in Phase 2.

### ADR-006 — Google + guest only (ACCEPTED)
**Decision (owner).** Accounts are created and accessed only with Google. Guest mode remains the no-account option. There are no passwords, no password reset, no email verification and no email delivery.
**Consequences.**
- Removes the SMTP/domain cost conflict, credential stuffing, password-reset enumeration and the CAPTCHA dependency.
- Users without a Google account can still use everything offline as guests; they cannot sync or appear on leaderboards.
- Re-authentication for sensitive actions means a fresh Google sign-in (SECURITY §4.1).
**Revisit if.** Users ask for non-Google accounts. Adding email/password later is additive: Supabase supports linking identities.

### ADR-007 — No username login (ACCEPTED)
**Decision (owner).** Sign-in is Google only. Usernames are unique public handles for profiles, search and leaderboards, never credentials. There is no `username-login` Edge Function.

### ADR-008 — Two XP ledgers
**Decision.** The local `xpEvents` stays exactly as is: multipliers, overrides, offline, guest. The server's `verified_xp_ledger` uses fixed rules, caps and windows, and is the only input to ranks. The UI labels both clearly.
**Consequence.** Users may see two numbers. The profile explains the difference. This is honest, and it avoids "punishing" local customization.

### ADR-009 — No retroactive verification
**Decision.** Guest history imported at sign-up does **not** earn verified XP. It can't be verified after the fact, and allowing it would let anyone import a forged backup to the top of the board.
**Alternative.** Credit the last 7 days of imported completions, subject to caps. *Rejected:* forged-backup risk.

### ADR-010 — Sync local XP ledger (OPEN)
- Option A: sync `local_xp_events`. Exact local XP on every device; ~25% more storage.
- Option B: rebuild local XP on each device from synced completion events plus the device's current multipliers. Less storage, but local XP can differ across devices if multiplier settings differed at completion time.

**Recommendation.** A for fidelity while the user count is small. Revisit if storage binds.

### ADR-011 — Ranking in Postgres
**Decision.** Precomputed `leaderboard_scores` per period, updated atomically with each credit. Reads use a covering index and keyset pagination; rank = `1 + count(better)`. No Redis.
**Evidence to collect.** `EXPLAIN (ANALYZE, BUFFERS)` on local Postgres with seeded 10k and 100k users. Introduce caching only if p95 exceeds the target in IMPLEMENTATION §5.

### ADR-012 — Stay on GitHub Pages (ACCEPTED)
**Decision.** The owner delegated the choice. **GitHub Pages** is chosen:
- the live URL, deploy workflow and post-deploy `verify-live` check already exist and pass
- it keeps the stack to one provider fewer
- with Google-only sign-in, the main thing missing headers would protect against (clickjacking of credential forms) no longer exists

**Accepted limitation.** No `frame-ancestors`/HSTS control; mitigated by typed confirmation plus fresh re-auth for destructive actions.
**Revisit if.** Real-user launch at scale, or a need for server-side headers. Cloudflare Pages (free) supports `_headers`, and the build is portable (`BASE_PATH=/`).

### ADR-013 — Keep WebLLM, self-hosted (ACCEPTED)
**Decision (owner).** Keep WebLLM. Implement option C: add `@mlc-ai/web-llm` as a dependency, loaded through a lazy `import()` chunk that is excluded from the PWA precache. This replaces the runtime `https://esm.run` import in `src/ai/providers.ts`, so `script-src 'self'` holds. Model weights still download at first use via `connect-src` to pinned model hosts.
**Cost.** A larger lazy chunk, which only users who enable WebLLM download.

### ADR-014 — No avatar uploads
Predefined sigils plus unlockable frames. This avoids storage cost, moderation and malicious-file handling. Revisit with a moderation plan if demanded.

### ADR-015 — UTC periods
Weekly boards use UTC ISO weeks; monthly boards use UTC months. They are displayed in local time ("resets Mon 05:30 IST").
**Why.** One global board needs one boundary. Per-user timezone boards fragment rankings.
**Streaks** use the profile timezone, with a 30-day change cooldown to stop "timezone hopping".

### ADR-016 — Per-table conflict policies

| Data | Policy |
|---|---|
| Completion events, focus sessions, XP ledgers, redemptions | Append-only, idempotent |
| Quests, campaigns | Three-way field merge; text conflicts → preview |
| Locked deadlines | Lock wins |
| Deletes | Tombstone wins + "Restore" offer |
| Settings | Per-key LWW |
| Subtasks, time blocks | Row LWW |
| Recurring instances | Deterministic IDs, `on conflict do nothing` |

### ADR-017 — RPC-only writes
No `INSERT/UPDATE/DELETE` grants on synced tables. All writes go through `sync_push` and other definer functions, which enforce idempotency, ordering locks, merge policy and XP rules. RLS is a second, independent wall.

### ADR-018 — Guilds later, no chat
Guilds come in Phase 7, after friends and leaderboards prove the integrity model. Chat is excluded: moderation, realtime quotas and safety obligations are too much for a ₹0 solo project.

---

## Owner decisions (2026-11-25)

| # | Question | Answer |
|---|---|---|
| 1 | Email/password? | No. Google + guest only; no password reset (ADR-006) |
| 2 | Username login? | No. Google or guest (ADR-007) |
| 3 | Hosting | Delegated → stay on GitHub Pages (ADR-012) |
| 4 | WebLLM | Keep, self-hosted bundle (ADR-013) |
| 5 | Leaderboard default | Opt-in, as proposed ("yes" to the proposal) |
| 6 | Caps (1,500 XP/day, 3 boss/day, 1 legendary/week) | Yes |
| 7 | Encrypted nightly `pg_dump` artifacts | Yes |
| 8 | Weekly keep-alive ping | Yes |

---

## Phase 0 spike results (2026-11-26)

### P0-01: Dexie DBCore middleware capture (ADR-003) — **confirmed**

Evidence: `src/sync/dbcore-capture.spike.test.ts`, 7/7 passing. It runs the **unmodified** service functions through a prototype middleware.

| Write path | Captured? |
|---|---|
| `createQuest` / `updateQuest` (changed fields only, e.g. `title`, `updatedAt`) | ✅ |
| `completeQuest` / `reopenQuest`: transactions that never list `outbox` | ✅ via transaction-scope widening |
| `Collection.modify()` and deletes (`deleteQuests` cleans dependencies and subtasks) | ✅ |
| Bulk writes (`bulkUpdateQuests`, `activatePlan`) | ✅ |
| `restoreBackup` → `Table.clear()` | ✅ as `deleteRange` (the case Dexie hooks miss) |
| Aborted transaction | ✅ outbox rolls back with the data (atomic) |
| Writes while applying a pull | ✅ skipped via a marker table in the transaction scope (no echo) |

**New finding, now part of the design.** Services open transactions scoped to specific tables (e.g. `db.transaction('rw', db.quests, db.xpEvents, …)`), so `outbox` is normally out of scope. The middleware must override DBCore `transaction(stores, mode)` to append `outbox` to every read-write transaction that touches a synced table. Pull application is detected by including a dedicated marker table (`syncApplyMarker`) in the transaction scope.

### P0-04: Ranking queries (ADR-011) — **confirmed, with a schema change**

Local PostgreSQL 16.15 in this development sandbox, **not** Supabase's free-tier instance (re-measure there in P5). Data:

- 100,000 users, 70% opted in, 0.2% flagged
- weekly XP skewed so there are only 1,501 distinct values (heavy ties)
- 30 runs per query, server execution time from `EXPLAIN (ANALYZE)`

| Query | p50 | p95 | Target (p95) |
|---|---|---|---|
| First page (50 rows), join to `profiles` for eligibility | 1.55 ms | 1.75 ms | < 30 ms ✅ |
| Keyset page at rank ~50,000 | 7.36 ms | 10.19 ms | < 30 ms ✅ |
| *OFFSET page at 50,000 (contrast)* | *108.24 ms* | *127.89 ms* | — |
| Rank of last-placed user, `count(*)` with join | 37.86 ms | 44.71 ms | < 30 ms ❌ |
| **Same, with denormalized `eligible` + partial index** | **12.46 ms** | **17.63 ms** | < 30 ms ✅ |

The last row was an index-only scan over 69,998 rows with 0 heap fetches.

**Decisions:**

- Keyset pagination is mandatory: OFFSET is about 15× slower at depth.
- `leaderboard_scores` gains `eligible boolean`, maintained when `leaderboard_opt_in` or `flagged` change, and `lb_rank_idx` becomes a partial index `where eligible`.
- Per-viewer blocks can't be denormalized. Blocked users are hidden from the rows a viewer sees, but they still count toward rank numbers (documented in the "How ranking works" sheet).

### P0-03: local Supabase + pgTAP in CI

The `database` job was added to `.github/workflows/ci.yml` (`supabase db start` + `supabase test db`, CLI pinned at 2.122.1) with `supabase/tests/000_smoke.test.sql`. First CI runs (PR #8): **66 s and 80 s** for the whole job, including starting the local stack. Both green.

### P0-02: Google OAuth on Pages (ADR-004) — **pending owner setup**

This can't run in CI or this sandbox: it needs real Google consent from a person. It requires the steps in `docs/OPERATIONS.md` §1–2. It will be verified on the live site as the first task of Phase 2, behind `VITE_ENABLE_ACCOUNTS`.


## Phase 1 results — theme completion (2026-11-26)

**Where the plan changed, and why:**

- **Appearance mirror (P1-06):** written from `useThemeSync` in `App.tsx`, not from `updateSettings`. Settings also change through backup restore, the demo seeder and (from P2) account switches. The hook sees the applied result of every path, while `updateSettings` sees only one. It uses one JSON key, `ascend.appearance` (`{theme, accent, motion}`), and writes only once the real settings have loaded, never while defaults are showing.
- **`useResolvedTheme` (P1-05):** lives in `src/lib/theme.ts`. It follows the `light` class on `<html>` through `useSyncExternalStore`, so it always matches what the CSS uses.
- **Tokens (P1-02):** only the tokens that replaced a real literal were added: `--scrim --overlay --highlight --highlight-strong --shine --shine-soft --shine-gold --gold-{hi,lo,ink} --fill-{emerald,cyan,crimson}-from --swatch-*`. The rest of the planned list (rarity, quest-type, input and status tokens) had no literal to replace. They will be added when a feature needs them, rather than as unused tokens.
- **Quick toggle (P1-09):** placed in the sidebar footer and the command palette. The sidebar avatar is a plain link, with no menu to put it in. It cycles dark → light → system.
- **Preview tiles (P1-08):** the token blocks are now `:root, .theme-dark` and `:root.light, .theme-light`, so any element can render either theme.
- **Light gold button:** the light `--gold-*` gradient is darker and uses white ink. `contrast.test.ts` checks the ink at the label band's edges.

**Pre-paint script CSP hash (for P7):** `sha256-cXmjqsrKm41TNGVOOpiHqDcc0KyYt6wlOx2SBQycTUw=`. Recompute it if the script in `index.html` changes.

**Accessibility bugs the new axe test found (all pre-existing, all fixed):**

| Finding | Fix |
|---|---|
| Settings switches, number inputs and selects had no accessible name; the visible row label wasn't associated | `ControlLabelContext`: `Row` provides its label/hint ids, and `Input`/`Select`/`Textarea`/`Switch` use them as `aria-labelledby`/`aria-describedby` unless given a name explicitly |
| Colored tag chips (text on its own 12% tint) were 3.9–4.4:1 | `--c-*` shifted (dark indigo/crimson; all six in light). `contrast.test.ts` now checks chips on `--bg`, `--surface` and `--surface-2` |
| Done quests in the calendar and dashboard timeline used `opacity` (≈1.2–2:1) | Muted text + strikethrough instead. **Rule: never dim text with opacity.** |
| FullCalendar event text was white in light theme | `--fc-event-text-color: var(--fg)` |
| Light `--fg-dim` was 4.47:1 on the calendar's today tint | `#6d6979` → `#625e6e` |
| Loading skeleton, skill rank pips: `aria-label` on a role-less `div` | `role="status"` / `role="img"` |
| Analytics heatmap scroll area was unreachable by keyboard | `tabIndex=0`, `role="region"`, label |
| FullCalendar "+N more" had `aria-expanded` on an `<a>` without `href` | `role="button"` via `moreLinkDidMount` |

**Exit measurements:**

- `npm run lint:colors`: 0 literals. The only exception is `Avatar.tsx`, through an explicit pragma: its crest hues are artwork.
- `contrast.test.ts`: 80/80, both themes × 6 accents.
- axe (WCAG 2.0/2.1 A + AA, *all* impacts, not only serious/critical): **0 violations on 15 screens × 2 themes**. That is the 14 routes plus a campaign's detail page, with a full-page screenshot attached per screen.
- Lighthouse 12.6.1 accessibility, desktop, demo data: **100 on all 7 sampled screens in both themes** (`/`, `/today`, `/campaigns`, `/calendar`, `/skills`, `/analytics`, `/settings`).
- Unit tests: 158/158. e2e: 8/8 (4 existing journeys + 4 theme specs).

## Phase 2 results — auth and identity (2026-11-26)

**Status:** built and tested **behind `VITE_ENABLE_ACCOUNTS` (off)**, so the live site is unchanged. The owner deferred the Google OAuth client and the Supabase Auth settings (OPERATIONS §2), so the live Google round-trip (P0-02) is still unverified. Everything after the Google redirect is tested end to end against a local Supabase stack in CI.

**Where the plan changed, and why:**

- **Delete-account freshness (P2-11)** uses the JWT `amr[].timestamp`, the time of the original sign-in, not `iat`. Every hourly token refresh resets `iat`, so an `iat` check would accept a session that last saw Google weeks ago. The check lives in `supabase/functions/delete-account/freshness.ts` and is unit-tested.
- **Edge Function has no npm dependencies.** It makes two `fetch` calls to the Auth REST API (`GET /auth/v1/user`, `DELETE /auth/v1/admin/users/:id`) instead of importing supabase-js, so no third-party code ever holds the service-role key. It also cold-starts faster. Verified locally: no token → 401; fresh session → 204, auth user gone (404), profile removed by cascade.
- **`main.tsx` imports the app dynamically,** after `handleOAuthCallback()`. The Dexie `db` instance is created when `schema.ts` is first imported, so the callback must pick the account database first. Selection lives in the Dexie-free `src/db/accounts.ts`, which also rejects malformed stored ids, so no arbitrary database names.
- **The Gate shows only on a first run** (not onboarded, no session, no earlier guest choice). Existing 1.0 guests never see it; they sign in from Settings → Account.
- **Username claim (P2-07/P2-09)** is a screen before onboarding rather than an extra onboarding step, so the 1.0 onboarding stays byte-for-byte the same for guests. It can be skipped ("Choose later" → Settings → Account).
- **profiles columns (P2-05):** the Phase 2 subset plus `leaderboard_opt_in` (default `false`), which the claim form needs. `avatar_id` is a foreign key to `private.avatar_catalog`. A `BEFORE` trigger enforces reserved names and display-name cleaning even for writes made directly as the table owner (dashboard). `check_username_available` and `claim_username` share one rate-limit bucket (30/min).
- **supabase-js (2.119.0) is kept out of the service-worker precache** (`globIgnores`), so guests never download it. It is cached on first use (`CacheFirst`), so signed-in users still boot offline. All Supabase API traffic is `NetworkOnly`.
- **The dist secrets check (P2-13)** decodes every JWT in `dist/` and fails on `role: service_role`, and fails on any `sb_secret_…` key. A plain `grep service_role` can't see inside base64. Proven by planting the local demo service key: the check fails.
- **Accounts are disabled in demo mode,** whose database is sample data.
- **No Google logo on the button** for now: the colour-literal gate forbids its fixed brand colours. Before turning accounts on, the button should follow Google's sign-in branding guidelines, using the official asset under a documented exception.
- **Deferred to P3:** "remove this account's journal from this device" on sign-out. It needs the outbox count to warn about unsynced changes. Signing out keeps the account database for next time; deleting the account removes it.
- **New workflow:** `supabase-deploy.yml` (manual; dry run by default) applies migrations and deploys the function. `deploy.yml` passes the three `VITE_*` repository variables.

**Exit measurements:**

- pgTAP: **37/37**: smoke (3) + identity (34). The identity tests try to break the rules: RLS isolation, no direct writes, anon locked out, helpers not callable, reserved names, case-insensitive takeover, a second claim, rate limit at call 31, a trigger bypass as the owner, cascade on delete.
- Accounts E2E (`e2e/auth.spec.ts`, local stack): **6/6**:
  - Gate, plus offline disabling Google
  - callback `error=access_denied` and an invalid code, with the URL cleaned
  - guest → session → account database → claim → onboarding → reload → Settings → sign out → guest journal intact
  - username taken (other case)
  - delete account: server and device
  - a session that ended elsewhere → guest + notice

  axe is clean on the Gate, the claim screen and Settings → Account.
- 1.0 journeys: **4/4 on the default build and 4/4 on the accounts build.**
- Unit: **185/185**: account database selection (8), callback (6), config, username rules and freshness (13).
