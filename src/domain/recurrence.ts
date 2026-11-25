import { addDaysKey, diffDays, eachDateKey, weekStartKey, weekdayOf } from '@/lib/dates';
import type { RecurrenceRule } from './types';

/**
 * Dates on which a recurring rule produces an instance, within [from, to] inclusive.
 * - daily:    every `interval` days from startDate
 * - weekdays: each listed weekday (every `interval` weeks)
 * - weekly:   once per ISO week, on the first listed weekday (default Monday)
 */
export function occurrencesBetween(rule: RecurrenceRule, from: string, to: string): string[] {
  const start = from < rule.startDate ? rule.startDate : from;
  const end = rule.endDate && rule.endDate < to ? rule.endDate : to;
  if (end < start) return [];
  const out: string[] = [];
  const ruleWeekStart = weekStartKey(rule.startDate);
  for (const d of eachDateKey(start, end)) {
    const weeksSince = Math.floor(diffDays(weekStartKey(d), ruleWeekStart) / 7);
    switch (rule.frequency) {
      case 'daily':
        if (diffDays(d, rule.startDate) % rule.interval === 0) out.push(d);
        break;
      case 'weekdays':
        if (rule.weekdays.includes(weekdayOf(d)) && weeksSince % rule.interval === 0) out.push(d);
        break;
      case 'weekly': {
        const target = rule.weekdays.length ? rule.weekdays[0] : 1;
        if (weekdayOf(d) === target && weeksSince % rule.interval === 0) out.push(d);
        break;
      }
    }
  }
  return out;
}

/** Last day an instance is still actionable: same day for daily quests, the end of the ISO week for weekly ones. */
export function instanceExpiry(rule: Pick<RecurrenceRule, 'frequency' | 'category'>, date: string): string {
  if (rule.frequency === 'weekly' || rule.category === 'weekly') return addDaysKey(weekStartKey(date), 6);
  return date;
}

export function describeRecurrence(rule: Pick<RecurrenceRule, 'frequency' | 'interval' | 'weekdays'>): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (rule.frequency) {
    case 'daily':
      return rule.interval === 1 ? 'Every day' : `Every ${rule.interval} days`;
    case 'weekdays':
      return `${rule.interval > 1 ? `Every ${rule.interval} weeks on ` : 'Every '}${rule.weekdays
        .slice()
        .sort()
        .map((w) => names[w])
        .join(', ')}`;
    case 'weekly':
      return rule.interval === 1 ? `Weekly (${names[rule.weekdays[0] ?? 1]})` : `Every ${rule.interval} weeks`;
  }
}
