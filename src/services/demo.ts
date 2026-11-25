import { db, isDemoMode } from '@/db/schema';
import { DEFAULT_SETTINGS } from '@/domain/types';
import { coinsForXp, questSourceKey, questXp } from '@/domain/xp';
import { addDaysKey, todayKey } from '@/lib/dates';
import { nowIso, uid } from '@/lib/utils';
import { generatePlan } from '@/planning/planner';
import { activatePlan } from './campaigns';
import { evaluateAchievements } from './progression';
import { saveReward } from './misc';

/**
 * Populate the *separate* demo database with a realistic, clearly-labelled sample journey.
 * Refuses to run against the real database.
 */
export async function seedDemoData(): Promise<void> {
  if (!isDemoMode()) throw new Error('Demo data can only be created in demo mode.');
  if ((await db.campaigns.count()) > 0) return;
  const today = todayKey();
  const start = addDaysKey(today, -9);
  await db.settings.put({
    ...DEFAULT_SETTINGS,
    onboarded: true,
    playerName: 'Demo Adventurer',
    avatarId: 'sigil-compass',
    dailyHours: 5,
    workdays: [0, 1, 2, 3, 4, 5, 6],
    createdAt: nowIso(),
  });
  const plan = generatePlan({
    campaignName: 'Winter Break Upskilling (Demo)',
    objective: 'Learn Docker, Kubernetes and AWS, sharpen DSA and contribute to open source.',
    startDate: start,
    endDate: addDaysKey(start, 34),
    hoursPerDay: 5,
    workdays: [0, 1, 2, 3, 4, 5, 6],
    skillLevel: 'intermediate',
    goals: ['docker', 'kubernetes', 'aws', 'dsa', 'open-source'].map((templateId, i) => ({
      id: `g${i}`, templateId, title: templateId, includeOptional: i < 2, rank: i + 1,
    })),
  });
  const campaignId = await activatePlan(plan, {
    name: 'Winter Break Upskilling (Demo)',
    objective: plan.input.objective,
    constraints: '',
    outcomes: ['Deploy a containerized app to Kubernetes', 'Solve 60 DSA problems'],
    color: 'violet',
  });
  // Complete quests scheduled in the past (skipping a few to demonstrate rescheduling).
  const quests = await db.quests.where('campaignId').equals(campaignId).sortBy('scheduledDate');
  let skipped = 0;
  for (const q of quests) {
    if (!q.scheduledDate || q.scheduledDate >= today) continue;
    if (q.scheduledDate >= addDaysKey(today, -2) && skipped < 3) {
      skipped++;
      continue;
    }
    const xp = questXp(q, DEFAULT_SETTINGS);
    const completedAt = new Date(`${q.scheduledDate}T18:30:00`).toISOString();
    await db.quests.update(q.id, { status: 'done', completedAt, actualMinutes: Math.round(q.estimatedMinutes * (0.8 + Math.random() * 0.5)) });
    await db.xpEvents.add({
      id: uid(), sourceKey: questSourceKey(q.id), kind: 'quest', questId: q.id, campaignId, amount: xp, coins: coinsForXp(xp),
      skillIds: q.skillIds, date: q.scheduledDate, createdAt: completedAt, revoked: false,
    });
    if (Math.random() > 0.4) {
      const startedAt = new Date(`${q.scheduledDate}T10:00:00`).toISOString();
      await db.focusSessions.add({
        id: uid(), mode: 'focus', questId: q.id, campaignId, plannedMinutes: 25, actualMinutes: 25, startedAt,
        endedAt: new Date(Date.parse(startedAt) + 25 * 60000).toISOString(), completed: true, date: q.scheduledDate,
      });
    }
  }
  await saveReward({ title: 'Movie night', description: 'Watch a film guilt-free.', cost: 150, icon: 'film' });
  await saveReward({ title: 'Favourite takeaway', description: 'Order your favourite food.', cost: 300, icon: 'pizza' });
  await saveReward({ title: 'A full day off', description: 'No quests, no guilt.', cost: 800, icon: 'bed' });
  await evaluateAchievements();
}
