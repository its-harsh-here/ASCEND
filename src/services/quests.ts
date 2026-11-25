import { db } from '@/db/schema';
import type { AchievementDef } from '@/domain/achievements';
import { skillsForTags } from '@/domain/skills';
import { questSchema, type Campaign, type Quest, type QuestStatus, type Subtask } from '@/domain/types';
import { coinsForXp, levelFromXp, questSourceKey, questXp } from '@/domain/xp';
import { todayKey } from '@/lib/dates';
import { nowIso, uid } from '@/lib/utils';
import { getSettings, logActivity } from './core';
import { evaluateAchievements, totalXp } from './progression';

export type QuestInput = Partial<Omit<Quest, 'id' | 'createdAt' | 'updatedAt'>> & { title: string };

export async function createQuest(input: QuestInput): Promise<Quest> {
  const now = nowIso();
  let skillIds = input.skillIds ?? [];
  if (skillIds.length === 0 && input.tags?.length) skillIds = skillsForTags(input.tags);
  if (skillIds.length === 0 && input.questlineId) skillIds = (await db.questlines.get(input.questlineId))?.skillIds ?? [];
  const quest = questSchema.parse({
    ...input,
    title: input.title.trim(),
    skillIds,
    id: uid(),
    order: input.order ?? Date.now(),
    createdAt: now,
    updatedAt: now,
  });
  await db.transaction('rw', db.quests, db.activity, async () => {
    await db.quests.add(quest);
    await logActivity('quest.created', `Created quest “${quest.title}”`, quest.id);
  });
  return quest;
}

/** Patch a quest. Generated quests changed by the user are flagged so regeneration never silently overwrites them. */
export async function updateQuest(id: string, patch: Partial<Quest>): Promise<void> {
  await db.transaction('rw', db.quests, async () => {
    const q = await db.quests.get(id);
    if (!q) throw new Error('Quest not found');
    const next = questSchema.parse({
      ...q,
      ...patch,
      id,
      userEdited: q.origin === 'generated' ? true : q.userEdited,
      updatedAt: nowIso(),
    });
    await db.quests.put(next);
  });
}

export async function bulkUpdateQuests(ids: string[], patch: Partial<Quest>): Promise<void> {
  const { status, ...rest } = patch;
  await db.transaction('rw', db.quests, async () => {
    for (const id of ids) {
      const q = await db.quests.get(id);
      if (!q) continue;
      await db.quests.put(questSchema.parse({ ...q, ...rest, id, userEdited: q.origin === 'generated' ? true : q.userEdited, updatedAt: nowIso() }));
    }
  });
  if (status) for (const id of ids) await setQuestStatus(id, status);
}

/** Delete quests and their subtasks, and remove them from other quests' dependency lists. Earned XP is kept. */
export async function deleteQuests(ids: string[]): Promise<void> {
  const set = new Set(ids);
  await db.transaction('rw', db.quests, db.subtasks, db.activity, async () => {
    await db.subtasks.where('questId').anyOf(ids).delete();
    await db.quests.bulkDelete(ids);
    await db.quests
      .filter((q) => q.dependencies.some((d) => set.has(d)))
      .modify((q) => {
        q.dependencies = q.dependencies.filter((d) => !set.has(d));
      });
    await logActivity('quest.deleted', `Deleted ${ids.length} quest${ids.length > 1 ? 's' : ''}`);
  });
}

export interface CompletionResult {
  questId: string;
  xpGained: number;
  coinsGained: number;
  restored: boolean;
  alreadyDone: boolean;
  levelBefore: number;
  levelAfter: number;
  achievements: AchievementDef[];
  campaignCompleted?: Campaign;
}

/**
 * Complete a quest atomically. XP is granted at most once per quest (unique sourceKey):
 * re-completing a reopened quest re-activates the original XP event rather than creating a new one.
 */
export async function completeQuest(id: string): Promise<CompletionResult> {
  const settings = await getSettings();
  const before = levelFromXp(await totalXp()).level;
  const res = await db.transaction('rw', [db.quests, db.xpEvents, db.activity, db.questlines], async () => {
    const q = await db.quests.get(id);
    if (!q) throw new Error('Quest not found');
    if (q.status === 'done') return { xp: 0, coins: 0, restored: false, alreadyDone: true, quest: q };
    const now = nowIso();
    await db.quests.update(id, { status: 'done', completedAt: now, updatedAt: now });
    const key = questSourceKey(id);
    const existing = await db.xpEvents.where('sourceKey').equals(key).first();
    let xp: number;
    let coins: number;
    let restored = false;
    if (existing) {
      xp = existing.revoked ? existing.amount : 0;
      coins = existing.revoked ? existing.coins : 0;
      restored = existing.revoked;
      if (existing.revoked) await db.xpEvents.update(existing.id, { revoked: false });
    } else {
      xp = questXp(q, settings);
      coins = coinsForXp(xp);
      let skillIds = q.skillIds;
      if (skillIds.length === 0 && q.questlineId) skillIds = (await db.questlines.get(q.questlineId))?.skillIds ?? [];
      await db.xpEvents.add({
        id: uid(),
        sourceKey: key,
        kind: 'quest',
        questId: id,
        campaignId: q.campaignId,
        amount: xp,
        coins,
        skillIds,
        date: todayKey(),
        createdAt: now,
        revoked: false,
      });
    }
    await logActivity('quest.completed', `Completed “${q.title}” (+${xp} XP)`, id);
    return { xp, coins, restored, alreadyDone: false, quest: q };
  });

  let campaignCompleted: Campaign | undefined;
  if (!res.alreadyDone && res.quest.campaignId) campaignCompleted = await checkCampaignCompletion(res.quest.campaignId);
  const achievements = res.alreadyDone ? [] : await evaluateAchievements();
  const after = levelFromXp(await totalXp()).level;
  return {
    questId: id,
    xpGained: res.xp,
    coinsGained: res.coins,
    restored: res.restored,
    alreadyDone: res.alreadyDone,
    levelBefore: before,
    levelAfter: after,
    achievements,
    campaignCompleted,
  };
}

/** Reopen a completed quest. Its XP event is revoked (not deleted), so completing again cannot duplicate XP. */
export async function reopenQuest(id: string, status: QuestStatus = 'todo'): Promise<void> {
  await db.transaction('rw', db.quests, db.xpEvents, db.activity, async () => {
    const q = await db.quests.get(id);
    if (!q) return;
    await db.quests.update(id, { status, completedAt: undefined, updatedAt: nowIso() });
    const ev = await db.xpEvents.where('sourceKey').equals(questSourceKey(id)).first();
    if (ev && !ev.revoked) await db.xpEvents.update(ev.id, { revoked: true });
    if (q.status === 'done') await logActivity('quest.reopened', `Reopened “${q.title}”`, id);
  });
}

export async function setQuestStatus(id: string, status: QuestStatus): Promise<CompletionResult | null> {
  const q = await db.quests.get(id);
  if (!q || q.status === status) return null;
  if (status === 'done') return completeQuest(id);
  if (q.status === 'done') {
    await reopenQuest(id, status);
    return null;
  }
  await db.quests.update(id, { status, updatedAt: nowIso() });
  return null;
}

export async function archiveQuests(ids: string[]): Promise<void> {
  const now = nowIso();
  await db.quests.where('id').anyOf(ids).modify({ archivedAt: now, updatedAt: now });
}

export async function restoreQuests(ids: string[]): Promise<void> {
  await db.quests.where('id').anyOf(ids).modify((q) => {
    delete q.archivedAt;
    q.updatedAt = nowIso();
  });
}

/** When every required quest of a campaign is resolved, mark it complete and grant a one-time bonus. */
export async function checkCampaignCompletion(campaignId: string): Promise<Campaign | undefined> {
  return db.transaction('rw', db.campaigns, db.quests, db.xpEvents, db.activity, async () => {
    const c = await db.campaigns.get(campaignId);
    if (!c || c.status === 'completed') return undefined;
    const quests = await db.quests.where('campaignId').equals(campaignId).toArray();
    const required = quests.filter((q) => !q.optional && q.origin !== 'recurring' && !q.archivedAt);
    if (required.length === 0 || required.some((q) => q.status !== 'done' && q.status !== 'skipped')) return undefined;
    const now = nowIso();
    await db.campaigns.update(campaignId, { status: 'completed', completedAt: now, updatedAt: now });
    const sourceKey = `campaign:${campaignId}`;
    if (!(await db.xpEvents.where('sourceKey').equals(sourceKey).first())) {
      await db.xpEvents.add({
        id: uid(), sourceKey, kind: 'bonus', campaignId, amount: 300, coins: 60, skillIds: [], date: todayKey(), createdAt: now, revoked: false,
      });
    }
    await logActivity('campaign.completed', `Campaign “${c.name}” completed`, campaignId);
    return { ...c, status: 'completed' as const, completedAt: now };
  });
}

/* ───────────── Subtasks ───────────── */

export async function addSubtask(questId: string, title: string): Promise<Subtask> {
  const count = await db.subtasks.where('questId').equals(questId).count();
  const s: Subtask = { id: uid(), questId, title: title.trim(), done: false, order: count };
  await db.subtasks.add(s);
  return s;
}

export async function updateSubtask(id: string, patch: Partial<Subtask>): Promise<void> {
  await db.subtasks.update(id, patch);
}

export async function deleteSubtask(id: string): Promise<void> {
  await db.subtasks.delete(id);
}

export async function reorderQuests(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.quests, async () => {
    for (let i = 0; i < orderedIds.length; i++) await db.quests.update(orderedIds[i], { order: i });
  });
}
