import type { Campaign, Milestone, Quest } from '@/domain/types';
import { PRIORITY_WEIGHT } from '@/domain/types';
import { schedule, type ScheduleResult, type SchedTask } from './scheduler';

export interface RescheduleOptions {
  today: string;
  /** Hours already committed per date outside this campaign. */
  commitments?: Record<string, number>;
  /** Mark optional (side) quests as skipped instead of rescheduling them. */
  dropOptional?: boolean;
  /** Optionally extend the campaign end date. */
  endDate?: string;
  hoursPerDay?: number;
}

export interface QuestMove {
  questId: string;
  title: string;
  from?: string;
  to?: string;
}

export interface ReschedulePreview {
  missed: Quest[];
  moves: QuestMove[];
  unchanged: number;
  dropped: Quest[];
  unscheduled: Quest[];
  violations: { quest: Quest; due: string; scheduled: string }[];
  milestoneMoves: { milestone: Milestone; from?: string; to?: string }[];
  result: ScheduleResult;
  endDate: string;
  hoursPerDay: number;
}

const isPending = (q: Quest) => q.status === 'todo' || q.status === 'in_progress';

/** Pending campaign quests scheduled before today. */
export function findMissedQuests(quests: Quest[], today: string): Quest[] {
  return quests.filter((q) => isPending(q) && !q.archivedAt && q.scheduledDate !== undefined && q.scheduledDate < today && q.origin !== 'recurring');
}

/**
 * Rebalance the remaining work of a campaign from today onward.
 * Completed work satisfies dependencies; locked deadlines (quest- or milestone-level) are never moved
 * and are reported as violations if they can no longer be met.
 */
export function previewReschedule(
  campaign: Campaign,
  quests: Quest[],
  milestones: Milestone[],
  opts: RescheduleOptions,
): ReschedulePreview {
  const endDate = opts.endDate ?? campaign.endDate;
  const hoursPerDay = opts.hoursPerDay ?? campaign.hoursPerDay;
  const start = opts.today > campaign.startDate ? opts.today : campaign.startDate;
  const pending = quests.filter((q) => isPending(q) && !q.archivedAt && q.origin !== 'recurring');
  const dropped = opts.dropOptional ? pending.filter((q) => q.optional && q.origin !== 'revision') : [];
  const droppedIds = new Set(dropped.map((q) => q.id));
  const lockedMs = new Map(milestones.filter((m) => m.deadlineLocked && m.dueDate).map((m) => [m.id, m.dueDate!]));

  // Future revision quests stay where they are and count as commitments.
  const commitments: Record<string, number> = { ...(opts.commitments ?? {}) };
  const movable: Quest[] = [];
  for (const q of pending) {
    if (droppedIds.has(q.id)) continue;
    if (q.origin === 'revision') {
      if (q.scheduledDate && q.scheduledDate >= start) commitments[q.scheduledDate] = (commitments[q.scheduledDate] ?? 0) + q.estimatedMinutes / 60;
      continue;
    }
    movable.push(q);
  }
  const movableIds = new Set(movable.map((q) => q.id));
  movable.sort((a, b) => (a.scheduledDate ?? '9999').localeCompare(b.scheduledDate ?? '9999') || a.order - b.order);
  const tasks: SchedTask[] = movable.map((q, i) => {
    const dues = [q.deadlineLocked ? q.dueDate : undefined, q.milestoneId ? lockedMs.get(q.milestoneId) : undefined].filter(Boolean) as string[];
    return {
      id: q.id,
      hours: Math.max(0.25, (q.estimatedMinutes - Math.min(q.actualMinutes, q.estimatedMinutes * 0.9)) / 60),
      deps: q.dependencies.filter((d) => movableIds.has(d)),
      priority: PRIORITY_WEIGHT[q.priority],
      group: q.questlineId ?? 'none',
      optional: q.optional,
      order: i,
      lockedDue: dues.sort()[0],
    };
  });

  const result = schedule(tasks, {
    startDate: start,
    endDate,
    workdays: campaign.workdays,
    hoursPerDay,
    commitments,
    revisionEvery: 0,
    bufferRatio: 0,
  });

  const moves: QuestMove[] = [];
  let unchanged = 0;
  for (const q of movable) {
    const to = result.assignments[q.id];
    if (to === q.scheduledDate) unchanged++;
    else moves.push({ questId: q.id, title: q.title, from: q.scheduledDate, to });
  }
  const byId = new Map(movable.map((q) => [q.id, q]));

  const milestoneMoves: ReschedulePreview['milestoneMoves'] = [];
  for (const m of milestones) {
    if (m.deadlineLocked) continue;
    const dates = quests
      .filter((q) => q.milestoneId === m.id && !q.optional && !droppedIds.has(q.id))
      .map((q) => (movableIds.has(q.id) ? result.assignments[q.id] : q.status === 'done' ? undefined : q.scheduledDate))
      .filter((d): d is string => !!d)
      .sort();
    const to = dates[dates.length - 1] ?? m.dueDate;
    if (to !== m.dueDate) milestoneMoves.push({ milestone: m, from: m.dueDate, to });
  }

  return {
    missed: findMissedQuests(quests, opts.today),
    moves,
    unchanged,
    dropped,
    unscheduled: result.unscheduled.map((id) => byId.get(id)!).filter(Boolean),
    violations: result.violations.map((v) => ({ quest: byId.get(v.taskId)!, due: v.due, scheduled: v.scheduled })),
    milestoneMoves,
    result,
    endDate,
    hoursPerDay,
  };
}
