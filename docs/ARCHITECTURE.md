# Ascend — Architecture

## 1. Principles

- **Local-first.** IndexedDB is the source of truth. No backend, no accounts, no network needed after install.
- **Business logic outside components.** Pure domain and planning modules; transactional services; views only render and dispatch.
- **Deterministic and honest.** The planner is rule- and template-based and explains its matches. Statistics come only from recorded events. AI is optional, labelled, and verified before use.
- **Never overload silently.** Scheduling reports unscheduled work and gives the user options instead of cramming it into days.

## 2. Module layout

```
src/
  domain/        Pure types and rules — Zod schemas, XP curve, streaks, achievements,
                 skills, recurrence, quick-add parser, briefing, analytics
  planning/      Goal catalog (21 templates), goal parser, planner, scheduler,
                 feasibility, rescheduler, critical path, plan-review operations
  db/            Dexie schema with versioned migrations; demo/real database selection
  services/      Transactional mutations — quests, campaigns, recurrence, focus,
                 rewards, reviews, progression/achievements, backup/CSV/integrity, demo
  ai/            Optional provider abstraction (Ollama, WebLLM) + validated tasks
  store/         Zustand: UI state (dialogs, toasts, celebrations), focus timer
  hooks/         Live queries (dexie-react-hooks) and derived profile/context
  components/    ui/ primitives (Radix + Tailwind), game/ widgets, quest/ list/editor/quick add
  features/      One folder per screen (lazy-loaded routes)
  app/           Shell, routing, command palette, celebrations, shortcuts, PWA prompt
```

Dependencies point inward: `features → components/hooks/services → planning/domain/db`. `domain` and `planning` import nothing from React or Dexie, which keeps them unit-testable.

## 3. Database schema (IndexedDB via Dexie)

| Table | Key and indexes | Notes |
|---|---|---|
| `campaigns` | `id, status, createdAt` | Goal container: dates, hours/day, workdays, skill level, outcomes |
| `questlines` | `id, campaignId, order` | One per goal; `templateId`, `skillIds` |
| `milestones` | `id, campaignId, questlineId` | `dueDate`, `deadlineLocked` |
| `quests` | `id, campaignId, questlineId, milestoneId, status, scheduledDate, dueDate, category, completedAt, archivedAt, recurrenceId, [recurrenceId+recurrenceDate], *tags` | Every quest field; `origin` (manual/generated/recurring/quickadd/revision), `userEdited` |
| `subtasks` | `id, questId` | |
| `recurrences` | `id, active, campaignId` | Rules; instances get deterministic ids `rec:<rule>:<date>` (idempotent) |
| `xpEvents` | `id, &sourceKey, date, kind, questId` | **Immutable ledger.** A unique `sourceKey` (`quest:<id>`, `focus:<id>`, `achievement:<id>`, `campaign:<id>`) guarantees XP at most once; reopening sets `revoked` |
| `focusSessions` | `id, date, questId, startedAt` | |
| `achievements` | `id, unlockedAt` | |
| `rewards`, `redemptions` | `id` / `id, rewardId, redeemedAt` | Coins = Σ non-revoked event coins − Σ redemptions |
| `timeBlocks` | `id, date` | Commitments reduce scheduling capacity |
| `reviews` | `id, kind, periodKey` | `daily:YYYY-MM-DD`, `weekly:YYYY-Www` |
| `activity` | `id, date, createdAt` | Activity log |
| `settings` | `id` (singleton) | Validated with Zod; defaults fill in missing fields |

**Conventions.** Calendar days are local `yyyy-MM-dd` keys, so they never shift across timezones. Instants are ISO-8601 UTC. Ids are UUID v4.

**Migrations.** v1 is the initial schema. v2 adds recurrences, time blocks, reviews and activity, plus the compound recurrence index, and backfills new quest, XP and settings fields. Released versions are never edited. A test opens a real v1 database and upgrades it.

**Integrity.** Deletes clean up subtasks and dependency references. Campaign deletion either detaches its quests or deletes them. Earned XP is never deleted. The integrity checker finds and repairs orphans. Imports are validated row by row and applied all-or-nothing.

**Backup format.** `{ format: "ascend-backup", version, schemaVersion, exportedAt, data: { <table>: rows[] } }`. Backups from newer versions or schemas are rejected with a clear message.

## 4. Route map (hash router)

| Route | Screen |
|---|---|
| `#/` | Command Center |
| `#/today` | Today / overdue / tomorrow / next 7 days / unscheduled / recurring |
| `#/campaigns`, `#/campaigns/new`, `#/campaigns/:id` | Campaign list, 9-step wizard, detail + rebalance |
| `#/board` | Kanban and bulk-edit list |
| `#/timeline` | Gantt roadmap |
| `#/calendar` | Month/week/day/agenda |
| `#/skills` | Skill tree |
| `#/focus` | Focus Chamber |
| `#/achievements?tab=…` | Achievements, reward shop, streak |
| `#/analytics` | Analytics |
| `#/reviews` | Daily and weekly reviews |
| `#/archive` | Completed, archived, finished campaigns |
| `#/settings` | All settings, data and local AI |

Hash routing works on any static host, including GitHub Pages sub-paths, with no 404 rewrites.

## 5. Planning engine specification

### 5.1 Goal catalog

Each `GoalTemplate` has: keywords, skills, an optional `requires` link to another template's milestone (e.g. Kubernetes after Docker "Building images"), milestones of quest blueprints, and optional recurring habits. A quest blueprint has: hours, difficulty, a measurable deliverable, a level (`foundation`, `core` or `advanced`), and flags for optional and boss. Parameterized templates (exams, reading) expand by quantity (units, books).

### 5.2 Goal parsing (`goalParser.ts`)

1. Match keywords with word boundaries. The longest overlapping phrase wins (so "research-worthy project" maps to Research, not to a generic project). The first match per template is recorded with its triggering keyword.
2. Extract duration (`30 days`, `4 weeks`, `two months`), daily hours (`6 hours daily`, `90 minutes a day`) and skill level (`beginner`, `familiar with`, `advanced`).
3. Clauses that contain a goal verb but no catalog keyword are returned as **unrecognized goals**. They get a generic scaffold (Scope → Learn → Practice → Deliver), user-defined milestones, or optional local-AI suggestions.

### 5.3 Planner (`planner.ts`)

For each goal, in priority rank:

- Instantiate the blueprint and adapt to skill level:
  - beginner: core work ×1.15
  - intermediate: foundations ×0.6
  - advanced: foundations skipped, core ×0.85
  - Every skip is noted.
- Split quests longer than 60% of the effective day into chained parts.
- Dependencies:
  - Each core quest depends on the previous core quest (or on explicit blueprint deps).
  - Optional quests hang off the chain and nothing depends on them.
  - Cross-template `requires` links are added when both goals are present.
- Category and priority: boss quests are `boss`/high; optional quests are `side`/low; the top third of goals is high, the rest medium.
- Recurring habits reserve their minutes per weekday before scheduling.
- Milestone due date is the last scheduled core quest, unless locked. Quest due date is its milestone's due date, unless locked.
- Each revision day gets a revision quest summarizing the questlines worked since the previous revision.

### 5.4 Scheduler (`scheduler.ts`)

Inputs: tasks (hours, deps, priority, group, optional, lockedDue), date window, workdays, hours/day, commitments per date.

1. **Days.** Capacity on a workday is hours/day minus commitments; other days are off.
   - The last ~8% of working days (at least 7 workdays in the window) become **buffer days**.
   - Every 6th working day is a **revision day**: half its capacity, capped at 2h, is reserved for revision.
2. **Cycles.** Detected with Kahn's algorithm and reported; tasks in a cycle are never scheduled.
3. **List scheduling** walks the days in order. On each day it repeatedly picks the best *ready* task — every in-window prerequisite already placed on or before that day — that fits the remaining capacity. Score:
   - priority × 8
   - plus 0.6 × downstream critical work (hours of descendant tasks)
   - plus deadline urgency, from working-day slack to a locked deadline
   - minus 30 for optional work
   - plus a small continuity bonus, or −40 when one questline already fills 60% of the day and others are ready (interleaving)
4. Buffer days are used only if work remains after the normal days.
5. A task larger than every day's capacity may take an otherwise empty day. Anything else that does not fit is left **unscheduled**, never overbooked.
6. Output: assignments, per-day plans, unscheduled ids, locked-deadline violations, required/optional/available/buffer hours.

### 5.5 Feasibility (`feasibility.ts`)

Status is `comfortable` (≤ 90% utilization), `tight` (buffer used, or optional work left out) or `overloaded` (required work unscheduled or a locked deadline violated). Options are verified by re-running the scheduler before they are offered:

- **Extend:** the earliest end date at which all required work fits.
- **Increase time:** the hours/day needed (flagged above 10h).
- **Reduce scope:** drop optional quests.
- **Prioritize:** defer the lowest-ranked goals until the rest fits.

### 5.6 Plan review and regeneration (`draftOps.ts`)

Immutable operations: edit, remove (dependents inherit the removed quest's prerequisites), add, move milestone (re-links the chain), lock milestone or quest deadlines, toggle recurring habits, drop optional, defer goals. Each one reschedules.

`regenerateGoal` keeps quests flagged `userEdited` unless the user explicitly confirms an overwrite. The wizard also asks before discarding review edits when its inputs change.

### 5.7 Smart rescheduling (`rescheduler.ts`)

1. Pending non-recurring quests are re-scheduled from `max(today, campaign start)` to the campaign end, which can optionally be extended (hours/day can also change).
2. Completed work satisfies dependencies. Remaining estimates subtract time already tracked.
3. Future revision quests and other campaigns' work count as commitments.
4. Locked quest and milestone deadlines become hard due dates. They are never moved and are reported if they can't be met.
5. The result is a preview (moves, skips, unscheduled, milestone date changes). It is applied in one transaction only after the user confirms.

## 6. Progression rules

- **XP per difficulty:** 10 / 25 / 50 / 100 / 250 / 500, times a global multiplier; per-quest overrides allowed.
- **Focus XP:** 0.5 per minute.
- **Achievement bonus:** 20, 50, 120 or 300 by rarity.
- **Campaign completion bonus:** 300.
- **Level curve:** XP to advance from level L is `round(80 × L^1.35)`.
- **Titles:** Novice 1, Apprentice 3, Explorer 6, Adventurer 10, Specialist 15, Expert 22, Master 30, Grandmaster 45, Ascendant 60.
- **Coins:** XP / 5.
- **Streaks:** a day counts with ≥ 1 completed quest or ≥ 5 focus minutes. Non-workdays are neutral rest days. Every 7 active days earns a freeze (max 2) that covers one missed workday. Today never breaks a streak.
- **Skill ranks** come from non-revoked XP events tagged with that skill (0 / 1 / 300 / 800 / 1800 / 3500 XP). A node unlocks when its prerequisites reach rank 1.

## 7. Design system

- **Theme:** Obsidian / Midnight. Near-black layered surfaces (`--bg`, `--surface`, `--surface-2/3`) with hairline borders.
  - Accent: violet by default; user-selectable (cyan, gold, emerald, rose, indigo).
  - Semantic colors: cyan for selection and info, gold for rewards and legendary, emerald for completion, crimson for overdue.
  - The light theme redefines the same tokens.
- **Typography:** Cinzel (display, engraved quest-journal feel), Manrope (UI and body), JetBrains Mono (tabular numbers).
- **Motifs:**
  - Rune corner brackets (`.panel-runes`) and diamond (45°) shapes for completion controls, levels and achievements.
  - Atmospheric radial lighting and a faint grid.
  - Restrained glass on overlays only.
- **Motion:** spring-based (Motion) page transitions, nav indicator, progress bars and rings, XP floats with sparks, level-up ceremony, achievement banners, drag overlays. `prefers-reduced-motion` and a manual setting reduce all motion globally (CSS and `MotionConfig`).
- **Components:** Radix-based dialog, popover, dropdown, tooltip, tabs, switch, checkbox; Tailwind variants with CVA. Every screen has empty states, skeleton loading and keyboard access.
- **Charts:** single-series charts use one hue. The planned-vs-actual pair is validated for color-vision deficiency and contrast against both dark and light surfaces (`--chart-1/2`). Recessive axes, tooltips, and a table view for XP.
