import { db } from '@/db/schema';
import {
  campaignSchema,
  questSchema,
  type Campaign,
  type Milestone,
  type Quest,
  type Questline,
  type RecurrenceRule,
} from '@/domain/types';
import { addDaysKey, todayKey } from '@/lib/dates';
import { nowIso, uid } from '@/lib/utils';
import type { DraftPlan } from '@/planning/planner';
import type { ReschedulePreview } from '@/planning/rescheduler';
import { logActivity } from './core';

export interface CampaignMeta {
  name: string;
  objective: string;
  constraints: string;
  outcomes: string[];
  color: string;
}

/** Persist a reviewed draft plan atomically: campaign, questlines, milestones, quests and recurring quests. */
export async function activatePlan(plan: DraftPlan, meta: CampaignMeta): Promise<string> {
  const now = nowIso();
  const { input } = plan;
  const campaign: Campaign = campaignSchema.parse({
    id: uid(),
    name: meta.name.trim() || input.campaignName,
    objective: meta.objective,
    status: 'active',
    startDate: input.startDate,
    endDate: input.endDate,
    hoursPerDay: input.hoursPerDay,
    workdays: input.workdays,
    skillLevel: input.skillLevel,
    constraints: meta.constraints,
    outcomes: meta.outcomes,
    templateIds: plan.questlines.map((l) => l.templateId).filter(Boolean),
    color: meta.color,
    createdAt: now,
    updatedAt: now,
  });

  const lineId = new Map<string, string>();
  const questlines: Questline[] = plan.questlines.map((l, i) => {
    const id = uid();
    lineId.set(l.id, id);
    return { id, campaignId: campaign.id, title: l.title, description: l.description, order: i, templateId: l.templateId, skillIds: l.skillIds, createdAt: now };
  });
  const msId = new Map<string, string>();
  const milestones: Milestone[] = plan.milestones.map((m) => {
    const id = uid();
    msId.set(m.id, id);
    return { id, campaignId: campaign.id, questlineId: lineId.get(m.goalId)!, title: m.title, order: m.order, dueDate: m.dueDate, deadlineLocked: m.deadlineLocked };
  });
  const qId = new Map<string, string>();
  for (const q of plan.quests) qId.set(q.id, uid());
  const quests: Quest[] = plan.quests.map((q) =>
    questSchema.parse({
      id: qId.get(q.id),
      title: q.title,
      description: q.description,
      category: q.category,
      difficulty: q.difficulty,
      priority: q.priority,
      status: 'todo',
      estimatedMinutes: Math.round(q.hours * 60),
      actualMinutes: 0,
      dueDate: q.dueDate,
      scheduledDate: q.scheduledDate,
      deadlineLocked: q.deadlineLocked,
      dependencies: q.deps.map((d) => qId.get(d)).filter(Boolean),
      skillIds: q.skillIds,
      campaignId: campaign.id,
      questlineId: lineId.get(q.goalId),
      milestoneId: q.milestoneId ? msId.get(q.milestoneId) : undefined,
      deliverable: q.deliverable,
      optional: q.optional,
      origin: q.origin === 'revision' ? 'revision' : q.origin === 'manual' ? 'manual' : 'generated',
      templateKey: q.key,
      userEdited: q.userEdited,
      order: q.order,
      createdAt: now,
      updatedAt: now,
    }),
  );
  const recurrences: RecurrenceRule[] = plan.recurring
    .filter((r) => r.enabled)
    .map((r) => ({
      id: uid(),
      title: r.title,
      description: r.description,
      category: 'daily',
      difficulty: r.difficulty,
      priority: 'medium',
      estimatedMinutes: r.minutes,
      frequency: r.frequency,
      interval: 1,
      weekdays: r.frequency === 'daily' ? [] : r.weekdays,
      startDate: input.startDate,
      endDate: input.endDate,
      campaignId: campaign.id,
      tags: [],
      skillIds: r.skillIds,
      active: true,
      createdAt: now,
    }));

  await db.transaction('rw', [db.campaigns, db.questlines, db.milestones, db.quests, db.recurrences, db.activity], async () => {
    await db.campaigns.add(campaign);
    await db.questlines.bulkAdd(questlines);
    await db.milestones.bulkAdd(milestones);
    await db.quests.bulkAdd(quests);
    if (recurrences.length) await db.recurrences.bulkAdd(recurrences);
    await logActivity('campaign.created', `Campaign “${campaign.name}” activated with ${quests.length} quests`, campaign.id);
  });
  return campaign.id;
}

export async function updateCampaign(id: string, patch: Partial<Campaign>): Promise<void> {
  const c = await db.campaigns.get(id);
  if (!c) throw new Error('Campaign not found');
  await db.campaigns.put(campaignSchema.parse({ ...c, ...patch, id, updatedAt: nowIso() }));
}

export async function setCampaignStatus(id: string, status: Campaign['status']): Promise<void> {
  const now = nowIso();
  await db.campaigns.update(id, { status, updatedAt: now, completedAt: status === 'completed' ? now : undefined });
  if (status === 'archived' || status === 'paused') {
    await db.recurrences.where('campaignId').equals(id).modify({ active: false });
  } else if (status === 'active') {
    await db.recurrences.where('campaignId').equals(id).modify({ active: true });
  }
}

/**
 * Delete a campaign. With keepQuests, quests are detached (kept as standalone quests);
 * otherwise quests and subtasks are removed. XP already earned is never removed.
 */
export async function deleteCampaign(id: string, keepQuests: boolean): Promise<void> {
  await db.transaction('rw', [db.campaigns, db.questlines, db.milestones, db.quests, db.subtasks, db.recurrences, db.activity, db.settings], async () => {
    const c = await db.campaigns.get(id);
    const quests = await db.quests.where('campaignId').equals(id).toArray();
    if (keepQuests) {
      await db.quests.where('campaignId').equals(id).modify((q) => {
        delete q.campaignId;
        delete q.questlineId;
        delete q.milestoneId;
      });
    } else {
      const ids = quests.map((q) => q.id);
      await db.subtasks.where('questId').anyOf(ids).delete();
      await db.quests.bulkDelete(ids);
      const set = new Set(ids);
      await db.quests.filter((q) => q.dependencies.some((d) => set.has(d))).modify((q) => {
        q.dependencies = q.dependencies.filter((d) => !set.has(d));
      });
    }
    await db.questlines.where('campaignId').equals(id).delete();
    await db.milestones.where('campaignId').equals(id).delete();
    await db.recurrences.where('campaignId').equals(id).delete();
    await db.campaigns.delete(id);
    const s = await db.settings.get('settings');
    if (s?.defaultCampaignId === id) await db.settings.update('settings', { defaultCampaignId: undefined });
    await logActivity('campaign.deleted', `Campaign “${c?.name ?? id}” deleted`, id);
  });
}

/* ───────────── Questlines & milestones ───────────── */

export async function addQuestline(campaignId: string, title: string, skillIds: string[] = []): Promise<Questline> {
  const order = await db.questlines.where('campaignId').equals(campaignId).count();
  const line: Questline = { id: uid(), campaignId, title: title.trim(), description: '', order, skillIds, createdAt: nowIso() };
  await db.questlines.add(line);
  return line;
}

export async function updateQuestline(id: string, patch: Partial<Questline>): Promise<void> {
  await db.questlines.update(id, patch);
}

export async function deleteQuestline(id: string): Promise<void> {
  await db.transaction('rw', db.questlines, db.milestones, db.quests, db.subtasks, async () => {
    const ids = (await db.quests.where('questlineId').equals(id).toArray()).map((q) => q.id);
    await db.subtasks.where('questId').anyOf(ids).delete();
    await db.quests.bulkDelete(ids);
    const set = new Set(ids);
    await db.quests.filter((q) => q.dependencies.some((d) => set.has(d))).modify((q) => {
      q.dependencies = q.dependencies.filter((d) => !set.has(d));
    });
    await db.milestones.where('questlineId').equals(id).delete();
    await db.questlines.delete(id);
  });
}

export async function addMilestone(campaignId: string, questlineId: string, title: string, dueDate?: string): Promise<Milestone> {
  const order = await db.milestones.where('questlineId').equals(questlineId).count();
  const m: Milestone = { id: uid(), campaignId, questlineId, title: title.trim(), order, dueDate, deadlineLocked: false };
  await db.milestones.add(m);
  return m;
}

export async function updateMilestone(id: string, patch: Partial<Milestone>): Promise<void> {
  await db.milestones.update(id, patch);
}

export async function deleteMilestone(id: string): Promise<void> {
  await db.transaction('rw', db.milestones, db.quests, async () => {
    await db.quests.where('milestoneId').equals(id).modify((q) => {
      delete q.milestoneId;
    });
    await db.milestones.delete(id);
  });
}

/* ───────────── Rescheduling ───────────── */

/** Apply a previously previewed reschedule. Locked deadlines are untouched by construction. */
export async function applyReschedule(campaign: Campaign, preview: ReschedulePreview): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', [db.campaigns, db.quests, db.milestones, db.activity], async () => {
    for (const mv of preview.moves) {
      const q = await db.quests.get(mv.questId);
      if (!q) continue;
      await db.quests.update(mv.questId, { scheduledDate: mv.to, updatedAt: now });
    }
    for (const q of preview.dropped) await db.quests.update(q.id, { status: 'skipped', updatedAt: now });
    for (const mm of preview.milestoneMoves) {
      if (mm.milestone.deadlineLocked) continue;
      await db.milestones.update(mm.milestone.id, { dueDate: mm.to });
      await db.quests
        .where('milestoneId')
        .equals(mm.milestone.id)
        .filter((q) => !q.deadlineLocked && !q.optional && q.status !== 'done')
        .modify({ dueDate: mm.to, updatedAt: now });
    }
    const patch: Partial<Campaign> = { updatedAt: now };
    if (preview.endDate !== campaign.endDate) patch.endDate = preview.endDate;
    if (preview.hoursPerDay !== campaign.hoursPerDay) patch.hoursPerDay = preview.hoursPerDay;
    await db.campaigns.update(campaign.id, patch);
    await logActivity('campaign.rescheduled', `Rebalanced “${campaign.name}”: ${preview.moves.length} quests moved`, campaign.id);
  });
}

/** Hours already planned per date by everything except the given campaign (quests + time blocks). */
export async function commitmentsExcluding(campaignId: string | null, from = todayKey(), days = 400): Promise<Record<string, number>> {
  const to = addDaysKey(from, days);
  const out: Record<string, number> = {};
  const quests = await db.quests.where('scheduledDate').between(from, to, true, true).toArray();
  for (const q of quests) {
    if (campaignId && q.campaignId === campaignId && q.origin !== 'recurring') continue;
    if (q.status === 'done' || q.status === 'skipped' || q.archivedAt) continue;
    out[q.scheduledDate!] = (out[q.scheduledDate!] ?? 0) + q.estimatedMinutes / 60;
  }
  const blocks = await db.timeBlocks.where('date').between(from, to, true, true).toArray();
  for (const b of blocks) {
    if (b.kind !== 'commitment') continue;
    const [sh, sm] = b.start.split(':').map(Number);
    const [eh, em] = b.end.split(':').map(Number);
    out[b.date] = (out[b.date] ?? 0) + Math.max(0, eh * 60 + em - (sh * 60 + sm)) / 60;
  }
  return out;
}
