import { addDaysKey, minutesFromTime, weekdayOf } from '@/lib/dates';
import { PRIORITY_WEIGHT, type Quest, type Settings, type TimeBlock } from './types';

export const isPending = (q: Quest) => (q.status === 'todo' || q.status === 'in_progress') && !q.archivedAt;

export function isOverdue(q: Quest, today: string): boolean {
  if (!isPending(q)) return false;
  if (q.dueDate && q.dueDate < today) return true;
  return q.origin !== 'recurring' && !!q.scheduledDate && q.scheduledDate < today;
}

/** Quests that belong on today's agenda: scheduled or due today, plus anything overdue. */
export function questsForDay(quests: Quest[], day: string, today: string): Quest[] {
  return quests.filter((q) => {
    if (q.archivedAt) return false;
    if (q.status === 'done') return q.completedAt?.slice(0, 10) === day || q.scheduledDate === day;
    if (q.status === 'skipped') return false;
    if (q.scheduledDate === day || (!q.scheduledDate && q.dueDate === day)) return true;
    return day === today && isOverdue(q, today);
  });
}

export function depsMet(q: Quest, byId: Map<string, Quest>): boolean {
  return q.dependencies.every((d) => {
    const dep = byId.get(d);
    return !dep || dep.status === 'done' || dep.status === 'skipped';
  });
}

export function questScore(q: Quest, today: string, remainingMinutes: number): number {
  let s = PRIORITY_WEIGHT[q.priority] * 10;
  if (isOverdue(q, today)) s += 30;
  if (q.dueDate === today) s += 20;
  else if (q.dueDate && q.dueDate <= addDaysKey(today, 2)) s += 10;
  if (q.scheduledDate === today) s += 10;
  if (q.status === 'in_progress') s += 8;
  if (q.category === 'boss') s += 5;
  if (q.estimatedMinutes <= remainingMinutes) s += 5;
  if (q.optional) s -= 8;
  return s;
}

export interface Briefing {
  today: Quest[];
  pending: Quest[];
  completedToday: Quest[];
  overdue: Quest[];
  upcoming: Quest[];
  priorities: Quest[];
  plannedMinutes: number;
  availableMinutes: number;
  commitmentMinutes: number;
  isWorkday: boolean;
  recommended?: { quest: Quest; reasons: string[] };
  lines: string[];
}

export function buildBriefing(args: { quests: Quest[]; settings: Settings; today: string; timeBlocks: TimeBlock[] }): Briefing {
  const { quests, settings, today } = args;
  const byId = new Map(quests.map((q) => [q.id, q]));
  const list = questsForDay(quests, today, today);
  const pending = list.filter(isPending);
  const completedToday = quests.filter((q) => q.status === 'done' && q.completedAt?.slice(0, 10) === today);
  const overdue = quests.filter((q) => isOverdue(q, today));
  const horizon = addDaysKey(today, 7);
  const upcoming = quests
    .filter((q) => isPending(q) && q.dueDate && q.dueDate >= today && q.dueDate <= horizon)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
  const isWorkday = settings.workdays.includes(weekdayOf(today));
  const commitmentMinutes = args.timeBlocks
    .filter((b) => b.date === today && b.kind === 'commitment')
    .reduce((s, b) => s + Math.max(0, minutesFromTime(b.end) - minutesFromTime(b.start)), 0);
  const plannedMinutes = pending.reduce((s, q) => s + Math.max(0, q.estimatedMinutes - q.actualMinutes), 0);
  const availableMinutes = Math.max(0, (isWorkday ? settings.dailyHours * 60 : 0) - commitmentMinutes);
  const remaining = Math.max(0, availableMinutes - completedToday.reduce((s, q) => s + q.estimatedMinutes, 0));

  const ready = pending.filter((q) => depsMet(q, byId));
  const ranked = [...ready].sort((a, b) => questScore(b, today, remaining) - questScore(a, today, remaining));
  const priorities = ranked.slice(0, 3);
  let recommended: Briefing['recommended'];
  if (ranked[0]) {
    const q = ranked[0];
    const reasons: string[] = [];
    if (isOverdue(q, today)) reasons.push('overdue');
    if (q.dueDate === today) reasons.push('due today');
    if (q.priority === 'high' || q.priority === 'critical') reasons.push(`${q.priority} priority`);
    if (q.status === 'in_progress') reasons.push('already in progress');
    if (q.category === 'boss') reasons.push('boss quest');
    if (q.estimatedMinutes <= remaining) reasons.push('fits your remaining time');
    if (reasons.length === 0) reasons.push('next in your plan');
    recommended = { quest: q, reasons };
  }

  const lines: string[] = [];
  const h = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}h` : `${Math.round(m)}m`);
  if (pending.length === 0 && completedToday.length === 0) lines.push('No quests scheduled for today.');
  else lines.push(`${pending.length} quest${pending.length === 1 ? '' : 's'} remaining today (${h(plannedMinutes)} planned), ${completedToday.length} completed.`);
  if (isWorkday) {
    lines.push(`You have about ${h(availableMinutes)} of focus time${commitmentMinutes ? ` after ${h(commitmentMinutes)} of commitments` : ''}.`);
    if (plannedMinutes > remaining + 15) lines.push(`Today is over-planned by ${h(plannedMinutes - remaining)} — consider moving lower-priority quests.`);
  } else lines.push('Today is a rest day in your schedule.');
  if (overdue.length) lines.push(`${overdue.length} overdue quest${overdue.length === 1 ? ' needs' : 's need'} attention.`);
  if (upcoming.length) lines.push(`Next deadline: “${upcoming[0].title}” on ${upcoming[0].dueDate}.`);
  return { today: list, pending, completedToday, overdue, upcoming, priorities, plannedMinutes, availableMinutes, commitmentMinutes, isWorkday, recommended, lines };
}
