import { Check, Clock, Link2, ListChecks, Lock, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useState, type MouseEvent, type ReactNode } from 'react';
import { CategoryIcon, DifficultyBadge, DueChip, PriorityFlag, XpChip } from '@/components/game/badges';
import { Checkbox, Tooltip } from '@/components/ui/primitives';
import { isOverdue } from '@/domain/briefing';
import type { Quest } from '@/domain/types';
import { cn, formatMinutes } from '@/lib/utils';

const CATEGORY_RAIL: Record<Quest['category'], string> = {
  main: 'var(--accent)',
  side: 'var(--c-cyan)',
  daily: 'var(--c-emerald)',
  weekly: 'var(--c-emerald)',
  boss: 'var(--c-crimson)',
  legendary: 'var(--c-gold)',
};

/** Diamond completion control with a satisfying fill animation. */
export function CompleteButton({
  done,
  onComplete,
  onReopen,
  blocked,
  label,
}: {
  done: boolean;
  onComplete: (origin: { x: number; y: number }) => void;
  onReopen?: () => void;
  blocked?: boolean;
  label: string;
}) {
  const [burst, setBurst] = useState(0);
  const click = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (done) return onReopen?.();
    const r = e.currentTarget.getBoundingClientRect();
    setBurst((b) => b + 1);
    onComplete({ x: r.left + r.width / 2, y: r.top });
  };
  return (
    <Tooltip content={done ? 'Reopen quest' : blocked ? 'Has unfinished prerequisites — you can still complete it' : 'Complete quest'}>
      <button
        onClick={click}
        aria-label={done ? `Reopen ${label}` : `Complete ${label}`}
        aria-pressed={done}
        className="group/cb relative grid size-7 shrink-0 place-items-center"
      >
        <motion.span
          className={cn(
            'absolute size-[18px] rotate-45 rounded-[4px] border-[1.5px] transition-colors',
            done ? 'border-emerald bg-emerald' : 'border-fg-dim group-hover/cb:border-emerald group-hover/cb:bg-[color-mix(in_oklab,var(--c-emerald)_15%,transparent)]',
          )}
          animate={done ? { scale: [1, 1.25, 1] } : { scale: 1 }}
          transition={{ duration: 0.35 }}
        />
        {done ? (
          <Check className="relative size-3 text-accent-fg" strokeWidth={3.5} />
        ) : (
          <Check className="relative size-3 text-emerald opacity-0 transition-opacity group-hover/cb:opacity-100" strokeWidth={3} />
        )}
        <AnimatePresence>
          {burst > 0 && (
            <motion.span
              key={burst}
              className="pointer-events-none absolute size-7 rounded-full border-2 border-emerald"
              initial={{ scale: 0.4, opacity: 0.9 }}
              animate={{ scale: 2.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>
      </button>
    </Tooltip>
  );
}

export interface QuestRowProps {
  quest: Quest;
  today: string;
  xp: number;
  campaignName?: string;
  subtasks?: { done: number; total: number };
  blocked?: boolean;
  onOpen: () => void;
  onComplete: (origin: { x: number; y: number }) => void;
  onReopen: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (v: boolean) => void;
  compact?: boolean;
  trailing?: ReactNode;
  className?: string;
}

export const QuestRow = memo(function QuestRow({
  quest: q,
  today,
  xp,
  campaignName,
  subtasks,
  blocked,
  onOpen,
  onComplete,
  onReopen,
  selectable,
  selected,
  onSelect,
  compact,
  trailing,
  className,
}: QuestRowProps) {
  const done = q.status === 'done';
  const overdue = isOverdue(q, today);
  return (
    <motion.div
      layout="position"
      data-testid="quest-row"
      data-quest-title={q.title}
      className={cn(
        'group relative flex items-start gap-2.5 rounded-[12px] border border-transparent px-2.5 py-2.5 transition-colors hover:border-line hover:bg-surface-2/70',
        selected && 'border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]',
        className,
      )}
    >
      <span className="absolute top-3 bottom-3 left-0 w-[2px] rounded-full opacity-70" style={{ background: CATEGORY_RAIL[q.category] }} aria-hidden />
      {selectable && (
        <div className="pt-1.5 pl-1" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={!!selected} onCheckedChange={(v) => onSelect?.(v === true)} aria-label={`Select ${q.title}`} />
        </div>
      )}
      <CompleteButton done={done} onComplete={onComplete} onReopen={onReopen} blocked={blocked} label={q.title} />
      <button onClick={onOpen} className="min-w-0 flex-1 text-left focus-visible:outline-offset-4">
        <div className="flex items-center gap-2">
          <CategoryIcon category={q.category} className={cn('text-fg-dim [&_svg]:size-3.5', q.category === 'boss' && 'text-crimson', q.category === 'legendary' && 'text-gold')} />
          <span className={cn('truncate text-[0.92rem] font-semibold', done && 'text-fg-dim line-through decoration-emerald/60')}>{q.title}</span>
          {q.deadlineLocked && (
            <Tooltip content="Deadline locked">
              <Lock className="size-3 shrink-0 text-gold" />
            </Tooltip>
          )}
          {blocked && !done && (
            <Tooltip content="Waiting on prerequisite quests">
              <Link2 className="size-3 shrink-0 text-fg-dim" />
            </Tooltip>
          )}
        </div>
        {!compact && q.description && <p className="mt-0.5 line-clamp-1 text-[0.8rem] text-fg-muted">{q.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <DifficultyBadge difficulty={q.difficulty} />
          <XpChip xp={xp} />
          {q.estimatedMinutes > 0 && (
            <span className="inline-flex items-center gap-1 font-num text-[0.72rem] text-fg-muted">
              <Clock className="size-3" />
              {q.actualMinutes > 0 ? `${formatMinutes(q.actualMinutes)} / ` : ''}
              {formatMinutes(q.estimatedMinutes)}
            </span>
          )}
          {q.dueDate && !done && <DueChip date={q.dueDate} today={today} overdue={overdue} />}
          {!q.dueDate && q.scheduledDate && q.scheduledDate !== today && !done && <DueChip date={q.scheduledDate} today={today} overdue={overdue} kind="scheduled" />}
          {subtasks && subtasks.total > 0 && (
            <span className="inline-flex items-center gap-1 font-num text-[0.72rem] text-fg-muted">
              <ListChecks className="size-3" />
              {subtasks.done}/{subtasks.total}
            </span>
          )}
          {campaignName && <span className="truncate text-[0.72rem] text-fg-dim">· {campaignName}</span>}
          {q.status === 'in_progress' && <span className="text-[0.72rem] font-semibold text-cyan">In progress</span>}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1 pt-1">
        <PriorityFlag priority={q.priority} />
        {done && (
          <Tooltip content="Reopen">
            <button onClick={onReopen} className="grid size-6 place-items-center rounded-md text-fg-dim opacity-0 transition hover:bg-surface-3 hover:text-fg group-hover:opacity-100" aria-label="Reopen quest">
              <RotateCcw className="size-3.5" />
            </button>
          </Tooltip>
        )}
        {trailing}
      </div>
    </motion.div>
  );
});
