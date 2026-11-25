import { addDaysKey, diffDays, eachDateKey, isoWeekKey, weekStartKey } from '@/lib/dates';
import { DIFFICULTIES, type Campaign, type Difficulty, type FocusSession, type Quest, type XpEvent } from './types';

export interface DayStat {
  date: string;
  xp: number;
  quests: number;
  focusMinutes: number;
}

export function dailySeries(events: XpEvent[], sessions: FocusSession[], quests: Quest[], from: string, to: string): DayStat[] {
  const map = new Map<string, DayStat>(eachDateKey(from, to).map((d) => [d, { date: d, xp: 0, quests: 0, focusMinutes: 0 }]));
  for (const e of events) if (!e.revoked) { const s = map.get(e.date); if (s) s.xp += e.amount; }
  for (const f of sessions) if (f.mode === 'focus') { const s = map.get(f.date); if (s) s.focusMinutes += f.actualMinutes; }
  for (const q of quests) {
    if (q.status !== 'done' || !q.completedAt) continue;
    const s = map.get(localDate(q.completedAt));
    if (s) s.quests += 1;
  }
  return [...map.values()];
}

export function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function aggregate(series: DayStat[], by: 'week' | 'month'): (DayStat & { label: string })[] {
  const m = new Map<string, DayStat & { label: string }>();
  for (const s of series) {
    const key = by === 'week' ? weekStartKey(s.date) : s.date.slice(0, 7);
    const label = by === 'week' ? isoWeekKey(s.date).slice(5) : s.date.slice(0, 7);
    const cur = m.get(key) ?? { date: key, label, xp: 0, quests: 0, focusMinutes: 0 };
    cur.xp += s.xp;
    cur.quests += s.quests;
    cur.focusMinutes += s.focusMinutes;
    m.set(key, cur);
  }
  return [...m.values()];
}

export function completionByDifficulty(quests: Quest[]): { difficulty: Difficulty; done: number; total: number }[] {
  return DIFFICULTIES.map((d) => {
    const all = quests.filter((q) => q.difficulty === d && !q.archivedAt && q.origin !== 'recurring');
    return { difficulty: d, done: all.filter((q) => q.status === 'done').length, total: all.length };
  });
}

/** Planned (estimate) vs actual (tracked) minutes for completed quests that have tracked time. */
export function plannedVsActual(quests: Quest[], from: string): { week: string; planned: number; actual: number }[] {
  const m = new Map<string, { week: string; planned: number; actual: number }>();
  for (const q of quests) {
    if (q.status !== 'done' || !q.completedAt || q.actualMinutes <= 0) continue;
    const d = localDate(q.completedAt);
    if (d < from) continue;
    const w = isoWeekKey(d).slice(5);
    const cur = m.get(w) ?? { week: w, planned: 0, actual: 0 };
    cur.planned += q.estimatedMinutes;
    cur.actual += q.actualMinutes;
    m.set(w, cur);
  }
  return [...m.values()].sort((a, b) => a.week.localeCompare(b.week));
}

export function timePerCampaign(quests: Quest[], sessions: FocusSession[], campaigns: Campaign[]): { name: string; minutes: number }[] {
  const names = new Map(campaigns.map((c) => [c.id, c.name]));
  const m = new Map<string, number>();
  for (const s of sessions) if (s.mode === 'focus' && s.campaignId) m.set(s.campaignId, (m.get(s.campaignId) ?? 0) + s.actualMinutes);
  // Quests with manually logged time (beyond focus sessions) are counted via actualMinutes when no sessions exist.
  const sessionQuestIds = new Set(sessions.map((s) => s.questId).filter(Boolean));
  for (const q of quests) {
    if (!q.campaignId || q.actualMinutes <= 0 || sessionQuestIds.has(q.id)) continue;
    m.set(q.campaignId, (m.get(q.campaignId) ?? 0) + q.actualMinutes);
  }
  return [...m.entries()].map(([id, minutes]) => ({ name: names.get(id) ?? 'Deleted campaign', minutes: Math.round(minutes) })).sort((a, b) => b.minutes - a.minutes);
}

export function missedDeadlines(quests: Quest[], today: string): { late: Quest[]; overduePending: Quest[] } {
  const late = quests.filter((q) => q.status === 'done' && q.dueDate && q.completedAt && localDate(q.completedAt) > q.dueDate);
  const overduePending = quests.filter((q) => (q.status === 'todo' || q.status === 'in_progress') && !q.archivedAt && q.dueDate && q.dueDate < today);
  return { late, overduePending };
}

/** Share of quests scheduled in the window that got completed. */
export function completionRate(quests: Quest[], from: string, to: string): { rate: number; done: number; planned: number } {
  const planned = quests.filter((q) => q.scheduledDate && q.scheduledDate >= from && q.scheduledDate <= to && !q.archivedAt);
  const done = planned.filter((q) => q.status === 'done').length;
  return { rate: planned.length ? done / planned.length : 0, done, planned: planned.length };
}

export interface HeatCell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/** GitHub-style heatmap: weeks (columns) × weekdays (rows), ending at `today`. */
export function heatmap(series: { date: string; quests: number; focusMinutes: number }[], today: string, weeks = 26): HeatCell[][] {
  const byDate = new Map(series.map((s) => [s.date, s.quests + Math.floor(s.focusMinutes / 25)]));
  const end = addDaysKey(today, 6 - new Date(`${today}T00:00:00`).getDay());
  const start = addDaysKey(end, -(weeks * 7 - 1));
  const cols: HeatCell[][] = [];
  const max = Math.max(1, ...byDate.values());
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDaysKey(start, w * 7 + d);
      const count = date > today ? -1 : byDate.get(date) ?? 0;
      const ratio = count <= 0 ? 0 : count / max;
      const level = (count <= 0 ? 0 : ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1) as HeatCell['level'];
      col.push({ date, count, level });
    }
    cols.push(col);
  }
  return cols;
}

/** Plain-language observations derived strictly from recorded data. Returns nothing when data is too sparse. */
export function insights(series: DayStat[], quests: Quest[]): string[] {
  const out: string[] = [];
  const active = series.filter((s) => s.quests > 0 || s.focusMinutes > 0);
  if (active.length < 3) return ['Not enough history yet — insights appear after a few active days.'];
  const byWeekday = Array.from({ length: 7 }, () => ({ quests: 0, days: 0 }));
  for (const s of series) {
    const wd = new Date(`${s.date}T00:00:00`).getDay();
    byWeekday[wd].quests += s.quests;
    byWeekday[wd].days += 1;
  }
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const best = byWeekday.map((w, i) => ({ i, avg: w.days ? w.quests / w.days : 0 })).sort((a, b) => b.avg - a.avg)[0];
  if (best.avg > 0) out.push(`${names[best.i]} is your most productive day (${best.avg.toFixed(1)} quests on average).`);
  const half = Math.floor(series.length / 2);
  const first = series.slice(0, half).reduce((s, d) => s + d.xp, 0);
  const second = series.slice(half).reduce((s, d) => s + d.xp, 0);
  if (first > 0) {
    const change = (second - first) / first;
    if (Math.abs(change) >= 0.1) out.push(`XP in the second half of this period is ${change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(change) * 100)}% versus the first half.`);
  }
  const tracked = quests.filter((q) => q.status === 'done' && q.actualMinutes > 0 && q.estimatedMinutes > 0);
  if (tracked.length >= 3) {
    const ratio = tracked.reduce((s, q) => s + q.actualMinutes, 0) / tracked.reduce((s, q) => s + q.estimatedMinutes, 0);
    if (ratio > 1.15) out.push(`Quests take ${Math.round((ratio - 1) * 100)}% longer than estimated — consider padding estimates.`);
    else if (ratio < 0.85) out.push(`You finish quests ${Math.round((1 - ratio) * 100)}% faster than estimated.`);
    else out.push('Your time estimates are accurate (within 15%).');
  }
  const focusTotal = series.reduce((s, d) => s + d.focusMinutes, 0);
  if (focusTotal > 0) out.push(`You logged ${Math.round(focusTotal / 60 * 10) / 10}h of focus across ${active.length} active days.`);
  return out;
}

export function daysBetweenInclusive(a: string, b: string): number {
  return diffDays(b, a) + 1;
}
