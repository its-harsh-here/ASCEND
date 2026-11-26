# ASCEND 2.0 — Implementation Checklist

> Status: **APPROVED (2026-11-25).** Owner decisions applied: Google + guest only; GitHub Pages; WebLLM kept (self-hosted); leaderboards opt-in.
> - Each item is specific enough to implement without guessing; IDs are referenced in PRs.
> - "✔ test" names the test that proves the item.
> - Do not start a phase until the previous phase's **Exit** items are checked.

## P0 — Audit and spikes

- [ ] **P0-01** Create branch `spike/dbcore`. Add a middleware via `db.use({stack:'dbcore', name:'sync-capture', create})` that records `{type, table, keys, values}` for every `mutate` request into an in-memory array. ✔ test: run all of `src/services/services.test.ts` with it enabled, then assert that `deleteQuests`, `restoreBackup` (`clear` → `deleteRange`), `bulkUpdateQuests` and `activatePlan` are all captured inside the originating transaction.
- [ ] **P0-02** Create a scratch Supabase project. Enable Google, then set Redirect URLs to `http://localhost:4173/?auth=callback` and the Pages URL. In a branch, call `signInWithOAuth({ provider: 'google', options: { redirectTo, flowType: 'pkce' } })` with `detectSessionInUrl:false`. Confirm that `code` arrives in `location.search` with the SW active. Record the result in DECISIONS (ADR-004).
- [ ] **P0-03** Add `supabase/config.toml` via `supabase init`. Add a CI job running `supabase start && supabase test db` with one passing pgTAP file. Record the job duration.
- [ ] **P0-04** Seed 100k users into `leaderboard_scores` locally. Record `EXPLAIN (ANALYZE, BUFFERS)` for the keyset page and rank-around-me queries in DECISIONS (ADR-011).
- [ ] **P0 Exit:** the spike results are recorded, and ADR-003/004/011 are confirmed or revised.

## P1 — Theme completion

- [x] **P1-01** Create `src/lib/colors.ts` exporting `CAMPAIGN_COLORS` and `ACCENT_SWATCHES`. Replace `CAMPAIGN_HEX` (`src/features/campaigns/CampaignsPage.tsx:13`), `COLOR_HEX` (`src/features/campaigns/wizard/CampaignWizard.tsx:48`) and `ACCENT_HEX` (`src/features/settings/SettingsPage.tsx:32`). Values come from CSS vars `--campaign-<name>`, defined per theme in `index.css`.
- [x] **P1-02** Add these tokens to `src/styles/index.css` for `:root` and `:root.light`: `--scrim --overlay --highlight --input-bg --input-border --focus-ring --sidebar --xp --xp-glow --rarity-{common,rare,epic,legendary} --quest-{main,side,daily,weekly,boss,legendary} --success --warning --danger --info --c-bronze --c-silver --fill-{accent,emerald,gold,cyan,crimson}-{from,to}`.
- [x] **P1-03** Replace the color literals listed in UI/UX §4.2:
  - `primitives.tsx` (ProgressBar fills, Switch/Tabs highlights)
  - `button.tsx` (primary/gold variants)
  - `dialog.tsx`, `CommandPalette.tsx`, `Celebrations.tsx` (scrims)
  - `Shell.tsx`, `widgets.tsx`, `AchievementsPage.tsx`
  - `SkillTreePage.tsx:150` (MiniMap mask)
  - `App.tsx:95` (`theme-color`: read `getComputedStyle(root).getPropertyValue('--bg')`)
- [x] **P1-04** Create `scripts/check-color-literals.mjs`. It fails on `#rrggbb` and `rgb(` in `src/**/*.tsx` except `src/components/game/Avatar.tsx`. Wire it as `npm run lint:colors` in CI.
- [x] **P1-05** Create `src/hooks/useResolvedTheme.ts`, which returns `'light' | 'dark'` from settings and `matchMedia`. Use it in `SkillTreePage.tsx:137` `colorMode`.
- [x] **P1-06** In `updateSettings` (`src/services/core.ts`), after a successful put, write `localStorage['ascend:theme']` and `['ascend:accent']` (try/catch).
- [x] **P1-07** In `index.html`, add an inline `<script>` in `<head>` before CSS. It reads those keys plus `prefers-color-scheme`, sets the `light`/`dark` class and `data-accent` on `<html>`, and sets the `color-scheme` style. Remove the hardcoded `class="dark"`. Record its SHA-256 for the future CSP.
- [x] **P1-08** Add Appearance preview tiles (Light/Dark/System) in `SettingsPage.tsx`, rendered with scoped `data-theme-preview` classes that set the tokens locally.
- [x] **P1-09** Add a theme quick toggle to the sidebar avatar menu (`Shell.tsx`). It cycles light → dark → system, with an `aria-label` stating the current mode.
- [x] **P1-10** Audit `calendar.css` in light mode: check event text contrast on `ev-quest`/`ev-boss`/`ev-recurring` backgrounds, and adjust the mixes per theme.
- [x] **P1-11** Create `src/styles/contrast.test.ts`. Parse the token table, compute WCAG ratios, and assert text ≥ 4.5 and UI ≥ 3 for both themes.
- [x] **P1-12** Create `e2e/theme.spec.ts`:
  - no-flash: `addInitScript` records `documentElement.className` at `DOMContentLoaded`
  - `emulateMedia` system switching
  - axe on 14 routes × 2 themes (add devDependency `@axe-core/playwright` after approval)
  - full-page screenshots attached as artifacts
- [x] **P1 Exit:** literal check passes; contrast test passes; axe 0 serious/critical; Lighthouse a11y ≥ 98 in both themes (measured; record the numbers); all existing tests green.

> Done 2026-11-26. Where the implementation differs from the items above (mirror location, token subset, toggle placement, 15 screens), see *Phase 1 results* in ASCEND_2_DECISIONS.md.

## P2 — Auth and identity

- [x] **P2-01** `npm i @supabase/supabase-js` (pin the exact version). Create `src/cloud/supabase.ts` exporting `getSupabase(): SupabaseClient | null`. It returns null unless both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist. Client options: `{ auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } }`. Load it dynamically (`import()`) so guests never fetch it.
- [x] **P2-02** Create `src/cloud/callback.ts` with `handleOAuthCallback()`. If `location.search` has `auth=callback`:
  - with `code`: `exchangeCodeForSession(code)`
  - with `error`/`error_description`: store it for the Gate to display
  - always: `history.replaceState(null, '', BASE_URL + '#/')`

  Call it from `src/main.tsx` before `createRoot`. ✔ test: unit tests with mocked client for the success, error and offline cases.
- [x] **P2-03** In `src/db/schema.ts`, add `resolveDbName()` (demo → `ascend-demo`; `localStorage['ascend:account']` → `ascend-u-<uid>`; else `ascend`) and `setActiveAccount(uid|null)` (writes the key, reloads). Keep the `db` export as `new AscendDB(resolveDbName())`. ✔ test: unit test for each branch.
- [x] **P2-04** In `src/hooks/useSession.ts`, subscribe to `onAuthStateChange`. On `SIGNED_IN` with a different UID than the active DB, call `setActiveAccount`. On `SIGNED_OUT`, call `setActiveAccount(null)`. On refresh failure, set a `sessionExpired` flag (UI banner).
- [x] **P2-05** Migration `0001_identity.sql`:
  - `profiles` (`id`, `username citext unique` + regex check, `display_name`, `avatar_id`, `created_at`, `username_changed_at`)
  - RLS: owner read/update via RPC only; public read deferred to P4
  - `private.reserved_usernames` seeded with admin, root, support, ascend, moderator, system, null, undefined, api, auth and the route names
  - trigger `on auth.users insert` → `profiles` row with `username = null` (claimed later)
  - RPCs `claim_username(text)` and `check_username_available(text)`, rate-limited via `private.rate_hits` (30/min per user)

  ✔ test: `identity.test.sql`.
- [x] **P2-06** Create `src/features/auth/Gate.tsx`, rendered at `#/auth` outside `AppShell` (in `App.tsx`, routes before the shell):
  - **Continue with Google**, which calls `signInWithOAuth({ provider: 'google', options: { redirectTo: BASE + '?auth=callback' } })`
  - **Continue as guest**, which goes to the existing onboarding
  - a one-line explanation of what each option gives you
  - error region `role="alert"` for callback errors (cancelled, offline, provider error) with retry
  - reduced-motion-aware brand animation (UI/UX §3.2)
- [x] **P2-07** `src/features/auth/UsernameClaim.tsx`: shown after the first Google sign-in when `profiles.username is null`. Username (debounced availability via `check_username_available`), display name pre-filled from Google metadata, leaderboard opt-in (default off). Zod: `^[a-z0-9_]{3,20}$`, not reserved.
- [ ] **P2-08** (removed: no password reset under ADR-006)
- [x] **P2-09** Onboarding: when there's a session without a username, show a username-claim step before the existing steps (`Onboarding.tsx`).
- [x] **P2-10** Settings → Account:
  - Google email (read-only, from the session)
  - username with change cooldown (P4 adds the change flow)
  - sign out (+ "remove this account's data from this device", which warns with the outbox count once P3 exists)
  - delete account: typed confirmation, then fresh Google re-auth (`prompt: 'login'`, `intent=delete`), then the Edge Function
- [x] **P2-11** Edge Function `supabase/functions/delete-account`: verify JWT `iat` < 5 min (fresh Google re-auth); `auth.admin.deleteUser(uid)`; return 204. ✔ test: integration test asserting 0 rows remain in user tables.
- [x] **P2-12** `vite.config.ts` Workbox: add `runtimeCaching` `{ urlPattern: /supabase\.co/, handler: 'NetworkOnly' }`. Ensure `navigateFallback` still serves `/?auth=callback`.
- [x] **P2-13** `deploy.yml` and `ci.yml`: pass `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from repository **variables**. Add a CI step that fails if `dist/` contains `service_role`.
- [ ] **P2-14** *(owner: deferred 2026-11-26 — see OPERATIONS §2; accounts stay off until done)* Supabase dashboard settings, documented exactly in `docs/OPERATIONS.md`: Google provider only (email provider **off**), redirect allow-list (`https://its-harsh-here.github.io/ASCEND/`, `http://localhost:4173/`, `http://localhost:5173/`), auth rate limits at defaults. Google Cloud OAuth consent screen (External, scopes `openid email profile`), with authorized redirect = the Supabase callback URL.
- [x] **P2-15** Create `e2e/auth.spec.ts` (local stack, email provider enabled **only** in local test config as a test seam): admin-created user → programmatic session → app boots into the account DB → reload persists → logout → guest data intact; callback error states (`?auth=callback&error=access_denied`) render the retry UI.
- [x] **P2 Exit:** all 1.0 E2E pass with accounts disabled and enabled; auth E2E green; pgTAP green.

> Built 2026-11-26 behind `VITE_ENABLE_ACCOUNTS` (off). Remaining before turning it on: P2-14 (owner), P0-02 live Google verification, and the Google button branding. Deviations: *Phase 2 results* in ASCEND_2_DECISIONS.md.

## P3 — Cloud sync

- [ ] **P3-01** Dexie **v3** in `schema.ts`: add `outbox: '++seq, &mutationId, table, createdAt'`, `syncState: 'key'`, `syncConflicts: 'id, table, recordId, createdAt'`, `questCompletionEvents: 'eventId, questId, occurredAt'`, `cloudCache: 'key'`. The upgrade is a no-op. ✔ test: open a v2 DB with v3 code; data intact.
- [ ] **P3-02** `src/sync/mapping.ts`: for each synced table, `toRow(record)` / `fromRow(row)` with camel↔snake mapping, validated with the existing Zod schemas. ✔ test: round-trip for every table using factory records.
- [ ] **P3-03** `src/sync/middleware.ts`: install only when `resolveDbName()` starts with `ascend-u-`.
  - For `put`/`add`: capture changed fields and their pre-image (`getMany` on keys).
  - For `delete`/`deleteRange`: capture tombstones.
  - Skip when a transaction carries the `ascend:applying-pull` marker.

  ✔ test: parameterized over every exported mutating function in `src/services/*.ts`.
- [ ] **P3-04** In `completeQuest`/`reopenQuest` (`src/services/quests.ts`), insert a `questCompletionEvents` row `{eventId: uid(), questId, kind, occurredAt: nowIso()}` inside the existing transaction.
- [ ] **P3-05** Migration `0002_sync.sql`:
  - sequence `sync_seq`
  - shared trigger `private.sync_stamp()`
  - every table in DATABASE §4 with composite PKs/FKs, checks and the `focus_sessions` exclusion constraint (needs `btree_gist`)
  - RLS select-owner, DML revoked
  - `sync_mutations`

  ✔ test: `sync_isolation.test.sql` loops over the tables: user B can't select A's rows, and DML fails for both.
- [ ] **P3-06** `sync_push(client_schema int, mutations jsonb)`, per DATABASE §4.2–4.3: advisory lock, idempotency, merge policies, the locked-deadline rule, tombstone-wins, size limits. ✔ test: `sync_idempotency.test.sql`, `merge.test.sql` (one test per policy row in ADR-016).
- [ ] **P3-07** `sync_pull(after_seq bigint, max_rows int)` with keyset pagination across tables, ordered by `server_seq`, returning `{rows, next_seq, has_more}`. ✔ test: pagination boundaries; tombstones included.
- [ ] **P3-08** `src/sync/engine.ts`:
  - `navigator.locks.request('ascend-sync', …)`
  - loop: push batches ≤ 200 → handle results (ack delete, conflicts → `syncConflicts`, `upgrade_required` → set flag) → pull until `!has_more` → apply in a Dexie `rw` transaction with the marker, updating `syncState.lastSeq` in the same transaction
  - triggers: boot, `online`, write-debounce 2 s, 60 s interval while visible
  - backoff: base 1 s ×2 up to 5 min, ±20% jitter
  - 401 → `refreshSession()` once, then pause and flag

  ✔ test: Vitest with fake timers and a mocked RPC.
- [ ] **P3-09** `src/hooks/useSyncStatus.ts` and the top-bar indicator (states in UI/UX §6).
- [ ] **P3-10** `src/features/sync/ConflictReview.tsx`: list conflicts; for text fields, a side-by-side view with "Keep mine / Keep theirs / Edit merged"; for tombstones, "Restore". Resolution pushes a new mutation.
- [ ] **P3-11** `src/sync/migrate.ts` and `MigrationWizard.tsx`. Detect guest data (`ascend` DB non-empty). Present the options from ARCHITECTURE §6 with per-entity counts. Before writing: `exportBackup()` download plus a copy into `ascend-premerge-<ts>`. Then merge in one transaction. A "Undo merge" option is available for 30 days (restores from the copy). ✔ test: preview counts, merge union, undo.
- [ ] **P3-12** `restoreBackup` while signed in: show a dialog "Replace cloud data too?" (yes → tombstones are pushed; no → restore into a new local-only guest DB).
- [ ] **P3-13** Settings → Cloud sync panel: last sync, pending count, conflicts, storage (`sync_status`), Sync now, remove device data.
- [ ] **P3-14** Create `e2e/sync.spec.ts` (two contexts): offline edit convergence, delete-vs-edit, notes conflict, interrupted request (`route.abort`), replayed request, expired session recovery.
- [ ] **P3-15** Chaos property test (`src/sync/chaos.test.ts`, local stack in CI): seeded 200 operations on 2 simulated devices with random drops → identical final state. 50 seeds.
- [ ] **P3-16** Nightly backup workflow `.github/workflows/backup.yml` (if approved): `pg_dump` → `age` encrypt → artifact (90 days). Document a restore drill in `docs/OPERATIONS.md` and run it once.
- [ ] **P3 Exit:** chaos 50/50 converge; all failure-scenario tests pass; 1.0 suite green; the measured push→ack p50/p95 is recorded in the PR.

## P4 — Profiles

- [ ] **P4-01** Migration `0003_profiles.sql`: add the DATABASE §3.1 columns with defaults (private-by-default); `get_profile(username)` nulls fields not in `stat_visibility`; `update_profile(patch)` validates every key; `change_username` with a 30-day cooldown and a 30-day hold on the old name.
- [ ] **P4-02** Mark `verifiable` on each `ACHIEVEMENTS` entry (`src/domain/achievements.ts`). Metrics derivable from the verified ledger: questsCompleted, bossesDefeated, legendaryCompleted, longestStreak, totalXp, level. Not derivable: rewardsRedeemed, reviewsWritten, focus-based (unless verified focus).
- [ ] **P4-03** `src/features/profile/ProfilePage.tsx` (own and `#/u/:username`), `EditProfile.tsx` with a live preview, `ShowcasePicker.tsx` (verified unlocks only), and frames unlocked by verified milestones.
- [ ] **P4-04** Settings → Privacy: profile visibility, discoverable, leaderboard opt-in, friend requests from, per-stat toggles, with a plain-language preview.
- [ ] **P4-05** ✔ test: pgTAP visibility matrix; a Playwright cross-user view; a JSON-schema assertion that no profile RPC response contains `email`.
- [ ] **P4 Exit:** the privacy matrix passes; axe clean on the profile pages.

## P5 — Verified XP and leaderboards

- [ ] **P5-01** Create the shared fixture `supabase/tests/fixtures/xp_rules.json`, asserted by Vitest against `DEFAULT_SETTINGS.difficultyXp` and by pgTAP against `private.xp_rules`.
- [ ] **P5-02** Migration `0004_leaderboards.sql`: `verified_xp_ledger` (unique `(user_id, source_kind, source_id)`), `leaderboard_scores` plus `lb_rank_idx`, `leaderboard_snapshots`, `audit_events`, `profiles.flagged`.
- [ ] **P5-03** `private.credit_completion(user, quest_id, event)` implements DATABASE §5.3 rules 1–6 and upserts the week/month/all score rows (`reached_at` on positive deltas). `private.revoke_completion` mirrors it. Both are called from `sync_push`.
- [ ] **P5-04** RPCs `get_leaderboard(kind, metric, period_start, cursor, limit≤50)`, `get_rank_around_me(...)`, `get_friends_leaderboard(...)` (P6). They filter by opt-in, not flagged, not blocked, and return only public fields.
- [ ] **P5-05** pg_cron jobs: `00:05 UTC` daily snapshot (top 500 + friend graph); Monday `00:10 UTC` week close; first of the month `00:15 UTC` month close; weekly purge (tombstones > 90 d, `sync_mutations` > 30 d, notifications > 60 d, audit > 180 d).
- [ ] **P5-06** Anomaly flag job (daily): cap hit on ≥ 5 of the last 7 days, or z-score > 4 → `flagged = true` + an audit event.
- [ ] **P5-07** UI `src/features/leaderboard/*` per UI/UX §3.1. Cache the last response per tab in `cloudCache` for offline viewing.
- [ ] **P5-08** "How ranking works" sheet, with copy from SECURITY §3.
- [ ] **P5-09** ✔ tests: the pgTAP suites listed in IMPLEMENTATION P5; the 20-parallel concurrency test; `EXPLAIN ANALYZE` numbers recorded in the PR versus targets.
- [ ] **P5 Exit:** integrity suites green; performance targets met (or a documented decision); axe clean.

## P6 — Friends and social

- [ ] **P6-01** Migration `0005_social.sql`: tables and RPCs per DATABASE §6 with caps and block side-effects.
- [ ] **P6-02** `src/cloud/social.ts` and `src/features/social/*`: Friends page tabs (Friends · Requests · Blocked), profile actions (Add / Remove / Block / Report).
- [ ] **P6-03** Notifications: merge into the `Notifications` popover in `Shell.tsx`; fetch on visibility and every 2 min while visible; mark read.
- [ ] **P6-04** Nav: add the Social group in `src/app/nav.ts`; shortcuts `G W` (leaderboards) and `G I` (friends); `G P` (profile).
- [ ] **P6-05** ✔ tests: pgTAP request lifecycle, caps, symmetric block invisibility; E2E with two users.
- [ ] **P6 Exit:** tests green; no non-public field in any social RPC response.

## P7 — Guilds

- [ ] **P7-01** Migration `0006_guilds.sql` per DATABASE §7 with role checks in every RPC.
- [ ] **P7-02** Guild credit hook inside `credit_completion` (member ≥ 72 h; period contributions frozen on leave).
- [ ] **P7-03** UI: guild directory, dashboard, roster, challenges, guild board.
- [ ] **P7-04** ✔ tests: role matrix; hop-farming scenario yields no transferable XP.

## P8 — AI/RAG readiness

- [ ] **P8-01** `src/ai/actions.ts`: Zod `AgentAction` union mirroring `draftOps` functions; `previewActions(plan, actions)` returns the new `DraftPlan` plus diff. ✔ test: invalid actions rejected; valid ones equal direct draftOps calls.
- [ ] **P8-02** `docs/ASCEND_AI_EXTENSIONS.md`: tool contracts, approval UX, evaluation fixtures, local RAG storage and citation requirements.
