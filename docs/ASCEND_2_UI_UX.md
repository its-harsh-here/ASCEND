# ASCEND 2.0 — UI/UX Plan

> Status: **APPROVED** (Google + guest sign-in only). Extends the existing design language in `src/styles/index.css` and `src/components/ui/*`. It does not redesign working screens.

## 1. Design principles carried forward

These already exist in 1.0 and are reused as-is:

- **Obsidian palette:** `--bg`, `--surface`, `--surface-2/3`, `--line`, accent tokens, and switchable accents via `:root[data-accent=…]`.
- **Typography:** Cinzel display, Manrope UI, JetBrains Mono numbers.
- **Motifs:** `.panel`, `.panel-runes` corner brackets, diamond shapes (completion control, level badge, achievements), `.atmosphere` lighting.
- **Motion:** Motion springs; `data-motion="reduce"` plus `MotionConfig reducedMotion`.
- **Primitives:** Radix-based `Dialog`, `Popover`, `DropdownMenu`, `Tooltip`, `Tabs`, `Switch`; `Button`/`LinkButton` with CVA variants.

2.0 adds new screens using **only these primitives**, plus three new game components: `Podium`, `RankRow` and `ProfileCard`.

## 2. Navigation

`src/app/nav.ts` groups today: **Play** (Command Center, Today) · **Plan** (Campaigns, Board, Timeline, Calendar) · **Grow** (Skill Tree, Focus, Achievements, Analytics, Reviews) · **System** (Archive, Settings).

Proposed:

| Group | Items | Notes |
|---|---|---|
| Play | Command Center, Today's Quests | unchanged |
| Plan | Campaigns, Quest Board, Timeline, Calendar | unchanged |
| Grow | Skill Tree, Focus Chamber, Achievements, Analytics, Reviews | unchanged |
| **Social** *(new, signed-in only)* | **Leaderboards**, **Friends** | 2 items; the profile is reached via the avatar |
| System | Quest Archive, Settings | unchanged |

- **Sidebar footer:** the existing avatar card (`Sidebar` in `src/app/Shell.tsx`) becomes an **account menu**. It holds the profile, account settings, sync status, theme quick toggle and sign out. For guests it shows a "Sign in to sync" call to action.
- **Top bar:** add a **sync indicator** (cloud icon with states) next to notifications. The bell merges local reminders (the existing `useNotifications`) with social notifications. The quick theme toggle goes in the account menu to keep the top bar uncluttered.
- **Mobile bottom nav:** stays at 4 + More. Social lives under *More*.
- **Shortcuts:** `G_SHORTCUTS` already uses `d t c b l k s f h a r ,`. New and free: `G P` profile, `G W` leaderboards ("world"), `G I` friends ("allies").
- **Routes:** `#/profile`, `#/u/:username`, `#/leaderboards`, `#/friends`, `#/settings#account|privacy|sync|appearance`, `#/auth/*` (outside the shell).

## 3. New screens

| # | Screen | Route | Layout and key elements |
|---|---|---|---|
| 1 | **Gate** (Google / guest) | `#/auth` (full-screen, outside `AppShell`) | Split layout: left is the animated brand panel (the existing `favicon.svg` peak rising out of a faint rune circle drawn in SVG, with a slow parallax star field; static under reduced motion); right is the auth card. **"Continue with Google"** (primary) and **"Continue as guest — everything stays on this device"** (secondary), with a one-line comparison of what each gives you (sync & leaderboards vs fully offline). No password fields. |
| 2 | First-time account setup | after first Google sign-in | Claim a unique username (live availability check, debounced 400 ms, rate-limited), display name pre-filled from Google (editable), leaderboard opt-in checkbox (default off) |
| 3 | ~~Password recovery~~ | — | Not applicable: Google-only sign-in (ADR-006). |
| 4 | Account setup | after first sign-in | Reuses the existing onboarding steps (`Onboarding.tsx`); adds username claim (Google users), avatar, privacy defaults, **guest data migration** step (ARCHITECTURE §6) |
| 5 | Profile | `#/profile`, `#/u/:username` | Hero card: avatar with frame, display name, `@username`, equipped title, level badge (verified), verified XP with shield; stat tiles per `stat_visibility`; showcase achievements (≤5) using the existing achievement card style; join date; country flag (emoji-free, ISO code chip); actions: Add friend / Message (none) / Block / Report |
| 6 | Edit profile | `#/profile/edit` | Live preview beside the form; avatar picker (the existing `AVATARS` + unlockable frames); title picker (earned titles only); showcase picker; visibility controls |
| 7 | Global leaderboard | `#/leaderboards` | Period tabs **Weekly · Monthly · All-time**; scope toggle **Global · Friends**; metric select **XP** (default) / Quests / Focus; **podium** for top 3; ranked list with keyset "Load more"; sticky **"You"** row; search by username (discoverable only); "How ranking works" sheet; reset countdown in local time |
| 8 | Friends leaderboard | same page, scope = Friends | Includes self; empty state invites friends |
| 9 | Friend requests | `#/friends` (tab) | Incoming/outgoing lists, accept/decline, cancel; caps surfaced ("20 pending max") |
| 10 | Social notifications | bell popover + `#/friends` tab | Grouped by day; mark all read; privacy-safe text |
| 11 | Guild dashboard *(Phase 7)* | `#/guilds/:slug` | Roster, challenges, guild board |
| 12 | Appearance settings | `#/settings#appearance` | Three large preview tiles (Light / Dark / System) rendered with real tokens; accent swatches (existing); motion setting (existing) |
| 13 | Account & privacy | `#/settings#account`, `#privacy` | Google account email (read-only), username change (cooldown shown), visibility toggles with plain-language previews ("Your profile will show: …"), delete account (typed confirmation + fresh Google re-auth) |
| 14 | Cloud sync | `#/settings#sync` | Status, last sync, pending changes, conflicts list (with diff previews), storage used (from `sync_status`), "Sync now", "Remove this account's data from this device" |

### 3.1 Leaderboard visual spec

- **Podium:**
  - Three columns: 2nd–1st–3rd, heights 72/100/56 %.
  - Each has an avatar with a rarity-colored frame: gold for 1st, silver (`--fg-muted`) for 2nd, bronze (new token `--c-bronze`) for 3rd.
  - Rank numerals in Cinzel; verified XP in JetBrains Mono with a shield icon.
  - On first load the podium rises with a spring (≤ 400 ms, once per mount). Under reduced motion it appears instantly.
- **Rank rows:**
  - Fields: rank, Δ arrow (green up / crimson down / dim "—" when new), avatar, display name, `@username`, title badge, XP.
  - The current user's row uses an accent rail and stays sticky at the bottom when it is out of view.
  - Each row has a 44 px minimum height for touch.
- **States:**
  - Skeleton rows that reuse the `Skeleton` primitive.
  - Empty states: "No one on the board yet this week — complete a quest to claim rank 1"; for Friends, "Add friends to compare".
  - Offline: the cached snapshot with an "As of 14:05" chip.
  - Error: retry button and an explanation.
- **Mobile:** the podium becomes compact (avatars 48 px) and the list rows drop the title badge.

### 3.2 Auth experience: "entering the world"

- Brand animation: an SVG stroke-draw of the peak (CSS `stroke-dashoffset`, 900 ms). It runs once; there is no continuous animation except a subtle star-field drift (CSS transform, paused when `document.hidden`).
- All effects are CSS/SVG. No canvas or WebGL, which protects Lighthouse scores.
- Errors (cancelled consent, offline, provider error) appear in a `role="alert"` region with a retry button.
- The Google button follows Google's branding guidance (white or dark variant with the "G" mark). This is the one place a third-party brand appears, and it is allowed and required.

## 4. Theme system

### 4.1 Current state (audited)

- Tokens are defined in `src/styles/index.css`: `:root` holds the dark tokens and `:root.light` overrides them. `@theme inline` maps them to Tailwind utilities (`bg-surface`, `text-fg-muted`, …).
- The setting `settings.theme ∈ {'dark','light','system'}` exists (`settingsSchema`). It is applied by `useThemeSync` in `src/app/App.tsx` (toggles the `.light`/`.dark` classes, listens to `prefers-color-scheme`, updates `meta[name=theme-color]`), and exposed in **Settings → Appearance**.
- Charts already use `--chart-1/2/grid`, validated for both surfaces in v1.0. FullCalendar is themed through tokens in `src/features/calendar/calendar.css`.

### 4.2 Gaps found in the audit

| Gap | Evidence | Fix |
|---|---|---|
| Wrong-theme flash for light users | `index.html` hardcodes `class="dark"`; theme comes from IndexedDB (async) | Inline script in `<head>` reads `localStorage['ascend:theme']` (mirrored on every `updateSettings`) plus `matchMedia`, and sets `class`/`data-accent` before first paint |
| React Flow ignores *system* | `SkillTreePage.tsx:137` `colorMode={settings?.theme === 'light' ? …}` | Use a `useResolvedTheme()` hook (new, in `src/hooks/`) |
| MiniMap mask hardcoded | `SkillTreePage.tsx:150` `rgb(0 0 0 / 0.55)` | Token `--overlay` |
| Overlay scrims hardcoded | `dialog.tsx`, `CommandPalette.tsx`, `Celebrations.tsx` (`rgb(3_3_8/…)`) | Token `--scrim` (dark: `rgb(3 3 8/0.72)`, light: `rgb(25 22 42/0.35)`) |
| Inset highlights assume dark | `primitives.tsx`, `button.tsx`, `Shell.tsx`, `widgets.tsx` (`rgb(255_255_255/…)`) | Token `--highlight` (light: lower alpha) |
| Gradient stops hardcoded | `primitives.tsx:206-209` (`ProgressBar` fills), `button.tsx:17` (gold) | Tokens `--fill-*-from/to` |
| Campaign color hexes duplicated 3× | `CampaignsPage.tsx:13`, `CampaignWizard.tsx:48`, `SettingsPage.tsx:32` | One `CAMPAIGN_COLORS` map → CSS vars `--campaign-<name>` with per-theme values |
| `theme-color` meta hexes | `App.tsx:95` | Read from the computed `--bg` |

In total, about **41 color literals** sit outside the token system: 29 hex/rgb() plus 12 Tailwind arbitrary `rgb(_ _ _/…)`, counted with grep. The **target is 0** outside `index.css`, `calendar.css` and the avatar art (`Avatar.tsx` keeps its fixed crest gradients by design). This is enforced by a CI grep in Phase 1.

### 4.3 Semantic token additions

| Token | Purpose | Dark | Light |
|---|---|---|---|
| `--sidebar` | sidebar background | `--bg-raised @ 80%` | `#efece5` |
| `--input-bg`, `--input-border` | form fields (`.field`) | existing mix | `#ffffff`, `--line-strong` |
| `--focus-ring` | focus outline | `--accent` | darker accent step for ≥ 3:1 on white |
| `--scrim`, `--overlay` | modal backdrops | see 4.2 | see 4.2 |
| `--highlight` | top inner highlight | `rgb(255 255 255/0.04)` | `rgb(255 255 255/0.7)` |
| `--xp`, `--xp-glow` | XP numbers and bars | `--c-gold` | `#9a6a0c` |
| `--rarity-common/rare/epic/legendary` | achievements, titles | existing `RARITY_COLOR` values | contrast-adjusted steps |
| `--quest-main/side/daily/boss/legendary` | quest rails (`QuestRow` `CATEGORY_RAIL`) | existing | contrast-adjusted |
| `--success/--warning/--danger/--info` | status | emerald/gold/crimson/cyan | darker steps |
| `--c-bronze`, `--c-silver` | podium | new | new |

Each light value is validated against `--surface` for **WCAG 2.2 AA** contrast: 4.5:1 for text and 3:1 for UI components and focus indicators. Chart colors are re-run through the dataviz palette validator used in v1.0.

### 4.4 Behaviour

| Requirement | Implementation |
|---|---|
| Toggle in settings | Existing Appearance section; adds preview tiles |
| Quick toggle | Account menu item cycling Light → Dark → System, with an icon reflecting the resolved theme |
| Persist locally | `localStorage['ascend:theme']` mirror plus the Dexie setting |
| Sync for signed-in users | `user_settings.settings.theme`. A device can choose "Use this device's theme" (device-local override flag) |
| No flash | Pre-paint inline script (4.2) and the `color-scheme` CSS property per theme |
| System changes | Existing `matchMedia` listener, kept |
| Third-party widgets | FullCalendar via `calendar.css` tokens (audit both themes); React Flow `colorMode` from the resolved theme plus `.skill-flow` token overrides; Recharts uses CSS vars (already); Radix primitives are styled by our classes (already) |
| Reduced motion | Unchanged mechanism (`data-motion`) |

### 4.5 Theme QA matrix

Playwright visits every route (the 14 existing plus the new ones) × {light, dark} × {1440, 390 widths} and records:

1. **axe-core** violations, which must be 0 serious/critical (new dev dependency `@axe-core/playwright`; needs approval).
2. A screenshot artifact for visual review.
3. A first-paint class check: `document.documentElement.className` is captured before React mounts.

Charts and modals are opened explicitly (Analytics, QuestEditor, CommandPalette).

## 5. Profiles: customization details

### 5.1 Avatars

Predefined only: the 8 existing original sigils in `AVATARS`, plus **unlockable frames** tied to verified milestones. For example: level 10 Silver frame, 30-day verified streak Ember frame, first verified boss Crimson frame.

There are **no uploads** in 2.0. Uploads would bring:

- storage quota pressure (1 GB free)
- content moderation needs
- malicious-file risks
- a likely Supabase Storage egress cost

Generated initials are a fallback when an avatar ID is unknown.

### 5.2 Titles

The existing `TITLES` ladder (`src/domain/xp.ts`) uses the **verified** level for the public display. Special titles come from verified achievements, e.g. "Giant Slayer".

### 5.3 Profile themes

Four profile banner themes: Obsidian, Aurora, Ember, Verdant. These are gradient presets built from existing tokens. The backgrounds are cosmetic only.

## 6. UX details

| Area | Plan |
|---|---|
| Microinteractions | Reuse `CompleteButton` burst, XP float and level-up ceremony. New: **rank-up toast** when the weekly rank improves into the top 10, shown at most once per day |
| Transitions | Existing `PageTransition`. Auth uses a cross-fade into the shell |
| Loading | `Skeleton` everywhere data is remote. Local data never shows skeletons (it is instant) |
| Errors | Inline plus toast. Every remote failure keeps local functionality working |
| Success | Toasts (existing `useUI().toast`) |
| Celebrations | Verified achievements unlock silently server-side and appear on the next profile visit with a one-time banner (local achievements keep their current flow) |
| Dialogs | Radix `Dialog` (focus trap, Esc, `aria-describedby`) |
| Keyboard | All new flows are operable without a mouse; leaderboard rows are links; tabs are Radix |
| Touch | 44 px targets; swipe-free (no hidden gesture-only actions) |
| Sync indicator states | Synced ✓ · Syncing (spinner) · Offline · N pending · Conflicts (amber, links to settings) · Sign in again (red) |

## 7. Responsive behaviour

| Width | Auth | Leaderboard | Profile |
|---|---|---|---|
| ≥ 1280 | split hero + card | podium + list side by side with a "How ranking works" panel | two columns (card + stats/showcase) |
| 768–1279 | card over a dimmed hero | podium above list | single column |
| < 768 | card full width, brand compact | compact podium, rows without titles | single column, sticky actions bar |

Every responsive grid starts from `grid-cols-1`. That's the v1.0 lesson: grids without a `minmax(0,1fr)` base overflowed on mobile.

## 8. Accessibility targets

- axe: 0 serious/critical violations on every route in both themes.
- Lighthouse accessibility ≥ 98, both themes (measured, not assumed; current v1.0 dark: 100).
- Contrast AA verified by token-level tests (`src/styles/contrast.test.ts` computes ratios from the token table).
- Screen-reader labels for ranks ("Rank 4, up 2, Ada, 1,240 verified XP").
- Reduced motion disables the podium rise, the star field and the rank-up animation.
