import { CheckCircle2, Coins, Crown, Flag, X, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { RARITY_LABEL, type Rarity } from '@/domain/achievements';
import { cn } from '@/lib/utils';
import { useUI, type Celebration } from '@/store/ui';

export const RARITY_COLOR: Record<Rarity, string> = {
  common: 'var(--fg-muted)',
  rare: 'var(--c-cyan)',
  epic: 'var(--c-violet)',
  legendary: 'var(--c-gold)',
};

function XpFloat({ c, onDone }: { c: Extract<Celebration, { kind: 'xp' }>; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);
  const x = c.x ?? window.innerWidth / 2;
  const y = c.y ?? window.innerHeight / 2;
  const sparks = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2, d: 26 + (i % 3) * 10 })), []);
  return (
    <div className="pointer-events-none fixed z-[90]" style={{ left: x, top: y }}>
      {sparks.map((s, i) => (
        <motion.span
          key={i}
          className="absolute size-1.5 rotate-45 rounded-[1px] bg-gold"
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: Math.cos(s.a) * s.d, y: Math.sin(s.a) * s.d, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        className="absolute -translate-x-1/2 font-num text-lg font-bold whitespace-nowrap text-gold drop-shadow-[0_0_10px_var(--c-gold)]"
        initial={{ y: 0, opacity: 0, scale: 0.7 }}
        animate={{ y: -64, opacity: [0, 1, 1, 0], scale: 1 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      >
        +{c.amount} XP
        {c.coins > 0 && <span className="ml-2 text-sm text-fg-muted">+{c.coins}<Coins className="ml-0.5 inline size-3.5" /></span>}
      </motion.div>
    </div>
  );
}

function LevelUp({ c, onDone }: { c: Extract<Celebration, { kind: 'level' }>; onDone: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-[rgb(3_3_8/0.7)] px-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onDone} role="dialog" aria-label={`Level up: level ${c.level}`}>
      <div className="relative flex flex-col items-center text-center">
        {!reduce && (
          <motion.div className="absolute size-[340px] rounded-full border border-gold/30" initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: 1.4, opacity: 0 }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
        )}
        <motion.div className="absolute size-64 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--c-gold)_35%,transparent),transparent_65%)]" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.6 }} />
        <motion.div initial={{ scale: 0.3, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 12 }} className="relative grid size-28 rotate-45 place-items-center rounded-[22px] border-2 border-gold bg-surface shadow-[0_0_60px_-5px_var(--c-gold)]">
          <span className="-rotate-45 font-display text-5xl font-bold text-gradient-gold">{c.level}</span>
        </motion.div>
        <motion.p className="eyebrow relative mt-10 text-gold!" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          Level up
        </motion.p>
        <motion.h2 className="relative mt-2 font-display text-3xl font-semibold tracking-wide" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          You reached level {c.level}
        </motion.h2>
        <motion.p className="relative mt-2 text-fg-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
          Title: <span className="font-semibold text-gold">{c.title}</span>
        </motion.p>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
          <Button variant="gold" className="relative mt-7" onClick={onDone} autoFocus>
            <Crown /> Continue
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function AchievementToast({ c, onDone }: { c: Extract<Celebration, { kind: 'achievement' } | { kind: 'campaign' }>; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5200);
    return () => clearTimeout(t);
  }, [onDone]);
  const isCampaign = c.kind === 'campaign';
  const color = isCampaign ? 'var(--c-gold)' : RARITY_COLOR[c.achievement.rarity];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.97 }}
      className="panel pointer-events-auto relative flex w-[340px] items-center gap-3 overflow-hidden bg-surface-2! p-3.5"
      style={{ borderColor: `color-mix(in oklab, ${color} 50%, transparent)` }}
      role="status"
    >
      <span className="absolute inset-y-0 w-1/2 animate-shimmer bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.06),transparent)]" />
      <div className="relative grid size-12 shrink-0 rotate-45 place-items-center rounded-[12px] border" style={{ borderColor: color, boxShadow: `0 0 24px -6px ${color}` }}>
        <span className="-rotate-45" style={{ color }}>
          {isCampaign ? <Flag className="size-5" /> : <Icon name={c.achievement.icon} className="size-5" />}
        </span>
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="text-[0.62rem] font-bold tracking-[0.18em] uppercase" style={{ color }}>
          {isCampaign ? 'Campaign complete' : `${RARITY_LABEL[c.achievement.rarity]} achievement unlocked`}
        </div>
        <div className="truncate font-display font-semibold">{isCampaign ? c.name : c.achievement.title}</div>
        {!isCampaign && <div className="truncate text-xs text-fg-muted">{c.achievement.description}</div>}
      </div>
      <button onClick={onDone} className="relative text-fg-dim hover:text-fg" aria-label="Dismiss"><X className="size-4" /></button>
    </motion.div>
  );
}

export function CelebrationLayer() {
  const items = useUI((s) => s.celebrations);
  const finish = useUI((s) => s.finishCelebration);
  const level = items.find((c) => c.kind === 'level') as Extract<Celebration, { kind: 'level' }> | undefined;
  const banners = items.filter((c) => c.kind === 'achievement' || c.kind === 'campaign') as Extract<Celebration, { kind: 'achievement' } | { kind: 'campaign' }>[];
  return (
    <>
      {items.filter((c) => c.kind === 'xp').map((c) => <XpFloat key={c.id} c={c as Extract<Celebration, { kind: 'xp' }>} onDone={() => finish(c.id)} />)}
      <AnimatePresence>{level && <LevelUp key={level.id} c={level} onDone={() => finish(level.id)} />}</AnimatePresence>
      <div className="pointer-events-none fixed top-4 left-1/2 z-[92] flex -translate-x-1/2 flex-col gap-2">
        <AnimatePresence>{banners.slice(0, 3).map((c) => <AchievementToast key={c.id} c={c} onDone={() => finish(c.id)} />)}</AnimatePresence>
      </div>
    </>
  );
}

export function Toaster() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-20 z-[80] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 md:bottom-4" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className={cn('panel pointer-events-auto flex items-start gap-3 bg-surface-2! px-4 py-3', t.tone === 'error' && 'border-crimson/40!', t.tone === 'gold' && 'border-gold/40!')}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            {t.tone === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald" />}
            {t.tone === 'error' && <XCircle className="mt-0.5 size-4 shrink-0 text-crimson" />}
            {t.tone === 'gold' && <Crown className="mt-0.5 size-4 shrink-0 text-gold" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.description && <div className="mt-0.5 text-xs text-fg-muted">{t.description}</div>}
            </div>
            {t.action && (
              <button className="text-xs font-bold text-accent hover:underline" onClick={() => { t.action!.run(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="text-fg-dim hover:text-fg" aria-label="Dismiss notification"><X className="size-3.5" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
