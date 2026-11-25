import type { SkillLevel } from '@/domain/types';
import { GOAL_TEMPLATES } from './catalog';

/**
 * Deterministic natural-language goal extraction.
 *
 * This is keyword and pattern matching against a curated catalog — not a language model.
 * Every match records the phrase that triggered it so the UI can show *why* a goal was recognized.
 */

export interface GoalMatch {
  templateId: string;
  keyword: string;
  index: number;
  quantity?: number;
}

export interface ParsedGoalText {
  matches: GoalMatch[];
  unrecognized: string[];
  durationDays?: number;
  hoursPerDay?: number;
  skillLevel?: SkillLevel;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90,
};

function toNumber(s: string): number | undefined {
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return NUMBER_WORDS[s.toLowerCase()];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordRegex(kw: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(kw).replace(/\s+/g, '[\\s-]+')}(?![\\p{L}\\p{N}])`, 'giu');
}

const NUM = '(\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|sixty|ninety)';

export function parseDuration(text: string): number | undefined {
  const re = new RegExp(`${NUM}\\s*(day|days|week|weeks|month|months)\\b`, 'i');
  const m = re.exec(text);
  if (!m) return undefined;
  const n = toNumber(m[1]);
  if (n === undefined) return undefined;
  const unit = m[2].toLowerCase();
  if (unit.startsWith('day')) return Math.round(n);
  if (unit.startsWith('week')) return Math.round(n * 7);
  return Math.round(n * 30);
}

export function parseDailyHours(text: string): number | undefined {
  const t = text.toLowerCase();
  const daily = '(?:daily|a day|per day|each day|every day|/day|a\\s+day)';
  const patterns: [RegExp, number][] = [
    [new RegExp(`${NUM}\\s*(?:hours?|hrs?|h)\\b[^.;\\n]{0,30}?${daily}`, 'i'), 1],
    [new RegExp(`${daily}[^.;\\n]{0,25}?${NUM}\\s*(?:hours?|hrs?|h)\\b`, 'i'), 1],
    [new RegExp(`${NUM}\\s*(?:minutes?|mins?)\\b[^.;\\n]{0,30}?${daily}`, 'i'), 1 / 60],
  ];
  for (const [re, factor] of patterns) {
    const m = re.exec(t);
    if (m) {
      const n = toNumber(m[1]);
      if (n !== undefined && n > 0 && n * factor <= 16) return Math.round(n * factor * 4) / 4;
    }
  }
  return undefined;
}

export function parseSkillLevel(text: string): SkillLevel | undefined {
  const t = text.toLowerCase();
  if (/\b(complete beginner|beginner|never (?:used|done|tried)|new to|from scratch|no experience|newbie)\b/.test(t)) return 'beginner';
  if (/\b(advanced|experienced|expert|years of experience)\b/.test(t)) return 'advanced';
  if (/\b(intermediate|some experience|familiar with|comfortable with|basics already)\b/.test(t)) return 'intermediate';
  return undefined;
}

const GOAL_VERBS = /\b(learn|improve|master|build|study|practi[cs]e|prepare|get better|write|finish|complete|start|train|develop|create|become|understand|explore|launch|ship|crack|pass|run|read)\b/i;
const NOISE = /\b(i have|i've got|hours?|days?|weeks?|months?|available|free time|break|vacation|holiday)\b/i;

export function parseGoalText(text: string): ParsedGoalText {
  const found: (GoalMatch & { end: number })[] = [];
  for (const t of GOAL_TEMPLATES) {
    for (const kw of t.keywords) {
      for (const m of text.matchAll(keywordRegex(kw))) {
        found.push({ templateId: t.id, keyword: m[0], index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
      }
    }
  }
  // Prefer longer phrases; drop matches that overlap an already accepted longer span.
  found.sort((a, b) => b.end - b.index - (a.end - a.index) || a.index - b.index);
  const accepted: (GoalMatch & { end: number })[] = [];
  for (const f of found) {
    if (accepted.some((a) => f.index < a.end && a.index < f.end)) continue;
    accepted.push(f);
  }
  const byTemplate = new Map<string, GoalMatch & { end: number }>();
  for (const a of accepted.sort((x, y) => x.index - y.index)) if (!byTemplate.has(a.templateId)) byTemplate.set(a.templateId, a);

  const matches: GoalMatch[] = [...byTemplate.values()].map(({ templateId, keyword, index }) => {
    const tpl = GOAL_TEMPLATES.find((t) => t.id === templateId)!;
    let quantity: number | undefined;
    if (tpl.quantityPattern) {
      const qm = tpl.quantityPattern.exec(text);
      if (qm) quantity = Number(qm[1]);
    }
    return { templateId, keyword, index, quantity };
  });

  // Clauses with a goal verb but no recognized keyword become "unrecognized goals".
  const unrecognized: string[] = [];
  const clauseRe = /[^,;.\n]+/g;
  for (const cm of text.matchAll(clauseRe)) {
    const start = cm.index ?? 0;
    const end = start + cm[0].length;
    for (const part of cm[0].split(/\b(?:and|also|then|plus)\b/i)) {
      const clause = part.trim();
      if (clause.length < 4) continue;
      const pos = text.indexOf(clause, start);
      const pEnd = pos + clause.length;
      const covered = accepted.some((a) => a.index < pEnd && pos < a.end && a.index >= start && a.end <= end);
      if (covered) continue;
      if (!GOAL_VERBS.test(clause) || NOISE.test(clause)) continue;
      const cleaned = clause
        .replace(/^(?:i\s+(?:want|would like|need|plan|hope)\s+to|i'd like to|i will|i'll|want to|to)\s+/i, '')
        .replace(/^(?:also|then)\s+/i, '')
        .trim();
      if (cleaned.length >= 3) unrecognized.push(cleaned.charAt(0).toUpperCase() + cleaned.slice(1));
    }
  }

  return {
    matches,
    unrecognized,
    durationDays: parseDuration(text),
    hoursPerDay: parseDailyHours(text),
    skillLevel: parseSkillLevel(text),
  };
}
