import type { Difficulty } from '@/domain/types';

export type GoalDomain =
  | 'software'
  | 'dsa'
  | 'web'
  | 'cloud'
  | 'security'
  | 'ml'
  | 'research'
  | 'open-source'
  | 'career'
  | 'exam'
  | 'reading'
  | 'fitness'
  | 'general';

export type QuestLevel = 'foundation' | 'core' | 'advanced';

export interface QuestBlueprint {
  key: string;
  title: string;
  description: string;
  hours: number;
  difficulty: Difficulty;
  deliverable: string;
  level: QuestLevel;
  optional: boolean;
  boss: boolean;
  /** Explicit dependencies (keys in the same template). When omitted the quest follows the previous core quest. */
  deps?: string[];
  skills?: string[];
}

export interface MilestoneBlueprint {
  key: string;
  title: string;
  quests: QuestBlueprint[];
}

export interface RecurringBlueprint {
  title: string;
  description: string;
  minutes: number;
  frequency: 'daily' | 'weekdays';
  weekdays?: number[];
  difficulty: Difficulty;
}

export interface TemplateParams {
  quantity?: number;
}

export interface GoalTemplate {
  id: string;
  name: string;
  domain: GoalDomain;
  summary: string;
  icon: string;
  /** Phrases matched (case-insensitive, word-boundary) against the user's description. */
  keywords: string[];
  skillIds: string[];
  /** If the referenced template is also in the plan, this template starts after that milestone. */
  requires?: { template: string; milestone: string }[];
  /** Human-readable hint about what "quantity" means for parameterized templates. */
  quantityLabel?: string;
  quantityPattern?: RegExp;
  defaultQuantity?: number;
  milestones: MilestoneBlueprint[] | ((params: TemplateParams) => MilestoneBlueprint[]);
  recurring?: RecurringBlueprint[];
}

interface QOpts {
  level?: QuestLevel;
  optional?: boolean;
  boss?: boolean;
  deps?: string[];
  skills?: string[];
}

/** Compact constructor for quest blueprints. */
export function q(
  key: string,
  title: string,
  hours: number,
  difficulty: Difficulty,
  deliverable: string,
  description: string,
  opts: QOpts = {},
): QuestBlueprint {
  return {
    key,
    title,
    hours,
    difficulty,
    deliverable,
    description,
    level: opts.level ?? 'core',
    optional: opts.optional ?? false,
    boss: opts.boss ?? false,
    deps: opts.deps,
    skills: opts.skills,
  };
}

/** Foundation-level quest (skipped for advanced users, shortened for intermediates). */
export const f = (...args: Parameters<typeof q>) => q(args[0], args[1], args[2], args[3], args[4], args[5], { level: 'foundation', ...args[6] });
/** Optional side quest. */
export const side = (...args: Parameters<typeof q>) => q(args[0], args[1], args[2], args[3], args[4], args[5], { optional: true, ...args[6] });
/** Boss quest — a milestone deliverable. */
export const boss = (...args: Parameters<typeof q>) => q(args[0], args[1], args[2], args[3], args[4], args[5], { boss: true, ...args[6] });

export function m(key: string, title: string, quests: QuestBlueprint[]): MilestoneBlueprint {
  return { key, title, quests };
}
