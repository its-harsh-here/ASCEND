# ASCEND 2.0 — Free-Tier Cost Analysis

> Status: **APPROVED.** Google + guest sign-in only, so no email delivery or CAPTCHA services are needed.
> - Limits below come from public sources gathered in Nov 2026 and **must be re-checked on the provider's pricing page before implementation**. Free tiers change without notice.
> - Usage numbers are **modelled estimates** with stated assumptions. **Nothing here is measured.** Phase 3/5 add instrumentation to replace the estimates with real numbers.

## 1. Proposed ₹0 stack

| Layer | Service | Plan | Card required? |
|---|---|---|---|
| Frontend hosting | GitHub Pages (existing) | Free for public repos | No |
| CI/CD | GitHub Actions (existing) | Free minutes for public repos | No |
| Auth + Postgres + Edge Functions + pg_cron | Supabase | Free plan | Not required to create a free project (verify at sign-up) |
| Local data, offline | IndexedDB / Dexie (existing) | — | — |
| Optional AI | Ollama / WebLLM (existing) | User's hardware | — |

## 2. Supabase free plan: reported limits (verify before use)

| Resource | Reported free limit | Relevance |
|---|---|---|
| Active projects | 2 | 1 production (+1 staging possible) |
| Database size | **500 MB** per project; a new project uses ~40–60 MB before data | **The binding constraint** |
| Monthly active auth users | 50,000 | Not binding at our scale |
| Egress | ~5 GB/month (+5 GB cached), reportedly org-wide | Binding at ~10k active users |
| File storage | 1 GB (50 MB per file) | Not used (no uploads in 2.0) |
| Edge Function invocations | 500,000/month | Not binding |
| Realtime | 200 concurrent connections | Not used in 2.0 (polling-free sync on demand) |
| Compute | Shared "Nano" (~0.5 GB RAM) | Adequate with indexed queries |
| Inactivity pausing | **Paused after 7 days without activity** | Risk for a small hobby deployment |
| Backups | **No automatic backups** on free | Must self-manage |
| Built-in auth email | Testing only (≈2/h, team addresses only) | **Not needed:** Google-only sign-in sends no emails |

What happens at the limits, as reported:

- Exceeding database size can put the project into **read-only** mode until usage drops or the plan is upgraded.
- Sustained egress overage on the free plan can lead to restrictions.

The app is designed to **degrade gracefully** in both cases. Sync shows "Cloud temporarily read-only" and every local feature keeps working.

## 3. Storage model (estimate)

Per-row on-disk sizes, including index entries, estimated from column widths. Postgres tuple overhead is ~24 B plus alignment.

| Row type | Est. size |
|---|---|
| `quests` (avg title 40 chars, description 120, short notes, 3 indexes) | ~0.7 KB |
| `quest_completion_events` | ~0.25 KB |
| `local_xp_events` | ~0.35 KB |
| `verified_xp_ledger` | ~0.25 KB |
| `focus_sessions` | ~0.3 KB |
| `subtasks` | ~0.2 KB |
| `leaderboard_scores` (3 rows per user per period) | ~0.1 KB each |
| `sync_mutations` (rolling 30-day window) | ~0.5 KB each |

| Profile | Assumed yearly volume | ≈ Storage / year |
|---|---|---|
| Light user | 300 quests, 300 completions, 100 focus sessions, 100 subtasks | **~0.5 MB** |
| Heavy user | 2,000 quests (incl. recurring dailies), 2,000 completions, 700 focus sessions, 1,000 subtasks | **~3.5 MB** |

Usable space is ≈ 440 MB (500 MB minus baseline).

| Active users (mix 80% light / 20% heavy) | Year-1 storage | Fits free tier? |
|---|---|---|
| **100** | ~110 MB | ✅ Comfortable for ~3–4 years with tombstone purging |
| **1,000** | ~1.1 GB | ❌ Exceeds within **~5 months** of active use |
| **10,000** | ~11 GB | ❌ |

Levers that stretch the free tier, ordered by user impact:

1. Purge tombstones after 90 days and `sync_mutations` after 30 days (planned).
2. Don't sync `local_xp_events`; rebuild local XP on new devices from completion events. This saves ~25% and is a design option (ADR-010).
3. Compress `description`/`notes` with `pglz`. TOAST already does this for values over ~2 KB, so the gain is small.
4. **Cold-history policy:** completed quests older than 12 months stay on devices only. This breaks "full history on a new device", so it's a product trade-off and **not** recommended by default.

## 4. Egress model (estimate)

Per active user per month, assuming 40 app sessions:

| Item | Size (gzipped JSON) | Monthly |
|---|---|---|
| Incremental pulls | ~10 KB × 40 | 0.4 MB |
| Pushes (request bodies count as ingress, not egress) | — | — |
| Leaderboard views (50 rows ≈ 4 KB) × 2 per session | 8 KB × 40 | 0.3 MB |
| Profile/friends views | ~2 KB × 40 | 0.1 MB |
| Occasional full sync on a new device (heavy user) | ~2 MB × 0.5 | 1 MB |
| **Total** | | **~1–2 MB / active user / month** |

| Active users | Egress / month | vs ~5 GB |
|---|---|---|
| 100 | ~0.1–0.2 GB | ✅ |
| 1,000 | ~1–2 GB | ✅ |
| 10,000 | ~10–20 GB | ❌ |

## 5. Other free-tier risks and mitigations

| Risk | Mitigation (₹0) | Residual risk |
|---|---|---|
| **Pausing after 7 days inactivity** | A real user base keeps it active. For a quiet demo, a weekly GitHub Actions workflow calls a lightweight `health()` RPC. | Keep-alive pings to dodge pausing are a policy gray area. Paused projects can be resumed from the dashboard, and **clients keep working offline** meanwhile. |
| **No automatic backups** | Nightly workflow: `pg_dump` (schema + data) → encrypted (`age`) → GitHub Actions artifact with 90-day retention. The DB password and age key are stored as repository secrets. | Artifacts are private to repo collaborators. A restore drill is required (CHECKLIST P3). |
| GitHub Pages limits | 1 GB site, ~100 GB/month soft bandwidth | Not binding |

## 6. What stays free, and what doesn't

| Feature | Free at 100 active | Free at 1,000 active | Free at 10,000 active |
|---|---|---|---|
| Guest/offline app (all of 1.0) | ✅ always | ✅ always | ✅ always |
| Google sign-in | ✅ | ✅ | ✅ (MAU fine) |
| Cloud sync | ✅ | ⚠ storage exceeded in ~5 months | ❌ |
| Leaderboards / profiles / friends | ✅ | ✅ (tiny data) | ⚠ egress |
| Guilds | ✅ | ✅ | ⚠ |
| Server-side RAG (pgvector) | ⚠ embeddings consume storage fast | ❌ | ❌ |

**Honest conclusion:**

- The proposed architecture is **₹0 for a portfolio-scale deployment of up to roughly a few hundred active users**.
- Beyond that, **cloud sync storage** is the first thing to break, followed by egress.
- Supabase Pro is listed at $25/month (≈ ₹2,100) and lifts these limits. This would be an explicit, optional decision, never a silent dependency.
- The local-first design means **no feature stops working offline** when a limit is hit.

## 7. Alternatives considered

| Option | ₹0? | Pros | Cons for ASCEND |
|---|---|---|---|
| **Supabase** (recommended) | Yes (limits above) | Real Postgres (constraints, transactions, window functions for ranks); RLS; managed auth incl. Google; SQL migrations; portable via `pg_dump` | 500 MB, pausing, no backups, SMTP needed |
| Firebase Spark | Yes, no card for Spark | Generous auth; offline SDK; 1 GiB Firestore | No SQL constraints or transactions over queries; rank queries are costly aggregation reads; security rules are less expressive than RLS + constraints; harder idempotency guarantees for XP; vendor lock-in |
| Appwrite Cloud (free) | Yes (verify) | Auth + DB + functions | Smaller ecosystem; less mature for complex relational constraints |
| Cloudflare Workers + D1 | Yes | 5 GB D1, generous requests | No managed user auth; Google OAuth would have to be implemented and secured by hand |
| Self-hosted PocketBase / Postgres on an "always free" VM | Often needs a card (e.g. Oracle) | Full control | Card requirement, ops burden, uptime is on us |

**Fallback strategy:** all server logic is plain Postgres SQL (functions, RLS, constraints) plus two small Deno functions. Moving to self-hosted Supabase or any Postgres with an auth service is a migration, not a rewrite.

## 8. Sources

Third-party summaries; verify against the provider's own pricing page:

- [Supabase Free Tier Limits 2026: Database, Projects, Pausing](https://aiagencyplus.com/supabase-free-tier-limits/)
- [Supabase Free Plan Limits in 2026 — Free Cloud Zone](https://freecloudzone.com/articles/supabase-free-tier-limits-2026/)
- [Supabase free plan limits, and what happens at each one](https://reeve.page/blog/supabase-free-plan-limits)
- [Supabase Pricing 2026: Free Tier Limits & Real Costs](https://designrevision.com/blog/supabase-pricing)
- [Supabase Free Tier Limits (2026)](https://www.itpathsolutions.com/supabase-free-tier-limits)
- [Supabase Auth rate limits (official)](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase PKCE flow (official)](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
