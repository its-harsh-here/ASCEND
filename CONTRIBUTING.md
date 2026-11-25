# Contributing to Ascend

Thanks for your interest! Ascend is a local-first app with no backend, so contributing only needs Node.js.

## Getting started

```bash
git clone https://github.com/its-harsh-here/ASCEND.git
cd ASCEND
npm install
npm run dev
```

Use Node 22 (see `.nvmrc`). Open http://localhost:5173.

## Before you open a pull request

Run the same checks CI runs:

```bash
npm run typecheck
npm run lint -- --max-warnings 0
npm test
npm run build
npm run e2e
```

If Playwright has no browser yet, run `npx playwright install chromium` once.

## Where things live

| Folder | Purpose |
|---|---|
| `src/domain` | Pure rules: XP, streaks, achievements, recurrence, quick-add parsing, briefing, analytics |
| `src/planning` | Goal catalog, goal parser, planner, scheduler, feasibility, rescheduler |
| `src/services` | Transactional database mutations (the UI never writes to IndexedDB directly) |
| `src/features` | One folder per screen |

`docs/ARCHITECTURE.md` describes the schema, routes and the planning-engine algorithm in detail.

## Guidelines

- **Keep business logic out of components.** Put rules in `domain`/`planning` with unit tests; put mutations in `services`.
- **Database changes need a migration.** Add a new Dexie version in `src/db/schema.ts` with an upgrade function and a test. Never edit a released version.
- **Stay honest.** Statistics come from recorded data only. AI features must stay optional, verified before use and labelled. The planner must never silently overload a schedule.
- **Accessibility.** Keyboard access, visible focus, labels on icon buttons, and respect for reduced motion.
- **Adding a goal template.** Add it to `src/planning/catalog/`. Give every quest a measurable deliverable. The catalog test checks that keys are unique and hours are sane.

## Commit and PR style

- Small, focused PRs with a clear description of *what* and *why*.
- Include screenshots for UI changes.
- New behavior comes with tests.

By contributing, you agree that your contributions are licensed under the MIT License.
