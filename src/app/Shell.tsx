import { Bell, ChevronsLeft, ChevronsRight, Coins, Flame, Menu, Monitor, Moon, Plus, Search, Sun, Target, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Avatar } from '@/components/game/Avatar';
import { XpBar } from '@/components/game/widgets';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/dialog';
import { Kbd, ProgressRing, Tooltip } from '@/components/ui/primitives';
import { isDemoMode, setDemoMode } from '@/db/schema';
import { buildBriefing } from '@/domain/briefing';
import type { Settings } from '@/domain/types';
import { useAchievementUnlocks, useCampaigns, useProfile, useQuests, useSettings, useTimeBlocks, useToday } from '@/hooks/data';
import { diffDays, relativeDayLabel } from '@/lib/dates';
import { THEME_CYCLE, THEME_LABEL } from '@/lib/theme';
import { cn, formatNumber } from '@/lib/utils';
import { updateSettings } from '@/services/core';
import { ACHIEVEMENTS } from '@/domain/achievements';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import { useUI } from '@/store/ui';
import { NAV, NAV_GROUP_LABEL, type NavItem } from './nav';

function NavLinkItem({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[0.85rem] font-semibold transition-colors',
          isActive ? 'text-fg' : 'text-fg-muted hover:bg-surface-2/70 hover:text-fg',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 rounded-[10px] border border-[color-mix(in_oklab,var(--accent)_30%,transparent)] bg-[linear-gradient(90deg,color-mix(in_oklab,var(--accent)_18%,transparent),color-mix(in_oklab,var(--accent)_4%,transparent))]"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          {isActive && <motion.span layoutId="nav-rail" className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-accent shadow-[0_0_12px_var(--accent)]" />}
          <Icon className={cn('relative size-[18px] shrink-0 transition-colors', isActive ? 'text-accent' : 'text-fg-dim group-hover:text-fg-muted')} />
          {!collapsed && <span className="relative truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
  return collapsed ? <Tooltip content={item.label} side="right">{link}</Tooltip> : link;
}

function NavGroups({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const groups = (['play', 'plan', 'grow', 'system'] as const).map((g) => ({ g, items: NAV.filter((n) => n.group === g) }));
  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {groups.map(({ g, items }) => (
        <div key={g}>
          {!collapsed && <div className="eyebrow mb-1.5 px-3 text-[0.6rem]!">{NAV_GROUP_LABEL[g]}</div>}
          {collapsed && <div className="mx-auto mb-2 h-px w-6 bg-line" />}
          <div className="flex flex-col gap-0.5">
            {items.map((i) => <NavLinkItem key={i.to} item={i} collapsed={collapsed} onNavigate={onNavigate} />)}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2" aria-label="Ascend home">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8 drop-shadow-[0_0_12px_color-mix(in_oklab,var(--c-gold)_35%,transparent)]" />
      {!collapsed && (
        <div className="leading-none">
          <div className="font-display text-[1.05rem] font-bold tracking-[0.22em]">ASCEND</div>
          <div className="mt-1 text-[0.58rem] font-semibold tracking-[0.25em] text-fg-dim uppercase">Productivity RPG</div>
        </div>
      )}
    </Link>
  );
}

const THEME_ICON = { dark: Moon, light: Sun, system: Monitor } as const;

/** Cycles Dark → Light → System. The full picker with previews lives in Settings → Appearance. */
function ThemeToggle({ theme }: { theme: Settings['theme'] }) {
  const Icon = THEME_ICON[theme];
  const next = THEME_CYCLE[theme];
  return (
    <Tooltip content={`Theme: ${THEME_LABEL[theme]} — switch to ${THEME_LABEL[next]}`}>
      <button
        onClick={() => void updateSettings({ theme: next })}
        className="grid h-8 w-8 shrink-0 place-items-center self-center rounded-lg text-fg-dim hover:bg-surface-2 hover:text-fg"
        aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[next]}`}
        data-testid="theme-toggle"
      >
        <Icon className="size-4" />
      </button>
    </Tooltip>
  );
}

export function Sidebar() {
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const setCollapsed = useUI((s) => s.setSidebarCollapsed);
  const settings = useSettings();
  const profile = useProfile();
  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 252 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-bg-raised/80 py-4 backdrop-blur md:flex"
    >
      <div className={cn('mb-6', collapsed ? 'px-3' : 'px-3')}>
        <Brand collapsed={collapsed} />
      </div>
      <div className={cn('min-h-0 flex-1 overflow-y-auto', collapsed ? 'px-3' : 'px-3')}>
        <NavGroups collapsed={collapsed} />
      </div>
      <div className="mt-3 border-t border-line px-3 pt-3">
        {settings && profile && (
          <Link to="/settings" className={cn('flex items-center gap-3 rounded-[12px] p-2 transition-colors hover:bg-surface-2', collapsed && 'justify-center p-1')}>
            <Avatar id={settings.avatarId} size={collapsed ? 36 : 40} glow={false} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{settings.playerName}</div>
                <div className="truncate text-[0.7rem] text-fg-dim">
                  Lv {profile.level.level}
                  {settings.showTitle && ` · ${profile.level.title}`}
                </div>
              </div>
            )}
          </Link>
        )}
        <div className={cn('mt-2 flex gap-1', collapsed && 'flex-col')}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-8 flex-1 items-center justify-center gap-2 rounded-lg text-xs text-fg-dim hover:bg-surface-2 hover:text-fg"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse <Kbd>[</Kbd></>}
          </button>
          {settings && <ThemeToggle theme={settings.theme} />}
        </div>
      </div>
    </motion.aside>
  );
}

export function MobileNav() {
  const open = useUI((s) => s.mobileNavOpen);
  const setOpen = useUI((s) => s.setMobileNavOpen);
  const location = useLocation();
  const primary = [NAV[0], NAV[1], NAV[2], NAV[7]];
  return (
    <>
      <nav aria-label="Primary" className="glass safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line md:hidden">
        <div className="flex h-16 items-stretch justify-around">
          {primary.map((item) => {
            const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={cn('relative flex flex-1 flex-col items-center justify-center gap-1 text-[0.62rem] font-semibold', active ? 'text-accent' : 'text-fg-dim')}>
                {active && <motion.span layoutId="mnav" className="absolute top-0 h-[2px] w-10 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />}
                <Icon className="size-5" />
                {item.label.split(' ')[0].replace("'s", '')}
              </NavLink>
            );
          })}
          <button onClick={() => setOpen(true)} className="flex flex-1 flex-col items-center justify-center gap-1 text-[0.62rem] font-semibold text-fg-dim" aria-label="Open menu">
            <Menu className="size-5" /> More
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/60 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div
              className="safe-top fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-line bg-bg-raised p-4 md:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              role="dialog"
              aria-label="Navigation"
            >
              <div className="mb-6 flex items-center justify-between">
                <Brand collapsed={false} />
                <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Close menu"><X /></Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pl-3">
                <NavGroups collapsed={false} onNavigate={() => setOpen(false)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

interface Note {
  id: string;
  tone: 'crimson' | 'gold' | 'cyan' | 'accent';
  title: string;
  detail: string;
  to?: string;
}

function useNotifications(): Note[] {
  const quests = useQuests();
  const settings = useSettings();
  const unlocks = useAchievementUnlocks();
  const blocks = useTimeBlocks();
  const today = useToday();
  return useMemo(() => {
    if (!quests || !settings || !unlocks || !blocks) return [];
    const out: Note[] = [];
    const b = buildBriefing({ quests, settings, today, timeBlocks: blocks });
    if (settings.notifications.overdue && b.overdue.length)
      out.push({ id: 'overdue', tone: 'crimson', title: `${b.overdue.length} overdue quest${b.overdue.length > 1 ? 's' : ''}`, detail: 'Rebalance from the campaign page or reschedule them.', to: '/today' });
    if (settings.notifications.deadlines)
      for (const q of b.upcoming.slice(0, 4)) out.push({ id: `due-${q.id}`, tone: 'gold', title: q.title, detail: `Due ${relativeDayLabel(q.dueDate!, today).toLowerCase()}`, to: '/today' });
    if (settings.notifications.backup && settings.backupReminderDays > 0) {
      const last = settings.lastBackupAt?.slice(0, 10);
      const age = last ? diffDays(today, last) : null;
      if (age === null || age >= settings.backupReminderDays)
        out.push({ id: 'backup', tone: 'cyan', title: 'Back up your journal', detail: age === null ? 'You have never exported a backup.' : `Last backup ${age} days ago.`, to: '/settings#data' });
    }
    if (settings.notifications.achievements)
      for (const u of [...unlocks].sort((x, y) => y.unlockedAt.localeCompare(x.unlockedAt)).slice(0, 3)) {
        const def = ACHIEVEMENTS.find((a) => a.id === u.id);
        if (def && diffDays(today, u.unlockedAt.slice(0, 10)) <= 3) out.push({ id: `ach-${u.id}`, tone: 'accent', title: `Unlocked: ${def.title}`, detail: def.description, to: '/achievements' });
      }
    return out;
  }, [quests, settings, unlocks, blocks, today]);
}

function Notifications() {
  const notes = useNotifications();
  const urgent = notes.filter((n) => n.tone === 'crimson' || n.tone === 'cyan').length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative grid size-9 place-items-center rounded-[10px] text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={`Notifications (${notes.length})`}>
          <Bell className="size-[18px]" />
          {notes.length > 0 && <span className={cn('absolute top-1.5 right-1.5 size-2 rounded-full', urgent ? 'bg-crimson' : 'bg-accent')} />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px]">
        <div className="border-b border-line px-4 py-3 font-display text-sm font-semibold tracking-wide">Notifications</div>
        <div className="max-h-96 overflow-y-auto p-1.5">
          {notes.length === 0 && <p className="px-3 py-8 text-center text-sm text-fg-dim">All clear. Nothing needs your attention.</p>}
          {notes.map((n) => (
            <Link key={n.id} to={n.to ?? '/'} className="flex gap-3 rounded-[10px] px-3 py-2.5 hover:bg-surface-3">
              <span className={cn('mt-1.5 size-2 shrink-0 rotate-45', { crimson: 'bg-crimson', gold: 'bg-gold', cyan: 'bg-cyan', accent: 'bg-accent' }[n.tone])} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{n.title}</div>
                <div className="text-xs text-fg-muted">{n.detail}</div>
              </div>
            </Link>
          ))}
        </div>
        <p className="border-t border-line px-4 py-2.5 text-[0.68rem] text-fg-dim">In-app reminders only — browsers do not guarantee background notifications.</p>
      </PopoverContent>
    </Popover>
  );
}

export function Topbar() {
  const profile = useProfile();
  const settings = useSettings();
  const quests = useQuests();
  const campaigns = useCampaigns();
  const blocks = useTimeBlocks();
  const today = useToday();
  const setPalette = useUI((s) => s.setPaletteOpen);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const setMobileNav = useUI((s) => s.setMobileNavOpen);
  const briefing = useMemo(() => (quests && settings && blocks ? buildBriefing({ quests, settings, today, timeBlocks: blocks }) : null), [quests, settings, blocks, today]);
  const total = briefing ? briefing.pending.length + briefing.completedToday.length : 0;
  const pct = total ? (briefing!.completedToday.length / total) : 0;
  const active = campaigns?.find((c) => c.id === settings?.defaultCampaignId && c.status === 'active') ?? campaigns?.find((c) => c.status === 'active');
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="glass safe-top sticky top-0 z-30 border-b border-line">
      {isDemoMode() && (
        <div className="flex items-center justify-center gap-3 bg-[color-mix(in_oklab,var(--c-gold)_14%,transparent)] px-4 py-1.5 text-xs font-semibold text-gold">
          Demo mode — sample data in a separate database. Your real journal is untouched.
          <button className="underline" onClick={() => { setDemoMode(false); location.reload(); }}>Exit demo</button>
        </div>
      )}
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></Button>
        {profile && (
          <div className="flex min-w-0 items-center gap-3">
            <Tooltip content={`${profile.level.title} — ${formatNumber(profile.totalXp)} total XP`}>
              <div className="relative grid size-10 shrink-0 rotate-45 place-items-center rounded-[10px] border border-[color-mix(in_oklab,var(--c-gold)_50%,transparent)] bg-surface-2 shadow-[0_0_18px_-6px_var(--c-gold)]">
                <span className="-rotate-45 font-display text-sm font-bold text-gradient-gold" data-testid="topbar-level">{profile.level.level}</span>
              </div>
            </Tooltip>
            <div className="hidden w-44 sm:block lg:w-56">
              <div className="mb-1 flex justify-between text-[0.68rem]">
                <span className="font-semibold text-fg-muted">{settings?.showTitle ? profile.level.title : `Level ${profile.level.level}`}</span>
                <span className="font-num text-fg-dim" data-testid="topbar-xp">{formatNumber(profile.level.xpIntoLevel)}/{formatNumber(profile.level.xpForNext)}</span>
              </div>
              <XpBar into={profile.level.xpIntoLevel} needed={profile.level.xpForNext} level={profile.level.level} compact />
            </div>
          </div>
        )}
        <div className="ml-2 hidden items-center gap-4 lg:flex">
          <Tooltip content={`${briefing?.completedToday.length ?? 0} of ${total} quests completed today`}>
            <div className="flex items-center gap-2">
              <ProgressRing value={pct} size={34} stroke={3.5} tone="var(--c-emerald)">
                <span className="font-num text-[0.6rem] font-bold">{Math.round(pct * 100)}</span>
              </ProgressRing>
              <span className="text-[0.7rem] leading-tight text-fg-dim">Today<br /><span className="font-semibold text-fg-muted">complete</span></span>
            </div>
          </Tooltip>
          <Tooltip content={`Longest streak: ${profile?.streak.longest ?? 0} days${profile?.streak.freezesAvailable ? ` · ${profile.streak.freezesAvailable} freeze(s) ready` : ''}`}>
            <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1">
              <Flame className={cn('size-4', profile?.streak.activeToday ? 'text-gold' : 'text-fg-dim')} fill={profile?.streak.activeToday ? 'currentColor' : 'none'} />
              <span className="font-num text-sm font-semibold" data-testid="topbar-streak">{profile?.streak.current ?? 0}</span>
            </div>
          </Tooltip>
          <Tooltip content="Coins — redeem in the reward shop">
            <Link to="/achievements?tab=rewards" className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1">
              <Coins className="size-4 text-gold" />
              <span className="font-num text-sm font-semibold">{formatNumber(profile?.coins ?? 0)}</span>
            </Link>
          </Tooltip>
          {active && (
            <Link to={`/campaigns/${active.id}`} className="hidden max-w-52 items-center gap-1.5 truncate rounded-full border border-line px-2.5 py-1 text-xs text-fg-muted hover:text-fg xl:flex">
              <Target className="size-3.5 shrink-0 text-accent" />
              <span className="truncate">{active.name}</span>
            </Link>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <SyncIndicator />
          <button onClick={() => setPalette(true)} className="hidden h-9 shrink-0 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-sm whitespace-nowrap text-fg-dim transition-colors hover:border-line-strong hover:text-fg-muted sm:flex" aria-label="Open command palette">
            <Search className="size-4" />
            <span className="hidden 2xl:inline">Search or command…</span>
            <Kbd className="whitespace-nowrap">{isMac ? '⌘' : 'Ctrl'} K</Kbd>
          </button>
          <Button size="icon" variant="ghost" className="sm:hidden" onClick={() => setPalette(true)} aria-label="Search"><Search /></Button>
          <Notifications />
          <Button variant="primary" size="sm" onClick={() => openQuickAdd()} className="h-9" data-testid="quick-add-button">
            <Plus /> <span className="hidden sm:inline">Quest</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <motion.div key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
