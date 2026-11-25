import { describe, expect, it } from 'vitest';
import { computeStreak, weeklyConsistency } from './streaks';

const ALL = [0, 1, 2, 3, 4, 5, 6];

describe('streaks', () => {
  it('counts consecutive active days including today', () => {
    const r = computeStreak({ activeDates: ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'], workdays: ALL, today: '2026-11-25', freezesEnabled: false });
    expect(r.current).toBe(4);
    expect(r.longest).toBe(4);
    expect(r.activeToday).toBe(true);
  });

  it('does not break the streak because today is not yet done', () => {
    const r = computeStreak({ activeDates: ['2026-11-23', '2026-11-24'], workdays: ALL, today: '2026-11-25', freezesEnabled: false });
    expect(r.current).toBe(2);
  });

  it('breaks after a missed workday without freezes', () => {
    const r = computeStreak({ activeDates: ['2026-11-20', '2026-11-21', '2026-11-23'], workdays: ALL, today: '2026-11-24', freezesEnabled: false });
    expect(r.current).toBe(1);
    expect(r.longest).toBe(2);
  });

  it('treats non-workdays as neutral rest days', () => {
    // 2026-11-22 is a Sunday; workdays Mon-Sat.
    const r = computeStreak({ activeDates: ['2026-11-20', '2026-11-21', '2026-11-23'], workdays: [1, 2, 3, 4, 5, 6], today: '2026-11-23', freezesEnabled: false });
    expect(r.current).toBe(3);
    expect(r.restDates).toContain('2026-11-22');
  });

  it('earns and consumes a freeze after 7 active days', () => {
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09'];
    const r = computeStreak({ activeDates: days, workdays: ALL, today: '2026-11-09', freezesEnabled: true });
    expect(r.frozenDates).toEqual(['2026-11-08']);
    expect(r.current).toBe(8);
    expect(r.freezesAvailable).toBe(0);
  });

  it('computes weekly consistency', () => {
    expect(weeklyConsistency(['2026-11-25', '2026-11-24'], ALL, '2026-11-25')).toBeCloseTo(2 / 7);
  });
});
