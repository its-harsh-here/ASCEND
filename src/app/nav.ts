import {
  Archive, BarChart3, CalendarDays, Flag, GanttChart, KanbanSquare, LayoutDashboard, NotebookPen, Settings, Sparkles, Sun, Timer, Trophy,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  group: 'play' | 'plan' | 'grow' | 'system';
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Command Center', icon: LayoutDashboard, shortcut: 'G D', group: 'play' },
  { to: '/today', label: "Today's Quests", icon: Sun, shortcut: 'G T', group: 'play' },
  { to: '/campaigns', label: 'Campaigns', icon: Flag, shortcut: 'G C', group: 'plan' },
  { to: '/board', label: 'Quest Board', icon: KanbanSquare, shortcut: 'G B', group: 'plan' },
  { to: '/timeline', label: 'Timeline', icon: GanttChart, shortcut: 'G L', group: 'plan' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, shortcut: 'G K', group: 'plan' },
  { to: '/skills', label: 'Skill Tree', icon: Sparkles, shortcut: 'G S', group: 'grow' },
  { to: '/focus', label: 'Focus Chamber', icon: Timer, shortcut: 'G F', group: 'grow' },
  { to: '/achievements', label: 'Achievements', icon: Trophy, shortcut: 'G H', group: 'grow' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, shortcut: 'G A', group: 'grow' },
  { to: '/reviews', label: 'Reviews', icon: NotebookPen, shortcut: 'G R', group: 'grow' },
  { to: '/archive', label: 'Quest Archive', icon: Archive, group: 'system' },
  { to: '/settings', label: 'Settings', icon: Settings, shortcut: 'G ,', group: 'system' },
];

export const NAV_GROUP_LABEL: Record<NavItem['group'], string> = {
  play: 'Play',
  plan: 'Plan',
  grow: 'Grow',
  system: 'System',
};

export const G_SHORTCUTS: Record<string, string> = {
  d: '/', t: '/today', c: '/campaigns', b: '/board', l: '/timeline', k: '/calendar', s: '/skills', f: '/focus',
  h: '/achievements', a: '/analytics', r: '/reviews', ',': '/settings',
};
