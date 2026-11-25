import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, TABLE_NAMES, db, type TableName } from '@/db/schema';
import {
  achievementUnlockSchema,
  activitySchema,
  campaignSchema,
  focusSessionSchema,
  milestoneSchema,
  questSchema,
  questlineSchema,
  recurrenceSchema,
  redemptionSchema,
  reviewSchema,
  rewardSchema,
  settingsSchema,
  subtaskSchema,
  timeBlockSchema,
  xpEventSchema,
  type Campaign,
  type Quest,
} from '@/domain/types';
import { nowIso } from '@/lib/utils';
import { updateSettings } from './core';

export const BACKUP_FORMAT = 'ascend-backup';
/** Version of the backup envelope. Bump when the envelope (not table contents) changes. */
export const BACKUP_VERSION = 1;

const TABLE_SCHEMAS: Record<TableName, z.ZodTypeAny> = {
  campaigns: campaignSchema,
  questlines: questlineSchema,
  milestones: milestoneSchema,
  quests: questSchema,
  subtasks: subtaskSchema,
  recurrences: recurrenceSchema,
  xpEvents: xpEventSchema,
  focusSessions: focusSessionSchema,
  achievements: achievementUnlockSchema,
  rewards: rewardSchema,
  redemptions: redemptionSchema,
  timeBlocks: timeBlockSchema,
  reviews: reviewSchema,
  activity: activitySchema,
  settings: settingsSchema,
};

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  schemaVersion: number;
  exportedAt: string;
  data: Partial<Record<TableName, unknown[]>>;
}

const envelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  data: z.record(z.string(), z.array(z.unknown())),
});

export async function exportBackup(): Promise<BackupFile> {
  const data: Partial<Record<TableName, unknown[]>> = {};
  await db.transaction('r', TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const t of TABLE_NAMES) data[t] = await db.table(t).toArray();
  });
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: nowIso(), data };
}

export type ValidationResult =
  | { ok: true; backup: BackupFile; counts: Partial<Record<TableName, number>>; warnings: string[] }
  | { ok: false; errors: string[] };

/** Validate an untrusted backup: envelope, version compatibility, every row's schema and referential integrity. */
export function validateBackup(raw: unknown): ValidationResult {
  const env = envelopeSchema.safeParse(raw);
  if (!env.success) return { ok: false, errors: ['This file is not an Ascend backup (missing or invalid header).'] };
  if (env.data.version > BACKUP_VERSION) return { ok: false, errors: [`Backup version ${env.data.version} is newer than this app supports (${BACKUP_VERSION}). Update the app first.`] };
  if (env.data.schemaVersion > CURRENT_SCHEMA_VERSION) return { ok: false, errors: [`Backup schema ${env.data.schemaVersion} is newer than this app (${CURRENT_SCHEMA_VERSION}).`] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const data: Partial<Record<TableName, unknown[]>> = {};
  const counts: Partial<Record<TableName, number>> = {};
  for (const key of Object.keys(env.data.data)) {
    if (!(TABLE_NAMES as readonly string[]).includes(key)) warnings.push(`Unknown table “${key}” ignored.`);
  }
  for (const t of TABLE_NAMES) {
    const rows = env.data.data[t] ?? [];
    const parsed: unknown[] = [];
    rows.forEach((row, i) => {
      const r = TABLE_SCHEMAS[t].safeParse(row);
      if (r.success) parsed.push(r.data);
      else if (errors.length < 20) errors.push(`${t}[${i}]: ${r.error.issues.map((iss) => `${iss.path.join('.')} ${iss.message}`).join('; ')}`);
    });
    data[t] = parsed;
    counts[t] = parsed.length;
  }
  if (errors.length) return { ok: false, errors };

  // Referential integrity: dangling references are reported and cleaned rather than imported as-is.
  const ids = (t: TableName) => new Set((data[t] as { id: string }[]).map((r) => r.id));
  const campaignIds = ids('campaigns');
  const questIds = ids('quests');
  const quests = data.quests as Quest[];
  let dangling = 0;
  for (const q of quests) {
    if (q.campaignId && !campaignIds.has(q.campaignId)) {
      delete q.campaignId;
      delete q.questlineId;
      delete q.milestoneId;
      dangling++;
    }
    const deps = q.dependencies.filter((d) => questIds.has(d));
    if (deps.length !== q.dependencies.length) {
      dangling++;
      q.dependencies = deps;
    }
  }
  const subtasks = (data.subtasks as { questId: string }[]).filter((s) => questIds.has(s.questId));
  if (subtasks.length !== data.subtasks!.length) dangling += data.subtasks!.length - subtasks.length;
  data.subtasks = subtasks;
  if (dangling) warnings.push(`${dangling} dangling reference${dangling > 1 ? 's were' : ' was'} repaired.`);

  return {
    ok: true,
    backup: { format: BACKUP_FORMAT, version: env.data.version, schemaVersion: env.data.schemaVersion, exportedAt: env.data.exportedAt, data },
    counts,
    warnings,
  };
}

/** Replace all local data with a validated backup in a single transaction (all-or-nothing). */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await db.transaction('rw', TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const t of TABLE_NAMES) {
      await db.table(t).clear();
      const rows = backup.data[t] ?? [];
      if (rows.length) await db.table(t).bulkAdd(rows);
    }
  });
}

export async function markBackupDone(): Promise<void> {
  await updateSettings({ lastBackupAt: nowIso() });
}

/* ───────────── CSV ───────────── */

function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? '' : Array.isArray(v) ? v.join(' ') : String(v);
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function questsToCsv(quests: Quest[], campaigns: Campaign[]): string {
  const names = new Map(campaigns.map((c) => [c.id, c.name]));
  const header = ['id', 'title', 'status', 'category', 'difficulty', 'priority', 'estimated_minutes', 'actual_minutes', 'scheduled_date', 'due_date', 'completed_at', 'campaign', 'tags', 'description'];
  const rows = quests.map((q) =>
    [q.id, q.title, q.status, q.category, q.difficulty, q.priority, q.estimatedMinutes, q.actualMinutes, q.scheduledDate, q.dueDate, q.completedAt, q.campaignId ? names.get(q.campaignId) : '', q.tags, q.description]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...rows].join('\r\n');
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadBackup(): Promise<string> {
  const backup = await exportBackup();
  const name = `ascend-backup-${backup.exportedAt.slice(0, 10)}.json`;
  downloadText(name, JSON.stringify(backup, null, 2), 'application/json');
  await markBackupDone();
  return name;
}

export async function downloadQuestCsv(): Promise<string> {
  const [quests, campaigns] = await Promise.all([db.quests.toArray(), db.campaigns.toArray()]);
  const name = `ascend-quests-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadText(name, '﻿' + questsToCsv(quests, campaigns), 'text/csv;charset=utf-8');
  return name;
}

/* ───────────── Integrity ───────────── */

export interface IntegrityReport {
  orphanQuests: number;
  danglingDependencies: number;
  orphanSubtasks: number;
  orphanMilestones: number;
}

export async function checkIntegrity(repair = false): Promise<IntegrityReport> {
  return db.transaction('rw', [db.campaigns, db.questlines, db.milestones, db.quests, db.subtasks], async () => {
    const campaignIds = new Set(await db.campaigns.toCollection().primaryKeys());
    const lineIds = new Set(await db.questlines.toCollection().primaryKeys());
    const quests = await db.quests.toArray();
    const questIds = new Set(quests.map((q) => q.id));
    const report: IntegrityReport = { orphanQuests: 0, danglingDependencies: 0, orphanSubtasks: 0, orphanMilestones: 0 };
    for (const q of quests) {
      const orphan = !!q.campaignId && !campaignIds.has(q.campaignId);
      const badDeps = q.dependencies.filter((d) => !questIds.has(d));
      if (orphan) report.orphanQuests++;
      if (badDeps.length) report.danglingDependencies += badDeps.length;
      if (repair && (orphan || badDeps.length)) {
        const next = { ...q, dependencies: q.dependencies.filter((d) => questIds.has(d)) };
        if (orphan) {
          delete next.campaignId;
          delete next.questlineId;
          delete next.milestoneId;
        }
        await db.quests.put(next);
      }
    }
    const subs = await db.subtasks.toArray();
    const orphanSubs = subs.filter((s) => !questIds.has(s.questId));
    report.orphanSubtasks = orphanSubs.length;
    if (repair && orphanSubs.length) await db.subtasks.bulkDelete(orphanSubs.map((s) => s.id));
    const ms = await db.milestones.toArray();
    const orphanMs = ms.filter((m) => !lineIds.has(m.questlineId));
    report.orphanMilestones = orphanMs.length;
    if (repair && orphanMs.length) await db.milestones.bulkDelete(orphanMs.map((m) => m.id));
    return report;
  });
}
