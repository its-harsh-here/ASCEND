import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './types';
import { activeXp, coinsForXp, levelFromXp, questXp, titleForLevel, totalXpForLevel, xpToNextLevel } from './xp';

describe('XP and levels', () => {
  it('uses the documented base XP per difficulty', () => {
    expect(questXp({ difficulty: 'trivial' }, DEFAULT_SETTINGS)).toBe(10);
    expect(questXp({ difficulty: 'easy' }, DEFAULT_SETTINGS)).toBe(25);
    expect(questXp({ difficulty: 'medium' }, DEFAULT_SETTINGS)).toBe(50);
    expect(questXp({ difficulty: 'hard' }, DEFAULT_SETTINGS)).toBe(100);
    expect(questXp({ difficulty: 'boss' }, DEFAULT_SETTINGS)).toBe(250);
    expect(questXp({ difficulty: 'legendary' }, DEFAULT_SETTINGS)).toBe(500);
  });

  it('applies multipliers and explicit overrides', () => {
    expect(questXp({ difficulty: 'medium' }, { ...DEFAULT_SETTINGS, xpMultiplier: 1.5 })).toBe(75);
    expect(questXp({ difficulty: 'medium', xpReward: 7 }, DEFAULT_SETTINGS)).toBe(7);
  });

  it('starts at level 1 and levels up exactly at thresholds', () => {
    expect(levelFromXp(0).level).toBe(1);
    const t2 = totalXpForLevel(2);
    expect(t2).toBe(xpToNextLevel(1));
    expect(levelFromXp(t2 - 1).level).toBe(1);
    expect(levelFromXp(t2).level).toBe(2);
    expect(levelFromXp(totalXpForLevel(10)).level).toBe(10);
  });

  it('has a monotonic, accelerating curve', () => {
    for (let l = 1; l < 80; l++) expect(xpToNextLevel(l + 1)).toBeGreaterThan(xpToNextLevel(l));
  });

  it('reports progress within the level', () => {
    const info = levelFromXp(totalXpForLevel(5) + xpToNextLevel(5) / 2);
    expect(info.level).toBe(5);
    expect(info.progress).toBeCloseTo(0.5, 1);
  });

  it('maps levels to titles', () => {
    expect(titleForLevel(1)).toBe('Novice');
    expect(titleForLevel(3)).toBe('Apprentice');
    expect(titleForLevel(10)).toBe('Adventurer');
    expect(titleForLevel(99)).toBe('Ascendant');
  });

  it('ignores revoked events', () => {
    const base = { kind: 'quest' as const, coins: 0, skillIds: [], date: '2026-01-01', createdAt: '2026-01-01T00:00:00Z' };
    expect(
      activeXp([
        { ...base, id: '1', sourceKey: 'a', amount: 50, revoked: false },
        { ...base, id: '2', sourceKey: 'b', amount: 100, revoked: true },
      ]),
    ).toBe(50);
    expect(coinsForXp(50)).toBe(10);
  });
});
