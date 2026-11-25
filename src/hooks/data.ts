import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/db/schema';
import { computeStreak, weeklyConsistency } from '@/domain/streaks';
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@/domain/types';
import { activeCoins, activeXp, levelFromXp } from '@/domain/xp';
import { todayKey } from '@/lib/dates';
import { activeDatesFrom } from '@/services/progression';

/** Current local date key; updates at midnight and when the tab becomes visible again. */
export function useToday(): string {
  const [today, setToday] = useState(todayKey());
  useEffect(() => {
    const tick = () => setToday((prev) => (prev === todayKey() ? prev : todayKey()));
    const id = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return today;
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => {
    const raw = await db.settings.get('settings');
    if (!raw) return DEFAULT_SETTINGS;
    const p = settingsSchema.safeParse(raw);
    return p.success ? p.data : { ...DEFAULT_SETTINGS, ...raw };
  });
}

export const useQuests = () => useLiveQuery(() => db.quests.toArray(), [], undefined);
export const useCampaigns = () => useLiveQuery(() => db.campaigns.orderBy('createdAt').reverse().toArray(), [], undefined);
export const useQuestlines = () => useLiveQuery(() => db.questlines.toArray(), [], undefined);
export const useMilestones = () => useLiveQuery(() => db.milestones.toArray(), [], undefined);
export const useXpEvents = () => useLiveQuery(() => db.xpEvents.toArray(), [], undefined);
export const useFocusSessions = () => useLiveQuery(() => db.focusSessions.toArray(), [], undefined);
export const useTimeBlocks = () => useLiveQuery(() => db.timeBlocks.toArray(), [], undefined);
export const useAchievementUnlocks = () => useLiveQuery(() => db.achievements.toArray(), [], undefined);
export const useRewards = () => useLiveQuery(() => db.rewards.toArray(), [], undefined);
export const useRedemptions = () => useLiveQuery(() => db.redemptions.orderBy('redeemedAt').reverse().toArray(), [], undefined);
export const useRecurrences = () => useLiveQuery(() => db.recurrences.toArray(), [], undefined);
export const useReviews = () => useLiveQuery(() => db.reviews.toArray(), [], undefined);

export interface Profile {
  totalXp: number;
  coins: number;
  level: ReturnType<typeof levelFromXp>;
  streak: ReturnType<typeof computeStreak>;
  consistency: number;
  activeDates: Set<string>;
}

/** Character progression derived from the immutable XP ledger and focus history. */
export function useProfile(): Profile | undefined {
  const events = useXpEvents();
  const sessions = useFocusSessions();
  const redemptions = useRedemptions();
  const settings = useSettings();
  const today = useToday();
  return useMemo(() => {
    if (!events || !sessions || !redemptions || !settings) return undefined;
    const totalXp = activeXp(events);
    const activeDates = activeDatesFrom(events, sessions);
    return {
      totalXp,
      coins: activeCoins(events) - redemptions.reduce((s, r) => s + r.cost, 0),
      level: levelFromXp(totalXp),
      streak: computeStreak({ activeDates, workdays: settings.workdays, today, freezesEnabled: settings.streakFreezesEnabled }),
      consistency: weeklyConsistency(activeDates, settings.workdays, today),
      activeDates,
    };
  }, [events, sessions, redemptions, settings, today]);
}

/** Shared lookup context for rendering quest lists. */
export function useQuestContext() {
  const quests = useQuests();
  const campaigns = useCampaigns();
  const settings = useSettings();
  const subtasks = useLiveQuery(() => db.subtasks.toArray(), [], undefined);
  return useMemo(() => {
    if (!quests || !campaigns || !settings || !subtasks) return undefined;
    const byId = new Map(quests.map((q) => [q.id, q]));
    const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
    const subtaskCounts = new Map<string, { done: number; total: number }>();
    for (const s of subtasks) {
      const c = subtaskCounts.get(s.questId) ?? { done: 0, total: 0 };
      c.total++;
      if (s.done) c.done++;
      subtaskCounts.set(s.questId, c);
    }
    const blocked = (id: string) => {
      const q = byId.get(id);
      return !!q && q.dependencies.some((d) => {
        const dep = byId.get(d);
        return dep && dep.status !== 'done' && dep.status !== 'skipped';
      });
    };
    return { quests, campaigns, settings, byId, campaignName, subtaskCounts, blocked };
  }, [quests, campaigns, settings, subtasks]);
}
