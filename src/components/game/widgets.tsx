import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/primitives';
import type { HeatCell } from '@/domain/analytics';
import { formatDateKey } from '@/lib/dates';
import { cn, formatNumber } from '@/lib/utils';

export function XpBar({ into, needed, level, compact }: { into: number; needed: number; level: number; compact?: boolean }) {
  const pct = needed ? Math.min(1, into / needed) : 0;
  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-semibold text-fg-muted">Level {level}</span>
          <span className="font-num text-fg-dim">
            <span className="text-fg">{formatNumber(into)}</span> / {formatNumber(needed)} XP
          </span>
        </div>
      )}
      <div
        className="relative h-2.5 overflow-hidden rounded-full border border-line bg-bg"
        role="progressbar"
        aria-label="Experience toward next level"
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-valuenow={into}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,var(--accent-2),var(--accent),var(--c-cyan))]"
          initial={false}
          animate={{ width: `${pct * 100}%` }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
        >
          <span className="absolute inset-y-0 w-1/3 animate-shimmer bg-[linear-gradient(90deg,transparent,var(--shine),transparent)]" />
          <span className="absolute top-0 right-0 bottom-0 w-1.5 rounded-full bg-white/80 blur-[2px]" />
        </motion.div>
        {[0.25, 0.5, 0.75].map((t) => (
          <span key={t} className="absolute inset-y-0 w-px bg-bg/70" style={{ left: `${t * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = 'accent',
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: 'accent' | 'gold' | 'emerald' | 'cyan' | 'crimson';
  className?: string;
}) {
  const color = { accent: 'text-accent', gold: 'text-gold', emerald: 'text-emerald', cyan: 'text-cyan', crimson: 'text-crimson' }[tone];
  return (
    <div className={cn('relative overflow-hidden rounded-[12px] border border-line bg-surface-2/60 p-3.5', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[0.7rem] font-semibold tracking-wider text-fg-dim uppercase">{label}</span>
        {icon && <span className={cn('[&_svg]:size-4', color)}>{icon}</span>}
      </div>
      <div className="mt-1.5 font-num text-[1.55rem] leading-none font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-fg-muted">{sub}</div>}
    </div>
  );
}

const HEAT_BG = [
  'var(--surface-3)',
  'color-mix(in oklab, var(--c-emerald) 28%, var(--surface-3))',
  'color-mix(in oklab, var(--c-emerald) 50%, var(--surface-3))',
  'color-mix(in oklab, var(--c-emerald) 75%, var(--surface-3))',
  'var(--c-emerald)',
];

export function Heatmap({ cols, cell = 12, gap = 3 }: { cols: HeatCell[][]; cell?: number; gap?: number }) {
  const days = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" tabIndex={0} role="region" aria-label="Activity heatmap (scrollable)">
      <div className="flex flex-col pt-[18px] text-[0.6rem] text-fg-dim" style={{ gap }}>
        {days.map((d, i) => (
          <span key={i} style={{ height: cell, lineHeight: `${cell}px` }}>
            {d}
          </span>
        ))}
      </div>
      <div>
        <div className="mb-1 flex text-[0.6rem] text-fg-dim" style={{ gap }}>
          {cols.map((c, i) => {
            const first = c[0];
            const show = i === 0 || first.date.slice(5, 7) !== cols[i - 1][0].date.slice(5, 7);
            return (
              <span key={i} style={{ width: cell }} className="overflow-visible whitespace-nowrap">
                {show ? formatDateKey(first.date, 'MMM') : ''}
              </span>
            );
          })}
        </div>
        <div className="flex" style={{ gap }} role="grid" aria-label="Activity heatmap">
          {cols.map((c, i) => (
            <div key={i} className="flex flex-col" style={{ gap }} role="row">
              {c.map((d) =>
                d.count < 0 ? (
                  <span key={d.date} style={{ width: cell, height: cell }} />
                ) : (
                  <Tooltip key={d.date} content={`${formatDateKey(d.date, 'EEE, MMM d')}: ${d.count} activit${d.count === 1 ? 'y' : 'ies'}`}>
                    <motion.span
                      role="gridcell"
                      aria-label={`${d.date}: ${d.count}`}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.008 }}
                      className="rounded-[3px]"
                      style={{ width: cell, height: cell, background: HEAT_BG[d.level], boxShadow: d.level >= 3 ? '0 0 8px color-mix(in oklab, var(--c-emerald) 45%, transparent)' : undefined }}
                    />
                  </Tooltip>
                ),
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1 text-[0.6rem] text-fg-dim">
          Less
          {HEAT_BG.map((bg, i) => (
            <span key={i} className="rounded-[3px]" style={{ width: 10, height: 10, background: bg }} />
          ))}
          More
        </div>
      </div>
    </div>
  );
}
