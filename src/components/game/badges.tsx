import { Calendar, CalendarClock, Crown, Flag, Gem, Repeat, Repeat2, Scroll, Skull, Sparkles, Swords } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Tooltip, type Tone } from '@/components/ui/primitives';
import { CATEGORY_LABEL, DIFFICULTY_LABEL, PRIORITY_LABEL, type Difficulty, type Priority, type QuestCategory } from '@/domain/types';
import { relativeDayLabel } from '@/lib/dates';
import { cn } from '@/lib/utils';

export const DIFFICULTY_TONE: Record<Difficulty, Tone> = {
  trivial: 'neutral',
  easy: 'emerald',
  medium: 'cyan',
  hard: 'indigo',
  boss: 'crimson',
  legendary: 'gold',
};

export function DifficultyBadge({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  const pips = { trivial: 1, easy: 2, medium: 3, hard: 4, boss: 5, legendary: 6 }[difficulty];
  return (
    <Badge tone={DIFFICULTY_TONE[difficulty]} className={className}>
      <span className="flex gap-[2px]" aria-hidden>
        {Array.from({ length: Math.min(pips, 4) }, (_, i) => (
          <span key={i} className="size-[5px] rotate-45 rounded-[1px] bg-current opacity-80" />
        ))}
      </span>
      {DIFFICULTY_LABEL[difficulty]}
    </Badge>
  );
}

const CATEGORY_ICON: Record<QuestCategory, ReactNode> = {
  main: <Scroll />,
  side: <Sparkles />,
  daily: <Repeat />,
  weekly: <Repeat2 />,
  boss: <Skull />,
  legendary: <Gem />,
};
const CATEGORY_TONE: Record<QuestCategory, Tone> = {
  main: 'accent',
  side: 'cyan',
  daily: 'emerald',
  weekly: 'emerald',
  boss: 'crimson',
  legendary: 'gold',
};

export function CategoryBadge({ category, compact }: { category: QuestCategory; compact?: boolean }) {
  return (
    <Badge tone={CATEGORY_TONE[category]}>
      {CATEGORY_ICON[category]}
      {compact ? CATEGORY_LABEL[category].split(' ')[0] : CATEGORY_LABEL[category]}
    </Badge>
  );
}

export function CategoryIcon({ category, className }: { category: QuestCategory; className?: string }) {
  return <span className={cn('inline-flex [&_svg]:size-4', className)}>{CATEGORY_ICON[category]}</span>;
}

const PRIORITY_COLOR: Record<Priority, string> = {
  low: 'text-fg-dim',
  medium: 'text-cyan',
  high: 'text-gold',
  critical: 'text-crimson',
};

export function PriorityFlag({ priority, showLabel }: { priority: Priority; showLabel?: boolean }) {
  return (
    <Tooltip content={`${PRIORITY_LABEL[priority]} priority`}>
      <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', PRIORITY_COLOR[priority])}>
        <Flag className="size-3.5" fill={priority === 'critical' || priority === 'high' ? 'currentColor' : 'none'} />
        {showLabel && PRIORITY_LABEL[priority]}
      </span>
    </Tooltip>
  );
}

export function XpChip({ xp, className }: { xp: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-num text-[0.72rem] font-semibold text-gold', className)}>
      <Crown className="size-3" />
      {xp} XP
    </span>
  );
}

export function DueChip({ date, today, overdue, kind = 'due' }: { date: string; today: string; overdue?: boolean; kind?: 'due' | 'scheduled' }) {
  const Icon = kind === 'due' ? CalendarClock : Calendar;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[0.72rem] font-medium', overdue ? 'text-crimson' : date === today ? 'text-cyan' : 'text-fg-muted')}>
      <Icon className="size-3" />
      {kind === 'due' ? 'Due ' : ''}
      {relativeDayLabel(date, today)}
    </span>
  );
}

export function BossIcon() {
  return <Swords className="size-4" />;
}
