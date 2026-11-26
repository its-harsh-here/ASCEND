import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Brain, Check, CheckCircle2, Cpu, Flag, Info, Loader2, Plus, Rocket, Sparkles, Trash2, Wand2, X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getProvider, suggestMilestones } from '@/ai/providers';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Badge, Field, Input, Label, Panel, Select, Switch, Textarea, Tooltip } from '@/components/ui/primitives';
import { ACCENTS, DEFAULT_SETTINGS, SKILL_LEVELS, type SkillLevel } from '@/domain/types';
import { useSettings, useToday } from '@/hooks/data';
import { addDaysKey, diffDays, formatDateKey, WEEKDAY_SHORT } from '@/lib/dates';
import { cn, uid } from '@/lib/utils';
import { DOMAIN_LABEL, GOAL_TEMPLATES, TEMPLATE_BY_ID, templateHours } from '@/planning/catalog';
import { assessFeasibility } from '@/planning/feasibility';
import { parseGoalText } from '@/planning/goalParser';
import { generatePlan, type DraftPlan, type PlanGoal } from '@/planning/planner';
import { activatePlan } from '@/services/campaigns';
import { commitmentsExcluding } from '@/services/campaigns';
import { useUI } from '@/store/ui';
import { PlanReview } from './PlanReview';
import { swatch } from '@/lib/colors';

const STEPS = ['Name', 'Objective', 'Dates', 'Time', 'Level', 'Goals', 'Generate', 'Review', 'Activate'];

const EXAMPLE =
  'I have 30 days of winter break. I want to learn Docker, Kubernetes, AWS, improve DSA, contribute to open source, and build a research-worthy project. I have 6 hours available daily.';

export interface WizardForm {
  name: string;
  color: string;
  objective: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  workdays: number[];
  skillLevel: SkillLevel;
  constraints: string;
  outcomes: string[];
  goals: PlanGoal[];
  parsedFrom: string;
}

function inputKey(f: WizardForm): string {
  return JSON.stringify([f.startDate, f.endDate, f.hoursPerDay, f.workdays, f.skillLevel, f.goals]);
}


export default function CampaignWizard() {
  const settings = useSettings();
  const today = useToday();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useUI((s) => s.toast);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState<WizardForm | null>(null);
  const [plan, setPlan] = useState<DraftPlan | null>(null);
  const [activating, setActivating] = useState(false);
  const [planKey, setPlanKey] = useState('');

  useEffect(() => {
    if (!settings || form) return;
    setForm({
      name: '',
      color: 'violet',
      objective: params.get('prefill') ?? '',
      startDate: today,
      endDate: addDaysKey(today, 29),
      hoursPerDay: settings.dailyHours,
      workdays: settings.workdays,
      skillLevel: 'beginner',
      constraints: '',
      outcomes: [],
      goals: [],
      parsedFrom: '',
    });
  }, [settings, form, today, params]);

  const parsed = useMemo(() => (form ? parseGoalText(form.objective) : null), [form]);
  if (!form || !settings || !parsed) return null;
  const set = (patch: Partial<WizardForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  /** Merge parsed goals into the goal list when the objective changes; manual goals are kept. */
  const syncFromObjective = () => {
    if (form.parsedFrom === form.objective) return;
    const manual = form.goals.filter((g) => !g.id.startsWith('auto-'));
    const autos: PlanGoal[] = ([
      ...parsed.matches.map((m) => ({ id: `auto-${m.templateId}`, templateId: m.templateId, title: TEMPLATE_BY_ID.get(m.templateId)!.name, quantity: m.quantity, includeOptional: false, rank: 0 })),
      ...parsed.unrecognized.map((u, i) => ({ id: `auto-custom-${i}`, title: u, customHours: Math.max(6, form.hoursPerDay * 3), customMilestones: [], includeOptional: false, rank: 0 })),
    ] as PlanGoal[]).filter((g) => !manual.some((x) => x.templateId && x.templateId === g.templateId));
    const goals = [...autos, ...manual].map((g, i) => ({ ...g, rank: i + 1 }));
    const patch: Partial<WizardForm> = { goals, parsedFrom: form.objective };
    if (parsed.durationDays) patch.endDate = addDaysKey(form.startDate, parsed.durationDays - 1);
    if (parsed.hoursPerDay) patch.hoursPerDay = parsed.hoursPerDay;
    if (parsed.skillLevel) patch.skillLevel = parsed.skillLevel;
    if (!form.name && /winter break/i.test(form.objective)) patch.name = 'Winter Break Upskilling';
    set(patch);
  };

  const valid = [
    form.name.trim().length > 0,
    form.objective.trim().length > 0,
    form.endDate >= form.startDate,
    form.hoursPerDay > 0 && form.workdays.length > 0,
    true,
    form.goals.length > 0,
    !!plan,
    !!plan,
    !!plan,
  ];

  const go = async (n: number) => {
    if (n > step && !valid[step]) return;
    if (step === 1 && n > 1) syncFromObjective();
    setDir(n > step ? 1 : -1);
    if (n === 6 && step === 5 && plan && inputKey(form) !== planKey) {
      // Inputs changed after a plan was generated: never discard review edits silently.
      const edited = plan.quests.some((q) => q.userEdited);
      if (!edited || confirm('Your inputs changed. Regenerate the plan? Edits you made during review will be discarded.')) setPlan(null);
    }
    setStep(n);
  };

  const generate = async () => {
    const commitments = await commitmentsExcluding(null, form.startDate, diffDays(form.endDate, form.startDate) + 1);
    const p = generatePlan({
      campaignName: form.name,
      objective: form.objective,
      startDate: form.startDate,
      endDate: form.endDate,
      hoursPerDay: form.hoursPerDay,
      workdays: form.workdays,
      skillLevel: form.skillLevel,
      goals: form.goals,
      commitments,
    });
    setPlan(p);
    setPlanKey(inputKey(form));
    return p;
  };

  const activate = async () => {
    if (!plan) return;
    setActivating(true);
    try {
      const id = await activatePlan(plan, { name: form.name, objective: form.objective, constraints: form.constraints, outcomes: form.outcomes.filter(Boolean), color: form.color });
      toast({ title: 'Campaign activated', description: `${plan.quests.length} quests scheduled.`, tone: 'success' });
      navigate(`/campaigns/${id}`);
    } catch (e) {
      toast({ title: 'Activation failed', description: e instanceof Error ? e.message : String(e), tone: 'error' });
      setActivating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-accent!">New campaign · step {step + 1} of {STEPS.length}</div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-wide md:text-3xl">{['Name your campaign', 'Describe your objective', 'Set the timeline', 'Available time', 'Experience & constraints', 'Goals & outcomes', 'Forge the plan', 'Review & customize', 'Activate'][step]}</h1>
        </div>
        <Button variant="ghost" onClick={() => navigate('/campaigns')}><X /> Cancel</Button>
      </div>

      <ol className="mb-6 grid grid-cols-9 gap-1.5" aria-label="Wizard progress">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button onClick={() => i < step && void go(i)} disabled={i > step} className="group w-full text-left disabled:cursor-default" aria-current={i === step ? 'step' : undefined}>
              <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                <motion.div className="h-full bg-[linear-gradient(90deg,var(--accent-2),var(--accent))]" initial={false} animate={{ width: i < step ? '100%' : i === step ? '50%' : '0%' }} />
              </div>
              <span className={cn('mt-1.5 hidden text-[0.65rem] font-semibold tracking-wider uppercase sm:block', i === step ? 'text-fg' : i < step ? 'text-fg-muted group-hover:text-accent' : 'text-fg-dim')}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -40 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
          {step === 0 && (
            <Panel runes className="p-6 md:p-8">
              <Field label="Campaign name" htmlFor="c-name">
                <Input id="c-name" autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void go(1)} placeholder="e.g. Winter Break Upskilling" className="h-12 text-lg" maxLength={200} />
              </Field>
              <Label className="mt-6">Banner color</Label>
              <div className="flex gap-2">
                {ACCENTS.map((c) => (
                  <button key={c} onClick={() => set({ color: c })} aria-label={c} aria-pressed={form.color === c} className={cn('size-9 rotate-45 rounded-lg border-2 transition', form.color === c ? 'scale-110 border-fg' : 'border-transparent')} style={{ background: swatch(c) }} />
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="text-xs text-fg-dim">Ideas:</span>
                {['Winter Break Upskilling', 'Become Internship Ready', 'Master Data Structures', 'Learn Cloud Computing', 'Build a Research Project', 'Improve Physical Fitness'].map((n) => (
                  <button key={n} onClick={() => set({ name: n })} className="rounded-full border border-line px-3 py-1 text-xs text-fg-muted hover:border-accent hover:text-fg">{n}</button>
                ))}
              </div>
            </Panel>
          )}

          {step === 1 && (
            <Panel runes className="p-6 md:p-8">
              <Field label="In your own words, what do you want to achieve?" htmlFor="c-obj" hint="Mention goals, how long you have and your daily time. The planner recognizes topics from its catalog and shows exactly what it matched.">
                <Textarea id="c-obj" autoFocus value={form.objective} onChange={(e) => set({ objective: e.target.value })} className="min-h-36 text-[0.95rem] leading-relaxed" placeholder={EXAMPLE} />
              </Field>
              {!form.objective && <Button size="sm" variant="ghost" className="mt-2" onClick={() => set({ objective: EXAMPLE })}><Wand2 /> Use the winter-break example</Button>}
              <div className="mt-5 rounded-[14px] border border-line bg-bg-raised/60 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-fg-dim uppercase"><Cpu className="size-3.5" /> Live interpretation (deterministic)</div>
                <div className="flex flex-wrap gap-1.5" data-testid="parsed-goals">
                  {parsed.matches.map((m) => (
                    <Tooltip key={m.templateId} content={`Matched “${m.keyword}”`}>
                      <Badge tone="accent" className="h-7 px-2.5"><Icon name={TEMPLATE_BY_ID.get(m.templateId)!.icon} /> {TEMPLATE_BY_ID.get(m.templateId)!.name}{m.quantity ? ` ×${m.quantity}` : ''}</Badge>
                    </Tooltip>
                  ))}
                  {parsed.unrecognized.map((u) => <Badge key={u} tone="gold" className="h-7 px-2.5"><Info /> Unrecognized: {u}</Badge>)}
                  {parsed.matches.length === 0 && parsed.unrecognized.length === 0 && <span className="text-sm text-fg-dim">No goals recognized yet.</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-fg-muted">
                  <span>Duration: <b className="text-fg">{parsed.durationDays ? `${parsed.durationDays} days` : '—'}</b></span>
                  <span>Daily time: <b className="text-fg">{parsed.hoursPerDay ? `${parsed.hoursPerDay}h` : '—'}</b></span>
                  <span>Level: <b className="text-fg">{parsed.skillLevel ?? '—'}</b></span>
                </div>
                {parsed.unrecognized.length > 0 && <p className="mt-3 text-xs text-gold">Unrecognized goals get a generic, editable scaffold — you can define their milestones in the Goals step.</p>}
              </div>
            </Panel>
          )}

          {step === 2 && (
            <Panel runes className="p-6 md:p-8">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Start date" htmlFor="c-start"><Input id="c-start" type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
                <Field label="End date" htmlFor="c-end"><Input id="c-end" type="date" value={form.endDate} min={form.startDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {[7, 14, 30, 60, 90].map((d) => (
                  <Button key={d} size="sm" variant="ghost" onClick={() => set({ endDate: addDaysKey(form.startDate, d - 1) })}>{d} days</Button>
                ))}
              </div>
              <p className="mt-4 text-sm text-fg-muted">
                {form.endDate >= form.startDate ? <>Campaign length: <b className="text-fg">{diffDays(form.endDate, form.startDate) + 1} days</b> ({formatDateKey(form.startDate, 'MMM d')} → {formatDateKey(form.endDate, 'MMM d, yyyy')})</> : <span className="text-crimson">End date must be after the start date.</span>}
              </p>
            </Panel>
          )}

          {step === 3 && (
            <Panel runes className="p-6 md:p-8">
              <Label>Hours available per working day</Label>
              <div className="flex items-end gap-3"><span className="font-num text-5xl font-semibold text-accent">{form.hoursPerDay}</span><span className="mb-2 text-fg-muted">hours</span></div>
              <input type="range" min={0.5} max={14} step={0.5} value={form.hoursPerDay} onChange={(e) => set({ hoursPerDay: Number(e.target.value) })} className="mt-3 w-full accent-[var(--accent)]" aria-label="Hours per day" />
              <Label className="mt-6">Preferred workdays</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_SHORT.map((d, i) => (
                  <button key={d} aria-pressed={form.workdays.includes(i)} onClick={() => set({ workdays: form.workdays.includes(i) ? form.workdays.filter((x) => x !== i) : [...form.workdays, i].sort() })} className={cn('h-10 w-12 rounded-lg border text-sm font-semibold', form.workdays.includes(i) ? 'border-accent bg-[color-mix(in_oklab,var(--accent)_15%,transparent)]' : 'border-line text-fg-dim')}>{d}</button>
                ))}
              </div>
              <p className="mt-4 text-xs text-fg-dim">Existing scheduled quests and calendar commitments are subtracted automatically when the plan is generated.</p>
            </Panel>
          )}

          {step === 4 && (
            <Panel runes className="p-6 md:p-8">
              <Label>Your current level across these goals</Label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {SKILL_LEVELS.map((l) => (
                  <button key={l} onClick={() => set({ skillLevel: l })} aria-pressed={form.skillLevel === l} className={cn('rounded-[14px] border p-4 text-left', form.skillLevel === l ? 'border-accent bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]' : 'border-line hover:border-line-strong')}>
                    <div className="font-semibold capitalize">{l}</div>
                    <div className="mt-1 text-xs text-fg-muted">{{ beginner: 'Full foundations, generous estimates (+15%).', intermediate: 'Foundations condensed to 60% of the time.', advanced: 'Foundations skipped, estimates −15%.' }[l]}</div>
                  </button>
                ))}
              </div>
              <Field className="mt-6" label="Constraints" htmlFor="c-cons" hint="Notes for yourself — e.g. exams on Fridays, no laptop on weekends. Add fixed commitments as calendar blocks to have them respected by the scheduler.">
                <Textarea id="c-cons" value={form.constraints} onChange={(e) => set({ constraints: e.target.value })} placeholder="Family trip Dec 24–26; gym every morning" />
              </Field>
            </Panel>
          )}

          {step === 5 && <GoalsStep form={form} set={set} />}

          {step === 6 && <GenerateStep form={form} plan={plan} generate={generate} />}

          {step === 7 && plan && <PlanReview plan={plan} setPlan={setPlan} />}

          {step === 8 && plan && (
            <Panel runes className="p-6 text-center md:p-10">
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto grid size-20 rotate-45 place-items-center rounded-2xl border-2" style={{ borderColor: swatch(form.color), boxShadow: `0 0 40px -8px ${swatch(form.color)}` }}>
                <Flag className="size-8 -rotate-45" style={{ color: swatch(form.color) }} />
              </motion.div>
              <h2 className="mt-8 font-display text-2xl font-semibold">{form.name}</h2>
              <p className="mt-2 text-sm text-fg-muted">{formatDateKey(form.startDate, 'MMM d')} → {formatDateKey(form.endDate, 'MMM d, yyyy')} · {plan.questlines.length} questlines · {plan.quests.length} quests · {plan.recurring.filter((r) => r.enabled).length} recurring</p>
              <div className="mx-auto mt-6 max-w-md text-left">
                <Label>Desired outcomes (optional)</Label>
                {form.outcomes.map((o, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <Input value={o} onChange={(e) => set({ outcomes: form.outcomes.map((x, j) => (j === i ? e.target.value : x)) })} className="h-9" />
                    <Button size="icon" variant="ghost" onClick={() => set({ outcomes: form.outcomes.filter((_, j) => j !== i) })} aria-label="Remove outcome"><X /></Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => set({ outcomes: [...form.outcomes, ''] })}><Plus /> Add outcome</Button>
              </div>
              <Button variant="gold" size="lg" className="mt-8" onClick={() => void activate()} disabled={activating} data-testid="activate-campaign">
                {activating ? <Loader2 className="animate-spin" /> : <Rocket />} Activate campaign
              </Button>
              <p className="mt-3 text-xs text-fg-dim">Everything stays editable after activation.</p>
            </Panel>
          )}
        </motion.div>
      </AnimatePresence>

      {step !== 8 && (
        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => void go(step - 1)} disabled={step === 0}><ArrowLeft /> Back</Button>
          <Button variant="primary" onClick={() => void go(step + 1)} disabled={!valid[step]} data-testid="wizard-next">
            {step === 6 ? 'Review plan' : step === 7 ? 'Continue to activation' : 'Continue'} <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}

function GoalsStep({ form, set }: { form: WizardForm; set: (p: Partial<WizardForm>) => void }) {
  const settings = useSettings() ?? DEFAULT_SETTINGS;
  const toast = useUI((s) => s.toast);
  const [busy, setBusy] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const updateGoal = (id: string, patch: Partial<PlanGoal>) => set({ goals: form.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  const move = (i: number, d: -1 | 1) => {
    const goals = [...form.goals];
    const j = i + d;
    if (j < 0 || j >= goals.length) return;
    [goals[i], goals[j]] = [goals[j], goals[i]];
    set({ goals: goals.map((g, k) => ({ ...g, rank: k + 1 })) });
  };
  const addTemplate = (templateId: string) => {
    if (!templateId || form.goals.some((g) => g.templateId === templateId)) return;
    const t = TEMPLATE_BY_ID.get(templateId)!;
    set({ goals: [...form.goals, { id: `manual-${templateId}`, templateId, title: t.name, includeOptional: false, rank: form.goals.length + 1, quantity: t.defaultQuantity }] });
  };
  const aiSuggest = async (g: PlanGoal) => {
    const provider = getProvider(settings.ai);
    if (!provider) return;
    setBusy(g.id);
    try {
      const st = await provider.check();
      if (!st.available) throw new Error(st.reason);
      const ms = await suggestMilestones(provider, g.title, form.objective);
      updateGoal(g.id, { customMilestones: ms.map((m) => m.title), customHours: Math.round(ms.reduce((s, m) => s + (m.hours ?? 3), 0)) || g.customHours });
      toast({ title: 'Milestones suggested by local AI', description: `${provider.label} — review and edit them.`, tone: 'gold' });
    } catch (e) {
      toast({ title: 'Local AI unavailable', description: e instanceof Error ? e.message : String(e), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const totalHours = form.goals.reduce((s, g) => s + (g.templateId ? templateHours(TEMPLATE_BY_ID.get(g.templateId)!, { quantity: g.quantity }) : g.customHours ?? 0), 0);

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">Order goals by priority — higher goals get scheduled first and keep their place if time runs short. Roughly <b className="font-num text-fg">{Math.round(totalHours)}h</b> of template work selected.</p>
          <Select value="" onChange={(e) => addTemplate(e.target.value)} className="h-9 w-64" aria-label="Add goal from catalog">
            <option value="">+ Add goal from catalog…</option>
            {Object.entries(DOMAIN_LABEL).map(([domain, label]) => (
              <optgroup key={domain} label={label}>
                {GOAL_TEMPLATES.filter((t) => t.domain === domain).map((t) => <option key={t.id} value={t.id} disabled={form.goals.some((g) => g.templateId === t.id)}>{t.name}</option>)}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="space-y-2" data-testid="goal-list">
          {form.goals.length === 0 && <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-fg-dim">No goals yet. Add one from the catalog or define a custom goal below.</p>}
          {form.goals.map((g, i) => {
            const t = g.templateId ? TEMPLATE_BY_ID.get(g.templateId) : undefined;
            return (
              <motion.div layout key={g.id} className="rounded-[14px] border border-line bg-surface-2/60 p-3.5">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="text-fg-dim hover:text-fg disabled:opacity-30" aria-label="Move up"><ArrowUp className="size-4" /></button>
                    <span className="text-center font-num text-xs font-bold text-accent">{i + 1}</span>
                    <button onClick={() => move(i, 1)} disabled={i === form.goals.length - 1} className="text-fg-dim hover:text-fg disabled:opacity-30" aria-label="Move down"><ArrowDown className="size-4" /></button>
                  </div>
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-accent">{t ? <Icon name={t.icon} className="size-5" /> : <Sparkles className="size-5 text-gold" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {t ? <span className="font-semibold">{t.name}</span> : <Input value={g.title} onChange={(e) => updateGoal(g.id, { title: e.target.value })} className="h-8 max-w-sm font-semibold" aria-label="Custom goal title" />}
                      <Badge tone={t ? 'accent' : 'gold'}>{t ? DOMAIN_LABEL[t.domain] : 'Custom · generic scaffold'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">{t ? `${t.summary} · ~${Math.round(templateHours(t, { quantity: g.quantity }))}h` : 'Not in the catalog. Define milestones (one per line) or keep the generic scaffold.'}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs text-fg-muted"><Switch checked={g.includeOptional} onCheckedChange={(v) => updateGoal(g.id, { includeOptional: v })} /> Include side quests</label>
                      {t?.quantityLabel && (
                        <label className="flex items-center gap-2 text-xs text-fg-muted">{t.quantityLabel}
                          <Input type="number" min={1} max={24} value={g.quantity ?? t.defaultQuantity} onChange={(e) => updateGoal(g.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="h-8 w-20" />
                        </label>
                      )}
                      {!t && (
                        <label className="flex items-center gap-2 text-xs text-fg-muted">Total hours
                          <Input type="number" min={1} max={500} value={g.customHours ?? 8} onChange={(e) => updateGoal(g.id, { customHours: Math.max(1, Number(e.target.value) || 1) })} className="h-8 w-20" />
                        </label>
                      )}
                    </div>
                    {!t && (
                      <div className="mt-3">
                        <Textarea value={(g.customMilestones ?? []).join('\n')} onChange={(e) => updateGoal(g.id, { customMilestones: e.target.value.split('\n') })} placeholder={'Milestones, one per line (optional)\ne.g. Learn basic strokes\nPaint 5 studies\nFinish a landscape'} className="min-h-20 text-sm" />
                        {settings.ai.provider !== 'none' && (
                          <Button size="xs" variant="ghost" className="mt-1.5 text-gold" onClick={() => void aiSuggest(g)} disabled={busy === g.id}>
                            {busy === g.id ? <Loader2 className="animate-spin" /> : <Brain />} Suggest milestones with local AI
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <Button size="icon-sm" variant="ghost" onClick={() => set({ goals: form.goals.filter((x) => x.id !== g.id).map((x, k) => ({ ...x, rank: k + 1 })) })} aria-label={`Remove ${g.title}`}><Trash2 /></Button>
                </div>
              </motion.div>
            );
          })}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!customTitle.trim()) return; set({ goals: [...form.goals, { id: `custom-${uid()}`, title: customTitle.trim(), customHours: Math.max(6, form.hoursPerDay * 3), customMilestones: [], includeOptional: false, rank: form.goals.length + 1 }] }); setCustomTitle(''); }}>
          <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Add a custom goal (e.g. Learn watercolor painting)" className="h-9" aria-label="Custom goal" />
          <Button type="submit" variant="secondary" className="h-9"><Plus /> Add</Button>
        </form>
      </Panel>
    </div>
  );
}

const PIPELINE = [
  'Identify goals', 'Read timeline & constraints', 'Break goals into milestones', 'Resolve dependencies', 'Generate actionable quests',
  'Estimate durations', 'Assign priorities & difficulty', 'Schedule across available days', 'Insert revision & buffer days', 'Assign XP & questlines',
];

function GenerateStep({ form, plan, generate }: { form: WizardForm; plan: DraftPlan | null; generate: () => Promise<DraftPlan> }) {
  const [phase, setPhase] = useState(plan ? PIPELINE.length : 0);
  const [result, setResult] = useState<DraftPlan | null>(plan);
  useEffect(() => {
    if (plan) return;
    let cancelled = false;
    void (async () => {
      const p = await generate();
      if (cancelled) return;
      setResult(p);
      for (let i = 1; i <= PIPELINE.length; i++) {
        await new Promise((r) => setTimeout(r, 90));
        if (cancelled) return;
        setPhase(i);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const report = result ? assessFeasibility(result) : null;
  const stats = result && {
    goals: result.questlines.length,
    milestones: result.milestones.length,
    quests: result.quests.filter((q) => q.origin !== 'revision').length,
    deps: result.quests.reduce((s, q) => s + q.deps.length, 0),
    hours: Math.round(result.quests.reduce((s, q) => s + q.hours, 0)),
    days: result.schedule.days.filter((d) => d.taskIds.length > 0).length,
    revision: result.schedule.days.filter((d) => d.kind === 'revision').length,
    buffer: result.schedule.days.filter((d) => d.kind === 'buffer').length,
  };
  const detail = stats ? [
    `${stats.goals} goals`, `${diffDays(form.endDate, form.startDate) + 1} days · ${form.hoursPerDay}h/day`, `${stats.milestones} milestones`, `${stats.deps} dependency links`,
    `${stats.quests} quests`, `${stats.hours}h estimated`, 'by goal rank and milestone weight', `${stats.days} working days used`, `${stats.revision} revision · ${stats.buffer} buffer days`, 'rewards scaled by difficulty',
  ] : [];
  return (
    <Panel runes className="p-6 md:p-8">
      <div className="mb-5 flex items-center gap-2 text-xs text-fg-dim"><Cpu className="size-3.5" /> Deterministic local planning engine — templates, dependency graph and a capacity-aware scheduler. No AI service involved.</div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PIPELINE.map((s, i) => (
          <motion.li key={s} initial={{ opacity: 0.3 }} animate={{ opacity: i < phase ? 1 : 0.35 }} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
            <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border', i < phase ? 'border-emerald bg-emerald text-accent-fg' : 'border-line')}>
              {i < phase ? <Check className="size-3.5" strokeWidth={3} /> : i === phase ? <Loader2 className="size-3.5 animate-spin text-accent" /> : null}
            </span>
            <span className="flex-1 text-sm font-medium">{s}</span>
            {i < phase && <span className="font-num text-xs text-fg-muted">{detail[i]}</span>}
          </motion.li>
        ))}
      </ol>
      {report && phase >= PIPELINE.length && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn('mt-6 flex items-start gap-3 rounded-[14px] border p-4', report.status === 'comfortable' ? 'border-emerald/40 bg-[color-mix(in_oklab,var(--c-emerald)_8%,transparent)]' : report.status === 'tight' ? 'border-gold/40 bg-[color-mix(in_oklab,var(--c-gold)_8%,transparent)]' : 'border-crimson/40 bg-[color-mix(in_oklab,var(--c-crimson)_8%,transparent)]')} data-testid="feasibility-headline">
          <CheckCircle2 className={cn('mt-0.5 size-5 shrink-0', report.status === 'comfortable' ? 'text-emerald' : report.status === 'tight' ? 'text-gold' : 'text-crimson')} />
          <div>
            <div className="font-semibold">{report.headline}</div>
            <div className="mt-1 text-sm text-fg-muted">Review the roadmap next — you can edit quests, resolve any overload, and lock deadlines before activation.</div>
          </div>
        </motion.div>
      )}
    </Panel>
  );
}

export function StepNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-fg-dim">{children}</p>;
}
