import { addDaysKey, eachDateKey, weekdayOf } from '@/lib/dates';

export interface StreakInput {
  activeDates: Iterable<string>;
  /** Weekdays (0=Sun..6=Sat) the user intends to work. Missing a non-workday never breaks a streak. */
  workdays: number[];
  today: string;
  freezesEnabled: boolean;
  maxFreezes?: number;
}

export interface StreakResult {
  current: number;
  longest: number;
  activeToday: boolean;
  freezesAvailable: number;
  /** Workdays that were missed but protected by a streak freeze. */
  frozenDates: string[];
  restDates: string[];
}

/**
 * Compassionate streak model:
 * - A day counts when at least one quest or focus session was completed.
 * - Non-workdays are rest days and are neutral.
 * - Every 7 active days earns a streak freeze (max 2) which automatically protects one missed workday.
 * - Today never breaks a streak — there is still time.
 */
export function computeStreak(input: StreakInput): StreakResult {
  const active = new Set(input.activeDates);
  const maxFreezes = input.maxFreezes ?? 2;
  const workdays = new Set(input.workdays.length ? input.workdays : [0, 1, 2, 3, 4, 5, 6]);
  const sorted = [...active].filter((d) => d <= input.today).sort();
  const result: StreakResult = {
    current: 0,
    longest: 0,
    activeToday: active.has(input.today),
    freezesAvailable: 0,
    frozenDates: [],
    restDates: [],
  };
  if (sorted.length === 0) return result;

  let streak = 0;
  let freezes = 0;
  const yesterday = addDaysKey(input.today, -1);
  const days = sorted[0] <= yesterday ? eachDateKey(sorted[0], yesterday) : [];
  for (const d of days) {
    if (active.has(d)) {
      streak++;
      if (streak % 7 === 0) freezes = Math.min(maxFreezes, freezes + 1);
    } else if (!workdays.has(weekdayOf(d))) {
      result.restDates.push(d);
    } else if (input.freezesEnabled && freezes > 0 && streak > 0) {
      freezes--;
      result.frozenDates.push(d);
    } else {
      streak = 0;
    }
    result.longest = Math.max(result.longest, streak);
  }
  if (result.activeToday) {
    streak++;
    if (streak % 7 === 0) freezes = Math.min(maxFreezes, freezes + 1);
  }
  result.current = streak;
  result.longest = Math.max(result.longest, streak);
  result.freezesAvailable = input.freezesEnabled ? freezes : 0;
  return result;
}

/** Share of planned workdays in the trailing window that had activity. */
export function weeklyConsistency(activeDates: Iterable<string>, workdays: number[], today: string, window = 7): number {
  const active = new Set(activeDates);
  const wd = new Set(workdays.length ? workdays : [0, 1, 2, 3, 4, 5, 6]);
  let planned = 0;
  let hit = 0;
  for (let i = window - 1; i >= 0; i--) {
    const d = addDaysKey(today, -i);
    if (!wd.has(weekdayOf(d))) {
      if (active.has(d)) {
        hit++;
        planned++;
      }
      continue;
    }
    planned++;
    if (active.has(d)) hit++;
  }
  return planned === 0 ? 0 : hit / planned;
}
