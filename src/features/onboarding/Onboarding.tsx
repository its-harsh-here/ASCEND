import { ArrowLeft, ArrowRight, Compass, Flag, Gamepad2, Rocket, Sparkles, Waves, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AVATARS, Avatar } from '@/components/game/Avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { useSession } from '@/cloud/session';
import { setDemoMode } from '@/db/schema';
import type { Settings } from '@/domain/types';
import { WEEKDAY_SHORT } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { updateSettings } from '@/services/core';

const GOAL_OPTIONS = [
  { id: 'software', label: 'Software engineering', text: 'improve DSA and system design' },
  { id: 'cloud', label: 'Cloud & DevOps', text: 'learn Docker, Kubernetes and AWS' },
  { id: 'web', label: 'Web development', text: 'learn React and build a backend API' },
  { id: 'ml', label: 'Machine learning', text: 'learn machine learning' },
  { id: 'security', label: 'Cybersecurity', text: 'learn cybersecurity fundamentals' },
  { id: 'research', label: 'Research', text: 'build a research project and write a paper' },
  { id: 'career', label: 'Career & interviews', text: 'prepare for technical interviews' },
  { id: 'exam', label: 'Exams', text: 'prepare for exams' },
  { id: 'reading', label: 'Reading', text: 'read 2 books' },
  { id: 'fitness', label: 'Fitness', text: 'improve physical fitness' },
  { id: 'oss', label: 'Open source', text: 'contribute to open source' },
];

const STYLES: { id: Settings['productivityStyle']; title: string; desc: string; icon: ReactNode; focus: number; brk: number }[] = [
  { id: 'sprinter', title: 'Sprinter', desc: 'Short, intense bursts with frequent breaks.', icon: <Zap />, focus: 25, brk: 5 },
  { id: 'steady', title: 'Steady climber', desc: 'Consistent, medium-length deep-work blocks.', icon: <Compass />, focus: 45, brk: 10 },
  { id: 'flexible', title: 'Deep diver', desc: 'Long immersive sessions when the flow comes.', icon: <Waves />, focus: 90, brk: 15 },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const account = useSession((s) => (s.status === 'signed-in' ? s.user : null));
  const accountName = useSession((s) => s.profile?.display_name);
  const [name, setName] = useState(() => (accountName && accountName !== 'Adventurer' ? accountName : (account?.name ?? '')));
  const [avatar, setAvatar] = useState(AVATARS[0].id);
  const [goals, setGoals] = useState<string[]>([]);
  const [hours, setHours] = useState(4);
  const [workdays, setWorkdays] = useState([1, 2, 3, 4, 5, 6]);
  const [style, setStyle] = useState<Settings['productivityStyle']>('steady');
  const steps = ['Identity', 'Goals', 'Time', 'Style', 'Begin'];

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  const finish = async (next: 'campaign' | 'empty') => {
    const s = STYLES.find((x) => x.id === style)!;
    await updateSettings({
      onboarded: true,
      playerName: name.trim() || 'Adventurer',
      avatarId: avatar,
      primaryGoals: goals,
      dailyHours: hours,
      workdays,
      productivityStyle: style,
      focus: { focusMinutes: s.focus, shortBreakMinutes: s.brk, longBreakMinutes: s.brk * 3, longBreakEvery: 4, autoStartBreaks: false, sound: 'none', volume: 0.4, chime: true },
    });
    if (next === 'campaign') {
      const text = goals.map((g) => GOAL_OPTIONS.find((o) => o.id === g)?.text).filter(Boolean).join(', ');
      const prefill = text ? `I want to ${text}. I have ${hours} hours available daily.` : '';
      navigate(`/campaigns/new${prefill ? `?prefill=${encodeURIComponent(prefill)}` : ''}`);
    } else navigate('/');
  };

  const canNext = step !== 0 || name.trim().length > 0;

  return (
    <div className="atmosphere relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="grid-faint pointer-events-none absolute inset-0" />
      <motion.div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_65%)]" animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 8, repeat: Infinity }} />
      <div className="relative w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="mb-4 size-14 animate-float" />
          <div className="eyebrow text-accent!">Welcome to</div>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-[0.25em] md:text-5xl">ASCEND</h1>
          <p className="mt-3 max-w-md text-sm text-fg-muted">
            {account
              ? `Turn real goals into campaigns, quests and visible progress. Signed in${account.email ? ` as ${account.email}` : ''} — this journal belongs to your account.`
              : 'Turn real goals into campaigns, quests and visible progress. Everything stays on this device — no account required.'}
          </p>
        </div>

        <div className="mb-5 flex items-center justify-center gap-2" role="img" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <motion.span className={cn('h-1.5 rounded-full', i <= step ? 'bg-accent' : 'bg-surface-3')} animate={{ width: i === step ? 28 : 10 }} />
            </div>
          ))}
        </div>

        <div className="panel panel-runes relative overflow-hidden p-6 md:p-8">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={step} custom={dir} initial={{ opacity: 0, x: dir * 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -30 }} transition={{ duration: 0.25 }}>
              {step === 0 && (
                <div>
                  <h2 className="font-display text-xl font-semibold">What should we call you?</h2>
                  <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canNext && go(1)} placeholder="Your name or alias" className="mt-4 h-12 text-base" maxLength={80} aria-label="Your name" />
                  <p className="mt-6 mb-3 text-sm font-semibold text-fg-muted">Choose your emblem</p>
                  <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
                    {AVATARS.map((a) => (
                      <button key={a.id} onClick={() => setAvatar(a.id)} aria-pressed={avatar === a.id} aria-label={a.name} className={cn('flex flex-col items-center gap-1 rounded-xl p-2 transition', avatar === a.id ? 'bg-surface-3 ring-1 ring-accent' : 'hover:bg-surface-2')}>
                        <Avatar id={a.id} size={48} glow={avatar === a.id} />
                        <span className="text-[0.65rem] text-fg-muted">{a.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {step === 1 && (
                <div>
                  <h2 className="font-display text-xl font-semibold">What are your primary goals?</h2>
                  <p className="mt-1 text-sm text-fg-muted">Pick any that apply — they shape your first campaign suggestion.</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {GOAL_OPTIONS.map((g) => {
                      const on = goals.includes(g.id);
                      return (
                        <button key={g.id} onClick={() => setGoals(on ? goals.filter((x) => x !== g.id) : [...goals, g.id])} aria-pressed={on} className={cn('rounded-full border px-4 py-2 text-sm font-semibold transition', on ? 'border-accent bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-fg' : 'border-line-strong text-fg-muted hover:text-fg')}>
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <h2 className="font-display text-xl font-semibold">How much time can you dedicate daily?</h2>
                  <div className="mt-6 flex items-end gap-3">
                    <span className="font-num text-5xl font-semibold text-accent">{hours}</span>
                    <span className="mb-2 text-fg-muted">hours / day</span>
                  </div>
                  <input type="range" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-4 w-full accent-[var(--accent)]" aria-label="Daily hours" />
                  <p className="mt-6 mb-2 text-sm font-semibold text-fg-muted">Preferred workdays</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_SHORT.map((d, i) => (
                      <button key={d} aria-pressed={workdays.includes(i)} onClick={() => setWorkdays(workdays.includes(i) ? workdays.filter((x) => x !== i) : [...workdays, i].sort())} className={cn('h-10 w-12 rounded-lg border text-sm font-semibold', workdays.includes(i) ? 'border-accent bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] text-fg' : 'border-line text-fg-dim')}>
                        {d}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-fg-dim">Days off are rest days — they never break your streak.</p>
                </div>
              )}
              {step === 3 && (
                <div>
                  <h2 className="font-display text-xl font-semibold">What is your productivity style?</h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3 grid-cols-1">
                    {STYLES.map((s) => (
                      <button key={s.id} onClick={() => setStyle(s.id)} aria-pressed={style === s.id} className={cn('rounded-[14px] border p-4 text-left transition', style === s.id ? 'border-accent bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]' : 'border-line hover:border-line-strong')}>
                        <span className="text-accent [&_svg]:size-5">{s.icon}</span>
                        <div className="mt-2 font-semibold">{s.title}</div>
                        <div className="mt-1 text-xs text-fg-muted">{s.desc}</div>
                        <div className="mt-3 font-num text-xs text-fg-dim">{s.focus}m focus · {s.brk}m break</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {step === 4 && (
                <div>
                  <h2 className="font-display text-xl font-semibold">Would you like to create your first campaign?</h2>
                  <p className="mt-1 text-sm text-fg-muted">A campaign turns a big goal into a scheduled roadmap of quests.</p>
                  <div className="mt-5 grid gap-3">
                    <ChoiceCard icon={<Flag />} title="Create my first campaign" desc="Guided wizard, prefilled from your goals. Recommended." onClick={() => void finish('campaign')} primary testId="onboarding-create-campaign" />
                    <ChoiceCard icon={<Rocket />} title="Start with an empty journal" desc="Add quests yourself; create campaigns whenever you like." onClick={() => void finish('empty')} testId="onboarding-empty" />
                    <ChoiceCard icon={<Gamepad2 />} title="Explore demo mode" desc="Try a sample journey in a separate database. Your real data stays empty." onClick={() => { setDemoMode(true); location.reload(); }} />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {step < 4 && (
            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}><ArrowLeft /> Back</Button>
              <Button variant="primary" onClick={() => go(step + 1)} disabled={!canNext} data-testid="onboarding-next">
                Continue <ArrowRight />
              </Button>
            </div>
          )}
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-fg-dim"><Sparkles className="size-3" /> Free, offline-first and private. No paid AI, no tracking.</p>
      </div>
    </div>
  );
}

function ChoiceCard({ icon, title, desc, onClick, primary, testId }: { icon: ReactNode; title: string; desc: string; onClick: () => void; primary?: boolean; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId} className={cn('group flex items-center gap-4 rounded-[14px] border p-4 text-left transition', primary ? 'border-accent/60 bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]' : 'border-line hover:border-line-strong hover:bg-surface-2')}>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-accent [&_svg]:size-5">{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-fg-muted">{desc}</span>
      </span>
      <ArrowRight className="size-4 text-fg-dim transition group-hover:translate-x-1 group-hover:text-accent" />
    </button>
  );
}
