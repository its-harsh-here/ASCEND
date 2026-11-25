import { z } from 'zod';

/**
 * Domain model for ASCEND.
 *
 * Conventions
 * - Identifiers are opaque stable strings (UUID v4).
 * - Calendar days are stored as local "date keys" (yyyy-MM-dd) so they never shift with timezones.
 * - Instants are stored as ISO-8601 UTC strings.
 */

export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected yyyy-MM-dd');
export const timeKey = z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:mm');
export const isoInstant = z.string().min(10);

export const DIFFICULTIES = ['trivial', 'easy', 'medium', 'hard', 'boss', 'legendary'] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const CATEGORIES = ['main', 'side', 'daily', 'weekly', 'boss', 'legendary'] as const;
export const STATUSES = ['todo', 'in_progress', 'done', 'skipped'] as const;
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const CAMPAIGN_STATUSES = ['active', 'paused', 'completed', 'archived'] as const;

export const difficultySchema = z.enum(DIFFICULTIES);
export const prioritySchema = z.enum(PRIORITIES);
export const categorySchema = z.enum(CATEGORIES);
export const statusSchema = z.enum(STATUSES);
export const skillLevelSchema = z.enum(SKILL_LEVELS);

export type Difficulty = z.infer<typeof difficultySchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type QuestCategory = z.infer<typeof categorySchema>;
export type QuestStatus = z.infer<typeof statusSchema>;
export type SkillLevel = z.infer<typeof skillLevelSchema>;

export const linkSchema = z.object({
  label: z.string().max(200).default(''),
  url: z.string().max(2000),
});
export type QuestLink = z.infer<typeof linkSchema>;

export const campaignSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  objective: z.string().max(5000).default(''),
  status: z.enum(CAMPAIGN_STATUSES).default('active'),
  startDate: dateKey,
  endDate: dateKey,
  hoursPerDay: z.number().min(0.25).max(16),
  workdays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5, 6]),
  skillLevel: skillLevelSchema.default('beginner'),
  constraints: z.string().max(5000).default(''),
  outcomes: z.array(z.string().max(500)).default([]),
  templateIds: z.array(z.string()).default([]),
  color: z.string().default('violet'),
  createdAt: isoInstant,
  updatedAt: isoInstant,
  completedAt: isoInstant.optional(),
});
export type Campaign = z.infer<typeof campaignSchema>;

export const questlineSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(''),
  order: z.number().default(0),
  templateId: z.string().optional(),
  skillIds: z.array(z.string()).default([]),
  createdAt: isoInstant,
});
export type Questline = z.infer<typeof questlineSchema>;

export const milestoneSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  questlineId: z.string(),
  title: z.string().min(1).max(200),
  order: z.number().default(0),
  dueDate: dateKey.optional(),
  deadlineLocked: z.boolean().default(false),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const questSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).default(''),
  category: categorySchema.default('main'),
  difficulty: difficultySchema.default('medium'),
  priority: prioritySchema.default('medium'),
  status: statusSchema.default('todo'),
  estimatedMinutes: z.number().min(0).max(100000).default(60),
  actualMinutes: z.number().min(0).max(1000000).default(0),
  /** Explicit XP override; when undefined XP derives from difficulty and settings. */
  xpReward: z.number().int().min(0).max(100000).optional(),
  dueDate: dateKey.optional(),
  scheduledDate: dateKey.optional(),
  scheduledTime: timeKey.optional(),
  deadlineLocked: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
  notes: z.string().max(20000).default(''),
  tags: z.array(z.string().max(60)).default([]),
  links: z.array(linkSchema).default([]),
  skillIds: z.array(z.string()).default([]),
  campaignId: z.string().optional(),
  questlineId: z.string().optional(),
  milestoneId: z.string().optional(),
  recurrenceId: z.string().optional(),
  recurrenceDate: dateKey.optional(),
  deliverable: z.string().max(2000).optional(),
  optional: z.boolean().default(false),
  origin: z.enum(['manual', 'generated', 'recurring', 'quickadd', 'revision']).default('manual'),
  templateKey: z.string().optional(),
  userEdited: z.boolean().default(false),
  order: z.number().default(0),
  createdAt: isoInstant,
  updatedAt: isoInstant,
  completedAt: isoInstant.optional(),
  archivedAt: isoInstant.optional(),
});
export type Quest = z.infer<typeof questSchema>;

export const subtaskSchema = z.object({
  id: z.string(),
  questId: z.string(),
  title: z.string().min(1).max(300),
  done: z.boolean().default(false),
  order: z.number().default(0),
});
export type Subtask = z.infer<typeof subtaskSchema>;

export const recurrenceSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).default(''),
  category: z.enum(['daily', 'weekly']).default('daily'),
  difficulty: difficultySchema.default('easy'),
  priority: prioritySchema.default('medium'),
  estimatedMinutes: z.number().min(0).default(30),
  /** daily: every N days; weekdays: on listed weekdays; weekly: once per week on the first listed weekday. */
  frequency: z.enum(['daily', 'weekdays', 'weekly']),
  interval: z.number().int().min(1).max(365).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  startDate: dateKey,
  endDate: dateKey.optional(),
  campaignId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  skillIds: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  createdAt: isoInstant,
});
export type RecurrenceRule = z.infer<typeof recurrenceSchema>;

export const xpEventSchema = z.object({
  id: z.string(),
  /** Unique key guaranteeing XP is granted at most once per source, e.g. "quest:<id>". */
  sourceKey: z.string(),
  kind: z.enum(['quest', 'focus', 'achievement', 'bonus']),
  questId: z.string().optional(),
  campaignId: z.string().optional(),
  amount: z.number().int(),
  coins: z.number().int().default(0),
  skillIds: z.array(z.string()).default([]),
  date: dateKey,
  createdAt: isoInstant,
  revoked: z.boolean().default(false),
});
export type XpEvent = z.infer<typeof xpEventSchema>;

export const focusSessionSchema = z.object({
  id: z.string(),
  mode: z.enum(['focus', 'break']),
  questId: z.string().optional(),
  campaignId: z.string().optional(),
  plannedMinutes: z.number().min(0),
  actualMinutes: z.number().min(0),
  startedAt: isoInstant,
  endedAt: isoInstant,
  completed: z.boolean(),
  date: dateKey,
});
export type FocusSession = z.infer<typeof focusSessionSchema>;

export const achievementUnlockSchema = z.object({
  id: z.string(),
  unlockedAt: isoInstant,
});
export type AchievementUnlock = z.infer<typeof achievementUnlockSchema>;

export const rewardSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  cost: z.number().int().min(1).max(1000000),
  icon: z.string().default('gift'),
  archived: z.boolean().default(false),
  createdAt: isoInstant,
});
export type Reward = z.infer<typeof rewardSchema>;

export const redemptionSchema = z.object({
  id: z.string(),
  rewardId: z.string(),
  title: z.string(),
  cost: z.number().int(),
  redeemedAt: isoInstant,
});
export type Redemption = z.infer<typeof redemptionSchema>;

export const timeBlockSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  date: dateKey,
  start: timeKey,
  end: timeKey,
  kind: z.enum(['commitment', 'focus']).default('commitment'),
  notes: z.string().max(2000).default(''),
});
export type TimeBlock = z.infer<typeof timeBlockSchema>;

export const reviewSchema = z.object({
  id: z.string(),
  kind: z.enum(['daily', 'weekly']),
  periodKey: z.string(),
  notes: z.string().max(20000).default(''),
  wins: z.string().max(5000).default(''),
  blockers: z.string().max(5000).default(''),
  energy: z.number().int().min(1).max(5).optional(),
  priorities: z.array(z.string()).default([]),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});
export type Review = z.infer<typeof reviewSchema>;

export const activitySchema = z.object({
  id: z.string(),
  type: z.string(),
  message: z.string(),
  entityId: z.string().optional(),
  date: dateKey,
  createdAt: isoInstant,
});
export type ActivityEntry = z.infer<typeof activitySchema>;

export const ACCENTS = ['violet', 'cyan', 'gold', 'emerald', 'rose', 'indigo'] as const;
export type Accent = (typeof ACCENTS)[number];

export const DASHBOARD_WIDGETS = [
  'character',
  'briefing',
  'quests',
  'campaigns',
  'timeline',
  'insights',
  'heatmap',
] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

export const settingsSchema = z.object({
  id: z.literal('settings'),
  onboarded: z.boolean().default(false),
  playerName: z.string().max(80).default('Adventurer'),
  avatarId: z.string().default('sigil-blade'),
  showTitle: z.boolean().default(true),
  primaryGoals: z.array(z.string()).default([]),
  productivityStyle: z.enum(['sprinter', 'steady', 'flexible']).default('steady'),
  theme: z.enum(['dark', 'light', 'system']).default('dark'),
  accent: z.enum(ACCENTS).default('violet'),
  reducedMotion: z.enum(['system', 'reduce', 'full']).default('system'),
  ambientEffects: z.boolean().default(true),
  dailyHours: z.number().min(0.25).max(16).default(4),
  dayStart: timeKey.default('09:00'),
  workdays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5, 6]),
  xpMultiplier: z.number().min(0.1).max(10).default(1),
  difficultyXp: z
    .object({
      trivial: z.number().int().min(0),
      easy: z.number().int().min(0),
      medium: z.number().int().min(0),
      hard: z.number().int().min(0),
      boss: z.number().int().min(0),
      legendary: z.number().int().min(0),
    })
    .default({ trivial: 10, easy: 25, medium: 50, hard: 100, boss: 250, legendary: 500 }),
  focusXpPerMinute: z.number().min(0).max(10).default(0.5),
  streakFreezesEnabled: z.boolean().default(true),
  notifications: z
    .object({
      overdue: z.boolean(),
      deadlines: z.boolean(),
      backup: z.boolean(),
      focusEnd: z.boolean(),
      achievements: z.boolean(),
    })
    .default({ overdue: true, deadlines: true, backup: true, focusEnd: true, achievements: true }),
  focus: z
    .object({
      focusMinutes: z.number().int().min(1).max(240),
      shortBreakMinutes: z.number().int().min(1).max(60),
      longBreakMinutes: z.number().int().min(1).max(120),
      longBreakEvery: z.number().int().min(1).max(12),
      autoStartBreaks: z.boolean(),
      sound: z.enum(['none', 'brown', 'rain', 'drone']),
      volume: z.number().min(0).max(1),
      chime: z.boolean(),
    })
    .default({
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
      autoStartBreaks: false,
      sound: 'none',
      volume: 0.4,
      chime: true,
    }),
  widgets: z.array(z.enum(DASHBOARD_WIDGETS)).default([...DASHBOARD_WIDGETS]),
  backupReminderDays: z.number().int().min(0).max(365).default(7),
  lastBackupAt: isoInstant.optional(),
  defaultCampaignId: z.string().optional(),
  ai: z
    .object({
      provider: z.enum(['none', 'ollama', 'webllm']),
      ollamaUrl: z.string(),
      ollamaModel: z.string(),
      webllmModel: z.string(),
    })
    .default({
      provider: 'none',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2',
      webllmModel: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    }),
  createdAt: isoInstant.optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({ id: 'settings' });

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  trivial: 'Trivial',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  boss: 'Boss',
  legendary: 'Legendary',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const CATEGORY_LABEL: Record<QuestCategory, string> = {
  main: 'Main Quest',
  side: 'Side Quest',
  daily: 'Daily Quest',
  weekly: 'Weekly Quest',
  boss: 'Boss Quest',
  legendary: 'Legendary Quest',
};

export const STATUS_LABEL: Record<QuestStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Completed',
  skipped: 'Skipped',
};

export const PRIORITY_WEIGHT: Record<Priority, number> = { low: 0, medium: 1, high: 2, critical: 3 };
