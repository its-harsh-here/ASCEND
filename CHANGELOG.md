# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-25

First public release.

### Added

- **Campaign wizard:** nine steps from a plain-language objective to a scheduled roadmap. Live, transparent goal interpretation; 21 goal templates; generic scaffolds for unrecognized goals.
- **Planning engine:**
  - Skill-level adaptation and dependency chains, including cross-goal prerequisites
  - A capacity-aware scheduler with revision and buffer days and locked deadlines
  - Feasibility analysis with verified fixes
  - Plan review: edit, reorder, lock, and regenerate while preserving your edits
- **Smart rescheduling:** before/after preview; locked deadlines are never moved.
- **Quests:** six categories, subtasks, prerequisites with cycle detection, links, recurrence, quick-add syntax, command palette, kanban board with bulk edit.
- **Views:** Command Center dashboard, Gantt timeline with critical path, FullCalendar month/week/day/agenda with time blocks.
- **Progression:** XP and levels with titles, 27 achievements, a skill tree driven by completed quests, coins and a reward shop, streaks with rest days and freezes.
- **Focus Chamber:** timestamp-based timer, quest linking, generated ambient audio, distraction-free and fullscreen modes.
- **Insights:** analytics computed only from recorded data; daily and weekly reviews.
- **Data:** offline-first IndexedDB storage with versioned migrations; validated JSON backup and restore; CSV export; integrity repair; demo mode in a separate database.
- **Optional local AI:** Ollama or WebLLM.
- **Install and deploy:** installable PWA that works offline; GitHub Pages deployment with post-deploy live verification.
