import { Check } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import type { Settings } from '@/domain/types';
import { swatch } from '@/lib/colors';
import { cn } from '@/lib/utils';

type ThemePref = Settings['theme'];

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

/** A miniature app window drawn entirely from the scoped theme tokens (.theme-dark / .theme-light). */
function Mini({ theme, accent, className }: { theme: 'dark' | 'light'; accent: string; className?: string }) {
  return (
    <div className={cn(theme === 'light' ? 'theme-light' : 'theme-dark', 'flex h-full gap-1.5 bg-bg p-2 text-fg', className)} aria-hidden>
      <div className="flex w-4 flex-col gap-1 rounded-sm bg-surface p-0.5">
        <span className="h-1 rounded-full" style={{ background: swatch(accent) }} />
        <span className="h-1 rounded-full bg-fg-dim" />
        <span className="h-1 rounded-full bg-fg-dim" />
      </div>
      <div className="flex flex-1 flex-col gap-1 rounded-sm border border-line bg-surface p-1.5">
        <span className="h-1.5 w-3/4 rounded-full bg-fg" />
        <span className="h-1 w-1/2 rounded-full bg-fg-muted" />
        <span className="mt-auto h-2 w-8 rounded-full" style={{ background: swatch(accent) }} />
      </div>
    </div>
  );
}

export function ThemePicker({ value, accent, onChange }: { value: ThemePref; accent: string; onChange: (v: ThemePref) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-2">
      {OPTIONS.map((o, i) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn('group flex w-24 flex-col gap-1.5 rounded-xl p-1.5 text-left transition', on ? 'bg-surface-3 ring-2 ring-accent' : 'hover:bg-surface-2')}
          >
            <div className="relative h-14 overflow-hidden rounded-lg border border-line">
              {o.value === 'system' ? (
                <>
                  <Mini theme="dark" accent={accent} className="absolute inset-0 [clip-path:polygon(0_0,100%_0,0_100%)]" />
                  <Mini theme="light" accent={accent} className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                </>
              ) : (
                <Mini theme={o.value} accent={accent} />
              )}
            </div>
            <span className="flex items-center gap-1 px-0.5 text-xs font-semibold">
              {on && <Check className="size-3 text-accent" aria-hidden />}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
