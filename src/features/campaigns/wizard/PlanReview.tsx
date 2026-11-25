import { AlertTriangle, ArrowDown, ArrowUp, CalendarRange, ChevronDown, Clock, Lock, Plus, RefreshCcw, Repeat, Scissors, Trash2, TrendingUp, Unlock, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { CategoryIcon } from '@/components/game/badges';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Badge, Input, Panel, Select, Switch, Tooltip } from '@/components/ui/primitives';
import { DIFFICULTIES, DIFFICULTY_LABEL, PRIORITIES, PRIORITY_LABEL, type Difficulty, type Priority } from '@/domain/types';
import { baseXpFor } from '@/domain/xp';
import { useSettings } from '@/hooks/data';
import { formatDateKey } from '@/lib/dates';
import { cn, formatHours } from '@/lib/utils';
import { TEMPLATE_BY_ID } from '@/planning/catalog';
import { addQuest, deferGoals, dropOptional, editQuest, editedCount, moveMilestone, removeQuest, setMilestone, setPlanInput, toggleRecurring } from '@/planning/draftOps';
import { assessFeasibility, type FeasibilityOption } from '@/planning/feasibility';
import { regenerateGoal, scheduleDraft, type DraftPlan, type DraftQuest } from '@/planning/planner';
import { useUI } from '@/store/ui';

export function PlanReview({ plan, setPlan }: { plan: DraftPlan; setPlan: (p: DraftPlan) => void }) {
  const toast = useUI((s) => s.toast);
  const report = useMemo(() => assessFeasibility(plan), [plan]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(plan.questlines.slice(0, 1).map((l) => l.id)));
  const byId = useMemo(() => new Map(plan.quests.map((q) => [q.id, q])), [plan]);

  const applyOption = (o: FeasibilityOption) => {
    if (o.kind === 'extend' && o.endDate) setPlan(setPlanInput(plan, { endDate: o.endDate }));
    if (o.kind === 'hours' && o.hoursPerDay) setPlan(setPlanInput(plan, { hoursPerDay: o.hoursPerDay }));
    if (o.kind === 'scope') setPlan(dropOptional(plan));
    if (o.kind === 'prioritize' && o.deferGoalIds) setPlan(deferGoals(plan, o.deferGoalIds));
    toast({ title: o.title, description: 'Plan rescheduled.', tone: 'success' });
  };

  const regenerate = (goalId: string) => {
    const edits = editedCount(plan, goalId);
    let overwrite = false;
    if (edits > 0) {
      const keep = confirm(`${edits} quest${edits > 1 ? 's in this questline were' : ' in this questline was'} edited by you.\n\nOK = regenerate but KEEP your edits\nCancel = choose whether to overwrite`);
      if (!keep) {
        overwrite = confirm('Overwrite your edits with freshly generated quests? This cannot be undone.');
        if (!overwrite) return;
      }
    }
    const { plan: next, preserved } = regenerateGoal(plan, goalId, overwrite);
    setPlan(next);
    toast({ title: 'Questline regenerated', description: preserved ? `${preserved} edited quest${preserved > 1 ? 's' : ''} preserved.` : 'Fresh quests generated from the template.', tone: 'success' });
  };

  const unscheduled = plan.schedule.unscheduled.map((id) => byId.get(id)).filter(Boolean) as DraftQuest[];
  const tone = report.status === 'comfortable' ? 'emerald' : report.status === 'tight' ? 'gold' : 'crimson';

  return (
    <div className="space-y-4">
      <Panel className={cn('p-5', report.status !== 'comfortable' && 'border-[color-mix(in_oklab,var(--c-gold)_35%,transparent)]!')} data-testid="feasibility-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn('grid size-10 place-items-center rounded-xl border', { emerald: 'border-emerald/40 text-emerald', gold: 'border-gold/40 text-gold', crimson: 'border-crimson/40 text-crimson' }[tone])}>
              {report.status === 'comfortable' ? <TrendingUp className="size-5" /> : <AlertTriangle className="size-5" />}
            </div>
            <div>
              <div className="eyebrow">Feasibility · {report.status}</div>
              <div className="mt-1 font-semibold">{report.headline}</div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-muted">
                <span>Required <b className="font-num text-fg">{formatHours(report.requiredHours)}</b></span>
                <span>Optional <b className="font-num text-fg">{formatHours(report.optionalHours)}</b></span>
                <span>Available <b className="font-num text-fg">{formatHours(report.availableHours)}</b></span>
                <span>Buffer <b className="font-num text-fg">{formatHours(report.bufferHours)}</b></span>
              </div>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => { setPlan(scheduleDraft(plan)); toast({ title: 'Entire campaign rescheduled', description: 'Locked deadlines were respected.' }); }}>
            <RefreshCcw /> Reschedule entire plan
          </Button>
        </div>
        {report.options.length > 0 && (
          <div className="mt-4 grid gap-2 md:grid-cols-2 grid-cols-1">
            {report.options.map((o) => (
              <button key={o.kind} onClick={() => applyOption(o)} className="group flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3 text-left hover:border-accent" data-testid={`feasibility-option-${o.kind}`}>
                <span className="mt-0.5 text-accent [&_svg]:size-4">{{ extend: <CalendarRange />, hours: <Clock />, scope: <Scissors />, prioritize: <Users /> }[o.kind]}</span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold group-hover:text-accent">{o.title}</span>
                  <span className="block text-xs text-fg-muted">{o.detail}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {unscheduled.length > 0 && (
          <div className="mt-4 rounded-xl border border-crimson/30 bg-[color-mix(in_oklab,var(--c-crimson)_6%,transparent)] p-3 text-xs">
            <b className="text-crimson">{unscheduled.length} quest{unscheduled.length > 1 ? 's' : ''} could not be scheduled without overloading you:</b>{' '}
            {unscheduled.slice(0, 6).map((q) => q.title).join(' · ')}{unscheduled.length > 6 ? ' …' : ''}
          </div>
        )}
        {plan.schedule.violations.length > 0 && (
          <div className="mt-2 rounded-xl border border-gold/30 p-3 text-xs text-gold">
            {plan.schedule.violations.length} locked deadline{plan.schedule.violations.length > 1 ? 's' : ''} cannot be met with current settings.
          </div>
        )}
        <WorkloadStrip plan={plan} />
      </Panel>

      {(plan.notes.length > 0 || plan.recurring.length > 0) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {plan.notes.length > 0 && (
            <Panel className="p-4">
              <div className="eyebrow mb-2">How this plan was built</div>
              <ul className="space-y-1.5 text-xs text-fg-muted">{plan.notes.map((n, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rotate-45 bg-accent" />{n}</li>)}</ul>
            </Panel>
          )}
          {plan.recurring.length > 0 && (
            <Panel className="p-4">
              <div className="eyebrow mb-2">Recurring quests</div>
              {plan.recurring.map((r, i) => (
                <label key={i} className="flex items-center gap-3 py-1.5 text-sm">
                  <Repeat className="size-4 text-emerald" />
                  <span className="flex-1">{r.title} <span className="text-xs text-fg-dim">· {r.minutes}m {r.frequency === 'daily' ? 'daily' : `on ${r.weekdays.length} days/week`}</span></span>
                  <Switch checked={r.enabled} onCheckedChange={(v) => setPlan(toggleRecurring(plan, i, v))} aria-label={`Toggle ${r.title}`} />
                </label>
              ))}
              <p className="mt-2 text-[0.7rem] text-fg-dim">Recurring time is reserved before quests are scheduled.</p>
            </Panel>
          )}
        </div>
      )}

      {plan.questlines.map((line) => {
        const quests = plan.quests.filter((q) => q.goalId === line.id && q.origin !== 'revision');
        const milestones = plan.milestones.filter((m) => m.goalId === line.id).sort((a, b) => a.order - b.order);
        const hours = quests.reduce((s, q) => s + q.hours, 0);
        const isOpen = open.has(line.id);
        const tpl = line.templateId ? TEMPLATE_BY_ID.get(line.templateId) : undefined;
        return (
          <Panel key={line.id} className="overflow-hidden" data-testid="review-questline">
            <div className="flex items-center gap-3 px-4 py-3">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(line.id)) n.delete(line.id); else n.add(line.id); return n; })} aria-expanded={isOpen}>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-accent">{tpl ? <Icon name={tpl.icon} className="size-4" /> : <CategoryIcon category="side" />}</span>
                <span className="min-w-0">
                  <span className="block truncate font-display font-semibold">{line.title}</span>
                  <span className="block text-xs text-fg-muted">{milestones.length} milestones · {quests.length} quests · {formatHours(hours)}{editedCount(plan, line.id) ? ` · ${editedCount(plan, line.id)} edited` : ''}</span>
                </span>
                <ChevronDown className={cn('ml-auto size-4 text-fg-dim transition', isOpen && 'rotate-180')} />
              </button>
              {tpl && <Button size="xs" variant="ghost" onClick={() => regenerate(line.id)}><RefreshCcw /> Regenerate</Button>}
            </div>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-line">
                  <div className="space-y-4 p-4">
                    {milestones.map((ms, mi) => (
                      <div key={ms.id} className="rounded-xl border border-line bg-bg-raised/40">
                        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                          <div className="flex">
                            <button onClick={() => setPlan(moveMilestone(plan, ms.id, -1))} disabled={mi === 0} className="p-1 text-fg-dim hover:text-fg disabled:opacity-30" aria-label={`Move ${ms.title} up`}><ArrowUp className="size-3.5" /></button>
                            <button onClick={() => setPlan(moveMilestone(plan, ms.id, 1))} disabled={mi === milestones.length - 1} className="p-1 text-fg-dim hover:text-fg disabled:opacity-30" aria-label={`Move ${ms.title} down`}><ArrowDown className="size-3.5" /></button>
                          </div>
                          <span className="text-sm font-semibold">{ms.title}</span>
                          <span className="ml-auto flex items-center gap-2 text-xs text-fg-muted">
                            Milestone deadline
                            <Input type="date" value={ms.dueDate ?? ''} onChange={(e) => setPlan(setMilestone(plan, ms.id, { dueDate: e.target.value || undefined, deadlineLocked: !!e.target.value }))} className="h-7 w-36 text-xs" aria-label={`${ms.title} deadline`} />
                            <Tooltip content={ms.deadlineLocked ? 'Locked — scheduling will never move this deadline' : 'Lock this deadline'}>
                              <button onClick={() => setPlan(setMilestone(plan, ms.id, { deadlineLocked: !ms.deadlineLocked }))} className={ms.deadlineLocked ? 'text-gold' : 'text-fg-dim hover:text-fg'} aria-pressed={ms.deadlineLocked} aria-label="Lock milestone deadline">
                                {ms.deadlineLocked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                              </button>
                            </Tooltip>
                          </span>
                        </div>
                        <div className="divide-y divide-line">
                          {quests.filter((q) => q.milestoneId === ms.id).sort((a, b) => a.order - b.order).map((q) => (
                            <QuestEditRow key={q.id} q={q} unscheduled={plan.schedule.unscheduled.includes(q.id)} onChange={(patch, reschedule) => setPlan(reschedule ? editQuest(plan, q.id, patch) : { ...plan, quests: plan.quests.map((x) => (x.id === q.id ? { ...x, ...patch, userEdited: true } : x)) })} onDelete={() => setPlan(removeQuest(plan, q.id))} />
                          ))}
                        </div>
                        <AddQuestRow onAdd={(title, hours) => setPlan(addQuest(plan, ms.id, title, hours))} />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        );
      })}
    </div>
  );
}

function WorkloadStrip({ plan }: { plan: DraftPlan }) {
  const days = plan.schedule.days;
  const max = Math.max(1, ...days.map((d) => d.capacity + d.revisionHours + d.commitments));
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-center justify-between text-[0.68rem] text-fg-dim">
        <span>Daily workload</span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-accent" /> quests</span>
          <span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-emerald" /> revision</span>
          <span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-gold" /> buffer</span>
          <span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-surface-3" /> committed</span>
        </span>
      </div>
      <div className="flex h-20 items-end gap-[2px] overflow-x-auto" role="img" aria-label="Planned hours per day">
        {days.map((d) => (
          <Tooltip key={d.date} content={`${formatDateKey(d.date)} · ${d.kind} · ${formatHours(d.planned)} planned of ${formatHours(d.capacity)}${d.commitments ? ` · ${formatHours(d.commitments)} committed` : ''}`}>
            <div className="flex h-full min-w-[6px] flex-1 flex-col justify-end">
              <div className="w-full rounded-t-[2px] bg-surface-3" style={{ height: `${(d.commitments / max) * 100}%` }} />
              {d.revisionHours > 0 && <div className="w-full bg-emerald/80" style={{ height: `${(d.revisionHours / max) * 100}%` }} />}
              <motion.div initial={{ height: 0 }} animate={{ height: `${(d.planned / max) * 100}%` }} className={cn('w-full rounded-t-[2px]', d.kind === 'buffer' ? 'bg-gold' : d.kind === 'off' ? 'bg-transparent' : 'bg-accent')} />
              {d.kind === 'off' && <div className="h-1 w-full rounded-full bg-line" />}
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function QuestEditRow({ q, unscheduled, onChange, onDelete }: { q: DraftQuest; unscheduled: boolean; onChange: (p: Partial<DraftQuest>, reschedule: boolean) => void; onDelete: () => void }) {
  const settings = useSettings();
  const [title, setTitle] = useState(q.title);
  return (
    <div className={cn('grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-3 py-2 md:grid-cols-[auto_minmax(0,1fr)_76px_108px_108px_150px_auto]', unscheduled && 'bg-[color-mix(in_oklab,var(--c-crimson)_6%,transparent)]')} data-testid="review-quest">
      <CategoryIcon category={q.category} className={cn('text-fg-dim', q.category === 'boss' && 'text-crimson')} />
      <div className="min-w-0">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== q.title && onChange({ title: title.trim() }, false)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="w-full truncate rounded bg-transparent px-1 text-sm font-medium outline-none focus:bg-surface-3" aria-label="Quest title" />
        <div className="flex flex-wrap gap-x-2 px-1 text-[0.68rem] text-fg-dim">
          {q.optional && <span className="text-cyan">optional</span>}
          {q.userEdited && <span className="text-accent">edited</span>}
          {unscheduled ? <span className="text-crimson">not scheduled</span> : q.scheduledDate && <span>{formatDateKey(q.scheduledDate, 'EEE MMM d')}</span>}
          {settings && <span className="text-gold">{baseXpFor(q.difficulty, settings)} XP</span>}
          {q.deliverable && <span className="truncate">· {q.deliverable}</span>}
        </div>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-2 md:contents">
        <Input type="number" min={0.25} step={0.25} value={q.hours} onChange={(e) => onChange({ hours: Math.max(0.25, Number(e.target.value) || 0.25) }, true)} className="h-8 w-[76px] text-xs" aria-label="Estimated hours" />
        <Select value={q.priority} onChange={(e) => onChange({ priority: e.target.value as Priority }, true)} className="h-8 text-xs" aria-label="Priority">
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </Select>
        <Select value={q.difficulty} onChange={(e) => onChange({ difficulty: e.target.value as Difficulty }, false)} className="h-8 text-xs" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
        </Select>
        <div className="flex items-center gap-1">
          <Input type="date" value={q.deadlineLocked ? q.dueDate ?? '' : ''} onChange={(e) => onChange({ dueDate: e.target.value || undefined, deadlineLocked: !!e.target.value }, true)} className="h-8 text-xs" aria-label="Locked deadline" title="Set a locked deadline" />
          {q.deadlineLocked && <Lock className="size-3.5 shrink-0 text-gold" />}
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${q.title}`}><Trash2 /></Button>
      </div>
    </div>
  );
}

function AddQuestRow({ onAdd }: { onAdd: (title: string, hours: number) => void }) {
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState(1);
  return (
    <form className="flex gap-2 border-t border-line px-3 py-2" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; onAdd(title.trim(), hours); setTitle(''); }}>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a quest to this milestone…" className="h-8 text-xs" aria-label="New quest title" />
      <Input type="number" min={0.25} step={0.25} value={hours} onChange={(e) => setHours(Math.max(0.25, Number(e.target.value) || 1))} className="h-8 w-20 text-xs" aria-label="Hours" />
      <Button type="submit" size="sm" variant="ghost"><Plus /> Add</Button>
      <Badge className="hidden h-8 sm:inline-flex">h</Badge>
    </form>
  );
}
