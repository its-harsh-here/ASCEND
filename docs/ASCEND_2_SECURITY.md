# ASCEND 2.0 — Security Architecture

> Status: **APPROVED.** Updated for Google + guest only (no passwords, no email delivery, no username login).

## 1. Trust boundaries

| Zone | Trusted for | Not trusted for |
|---|---|---|
| Browser (React, Dexie, local XP) | Rendering and local productivity data | **Anything that affects other users**: XP totals, levels, achievements, ranks, timestamps |
| Supabase Auth | Identity (JWT `sub`), email verification state, OAuth | Authorization decisions (those live in Postgres) |
| Postgres RLS + `SECURITY DEFINER` RPCs | Authorization, integrity constraints, verified XP | — |
| Edge Functions (service role) | Operations that need admin rights | General data access |

**Golden rules:**

- The browser only ever holds the **anon (publishable) key** and the user's own JWT.
- The `service_role` key exists only in Supabase Edge Function secrets and GitHub Actions secrets used for migrations and backups.
- It is **never** placed in `VITE_*` variables, which Vite inlines into the public bundle.

## 2. Threat model

Severity: **C**ritical / **H**igh / **M**edium / **L**ow.

| # | Threat | Sev | Attack scenario | Mitigation | Test strategy |
|---|---|---|---|---|---|
| T1 | Broken access control on user tables | C | An attacker calls `/rest/v1/quests?user_id=eq.<victim>` with their own JWT | RLS on every table with `user_id = (select auth.uid())`; no direct DML grants; composite `(user_id, id)` keys | pgTAP: for each table, a second user's JWT sees 0 rows and every DML fails; a CI script asserts **every** `public` table has RLS enabled (`pg_class.relrowsecurity`) |
| T2 | IDOR via composite references | H | Push a quest whose `campaign_id` is another user's campaign ID | Composite FKs `(user_id, campaign_id)` make it impossible; FK violation → mutation `rejected` | pgTAP plus sync E2E with crafted mutation |
| T3 | Arbitrary XP / leaderboard manipulation | C | Edit IndexedDB or call the API with `xp: 999999` | Server never accepts XP numbers; XP = `private.xp_rules[difficulty]` at credit time; ledger amount `check (≤ 500)` | Unit (Vitest) + pgTAP: push payloads with forged `xp_reward`/totals → verified XP unchanged |
| T4 | Duplicate rewards / replay | H | Re-send the same completion; complete → reopen → complete loop | `unique (user_id, source_kind, source_id)` on the ledger; `sync_mutations` idempotency by `mutation_id`; reopen revokes, recomplete restores the same row | pgTAP: 50 identical pushes → 1 credit; reopen/recomplete loop ×20 → net one credit |
| T5 | Race conditions on concurrent claims | H | Two tabs or devices push the same completion simultaneously | Per-user advisory lock + unique constraint; single-transaction credit and score update | Concurrency test: 20 parallel `sync_push` calls via `Promise.all` against local Supabase → ledger rows = 1, score = rule XP |
| T6 | XP farming with fake quests | M | Script creating and completing hundreds of trivial quests | Quest must be server-known ≥ 10 min; daily cap 1,500; boss ≤ 3/day; legendary ≤ 1/week; revision quests earn 0; anomaly flag | pgTAP for each rule; **documented** that self-reported tasks cannot be proven real (§3) |
| T7 | Backdated offline claims | M | Claim completions dated last month to top a past week | `occurred_at` clamped to `[server_first_seen_at, received_at]`; older than 7 days → not verified; closed periods are frozen | pgTAP with crafted timestamps |
| T8 | Focus-time inflation | M | Fabricate long focus sessions | Overlap exclusion constraint; ≤ 8 h/day verified; `ended_at ≤ received_at`; focus excluded from XP board | pgTAP overlap and cap tests |
| T9 | Credential stuffing / brute force | — | — | **Eliminated by design:** no passwords exist. Authentication is delegated to Google (its own anti-abuse). Supabase Auth rate limits still apply to token endpoints. | Config review |
| T10 | Account enumeration | L | Probing to learn who has an account | No password or reset endpoints exist; `check_username_available` is authenticated and rate-limited (30/min per user); profiles are hidden unless `discoverable` | pgTAP rate-limit test |
| T11 | OAuth misconfiguration / open redirect | H | Attacker crafts `redirectTo` to steal the code | Supabase **Redirect URL allow-list** = exactly `https://its-harsh-here.github.io/ASCEND/` and `http://localhost:5173/`; PKCE flow (the code is useless without the verifier in the victim's storage) | Manual config review checklist; E2E for the callback with an invalid state |
| T12 | Token theft via XSS | H | Injected script reads the session from `localStorage` | React escaping (no `dangerouslySetInnerHTML` anywhere today, verified by grep in CI); links pass `safeUrl()` (`src/lib/utils.ts`); **CSP `<meta>`** restricting `script-src 'self'` and `connect-src 'self' https://<project>.supabase.co`; WebLLM CDN allowed only if that feature is enabled (separate decision) | CI grep gate for `dangerouslySetInnerHTML`/`innerHTML`; Playwright asserts the CSP meta exists; XSS payload fixtures in quest titles, bios and display names render inert |
| T13 | Clickjacking | L | Framing the app to trick clicks | Not fully fixable on GitHub Pages (no `frame-ancestors` via `<meta>`), accepted in ADR-012. There are no credential forms to hijack (Google sign-in opens Google's own page). Destructive actions require typed confirmation **and** fresh Google re-authentication | Documented limitation |
| T14 | Malicious avatar uploads | — | — | **Eliminated by design:** 2.0 uses predefined, unlockable avatars and frames only (no uploads). See UI/UX §5.4 | — |
| T15 | Stored XSS / abuse in public text | M | Malicious display name, bio or guild description | Length limits, control-character stripping trigger, React escaping, report flow; no HTML or Markdown rendering for public text | Fixtures in pgTAP and E2E |
| T16 | Database policy mistakes in future migrations | H | A new table shipped without RLS | CI gate fails if any `public` table lacks RLS or has a permissive policy for `anon`; pgTAP isolation suite parameterized over all tables | CI |
| T17 | `SECURITY DEFINER` hijack via `search_path` | H | Attacker-controlled objects shadow function names | All definer functions `set search_path = ''` with fully qualified names; functions live in `private` except the RPC entry points | pgTAP asserts `proconfig` contains `search_path=` for every definer function |
| T18 | Account deletion / retention | M | User wants to be forgotten; data lingers | `delete-account` Edge Function: re-auth (fresh JWT < 5 min) → `auth.admin.deleteUser` → `on delete cascade` across all tables. Leaderboard history rows are removed. Audit rows keep `user_id = null`. A local "Delete cloud data only" option is also offered | Integration test: create user with data → delete → assert 0 rows referencing the UID |
| T19 | Session fixation / stale sessions | M | Session persists after logout on a shared device | `signOut({ scope: 'local' })` plus wipe of the account DB on request ("Remove data from this device"); refresh-token rotation (Supabase default); sync pauses on 401 and prompts re-login | E2E: logout → reload → no session, account DB inaccessible |
| T20 | Friend/request spam & harassment | M | Mass friend requests, unwanted contact | Caps (20 pending, 50/day); `friend_requests_from = 'nobody'`; blocking removes visibility both ways; reports | pgTAP |
| T21 | Guild point laundering | M | Join, farm, leave, transfer | Contributions are non-transferable and period-bound; 72 h join delay; 7-day re-join cooldown; one guild per user | pgTAP (Phase 7) |
| T22 | Supabase free-project pause / data loss | M | Project paused or corrupted; no automatic backups on free | Nightly `pg_dump` workflow to an encrypted, private artifact (90-day retention); clients keep working offline from IndexedDB regardless | Restore drill documented and run once per phase release |
| T23 | Leaked public keys abused for quota exhaustion | M | Bots hammering anon endpoints | Anon role has **no** table access; RPCs check `auth.uid()`; Supabase rate limits; accounts can only be created via Google (no scripted sign-ups) | Load test (k6 or a simple script) against local stack only |

## 3. Leaderboard integrity — honest limits

ASCEND tasks are **self-reported**. No server can prove a user really studied Kubernetes for two hours, so the design aims for **proportional, explainable** integrity, not proof:

- **Prevented outright:**
  - forged XP numbers
  - duplicate and replayed rewards
  - backdated or future-dated claims beyond the window
  - overlapping focus time
  - client-side level or achievement spoofing
- **Bounded:** fake-but-plausible quests. Caps limit how far any one user can pull ahead per day and week. The minimum quest age prevents instant create-and-complete loops.
- **Flagged, not punished:** statistical outliers are hidden pending review. They are not banned automatically.
- **Communicated:** the leaderboard page includes an "How ranking works" sheet that says exactly this.

**Local XP vs verified XP in the UI:**

- The top-bar level stays **local** (instant, offline, includes user multipliers).
- Profiles and leaderboards show **verified XP** with a shield icon and the tooltip "Verified by server rules".
- The two numbers can differ, and the profile explains why. Examples: XP multiplier, stale offline completions, caps.

## 4. Authentication design

| Concern | Decision |
|---|---|
| Provider | Supabase Auth (GoTrue) — no custom password hashing or storage |
| Flows | **Google OAuth (PKCE) only.** Guest mode needs no account. No email/password, password reset or username login (ADR-006/007) |
| Session storage | supabase-js default (`localStorage`), refresh-token rotation on. Accepted risk: a successful XSS could read tokens. Mitigated by T12 controls; there is no `httpOnly` cookie option on static hosting |
| Duplicate accounts | Supabase links identities with the same **verified** email automatically. Unverified email sign-ups never auto-link to a Google identity. Settings → Account shows linked identities (`linkIdentity` / `unlinkIdentity`, keeping at least one) |
| Username uniqueness | `citext unique` and an allow-list regex; reserved names; 30-day change cooldown; old usernames held for 30 days to prevent impersonation |
| Session expiry | `onAuthStateChange('TOKEN_REFRESHED' / 'SIGNED_OUT')`. On refresh failure: sync pauses, a banner asks to sign in again, **no local data is touched** |
| Logout | Stops sync, flushes nothing, clears the session, reloads into the guest DB. "Also remove this account's data from this device" deletes `ascend-u-<uid>` after warning about unsynced changes (outbox count) |

### 4.1 Re-authentication for sensitive actions

Without passwords, "recent login" means a fresh Google sign-in. Account deletion calls `signInWithOAuth` with `prompt=login` and a `?auth=callback&intent=delete` return. The `delete-account` Edge Function accepts only a JWT whose `iat` is under 5 minutes old.

## 5. Privacy model

| Data | Visibility |
|---|---|
| Email, linked providers, timezone | Owner only (Auth / private columns) |
| Quests, campaigns, notes, calendar, reviews, focus details | **Owner only, always.** No sharing feature exposes them in 2.0 |
| Username, display name, avatar, frame, title | Per `profile_visibility` |
| Level, verified XP, streak, quest count, focus hours | Per `stat_visibility` allow-list |
| Showcased achievements | Verified achievements the user explicitly picked |
| Leaderboard presence | Only if `leaderboard_opt_in` (default **off**) |
| Search discoverability | Only if `discoverable` (default **off**) |

Defaults are private-by-default. The onboarding Gate asks once whether to appear on leaderboards.

## 6. Content Security Policy (meta, GitHub Pages)

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'sha256-<pre-paint theme script hash>';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://*.googleusercontent.com;
  font-src 'self';
  connect-src 'self' https://<project-ref>.supabase.co http://localhost:11434 <WebLLM model hosts>;
  worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'">
```

- `style-src 'unsafe-inline'` is required by Motion and React inline styles. This is a documented trade-off.
- WebLLM is **kept** (ADR-013) by self-hosting its library as a lazy-loaded chunk, so `script-src 'self'` still holds. Model weights download via `connect-src`, which must allow the model host (e.g. `https://huggingface.co` and its CDN, `https://raw.githubusercontent.com`); the exact hosts are pinned during implementation.
- `localhost:11434` keeps Ollama working.

## 7. Security testing in CI

1. `supabase test db`: the pgTAP suites for RLS isolation (all tables), idempotency, caps, constraints and definer `search_path`.
2. Vitest: sync merge policies, the CSP meta presence; Deno test for the `delete-account` re-auth window.
3. Playwright against the local Supabase: cross-user isolation using two browser contexts; logout and data-removal; the XSS fixtures.
4. Secret scanning: GitHub secret scanning plus a CI grep that fails the build if a `service_role`-looking JWT or `SUPABASE_SERVICE` appears in `dist/`.
5. `npm audit --omit=dev` (report-only, weekly).
