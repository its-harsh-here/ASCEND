import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/* ─────────── Panel ─────────── */
export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  runes?: boolean;
}
export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel({ className, runes, ...props }, ref) {
  return <div ref={ref} className={cn('panel', runes && 'panel-runes', className)} {...props} />;
});

export function PanelHeader({
  eyebrow,
  title,
  icon,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 text-accent [&_svg]:size-[18px]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
          <h2 className="truncate font-display text-[1.02rem] font-semibold tracking-wide text-fg">{title}</h2>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/* ─────────── Form controls ─────────── */

/**
 * A row that shows its label beside (not around) its control provides the label/hint ids here, so the
 * control is still named for assistive tech. Explicit aria-label / aria-labelledby / <label for> always win.
 */
export const ControlLabelContext = createContext<{ labelId?: string; hintId?: string }>({});

type Named = { id?: string; 'aria-label'?: string; 'aria-labelledby'?: string; 'aria-describedby'?: string };
function useLabelling(props: Named): Named {
  const { labelId, hintId } = useContext(ControlLabelContext);
  if (props['aria-label'] || props['aria-labelledby']) return {};
  return {
    ...(labelId ? { 'aria-labelledby': labelId } : {}),
    ...(hintId && !props['aria-describedby'] ? { 'aria-describedby': hintId } : {}),
  };
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn('field', className)} {...useLabelling(props)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn('field min-h-[88px] resize-y', className)} {...useLabelling(props)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn('field cursor-pointer', className)} {...useLabelling(props)} {...props} />;
});

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-[0.78rem] font-semibold text-fg-muted', className)} {...props} />;
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-fg-dim">{hint}</p>}
    </div>
  );
}

export const Checkbox = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & { tone?: 'accent' | 'emerald' }
>(function Checkbox({ className, tone = 'accent', ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-strong bg-bg transition-colors',
        tone === 'emerald'
          ? 'data-[state=checked]:border-emerald data-[state=checked]:bg-emerald'
          : 'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3 text-accent-fg" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

export const Switch = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(
  function Switch({ className, ...props }, ref) {
    const labelling = useLabelling(props);
    return (
      <SwitchPrimitive.Root
        ref={ref}
        {...labelling}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line-strong bg-surface-3 transition-colors data-[state=checked]:border-transparent data-[state=checked]:bg-accent',
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb className="block size-[18px] translate-x-[3px] rounded-full bg-fg shadow transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-accent-fg" />
      </SwitchPrimitive.Root>
    );
  },
);

/* ─────────── Badge ─────────── */
const TONES = {
  neutral: 'border-line-strong bg-surface-2 text-fg-muted',
  accent: 'border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-accent',
  cyan: 'border-[color-mix(in_oklab,var(--c-cyan)_35%,transparent)] bg-[color-mix(in_oklab,var(--c-cyan)_10%,transparent)] text-cyan',
  gold: 'border-[color-mix(in_oklab,var(--c-gold)_40%,transparent)] bg-[color-mix(in_oklab,var(--c-gold)_12%,transparent)] text-gold',
  emerald: 'border-[color-mix(in_oklab,var(--c-emerald)_35%,transparent)] bg-[color-mix(in_oklab,var(--c-emerald)_10%,transparent)] text-emerald',
  crimson: 'border-[color-mix(in_oklab,var(--c-crimson)_40%,transparent)] bg-[color-mix(in_oklab,var(--c-crimson)_12%,transparent)] text-crimson',
  indigo: 'border-[color-mix(in_oklab,var(--c-indigo)_40%,transparent)] bg-[color-mix(in_oklab,var(--c-indigo)_12%,transparent)] text-indigo',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-md border px-2 text-[0.7rem] font-semibold whitespace-nowrap [&_svg]:size-3',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-2 px-1 font-mono text-[0.65rem] text-fg-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ─────────── Progress ─────────── */
export function ProgressBar({
  value,
  tone = 'accent',
  className,
  height = 6,
  shimmer = false,
  label,
}: {
  value: number;
  tone?: 'accent' | 'emerald' | 'gold' | 'cyan' | 'crimson';
  className?: string;
  height?: number;
  shimmer?: boolean;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  const fills: Record<string, string> = {
    accent: 'linear-gradient(90deg, var(--accent-2), var(--accent))',
    emerald: 'linear-gradient(90deg, var(--fill-emerald-from), var(--c-emerald))',
    gold: 'linear-gradient(90deg, var(--gold-lo), var(--c-gold), var(--gold-hi))',
    cyan: 'linear-gradient(90deg, var(--fill-cyan-from), var(--c-cyan))',
    crimson: 'linear-gradient(90deg, var(--fill-crimson-from), var(--c-crimson))',
  };
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={cn('relative w-full overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
    >
      <motion.div
        className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
        style={{ background: fills[tone] }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 90, damping: 20 }}
      >
        {shimmer && pct > 0 && (
          <span className="absolute inset-y-0 w-1/3 animate-shimmer bg-[linear-gradient(90deg,transparent,var(--shine),transparent)]" />
        )}
      </motion.div>
    </div>
  );
}

export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  tone = 'var(--accent)',
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: string;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={cn('relative inline-grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
          style={{ filter: `drop-shadow(0 0 6px ${tone})` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/* ─────────── Tooltip ─────────── */
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[100] max-w-xs rounded-lg border border-line-strong bg-surface-3 px-2.5 py-1.5 text-xs text-fg shadow-xl data-[state=delayed-open]:animate-in"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ─────────── Tabs ─────────── */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex items-center gap-1 rounded-[12px] border border-line bg-surface p-1', className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[0.8rem] font-semibold text-fg-muted transition-colors hover:text-fg data-[state=active]:bg-surface-3 data-[state=active]:text-fg data-[state=active]:shadow-[inset_0_1px_0_var(--highlight)] [&_svg]:size-3.5',
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

/* ─────────── Segmented control ─────────── */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-[11px] border border-line bg-surface p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[8px] px-3 font-semibold transition-colors [&_svg]:size-3.5',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[0.8rem]',
            value === o.value ? 'bg-surface-3 text-fg shadow-[inset_0_1px_0_var(--highlight)]' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────── Empty state & skeleton ─────────── */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 -m-3 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent)_25%,transparent),transparent_70%)] blur-md" />
        <div className="relative grid size-14 rotate-45 place-items-center rounded-[14px] border border-line-strong bg-surface-2">
          <div className="-rotate-45 text-accent [&_svg]:size-6">{icon}</div>
        </div>
      </div>
      <h3 className="font-display text-base font-semibold tracking-wide">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('relative overflow-hidden rounded-lg bg-surface-2', className)}>
    <span className="absolute inset-y-0 w-1/2 animate-shimmer bg-[linear-gradient(90deg,transparent,var(--shine-soft),transparent)]" />
  </div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2 text-accent!">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-semibold tracking-wide md:text-[2rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
