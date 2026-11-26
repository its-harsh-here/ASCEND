import type { ZodType } from 'zod';
import {
  achievementUnlockSchema,
  campaignSchema,
  DEFAULT_SETTINGS,
  focusSessionSchema,
  milestoneSchema,
  questlineSchema,
  questSchema,
  recurrenceSchema,
  redemptionSchema,
  reviewSchema,
  rewardSchema,
  settingsSchema,
  subtaskSchema,
  timeBlockSchema,
  xpEventSchema,
} from '@/domain/types';
import { z } from 'zod';

/** Keep in step with private.synced_tables in supabase/migrations/*_sync.sql. `activity` is device-local. */
export const SYNCED_TABLES = [
  'settings', 'campaigns', 'questlines', 'milestones', 'quests', 'subtasks', 'recurrences', 'timeBlocks',
  'reviews', 'rewards', 'redemptions', 'focusSessions', 'xpEvents', 'achievements', 'questCompletionEvents',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];
export const isSyncedTable = (t: string): t is SyncedTable => (SYNCED_TABLES as readonly string[]).includes(t);

export const questCompletionEventSchema = z.object({
  eventId: z.string(),
  questId: z.string(),
  kind: z.enum(['complete', 'reopen']),
  occurredAt: z.string(),
});

const SCHEMAS: Record<SyncedTable, ZodType> = {
  settings: settingsSchema,
  campaigns: campaignSchema,
  questlines: questlineSchema,
  milestones: milestoneSchema,
  quests: questSchema,
  subtasks: subtaskSchema,
  recurrences: recurrenceSchema,
  timeBlocks: timeBlockSchema,
  reviews: reviewSchema,
  rewards: rewardSchema,
  redemptions: redemptionSchema,
  focusSessions: focusSessionSchema,
  xpEvents: xpEventSchema,
  achievements: achievementUnlockSchema,
  questCompletionEvents: questCompletionEventSchema,
};

/** Primary key property per table (the server's `id`). */
export const keyOf = (table: SyncedTable): string => (table === 'questCompletionEvents' ? 'eventId' : 'id');

/**
 * Settings keys that belong to this device, not the account: appearance, motion, notification
 * permission, local AI and backup bookkeeping. focus.sound / focus.volume are device-local too.
 */
export const DEVICE_LOCAL_SETTINGS = ['theme', 'accent', 'reducedMotion', 'notifications', 'ai', 'lastBackupAt'] as const;
const DEVICE_LOCAL_FOCUS = ['sound', 'volume'] as const;

type Rec = Record<string, unknown>;

/** The part of a local record that syncs. */
export function toCloud(table: SyncedTable, record: Rec): Rec {
  if (table !== 'settings') return record;
  const out: Rec = { ...record };
  for (const k of DEVICE_LOCAL_SETTINGS) delete out[k];
  if (out.focus && typeof out.focus === 'object') {
    const focus = { ...(out.focus as Rec) };
    for (const k of DEVICE_LOCAL_FOCUS) delete focus[k];
    out.focus = focus;
  }
  return out;
}

/** Drop JSON nulls: the server strips them, Zod optional fields expect `undefined`. */
function stripNulls(v: Rec): Rec {
  const out: Rec = {};
  for (const [k, val] of Object.entries(v)) if (val !== null) out[k] = val;
  return out;
}

/**
 * A pulled record as a local record, validated with the app's own Zod schema. Device-local settings
 * keep this device's values. Returns null for data that doesn't validate: it is skipped, never
 * written, so a bad row can't corrupt the local journal.
 */
export function fromCloud(table: SyncedTable, data: Rec, local?: Rec): Rec | null {
  let candidate = stripNulls(data);
  if (table === 'questCompletionEvents') candidate = { ...candidate, eventId: candidate.eventId ?? candidate.id };
  if (table === 'settings') {
    const here = local ?? (DEFAULT_SETTINGS as unknown as Rec);
    candidate = { ...candidate, id: 'settings' };
    for (const k of DEVICE_LOCAL_SETTINGS) {
      if (here[k] !== undefined) candidate[k] = here[k];
      else delete candidate[k];
    }
    const hereFocus = (here.focus ?? {}) as Rec;
    if (candidate.focus && typeof candidate.focus === 'object') {
      candidate.focus = { ...(candidate.focus as Rec), ...Object.fromEntries(DEVICE_LOCAL_FOCUS.filter((k) => hereFocus[k] !== undefined).map((k) => [k, hereFocus[k]])) };
    }
  }
  const parsed = SCHEMAS[table].safeParse(candidate);
  return parsed.success ? (parsed.data as Rec) : null;
}
