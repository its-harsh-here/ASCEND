import { db } from '@/db/schema';
import { instanceExpiry, occurrencesBetween } from '@/domain/recurrence';
import { questSchema, recurrenceSchema, type Quest, type RecurrenceRule } from '@/domain/types';
import { addDaysKey, todayKey } from '@/lib/dates';
import { nowIso, uid } from '@/lib/utils';

export const RECURRENCE_LOOKAHEAD_DAYS = 6;

export function recurringInstanceId(ruleId: string, date: string): string {
  return `rec:${ruleId}:${date}`;
}

/**
 * Materialize recurring quest instances for [today, today + lookahead] and expire stale ones.
 * Deterministic ids make this idempotent — safe to call on every app start and day change.
 * Past days are never back-filled, so returning after a break does not create a pile of overdue habits.
 */
export async function ensureRecurringInstances(today = todayKey()): Promise<{ created: number; expired: number }> {
  const horizon = addDaysKey(today, RECURRENCE_LOOKAHEAD_DAYS);
  let created = 0;
  let expired = 0;
  await db.transaction('rw', db.recurrences, db.quests, async () => {
    const rules = await db.recurrences.toArray();
    for (const rule of rules) {
      if (!rule.active) continue;
      for (const date of occurrencesBetween(rule, today, horizon)) {
        const id = recurringInstanceId(rule.id, date);
        if (await db.quests.get(id)) continue;
        const now = nowIso();
        await db.quests.add(
          questSchema.parse({
            id,
            title: rule.title,
            description: rule.description,
            category: rule.category,
            difficulty: rule.difficulty,
            priority: rule.priority,
            estimatedMinutes: rule.estimatedMinutes,
            scheduledDate: date,
            dueDate: instanceExpiry(rule, date),
            tags: rule.tags,
            skillIds: rule.skillIds,
            campaignId: rule.campaignId,
            recurrenceId: rule.id,
            recurrenceDate: date,
            origin: 'recurring',
            order: 0,
            createdAt: now,
            updatedAt: now,
          }),
        );
        created++;
      }
    }
    const stale = await db.quests
      .where('recurrenceId')
      .above('')
      .filter((q) => (q.status === 'todo' || q.status === 'in_progress') && !!q.dueDate && q.dueDate < today)
      .toArray();
    for (const q of stale) {
      await db.quests.update(q.id, { status: 'skipped', updatedAt: nowIso() });
      expired++;
    }
  });
  return { created, expired };
}

export type RecurrenceInput = Omit<RecurrenceRule, 'id' | 'createdAt'>;

export async function createRecurrence(input: Partial<RecurrenceInput> & Pick<RecurrenceInput, 'title' | 'frequency' | 'startDate'>): Promise<RecurrenceRule> {
  const rule = recurrenceSchema.parse({ ...input, id: uid(), createdAt: nowIso() });
  await db.recurrences.add(rule);
  await ensureRecurringInstances();
  return rule;
}

export async function updateRecurrence(id: string, patch: Partial<RecurrenceRule>): Promise<void> {
  const r = await db.recurrences.get(id);
  if (!r) return;
  await db.recurrences.put(recurrenceSchema.parse({ ...r, ...patch, id }));
  // Future, untouched instances are regenerated from the updated rule.
  const today = todayKey();
  await db.quests
    .where('recurrenceId')
    .equals(id)
    .filter((q: Quest) => q.status === 'todo' && (q.recurrenceDate ?? '') > today)
    .delete();
  await ensureRecurringInstances(today);
}

/** Delete a rule and its future, unfinished instances. Completed history is kept. */
export async function deleteRecurrence(id: string): Promise<void> {
  const today = todayKey();
  await db.transaction('rw', db.recurrences, db.quests, async () => {
    await db.quests
      .where('recurrenceId')
      .equals(id)
      .filter((q) => q.status !== 'done' && (q.recurrenceDate ?? '') >= today)
      .delete();
    await db.recurrences.delete(id);
  });
}
