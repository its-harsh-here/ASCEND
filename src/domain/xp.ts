import type { Difficulty, Quest, Settings, XpEvent } from './types';

/** XP required to advance from `level` to `level + 1`. Smooth, gently-accelerating curve. */
export function xpToNextLevel(level: number): number {
  return Math.round(80 * Math.pow(level, 1.35));
}

/** Total XP required to reach `level` from level 1. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNextLevel(l);
  return total;
}

export interface LevelInfo {
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number; // 0..1
  title: string;
  nextTitle: { title: string; level: number } | null;
}

export const TITLES: { level: number; title: string }[] = [
  { level: 1, title: 'Novice' },
  { level: 3, title: 'Apprentice' },
  { level: 6, title: 'Explorer' },
  { level: 10, title: 'Adventurer' },
  { level: 15, title: 'Specialist' },
  { level: 22, title: 'Expert' },
  { level: 30, title: 'Master' },
  { level: 45, title: 'Grandmaster' },
  { level: 60, title: 'Ascendant' },
];

export function titleForLevel(level: number): string {
  let t = TITLES[0].title;
  for (const entry of TITLES) if (level >= entry.level) t = entry.title;
  return t;
}

export function levelFromXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = xp;
  while (remaining >= xpToNextLevel(level) && level < 999) {
    remaining -= xpToNextLevel(level);
    level++;
  }
  const xpForNext = xpToNextLevel(level);
  const next = TITLES.find((t) => t.level > level) ?? null;
  return {
    level,
    totalXp: xp,
    xpIntoLevel: remaining,
    xpForNext,
    progress: xpForNext === 0 ? 0 : remaining / xpForNext,
    title: titleForLevel(level),
    nextTitle: next,
  };
}

export function baseXpFor(difficulty: Difficulty, settings: Pick<Settings, 'difficultyXp' | 'xpMultiplier'>): number {
  return Math.max(0, Math.round(settings.difficultyXp[difficulty] * settings.xpMultiplier));
}

/** XP a quest grants when completed. Explicit overrides take precedence. */
export function questXp(
  quest: Pick<Quest, 'difficulty' | 'xpReward'>,
  settings: Pick<Settings, 'difficultyXp' | 'xpMultiplier'>,
): number {
  if (typeof quest.xpReward === 'number') return quest.xpReward;
  return baseXpFor(quest.difficulty, settings);
}

export function coinsForXp(xp: number): number {
  return Math.max(0, Math.round(xp / 5));
}

export function activeXp(events: XpEvent[]): number {
  let total = 0;
  for (const e of events) if (!e.revoked) total += e.amount;
  return total;
}

export function activeCoins(events: XpEvent[]): number {
  let total = 0;
  for (const e of events) if (!e.revoked) total += e.coins;
  return total;
}

export function xpByDate(events: XpEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) {
    if (e.revoked) continue;
    m.set(e.date, (m.get(e.date) ?? 0) + e.amount);
  }
  return m;
}

export function questSourceKey(questId: string): string {
  return `quest:${questId}`;
}
