import type { Difficulty, Priority, QuestCategory, SkillLevel } from '@/domain/types';
import { PRIORITY_WEIGHT } from '@/domain/types';
import { weekdayOf, eachDateKey } from '@/lib/dates';
import { TEMPLATE_BY_ID, resolveMilestones, type MilestoneBlueprint, type QuestBlueprint } from './catalog';
import { schedule, type ScheduleResult, type SchedTask } from './scheduler';

/* ───────────────────────────── Types ───────────────────────────── */

export interface PlanGoal {
  /** Stable id within the draft (used as questline id). */
  id: string;
  templateId?: string;
  /** Title for custom (unrecognized) goals. */
  title: string;
  /** User-provided milestones for custom goals. */
  customMilestones?: string[];
  /** Total hours budget for custom goals. */
  customHours?: number;
  quantity?: number;
  includeOptional: boolean;
  /** Lower number = higher priority (1 is top). */
  rank: number;
}

export interface PlanInput {
  campaignName: string;
  objective: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  workdays: number[];
  skillLevel: SkillLevel;
  goals: PlanGoal[];
  commitments?: Record<string, number>;
  revisionEvery?: number;
  bufferRatio?: number;
}

export interface DraftQuest {
  id: string;
  goalId: string;
  milestoneId: string;
  key: string;
  title: string;
  description: string;
  deliverable: string;
  hours: number;
  difficulty: Difficulty;
  category: QuestCategory;
  priority: Priority;
  optional: boolean;
  deps: string[];
  skillIds: string[];
  scheduledDate?: string;
  dueDate?: string;
  deadlineLocked: boolean;
  userEdited: boolean;
  origin: 'generated' | 'revision' | 'manual';
  order: number;
}

export interface DraftMilestone {
  id: string;
  goalId: string;
  key: string;
  title: string;
  order: number;
  dueDate?: string;
  deadlineLocked: boolean;
}

export interface DraftQuestline {
  id: string;
  templateId?: string;
  title: string;
  description: string;
  skillIds: string[];
  order: number;
}

export interface DraftRecurring {
  goalId: string;
  title: string;
  description: string;
  minutes: number;
  frequency: 'daily' | 'weekdays';
  weekdays: number[];
  difficulty: Difficulty;
  skillIds: string[];
  enabled: boolean;
}

export interface DraftPlan {
  input: PlanInput;
  questlines: DraftQuestline[];
  milestones: DraftMilestone[];
  quests: DraftQuest[];
  recurring: DraftRecurring[];
  schedule: ScheduleResult;
  notes: string[];
}

/* ───────────────────────────── Helpers ───────────────────────────── */

const roundQuarter = (h: number) => Math.max(0.25, Math.round(h * 4) / 4);

function adjustHours(qb: QuestBlueprint, level: SkillLevel): number | null {
  if (level === 'advanced') {
    if (qb.level === 'foundation') return null;
    return roundQuarter(qb.hours * 0.85);
  }
  if (level === 'intermediate') {
    if (qb.level === 'foundation') return roundQuarter(qb.hours * 0.6);
    return qb.hours;
  }
  return qb.level === 'foundation' ? qb.hours : roundQuarter(qb.hours * 1.15);
}

/** Generic, transparent scaffold for goals the catalog does not recognize. */
export function genericMilestones(title: string, budgetHours: number, custom?: string[]): MilestoneBlueprint[] {
  const H = Math.max(2, budgetHours);
  const mk = (key: string, t: string, share: number, difficulty: Difficulty, deliverable: string, description: string, boss = false): QuestBlueprint => ({
    key, title: t, hours: roundQuarter(H * share), difficulty, deliverable, description, level: 'core', optional: false, boss,
  });
  const names = (custom ?? []).map((s) => s.trim()).filter(Boolean);
  if (names.length > 0) {
    const per = 1 / names.length;
    return names.map((name, i) => ({
      key: `c${i}`,
      title: name,
      quests: [
        mk(`c${i}-plan`, `${name}: plan the approach`, per * 0.15, 'easy', `Checklist of steps for “${name}”`, 'Break this milestone into concrete steps (generic scaffold — edit freely).'),
        mk(`c${i}-work`, `${name}: focused work`, per * 0.7, 'medium', `Visible progress on “${name}”`, 'Main working block for this milestone.'),
        mk(`c${i}-done`, `${name}: checkpoint`, per * 0.15, i === names.length - 1 ? 'boss' : 'medium', `“${name}” complete and reviewed`, 'Verify the milestone outcome.', i === names.length - 1),
      ],
    }));
  }
  return [
    { key: 'scope', title: 'Scope', quests: [
      mk('define', `Define success for “${title}”`, 0.08, 'easy', 'Written definition of done and 3 measurable outcomes', 'Generic scaffold: clarify what finished looks like.'),
      mk('resources', 'Gather resources and plan', 0.07, 'easy', 'Shortlist of resources and a rough plan', 'Pick materials, tools and people to learn from.'),
    ] },
    { key: 'learn', title: 'Learn', quests: [
      mk('learn1', 'Learning session 1: fundamentals', 0.13, 'medium', 'Notes on the core concepts', 'Generic scaffold — rename to the topic you study.'),
      mk('learn2', 'Learning session 2: deeper concepts', 0.13, 'medium', 'Notes and open questions', 'Generic scaffold — rename to the topic you study.'),
    ] },
    { key: 'practice', title: 'Practice', quests: [
      mk('practice1', 'Practice block 1', 0.15, 'medium', 'First practical output', 'Apply what you learned.'),
      mk('practice2', 'Practice block 2', 0.15, 'hard', 'Improved practical output', 'Push difficulty up.'),
      mk('practice3', 'Practice block 3', 0.14, 'hard', 'Near-final output', 'Polish and fill gaps.'),
    ] },
    { key: 'deliver', title: 'Deliver', quests: [
      mk('deliver', `Boss: Deliver “${title}”`, 0.11, 'boss', 'Final deliverable shared or demonstrated', 'Finish and show your work.', true),
      mk('retro', 'Retrospective', 0.04, 'easy', 'What worked, what to change next time', 'Close the loop.'),
    ] },
  ];
}

function splitQuest(base: Omit<DraftQuest, 'id' | 'key' | 'title' | 'hours' | 'deps' | 'order'> & { key: string; title: string; hours: number }, maxHours: number) {
  const parts = Math.max(1, Math.ceil(base.hours / maxHours));
  if (parts === 1) return [{ ...base, partKey: base.key, partTitle: base.title, partHours: base.hours }];
  const each = roundQuarter(base.hours / parts);
  return Array.from({ length: parts }, (_, i) => ({
    ...base,
    partKey: `${base.key}#${i + 1}`,
    partTitle: `${base.title} (part ${i + 1}/${parts})`,
    partHours: each,
  }));
}

/* ───────────────────────────── Generation ───────────────────────────── */

interface GoalBuild {
  questline: DraftQuestline;
  milestones: DraftMilestone[];
  quests: DraftQuest[];
  recurring: DraftRecurring[];
  notes: string[];
}

export function buildGoal(goal: PlanGoal, input: PlanInput, orderBase: number): GoalBuild {
  const tpl = goal.templateId ? TEMPLATE_BY_ID.get(goal.templateId) : undefined;
  const notes: string[] = [];
  const blueprint = tpl
    ? resolveMilestones(tpl, { quantity: goal.quantity })
    : genericMilestones(goal.title, goal.customHours ?? Math.max(6, input.hoursPerDay * 3), goal.customMilestones);
  const skillIds = tpl?.skillIds ?? [];
  const questline: DraftQuestline = {
    id: goal.id,
    templateId: tpl?.id,
    title: tpl?.name ?? goal.title,
    description: tpl?.summary ?? `Custom goal decomposed with a generic, editable scaffold.`,
    skillIds,
    order: goal.rank,
  };
  const recurringPerDay = (tpl?.recurring ?? []).reduce((sum, r) => sum + (r.frequency === 'daily' ? r.minutes : 0), 0) / 60;
  const maxHours = Math.max(0.5, (input.hoursPerDay - recurringPerDay) * 0.6);
  const highRank = goal.rank <= Math.max(1, Math.ceil(input.goals.length / 3));
  const milestones: DraftMilestone[] = [];
  const quests: DraftQuest[] = [];
  let skipped = 0;
  let droppedOptional = 0;
  let prevCore: string | null = null;
  let order = orderBase;

  blueprint.forEach((mb, mi) => {
    const milestone: DraftMilestone = { id: `${goal.id}/${mb.key}`, goalId: goal.id, key: mb.key, title: mb.title, order: mi, deadlineLocked: false };
    milestones.push(milestone);
    const keyToId = new Map<string, string>();
    for (const qb of mb.quests) {
      if (qb.optional && !goal.includeOptional) {
        droppedOptional++;
        continue;
      }
      const hours = adjustHours(qb, input.skillLevel);
      if (hours === null) {
        skipped++;
        continue;
      }
      const category: QuestCategory = qb.boss ? 'boss' : qb.optional ? 'side' : 'main';
      const priority: Priority = qb.boss ? 'high' : qb.optional ? 'low' : highRank ? 'high' : 'medium';
      const parts = splitQuest(
        {
          goalId: goal.id,
          milestoneId: milestone.id,
          key: qb.key,
          title: qb.title,
          description: qb.description,
          deliverable: qb.deliverable,
          hours,
          difficulty: qb.difficulty,
          category,
          priority,
          optional: qb.optional,
          skillIds: qb.skills ?? skillIds,
          deadlineLocked: false,
          userEdited: false,
          origin: 'generated',
        },
        maxHours,
      );
      let prevPart: string | null = null;
      for (const p of parts) {
        const id = `${goal.id}/${p.partKey}`;
        let deps: string[];
        if (prevPart) deps = [prevPart];
        else if (qb.deps) deps = qb.deps.map((k) => keyToId.get(k) ?? `${goal.id}/${k}`);
        else deps = prevCore ? [prevCore] : [];
        quests.push({
          id,
          goalId: p.goalId,
          milestoneId: p.milestoneId,
          key: p.partKey,
          title: p.partTitle,
          description: p.description,
          deliverable: p.deliverable,
          hours: p.partHours,
          difficulty: p.difficulty,
          category: p.category,
          priority: p.priority,
          optional: p.optional,
          deps,
          skillIds: p.skillIds,
          deadlineLocked: false,
          userEdited: false,
          origin: 'generated',
          order: order++,
        });
        prevPart = id;
      }
      keyToId.set(qb.key, prevPart!);
      if (!qb.optional) prevCore = prevPart;
    }
  });

  if (skipped) notes.push(`${questline.title}: skipped ${skipped} foundation quest${skipped > 1 ? 's' : ''} because your level is advanced.`);
  if (droppedOptional) notes.push(`${questline.title}: ${droppedOptional} optional side quest${droppedOptional > 1 ? 's' : ''} excluded.`);
  if (!tpl) notes.push(`“${goal.title}” is not in the goal catalog — it uses a generic scaffold you should edit.`);

  const recurring: DraftRecurring[] = (tpl?.recurring ?? []).map((r) => ({
    goalId: goal.id,
    title: `${r.title}${tpl ? ` · ${tpl.name.split(' ')[0]}` : ''}`,
    description: r.description,
    minutes: r.minutes,
    frequency: r.frequency,
    weekdays: r.weekdays ?? [],
    difficulty: r.difficulty,
    skillIds,
    enabled: true,
  }));

  return { questline, milestones, quests, recurring, notes };
}

/** Hours per date consumed by enabled recurring quests within the window. */
export function recurringLoad(recurring: DraftRecurring[], start: string, end: string, workdays: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (end < start) return out;
  for (const d of eachDateKey(start, end)) {
    const wd = weekdayOf(d);
    let h = 0;
    for (const r of recurring) {
      if (!r.enabled) continue;
      if (r.frequency === 'daily' ? workdays.includes(wd) : r.weekdays.includes(wd)) h += r.minutes / 60;
    }
    if (h > 0) out[d] = h;
  }
  return out;
}

function linkCrossTemplate(goals: PlanGoal[], builds: GoalBuild[], notes: string[]) {
  const byTemplate = new Map<string, GoalBuild>();
  for (const b of builds) if (b.questline.templateId) byTemplate.set(b.questline.templateId, b);
  for (const b of builds) {
    const tpl = b.questline.templateId ? TEMPLATE_BY_ID.get(b.questline.templateId) : undefined;
    for (const req of tpl?.requires ?? []) {
      const other = byTemplate.get(req.template);
      if (!other) continue;
      const ms = other.milestones.find((x) => x.key === req.milestone);
      const last = ms ? [...other.quests].reverse().find((qq) => qq.milestoneId === ms.id && !qq.optional) : undefined;
      const first = b.quests.find((qq) => !qq.optional);
      if (last && first && !first.deps.includes(last.id)) {
        first.deps.push(last.id);
        notes.push(`${b.questline.title} starts after “${ms!.title}” in ${other.questline.title}.`);
      }
    }
  }
  void goals;
}

export function toSchedTasks(quests: DraftQuest[]): SchedTask[] {
  return quests
    .filter((qq) => qq.origin !== 'revision')
    .map((qq) => ({
      id: qq.id,
      hours: qq.hours,
      deps: qq.deps,
      priority: PRIORITY_WEIGHT[qq.priority],
      group: qq.goalId,
      optional: qq.optional,
      order: qq.order,
      lockedDue: qq.deadlineLocked ? qq.dueDate : undefined,
    }));
}

/** (Re)schedule a draft in place: assigns dates, revision quests and milestone deadlines. Locked deadlines are never moved. */
export function scheduleDraft(plan: Omit<DraftPlan, 'schedule'> & { schedule?: ScheduleResult }): DraftPlan {
  const { input } = plan;
  const recurring = recurringLoad(plan.recurring, input.startDate, input.endDate, input.workdays);
  const commitments: Record<string, number> = { ...(input.commitments ?? {}) };
  for (const [d, h] of Object.entries(recurring)) commitments[d] = (commitments[d] ?? 0) + h;

  // Milestone-level locked deadlines propagate to their quests.
  const lockedMilestones = new Map(plan.milestones.filter((ms) => ms.deadlineLocked && ms.dueDate).map((ms) => [ms.id, ms.dueDate!]));
  const quests = plan.quests.filter((qq) => qq.origin !== 'revision');
  const tasks = toSchedTasks(quests).map((t) => {
    const qq = quests.find((x) => x.id === t.id)!;
    const msDue = lockedMilestones.get(qq.milestoneId);
    const due = [t.lockedDue, msDue].filter(Boolean).sort()[0];
    return { ...t, lockedDue: due };
  });
  const result = schedule(tasks, {
    startDate: input.startDate,
    endDate: input.endDate,
    workdays: input.workdays,
    hoursPerDay: input.hoursPerDay,
    commitments,
    revisionEvery: input.revisionEvery ?? 6,
    bufferRatio: input.bufferRatio ?? 0.08,
  });

  for (const qq of quests) {
    qq.scheduledDate = result.assignments[qq.id];
  }
  // Milestone due dates follow the last scheduled quest, unless locked.
  for (const ms of plan.milestones) {
    if (ms.deadlineLocked) continue;
    const dates = quests.filter((qq) => qq.milestoneId === ms.id && qq.scheduledDate && !qq.optional).map((qq) => qq.scheduledDate!);
    ms.dueDate = dates.length ? dates.sort()[dates.length - 1] : undefined;
  }
  for (const qq of quests) {
    if (qq.deadlineLocked) continue;
    const ms = plan.milestones.find((x) => x.id === qq.milestoneId);
    qq.dueDate = qq.optional ? undefined : ms?.dueDate;
  }

  // Revision quests on revision days summarize the questlines worked since the previous revision.
  const revisions: DraftQuest[] = [];
  let since: string[] = [];
  let order = 1_000_000;
  for (const day of result.days) {
    for (const id of day.taskIds) {
      const qq = quests.find((x) => x.id === id);
      if (qq && !since.includes(qq.goalId)) since.push(qq.goalId);
    }
    if (day.kind === 'revision' && day.revisionHours > 0) {
      const names = since.map((g) => plan.questlines.find((l) => l.id === g)?.title.split(/[ (&]/)[0]).filter(Boolean);
      revisions.push({
        id: `revision/${day.date}`,
        goalId: since[0] ?? plan.questlines[0]?.id ?? 'revision',
        milestoneId: '',
        key: `revision-${day.date}`,
        title: `Revision & consolidation${names.length ? `: ${names.slice(0, 3).join(', ')}` : ''}`,
        description: 'Review notes, redo one hard exercise per topic, and update flashcards. Use spare time to catch up on anything slipped.',
        deliverable: 'Revision notes and a list of weak spots',
        hours: day.revisionHours,
        difficulty: 'easy',
        category: 'side',
        priority: 'medium',
        optional: false,
        deps: [],
        skillIds: [...new Set(since.flatMap((g) => plan.questlines.find((l) => l.id === g)?.skillIds ?? []))],
        scheduledDate: day.date,
        deadlineLocked: false,
        userEdited: false,
        origin: 'revision',
        order: order++,
      });
      since = [];
    }
  }

  return { ...plan, quests: [...quests, ...revisions], schedule: result };
}

export function generatePlan(input: PlanInput): DraftPlan {
  const notes: string[] = [];
  const goals = [...input.goals].sort((a, b) => a.rank - b.rank);
  const builds = goals.map((g, i) => buildGoal(g, input, i * 1000));
  linkCrossTemplate(goals, builds, notes);
  for (const b of builds) notes.push(...b.notes);
  const draft = scheduleDraft({
    input,
    questlines: builds.map((b) => b.questline),
    milestones: builds.flatMap((b) => b.milestones),
    quests: builds.flatMap((b) => b.quests),
    recurring: builds.flatMap((b) => b.recurring),
    notes,
  });
  return draft;
}

/**
 * Regenerate one questline from its template while keeping quests the user edited.
 * Returns the new draft and the number of user-edited quests that were preserved.
 */
export function regenerateGoal(plan: DraftPlan, goalId: string, overwriteEdits: boolean): { plan: DraftPlan; preserved: number } {
  const goal = plan.input.goals.find((g) => g.id === goalId);
  if (!goal) return { plan, preserved: 0 };
  const build = buildGoal(goal, plan.input, Math.min(...plan.quests.filter((qq) => qq.goalId === goalId).map((qq) => qq.order), 0));
  const old = plan.quests.filter((qq) => qq.goalId === goalId && qq.origin !== 'revision');
  const keep = overwriteEdits ? [] : old.filter((qq) => qq.userEdited);
  const keepKeys = new Set(keep.map((qq) => qq.key));
  const fresh = build.quests.filter((qq) => !keepKeys.has(qq.key));
  // External dependencies pointing into this goal must keep resolving.
  const others = plan.quests.filter((qq) => qq.goalId !== goalId && qq.origin !== 'revision');
  const validIds = new Set([...others, ...keep, ...fresh].map((qq) => qq.id));
  for (const qq of others) qq.deps = qq.deps.filter((d) => validIds.has(d));
  // Preserve cross-questline prerequisites of the goal's first core quest.
  const externalDeps = old.flatMap((qq) => qq.deps.filter((d) => !d.startsWith(`${goalId}/`)));
  const firstCore = [...keep, ...fresh].sort((a, b) => a.order - b.order).find((qq) => !qq.optional);
  if (firstCore) for (const d of externalDeps) if (validIds.has(d) && !firstCore.deps.includes(d)) firstCore.deps.push(d);
  const merged = [...others, ...keep, ...fresh].sort((a, b) => a.order - b.order);
  const milestones = [...plan.milestones.filter((ms) => ms.goalId !== goalId), ...build.milestones];
  const recurring = [...plan.recurring.filter((r) => r.goalId !== goalId), ...build.recurring];
  return {
    plan: scheduleDraft({ ...plan, quests: merged, milestones, recurring }),
    preserved: keep.length,
  };
}
