import { describe, expect, it } from 'vitest';
import { instanceExpiry, occurrencesBetween } from './recurrence';
import type { RecurrenceRule } from './types';

const base: RecurrenceRule = {
  id: 'r', title: 'Stretch', description: '', category: 'daily', difficulty: 'easy', priority: 'medium',
  estimatedMinutes: 15, frequency: 'daily', interval: 1, weekdays: [], startDate: '2026-11-23', tags: [], skillIds: [],
  active: true, createdAt: '2026-11-23T00:00:00Z',
};

describe('recurrence', () => {
  it('generates daily occurrences with intervals', () => {
    expect(occurrencesBetween(base, '2026-11-23', '2026-11-26')).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
    expect(occurrencesBetween({ ...base, interval: 2 }, '2026-11-23', '2026-11-28')).toEqual(['2026-11-23', '2026-11-25', '2026-11-27']);
  });

  it('respects start and end dates', () => {
    expect(occurrencesBetween({ ...base, endDate: '2026-11-24' }, '2026-11-20', '2026-11-30')).toEqual(['2026-11-23', '2026-11-24']);
  });

  it('generates specific weekdays', () => {
    const r = { ...base, frequency: 'weekdays' as const, weekdays: [1, 3, 5] };
    expect(occurrencesBetween(r, '2026-11-23', '2026-11-29')).toEqual(['2026-11-23', '2026-11-25', '2026-11-27']);
  });

  it('generates one weekly instance that expires at week end', () => {
    const r = { ...base, category: 'weekly' as const, frequency: 'weekly' as const, weekdays: [1] };
    expect(occurrencesBetween(r, '2026-11-23', '2026-12-06')).toEqual(['2026-11-23', '2026-11-30']);
    expect(instanceExpiry(r, '2026-11-23')).toBe('2026-11-29');
    expect(instanceExpiry(base, '2026-11-23')).toBe('2026-11-23');
  });
});
