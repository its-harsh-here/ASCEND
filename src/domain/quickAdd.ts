import { addDays, isValid, nextMonday, parse } from 'date-fns';
import { toDateKey } from '@/lib/dates';
import type { Difficulty, Priority, QuestCategory } from './types';

/**
 * Deterministic quick-add grammar.
 *
 *   Finish Docker networking tomorrow 2h #cloud !high
 *
 * Supported tokens
 *   dates      today, tonight, tomorrow, tmrw, monday…sunday, mon…sun, next week, next friday,
 *              in 3 days, in 2 weeks, 2026-12-01, dec 5, 5 dec
 *   deadline   prefix a date with "due" or "by" (e.g. "due friday") to set the deadline instead
 *   time       at 3pm, 15:30, 9am
 *   duration   2h, 30m, 1.5h, 1h30m, 90min
 *   tags       #cloud
 *   priority   !low !medium !high !critical (or !1 critical … !4 low)
 *   difficulty ~trivial ~easy ~medium ~hard ~boss ~legendary
 *   category   @main @side @daily @weekly @boss @legendary
 *   campaign   +winter-break (matched against campaign names)
 */

export type QuickAddTokenType =
  | 'date'
  | 'due'
  | 'time'
  | 'duration'
  | 'tag'
  | 'priority'
  | 'difficulty'
  | 'category'
  | 'campaign';

export interface QuickAddToken {
  type: QuickAddTokenType;
  text: string;
  value: string;
}

export interface QuickAddResult {
  title: string;
  scheduledDate?: string;
  dueDate?: string;
  scheduledTime?: string;
  estimatedMinutes?: number;
  tags: string[];
  priority?: Priority;
  difficulty?: Difficulty;
  category?: QuestCategory;
  campaignHint?: string;
  tokens: QuickAddToken[];
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

const PRIORITY_ALIASES: Record<string, Priority> = {
  low: 'low', l: 'low', '4': 'low',
  medium: 'medium', med: 'medium', m: 'medium', '3': 'medium',
  high: 'high', h: 'high', '2': 'high',
  critical: 'critical', crit: 'critical', urgent: 'critical', c: 'critical', '1': 'critical',
};

const DIFFICULTY_ALIASES: Record<string, Difficulty> = {
  trivial: 'trivial', easy: 'easy', medium: 'medium', med: 'medium', hard: 'hard', boss: 'boss',
  legendary: 'legendary', legend: 'legendary',
};

const CATEGORY_ALIASES: Record<string, QuestCategory> = {
  main: 'main', side: 'side', daily: 'daily', weekly: 'weekly', boss: 'boss', legendary: 'legendary',
};

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';

function nextWeekday(ref: Date, target: number, forceNext: boolean): Date {
  const diff = (target - ref.getDay() + 7) % 7;
  return addDays(ref, diff === 0 && forceNext ? 7 : diff);
}

function parseDuration(tok: string): number | null {
  const t = tok.toLowerCase();
  let m = /^(\d+(?:\.\d+)?)h(?:(\d+)m(?:in)?)?$/.exec(t);
  if (m) return Math.round(parseFloat(m[1]) * 60 + (m[2] ? parseInt(m[2], 10) : 0));
  m = /^(\d+)(?:m|min|mins)$/.exec(t);
  if (m) return parseInt(m[1], 10);
  m = /^(\d+(?:\.\d+)?)(?:hr|hrs|hour|hours)$/.exec(t);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  return null;
}

function parseTime(tok: string): string | null {
  const t = tok.toLowerCase();
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) {
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (h < 24 && mm < 60) return `${String(h).padStart(2, '0')}:${m[2]}`;
  }
  m = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(t);
  if (m) {
    let h = parseInt(m[1], 10) % 12;
    if (m[3] === 'pm') h += 12;
    const mm = m[2] ?? '00';
    if (h < 24 && parseInt(mm, 10) < 60) return `${String(h).padStart(2, '0')}:${mm}`;
  }
  return null;
}

/** Try to parse a date phrase starting at `words[i]`. Returns the date and the number of words consumed. */
function parseDateAt(words: string[], i: number, ref: Date): { date: Date; consumed: number } | null {
  const w = words[i]?.toLowerCase();
  if (!w) return null;
  const w1 = words[i + 1]?.toLowerCase();
  const w2 = words[i + 2]?.toLowerCase();
  if (w === 'today' || w === 'tonight') return { date: ref, consumed: 1 };
  if (w === 'tomorrow' || w === 'tmrw' || w === 'tmr') return { date: addDays(ref, 1), consumed: 1 };
  if (w in WEEKDAYS) return { date: nextWeekday(ref, WEEKDAYS[w], false), consumed: 1 };
  if (w === 'next' && w1) {
    if (w1 === 'week') return { date: nextMonday(ref), consumed: 2 };
    if (w1 in WEEKDAYS) return { date: nextWeekday(ref, WEEKDAYS[w1], true), consumed: 2 };
  }
  if (w === 'in' && w1 && w2 && /^\d+$/.test(w1)) {
    const n = parseInt(w1, 10);
    if (/^days?$/.test(w2)) return { date: addDays(ref, n), consumed: 3 };
    if (/^weeks?$/.test(w2)) return { date: addDays(ref, n * 7), consumed: 3 };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
    const d = parse(w, 'yyyy-MM-dd', ref);
    if (isValid(d)) return { date: d, consumed: 1 };
  }
  const monthRe = new RegExp(`^(${MONTHS})$`);
  if (monthRe.test(w) && w1 && /^\d{1,2}(st|nd|rd|th)?$/.test(w1)) {
    const d = parse(`${w.slice(0, 3)} ${parseInt(w1, 10)}`, 'MMM d', ref);
    if (isValid(d)) return { date: d < ref && ref.getTime() - d.getTime() > 86400000 ? addYear(d) : d, consumed: 2 };
  }
  if (/^\d{1,2}(st|nd|rd|th)?$/.test(w) && w1 && monthRe.test(w1)) {
    const d = parse(`${w1.slice(0, 3)} ${parseInt(w, 10)}`, 'MMM d', ref);
    if (isValid(d)) return { date: d < ref && ref.getTime() - d.getTime() > 86400000 ? addYear(d) : d, consumed: 2 };
  }
  return null;
}

function addYear(d: Date): Date {
  const n = new Date(d);
  n.setFullYear(n.getFullYear() + 1);
  return n;
}

export function parseQuickAdd(input: string, ref: Date = new Date()): QuickAddResult {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const titleWords: string[] = [];
  const result: QuickAddResult = { title: '', tags: [], tokens: [] };
  let i = 0;
  while (i < words.length) {
    const raw = words[i];
    const lower = raw.toLowerCase();

    if (/^#[\p{L}\p{N}_-]+$/u.test(raw)) {
      const tag = raw.slice(1).toLowerCase();
      if (!result.tags.includes(tag)) result.tags.push(tag);
      result.tokens.push({ type: 'tag', text: raw, value: tag });
      i++;
      continue;
    }
    if (/^![\w]+$/.test(raw) && PRIORITY_ALIASES[lower.slice(1)]) {
      result.priority = PRIORITY_ALIASES[lower.slice(1)];
      result.tokens.push({ type: 'priority', text: raw, value: result.priority });
      i++;
      continue;
    }
    if (/^~\w+$/.test(raw) && DIFFICULTY_ALIASES[lower.slice(1)]) {
      result.difficulty = DIFFICULTY_ALIASES[lower.slice(1)];
      result.tokens.push({ type: 'difficulty', text: raw, value: result.difficulty });
      i++;
      continue;
    }
    if (/^@\w+$/.test(raw) && CATEGORY_ALIASES[lower.slice(1)]) {
      result.category = CATEGORY_ALIASES[lower.slice(1)];
      result.tokens.push({ type: 'category', text: raw, value: result.category });
      i++;
      continue;
    }
    if (/^\+[\p{L}\p{N}_-]+$/u.test(raw)) {
      result.campaignHint = raw.slice(1).replace(/[-_]/g, ' ');
      result.tokens.push({ type: 'campaign', text: raw, value: result.campaignHint });
      i++;
      continue;
    }
    const dur = parseDuration(raw);
    if (dur !== null && dur > 0) {
      result.estimatedMinutes = dur;
      result.tokens.push({ type: 'duration', text: raw, value: String(dur) });
      i++;
      continue;
    }
    if (lower === 'at' && words[i + 1]) {
      const t = parseTime(words[i + 1]);
      if (t) {
        result.scheduledTime = t;
        result.tokens.push({ type: 'time', text: `${raw} ${words[i + 1]}`, value: t });
        i += 2;
        continue;
      }
    }
    const t = /[:apm]/i.test(raw) ? parseTime(raw) : null;
    if (t && (raw.includes(':') || /[ap]m$/i.test(raw))) {
      result.scheduledTime = t;
      result.tokens.push({ type: 'time', text: raw, value: t });
      i++;
      continue;
    }
    if ((lower === 'due' || lower === 'by') && words[i + 1]) {
      const d = parseDateAt(words, i + 1, ref);
      if (d) {
        result.dueDate = toDateKey(d.date);
        result.tokens.push({ type: 'due', text: words.slice(i, i + 1 + d.consumed).join(' '), value: result.dueDate });
        i += 1 + d.consumed;
        continue;
      }
    }
    const d = parseDateAt(words, i, ref);
    if (d) {
      result.scheduledDate = toDateKey(d.date);
      result.tokens.push({ type: 'date', text: words.slice(i, i + d.consumed).join(' '), value: result.scheduledDate });
      i += d.consumed;
      continue;
    }
    titleWords.push(raw);
    i++;
  }
  result.title = titleWords.join(' ').trim();
  return result;
}
