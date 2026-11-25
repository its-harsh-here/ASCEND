import { eachDateKey, weekdayOf } from '@/lib/dates';

/**
 * Capacity-aware list scheduler.
 *
 * - Places tasks on working days without exceeding each day's remaining capacity
 *   (daily hours minus existing commitments).
 * - Respects dependencies (a task never precedes a prerequisite).
 * - Orders ready tasks by deadline urgency, priority and critical-path weight
 *   (hours of downstream work), while interleaving questlines so a single track
 *   does not monopolize a day.
 * - Reserves periodic revision days and final buffer days; buffer days are only
 *   consumed when normal capacity runs out.
 * - Never overloads: tasks that do not fit are reported as unscheduled.
 */

export interface SchedTask {
  id: string;
  hours: number;
  deps: string[];
  /** 0 (low) … 3 (critical) */
  priority: number;
  group: string;
  optional: boolean;
  order: number;
  lockedDue?: string;
  fixedDate?: string;
  notBefore?: string;
}

export interface ScheduleOptions {
  startDate: string;
  endDate: string;
  workdays: number[];
  hoursPerDay: number;
  /** Hours already committed per date (other campaigns, time blocks, recurring quests). */
  commitments?: Record<string, number>;
  /** Insert a revision day every N working days (0 disables). */
  revisionEvery?: number;
  /** Share of a revision day reserved for revision (rest stays available for tasks). */
  revisionShare?: number;
  /** Share of working days at the end held back as buffer. */
  bufferRatio?: number;
}

export type DayKind = 'work' | 'revision' | 'buffer' | 'off';

export interface DayPlan {
  date: string;
  kind: DayKind;
  /** Hours available for tasks after commitments and revision reservations. */
  capacity: number;
  revisionHours: number;
  commitments: number;
  planned: number;
  taskIds: string[];
}

export interface ScheduleResult {
  assignments: Record<string, string>;
  days: DayPlan[];
  unscheduled: string[];
  violations: { taskId: string; due: string; scheduled: string }[];
  cycle: string[];
  usedBuffer: boolean;
  requiredHours: number;
  optionalHours: number;
  availableHours: number;
  bufferHours: number;
  feasible: boolean;
  utilization: number;
}

const EPS = 0.01;

export function buildDays(opts: ScheduleOptions): DayPlan[] {
  const workdays = new Set(opts.workdays);
  const revisionEvery = opts.revisionEvery ?? 6;
  const revisionShare = opts.revisionShare ?? 0.5;
  const bufferRatio = opts.bufferRatio ?? 0.08;
  if (opts.endDate < opts.startDate) return [];
  const days: DayPlan[] = eachDateKey(opts.startDate, opts.endDate).map((date) => {
    const commitments = opts.commitments?.[date] ?? 0;
    const isWork = workdays.has(weekdayOf(date));
    return {
      date,
      kind: isWork ? 'work' : 'off',
      capacity: isWork ? Math.max(0, opts.hoursPerDay - commitments) : 0,
      revisionHours: 0,
      commitments,
      planned: 0,
      taskIds: [],
    };
  });
  const work = days.filter((d) => d.kind === 'work');
  const bufferCount = work.length >= 7 && bufferRatio > 0 ? Math.max(1, Math.round(work.length * bufferRatio)) : 0;
  for (let i = work.length - bufferCount; i < work.length; i++) work[i].kind = 'buffer';
  if (revisionEvery > 0) {
    const normal = work.filter((d) => d.kind === 'work');
    normal.forEach((d, i) => {
      if ((i + 1) % revisionEvery === 0 && i < normal.length - 1) {
        d.kind = 'revision';
        d.revisionHours = Math.min(2, Math.round(d.capacity * revisionShare * 4) / 4);
        d.capacity = Math.max(0, d.capacity - d.revisionHours);
      }
    });
  }
  return days;
}

/** Returns ids involved in dependency cycles (empty when the graph is a DAG). */
export function findCycle(tasks: SchedTask[]): string[] {
  const ids = new Set(tasks.map((t) => t.id));
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const t of tasks) {
    indeg.set(t.id, indeg.get(t.id) ?? 0);
    for (const d of t.deps) {
      if (!ids.has(d)) continue;
      indeg.set(t.id, (indeg.get(t.id) ?? 0) + 1);
      (out.get(d) ?? out.set(d, []).get(d)!).push(t.id);
    }
  }
  const queue = [...indeg].filter(([, n]) => n === 0).map(([id]) => id);
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    seen.add(id);
    for (const nxt of out.get(id) ?? []) {
      const n = (indeg.get(nxt) ?? 0) - 1;
      indeg.set(nxt, n);
      if (n === 0) queue.push(nxt);
    }
  }
  return tasks.filter((t) => !seen.has(t.id)).map((t) => t.id);
}

/** Topological order (stable by `order`); tasks in cycles are omitted. */
export function topoOrder(tasks: SchedTask[]): SchedTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const temp = new Set<string>();
  const out: SchedTask[] = [];
  const visit = (t: SchedTask): boolean => {
    if (visited.has(t.id)) return true;
    if (temp.has(t.id)) return false;
    temp.add(t.id);
    for (const d of t.deps) {
      const dt = byId.get(d);
      if (dt && !visit(dt)) return false;
    }
    temp.delete(t.id);
    visited.add(t.id);
    out.push(t);
    return true;
  };
  for (const t of [...tasks].sort((a, b) => a.order - b.order)) visit(t);
  return out;
}

function downstreamHours(tasks: SchedTask[]): Map<string, number> {
  const children = new Map<string, string[]>();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) for (const d of t.deps) if (byId.has(d)) (children.get(d) ?? children.set(d, []).get(d)!).push(t.id);
  const memo = new Map<string, Set<string>>();
  const desc = (id: string, stack: Set<string>): Set<string> => {
    const cached = memo.get(id);
    if (cached) return cached;
    const set = new Set<string>();
    if (stack.has(id)) return set;
    stack.add(id);
    for (const c of children.get(id) ?? []) {
      set.add(c);
      for (const x of desc(c, stack)) set.add(x);
    }
    stack.delete(id);
    memo.set(id, set);
    return set;
  };
  const out = new Map<string, number>();
  for (const t of tasks) {
    let h = 0;
    for (const id of desc(t.id, new Set())) if (!byId.get(id)!.optional) h += byId.get(id)!.hours;
    out.set(t.id, h);
  }
  return out;
}

export function schedule(tasks: SchedTask[], opts: ScheduleOptions): ScheduleResult {
  const days = buildDays(opts);
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const cycle = findCycle(tasks);
  const cycleSet = new Set(cycle);
  const assignments: Record<string, string> = {};
  const weight = downstreamHours(tasks.filter((t) => !cycleSet.has(t.id)));
  const workIdx = days.map((d, i) => (d.kind !== 'off' ? i : -1)).filter((i) => i >= 0);
  // A task larger than every day's capacity may occupy an otherwise empty day (and is flagged by the UI);
  // anything that fits somewhere must wait for a day with enough room.
  const maxCapacity = Math.max(0, ...days.map((d) => d.capacity));

  const place = (t: SchedTask, day: DayPlan) => {
    assignments[t.id] = day.date;
    day.planned += t.hours;
    day.taskIds.push(t.id);
  };

  // 1. Fixed tasks first.
  for (const t of tasks) {
    if (!t.fixedDate || cycleSet.has(t.id)) continue;
    const idx = dayIndex.get(t.fixedDate);
    if (idx !== undefined) place(t, days[idx]);
    else assignments[t.id] = t.fixedDate; // outside window: keep as-is, does not consume capacity
  }

  const remaining = new Set(tasks.filter((t) => !assignments[t.id] && !cycleSet.has(t.id)).map((t) => t.id));

  const depsSatisfied = (t: SchedTask, date: string): boolean =>
    t.deps.every((d) => {
      if (!byId.has(d)) return true; // external dependency (e.g. already completed)
      const a = assignments[d];
      return a !== undefined && a <= date;
    });

  const workingDaysBetween = (fromIdx: number, due: string): number => {
    let n = 0;
    for (const i of workIdx) if (i >= fromIdx && days[i].date <= due) n++;
    return n;
  };

  const fillDay = (dayIdx: number) => {
    const day = days[dayIdx];
    const fullCap = day.capacity;
    let cap = fullCap - day.planned;
    const groupHours = new Map<string, number>();
    for (const id of day.taskIds) {
      const t = byId.get(id);
      if (t) groupHours.set(t.group, (groupHours.get(t.group) ?? 0) + t.hours);
    }
    for (;;) {
      if (cap <= EPS) break;
      const ready: SchedTask[] = [];
      for (const id of remaining) {
        const t = byId.get(id)!;
        if (t.notBefore && t.notBefore > day.date) continue;
        if (!depsSatisfied(t, day.date)) continue;
        const oversized = t.hours > maxCapacity + EPS && day.planned <= EPS && fullCap >= maxCapacity - EPS && fullCap > 0;
        if (t.hours <= cap + EPS || oversized) ready.push(t);
      }
      if (ready.length === 0) break;
      const groupsReady = new Set(ready.map((t) => t.group));
      let best: SchedTask | null = null;
      let bestScore = -Infinity;
      for (const t of ready) {
        let score = t.priority * 8 + (weight.get(t.id) ?? 0) * 0.6 - t.order * 0.0001;
        if (t.optional) score -= 30;
        if (t.lockedDue) {
          const slack = workingDaysBetween(dayIdx, t.lockedDue) - Math.ceil((t.hours + (weight.get(t.id) ?? 0)) / Math.max(1, opts.hoursPerDay));
          score += slack <= 0 ? 200 : Math.max(0, 80 - slack * 6);
        }
        const share = (groupHours.get(t.group) ?? 0) / Math.max(fullCap, EPS);
        if (share >= 0.6 && groupsReady.size > 1) score -= 40;
        else if (share > 0) score += 3;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (!best) break;
      place(best, day);
      remaining.delete(best.id);
      cap -= best.hours;
      groupHours.set(best.group, (groupHours.get(best.group) ?? 0) + best.hours);
    }
  };

  for (let i = 0; i < days.length; i++) if (days[i].kind === 'work' || days[i].kind === 'revision') fillDay(i);
  let usedBuffer = false;
  if (remaining.size > 0) {
    for (let i = 0; i < days.length; i++) {
      if (days[i].kind !== 'buffer') continue;
      const before = remaining.size;
      fillDay(i);
      if (remaining.size !== before) usedBuffer = true;
    }
  }

  const violations: ScheduleResult['violations'] = [];
  for (const t of tasks) {
    const a = assignments[t.id];
    if (t.lockedDue && a && a > t.lockedDue) violations.push({ taskId: t.id, due: t.lockedDue, scheduled: a });
  }

  const pending = tasks.filter((t) => !t.fixedDate);
  const requiredHours = pending.filter((t) => !t.optional).reduce((s, t) => s + t.hours, 0);
  const optionalHours = pending.filter((t) => t.optional).reduce((s, t) => s + t.hours, 0);
  const availableHours = days.filter((d) => d.kind === 'work' || d.kind === 'revision').reduce((s, d) => s + d.capacity, 0);
  const bufferHours = days.filter((d) => d.kind === 'buffer').reduce((s, d) => s + d.capacity, 0);
  const unscheduled = [...remaining, ...cycle];
  const feasible = unscheduled.every((id) => byId.get(id)?.optional) && violations.length === 0 && cycle.length === 0;

  return {
    assignments,
    days,
    unscheduled,
    violations,
    cycle,
    usedBuffer,
    requiredHours,
    optionalHours,
    availableHours,
    bufferHours,
    feasible,
    utilization: availableHours > 0 ? (requiredHours + optionalHours) / availableHours : Infinity,
  };
}
