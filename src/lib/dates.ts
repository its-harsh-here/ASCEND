import {
  addDays,
  differenceInCalendarDays,
  format,
  getISOWeek,
  getISOWeekYear,
  isValid,
  parse,
  parseISO,
  startOfISOWeek,
} from 'date-fns';

/** Local calendar day key, yyyy-MM-dd. */
export function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function fromDateKey(key: string): Date {
  return parseISO(key);
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function addDaysKey(key: string, days: number): string {
  return toDateKey(addDays(fromDateKey(key), days));
}

export function diffDays(a: string, b: string): number {
  return differenceInCalendarDays(fromDateKey(a), fromDateKey(b));
}

export function weekdayOf(key: string): number {
  return fromDateKey(key).getDay();
}

export function isValidDateKey(key: string | undefined): key is string {
  return !!key && /^\d{4}-\d{2}-\d{2}$/.test(key) && isValid(parseISO(key));
}

/** Inclusive range of date keys. */
export function eachDateKey(start: string, end: string): string[] {
  const out: string[] = [];
  const n = diffDays(end, start);
  for (let i = 0; i <= n; i++) out.push(addDaysKey(start, i));
  return out;
}

export function isoWeekKey(key: string): string {
  const d = fromDateKey(key);
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
}

export function weekStartKey(key: string): string {
  return toDateKey(startOfISOWeek(fromDateKey(key)));
}

export function formatDateKey(key: string, pattern = 'EEE, MMM d'): string {
  return format(fromDateKey(key), pattern);
}

export function relativeDayLabel(key: string, today: string = todayKey()): string {
  const d = diffDays(key, today);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1 && d < 7) return format(fromDateKey(key), 'EEEE');
  if (d < 0) return `${-d} days ago`;
  return formatDateKey(key, 'MMM d');
}

export function minutesFromTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function timeFromMinutes(mins: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseLooseDate(input: string, ref: Date): Date | null {
  const formats = ['yyyy-MM-dd', 'MMM d', 'MMMM d', 'd MMM', 'd MMMM', 'MM/dd', 'MMM d yyyy', 'd/M/yyyy'];
  for (const f of formats) {
    const d = parse(input, f, ref);
    if (isValid(d)) return d;
  }
  return null;
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
