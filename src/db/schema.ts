import { resolveDbName } from './accounts';
import { createSyncCapture } from '@/sync/middleware';
import Dexie, { type Table } from 'dexie';
import type { CloudCacheRow, OutboxEntry, QuestCompletionEvent, SyncConflict, SyncStateRow } from '@/sync/types';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type AchievementUnlock,
  type ActivityEntry,
  type Campaign,
  type FocusSession,
  type Milestone,
  type Quest,
  type Questline,
  type RecurrenceRule,
  type Redemption,
  type Review,
  type Reward,
  type Settings,
  type Subtask,
  type TimeBlock,
  type XpEvent,
} from '@/domain/types';

/**
 * Versioned IndexedDB schema.
 *
 * Never edit a released version's store definition — add a new version with an upgrade function.
 * v1 — initial release: core quest/campaign/progression tables.
 * v2 — recurrence, time blocks, reviews and activity log; quest recurrence index; backfills new quest fields.
 * v3 — cloud sync bookkeeping (outbox, sync state, conflicts, cloud cache) and append-only quest
 *      completion events. Purely additive: no existing row is touched.
 */
export const SCHEMA_V1 = {
  campaigns: 'id, status, createdAt',
  questlines: 'id, campaignId, order',
  milestones: 'id, campaignId, questlineId',
  quests: 'id, campaignId, questlineId, milestoneId, status, scheduledDate, dueDate, category, completedAt, archivedAt, *tags',
  subtasks: 'id, questId',
  xpEvents: 'id, &sourceKey, date, kind, questId',
  focusSessions: 'id, date, questId, startedAt',
  achievements: 'id, unlockedAt',
  rewards: 'id',
  redemptions: 'id, rewardId, redeemedAt',
  settings: 'id',
};

export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  quests:
    'id, campaignId, questlineId, milestoneId, status, scheduledDate, dueDate, category, completedAt, archivedAt, recurrenceId, [recurrenceId+recurrenceDate], *tags',
  recurrences: 'id, active, campaignId',
  timeBlocks: 'id, date',
  reviews: 'id, kind, periodKey',
  activity: 'id, date, createdAt',
};

export const SCHEMA_V3 = {
  ...SCHEMA_V2,
  outbox: '++seq, &mutationId, table, key',
  syncState: 'key',
  syncConflicts: 'id, table, recordId, createdAt',
  questCompletionEvents: 'eventId, questId, occurredAt',
  cloudCache: 'key',
  /** Never holds rows: a transaction that includes it is applying a pull, so the sync middleware skips capture. */
  syncApplyMarker: 'id',
};

export const CURRENT_SCHEMA_VERSION = 3;

export class AscendDB extends Dexie {
  campaigns!: Table<Campaign, string>;
  questlines!: Table<Questline, string>;
  milestones!: Table<Milestone, string>;
  quests!: Table<Quest, string>;
  subtasks!: Table<Subtask, string>;
  recurrences!: Table<RecurrenceRule, string>;
  xpEvents!: Table<XpEvent, string>;
  focusSessions!: Table<FocusSession, string>;
  achievements!: Table<AchievementUnlock, string>;
  rewards!: Table<Reward, string>;
  redemptions!: Table<Redemption, string>;
  timeBlocks!: Table<TimeBlock, string>;
  reviews!: Table<Review, string>;
  activity!: Table<ActivityEntry, string>;
  settings!: Table<Settings, string>;
  outbox!: Table<OutboxEntry, number>;
  syncState!: Table<SyncStateRow, string>;
  syncConflicts!: Table<SyncConflict, string>;
  questCompletionEvents!: Table<QuestCompletionEvent, string>;
  cloudCache!: Table<CloudCacheRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    this.version(2)
      .stores(SCHEMA_V2)
      .upgrade(async (tx) => {
        await tx
          .table('quests')
          .toCollection()
          .modify((q: Partial<Quest>) => {
            q.deadlineLocked ??= false;
            q.dependencies ??= [];
            q.skillIds ??= [];
            q.links ??= [];
            q.tags ??= [];
            q.notes ??= '';
            q.optional ??= false;
            q.userEdited ??= false;
            q.origin ??= 'manual';
            q.order ??= 0;
            q.actualMinutes ??= 0;
          });
        await tx
          .table('xpEvents')
          .toCollection()
          .modify((e: Partial<XpEvent>) => {
            e.revoked ??= false;
            e.skillIds ??= [];
            e.coins ??= 0;
          });
        await tx
          .table('settings')
          .toCollection()
          .modify((s: Record<string, unknown>) => {
            const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...s, id: 'settings' });
            if (parsed.success) Object.assign(s, parsed.data);
          });
      });
    this.version(3).stores(SCHEMA_V3);
  }
}

export const TABLE_NAMES = [
  'campaigns',
  'questlines',
  'milestones',
  'quests',
  'subtasks',
  'recurrences',
  'xpEvents',
  'focusSessions',
  'achievements',
  'rewards',
  'redemptions',
  'timeBlocks',
  'reviews',
  'activity',
  'settings',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export { isDemoMode, setDemoMode } from './accounts';

/** Demo, guest and each account get separate databases, so sample data and accounts never mix (accounts.ts). */
export const db = new AscendDB(resolveDbName());

/** Only an account's database syncs: guest and demo journals never capture an outbox. */
export const isSyncedDb = (name: string = db.name): boolean => name.startsWith('ascend-u-');
if (isSyncedDb()) db.use(createSyncCapture());
