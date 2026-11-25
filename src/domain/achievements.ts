export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface PlayerStats {
  questsCompleted: number;
  bossesDefeated: number;
  legendaryCompleted: number;
  recurringCompleted: number;
  totalXp: number;
  level: number;
  focusMinutes: number;
  focusSessions: number;
  longestStreak: number;
  campaignsCompleted: number;
  longestCompletedCampaignDays: number;
  skillsMastered: number;
  rewardsRedeemed: number;
  reviewsWritten: number;
  onTimeCompletions: number;
}

export const EMPTY_STATS: PlayerStats = {
  questsCompleted: 0,
  bossesDefeated: 0,
  legendaryCompleted: 0,
  recurringCompleted: 0,
  totalXp: 0,
  level: 1,
  focusMinutes: 0,
  focusSessions: 0,
  longestStreak: 0,
  campaignsCompleted: 0,
  longestCompletedCampaignDays: 0,
  skillsMastered: 0,
  rewardsRedeemed: 0,
  reviewsWritten: 0,
  onTimeCompletions: 0,
};

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  rarity: Rarity;
  icon: string;
  metric: keyof PlayerStats;
  target: number;
}

const a = (
  id: string,
  title: string,
  description: string,
  rarity: Rarity,
  icon: string,
  metric: keyof PlayerStats,
  target: number,
): AchievementDef => ({ id, title, description, rarity, icon, metric, target });

export const ACHIEVEMENTS: AchievementDef[] = [
  a('first-quest', 'First Steps', 'Complete your first quest.', 'common', 'footprints', 'questsCompleted', 1),
  a('quests-10', 'Taskbearer', 'Complete 10 quests.', 'common', 'scroll', 'questsCompleted', 10),
  a('quests-50', 'Questwright', 'Complete 50 quests.', 'rare', 'scroll-text', 'questsCompleted', 50),
  a('quests-100', 'Centurion', 'Complete 100 quests.', 'epic', 'shield', 'questsCompleted', 100),
  a('quests-500', 'Myriad Deeds', 'Complete 500 quests.', 'legendary', 'crown', 'questsCompleted', 500),
  a('first-boss', 'Giant Slayer', 'Defeat your first Boss quest.', 'rare', 'swords', 'bossesDefeated', 1),
  a('boss-10', 'Bane of Titans', 'Defeat 10 Boss quests.', 'epic', 'skull', 'bossesDefeated', 10),
  a('legendary-1', 'Living Legend', 'Complete a Legendary quest.', 'legendary', 'gem', 'legendaryCompleted', 1),
  a('streak-3', 'Kindled', 'Reach a 3-day streak.', 'common', 'flame', 'longestStreak', 3),
  a('streak-7', 'Seven-Day Consistency', 'Reach a 7-day streak.', 'rare', 'flame-kindling', 'longestStreak', 7),
  a('streak-30', 'Unbroken Flame', 'Reach a 30-day streak.', 'epic', 'sun', 'longestStreak', 30),
  a('streak-100', 'Eternal Ember', 'Reach a 100-day streak.', 'legendary', 'sparkles', 'longestStreak', 100),
  a('focus-60', 'Into the Deep', 'Accumulate 1 hour of focus time.', 'common', 'hourglass', 'focusMinutes', 60),
  a('focus-600', 'Deep Worker', 'Accumulate 10 hours of focus time.', 'rare', 'brain', 'focusMinutes', 600),
  a('focus-3000', 'Monk of Flow', 'Accumulate 50 hours of focus time.', 'epic', 'mountain', 'focusMinutes', 3000),
  a('xp-1000', 'Thousandfold', 'Earn 1,000 XP.', 'common', 'zap', 'totalXp', 1000),
  a('xp-10000', 'Ten Thousand Strikes', 'Earn 10,000 XP.', 'rare', 'bolt', 'totalXp', 10000),
  a('xp-100000', 'Ascension', 'Earn 100,000 XP.', 'legendary', 'orbit', 'totalXp', 100000),
  a('level-10', 'Adventurer', 'Reach level 10.', 'rare', 'compass', 'level', 10),
  a('campaign-1', 'Campaign Victor', 'Complete your first campaign.', 'rare', 'flag', 'campaignsCompleted', 1),
  a('campaign-30d', 'The Long March', 'Complete a campaign lasting 30 days or more.', 'epic', 'map', 'longestCompletedCampaignDays', 30),
  a('campaign-5', 'Warlord of Goals', 'Complete 5 campaigns.', 'legendary', 'castle', 'campaignsCompleted', 5),
  a('habit-30', 'Ritualist', 'Complete 30 daily or weekly quests.', 'rare', 'repeat', 'recurringCompleted', 30),
  a('skill-1', 'Adept', 'Reach rank 3 in any skill.', 'rare', 'graduation-cap', 'skillsMastered', 1),
  a('reward-1', 'Well Earned', 'Redeem your first reward.', 'common', 'gift', 'rewardsRedeemed', 1),
  a('review-7', 'Reflective Mind', 'Write 7 reviews.', 'rare', 'notebook-pen', 'reviewsWritten', 7),
  a('ontime-25', 'Punctual', 'Complete 25 quests on or before their deadline.', 'rare', 'clock', 'onTimeCompletions', 25),
];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export const RARITY_XP: Record<Rarity, number> = { common: 20, rare: 50, epic: 120, legendary: 300 };

export function achievementProgress(def: AchievementDef, stats: PlayerStats): { current: number; ratio: number } {
  const current = Math.min(stats[def.metric], def.target);
  return { current, ratio: def.target === 0 ? 1 : current / def.target };
}

/** Achievements that should be unlocked given stats but are not yet recorded. */
export function newlyUnlocked(stats: PlayerStats, unlockedIds: Set<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((def) => !unlockedIds.has(def.id) && stats[def.metric] >= def.target);
}
