import { addDaysKey, weekdayOf } from '@/lib/dates';
import { recurringLoad, scheduleDraft, type DraftPlan, type PlanInput } from './planner';
import { buildDays } from './scheduler';

export type FeasibilityStatus = 'comfortable' | 'tight' | 'overloaded';

export interface FeasibilityOption {
  kind: 'extend' | 'hours' | 'scope' | 'prioritize';
  title: string;
  detail: string;
  /** Payload the UI applies when the user picks this option. */
  endDate?: string;
  hoursPerDay?: number;
  deferGoalIds?: string[];
}

export interface FeasibilityReport {
  status: FeasibilityStatus;
  requiredHours: number;
  optionalHours: number;
  availableHours: number;
  bufferHours: number;
  utilization: number;
  unscheduledCount: number;
  unscheduledRequired: number;
  violations: number;
  headline: string;
  options: FeasibilityOption[];
}

function capacityUntil(plan: DraftPlan, endDate: string, hoursPerDay: number): number {
  const { input } = plan;
  const commitments: Record<string, number> = { ...(input.commitments ?? {}) };
  for (const [d, h] of Object.entries(recurringLoad(plan.recurring, input.startDate, endDate, input.workdays))) {
    commitments[d] = (commitments[d] ?? 0) + h;
  }
  return buildDays({
    startDate: input.startDate,
    endDate,
    workdays: input.workdays,
    hoursPerDay,
    commitments,
    revisionEvery: input.revisionEvery ?? 6,
    bufferRatio: input.bufferRatio ?? 0.08,
  })
    .filter((d) => d.kind === 'work' || d.kind === 'revision')
    .reduce((s, d) => s + d.capacity, 0);
}

/** Re-run the real scheduler with modified inputs and report whether all required work fits. */
function fitsWith(plan: DraftPlan, patch: Partial<PlanInput>, requiredOnly: boolean): boolean {
  const trial = scheduleDraft({
    ...plan,
    input: { ...plan.input, ...patch },
    quests: plan.quests.filter((q) => q.origin !== 'revision').map((q) => ({ ...q, deps: [...q.deps] })),
    milestones: plan.milestones.map((m) => ({ ...m })),
  });
  const optional = new Set(trial.quests.filter((q) => q.optional).map((q) => q.id));
  const blocking = trial.schedule.unscheduled.filter((id) => !requiredOnly || !optional.has(id));
  return blocking.length === 0 && trial.schedule.violations.length === 0;
}

function recurringHoursPerWorkday(plan: DraftPlan): number {
  let mins = 0;
  for (const r of plan.recurring) if (r.enabled) mins += r.frequency === 'daily' ? r.minutes : (r.minutes * r.weekdays.length) / 7;
  return mins / 60;
}

export function assessFeasibility(plan: DraftPlan): FeasibilityReport {
  const s = plan.schedule;
  const quests = plan.quests.filter((q) => q.origin !== 'revision');
  const byId = new Map(quests.map((q) => [q.id, q]));
  const unscheduledRequired = s.unscheduled.filter((id) => !byId.get(id)?.optional).length;
  const total = s.requiredHours + s.optionalHours;
  const utilization = s.availableHours > 0 ? total / s.availableHours : Infinity;
  let status: FeasibilityStatus = 'comfortable';
  if (unscheduledRequired > 0 || s.violations.length > 0 || s.cycle.length > 0) status = 'overloaded';
  else if (utilization > 0.9 || s.usedBuffer || s.unscheduled.length > 0) status = 'tight';

  const options: FeasibilityOption[] = [];
  if (status !== 'comfortable') {
    const { input } = plan;
    const target = status === 'overloaded' ? s.requiredHours : total;
    // 1. Extend the timeline until capacity covers the work.
    const requiredOnly = status === 'overloaded';
    let end = input.endDate;
    for (let i = 0; i < 730 && capacityUntil(plan, end, input.hoursPerDay) < target * 1.02; i++) end = addDaysKey(end, 1);
    for (let i = 0; i < 40 && !fitsWith(plan, { endDate: end }, requiredOnly); i++) end = addDaysKey(end, 3);
    while (!input.workdays.includes(weekdayOf(end))) end = addDaysKey(end, 1);
    if (end !== input.endDate) {
      options.push({ kind: 'extend', title: 'Extend the timeline', detail: `Move the end date to ${end} to fit all required work without overload.`, endDate: end });
    }
    // 2. Increase daily hours.
    let hours = input.hoursPerDay;
    while (hours < 16 && capacityUntil(plan, input.endDate, hours) < target * 1.02) hours += 0.5;
    while (hours < 16 && !fitsWith(plan, { hoursPerDay: hours }, requiredOnly)) hours += 0.5;
    if (hours > input.hoursPerDay) {
      const recurringH = recurringHoursPerWorkday(plan);
      options.push({
        kind: 'hours',
        title: 'Increase available time',
        detail:
          hours > 10
            ? `It would take about ${hours}h per working day — likely unsustainable. Consider another option.`
            : `Plan for ${hours}h per working day (including ~${recurringH.toFixed(1)}h of recurring quests).`,
        hoursPerDay: hours,
      });
    }
    // 3. Reduce scope.
    if (s.optionalHours > 0) {
      options.push({ kind: 'scope', title: 'Reduce scope', detail: `Drop optional side quests to free ${s.optionalHours.toFixed(1)}h.` });
    }
    // 4. Prioritize: defer the lowest-ranked goals until the remainder fits.
    const goals = [...input.goals].sort((a, b) => b.rank - a.rank);
    const hoursByGoal = new Map<string, number>();
    for (const q of quests) if (!q.optional) hoursByGoal.set(q.goalId, (hoursByGoal.get(q.goalId) ?? 0) + q.hours);
    const defer: string[] = [];
    let need = s.requiredHours - s.availableHours;
    for (const g of goals) {
      if (need <= 0 || defer.length >= goals.length - 1) break;
      defer.push(g.id);
      need -= hoursByGoal.get(g.id) ?? 0;
    }
    if (defer.length) {
      const names = defer.map((id) => plan.questlines.find((l) => l.id === id)?.title ?? id);
      options.push({
        kind: 'prioritize',
        title: 'Prioritize goals',
        detail:
          need <= 0
            ? `Defer ${names.join(', ')} to a later campaign and focus on the rest.`
            : `Defer ${names.join(', ')}. The remaining goal still needs about ${need.toFixed(0)}h more — combine with another option.`,
        deferGoalIds: defer,
      });
    }
  }

  const pct = Number.isFinite(utilization) ? Math.round(utilization * 100) : 999;
  const headline =
    status === 'comfortable'
      ? `Realistic plan — ${pct}% of available focus time is used, leaving room for buffers.`
      : status === 'tight'
        ? `Tight plan — ${pct}% of available time is used${s.usedBuffer ? ' and buffer days are already consumed' : ''}.`
        : `Overloaded — ${unscheduledRequired} required quest${unscheduledRequired === 1 ? '' : 's'} cannot fit${s.violations.length ? ` and ${s.violations.length} locked deadline${s.violations.length === 1 ? ' is' : 's are'} at risk` : ''}.`;

  return {
    status,
    requiredHours: s.requiredHours,
    optionalHours: s.optionalHours,
    availableHours: s.availableHours,
    bufferHours: s.bufferHours,
    utilization,
    unscheduledCount: s.unscheduled.length,
    unscheduledRequired,
    violations: s.violations.length,
    headline,
    options,
  };
}
