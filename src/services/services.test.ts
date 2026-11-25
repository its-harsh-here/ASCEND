import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { AscendDB, SCHEMA_V1, db } from '@/db/schema';
import { addDaysKey, todayKey } from '@/lib/dates';
import { generatePlan } from '@/planning/planner';
import { previewReschedule } from '@/planning/rescheduler';
import { exportBackup, questsToCsv, restoreBackup, validateBackup } from './backup';
import { activatePlan, applyReschedule } from './campaigns';
import { getSettings, updateSettings } from './core';
import { recordFocusSession } from './focus';
import { coinBalance, redeemReward, saveReward, InsufficientCoinsError } from './misc';
import { computeStats } from './progression';
import { completeQuest, createQuest, deleteQuests, reopenQuest, updateQuest, addSubtask } from './quests';
import { createRecurrence, ensureRecurringInstances, recurringInstanceId } from './recurring';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('quest lifecycle', () => {
  it('creates a quest with validated defaults and skills derived from tags', async () => {
    const q = await createQuest({ title: '  Docker networking  ', tags: ['docker'], estimatedMinutes: 120 });
    expect(q.title).toBe('Docker networking');
    expect(q.status).toBe('todo');
    expect(q.skillIds).toEqual(['docker']);
    expect(await db.quests.count()).toBe(1);
  });

  it('rejects invalid quests', async () => {
    await expect(createQuest({ title: '' })).rejects.toThrow();
  });

  it('edits a quest', async () => {
    const q = await createQuest({ title: 'A' });
    await updateQuest(q.id, { title: 'B', priority: 'critical', dueDate: '2026-12-01' });
    const fresh = await db.quests.get(q.id);
    expect(fresh).toMatchObject({ title: 'B', priority: 'critical', dueDate: '2026-12-01' });
  });

  it('awards XP exactly once even when reopened and recompleted', async () => {
    const q = await createQuest({ title: 'Boss', difficulty: 'boss' });
    const r1 = await completeQuest(q.id);
    expect(r1.xpGained).toBe(250);
    expect(r1.coinsGained).toBe(50);
    const again = await completeQuest(q.id);
    expect(again.alreadyDone).toBe(true);
    await reopenQuest(q.id);
    expect((await computeStats()).questsCompleted).toBe(0);
    const r2 = await completeQuest(q.id);
    expect(r2.restored).toBe(true);
    const questEvents = await db.xpEvents.where('kind').equals('quest').toArray();
    expect(questEvents).toHaveLength(1);
    expect(questEvents[0].revoked).toBe(false);
    const stats = await computeStats();
    expect(stats.bossesDefeated).toBe(1);
  });

  it('levels up and unlocks achievements on completion', async () => {
    const q = await createQuest({ title: 'Legend', difficulty: 'legendary' });
    const r = await completeQuest(q.id);
    expect(r.levelAfter).toBeGreaterThan(r.levelBefore);
    const ids = r.achievements.map((a) => a.id);
    expect(ids).toContain('first-quest');
    expect(ids).toContain('legendary-1');
    expect(await db.achievements.get('first-quest')).toBeDefined();
    // Achievement bonus XP is idempotent.
    const q2 = await createQuest({ title: 'Another' });
    const r2 = await completeQuest(q2.id);
    expect(r2.achievements.map((a) => a.id)).not.toContain('first-quest');
  });

  it('respects configured XP rewards', async () => {
    await updateSettings({ xpMultiplier: 2 });
    const q = await createQuest({ title: 'Medium', difficulty: 'medium' });
    expect((await completeQuest(q.id)).xpGained).toBe(100);
  });

  it('deletes quests safely, cleaning subtasks and dependency references', async () => {
    const a = await createQuest({ title: 'A' });
    const b = await createQuest({ title: 'B', dependencies: [a.id] });
    await addSubtask(a.id, 'step');
    await deleteQuests([a.id]);
    expect(await db.subtasks.count()).toBe(0);
    expect((await db.quests.get(b.id))!.dependencies).toEqual([]);
  });
});

describe('focus, rewards and coins', () => {
  it('records focus sessions, adds actual time and focus XP', async () => {
    const q = await createQuest({ title: 'Read' });
    const start = new Date(Date.now() - 25 * 60000).toISOString();
    const r = await recordFocusSession({ mode: 'focus', questId: q.id, plannedMinutes: 25, actualMinutes: 25, startedAt: start, endedAt: new Date().toISOString(), completed: true });
    expect(r.xp).toBe(13);
    expect((await db.quests.get(q.id))!.actualMinutes).toBe(25);
    expect((await db.quests.get(q.id))!.status).toBe('in_progress');
  });

  it('redeems rewards only with sufficient coins', async () => {
    const reward = await saveReward({ title: 'Movie', cost: 40 });
    await expect(redeemReward(reward.id)).rejects.toBeInstanceOf(InsufficientCoinsError);
    const q = await createQuest({ title: 'Hard', difficulty: 'boss' });
    await completeQuest(q.id);
    const before = await coinBalance();
    await redeemReward(reward.id);
    expect(await coinBalance()).toBe(before - 40);
  });
});

describe('recurring quests', () => {
  it('materializes instances idempotently and expires missed ones', async () => {
    const today = todayKey();
    const rule = await createRecurrence({ title: 'Stretch', frequency: 'daily', startDate: addDaysKey(today, -3), category: 'daily' });
    const first = await db.quests.where('recurrenceId').equals(rule.id).count();
    expect(first).toBe(7); // today + 6 lookahead, no back-fill
    await ensureRecurringInstances(today);
    expect(await db.quests.where('recurrenceId').equals(rule.id).count()).toBe(7);
    // Next day: yesterday's unfinished instance expires.
    const r = await ensureRecurringInstances(addDaysKey(today, 1));
    expect(r.expired).toBe(1);
    expect((await db.quests.get(recurringInstanceId(rule.id, today)))!.status).toBe('skipped');
    // Completing an instance grants XP once.
    const inst = recurringInstanceId(rule.id, addDaysKey(today, 1));
    expect((await completeQuest(inst)).xpGained).toBe(25);
  });
});

describe('campaign activation and smart rescheduling', () => {
  it('activates a plan and rebalances missed quests without moving locked deadlines', async () => {
    const today = todayKey();
    const start = addDaysKey(today, -4);
    const plan = generatePlan({
      campaignName: 'Test', objective: '', startDate: start, endDate: addDaysKey(start, 40), hoursPerDay: 4,
      workdays: [0, 1, 2, 3, 4, 5, 6], skillLevel: 'beginner',
      goals: [{ id: 'd', templateId: 'docker', title: 'Docker', includeOptional: true, rank: 1 }, { id: 'k', templateId: 'kubernetes', title: 'K8s', includeOptional: false, rank: 2 }],
    });
    const id = await activatePlan(plan, { name: 'Test', objective: '', constraints: '', outcomes: [], color: 'violet' });
    const campaign = (await db.campaigns.get(id))!;
    const quests = await db.quests.where('campaignId').equals(id).toArray();
    expect(quests.length).toBe(plan.quests.length);
    // Dependencies were remapped to persisted ids.
    const ids = new Set(quests.map((q) => q.id));
    for (const q of quests) for (const d of q.dependencies) expect(ids.has(d)).toBe(true);

    // Lock one future milestone deadline.
    const milestones = await db.milestones.where('campaignId').equals(id).toArray();
    const locked = milestones.find((m) => m.dueDate && m.dueDate > addDaysKey(today, 5))!;
    await db.milestones.update(locked.id, { deadlineLocked: true });

    const missed = quests.filter((q) => q.scheduledDate && q.scheduledDate < today);
    expect(missed.length).toBeGreaterThan(0);
    const preview = previewReschedule(campaign, quests, await db.milestones.where('campaignId').equals(id).toArray(), { today, dropOptional: true });
    expect(preview.missed.length).toBe(missed.filter((q) => q.origin !== 'recurring').length);
    for (const mv of preview.moves) if (mv.to) expect(mv.to >= today).toBe(true);
    expect(preview.milestoneMoves.some((m) => m.milestone.id === locked.id)).toBe(false);
    await applyReschedule(campaign, preview);
    const after = await db.quests.where('campaignId').equals(id).toArray();
    for (const q of after) {
      if (q.status === 'todo' && q.origin === 'generated' && q.scheduledDate) expect(q.scheduledDate >= today).toBe(true);
      if (q.optional && q.origin === 'generated') expect(q.status).toBe('skipped');
    }
    expect((await db.milestones.get(locked.id))!.dueDate).toBe(locked.dueDate);
    // Dependency order still holds after rescheduling.
    const byId = new Map(after.map((q) => [q.id, q]));
    for (const q of after) {
      if (q.status !== 'todo' || !q.scheduledDate) continue;
      for (const d of q.dependencies) {
        const dep = byId.get(d)!;
        if (dep.status === 'todo' && dep.scheduledDate) expect(dep.scheduledDate <= q.scheduledDate).toBe(true);
      }
    }
  });
});

describe('backup, restore and CSV', () => {
  it('round-trips all data through a versioned JSON backup', async () => {
    const q = await createQuest({ title: 'Persist me', tags: ['cloud'] });
    await completeQuest(q.id);
    await updateSettings({ playerName: 'Ada' });
    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    expect(backup.format).toBe('ascend-backup');
    expect(backup.schemaVersion).toBe(2);
    await db.delete();
    await db.open();
    expect(await db.quests.count()).toBe(0);
    const v = validateBackup(backup);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    await restoreBackup(v.backup);
    expect((await db.quests.get(q.id))!.status).toBe('done');
    expect((await getSettings()).playerName).toBe('Ada');
    expect((await computeStats()).questsCompleted).toBe(1);
  });

  it('rejects malformed and future backups', () => {
    expect(validateBackup({ hello: 1 }).ok).toBe(false);
    expect(validateBackup({ format: 'ascend-backup', version: 99, schemaVersion: 2, exportedAt: 'x', data: {} }).ok).toBe(false);
    const bad = validateBackup({ format: 'ascend-backup', version: 1, schemaVersion: 2, exportedAt: 'x', data: { quests: [{ id: 1 }] } });
    expect(bad.ok).toBe(false);
  });

  it('repairs dangling references on import', () => {
    const now = new Date().toISOString();
    const v = validateBackup({
      format: 'ascend-backup', version: 1, schemaVersion: 2, exportedAt: now,
      data: { quests: [{ id: 'q', title: 'Q', campaignId: 'missing', dependencies: ['nope'], createdAt: now, updatedAt: now }], subtasks: [{ id: 's', questId: 'gone', title: 't' }] },
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.warnings.join()).toMatch(/repaired/);
    const q = (v.backup.data.quests as { campaignId?: string; dependencies: string[] }[])[0];
    expect(q.campaignId).toBeUndefined();
    expect(q.dependencies).toEqual([]);
    expect(v.backup.data.subtasks).toHaveLength(0);
  });

  it('exports CSV with escaping and formula-injection protection', async () => {
    const q = await createQuest({ title: '=HYPERLINK("x")', description: 'line1\nline "2"' });
    const csv = questsToCsv([q], []);
    expect(csv.split('\r\n')[0]).toMatch(/^id,title,status/);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"line1\nline ""2"""');
  });
});

describe('database migrations and persistence', () => {
  it('upgrades a v1 database to v2, backfilling new fields', async () => {
    db.close();
    const name = 'ascend-migration-test';
    await Dexie.delete(name);
    const v1 = new Dexie(name);
    v1.version(1).stores(SCHEMA_V1);
    await v1.open();
    await v1.table('quests').add({ id: 'old', title: 'Legacy quest', status: 'todo', category: 'main', difficulty: 'easy', priority: 'low', estimatedMinutes: 30, createdAt: 'x', updatedAt: 'x' });
    await v1.table('xpEvents').add({ id: 'e', sourceKey: 'quest:old', kind: 'quest', amount: 10, date: '2026-01-01', createdAt: 'x' });
    await v1.table('settings').add({ id: 'settings', playerName: 'Legacy' });
    v1.close();

    const upgraded = new AscendDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(2);
    const q = (await upgraded.quests.get('old'))!;
    expect(q.deadlineLocked).toBe(false);
    expect(q.dependencies).toEqual([]);
    expect(q.origin).toBe('manual');
    expect((await upgraded.xpEvents.get('e'))!.revoked).toBe(false);
    const s = (await upgraded.settings.get('settings'))!;
    expect(s.playerName).toBe('Legacy');
    expect(s.difficultyXp.medium).toBe(50);
    expect(upgraded.tables.map((t) => t.name)).toEqual(expect.arrayContaining(['recurrences', 'timeBlocks', 'reviews', 'activity']));
    upgraded.close();
    await db.open();
  });

  it('persists data across connection close and reopen (offline persistence)', async () => {
    const q = await createQuest({ title: 'Survives reload' });
    db.close();
    const reopened = new AscendDB('ascend');
    await reopened.open();
    expect((await reopened.quests.get(q.id))!.title).toBe('Survives reload');
    reopened.close();
    await db.open();
  });
});
