import { db } from '@/db/schema';
import { ACHIEVEMENTS, EMPTY_STATS, RARITY_XP, newlyUnlocked, type AchievementDef, type PlayerStats } from '@/domain/achievements';
import { computeSkillProgress } from '@/domain/skills';
import { computeStreak } from '@/domain/streaks';
import type { FocusSession, Quest, Settings, XpEvent } from '@/domain/types';
import { activeXp, levelFromXp } from '@/domain/xp';
import { diffDays, todayKey } from '@/lib/dates';
import { nowIso, uid } from '@/lib/utils';
import { getSettings } from './core';

/** Dates with at least one completed quest or completed focus session. */
export function activeDatesFrom(events: XpEvent[], sessions: FocusSession[]): Set<string> {
  const s = new Set<string>();
  for (const e of events) if (!e.revoked && e.kind === 'quest') s.add(e.date);
  for (const f of sessions) if (f.mode === 'focus' && f.actualMinutes >= 5) s.add(f.date);
  return s;
}

export function statsFrom(args: {
  quests: Quest[];
  events: XpEvent[];
  sessions: FocusSession[];
  settings: Settings;
  completedCampaigns: { startDate: string; endDate: string }[];
  redemptions: number;
  reviews: number;
  today?: string;
}): PlayerStats {
  const { quests, events, sessions, settings } = args;
  const done = quests.filter((q) => q.status === 'done');
  const totalXp = activeXp(events);
  const streak = computeStreak({
    activeDates: activeDatesFrom(events, sessions),
    workdays: settings.workdays,
    today: args.today ?? todayKey(),
    freezesEnabled: settings.streakFreezesEnabled,
  });
  const skills = computeSkillProgress(events);
  return {
    ...EMPTY_STATS,
    questsCompleted: done.length,
    bossesDefeated: done.filter((q) => q.category === 'boss' || q.difficulty === 'boss').length,
    legendaryCompleted: done.filter((q) => q.category === 'legendary' || q.difficulty === 'legendary').length,
    recurringCompleted: done.filter((q) => q.category === 'daily' || q.category === 'weekly').length,
    totalXp,
    level: levelFromXp(totalXp).level,
    focusMinutes: Math.round(sessions.filter((s) => s.mode === 'focus').reduce((a, s) => a + s.actualMinutes, 0)),
    focusSessions: sessions.filter((s) => s.mode === 'focus' && s.completed).length,
    longestStreak: streak.longest,
    campaignsCompleted: args.completedCampaigns.length,
    longestCompletedCampaignDays: Math.max(0, ...args.completedCampaigns.map((c) => diffDays(c.endDate, c.startDate) + 1)),
    skillsMastered: [...skills.values()].filter((p) => p.rank >= 3).length,
    rewardsRedeemed: args.redemptions,
    reviewsWritten: args.reviews,
    onTimeCompletions: done.filter((q) => q.dueDate && q.completedAt && q.completedAt.slice(0, 10) <= q.dueDate).length,
  };
}

export async function computeStats(): Promise<PlayerStats> {
  const [quests, events, sessions, settings, campaigns, redemptions, reviews] = await Promise.all([
    db.quests.toArray(),
    db.xpEvents.toArray(),
    db.focusSessions.toArray(),
    getSettings(),
    db.campaigns.where('status').equals('completed').toArray(),
    db.redemptions.count(),
    db.reviews.count(),
  ]);
  return statsFrom({ quests, events, sessions, settings, completedCampaigns: campaigns, redemptions, reviews });
}

export async function totalXp(): Promise<number> {
  return activeXp(await db.xpEvents.toArray());
}

/**
 * Unlock any achievements whose condition is now met. Each unlock is recorded once and grants
 * a one-time XP bonus (idempotent via the unique sourceKey). Loops because bonus XP can unlock more.
 */
export async function evaluateAchievements(): Promise<AchievementDef[]> {
  const unlocked: AchievementDef[] = [];
  for (let pass = 0; pass < 4; pass++) {
    const stats = await computeStats();
    const have = new Set((await db.achievements.toArray()).map((a) => a.id));
    const fresh = newlyUnlocked(stats, have);
    if (fresh.length === 0) break;
    await db.transaction('rw', db.achievements, db.xpEvents, async () => {
      for (const def of fresh) {
        if (await db.achievements.get(def.id)) continue;
        await db.achievements.add({ id: def.id, unlockedAt: nowIso() });
        const sourceKey = `achievement:${def.id}`;
        if (!(await db.xpEvents.where('sourceKey').equals(sourceKey).first())) {
          await db.xpEvents.add({
            id: uid(),
            sourceKey,
            kind: 'achievement',
            amount: RARITY_XP[def.rarity],
            coins: 0,
            skillIds: [],
            date: todayKey(),
            createdAt: nowIso(),
            revoked: false,
          });
        }
        unlocked.push(def);
      }
    });
  }
  return unlocked;
}

export { ACHIEVEMENTS };
