# ASCEND — a productivity RPG

Ascend turns real goals into **campaigns**, **questlines**, **quests** and visible progress. It looks and feels like a game's progression screen and runs entirely in your browser.

- **Costs ₹0.** No accounts, servers, subscriptions or paid APIs.
- **Local-first and offline.** Data lives in IndexedDB on your device. After the first visit the installable PWA works without a network.
- **The planner is deterministic.** Goals are matched against a curated catalog of 21 learning paths and scheduled by a capacity-aware algorithm. It is not a language model and does not pretend to be one.
- **Local AI is optional.** You can connect Ollama or in-browser WebLLM for milestone suggestions and summaries. Everything works without it.

---

## Features

| Area | What it does |
|---|---|
| **Command Center** | Character level and title, XP bar, streak, weekly consistency, a daily briefing with a recommended next quest (and why), today's quests by category, campaign pace, a daily timeline, live stats and a contribution heatmap |
| **Campaign wizard** | 9 steps: name → objective in plain language (live, transparent interpretation) → dates → time → level and constraints → goals → generate → review → activate |
| **Planning engine** | Milestones, dependencies, granular quests with deliverables, estimates adapted to skill level, priorities, revision and buffer days, XP, and a feasibility check with extend / increase time / reduce scope / prioritize options. Overload is never silent. |
| **Plan review** | Edit, add, delete and reorder quests and milestones, change estimates and priorities, lock deadlines, regenerate a questline without losing your edits, reschedule the whole plan |
| **Quests** | Main, side, daily, weekly, boss and legendary. Subtasks, prerequisites (with cycle detection), links, tags, notes, recurrence, XP overrides, scheduling and locked deadlines |
| **Quest Board** | Drag-and-drop kanban plus a list view with search, filters, sorting and bulk edit |
| **Timeline** | Gantt roadmap with day/week/month zoom: drag to reschedule, dependency lines, critical path, milestones, deadline warnings |
| **Calendar** | Month, week, day and agenda views. Drag and resize quests, add time blocks (commitments), see daily workload, filter by campaign |
| **Smart rescheduling** | Finds missed quests, rebalances the remaining work from today and shows a before/after preview. Nothing applies until you confirm, and locked deadlines never move. |
| **Gamification** | Configurable XP curve and titles (Novice → Ascendant), 27 achievements across four rarities, a skill tree built from completed quests, coins and a reward shop, streaks with rest days and freezes |
| **Focus Chamber** | Timestamp-based Pomodoro and custom timer that survives reloads and sleeping tabs. Links to quests, logs history, plays generated ambient audio, has distraction-free and fullscreen modes |
| **Analytics** | XP (daily/weekly/monthly), quests completed, focus hours, planned vs actual, completion by difficulty, time per campaign, skill growth, missed deadlines, and observations computed from your data |
| **Reviews** | Daily and weekly reviews built from real data, with reflection notes and tomorrow's priorities |
| **Data** | Versioned JSON backup and restore (validated), CSV export, integrity check and repair, backup reminders, a persistent-storage request, and a demo mode in a separate database |

Keyboard: `Ctrl/⌘ K` command palette · `Q` quick add · `N` new quest · `F` focus · `G` then `D/T/C/B/L/K/S/A/R` to navigate · `[` collapse sidebar.

Quick-add syntax: `Finish Docker networking tomorrow 2h #cloud !high`. It also understands `due fri`, `at 3pm`, `~hard`, `@boss` and `+campaign`.

---

## Quick start

Requires Node.js 20+ (22 recommended).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Other scripts:

| Command | Purpose |
|---|---|
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build on port 4173 |
| `npm run typecheck` | TypeScript (strict) |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit and integration tests (fake IndexedDB) |
| `npm run e2e` | Playwright end-to-end tests against the production preview |

If Playwright has no browser yet, run `npx playwright install chromium` once.

---

## Deployment (free)

The app uses hash-based routing (`/#/campaigns`), so any static host works without rewrite rules. `BASE_PATH` sets the URL prefix at build time.

### GitHub Pages (preferred)

1. Push to GitHub. `.github/workflows/deploy.yml` builds with `BASE_PATH=/<repo-name>/` on every push to `main`.
2. In the repository, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions** (one-time).
3. The site is published at `https://<user>.github.io/<repo-name>/`.

To build the same output locally:

```bash
BASE_PATH=/TaskManager/ npm run build
```

### Cloudflare Pages

Connect the repository in the Cloudflare dashboard and use:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION=22` (leave `BASE_PATH` unset: the site is served from `/`)

### Any static host

Run `npm run build` and upload `dist/`. Serve it over HTTPS: service workers and installation need a secure origin (`localhost` is exempt).

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, build and the Playwright suite on pull requests.

---

## Your data

- Everything is stored in the browser's IndexedDB (via Dexie) **on this device only**. There is no sync.
- **Local storage is not a backup.** Clearing site data, private browsing or browser storage eviction can delete it. Use **Settings → Data → Export JSON backup** regularly. Reminders are configurable, and the app asks the browser for persistent storage, which the browser may decline.
- Restores are validated row by row with Zod and applied in a single transaction. Dangling references are repaired and reported.
- Demo mode uses a separate database (`ascend-demo`), so sample data never mixes with your journal.

## Optional local AI

Settings → Local AI. Both options run on your hardware, need no API keys, and are only reported as available after a real round-trip succeeds.

- **Ollama:** run `OLLAMA_ORIGINS="https://<your-site>" ollama serve` and `ollama pull llama3.2`. Never expose Ollama publicly. Browsers may block HTTPS pages from calling local services; running Ascend locally avoids that.
- **WebLLM:** needs WebGPU. The first load downloads model weights (hundreds of MB) from a public CDN.

AI is used for milestone suggestions on unrecognized goals, description rewrites and review narratives. Model output is schema-validated and labelled as AI-generated.

---

## Quality: measured results

All numbers come from runs during development, not estimates.

- **Unit and integration tests:** 71 passing. They cover quest create/edit/complete, XP granted once (including reopen and recomplete), levels, achievements, recurrence, scheduling constraints, dependency ordering, locked deadlines, rescheduling, plan-review operations, backup export/restore and validation, CSV escaping, the v1→v2 database migration, and persistence across reconnects.
- **End-to-end (Playwright, Chromium):** 4 passing.
  - Full journey: onboarding → winter-break campaign with six goals → generate → review (resolving overload) → activate → complete a quest → XP updates (and does not duplicate on reopen) → skill tree → reload persists → backup export.
  - Quick-add parsing.
  - Offline reload through the service worker.
  - Mobile layout (390px, no horizontal overflow).
- **Lighthouse 12.6** (production build, first-run screen):

  | | Performance | Accessibility | Best practices | SEO |
  |---|---|---|---|---|
  | Desktop | 100 | 100 | 100 | 100 |
  | Mobile (simulated slow 4G) | 86 | 100 | 100 | 100 |

  The first measurement was desktop 99/96/100/92. Fixing an ARIA attribute, adding `robots.txt` and splitting vendor chunks brought it to the numbers above.

  Mobile LCP is about 3.4s under Lighthouse throttling. Heavy views (calendar, analytics, skill tree, wizard) are lazy-loaded.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module layout, database schema, route map, planning-engine specification and design system.

**Stack:** React 19, TypeScript (strict), Vite 7, Tailwind CSS 4, Radix primitives (shadcn-style components), Lucide, Motion, Zustand, Dexie/IndexedDB, Zod, date-fns, Recharts, dnd-kit, React Flow, FullCalendar (standard, MIT), vite-plugin-pwa, Vitest, Testing Library, Playwright.

## Known limitations

- No cloud sync. Data is per browser/device. Move it between devices with JSON backups.
- Background notifications are not reliable on every platform. Reminders are mainly in-app.
- The goal catalog covers 21 domains. Anything outside it gets a transparent generic scaffold that you edit, or optional local-AI suggestions.

## License

MIT. Fonts (Cinzel, Manrope, JetBrains Mono) are bundled from Fontsource under the SIL Open Font License. Icons are Lucide (ISC). Avatars, app icon and ambient sounds are original to this project.
